const { WebSocketServer } = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');

// Create Express app
const app = express();
app.use(cors({
    origin: '*', // Allow all origins
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Enhanced logging system
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    CRITICAL: 4
};

const LOG_COLORS = {
    DEBUG: '\x1b[36m', // Cyan
    INFO: '\x1b[32m',  // Green
    WARN: '\x1b[33m',  // Yellow
    ERROR: '\x1b[31m', // Red
    CRITICAL: '\x1b[35m', // Magenta
    RESET: '\x1b[0m'   // Reset
};

// In-memory log storage with max 1000 entries
const logHistory = [];
const MAX_LOG_HISTORY = 1000;
let currentLogLevel = LOG_LEVELS.INFO; // Default log level

// Custom logger function
function customLog(level, message, data = null) {
    // Only log if the level is >= current log level
    if (LOG_LEVELS[level] < currentLogLevel) {
        return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        level,
        message,
        data: data ? util.inspect(data, { depth: 3, colors: false }) : null
    };
    
    // Add to history, maintaining max size
    logHistory.push(logEntry);
    if (logHistory.length > MAX_LOG_HISTORY) {
        logHistory.shift();
    }
    
    // Log to console with colors
    const color = LOG_COLORS[level] || LOG_COLORS.RESET;
    console.log(`${color}[${timestamp}] [${level}] ${message}${data ? ': ' + util.inspect(data, { depth: 3, colors: true }) : ''}${LOG_COLORS.RESET}`);
    
    // Broadcast log to all connected clients
    if (wss && wss.clients) {
        wss.clients.forEach(client => {
            if (client.readyState === 1) { // WebSocket.OPEN = 1
                try {
                    client.send(JSON.stringify({
                        type: 'log',
                        entry: logEntry
                    }));
                } catch (err) {
                    console.error('Error sending log to client:', err);
                }
            }
        });
    }
    
    return logEntry;
}

// Create logger methods for each level
const logger = {
    debug: (message, data) => customLog('DEBUG', message, data),
    info: (message, data) => customLog('INFO', message, data),
    warn: (message, data) => customLog('WARN', message, data),
    error: (message, data) => customLog('ERROR', message, data),
    critical: (message, data) => customLog('CRITICAL', message, data),
    setLevel: (level) => {
        if (LOG_LEVELS[level] !== undefined) {
            currentLogLevel = LOG_LEVELS[level];
            logger.info(`Log level set to ${level}`);
            return true;
        }
        return false;
    },
    getHistory: (filter = {}) => {
        let filtered = [...logHistory];
        
        // Apply level filter
        if (filter.level) {
            filtered = filtered.filter(entry => 
                filter.level === entry.level || 
                (Array.isArray(filter.level) && filter.level.includes(entry.level))
            );
        }
        
        // Apply search filter
        if (filter.search) {
            const searchLower = filter.search.toLowerCase();
            filtered = filtered.filter(entry => 
                entry.message.toLowerCase().includes(searchLower) || 
                (entry.data && entry.data.toLowerCase().includes(searchLower))
            );
        }
        
        // Apply date range filter
        if (filter.startDate) {
            filtered = filtered.filter(entry => new Date(entry.timestamp) >= new Date(filter.startDate));
        }
        
        if (filter.endDate) {
            filtered = filtered.filter(entry => new Date(entry.timestamp) <= new Date(filter.endDate));
        }
        
        // Apply limit
        if (filter.limit && filter.limit > 0) {
            filtered = filtered.slice(-filter.limit);
        }
        
        return filtered;
    }
};

// Create HTTP server with Express
const server = http.createServer(app);

// Add routes for logs
app.get('/api/logs', (req, res) => {
    try {
        const { level, search, startDate, endDate, limit } = req.query;
        
        const filter = {};
        if (level) filter.level = level;
        if (search) filter.search = search;
        if (startDate) filter.startDate = startDate;
        if (endDate) filter.endDate = endDate;
        if (limit) filter.limit = parseInt(limit, 10);
        
        const logs = logger.getHistory(filter);
        res.json({ logs });
    } catch (error) {
        logger.error('Error fetching logs', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

app.post('/api/logs/level', (req, res) => {
    try {
        const { level } = req.body;
        if (!level || !LOG_LEVELS.hasOwnProperty(level)) {
            return res.status(400).json({ error: 'Invalid log level' });
        }
        
        const success = logger.setLevel(level);
        if (success) {
            res.json({ message: `Log level set to ${level}` });
        } else {
            res.status(400).json({ error: 'Failed to set log level' });
        }
    } catch (error) {
        logger.error('Error setting log level', error);
        res.status(500).json({ error: 'Failed to set log level' });
    }
});

app.get('/api/logs/export', (req, res) => {
    try {
        const { format = 'json' } = req.query;
        const logs = logger.getHistory(req.query);
        
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename=logs.csv');
            
            // CSV header
            let csv = 'Timestamp,Level,Message,Data\n';
            
            // Add rows
            logs.forEach(log => {
                const message = log.message.replace(/"/g, '""');
                const data = log.data ? log.data.replace(/"/g, '""') : '';
                csv += `"${log.timestamp}","${log.level}","${message}","${data}"\n`;
            });
            
            res.send(csv);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=logs.json');
            res.json(logs);
        }
    } catch (error) {
        logger.error('Error exporting logs', error);
        res.status(500).json({ error: 'Failed to export logs' });
    }
});

// Set up camera stream endpoint
let cameraProcess = null;
let isRaspberryPi = false;

// Check if running on Raspberry Pi
function checkIsRaspberryPi() {
    try {
        const hasRaspistill = fs.existsSync('/usr/bin/raspistill');
        const hasLibcameraStill = fs.existsSync('/usr/bin/libcamera-still');
        const hasVideoDevice = fs.existsSync('/dev/video0');
        const isLinux = process.platform === 'linux';
        
        let isPiFromCpuInfo = false;
        if (isLinux) {
            try {
                const cpuInfo = fs.readFileSync('/proc/cpuinfo', 'utf8');
                isPiFromCpuInfo = cpuInfo.includes('Raspberry Pi');
            } catch (e) {
                // Ignore error reading cpuinfo
            }
        }
        
        const result = hasRaspistill || hasLibcameraStill || (isLinux && (hasVideoDevice || isPiFromCpuInfo));
        console.log('Checking if Raspberry Pi:', { 
            result, 
            hasRaspistill, 
            hasLibcameraStill, 
            hasVideoDevice,
            isPiFromCpuInfo
        });
        
        return result;
    } catch (error) {
        console.log('Not running on Raspberry Pi:', error.message);
        return false;
    }
}

// Add a snapshot endpoint using rpicam-apps
app.get('/camera/snapshot', (req, res) => {
    isRaspberryPi = checkIsRaspberryPi();
    
    if (!isRaspberryPi) {
        return res.status(404).send('Camera functionality only available on Raspberry Pi');
    }
    
    // Set CORS headers first
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    logger.info('Taking camera snapshot using rpicam-apps...');
    
    // Check for available camera tools
    const hasLibcameraStill = fs.existsSync('/usr/bin/libcamera-still');
    const hasRaspistill = fs.existsSync('/usr/bin/raspistill');
    
    let cmd, args;
    
    // Set snapshot parameters
    const width = 640;     // Better resolution than before
    const height = 480;    // Better resolution than before
    const quality = 85;    // Better quality
    const timeout = 500;   // Allow more time for auto-exposure (was 200ms)
    
    if (hasLibcameraStill) {
        logger.info('Using libcamera-still from rpicam-apps for snapshot');
        cmd = 'libcamera-still';
        args = [
            '-n',                    // No preview
            '-t', timeout.toString(), // Warmup time in ms
            '-o', '-',               // Output to stdout
            '--width', width.toString(), 
            '--height', height.toString(),
            '--encoding', 'jpg',     // Explicitly request JPEG
            '--quality', quality.toString(),
            '--nopreview',           // No preview
            '--immediate',           // Fast capture
            '--autofocus-mode', 'auto', // Auto focus once
            '--ev', '0',             // Default exposure compensation
            '--awb', 'auto',         // Auto white balance
            '--denoise', 'auto',     // Auto denoise for better image quality
            '--hdr', 'off',          // HDR can slow down capture
            '--tuning-file', '/usr/share/libcamera/tuning/imx219.json', // Sensor-specific tuning
            '--metadata',            // Include image metadata if available
            '--metadata-format', 'none', // Don't print metadata to stdout
            '--flush',               // Flush buffers
            '--shutter', '10000',    // Fixed shutter speed for consistency (10ms)
            '--gain', '1.0',         // Starting gain value
            '--brightness', '0.0',   // Default brightness
            '--contrast', '1.0'      // Default contrast
        ];
    } else if (hasRaspistill) {
        logger.info('Using raspistill for snapshot (legacy mode)');
        cmd = 'raspistill';
        args = [
            '-n',                 // No preview
            '-t', timeout.toString(), // Warmup time - we need a bit for exposure
            '-o', '-',            // Output to stdout
            '-w', width.toString(),
            '-h', height.toString(),
            '-e', 'jpg',          // Explicitly specify JPEG format
            '-q', quality.toString(), // Quality
            '-x', 'none',         // No EXIF metadata
            '-ex', 'auto',        // Auto exposure
            '-awb', 'auto',       // Auto white balance
            '-mm', 'average',     // Metering mode
            '-sh', '0',           // Default sharpness
            '-co', '0',           // Default contrast
            '-br', '50',          // Default brightness
            '-sa', '0',           // Default saturation
            '-drc', 'off',        // No DRC
            '-st',                // Enable image statistics
            '-ISO', '800'         // Default ISO
        ];
    } else {
        logger.error('No rpicam-apps tools found for taking snapshots');
        return res.status(500).send('No camera tools available');
    }
    
    // Take a picture
    try {
        // Create temp dir for image if needed (helps with certain libcamera bugs)
        const tempDir = path.join(os.tmpdir(), 'noobots-camera');
        try {
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
        } catch (dirErr) {
            logger.warn('Could not create temp directory:', dirErr);
            // Continue anyway
        }
        
        logger.info(`Executing snapshot command: ${cmd} ${args.join(' ')}`);
        const stillProcess = spawn(cmd, args);
        
        let imageData = Buffer.alloc(0);
        let stderrOutput = '';
        
        stillProcess.stdout.on('data', (data) => {
            imageData = Buffer.concat([imageData, data]);
        });
        
        stillProcess.stderr.on('data', (data) => {
            const stderr = data.toString();
            stderrOutput += stderr;
            
            // Only log if it's not a common warning
            if (!stderr.includes('ALSA lib') && !stderr.includes('No protocol specified')) {
                logger.warn('Snapshot stderr:', stderr);
            }
        });
        
        stillProcess.on('error', (err) => {
            logger.error('Error spawning snapshot process:', err);
            return res.status(500).json({
                error: 'Error spawning camera process', 
                details: err.message
            });
        });
        
        stillProcess.on('close', (code) => {
            if (code !== 0) {
                logger.error(`Snapshot process exited with code ${code}`, stderrOutput);
                
                // Try to create a helpful error message
                let errorMessage = 'Unknown error capturing image';
                if (stderrOutput.includes('Failed to enable camera')) {
                    errorMessage = 'Failed to enable camera - is another process using it?';
                } else if (stderrOutput.includes('Camera is not available')) {
                    errorMessage = 'Camera hardware not available or not detected';
                } else if (stderrOutput.includes('timeout')) {
                    errorMessage = 'Camera operation timed out';
                }
                
                return res.status(500).json({
                    error: errorMessage,
                    code: code,
                    stderr: stderrOutput
                });
            }
            
            if (imageData.length > 0) {
                logger.info(`Snapshot captured successfully: ${imageData.length} bytes`);
                
                // Check if it's a valid JPEG (starts with JPEG magic bytes FF D8)
                if (imageData[0] === 0xFF && imageData[1] === 0xD8) {
                    logger.debug('Valid JPEG format detected');
                    
                    res.writeHead(200, {
                        'Content-Type': 'image/jpeg',
                        'Content-Length': imageData.length,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    });
                    res.end(imageData);
                    
                    // Clean up any temp files
                    try {
                        const tempFiles = fs.readdirSync(tempDir);
                        for (const file of tempFiles) {
                            if (file.startsWith('libcamera') || file.startsWith('raspistill')) {
                                fs.unlinkSync(path.join(tempDir, file));
                            }
                        }
                    } catch (e) {
                        // Ignore cleanup errors
                    }
                } else {
                    // Not a JPEG - try to determine format
                    logger.warn('Non-JPEG image data received');
                    
                    // Try to determine if it's another image format
                    let detectedFormat = 'unknown';
                    
                    // Check for PNG signature
                    if (imageData[0] === 0x89 && imageData[1] === 0x50 && imageData[2] === 0x4E && imageData[3] === 0x47) {
                        detectedFormat = 'image/png';
                    } 
                    // Check for GIF signature
                    else if (imageData[0] === 0x47 && imageData[1] === 0x49 && imageData[2] === 0x46) {
                        detectedFormat = 'image/gif';
                    }
                    // Check for BMP signature
                    else if (imageData[0] === 0x42 && imageData[1] === 0x4D) {
                        detectedFormat = 'image/bmp';
                    }
                    
                    if (detectedFormat !== 'unknown') {
                        logger.info(`Detected image format: ${detectedFormat}, sending as is`);
                        res.writeHead(200, {
                            'Content-Type': detectedFormat,
                            'Content-Length': imageData.length,
                            'Cache-Control': 'no-cache'
                        });
                        res.end(imageData);
                    } else {
                        // If unknown, try to convert to text or return error
                        const firstChars = imageData.toString('utf8', 0, Math.min(100, imageData.length));
                        if (firstChars.trim().startsWith('{') || firstChars.trim().startsWith('[')) {
                            // Probably JSON error output
                            logger.error('Received JSON instead of image:', firstChars);
                            return res.status(500).json({
                                error: 'Camera returned JSON instead of image',
                                details: firstChars
                            });
                        } else {
                            // Unknown binary format
                            return res.status(500).json({
                                error: 'Invalid or unknown image format',
                                dataStart: imageData.slice(0, 32).toString('hex'),
                                dataLength: imageData.length
                            });
                        }
                    }
                }
            } else {
                logger.error('No image data received from camera');
                return res.status(500).json({
                    error: 'No image data received from camera'
                });
            }
        });
        
        // Set a timeout in case the process hangs
        const timeoutHandler = setTimeout(() => {
            if (!res.headersSent) {
                logger.error('Snapshot process timed out');
                try {
                    stillProcess.kill('SIGKILL');
                } catch (e) {
                    // Ignore kill errors
                }
                return res.status(500).json({error: 'Snapshot process timed out'});
            }
        }, 8000); // 8 second timeout
        
        // Clear timeout when process ends
        stillProcess.on('close', () => {
            clearTimeout(timeoutHandler);
        });
        
    } catch (err) {
        logger.error('Exception taking snapshot:', err);
        return res.status(500).json({
            error: 'Exception capturing image', 
            details: err.message
        });
    }
});

// Initialize camera status
let isCameraActive = false;

// Add a test image endpoint that always works (for debugging)
app.get('/camera/test-image', (req, res) => {
    // Create a simple image - red circle on black background
    const width = 320;
    const height = 240;
    const radius = 80;
    const centerX = width / 2;
    const centerY = height / 2;
    
    // Create a Canvas to generate a test image
    try {
        // If Canvas is available, use it to generate a circle
        const { createCanvas } = require('canvas');
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');
        
        // Fill background
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, width, height);
        
        // Draw circle
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Add text
        ctx.fillStyle = 'white';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Test Image', centerX, centerY);
        ctx.fillText(new Date().toISOString(), centerX, centerY + 24);
        
        // Convert to JPEG
        const buffer = canvas.toBuffer('image/jpeg');
        
        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': buffer.length,
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(buffer);
    } catch (err) {
        // If Canvas is not available, send a simple text response
        console.error('Canvas module not available:', err.message);
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.status(200).send('Test image endpoint (Canvas module not available)');
    }
});

// Setup camera routes
app.get('/camera/status', (req, res) => {
    isRaspberryPi = checkIsRaspberryPi();
    res.json({ 
        active: isCameraActive, 
        available: isRaspberryPi 
    });
});

// Start/stop camera stream
app.post('/camera/control', (req, res) => {
    const { action } = req.body;
    
    if (action === 'start' && !isCameraActive) {
        startCamera();
        res.json({ success: true, message: 'Camera started' });
    } else if (action === 'stop' && isCameraActive) {
        stopCamera();
        res.json({ success: true, message: 'Camera stopped' });
    } else {
        res.json({ success: false, message: 'Invalid action or camera already in that state' });
    }
});

// Track active stream connections to manage resources
let activeStreamConnections = 0;
let streamWatchdogTimer = null;

// Handle camera stream
app.get('/camera/stream', (req, res) => {
    isRaspberryPi = checkIsRaspberryPi();
    
    if (!isRaspberryPi) {
        return res.status(404).send('Camera functionality only available on Raspberry Pi');
    }
    
    // Set appropriate headers for MJPEG stream
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
        'Pragma': 'no-cache',
        'Expires': '0',
        'Access-Control-Allow-Origin': '*'
    });
    
    // Start the camera if not already running
    if (!isCameraActive) {
        startCamera();
    }
    
    // Increment active connections counter
    activeStreamConnections++;
    console.log(`New stream connection. Active connections: ${activeStreamConnections}`);
    
    if (cameraProcess && cameraProcess.stdout) {
        console.log('Piping camera output to response');
        
        // Create a transform stream to throttle data if needed
        const { Transform } = require('stream');
        const throttleStream = new Transform({
            transform(chunk, encoding, callback) {
                // Pass through the data but with a slight delay if too many connections
                if (activeStreamConnections > 3) {
                    setTimeout(() => {
                        this.push(chunk);
                        callback();
                    }, 100); // Add delay for multiple connections
                } else {
                    this.push(chunk);
                    callback();
                }
            }
        });
        
        // Set up error handling for the pipe
        throttleStream.on('error', (err) => {
            console.error('Error in stream transform:', err);
            // Don't end response - let client reconnect
        });
        
        // Pipe camera output through our transform stream to the response
        cameraProcess.stdout
            .pipe(throttleStream)
            .pipe(res);
            
        // Set up the stream watchdog timer if not already running
        if (!streamWatchdogTimer) {
            streamWatchdogTimer = setInterval(() => {
                if (isCameraActive && cameraProcess) {
                    // Restart camera if it's been running for more than 5 minutes
                    const uptime = (Date.now() - cameraProcess.startTime) / 1000;
                    if (uptime > 300) { // 5 minutes
                        console.log(`Camera has been running for ${uptime}s, restarting for freshness...`);
                        stopCamera();
                        setTimeout(startCamera, 1000);
                    }
                } else {
                    clearInterval(streamWatchdogTimer);
                    streamWatchdogTimer = null;
                }
            }, 60000); // Check every minute
        }
    } else {
        console.error('Camera process not available');
        return res.status(500).send('Camera process not available');
    }
    
    // Handle connection close
    req.on('close', () => {
        // Decrement active connections counter
        activeStreamConnections = Math.max(0, activeStreamConnections - 1);
        console.log(`Stream connection closed. Active connections: ${activeStreamConnections}`);
        
        // If no active connections, consider stopping camera after a delay
        if (activeStreamConnections === 0) {
            setTimeout(() => {
                if (activeStreamConnections === 0 && isCameraActive) {
                    console.log('No active stream connections for 30 seconds, stopping camera');
                    stopCamera();
                }
            }, 30000); // Wait 30 seconds before stopping
        }
    });
    
    // Set a timeout to avoid frozen connections
    req.setTimeout(300000, () => { // 5 minutes
        console.log('Stream connection timeout');
        if (!res.writableEnded) {
            res.end();
        }
    });
});

// Define a TCP server for camera streaming
let tcpStreamServer = null;
let tcpStreamConnections = [];
const STREAM_TCP_PORT = 3002; // Dedicated port for camera TCP stream

// Start TCP streaming server
function startTcpStreamServer() {
    if (tcpStreamServer) {
        return; // Already running
    }
    
    const net = require('net');
    
    logger.info(`Starting TCP camera stream server on port ${STREAM_TCP_PORT}...`);
    
    // Create TCP server for streaming
    tcpStreamServer = net.createServer((socket) => {
        const clientAddress = socket.remoteAddress;
        logger.info(`New TCP camera stream connection from ${clientAddress}`);
        
        // Add connection to tracking array
        tcpStreamConnections.push(socket);
        
        // Start camera if not already running
        if (!isCameraActive) {
            startCamera();
        }
        
        // Handle client disconnection
        socket.on('close', () => {
            logger.info(`TCP camera stream connection closed from ${clientAddress}`);
            
            // Remove from connections array
            const idx = tcpStreamConnections.indexOf(socket);
            if (idx !== -1) {
                tcpStreamConnections.splice(idx, 1);
            }
            
            // Check if we should stop the camera if no clients
            if (tcpStreamConnections.length === 0 && activeStreamConnections === 0) {
                setTimeout(() => {
                    if (tcpStreamConnections.length === 0 && activeStreamConnections === 0) {
                        logger.info('No active stream connections for 30 seconds, stopping camera');
                        stopCamera();
                    }
                }, 30000); // Wait 30 seconds before stopping
            }
        });
        
        socket.on('error', (err) => {
            logger.error(`TCP camera stream socket error: ${err.message}`);
        });
    });
    
    // Handle server errors
    tcpStreamServer.on('error', (err) => {
        logger.error(`TCP camera stream server error: ${err.message}`);
        // Try to restart server if port is in use - likely previous instance
        if (err.code === 'EADDRINUSE') {
            logger.warn(`TCP port ${STREAM_TCP_PORT} already in use, attempting to restart server`);
            setTimeout(() => {
                tcpStreamServer.close();
                tcpStreamServer = null;
                setTimeout(startTcpStreamServer, 1000);
            }, 1000);
        }
    });
    
    // Start listening for connections
    tcpStreamServer.listen(STREAM_TCP_PORT, '0.0.0.0', () => {
        logger.info(`TCP camera stream server listening on port ${STREAM_TCP_PORT}`);
    });
}

function startCamera() {
    if (isCameraActive || !isRaspberryPi) return;
    
    // Start TCP stream server if not started
    if (!tcpStreamServer) {
        startTcpStreamServer();
    }
    
    // Kill any existing camera processes to free resources
    try {
        if (cameraProcess) {
            cameraProcess.kill();
            cameraProcess = null;
        }
    } catch (e) {
        logger.error('Error killing previous camera process:', e);
    }
    
    try {
        logger.info('Starting camera stream using rpicam-apps with TCP streaming...');
        
        // Detect available camera tools from rpicam-apps
        const hasLibcameraVid = fs.existsSync('/usr/bin/libcamera-vid');
        const hasRaspivid = fs.existsSync('/usr/bin/raspivid');
        
        logger.info('Camera tools available:', {
            libcamera_vid: hasLibcameraVid,
            raspivid: hasRaspivid
        });
        
        // Set reasonable parameters for TCP streaming
        const width = 640;            // Better resolution for clarity
        const height = 480;           // Better resolution for clarity
        const fps = 15;               // Smoother framerate
        const bitrate = 1500000;      // 1.5Mbps for H264 streaming (better for TCP)
        
        if (hasLibcameraVid) {
            // Use rpicam-apps libcamera-vid for TCP streaming
            logger.info('Using libcamera-vid from rpicam-apps for TCP streaming...');
            
            // Modern rpicam-apps libcamera-vid command with TCP streaming
            // Note: We use H264 instead of MJPEG for better TCP streaming efficiency
            cameraProcess = spawn('libcamera-vid', [
                '-t', '0',                // No timeout
                '--width', width.toString(),     
                '--height', height.toString(),   
                '--framerate', fps.toString(),
                '--codec', 'h264',        // H264 is more efficient for TCP streaming than MJPEG
                '--bitrate', bitrate.toString(), // Set bitrate
                '--profile', 'baseline',  // Use baseline profile for wider compatibility
                '--level', '4',           // Compatibility level
                '--intra', '15',          // I-frame interval
                '--listen', '-',          // Output to TCP socket on standard port
                '--nopreview',            // Disable preview window
                '--autofocus-mode', 'continuous', // Continuous autofocus if supported
                '--denoise', 'cdn_off',   // Disable denoising to reduce CPU load
                '--brightness', '0.0',    // Neutral brightness
                '--contrast', '1.0',      // Default contrast
                '--saturation', '1.0',    // Default saturation
                '--sharpness', '1.0',     // Default sharpness
                '--ev', '0',              // Default exposure compensation
                '--awb', 'auto',          // Auto white balance
                '--flush',                // Flush buffers immediately
                '--tuning-file', '/usr/share/libcamera/tuning/imx219.json', // Optional sensor-specific tuning
                '--verbose', '0'          // Minimal verbosity to reduce log noise
            ]);
            
            // Track when the camera process started
            cameraProcess.startTime = Date.now();
        } else if (hasRaspivid) {
            // Legacy raspivid fallback
            logger.info('libcamera-vid not found, falling back to raspivid for TCP streaming...');
            
            cameraProcess = spawn('raspivid', [
                '-t', '0',                // No timeout
                '-w', width.toString(),   
                '-h', height.toString(),  
                '-fps', fps.toString(),   
                '-o', '-',                // Output to stdout
                '-pf', 'h264',            // H264 format for TCP
                '-n',                     // No preview
                '-b', bitrate.toString(), // Bitrate
                '-ih',                    // Insert inline headers for streaming
                '-g', '15',               // I-frame every 15 frames
                '-fl',                    // Flush buffers immediately
                '-stm',                   // Enable multicast streaming mode
                '-awb', 'auto',           // Auto white balance
                '-ex', 'auto',            // Auto exposure
                '-drc', 'low',            // Dynamic range compression
                '-rot', '0',              // No rotation
                '-vs',                    // Turn on video stabilization if available
                '-a', '4',                // Add time annotation
                '-ae', '8'                // Add exposure annotation
            ]);
            
            // Track when the camera process started
            cameraProcess.startTime = Date.now();
        } else {
            logger.error('No rpicam-apps tools found. Cannot start camera for TCP streaming.');
            return;
        }
        
        // Set up buffer handling to distribute to TCP clients
        if (cameraProcess.stdout) {
            // Increase buffer size for stdout to prevent blocking
            cameraProcess.stdout.setMaxListeners(50);
            
            // Handle standard output from camera process
            cameraProcess.stdout.on('data', (data) => {
                // Distribute data to all connected TCP clients
                for (const socket of tcpStreamConnections) {
                    // Only send if socket is still connected and writable
                    if (socket.writable) {
                        try {
                            // If socket buffer is getting full, throttle sending
                            if (socket.writableLength > 1024 * 1024) {
                                logger.debug(`TCP socket buffer full (${socket.writableLength} bytes), dropping frame`);
                                // Skip this socket for this frame
                                continue;
                            }
                            
                            socket.write(data);
                        } catch (err) {
                            logger.error(`Error sending camera data to TCP client: ${err.message}`);
                            // Try to close socket if we can't write to it
                            try {
                                socket.end();
                            } catch (e) {
                                // Ignore close errors
                            }
                        }
                    }
                }
                
                // Also send to HTTP stream clients if needed via the existing mechanism
                // (This maintains backward compatibility with HTTP clients)
            });
            
            cameraProcess.stdout.on('error', (err) => {
                logger.error('Camera stdout error:', err);
                stopCamera();
            });
        }
        
        // Log any stderr output from the camera process
        cameraProcess.stderr.on('data', (data) => {
            const stderr = data.toString();
            // Only log if it's not a common warning message
            if (!stderr.includes('ALSA lib') && !stderr.includes('No protocol specified')) {
                logger.warn('Camera process stderr:', stderr);
            }
        });
        
        // Set up automatic restart if camera freezes
        const cameraWatchdog = setInterval(() => {
            if (cameraProcess && isCameraActive) {
                // Check if process is still responsive
                try {
                    if (cameraProcess.killed) {
                        logger.warn('Camera process was killed, restarting...');
                        clearInterval(cameraWatchdog);
                        stopCamera();
                        setTimeout(startCamera, 2000);
                    }
                    
                    // Calculate uptime and restart if needed
                    const uptimeMinutes = (Date.now() - cameraProcess.startTime) / 60000;
                    if (uptimeMinutes > 60) { // Restart after 1 hour to prevent memory issues
                        logger.info(`Camera running for ${uptimeMinutes.toFixed(1)} minutes, scheduled restart...`);
                        clearInterval(cameraWatchdog);
                        stopCamera();
                        setTimeout(startCamera, 2000);
                    }
                    
                    // Check if we have any TCP connections
                    if (tcpStreamConnections.length > 0) {
                        logger.debug(`Active TCP stream connections: ${tcpStreamConnections.length}`);
                    }
                } catch (e) {
                    logger.error('Error checking camera process:', e);
                }
            } else {
                clearInterval(cameraWatchdog);
            }
        }, 30000); // Check every 30 seconds
        
        // Broadcast to all connected clients that camera is now active
        wss.clients.forEach(client => {
            client.send(JSON.stringify({
                type: 'status',
                message: 'Caméra activée (TCP streaming)'
            }));
            
            // Send camera status update to all clients along with TCP stream info
            client.send(JSON.stringify({
                type: 'cameraStatus',
                active: true,
                available: true,
                streamInfo: {
                    type: 'tcp',
                    host: server.address().address === '0.0.0.0' ? 'localhost' : server.address().address,
                    port: STREAM_TCP_PORT,
                    codec: 'h264'
                }
            }));
        });
        
        isCameraActive = true;
        
        cameraProcess.on('error', (err) => {
            logger.error('Camera process error:', err);
            isCameraActive = false;
            
            // Notify clients about camera error
            wss.clients.forEach(client => {
                client.send(JSON.stringify({
                    type: 'status',
                    message: `Erreur caméra: ${err.message}`
                }));
            });
        });
        
        cameraProcess.on('exit', (code) => {
            logger.info(`Camera process exited with code ${code}`);
            isCameraActive = false;
            
            // Close all TCP connections when camera exits
            tcpStreamConnections.forEach(socket => {
                try {
                    socket.end();
                } catch (e) {
                    // Ignore close errors
                }
            });
            
            // Clear connection array
            tcpStreamConnections = [];
            
            // Attempt to restart if unexpected exit
            if (code !== 0 && !cameraProcess.manualStop) {
                logger.warn('Camera process exited unexpectedly, attempting restart...');
                setTimeout(startCamera, 5000);
            }
        });
        
    } catch (error) {
        logger.error('Error starting camera:', error);
        isCameraActive = false;
    }
}

function stopCamera() {
    if (cameraProcess && isCameraActive) {
        logger.info('Stopping camera TCP stream...');
        
        // Mark this as a manual stop to prevent auto-restart
        cameraProcess.manualStop = true;
        
        // Close all TCP connections first
        if (tcpStreamConnections.length > 0) {
            logger.info(`Closing ${tcpStreamConnections.length} TCP stream connections`);
            tcpStreamConnections.forEach(socket => {
                try {
                    socket.end();
                } catch (e) {
                    // Ignore close errors
                }
            });
            
            // Clear connection array
            tcpStreamConnections = [];
        }
        
        // Give process time to clean up resources
        const gracefulShutdown = setTimeout(() => {
            try {
                // Force kill if still running after timeout
                if (cameraProcess) {
                    logger.warn('Camera process did not exit gracefully, forcing termination');
                    cameraProcess.kill('SIGKILL');
                }
            } catch (e) {
                logger.error('Error killing camera process:', e);
            }
            
            // Make sure we clean up
            finishCameraShutdown();
        }, 2000);
        
        // Try graceful shutdown first
        try {
            cameraProcess.kill('SIGTERM');
            
            // Listen for actual process exit
            cameraProcess.once('exit', () => {
                clearTimeout(gracefulShutdown);
                logger.info('Camera process exited gracefully');
                finishCameraShutdown();
            });
        } catch (e) {
            logger.error('Error during graceful camera shutdown:', e);
            clearTimeout(gracefulShutdown);
            
            // Force kill as fallback
            try {
                cameraProcess.kill('SIGKILL');
            } catch (innerErr) {
                logger.error('Failed to force kill camera process:', innerErr);
            }
            
            finishCameraShutdown();
        }
    }
}

// Helper function to finish camera shutdown
function finishCameraShutdown() {
    cameraProcess = null;
    isCameraActive = false;
    
    // Broadcast to all connected clients that camera is now inactive
    wss.clients.forEach(client => {
        client.send(JSON.stringify({
            type: 'status',
            message: 'Caméra désactivée'
        }));
        
        // Send updated camera status
        client.send(JSON.stringify({
            type: 'cameraStatus',
            active: false,
            available: isRaspberryPi,
            streamInfo: null
        }));
    });
    
    // Consider shutting down TCP server if no active camera for 2 minutes
    setTimeout(() => {
        if (!isCameraActive && tcpStreamServer) {
            logger.info('No active camera for 2 minutes, shutting down TCP stream server');
            try {
                tcpStreamServer.close(() => {
                    logger.info('TCP stream server shut down successfully');
                    tcpStreamServer = null;
                });
            } catch (e) {
                logger.error('Error shutting down TCP stream server:', e);
                tcpStreamServer = null;
            }
        }
    }, 120000); // 2 minutes
}

// Define PORT before WebSocket server
const PORT = 3001;

// Start server
server.listen(PORT, '0.0.0.0', () => {
    if (logger) {
        logger.info(`Server is running on port ${PORT} and accepting external connections`);
    } else {
        console.log(`Server is running on port ${PORT} and accepting external connections`);
    }
});

// Track system stats interval
let statsInterval;

async function getSystemStats() {
    try {
        const platform = process.platform;
        const [cpu, memory, temp, osInfo, system, time] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature(),
            si.osInfo(),
            si.system(),
            si.time()
        ]);

        // Raspberry Pi (linux) will show actual temperature
        // Other platforms will show appropriate message
        const temperature = platform === 'linux'
            ? (temp.main || 'N/A')
            : 'Not available on ' + platform;

        // Detect if actually running on Raspberry Pi
        const isRaspberryPi = platform === 'linux' && 
            (system.model?.toLowerCase().includes('raspberry') || 
             osInfo.distro?.toLowerCase().includes('raspberry'));

        return {
            type: 'systemStats',
            data: {
                cpuLoad: cpu.currentLoad.toFixed(1),
                memoryUsed: ((memory.used / memory.total) * 100).toFixed(1),
                temperature: temperature,
                isRaspberryPi: isRaspberryPi,
                uptime: time.uptime,
                model: system.model || 'Unknown',
                hostname: osInfo.hostname,
                diskUsage: null // Will add in future update
            }
        };
    } catch (error) {
        console.error('Error getting system stats:', error);
        return {
            type: 'systemStats',
            data: {
                cpuLoad: 'N/A',
                memoryUsed: 'N/A',
                temperature: 'N/A',
                isRaspberryPi: process.platform === 'linux',
                uptime: 0,
                model: 'Unknown',
                hostname: 'Unknown',
                diskUsage: null,
                error: error.message
            }
        };
    }
}

async function handleCommand(ws, command) {
    logger.debug('Received command', command);

    switch (command.type) {
        case 'startStatsMonitoring':
            if (!statsInterval) {
                statsInterval = setInterval(async () => {
                    const stats = await getSystemStats();
                    if (stats) {
                        ws.send(JSON.stringify(stats));
                    }
                }, 2000);
            }
            break;

        case 'stopStatsMonitoring':
            if (statsInterval) {
                clearInterval(statsInterval);
                statsInterval = null;
            }
            break;

        case 'reboot':
            ws.send(JSON.stringify({
                type: 'status',
                message: 'Reboot command received'
            }));
            break;

        case 'shutdown':
            ws.send(JSON.stringify({
                type: 'status',
                message: 'Shutdown command received'
            }));
            break;
            
        case 'startCamera':
            isRaspberryPi = checkIsRaspberryPi();
            if (isRaspberryPi) {
                if (!isCameraActive) {
                    startCamera();
                    ws.send(JSON.stringify({
                        type: 'status',
                        message: 'Démarrage de la caméra'
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'status',
                        message: 'Caméra déjà active'
                    }));
                }
            } else {
                ws.send(JSON.stringify({
                    type: 'status',
                    message: 'Caméra non disponible sur cette plateforme'
                }));
            }
            break;
            
        case 'stopCamera':
            if (isCameraActive) {
                stopCamera();
                ws.send(JSON.stringify({
                    type: 'status',
                    message: 'Arrêt de la caméra'
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'status',
                    message: 'Caméra déjà inactive'
                }));
            }
            break;
            
        case 'getCameraStatus':
            isRaspberryPi = checkIsRaspberryPi();
            ws.send(JSON.stringify({
                type: 'cameraStatus',
                active: isCameraActive,
                available: isRaspberryPi
            }));
            break;

        case 'partyMode':
            logger.info('Party mode activated!');
            const partyArt = `
         ______________
       /              \\
     /~~~~~~~~~~~~~~~~~~\\
    |   BAR    MIX    |
     \\~~~~~~~~~~~~~~~~~~/
       \\______________/
   PARTY MODE ACTIVATED!
   UN GROS BAR MIX !
            `;
            logger.debug('Party ASCII art', partyArt);
            ws.send(JSON.stringify({
                type: 'status',
                message: 'Party mode activé! MANGE UN ROTEUX OU DEUX 🌭🎉'
            }));
            break;
            
        case 'getLogs':
            const { filter = {} } = command;
            const logs = logger.getHistory(filter);
            ws.send(JSON.stringify({
                type: 'logHistory',
                logs
            }));
            break;
            
        case 'setLogLevel':
            const { level } = command;
            if (level && LOG_LEVELS.hasOwnProperty(level)) {
                logger.setLevel(level);
                ws.send(JSON.stringify({
                    type: 'status',
                    message: `Niveau de journalisation défini sur ${level}`
                }));
            } else {
                ws.send(JSON.stringify({
                    type: 'status',
                    message: `Niveau de journalisation invalide: ${level}`
                }));
            }
            break;

        default:
            logger.warn('Unknown command received', command);
    }
}

// Track connected clients
let connectedClients = 0;

// Create WebSocket server
const wss = new WebSocketServer({ server });

// Initialize logging after WebSocket server is created
logger.info('Server starting', { port: PORT });

wss.on('connection', (ws, req) => {
    connectedClients++;
    const clientIp = req.socket.remoteAddress;
    logger.info('Client connected', { ip: clientIp, totalClients: connectedClients });

    // Send initial connection message with client count
    ws.send(JSON.stringify({
        type: 'status',
        message: `Connecté au système de contrôle. ${connectedClients} client(s) connecté(s).`
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            await handleCommand(ws, message);
        } catch (error) {
            logger.error('Error processing WebSocket message', error);
        }
    });

    ws.on('close', () => {
        connectedClients--;
        logger.info('Client disconnected', { totalClients: connectedClients });
        
        // Only clear interval if no clients are connected
        if (connectedClients === 0 && statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
            logger.debug('Stopped stats monitoring - no clients connected');
        }
    });

    ws.on('error', (error) => {
        logger.error('WebSocket connection error', error);
    });
});
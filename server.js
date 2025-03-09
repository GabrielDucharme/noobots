const { WebSocketServer } = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');
const util = require('util');

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

// Add a simple single frame endpoint
app.get('/camera/snapshot', (req, res) => {
    isRaspberryPi = checkIsRaspberryPi();
    
    if (!isRaspberryPi) {
        return res.status(404).send('Camera functionality only available on Raspberry Pi');
    }
    
    // Set CORS headers first
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    console.log('Taking simple camera snapshot...');
    
    // Determine which camera command to use - prioritize raspistill for guaranteed JPEG output
    const useRaspistill = fs.existsSync('/usr/bin/raspistill');
    const useLibcamera = fs.existsSync('/usr/bin/libcamera-still');
    
    let cmd, args;
    
    if (useRaspistill) {
        console.log('Using raspistill for snapshot (guaranteed JPEG format)');
        cmd = 'raspistill';
        args = [
            '-n',             // No preview
            '-t', '200',      // Very quick warmup time - we want immediate feedback
            '-o', '-',        // Output to stdout
            '-w', '320',      // Smaller width for faster capture
            '-h', '240',      // Smaller height for faster capture
            '-e', 'jpg',      // Explicitly specify JPEG format
            '-q', '80'        // Medium quality for speed
        ];
    } else if (useLibcamera) {
        console.log('Using libcamera-still for snapshot');
        cmd = 'libcamera-still';
        args = [
            '-n',              // No preview
            '-t', '200',       // Quick warmup time in ms
            '-o', '-',         // Output to stdout
            '--width', '320',  // Smaller width
            '--height', '240', // Smaller height
            '--immediate',     // Don't wait for auto exposure
            '--encoding', 'jpg' // Explicitly request JPEG format
        ];
    } else {
        console.error('No camera tools found for taking snapshots');
        return res.status(500).send('No camera tools available');
    }
    
    // Take a picture
    try {
        const stillProcess = spawn(cmd, args);
        let imageData = Buffer.alloc(0);
        let stderrOutput = '';
        
        stillProcess.stdout.on('data', (data) => {
            imageData = Buffer.concat([imageData, data]);
        });
        
        stillProcess.stderr.on('data', (data) => {
            stderrOutput += data.toString();
        });
        
        stillProcess.on('error', (err) => {
            console.error('Error taking snapshot:', err);
            return res.status(500).json({
                error: 'Error capturing image', 
                details: err.message
            });
        });
        
        stillProcess.on('close', (code) => {
            if (code !== 0) {
                console.error(`Snapshot process exited with code ${code}`, stderrOutput);
                return res.status(500).json({
                    error: 'Error capturing image',
                    code: code,
                    stderr: stderrOutput
                });
            }
            
            if (imageData.length > 0) {
                console.log(`Snapshot captured successfully: ${imageData.length} bytes`);
                
                // Check if it's a valid JPEG (starts with JPEG magic bytes FF D8)
                if (imageData[0] === 0xFF && imageData[1] === 0xD8) {
                    console.log('Valid JPEG format detected - first 20 bytes:', imageData.slice(0, 20).toString('hex'));
                    
                    res.writeHead(200, {
                        'Content-Type': 'image/jpeg',
                        'Content-Length': imageData.length,
                        'Cache-Control': 'no-cache, no-store, must-revalidate',
                        'Pragma': 'no-cache',
                        'Expires': '0'
                    });
                    res.end(imageData);
                    
                    // Log timestamp to measure client-server time
                    console.log('JPEG sent at:', new Date().toISOString());
                } else {
                    // Not a JPEG - log what we actually got
                    console.error('Invalid or non-JPEG data received');
                    console.error('Data type check - first 32 bytes:', imageData.slice(0, 32).toString('hex'));
                    
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
                        console.log(`Detected format: ${detectedFormat}, sending as is`);
                        res.writeHead(200, {
                            'Content-Type': detectedFormat,
                            'Content-Length': imageData.length,
                            'Cache-Control': 'no-cache'
                        });
                        res.end(imageData);
                    } else {
                        // If unknown, return error info
                        res.status(500).json({
                            error: 'Invalid or unknown image format',
                            dataStart: imageData.slice(0, 32).toString('hex'),
                            dataLength: imageData.length
                        });
                    }
                }
            } else {
                console.error('No image data received from camera');
                res.status(500).json({
                    error: 'No image data received from camera'
                });
            }
        });
        
        // Set a timeout in case the process hangs
        setTimeout(() => {
            if (!res.headersSent) {
                console.error('Snapshot timeout');
                stillProcess.kill();
                res.status(500).json({error: 'Snapshot timeout'});
            }
        }, 10000); // 10 second timeout
        
    } catch (err) {
        console.error('Exception taking snapshot:', err);
        res.status(500).json({
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

function startCamera() {
    if (isCameraActive || !isRaspberryPi) return;
    
    // Kill any existing camera processes to free resources
    try {
        if (cameraProcess) {
            cameraProcess.kill();
            cameraProcess = null;
        }
    } catch (e) {
        console.error('Error killing previous camera process:', e);
    }
    
    try {
        console.log('Starting camera stream with reduced settings for better stability...');
        
        // Detect available camera tools
        const hasLibcamera = fs.existsSync('/usr/bin/libcamera-vid');
        const hasRaspivid = fs.existsSync('/usr/bin/raspivid');
        
        console.log('Camera tools available:', {
            libcamera: hasLibcamera,
            raspivid: hasRaspivid
        });
        
        // Lower resolution and framerate to reduce resource usage
        const width = 320;  // Lower resolution
        const height = 240; // Lower resolution
        const fps = 5;      // Lower framerate
        
        if (hasLibcamera) {
            // Optimized libcamera command for resource efficiency
            cameraProcess = spawn('libcamera-vid', [
                '-t', '0',            // No timeout
                '--width', width,     // Width
                '--height', height,   // Height
                '--framerate', fps,   // Lower framerate
                '--inline',           // Enable inline headers for MJPEG
                '--output', '-',      // Output to stdout
                '--nopreview',        // Disable preview window
                '--timeout', '0',     // Disable timeout
                '--segment', '1',     // Split output to reduce buffer size
                '--codec', 'mjpeg'    // Use MJPEG codec to reduce CPU usage
            ]);
            
            // Track when the camera process started
            cameraProcess.startTime = Date.now();
        } else if (hasRaspivid) {
            // Optimized raspivid command for resource efficiency
            cameraProcess = spawn('raspivid', [
                '-t', '0',            // No timeout
                '-w', width,          // Width
                '-h', height,         // Height
                '-fps', fps,          // Lower framerate
                '-pf', 'MJPEG',       // Use MJPEG format instead of H264
                '-o', '-',            // Output to stdout
                '-n',                 // No preview
                '-fl',                // Flush buffers immediately
                '-g', '15',           // I-frame every 15 frames (3 seconds)
                '-b', '1000000'       // Limit bitrate to 1Mbps
            ]);
            
            // Track when the camera process started
            cameraProcess.startTime = Date.now();
        } else {
            console.error('No camera tools found. Cannot start camera.');
            return;
        }
        
        // Set up buffer handling to prevent memory issues
        if (cameraProcess.stdout) {
            cameraProcess.stdout.on('error', (err) => {
                console.error('Camera stdout error:', err);
                stopCamera();
            });
        }
        
        // Log any stderr output from the camera process
        cameraProcess.stderr.on('data', (data) => {
            console.error('Camera process error:', data.toString());
        });
        
        // Set up automatic restart if camera freezes
        const cameraWatchdog = setInterval(() => {
            if (cameraProcess && isCameraActive) {
                // Check if process is still responsive
                try {
                    if (cameraProcess.killed) {
                        console.log('Camera process was killed, restarting...');
                        clearInterval(cameraWatchdog);
                        stopCamera();
                        setTimeout(startCamera, 1000);
                    }
                } catch (e) {
                    console.error('Error checking camera process:', e);
                }
            } else {
                clearInterval(cameraWatchdog);
            }
        }, 10000); // Check every 10 seconds
        
        // Broadcast to all connected clients that camera is now active
        wss.clients.forEach(client => {
            client.send(JSON.stringify({
                type: 'status',
                message: 'Caméra activée'
            }));
        });
        
        isCameraActive = true;
        
        cameraProcess.on('error', (err) => {
            console.error('Camera process error:', err);
            isCameraActive = false;
        });
        
        cameraProcess.on('exit', (code) => {
            console.log(`Camera process exited with code ${code}`);
            isCameraActive = false;
        });
        
    } catch (error) {
        console.error('Error starting camera:', error);
        isCameraActive = false;
    }
}

function stopCamera() {
    if (cameraProcess && isCameraActive) {
        console.log('Stopping camera stream...');
        cameraProcess.kill();
        cameraProcess = null;
        isCameraActive = false;
        
        // Broadcast to all connected clients that camera is now inactive
        wss.clients.forEach(client => {
            client.send(JSON.stringify({
                type: 'status',
                message: 'Caméra désactivée'
            }));
        });
    }
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
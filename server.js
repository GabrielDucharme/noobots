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

// Add a still image endpoint as fallback
app.get('/camera/snapshot', (req, res) => {
    isRaspberryPi = checkIsRaspberryPi();
    
    if (!isRaspberryPi) {
        return res.status(404).send('Camera functionality only available on Raspberry Pi');
    }
    
    // Determine which camera command to use
    const useLibcamera = fs.existsSync('/usr/bin/libcamera-still');
    let cmd, args;
    
    if (useLibcamera) {
        cmd = 'libcamera-still';
        args = ['-n', '-t', '100', '-o', '-', '--width', '640', '--height', '480'];
    } else {
        cmd = 'raspistill';
        args = ['-n', '-t', '100', '-o', '-', '-w', '640', '-h', '480'];
    }
    
    // Take a picture
    const stillProcess = spawn(cmd, args);
    let imageData = Buffer.alloc(0);
    
    stillProcess.stdout.on('data', (data) => {
        imageData = Buffer.concat([imageData, data]);
    });
    
    stillProcess.on('error', (err) => {
        console.error('Error taking snapshot:', err);
        res.status(500).send('Error capturing image');
    });
    
    stillProcess.on('close', (code) => {
        if (code !== 0) {
            console.error(`Snapshot process exited with code ${code}`);
            return res.status(500).send('Error capturing image');
        }
        
        if (imageData.length > 0) {
            res.writeHead(200, {
                'Content-Type': 'image/jpeg',
                'Content-Length': imageData.length,
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(imageData);
        } else {
            res.status(500).send('No image data received from camera');
        }
    });
});

// Initialize camera status
let isCameraActive = false;

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

// Handle camera stream
app.get('/camera/stream', (req, res) => {
    isRaspberryPi = checkIsRaspberryPi();
    
    if (!isRaspberryPi) {
        return res.status(404).send('Camera functionality only available on Raspberry Pi');
    }
    
    // Set appropriate headers for MJPEG stream
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Pragma': 'no-cache',
        'Access-Control-Allow-Origin': '*'
    });
    
    // Start the camera if not already running
    if (!isCameraActive) {
        startCamera();
    }
    
    if (cameraProcess && cameraProcess.stdout) {
        console.log('Piping camera output to response');
        cameraProcess.stdout.pipe(res);
    } else {
        console.error('Camera process not available');
        return res.status(500).send('Camera process not available');
    }
    
    // Handle connection close
    req.on('close', () => {
        console.log('Stream connection closed');
    });
});

function startCamera() {
    if (isCameraActive || !isRaspberryPi) return;
    
    try {
        console.log('Starting camera stream...');
        
        // Detect available camera tools
        const hasLibcamera = fs.existsSync('/usr/bin/libcamera-vid');
        const hasRaspivid = fs.existsSync('/usr/bin/raspivid');
        
        console.log('Camera tools available:', {
            libcamera: hasLibcamera,
            raspivid: hasRaspivid
        });
        
        if (hasLibcamera) {
            // Simplified libcamera command
            cameraProcess = spawn('libcamera-vid', [
                '-t', '0',         // No timeout
                '--width', '640',  // Width
                '--height', '480', // Height
                '-o', '-'          // Output to stdout
            ]);
        } else if (hasRaspivid) {
            // Simplified raspivid command
            cameraProcess = spawn('raspivid', [
                '-t', '0',         // No timeout
                '-w', '640',       // Width
                '-h', '480',       // Height
                '-o', '-'          // Output to stdout
            ]);
        } else {
            console.error('No camera tools found. Cannot start camera.');
            return;
        }
        
        // Log any stderr output from the camera process
        cameraProcess.stderr.on('data', (data) => {
            console.error('Camera process error:', data.toString());
        });
        
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
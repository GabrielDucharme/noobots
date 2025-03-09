const { WebSocketServer } = require('ws');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const si = require('systeminformation');
const fs = require('fs');
const path = require('path');

// Create Express app
const app = express();
app.use(cors());
app.use(express.json());

// Create HTTP server with Express
const server = http.createServer(app);

// Set up camera stream endpoint
let cameraProcess = null;
let isRaspberryPi = false;

// Check if running on Raspberry Pi
function checkIsRaspberryPi() {
    try {
        return fs.existsSync('/usr/bin/raspistill') || 
               fs.existsSync('/usr/bin/libcamera-still') || 
               (process.platform === 'linux' && fs.readFileSync('/proc/cpuinfo', 'utf8').includes('Raspberry Pi'));
    } catch (error) {
        console.log('Not running on Raspberry Pi:', error.message);
        return false;
    }
}

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
        'Pragma': 'no-cache'
    });
    
    // Start the camera if not already running
    if (!isCameraActive) {
        startCamera();
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
        
        // Use libcamera (newer Raspberry Pi OS) or fallback to raspivid
        const useLibcamera = fs.existsSync('/usr/bin/libcamera-vid');
        
        if (useLibcamera) {
            cameraProcess = spawn('libcamera-vid', [
                '-t', '0',         // No timeout
                '--width', '640',  // Width
                '--height', '480', // Height
                '--framerate', '24', // FPS
                '-o', '-'          // Output to stdout
            ]);
        } else {
            cameraProcess = spawn('raspivid', [
                '-t', '0',         // No timeout
                '-w', '640',       // Width
                '-h', '480',       // Height
                '-fps', '24',      // FPS
                '-o', '-'          // Output to stdout
            ]);
        }
        
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

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

// Start server
const PORT = 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT} and accepting external connections`);
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
    console.log('Command type:', command.type, 'Type of:', typeof command.type);

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
            console.log('Entering party mode case');  // Debug log
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
            console.log(partyArt);
            ws.send(JSON.stringify({
                type: 'status',
                message: 'Party mode activé! MANGE UN ROTEUX OU DEUX 🌭🎉'
            }));
            break;

        default:
            console.log('Unknown command:', command);
    }
}

// Track connected clients
let connectedClients = 0;

wss.on('connection', (ws, req) => {
    connectedClients++;
    const clientIp = req.socket.remoteAddress;
    console.log(`New client connected from ${clientIp}. Total clients: ${connectedClients}`);

    // Send initial connection message with client count
    ws.send(JSON.stringify({
        type: 'status',
        message: `Connecté au système de contrôle. ${connectedClients} client(s) connecté(s).`
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);
            await handleCommand(ws, message);
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        connectedClients--;
        console.log(`Client disconnected. Total clients: ${connectedClients}`);
        
        // Only clear interval if no clients are connected
        if (connectedClients === 0 && statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});
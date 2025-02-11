const { WebSocketServer } = require('ws');
const http = require('http');
const si = require('systeminformation');

// Create HTTP server
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('WebSocket server is running');
});

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ server });

// Start server
const PORT = 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

// Track system stats interval
let statsInterval;

async function getSystemStats() {
    try {
        const platform = process.platform;
        const [cpu, memory, temp] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature()
        ]);

        // Raspberry Pi (linux) will show actual temperature
        // macOS will show 'Not available'
        const temperature = platform === 'linux'
            ? (temp.main || 'N/A')
            : 'Not available on ' + platform;

        return {
            type: 'systemStats',
            data: {
                cpuLoad: cpu.currentLoad.toFixed(1),
                memoryUsed: ((memory.used / memory.total) * 100).toFixed(1),
                temperature: temperature,
                isRaspberryPi: platform === 'linux'
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

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.send(JSON.stringify({
        type: 'status',
        message: 'Connected to Raspberry Pi control system'
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
        console.log('Client disconnected');
        if (statsInterval) {
            clearInterval(statsInterval);
            statsInterval = null;
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});
const { WebSocketServer } = require('ws');
const si = require('systeminformation');

// Create WebSocket server
const wss = new WebSocketServer({ port: 3001 });

console.log('WebSocket server started on port 3001');

// Track system stats interval
let statsInterval;

async function getSystemStats() {
    try {
        const [cpu, memory, temp] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature()
        ]);

        return {
            type: 'systemStats',
            data: {
                cpuLoad: cpu.currentLoad.toFixed(1),
                memoryUsed: ((memory.used / memory.total) * 100).toFixed(1),
                temperature: temp.main || 'N/A'
            }
        };
    } catch (error) {
        console.error('Error getting system stats:', error);
        return null;
    }
}

async function handleCommand(ws, command) {
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
import { WebSocketServer } from 'ws';
import si from 'systeminformation';

let wss;

if (process.env.NODE_ENV !== 'production') {
    if (!global.wss) {
        global.wss = new WebSocketServer({ port: 3001 });
    }
    wss = global.wss;
} else {
    wss = new WebSocketServer({ port: 3001 });
}

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
        case 'getStats':
            const stats = await getSystemStats();
            if (stats) {
                ws.send(JSON.stringify(stats));
            }
            break;

        case 'startStatsMonitoring':
            if (!statsInterval) {
                statsInterval = setInterval(async () => {
                    const stats = await getSystemStats();
                    if (stats) {
                        wss.clients.forEach(client => {
                            if (client.readyState === ws.OPEN) {
                                client.send(JSON.stringify(stats));
                            }
                        });
                    }
                }, 5000); // Update every 5 seconds
            }
            break;

        case 'stopStatsMonitoring':
            if (statsInterval) {
                clearInterval(statsInterval);
                statsInterval = null;
            }
            break;

        case 'reboot':
            ws.send(JSON.stringify({ type: 'status', message: 'Rebooting system...' }));
            // In production, you would add actual reboot command here
            break;

        case 'shutdown':
            ws.send(JSON.stringify({ type: 'status', message: 'Shutting down system...' }));
            // In production, you would add actual shutdown command here
            break;

        default:
            console.log('Unknown command:', command);
    }
}

wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.send(JSON.stringify({ type: 'status', message: 'Connected to Raspberry Pi control system' }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log('Received:', message);

            if (message.type) {
                await handleCommand(ws, message);
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

export default function handler(req, res) {
    if (!res.socket.server.ws) {
        res.socket.server.ws = wss;
    }
    res.end();
} 
import { WebSocketServer } from 'ws';
import si from 'systeminformation';

let wss;

export async function GET(req) {
    try {
        const upgrade = req.headers.get('upgrade');
        if (upgrade?.toLowerCase() !== 'websocket') {
            return new Response('Expected websocket', { status: 400 });
        }

        if (!wss) {
            wss = new WebSocketServer({ noServer: true });
            wss.on('connection', handleConnection);
        }

        // Use standard ws library upgrade handling.
        const upgradeHeader = req.headers.get('upgrade');
        if (upgradeHeader && upgradeHeader.toLowerCase() === 'websocket') {
            return new Promise((resolve) => {
                wss.handleUpgrade(req, req.socket, Buffer.from([]), (ws) => {
                    wss.emit('connection', ws);
                    resolve(new Response(null, { status: 101, webSocket: ws }));
                });
            });
        } else {
            return new Response('Expected websocket', { status: 400 });
        }

    } catch (err) {
        console.error('WebSocket error:', err);
        return new Response('WebSocket error', { status: 500 });
    }
}

// --- (Rest of the file: handleConnection, getSystemStats, handleCommand -  these functions stay the same) ---

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

function handleConnection(ws) {
    console.log('New client connected');

    ws.send(JSON.stringify({ type: 'status', message: 'Connected to Raspberry Pi control system' }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());
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
}

async function handleCommand(ws, command) {
    console.log('Command type:', command.type, 'Type of:', typeof command.type);

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
                        ws.send(JSON.stringify(stats));
                    }
                }, 5000);
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
            ws.send(JSON.stringify({ type: 'status', message: 'Party mode activated! Enjoy the hot dogs and the good vibes! 🌭🎉' }));
            break;

        default:
            console.log('Unknown command type:', command.type, 'Type of:', typeof command.type);  // Debug log
            console.log('Unknown command:', command);
    }
}
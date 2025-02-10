'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const RECONNECT_DELAY = 3000; // 3 seconds

const useWebSocket = () => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [systemStats, setSystemStats] = useState({
        cpuLoad: '0',
        memoryUsed: '0',
        temperature: 'N/A'
    });
    const [statusMessage, setStatusMessage] = useState('');
    const reconnectTimeoutRef = useRef(null);

    const connect = useCallback(() => {
        try {
            // Get WebSocket URL from environment or fallback to auto-detection
            let wsUrl;
            if (process.env.NEXT_PUBLIC_WS_URL) {
                wsUrl = process.env.NEXT_PUBLIC_WS_URL;
            } else {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                wsUrl = `${protocol}//${host}/api/ws`;
            }

            // Add connection debug info to UI
            setStatusMessage(`Attempting to connect to: ${wsUrl}`);

            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('Connected to WebSocket');
                setIsConnected(true);
                setSocket(ws);
                setStatusMessage('Connected to Raspberry Pi control system');
                // Start monitoring system stats
                ws.send(JSON.stringify({ type: 'startStatsMonitoring' }));
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    switch (data.type) {
                        case 'systemStats':
                            setSystemStats(data.data);
                            break;
                        case 'status':
                            setStatusMessage(data.message);
                            break;
                        default:
                            console.log('Received message:', data);
                    }
                } catch (error) {
                    console.error('Error parsing message:', error);
                }
            };

            ws.onclose = () => {
                console.log('Disconnected from WebSocket');
                setIsConnected(false);
                setStatusMessage('Disconnected. Attempting to reconnect...');

                // Attempt to reconnect
                if (reconnectTimeoutRef.current) {
                    clearTimeout(reconnectTimeoutRef.current);
                }
                reconnectTimeoutRef.current = setTimeout(connect, RECONNECT_DELAY);
            };

            ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                setStatusMessage('Connection error. Attempting to reconnect...');
            };

            return ws;
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            setStatusMessage(`Failed to create WebSocket connection: ${error.message}`);
            return null;
        }
    }, []);

    useEffect(() => {
        const ws = connect();

        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            if (ws) {
                ws.send(JSON.stringify({ type: 'stopStatsMonitoring' }));
                ws.close();
            }
        };
    }, [connect]);

    const sendCommand = useCallback((command) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(command));
        } else {
            console.error('WebSocket is not connected');
            setStatusMessage('Cannot send command: WebSocket is not connected');
        }
    }, [socket]);

    return {
        isConnected,
        systemStats,
        statusMessage,
        sendCommand
    };
};

export default useWebSocket; 
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

    const connect = useCallback((customUrl = null) => {
        try {
            // Get WebSocket URL from custom input, environment, or fallback to auto-detection
            let wsUrl;
            if (customUrl) {
                wsUrl = customUrl;
            } else if (process.env.NEXT_PUBLIC_WS_URL) {
                wsUrl = process.env.NEXT_PUBLIC_WS_URL;
            } else if (typeof window !== 'undefined' && localStorage.getItem('noobots_ws_url')) {
                wsUrl = localStorage.getItem('noobots_ws_url');
            } else if (typeof window !== 'undefined') {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.hostname;
                wsUrl = `${protocol}//${host}:3001`;
            } else {
                // Fallback for server-side rendering
                wsUrl = 'ws://localhost:3001';
            }

            // Save URL to localStorage for future use
            if (customUrl && typeof window !== 'undefined') {
                localStorage.setItem('noobots_ws_url', customUrl);
            }

            // Add connection debug info to UI
            setStatusMessage(`Connexion à: ${wsUrl}`);

            // Ensure we're on the client side before creating WebSocket
            if (typeof window === 'undefined') {
                // Return early during server-side rendering
                return null;
            }
            
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
                        case 'cameraStatus':
                            // Forward camera status messages to registered handlers
                            if (typeof window !== 'undefined' && window.cameraMessageHandlers) {
                                window.cameraMessageHandlers.forEach(handler => handler(data));
                            }
                            break;
                        case 'log':
                        case 'logHistory':
                            // Forward log messages to registered handlers
                            if (typeof window !== 'undefined' && window.logMessageHandlers) {
                                window.logMessageHandlers.forEach(handler => handler(data));
                            }
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
        // Only connect on the client side
        if (typeof window !== 'undefined') {
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
        }
        return () => {};
    }, [connect]);

    const sendCommand = useCallback((command) => {
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(command));
        } else {
            console.error('WebSocket is not connected');
            setStatusMessage('Cannot send command: WebSocket is not connected');
        }
    }, [socket]);

    // Generate the wsUrl safely for both client and server environments
    const getWsUrl = () => {
        if (typeof window === 'undefined') {
            return process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
        }
        
        return localStorage.getItem('noobots_ws_url') || 
               process.env.NEXT_PUBLIC_WS_URL || 
               `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}://${window.location.hostname}:3001`;
    };

    return {
        isConnected,
        systemStats,
        statusMessage,
        sendCommand,
        connect,
        wsUrl: getWsUrl()
    };
};

export default useWebSocket; 
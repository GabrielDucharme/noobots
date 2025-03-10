'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const RECONNECT_DELAY = 3000; // 3 seconds
const CONNECTION_REFRESH_INTERVAL = 30000; // 30 seconds - how often to check for updated connection info

const useWebSocket = () => {
    const [socket, setSocket] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [systemStats, setSystemStats] = useState({
        cpuLoad: '0',
        memoryUsed: '0',
        temperature: 'N/A'
    });
    const [statusMessage, setStatusMessage] = useState('');
    const [serverHost, setServerHost] = useState(null);
    const [tcpStreamInfo, setTcpStreamInfo] = useState(null);
    const reconnectTimeoutRef = useRef(null);
    const refreshIntervalRef = useRef(null);
    const connectionInfoRef = useRef(null);

    // Function to fetch the latest connection info from our API
    const fetchConnectionInfo = useCallback(async () => {
        try {
            // Skip API call during SSR
            if (typeof window === 'undefined') return null;
            
            // Fetch the latest connection details
            const response = await fetch('/api/connection');
            if (!response.ok) {
                throw new Error(`Failed to fetch connection info: ${response.status}`);
            }
            
            const data = await response.json();
            connectionInfoRef.current = data;
            
            // Return the connection info
            return data;
        } catch (error) {
            console.error('Error fetching connection info:', error);
            return null;
        }
    }, []);

    const connect = useCallback(async (customUrl = null) => {
        try {
            // Get WebSocket URL, prioritizing in this order:
            // 1. Custom URL passed to this function
            // 2. API-provided URL (from our Raspberry Pi)
            // 3. Environment variable
            // 4. Stored in localStorage
            // 5. Auto-detect from current location
            
            let wsUrl;
            let apiConnectionInfo = null;
            
            // First try to get connection info from our API
            if (!customUrl) {
                apiConnectionInfo = await fetchConnectionInfo();
                if (apiConnectionInfo?.wsUrl) {
                    wsUrl = apiConnectionInfo.wsUrl;
                    console.log('Using API-provided WebSocket URL:', wsUrl);
                    
                    // Update TCP stream info if available
                    if (apiConnectionInfo.tcpUrl) {
                        // Parse TCP URL (tcp://host:port)
                        const tcpUrl = apiConnectionInfo.tcpUrl;
                        const tcpUrlParts = tcpUrl.replace('tcp://', '').split(':');
                        
                        setTcpStreamInfo({
                            host: tcpUrlParts[0],
                            port: parseInt(tcpUrlParts[1], 10),
                            codec: 'h264'
                        });
                        
                        console.log('Updated TCP stream info:', {
                            host: tcpUrlParts[0],
                            port: parseInt(tcpUrlParts[1], 10)
                        });
                    }
                }
            }
            
            // If no API URL or we have a custom one, fall back to other methods
            if (customUrl) {
                wsUrl = customUrl;
            } else if (!wsUrl) {
                if (process.env.NEXT_PUBLIC_WS_URL) {
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
            }

            // Save URL to localStorage for future use
            if (customUrl && typeof window !== 'undefined') {
                localStorage.setItem('noobots_ws_url', customUrl);
            }
            
            // Save the server host for other components to use
            setServerHost(wsUrl);

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
                reconnectTimeoutRef.current = setTimeout(() => connect(), RECONNECT_DELAY);
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
    }, [fetchConnectionInfo]);

    // Set up initial connection and fetch API connection info periodically
    useEffect(() => {
        // Only run on client side
        if (typeof window === 'undefined') return;
        
        // Start a connection
        const ws = connect();
        
        // Set up periodic refresh of connection info
        refreshIntervalRef.current = setInterval(async () => {
            const info = await fetchConnectionInfo();
            
            // Only reconnect if the API URL is different from current
            if (info?.wsUrl && info.wsUrl !== connectionInfoRef.current?.wsUrl && ws) {
                console.log('Connection info changed, reconnecting...');
                ws.close(); // This will trigger reconnect via onclose handler
            }
        }, CONNECTION_REFRESH_INTERVAL);

        // Clean up
        return () => {
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
            
            if (refreshIntervalRef.current) {
                clearInterval(refreshIntervalRef.current);
            }
            
            if (ws) {
                ws.send(JSON.stringify({ type: 'stopStatsMonitoring' }));
                ws.close();
            }
        };
    }, [connect, fetchConnectionInfo]);

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
        sendCommand,
        connect,
        serverHost,
        tcpStreamInfo
    };
};

export default useWebSocket; 
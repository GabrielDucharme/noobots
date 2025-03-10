'use client';

import { useState, useEffect, useRef } from 'react';
import JSMpegPlayer from './JSMpegPlayer'; // We'll create this component next

export default function CameraPanel({ isConnected, sendCommand, serverHost }) {
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [streamUrl, setStreamUrl] = useState('');
    const [snapshotUrl, setSnapshotUrl] = useState('');
    const [tcpStreamInfo, setTcpStreamInfo] = useState(null);
    const [testImageUrl, setTestImageUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(Date.now());
    
    // Default to TCP streaming if available
    const [useStreamingMode, setUseStreamingMode] = useState(true);
    const [streamMode, setStreamMode] = useState('tcp'); // 'tcp', 'http', or 'snapshot'
    
    const [streamError, setStreamError] = useState(false);
    const [snapshotError, setSnapshotError] = useState(false);
    const [useFallbackMode, setUseFallbackMode] = useState(false);
    const [successfulImageLoads, setSuccessfulImageLoads] = useState(0);
    const [lastImageSize, setLastImageSize] = useState({ width: 0, height: 0 });
    const [debugInfo, setDebugInfo] = useState('No image loaded yet');
    const snapshotTimerRef = useRef(null);
    const videoRef = useRef(null);
    const playerRef = useRef(null);
    
    // Function to force refresh the camera stream
    const refreshStream = () => {
        console.log('Manually refreshing camera stream');
        setStreamError(false);
        setRefreshKey(Date.now());
        
        // Try TCP mode first, fall back to HTTP or snapshot if needed
        if (streamError) {
            // Cycle through modes: tcp -> http -> snapshot -> tcp
            if (streamMode === 'tcp') {
                setStreamMode('http');
                setUseStreamingMode(true);
            } else if (streamMode === 'http') {
                setStreamMode('snapshot');
                setUseStreamingMode(false);
            } else {
                setStreamMode('tcp');
                setUseStreamingMode(true);
            }
        }
    };

    useEffect(() => {
        if (isConnected) {
            // Ask for camera status
            sendCommand({ type: 'getCameraStatus' });
            
            // Determine server host for camera URLs
            if (serverHost) {
                // Extract host and protocol from WebSocket URL
                let host = serverHost;
                let baseUrl;
                let tcpHost; // For TCP connections
                
                // Handle ngrok URLs properly
                if (host.includes('ngrok')) {
                    // If using ngrok, keep the full URL path
                    if (host.startsWith('ws://')) {
                        host = host.replace('ws://', 'http://');
                        tcpHost = host.replace('ws://', '');
                    } else if (host.startsWith('wss://')) {
                        host = host.replace('wss://', 'https://');
                        tcpHost = host.replace('wss://', '');
                    }
                    // Use the same ngrok domain but different endpoint
                    baseUrl = host;
                } else {
                    // Normal handling for direct connections
                    if (host.startsWith('ws://')) {
                        host = host.replace('ws://', 'http://');
                        tcpHost = host.replace('ws://', '').split('/')[0]; // Just host:port
                    } else if (host.startsWith('wss://')) {
                        host = host.replace('wss://', 'https://');
                        tcpHost = host.replace('wss://', '').split('/')[0]; // Just host:port
                    }
                    
                    // Remove any path and just keep the host:port
                    const urlParts = host.split('/');
                    baseUrl = urlParts[0];
                    
                    // For local connections, use localhost for TCP
                    if (tcpHost.includes('localhost') || tcpHost.includes('127.0.0.1')) {
                        // Already localhost, keep as is
                    } else if (tcpHost.includes('0.0.0.0')) {
                        // Replace 0.0.0.0 with localhost
                        tcpHost = tcpHost.replace('0.0.0.0', 'localhost');
                    }
                }
                
                // For HTTP streaming and snapshots
                setStreamUrl(`${baseUrl}/camera/stream`);
                setSnapshotUrl(`${baseUrl}/camera/snapshot`);
                setTestImageUrl(`${baseUrl}/camera/test-image`);
                
                // For TCP streaming (use a different port, configured in the server)
                // We'll get the actual port from the server via cameraStatus message
                const tcpPort = 3002; // Default port, will be overridden by server message
                setTcpStreamInfo({
                    host: tcpHost,
                    port: tcpPort,
                    codec: 'h264'
                });
                
                console.log('Camera URLs set:', {
                    stream: `${baseUrl}/camera/stream`,
                    snapshot: `${baseUrl}/camera/snapshot`,
                    testImage: `${baseUrl}/camera/test-image`,
                    tcpStream: `tcp://${tcpHost}:${tcpPort}`
                });
                
                // Try to load the test image to ensure connectivity
                const testImg = new Image();
                testImg.onload = () => {
                    console.log('Test image loaded successfully');
                    setUseFallbackMode(false);
                };
                testImg.onerror = () => {
                    console.error('Test image failed to load, switching to fallback mode');
                    setUseFallbackMode(true);
                };
                testImg.src = `${baseUrl}/camera/test-image?t=${Date.now()}`;
            }
        } else {
            setIsCameraAvailable(false);
            setIsCameraActive(false);
            setTcpStreamInfo(null);
            
            // Clean up any active players/timers
            if (playerRef.current) {
                try {
                    playerRef.current.destroy();
                    playerRef.current = null;
                } catch (e) {
                    console.error('Error destroying video player:', e);
                }
            }
            
            // Clear snapshot timer when disconnected
            if (snapshotTimerRef.current) {
                clearInterval(snapshotTimerRef.current);
                snapshotTimerRef.current = null;
            }
        }
    }, [isConnected, serverHost, sendCommand]);

    // Function to handle camera status updates
    const handleCameraMessage = (message) => {
        console.log('Camera message received:', message);
        if (message.type === 'cameraStatus') {
            setIsCameraAvailable(message.available);
            setIsCameraActive(message.active);
            setIsLoading(false);
            
            // Check for TCP stream info and update if available
            if (message.streamInfo) {
                console.log('Received TCP stream info:', message.streamInfo);
                setTcpStreamInfo(message.streamInfo);
                
                // If TCP stream is available, default to TCP mode
                if (message.streamInfo.type === 'tcp') {
                    setStreamMode('tcp');
                    setUseStreamingMode(true);
                }
            }
            
            // Setup based on camera status
            if (message.active) {
                // Log that camera is active
                console.log('CAMERA IS ACTIVE - Starting appropriate stream mode...');
                
                // Choose appropriate stream mode based on availability
                if (tcpStreamInfo && streamMode === 'tcp') {
                    setDebugInfo(`TCP camera stream active at ${new Date().toLocaleTimeString()}`);
                    setUseStreamingMode(true);
                } else if (streamMode === 'http') {
                    setDebugInfo(`HTTP camera stream active at ${new Date().toLocaleTimeString()}`);
                    setUseStreamingMode(true);
                } else {
                    setDebugInfo(`Camera active at ${new Date().toLocaleTimeString()} - Taking snapshot...`);
                    setUseStreamingMode(false);
                }
                
                // Force refresh with a cache-busting parameter
                setRefreshKey(Date.now());
                setStreamError(false);
                
                // For snapshot mode, set up auto-refresh after success
                if (successfulImageLoads >= 3 && !useStreamingMode && !snapshotTimerRef.current) {
                    console.log('Setting up auto-refresh after 3 successful loads');
                    snapshotTimerRef.current = setInterval(() => {
                        setRefreshKey(Date.now());
                        setDebugInfo(`Auto refresh at ${new Date().toLocaleTimeString()}`);
                    }, 3000); // Update every 3 seconds
                }
            } else {
                // Clean up when camera is inactive
                if (snapshotTimerRef.current) {
                    clearInterval(snapshotTimerRef.current);
                    snapshotTimerRef.current = null;
                }
                
                // Clean up TCP player if active
                if (playerRef.current) {
                    try {
                        playerRef.current.destroy();
                        playerRef.current = null;
                    } catch (e) {
                        console.error('Error destroying video player:', e);
                    }
                }
                
                setDebugInfo('Camera inactive');
            }
        }
    };

    // Register this handler with the parent component
    useEffect(() => {
        // Only run on client side
        if (typeof window !== 'undefined') {
            if (window.cameraMessageHandlers) {
                window.cameraMessageHandlers.push(handleCameraMessage);
            } else {
                window.cameraMessageHandlers = [handleCameraMessage];
            }
            
            return () => {
                // Clean up message handlers
                if (window.cameraMessageHandlers) {
                    window.cameraMessageHandlers = window.cameraMessageHandlers.filter(
                        handler => handler !== handleCameraMessage
                    );
                }
                
                // Clean up snapshot timer
                if (snapshotTimerRef.current) {
                    clearInterval(snapshotTimerRef.current);
                    snapshotTimerRef.current = null;
                }
            };
        }
    }, []);
    
    // Effect to manage snapshot timer when streaming mode changes
    useEffect(() => {
        if (isCameraActive) {
            if (!useStreamingMode) {
                // Start the snapshot timer when in snapshot mode
                if (!snapshotTimerRef.current) {
                    snapshotTimerRef.current = setInterval(() => {
                        setRefreshKey(Date.now());
                    }, 2000);
                }
            } else {
                // Clear the timer when in streaming mode
                if (snapshotTimerRef.current) {
                    clearInterval(snapshotTimerRef.current);
                    snapshotTimerRef.current = null;
                }
            }
        }
        
        // Clean up on unmount
        return () => {
            if (snapshotTimerRef.current) {
                clearInterval(snapshotTimerRef.current);
                snapshotTimerRef.current = null;
            }
        };
    }, [useStreamingMode, isCameraActive]);

    const toggleCamera = () => {
        if (isCameraActive) {
            sendCommand({ type: 'stopCamera' });
        } else {
            sendCommand({ type: 'startCamera' });
        }
    };

    return (
        <div className="bg-gray-800 rounded-xl shadow-lg p-6 border border-gray-700">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-red-500 rounded-lg">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                </div>
                <h2 className="text-xl font-bold">Caméra</h2>
                {isCameraActive && (
                    <span className="flex-shrink-0 animate-pulse bg-red-500 rounded-full px-2 py-1 text-xs font-medium text-white">
                        LIVE
                    </span>
                )}
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-48 bg-gray-900 rounded-lg">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
            ) : !isCameraAvailable ? (
                <div className="bg-gray-900 rounded-lg p-6 text-center text-gray-400">
                    <p>Caméra non disponible sur cette plateforme</p>
                    <p className="text-sm mt-2">Connectez-vous à un Raspberry Pi avec une caméra configurée</p>
                </div>
            ) : (
                <>
                    <div className="bg-gray-900 rounded-lg overflow-hidden mb-4 relative" style={{ minHeight: '240px' }}>
                        {isCameraActive ? (
                            <>
                                {useStreamingMode ? (
                                    streamMode === 'tcp' && tcpStreamInfo ? (
                                        // TCP streaming mode with JSMpeg
                                        <div className="relative">
                                            <JSMpegPlayer
                                                ref={playerRef}
                                                tcpInfo={tcpStreamInfo}
                                                className="w-full h-auto max-h-[400px]"
                                                style={{ minHeight: '240px', background: '#1a1a1a' }}
                                                onConnect={() => {
                                                    console.log('TCP stream connected successfully');
                                                    setStreamError(false);
                                                    setDebugInfo(`TCP stream connected at ${new Date().toLocaleTimeString()}`);
                                                }}
                                                onError={(err) => {
                                                    console.error('TCP stream error:', err);
                                                    setStreamError(true);
                                                    setDebugInfo(`TCP error: ${err}`);
                                                    
                                                    // After TCP errors, fall back to HTTP streaming
                                                    setTimeout(() => {
                                                        if (streamMode === 'tcp' && streamError) {
                                                            console.log('TCP stream error, falling back to HTTP stream');
                                                            setStreamMode('http');
                                                            setRefreshKey(Date.now());
                                                        }
                                                    }, 3000);
                                                }}
                                                refreshKey={refreshKey}
                                            />
                                            
                                            {/* TCP debug overlay */}
                                            <div className="absolute top-0 left-0 bg-black bg-opacity-70 px-2 py-1 m-2 text-xs text-blue-300 z-10 rounded">
                                                {debugInfo}
                                            </div>
                                            
                                            {/* Auto-recovery overlay */}
                                            {streamError && (
                                                <div className="absolute top-0 right-0 bg-black bg-opacity-70 px-2 py-1 text-xs text-yellow-300">
                                                    Reconnexion TCP...
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        // HTTP stream mode with auto-recovery
                                        <div className="relative">
                                            <img 
                                                key={`camera-stream-${refreshKey}`}
                                                src={`${streamUrl}?t=${refreshKey}`}
                                                className="w-full h-auto max-h-[400px] object-contain"
                                                alt="Camera stream"
                                                style={{ minHeight: '240px', background: '#1a1a1a' }}
                                                onLoad={() => {
                                                    // Reset stream error state when stream loads successfully
                                                    if (streamError) {
                                                        setStreamError(false);
                                                    }
                                                    setDebugInfo(`HTTP stream loaded at ${new Date().toLocaleTimeString()}`);
                                                }}
                                                onError={(e) => {
                                                    console.error('Failed to load HTTP camera stream:', e);
                                                    setStreamError(true);
                                                    setDebugInfo(`HTTP stream error at ${new Date().toLocaleTimeString()}`);
                                                    
                                                    // After consecutive errors, try other modes
                                                    if (streamError && streamMode === 'http') {
                                                        console.log('Multiple HTTP stream errors, switching to snapshot mode');
                                                        setStreamMode('snapshot');
                                                        setUseStreamingMode(false);
                                                        
                                                        // Start snapshot timer if not already running
                                                        if (!snapshotTimerRef.current) {
                                                            snapshotTimerRef.current = setInterval(() => {
                                                                setRefreshKey(Date.now());
                                                            }, 2000);
                                                        }
                                                    } else {
                                                        // Try to recover the HTTP stream with a new connection
                                                        setTimeout(() => {
                                                            if (useStreamingMode && streamMode === 'http') {
                                                                console.log('Attempting HTTP stream recovery...');
                                                                setRefreshKey(Date.now());
                                                            }
                                                        }, 3000);
                                                    }
                                                }}
                                            />
                                            
                                            {/* HTTP debug overlay */}
                                            <div className="absolute top-0 left-0 bg-black bg-opacity-70 px-2 py-1 m-2 text-xs text-green-300 z-10 rounded">
                                                {debugInfo}
                                            </div>
                                            
                                            {/* Auto-recovery overlay */}
                                            {streamError && (
                                                <div className="absolute top-0 right-0 bg-black bg-opacity-70 px-2 py-1 text-xs text-yellow-300">
                                                    Récupération HTTP...
                                                </div>
                                            )}
                                        </div>
                                    )
                                ) : (
                                    // Choose between snapshot mode or fallback mode
                                    <div className="relative" style={{ minHeight: '240px' }}>
                                        {useFallbackMode ? (
                                            // Fallback mode using test image if available
                                            <img 
                                                key={`camera-test-${refreshKey}`}
                                                src={`${testImageUrl}?t=${refreshKey}`}
                                                className="w-full h-auto max-h-[400px] object-contain" 
                                                alt="Camera test"
                                                style={{ background: '#1a1a1a' }}
                                                onLoad={(e) => {
                                                    const imgWidth = e.target.naturalWidth;
                                                    const imgHeight = e.target.naturalHeight;
                                                    console.log('Test image loaded successfully:', imgWidth, 'x', imgHeight);
                                                    setLastImageSize({ width: imgWidth, height: imgHeight });
                                                    setSuccessfulImageLoads(prev => prev + 1);
                                                    setDebugInfo(`Test image: ${imgWidth}x${imgHeight} - loaded at ${new Date().toLocaleTimeString()}`);
                                                }}
                                                onError={(e) => {
                                                    console.error('Failed to load test image');
                                                    setDebugInfo(`Error loading test image at ${new Date().toLocaleTimeString()}`);
                                                }}
                                            />
                                        ) : (
                                            // Basic single snapshot mode with extensive debugging
                                            <>
                                                <img 
                                                    key={`camera-snapshot-${refreshKey}`}
                                                    src={`${snapshotUrl}?t=${refreshKey}`}
                                                    className="w-full h-auto max-h-[400px] object-contain" 
                                                    alt="Camera snapshot"
                                                    style={{ background: '#1a1a1a' }}
                                                    crossOrigin="anonymous"
                                                    onLoad={(e) => {
                                                        // Get image details
                                                        const imgWidth = e.target.naturalWidth;
                                                        const imgHeight = e.target.naturalHeight;
                                                        console.log('SNAPSHOT LOADED SUCCESSFULLY:', imgWidth, 'x', imgHeight);
                                                        
                                                        // Store image size
                                                        setLastImageSize({ width: imgWidth, height: imgHeight });
                                                        setSuccessfulImageLoads(prev => prev + 1);
                                                        setSnapshotError(false);
                                                        
                                                        // Update debug info
                                                        setDebugInfo(`Success: ${imgWidth}x${imgHeight} - ${new Date().toLocaleTimeString()}`);
                                                        
                                                        // Make image visible if it was hidden
                                                        e.target.style.display = 'block';
                                                        
                                                        // Hide error div if visible
                                                        const errorDiv = document.getElementById('snapshot-error');
                                                        if (errorDiv) {
                                                            errorDiv.style.display = 'none';
                                                        }
                                                    }}
                                                    onError={(e) => {
                                                        console.error('Failed to load camera snapshot:', e);
                                                        setSnapshotError(true);
                                                        setDebugInfo(`Error loading snapshot at ${new Date().toLocaleTimeString()}`);
                                                        
                                                        // Try the test image instead after repeated failures
                                                        if (snapshotError && successfulImageLoads === 0) {
                                                            setUseFallbackMode(true);
                                                        }
                                                        
                                                        // Display the error in the UI
                                                        e.target.style.display = 'none';
                                                        const errorDiv = document.getElementById('snapshot-error');
                                                        if (errorDiv) {
                                                            errorDiv.style.display = 'flex';
                                                        }
                                                    }}
                                                />
                                                {/* Debug overlay */}
                                                <div className="absolute top-0 left-0 bg-black bg-opacity-70 px-2 py-1 m-2 text-xs text-green-300 z-10 rounded">
                                                    {debugInfo}
                                                </div>
                                            </>
                                        )}
                                        <div 
                                            id="snapshot-error"
                                            className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 hidden"
                                        >
                                            <p className="text-red-500 text-center mb-2">Error loading camera image</p>
                                            <p className="text-gray-400 text-sm text-center">
                                                {debugInfo}
                                            </p>
                                            <div className="flex gap-2 mt-6">
                                                <button
                                                    onClick={() => {
                                                        setRefreshKey(Date.now());
                                                        setDebugInfo(`Manual refresh at ${new Date().toLocaleTimeString()}`);
                                                    }}
                                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm"
                                                >
                                                    Try Again
                                                </button>
                                                <button
                                                    onClick={() => setUseFallbackMode(!useFallbackMode)}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm"
                                                >
                                                    {useFallbackMode ? "Try Camera" : "Use Test Image"}
                                                </button>
                                            </div>
                                            <div className="mt-4 text-xs text-gray-500 text-center">
                                                <p>Load attempts: {successfulImageLoads > 0 ? `${successfulImageLoads} successful` : "none successful"}</p>
                                                <p>Last successful image: {lastImageSize.width > 0 ? `${lastImageSize.width}x${lastImageSize.height}` : "none"}</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs text-white">
                                    {useStreamingMode 
                                      ? (streamMode === 'tcp' ? 'Mode: TCP Stream' : 'Mode: HTTP Stream') 
                                      : (useFallbackMode ? 'Mode: Test Image' : 'Mode: Snapshots')} | 
                                    <button 
                                        onClick={() => {
                                            // If in fallback mode, toggle between fallback and snapshot mode
                                            if (!useStreamingMode && useFallbackMode) {
                                                setUseFallbackMode(false);
                                                setRefreshKey(Date.now());
                                                return;
                                            }
                                            
                                            // Cycle through available modes: TCP -> HTTP -> Snapshot -> TCP
                                            if (useStreamingMode && streamMode === 'tcp') {
                                                // Switch from TCP to HTTP
                                                setStreamMode('http');
                                                setUseStreamingMode(true);
                                            } else if (useStreamingMode && streamMode === 'http') {
                                                // Switch from HTTP to snapshot
                                                setStreamMode('snapshot');
                                                setUseStreamingMode(false);
                                                // Start snapshot timer
                                                if (!snapshotTimerRef.current) {
                                                    snapshotTimerRef.current = setInterval(() => {
                                                        setRefreshKey(Date.now());
                                                    }, 2000);
                                                }
                                            } else {
                                                // Switch from snapshot back to TCP if available, otherwise HTTP
                                                if (tcpStreamInfo) {
                                                    setStreamMode('tcp');
                                                } else {
                                                    setStreamMode('http');
                                                }
                                                setUseStreamingMode(true);
                                                // Clear snapshot timer
                                                if (snapshotTimerRef.current) {
                                                    clearInterval(snapshotTimerRef.current);
                                                    snapshotTimerRef.current = null;
                                                }
                                            }
                                            
                                            setRefreshKey(Date.now());
                                        }}
                                        className="ml-2 underline"
                                    >
                                        Changer
                                    </button>
                                    {!useStreamingMode && !useFallbackMode && (
                                        <button 
                                            onClick={() => {
                                                setUseFallbackMode(true);
                                                setRefreshKey(Date.now());
                                            }}
                                            className="ml-2 text-blue-300 underline"
                                            title="Use test image if camera not working"
                                        >
                                            Test
                                        </button>
                                    )}
                                    {useStreamingMode && streamMode === 'http' && tcpStreamInfo && (
                                        <button 
                                            onClick={() => {
                                                setStreamMode('tcp');
                                                setRefreshKey(Date.now());
                                            }}
                                            className="ml-2 text-cyan-300 underline"
                                            title="Switch to TCP streaming"
                                        >
                                            TCP
                                        </button>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-center items-center h-48 text-gray-500">
                                <p>Caméra inactive</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-center flex-wrap gap-3">
                        <button
                            onClick={toggleCamera}
                            className={`flex items-center justify-center gap-2 px-4 py-3 ${
                                isCameraActive 
                                    ? 'bg-red-500 hover:bg-red-600' 
                                    : 'bg-green-500 hover:bg-green-600'
                            } text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                            disabled={!isConnected}
                        >
                            {isCameraActive ? (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                                    </svg>
                                    Arrêter la caméra
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Démarrer la caméra
                                </>
                            )}
                        </button>
                        
                        {isCameraActive && (
                            <>
                                <button
                                    onClick={() => {
                                        setRefreshKey(Date.now());
                                        setDebugInfo(`Manual snapshot at ${new Date().toLocaleTimeString()}`);
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-black font-medium rounded-lg transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Prendre Photo
                                </button>
                                
                                <button
                                    onClick={() => {
                                        if (snapshotTimerRef.current) {
                                            clearInterval(snapshotTimerRef.current);
                                            snapshotTimerRef.current = null;
                                            setDebugInfo(`Auto refresh disabled at ${new Date().toLocaleTimeString()}`);
                                        } else {
                                            snapshotTimerRef.current = setInterval(() => {
                                                setRefreshKey(Date.now());
                                            }, 3000);
                                            setDebugInfo(`Auto refresh enabled at ${new Date().toLocaleTimeString()}`);
                                        }
                                    }}
                                    className={`flex items-center justify-center gap-2 px-4 py-3 ${snapshotTimerRef.current ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-500 hover:bg-blue-600'} text-white font-medium rounded-lg transition-colors`}
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {snapshotTimerRef.current ? 'Arrêter Auto' : 'Démarrer Auto'}
                                </button>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
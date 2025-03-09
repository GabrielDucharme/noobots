'use client';

import { useState, useEffect, useRef } from 'react';

export default function CameraPanel({ isConnected, sendCommand, serverHost }) {
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [streamUrl, setStreamUrl] = useState('');
    const [snapshotUrl, setSnapshotUrl] = useState('');
    const [testImageUrl, setTestImageUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(Date.now());
    
    // Start with snapshot mode - not streaming - to simplify debugging
    const [useStreamingMode, setUseStreamingMode] = useState(false);
    
    const [streamError, setStreamError] = useState(false);
    const [snapshotError, setSnapshotError] = useState(false);
    const [useFallbackMode, setUseFallbackMode] = useState(false);
    const [successfulImageLoads, setSuccessfulImageLoads] = useState(0);
    const [lastImageSize, setLastImageSize] = useState({ width: 0, height: 0 });
    const [debugInfo, setDebugInfo] = useState('No image loaded yet');
    const snapshotTimerRef = useRef(null);
    const videoRef = useRef(null);
    
    // Function to force refresh the camera stream
    const refreshStream = () => {
        console.log('Manually refreshing camera stream');
        setStreamError(false);
        setRefreshKey(Date.now());
        
        // Toggle between streaming and snapshot modes
        if (streamError) {
            setUseStreamingMode(!useStreamingMode);
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
                
                // Handle ngrok URLs properly
                if (host.includes('ngrok')) {
                    // If using ngrok, keep the full URL path
                    if (host.startsWith('ws://')) {
                        host = host.replace('ws://', 'http://');
                    } else if (host.startsWith('wss://')) {
                        host = host.replace('wss://', 'https://');
                    }
                    // Use the same ngrok domain but different endpoint
                    baseUrl = host;
                } else {
                    // Normal handling for direct connections
                    if (host.startsWith('ws://')) {
                        host = host.replace('ws://', 'http://');
                    } else if (host.startsWith('wss://')) {
                        host = host.replace('wss://', 'https://');
                    }
                    
                    // Remove any path and just keep the host:port
                    const urlParts = host.split('/');
                    baseUrl = urlParts[0];
                }
                
                setStreamUrl(`${baseUrl}/camera/stream`);
                setSnapshotUrl(`${baseUrl}/camera/snapshot`);
                setTestImageUrl(`${baseUrl}/camera/test-image`);
                
                console.log('Camera URLs set:', {
                    stream: `${baseUrl}/camera/stream`,
                    snapshot: `${baseUrl}/camera/snapshot`,
                    testImage: `${baseUrl}/camera/test-image`
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
            
            // Setup based on camera status
            if (message.active) {
                // Log that camera is active
                console.log('CAMERA IS ACTIVE - Taking first snapshot...');
                setDebugInfo(`Camera active at ${new Date().toLocaleTimeString()} - Taking snapshot...`);
                
                // Force refresh with a cache-busting parameter
                setRefreshKey(Date.now());
                setStreamError(false);
                
                // We intentionally don't set up automatic snapshots initially
                // Let's first see if we can get a single image properly displayed
                // If we get successful images, then we can consider auto-refresh
                
                if (successfulImageLoads >= 3 && !useStreamingMode && !snapshotTimerRef.current) {
                    console.log('Setting up auto-refresh after 3 successful loads');
                    snapshotTimerRef.current = setInterval(() => {
                        setRefreshKey(Date.now());
                        setDebugInfo(`Auto refresh at ${new Date().toLocaleTimeString()}`);
                    }, 3000); // Update every 3 seconds
                }
            } else {
                // Clear snapshot timer when camera is inactive
                if (snapshotTimerRef.current) {
                    clearInterval(snapshotTimerRef.current);
                    snapshotTimerRef.current = null;
                }
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
                                    // Stream mode with auto-recovery
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
                                            }}
                                            onError={(e) => {
                                                console.error('Failed to load camera stream:', e);
                                                setStreamError(true);
                                                
                                                // After three consecutive stream errors, switch to snapshot mode
                                                if (streamError && successfulImageLoads === 0) {
                                                    console.log('Multiple stream errors, switching to snapshot mode');
                                                    setUseStreamingMode(false);
                                                    
                                                    // Start snapshot timer if not already running
                                                    if (!snapshotTimerRef.current) {
                                                        snapshotTimerRef.current = setInterval(() => {
                                                            setRefreshKey(Date.now());
                                                        }, 2000);
                                                    }
                                                } else {
                                                    // Try to recover the stream with a new connection
                                                    setTimeout(() => {
                                                        if (useStreamingMode) {
                                                            console.log('Attempting stream recovery...');
                                                            setRefreshKey(Date.now());
                                                        }
                                                    }, 3000);
                                                }
                                            }}
                                        />
                                        
                                        {/* Auto-recovery overlay */}
                                        {streamError && (
                                            <div className="absolute top-0 right-0 bg-black bg-opacity-70 px-2 py-1 text-xs text-yellow-300">
                                                Récupération...
                                            </div>
                                        )}
                                    </div>
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
                                    {useStreamingMode ? 'Mode: Stream' : 
                                     useFallbackMode ? 'Mode: Test Image' : 'Mode: Snapshots'} | 
                                    <button 
                                        onClick={() => {
                                            // If in fallback mode, toggle between fallback and snapshot mode
                                            if (!useStreamingMode && useFallbackMode) {
                                                setUseFallbackMode(false);
                                                setRefreshKey(Date.now());
                                                return;
                                            }
                                            
                                            // Otherwise toggle between stream and snapshot modes
                                            setUseStreamingMode(!useStreamingMode);
                                            setRefreshKey(Date.now());
                                            
                                            // Manage snapshot timer based on mode
                                            if (useStreamingMode) {
                                                if (!snapshotTimerRef.current) {
                                                    snapshotTimerRef.current = setInterval(() => {
                                                        setRefreshKey(Date.now());
                                                    }, 2000);
                                                }
                                            } else {
                                                if (snapshotTimerRef.current) {
                                                    clearInterval(snapshotTimerRef.current);
                                                    snapshotTimerRef.current = null;
                                                }
                                            }
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
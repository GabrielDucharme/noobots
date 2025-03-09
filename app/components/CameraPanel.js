'use client';

import { useState, useEffect, useRef } from 'react';

export default function CameraPanel({ isConnected, sendCommand, serverHost }) {
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [streamUrl, setStreamUrl] = useState('');
    const [snapshotUrl, setSnapshotUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(Date.now());
    const [useStreamingMode, setUseStreamingMode] = useState(true);
    const [streamError, setStreamError] = useState(false);
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
                
                console.log('Camera URLs set:', {
                    stream: `${baseUrl}/camera/stream`,
                    snapshot: `${baseUrl}/camera/snapshot`
                });
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
            
            // Setup snapshot timer or clear it based on camera status
            if (message.active) {
                // Force refresh the stream URLs with a cache-busting parameter
                setRefreshKey(Date.now());
                setStreamError(false);
                
                // Set up snapshot timer for fallback mode
                if (!useStreamingMode && !snapshotTimerRef.current) {
                    snapshotTimerRef.current = setInterval(() => {
                        // Force a new snapshot by updating the timestamp
                        setRefreshKey(Date.now());
                    }, 2000); // Update every 2 seconds
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
                                    // Stream mode - continuous video
                                    <img 
                                        key={`camera-stream-${refreshKey}`} // Force re-render with changing key
                                        src={`${streamUrl}?t=${refreshKey}`} // Add timestamp to prevent caching
                                        className="w-full h-auto" 
                                        alt="Camera stream"
                                        onError={(e) => {
                                            console.error('Failed to load camera stream:', e);
                                            setStreamError(true);
                                            // Automatically switch to snapshot mode after stream error
                                            setUseStreamingMode(false);
                                            
                                            // Start snapshot timer if not already running
                                            if (!snapshotTimerRef.current) {
                                                snapshotTimerRef.current = setInterval(() => {
                                                    setRefreshKey(Date.now());
                                                }, 2000);
                                            }
                                        }}
                                    />
                                ) : (
                                    // Snapshot mode - individual frames
                                    <img 
                                        key={`camera-snapshot-${refreshKey}`}
                                        src={`${snapshotUrl}?t=${refreshKey}`}
                                        className="w-full h-auto"
                                        alt="Camera snapshot"
                                        onError={(e) => {
                                            console.error('Failed to load camera snapshot:', e);
                                            // Try again with the next timer cycle
                                        }}
                                    />
                                )}
                                
                                <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 px-2 py-1 rounded text-xs text-white">
                                    {useStreamingMode ? 'Mode: Stream' : 'Mode: Snapshots'} | 
                                    <button 
                                        onClick={() => {
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
                                </div>
                            </>
                        ) : (
                            <div className="flex justify-center items-center h-48 text-gray-500">
                                <p>Caméra inactive</p>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex justify-center gap-3">
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
                            <button
                                onClick={refreshStream}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
                                title="Rafraîchir le flux vidéo"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                Rafraîchir
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
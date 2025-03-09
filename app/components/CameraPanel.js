'use client';

import { useState, useEffect, useRef } from 'react';

export default function CameraPanel({ isConnected, sendCommand, serverHost }) {
    const [isCameraAvailable, setIsCameraAvailable] = useState(false);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [streamUrl, setStreamUrl] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(Date.now());
    const videoRef = useRef(null);
    
    // Function to force refresh the camera stream
    const refreshStream = () => {
        console.log('Manually refreshing camera stream');
        setRefreshKey(Date.now());
    };

    useEffect(() => {
        if (isConnected) {
            // Ask for camera status
            sendCommand({ type: 'getCameraStatus' });
            
            // Determine server host for camera stream URL
            if (serverHost) {
                // Extract host and protocol from WebSocket URL
                let host = serverHost;
                
                // Handle ngrok URLs properly
                if (host.includes('ngrok')) {
                    // If using ngrok, keep the full URL path
                    if (host.startsWith('ws://')) {
                        host = host.replace('ws://', 'http://');
                    } else if (host.startsWith('wss://')) {
                        host = host.replace('wss://', 'https://');
                    }
                    // Use the same ngrok domain but different endpoint
                    setStreamUrl(`${host}/camera/stream`);
                } else {
                    // Normal handling for direct connections
                    if (host.startsWith('ws://')) {
                        host = host.replace('ws://', 'http://');
                    } else if (host.startsWith('wss://')) {
                        host = host.replace('wss://', 'https://');
                    }
                    
                    // Remove any path and just keep the host:port
                    const urlParts = host.split('/');
                    const baseUrl = urlParts[0];
                    
                    setStreamUrl(`${baseUrl}/camera/stream`);
                }
                
                console.log('Camera stream URL set to:', streamUrl);
            }
        } else {
            setIsCameraAvailable(false);
            setIsCameraActive(false);
        }
    }, [isConnected, serverHost, sendCommand]);

    // Function to handle camera status updates
    const handleCameraMessage = (message) => {
        console.log('Camera message received:', message);
        if (message.type === 'cameraStatus') {
            setIsCameraAvailable(message.available);
            setIsCameraActive(message.active);
            setIsLoading(false);
            
            // Reload stream URL when camera becomes active
            if (message.active && serverHost) {
                const host = serverHost.startsWith('ws://') 
                    ? serverHost.replace('ws://', 'http://') 
                    : serverHost.replace('wss://', 'https://');
                
                if (host.includes('ngrok')) {
                    setStreamUrl(`${host}/camera/stream?t=${Date.now()}`);
                } else {
                    const baseUrl = host.split('/')[0];
                    setStreamUrl(`${baseUrl}/camera/stream?t=${Date.now()}`);
                }
                
                console.log('Stream URL updated:', streamUrl);
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
                if (window.cameraMessageHandlers) {
                    window.cameraMessageHandlers = window.cameraMessageHandlers.filter(
                        handler => handler !== handleCameraMessage
                    );
                }
            };
        }
    }, []);

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
                                <img 
                                    key={`camera-stream-${refreshKey}`} // Force re-render with changing key
                                    src={`${streamUrl}?t=${refreshKey}`} // Add timestamp to prevent caching
                                    className="w-full h-auto" 
                                    alt="Camera stream"
                                    onError={(e) => {
                                        console.error('Failed to load camera stream:', e);
                                        // Try to reload the image after a short delay
                                        setTimeout(() => {
                                            e.target.src = `${streamUrl}?t=${Date.now()}`;
                                        }, 1000);
                                    }}
                                />
                                <div className="absolute bottom-2 right-2 bg-black bg-opacity-50 px-2 py-1 rounded text-xs text-white">
                                    Tip: If stream is not visible, try refreshing
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
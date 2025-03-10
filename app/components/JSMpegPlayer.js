'use client';

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// JSMpeg Player for TCP streaming
const JSMpegPlayer = forwardRef(({ 
  tcpInfo, 
  width = 640, 
  height = 480, 
  className, 
  style,
  refreshKey, 
  onConnect, 
  onError 
}, ref) => {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const webSocketRef = useRef(null);
  
  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    destroy: () => {
      try {
        if (webSocketRef.current) {
          webSocketRef.current.close();
          webSocketRef.current = null;
        }
        
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      } catch (e) {
        console.error('Error destroying JSMpeg player:', e);
      }
    }
  }));
  
  useEffect(() => {
    // Load JSMpeg script dynamically
    const loadScript = async () => {
      // Only load JSMpeg if not already loaded
      if (!window.JSMpeg) {
        try {
          // Dynamically load the JSMpeg library from CDN
          const script = document.createElement('script');
          script.src = 'https://cdn.jsdelivr.net/npm/jsmpeg-player@5.0.0/build/jsmpeg.min.js';
          script.async = true;

          // Create a promise to know when the script is loaded
          const scriptPromise = new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = reject;
          });

          document.body.appendChild(script);
          await scriptPromise;
          console.log('JSMpeg library loaded successfully');
        } catch (err) {
          console.error('Failed to load JSMpeg library:', err);
          if (onError) onError('Failed to load video player library');
          return;
        }
      }
    };

    loadScript().then(() => {
      if (tcpInfo && window.JSMpeg) {
        // Clean up any existing player
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
        
        if (webSocketRef.current) {
          webSocketRef.current.close();
          webSocketRef.current = null;
        }
        
        try {
          // Format the WebSocket URL for JSMpeg TCP proxy
          // Note: This assumes you're using a TCP-to-WebSocket proxy like ws-tcp-bridge or similar
          const wsUrl = `ws://${tcpInfo.host}:${tcpInfo.port}`;
          console.log(`Connecting to TCP stream via WebSocket: ${wsUrl}`);
          
          // Create WebSocket connection
          webSocketRef.current = new WebSocket(wsUrl);
          
          // Set up event handlers
          webSocketRef.current.onopen = () => {
            console.log('WebSocket connection opened for TCP video stream');
            if (onConnect) onConnect();
          };
          
          webSocketRef.current.onerror = (error) => {
            console.error('WebSocket connection error:', error);
            if (onError) onError(`WebSocket error: ${error.message || 'Unknown error'}`);
          };
          
          webSocketRef.current.onclose = (event) => {
            console.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
            if (!event.wasClean && onError) {
              onError(`Connection closed unexpectedly: ${event.reason || 'Unknown reason'}`);
            }
          };
          
          // Create the player with appropriate options for H264 decoding
          const playerOptions = {
            audio: false,          // No audio
            video: true,           // Video only
            pauseWhenHidden: false, // Continue playing when tab is not visible
            disableGl: false,      // Use WebGL for rendering if available
            disableWebAssembly: false, // Use WebAssembly if available
            preserveDrawingBuffer: false,
            throttled: false,      // Don't throttle rendering
            onVideoDecode: (decoder, time) => {
              // Optional callback when video frame is decoded
            },
            maxAudioLag: 0,
            videoBufferSize: 1024 * 1024 * 4, // 4MB buffer for video
          };
          
          // Initialize the player with WebSocket connection
          playerRef.current = new window.JSMpeg.Player(wsUrl, {
            ...playerOptions,
            canvas: videoRef.current
          });
          
          console.log('JSMpeg player initialized with TCP stream');
        } catch (error) {
          console.error('Error initializing JSMpeg player:', error);
          if (onError) onError(`Player initialization error: ${error.message}`);
        }
      }
    }).catch(err => {
      console.error('Failed to setup player:', err);
      if (onError) onError(`Setup error: ${err.message}`);
    });
    
    // Cleanup function
    return () => {
      try {
        if (webSocketRef.current) {
          webSocketRef.current.close();
          webSocketRef.current = null;
        }
        
        if (playerRef.current) {
          playerRef.current.destroy();
          playerRef.current = null;
        }
      } catch (e) {
        console.error('Error cleaning up JSMpeg player:', e);
      }
    };
  }, [tcpInfo, refreshKey, onConnect, onError]); 

  return (
    <canvas 
      ref={videoRef} 
      width={width} 
      height={height} 
      className={className}
      style={style}
    />
  );
});

JSMpegPlayer.displayName = 'JSMpegPlayer';

export default JSMpegPlayer;
# Noobots Raspberry Pi Setup Guide

This guide will walk you through setting up your Raspberry Pi to work with the Noobots application, with a focus on TCP streaming for optimal camera performance.

## What's New

We've made a significant improvement to the camera streaming system:

- **TCP Streaming**: The camera now uses a dedicated TCP connection for video streaming, which offers better performance and reliability compared to the previous HTTP streaming.
- **Automatic Connection**: Once set up, the Raspberry Pi will automatically update the web app with its connection details - no more manual URL updating!
- **One-Time Setup**: After the initial configuration, the system will automatically start on boot and maintain the connection.

## Prerequisites

- Raspberry Pi (any model with camera support)
- Raspberry Pi Camera Module connected and enabled
- Internet connection (Wi-Fi or Ethernet)
- ngrok account (free tier is fine) - [Sign up here](https://ngrok.com/signup)

## Setup Process

### 1. One-Time Setup (5 minutes)

1. **Power on your Raspberry Pi** and make sure it's connected to the internet.

2. **Open a terminal** on your Raspberry Pi (or connect via SSH).

3. **Download the setup script** by running:

   ```bash
   # Create a directory for the setup
   mkdir -p ~/noobots-setup
   cd ~/noobots-setup
   
   # Download the setup script
   curl -O https://noobots.vercel.app/api/download-script
   
   # Make it executable
   chmod +x setup-pi.sh
   ```

4. **Run the setup script** with:

   ```bash
   sudo ./setup-pi.sh
   ```

5. **Follow the prompts** in the setup script:
   - Enter the URL of the Noobots app (e.g., `https://noobots.vercel.app`)
   - The script will generate an API key for you - **send this key to Gabriel**
   
6. **Wait for confirmation**:
   - Gabriel will add the API key to the Vercel project
   - Once he confirms it's done, the connection system is ready!

7. **That's it!** The Raspberry Pi will now:
   - Start the Noobots server automatically on boot
   - Set up ngrok tunnels for WebSocket and TCP
   - Send connection details to your Vercel app

### 2. Starting and Stopping the Service

- **Check status**: `sudo systemctl status noobots`
- **Start manually**: `sudo systemctl start noobots`
- **Stop manually**: `sudo systemctl stop noobots`
- **View logs**: `sudo journalctl -u noobots -f`

### 3. Testing It Out

1. After setup is complete, visit your Noobots app in a web browser.
2. The app should automatically connect to your Raspberry Pi.
3. You should see the camera controls and be able to start/stop the camera.

## Troubleshooting

### Camera Not Working

1. Make sure the camera is enabled:
   ```bash
   sudo raspi-config
   ```
   Navigate to "Interface Options" > "Camera" and enable it, then reboot.

2. Check camera connection:
   ```bash
   vcgencmd get_camera
   ```
   Should show `supported=1 detected=1`

3. Check if libcamera is installed:
   ```bash
   libcamera-still --list-cameras
   ```

### Connection Issues

1. Check if the service is running:
   ```bash
   sudo systemctl status noobots
   ```

2. Check the ngrok tunnels:
   ```bash
   curl http://localhost:4040/api/tunnels
   ```

3. View the logs:
   ```bash
   sudo journalctl -u noobots -f
   cat /opt/noobots/server.log
   cat /opt/noobots/ngrok_http.log
   ```

## Manual Start (if needed)

If you prefer to start the service manually (not on boot):

1. **Disable autostart**:
   ```bash
   sudo systemctl disable noobots
   ```

2. **Start manually when needed**:
   ```bash
   sudo /opt/noobots/start-noobots.sh
   ```

3. **Stop manually**:
   ```bash
   sudo /opt/noobots/stop-noobots.sh
   ```

## How It Works

1. The setup script installs `libcamera-apps` for camera access and configures ngrok for tunneling.
2. When the service starts:
   - It launches a Node.js server on port 3001 (WebSocket)
   - It sets up a TCP stream server on port 3002
   - ngrok creates tunnels to both ports
   - The connection details are sent to your Vercel app via the API
3. Your Vercel app fetches these connection details when a user visits the site
4. The TCP streaming uses H264 encoding for efficient video streaming

## Advanced: Manual Setup

If you prefer to set up everything manually or the setup script doesn't work for your environment, follow the detailed manual instructions in the [README.md](https://noobots.vercel.app/api/download-readme) file.

## Support

If you encounter any issues, please reach out for support or check the logs for more detailed error information.

Happy streaming! 🤖 📹
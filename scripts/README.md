# Noobots Raspberry Pi Setup Guide

This guide will help you set up the Noobots server on your Raspberry Pi with TCP streaming using rpicam-apps/libcamera.

## Prerequisites

- Raspberry Pi with camera module installed
- Installed Raspberry Pi OS (formerly Raspbian)
- Internet connection
- Basic knowledge of terminal commands

## Quick Start

### 1. Download the setup script

Get the setup script from your Vercel deployment by running:

```bash
# Create a directory for the scripts
mkdir -p ~/noobots-setup
cd ~/noobots-setup

# Download the setup script
curl -O https://[YOUR-NOOBOTS-APP].vercel.app/api/download-script

# Download the server script (if needed for manual setup)
curl -O https://[YOUR-NOOBOTS-APP].vercel.app/api/download-server

# Make them executable
chmod +x setup-pi.sh
```

### 2. Run the setup script

```bash
sudo ./setup-pi.sh
```

Follow the prompts to complete the setup. The script will:

1. Install required packages (nodejs, libcamera-apps, ngrok)
2. Configure ngrok for external access
3. Set up the server for auto-start
4. Configure connection to your Vercel app

### 3. Start the server

If you chose not to enable autostart during setup, you can start the server manually:

```bash
sudo /opt/noobots/start-noobots.sh
```

## Manual Setup (If the script doesn't work)

If you prefer to set up the system manually, follow these steps:

### 1. Install dependencies

```bash
# Update package lists
sudo apt update

# Install Node.js if not already installed
sudo apt install -y nodejs npm

# Install libcamera-apps for camera access
sudo apt install -y libcamera-apps

# Install ngrok for tunneling
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list >/dev/null
sudo apt update
sudo apt install -y ngrok
```

### 2. Configure ngrok

Sign up for an account at https://ngrok.com/ and get your authtoken. Then configure ngrok:

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN
```

### 3. Create project directory

```bash
sudo mkdir -p /opt/noobots
sudo chown $USER:$USER /opt/noobots
cd /opt/noobots
```

### 4. Get server file

```bash
# Download server.js directly from your Vercel app
curl -O https://[YOUR-NOOBOTS-APP].vercel.app/api/download-server -o server.js

# OR if you have the simplified server-pi.js locally
# scp ~/server-pi.js pi@raspberry:/opt/noobots/server.js
```

### 5. Install Node.js dependencies

```bash
cd /opt/noobots
npm init -y
npm install ws express cors systeminformation
```

### 6. Create startup script

Create a file named `start-noobots.sh` with the following content:

```bash
#!/bin/bash
# Noobots auto-startup script

# Configuration
APP_URL="https://[YOUR-NOOBOTS-APP].vercel.app"
API_KEY="[YOUR-API-KEY]"
PROJECT_DIR="/opt/noobots"
LOG_FILE="$PROJECT_DIR/noobots.log"

# Clear previous log file
echo "--- Noobots startup $(date) ---" > "$LOG_FILE"

# Make sure we're in the project directory
cd "$PROJECT_DIR" || exit 1

# Kill any existing processes
pkill -f "node server.js" || true
pkill -f "ngrok" || true

# Start the Node.js server
echo "Starting Node.js server..." | tee -a "$LOG_FILE"
nohup node server.js > server.log 2>&1 &
NODE_PID=$!
echo "Node.js server started with PID: $NODE_PID" | tee -a "$LOG_FILE"

# Wait for server to start
sleep 5

# Start ngrok for WebSocket and TCP ports
echo "Starting ngrok for WebSocket port (3001)..." | tee -a "$LOG_FILE"
nohup ngrok http 3001 --log=stdout > ngrok_http.log 2>&1 &
NGROK_HTTP_PID=$!

echo "Starting ngrok for TCP port (3002)..." | tee -a "$LOG_FILE"
nohup ngrok tcp 3002 --log=stdout > ngrok_tcp.log 2>&1 &
NGROK_TCP_PID=$!

# Wait for ngrok to initialize
sleep 5

# Extract ngrok URLs
NGROK_HTTP_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | grep -o 'http[^"]*' | head -1)
NGROK_TCP_URL=$(curl -s http://localhost:4041/api/tunnels | grep -o '"public_url":"[^"]*' | grep -o 'tcp://[^"]*' | head -1)

# Convert HTTP URL to WebSocket URL
WS_URL=${NGROK_HTTP_URL/http:/ws:}
WSS_URL=${NGROK_HTTP_URL/https:/wss:}

# Update connection API
echo "Updating connection API..." | tee -a "$LOG_FILE"
curl -s -X POST "$APP_URL/api/connection" \
  -H "Content-Type: application/json" \
  -d "{\"wsUrl\":\"$WS_URL\",\"tcpUrl\":\"$NGROK_TCP_URL\",\"apiKey\":\"$API_KEY\"}"

# Display connection information
echo ""
echo "============================================================"
echo "🤖 NOOBOTS SERVER IS RUNNING"
echo "============================================================"
echo ""
echo "📡 WebSocket URL: $WS_URL"
echo "🎥 TCP Stream URL: $NGROK_TCP_URL"
echo ""
echo "✅ Connection info was automatically sent to: $APP_URL"
echo "🔄 The connection will be used automatically by the app"
echo "============================================================"
```

Make the script executable:

```bash
chmod +x start-noobots.sh
```

### 7. Create a stop script

```bash
echo '#!/bin/bash
echo "Stopping noobots services..."
pkill -f "node server.js" || true
pkill -f "ngrok" || true
echo "All services stopped."' > /opt/noobots/stop-noobots.sh

chmod +x /opt/noobots/stop-noobots.sh
```

## Troubleshooting

### Camera not working

1. Make sure the camera is enabled in raspi-config:
   ```bash
   sudo raspi-config
   ```
   Navigate to Interfacing Options > Camera and enable it. Reboot if needed.

2. Check camera connection:
   ```bash
   vcgencmd get_camera
   ```
   Should show `supported=1 detected=1`

### ngrok connection issues

1. Check if ngrok is running:
   ```bash
   ps aux | grep ngrok
   ```

2. Check ngrok logs:
   ```bash
   cat /opt/noobots/ngrok_http.log
   cat /opt/noobots/ngrok_tcp.log
   ```

3. Make sure your authtoken is valid.

### Server not starting

1. Check the server logs:
   ```bash
   cat /opt/noobots/server.log
   ```

2. Make sure Node.js is installed and working:
   ```bash
   node -v
   ```

3. Check if required packages are installed:
   ```bash
   cd /opt/noobots
   npm list
   ```

## Support

If you encounter any issues, please contact the project maintainer or file an issue on the project repository.

---

Happy streaming! 🎥 🤖
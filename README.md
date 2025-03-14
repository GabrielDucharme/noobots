# noobots

noobots provides a simple web interface to monitor and control your Raspberry Pi with TCP camera streaming using WebSockets. Built with [Next.js](https://nextjs.org).

## Features

- **TCP Camera Streaming**: High-performance video streaming with automatic fallback options
- **System Monitoring**: Real-time CPU, memory, temperature metrics
- **Remote Control**: Execute commands and control your Raspberry Pi remotely
- **Auto-Connection**: Raspberry Pi automatically connects to the app using ngrok tunnels
- **Simple Setup**: One-time setup process with automatic startup on boot

## Quick Setup

### 1. Deploy the web app

Deploy to Vercel or your preferred hosting platform. See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

### 2. Set up your Raspberry Pi

1. **Run these commands on your Pi**:
   ```bash
   # Create a directory
   mkdir -p ~/noobots-setup
   cd ~/noobots-setup
   
   # Download the setup script from your deployment
   curl -O https://your-deployment-url.com/api/download-script
   
   # Make it executable
   chmod +x setup-pi.sh
   
   # Run it
   sudo ./setup-pi.sh
   ```

2. **When prompted, enter your deployment URL**

3. **Important**: The script will generate an API key
   - Copy this API key
   - Add it to your deployment as an environment variable named `NOOBOTS_API_KEY`
   - Redeploy your app

4. **That's it!** Your Pi will automatically:
   - Connect to your app with TCP streaming
   - Start the service on boot
   - No manual URL sharing needed

For more detailed instructions:
- [SIMPLE_SETUP_INSTRUCTIONS.md](SIMPLE_SETUP_INSTRUCTIONS.md) - Quick Pi setup guide
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Development documentation
- [RASPBERRY_PI_GUIDE.md](RASPBERRY_PI_GUIDE.md) - Detailed Pi configuration

## Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/noobots.git
   cd noobots
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to view the interface.

## Managing the Pi Service

- **Check status**: `sudo systemctl status noobots`
- **Start**: `sudo systemctl start noobots`
- **Stop**: `sudo systemctl stop noobots`
- **See logs**: `sudo journalctl -u noobots -f`

## Troubleshooting

- Check camera is enabled: `sudo raspi-config` → Interface Options → Camera
- Check camera connection: `vcgencmd get_camera`
- Check logs: `cat /opt/noobots/server.log`

## How It Works

1. The setup script installs required packages and configures ngrok tunneling
2. A Node.js server runs on the Pi handling:
   - WebSocket communications (port 3001)
   - TCP stream server for camera (port 3002)
   - ngrok tunnels to both ports
   - Connection details sent to your app via API
3. The web app connects to the Pi using the connection details stored in the backend

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [JSMpeg Library](https://github.com/phoboslab/jsmpeg) (used for TCP video streaming)
- [ngrok](https://ngrok.com/docs) (used for tunneling)

## Deploy on Vercel

The easiest way to deploy the web app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

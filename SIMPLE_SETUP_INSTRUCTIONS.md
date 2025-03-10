# Noobots - Simple Setup Instructions

Just a few quick steps to get your Raspberry Pi connected with automatic TCP streaming\!

## Step-by-Step Setup (5 minutes)

1. **Run these commands on your Raspberry Pi**:
   ```bash
   # Create a directory
   mkdir -p ~/noobots-setup
   cd ~/noobots-setup
   
   # Download the setup script
   curl -O https://noobots.vercel.app/api/download-script
   
   # Make it executable
   chmod +x setup-pi.sh
   
   # Run it
   sudo ./setup-pi.sh
   ```

2. **When prompted**, enter:
   - URL: `https://noobots.vercel.app`

3. **IMPORTANT**: The script will generate an API key
   - Copy this API key and send it to me
   - I'll add it to the app configuration
   - Once I confirm it's added, you're all set\!

4. **That's it\!** The service will:
   - Start automatically when your Pi boots up
   - Connect to the app with TCP streaming
   - No more manual URL sharing needed\!

## If You Need to Stop/Start:

- **Check status**: `sudo systemctl status noobots`
- **Start**: `sudo systemctl start noobots`
- **Stop**: `sudo systemctl stop noobots`
- **See logs**: `sudo journalctl -u noobots -f`

## Having issues?

- Check camera is enabled: `sudo raspi-config` → Interface Options → Camera
- Check camera connection: `vcgencmd get_camera`
- Check logs: `cat /opt/noobots/server.log`
- Let me know if you need help\!

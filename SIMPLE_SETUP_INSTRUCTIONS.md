# Noobots - Simple Setup Instructions

Just a few quick steps to get your Raspberry Pi connected with automatic TCP streaming!

## Step-by-Step Setup (5 minutes)

1. **Run these commands on your Raspberry Pi**:
   ```bash
   # Create a directory
   mkdir -p ~/noobots-setup
   cd ~/noobots-setup
   
   # Download the setup script
   curl -O https://your-deployment-url.com/api/download-script
   
   # Make it executable
   chmod +x setup-pi.sh
   
   # Run it
   sudo ./setup-pi.sh
   ```

2. **When prompted**, enter:
   - URL: Enter your deployment URL (e.g., `https://your-noobots-app.vercel.app`)

3. **IMPORTANT**: The script will generate an API key
   - Copy this API key
   - Add it to your deployment as an environment variable named `NOOBOTS_API_KEY`
   - For Vercel: Go to Project Settings → Environment Variables → Add `NOOBOTS_API_KEY`
   - Redeploy your app for the key to take effect

4. **That's it!** The service will:
   - Start automatically when your Pi boots up
   - Connect to the app with TCP streaming
   - No more manual URL sharing needed!

## Managing Your Pi Service:

- **Check status**: `sudo systemctl status noobots`
- **Start**: `sudo systemctl start noobots`
- **Stop**: `sudo systemctl stop noobots`
- **See logs**: `sudo journalctl -u noobots -f`
- **Detailed logs**: `cat /opt/noobots/server.log`

## Having Issues?

### Camera Problems
- Check camera is enabled: `sudo raspi-config` → Interface Options → Camera
- Check camera connection: `vcgencmd get_camera` (should show `supported=1 detected=1`)
- Try replacing camera ribbon cable if detected=0
- For libcamera issues: `libcamera-still --list-cameras`

### Connection Problems
- Verify internet connection: `ping google.com`
- Check ngrok tunnels: `curl http://localhost:4040/api/tunnels`
- Ensure API key matches the one in your Vercel environment
- Try restarting the service: `sudo systemctl restart noobots`

### Performance Issues
- For smoother video: `sudo systemctl stop noobots && sudo /opt/noobots/start-noobots.sh --resolution 640x480`
- For CPU usage concerns: `sudo systemctl stop noobots && sudo /opt/noobots/start-noobots.sh --framerate 15`

If you continue to have issues, check the detailed logs and share them with the team for support.

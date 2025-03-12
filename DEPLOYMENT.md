# Noobots Deployment Guide

This guide explains how to deploy Noobots to production and set up your Raspberry Pi for remote access.

## Deployment Options

Noobots can be deployed to several platforms with a simple file-based storage approach for connection information.

### 1. Deploying to Vercel (Recommended)

#### Prerequisites
- GitHub account
- Vercel account
- A fork of the Noobots repository

#### Step 1: Connect Your Repository
1. Click "Add New..." → "Project" in your Vercel dashboard
2. Import your GitHub repository
3. In the configuration screen:
   - Set the Framework Preset to "Next.js"
   - Keep other defaults
4. Click "Deploy"

#### Step 2: Configure Environment Variables
1. After deployment, go to your project settings
2. Navigate to the "Environment Variables" tab
3. Add a new variable:
   - Name: `NOOBOTS_API_KEY`
   - Value: Create a secure key or leave empty (the Pi setup will generate one)
4. Click "Save"

#### Step 3: Redeploy
1. Go to the "Deployments" tab
2. Find your latest deployment
3. Click the three dots (⋮) and select "Redeploy"
4. Wait for the deployment to complete

### 2. Deploying to a Custom Server

If you prefer to use your own server:

#### Prerequisites
- Node.js 18+ server
- Domain name with SSL certificate

#### Step 1: Clone and Build
```bash
git clone https://github.com/yourusername/noobots.git
cd noobots
npm install
```

#### Step 2: Configure Environment
Create a `.env` file with:
```
NOOBOTS_API_KEY=your_secure_api_key
```

#### Step 3: Build and Start
```bash
npm run build
npm run start
```

#### Step 4: Set Up Reverse Proxy (Optional)
For production, use Nginx or Apache as a reverse proxy with SSL.

Example Nginx config:
```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Raspberry Pi Setup

After deployment, you need to set up your Raspberry Pi:

### Step 1: Run Setup Script
```bash
# On your Raspberry Pi
mkdir -p ~/noobots-setup
cd ~/noobots-setup

# Download the setup script from your deployment
curl -O https://your-deployment-url.com/api/download-script

# Make it executable
chmod +x setup-pi.sh

# Run it
sudo ./setup-pi.sh
```

### Step 2: Configure the Connection
1. When prompted, enter your deployment URL (e.g., `https://your-noobots-instance.vercel.app`)
2. The script will generate an API key
3. Copy this key to your Vercel environment variables (as `NOOBOTS_API_KEY`)
4. Redeploy your Vercel app for the change to take effect

### Step 3: Verify Connection
1. Visit your deployment URL
2. The Raspberry Pi should connect automatically
3. You should see system metrics and camera controls

## Troubleshooting Deployment

### Vercel Build Errors
- Check Next.js version compatibility
- Verify environment variables are set
- Check Vercel KV connection

### Connection Issues
- Verify API key matches between Pi and Vercel
- Check if ngrok tunnels are active on Pi
- Look for firewall or network issues

### Camera Stream Problems
- Verify camera is enabled and connected
- Try different streaming modes
- Check browser WebSocket and TCP support

## Security Recommendations

For production use, consider these security enhancements:

1. **Add Authentication:**
   - Implement user login with NextAuth.js
   - Restrict access to authenticated users

2. **Secure API Keys:**
   - Use environment variables for all sensitive data
   - Rotate API keys periodically

3. **Connection Encryption:**
   - Ensure WebSocket connections use WSS (WebSocket Secure)
   - Use HTTPS for all HTTP connections

4. **Rate Limiting:**
   - Add rate limiting to API endpoints
   - Prevent brute force attacks

## Scaling Considerations

For multiple Raspberry Pi devices:
- Create a unique API key for each device
- Modify the connection storage to support multiple devices
- Update the frontend to select between devices
# Noobots Developer Guide

This guide provides comprehensive instructions for setting up, developing, and deploying the Noobots project.

## Project Architecture

Noobots is a Next.js application that connects to a Raspberry Pi running a custom server script. Here's how it works:

1. **Frontend (Next.js)**
   - User interface for controlling and monitoring the Raspberry Pi
   - Real-time communication via WebSockets
   - Camera streaming with multiple fallback mechanisms
   
2. **Backend (Node.js on Raspberry Pi)**
   - WebSocket server for real-time communication
   - TCP stream server for high-performance camera streaming
   - System monitoring and command execution

3. **Connection Management**
   - Raspberry Pi creates tunnels using ngrok
   - Connection details stored in file-based storage
   - Clients fetch connection info from API

## Local Development Setup

### Prerequisites

- Node.js 18+ and npm
- Raspberry Pi with camera (for testing)

### Setting Up Development Environment

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/noobots.git
   cd noobots
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env.local` file with:
   ```
   # Required for API key verification
   NOOBOTS_API_KEY=your_development_api_key
   ```

4. **Run development servers:**
   ```bash
   # Run Next.js development server (in one terminal)
   npm run dev
   
   # Run WebSocket server (in another terminal)
   npm run server
   ```

5. **Access the app:**
   Open [http://localhost:3000](http://localhost:3000)

## Project Structure

- **`/app`** - Next.js app directory structure
  - **`/api`** - API route handlers
  - **`/components`** - React components
  - **`/hooks`** - Custom React hooks
  - **`page.js`** - Main application page
  
- **`/scripts`** - Scripts for Raspberry Pi setup
  - **`server-pi.js`** - Raspberry Pi server
  - **`setup-pi.sh`** - Automated setup script
  
- **`server.js`** - Local WebSocket development server

## Key Components

### WebSocket Communication

The `useWebSocket.js` hook handles WebSocket communication, with these key features:
- Connection establishment and maintenance
- Automatic reconnection with exponential backoff
- Message sending and receiving
- Status tracking and error handling

### Camera Streaming

The project implements a tiered camera streaming approach:
1. **TCP Streaming (JSMpegPlayer.js)**
   - H.264 video over TCP for best performance
   - Uses JSMpeg library for client-side decoding
   
2. **HTTP Fallback**
   - MJPEG stream when TCP isn't available
   
3. **Snapshot Mode**
   - Individual JPEG images at regular intervals
   - Lowest performance but highest compatibility

### Raspberry Pi Integration

The Pi server (`server-pi.js`) provides:
- System metric collection (CPU, memory, temperature)
- Command execution (shutdown, reboot)
- Camera control with multiple streaming options
- Log collection and filtering

## Testing and Debugging

1. **Development Tools:**
   - Press `Ctrl+D` to toggle the Debug Panel
   - Log Console displays server messages
   
2. **Testing with a Raspberry Pi:**
   - Follow setup in SIMPLE_SETUP_INSTRUCTIONS.md
   - Use your development URL instead of production
   - Set matching API key in your `.env.local`

3. **Common Issues:**
   - WebSocket connection errors (check network/firewall)
   - Camera streaming issues (check browser compatibility)
   - API key mismatches (verify environment variables)

## Deployment

### Vercel Deployment

1. **Set up environment variables:**
   - Add `NOOBOTS_API_KEY=your_api_key_here` in Vercel's environment variables panel

2. **Deploy your project:**
   ```bash
   # Manual deployment
   vercel
   
   # Production deployment
   vercel --prod
   ```

### Custom Deployment

For non-Vercel deployments, you'll need:
1. Set the `NOOBOTS_API_KEY` environment variable
2. Ensure your deployment supports WebSockets
3. Create a persistent directory for connection data storage

## Code Style Guidelines

- **Formatting:** 2-space indentation, single quotes, semicolons
- **Components:** Functional with hooks, 'use client' directive when needed
- **Naming:** PascalCase for components, camelCase for functions/variables
- **Error Handling:** Use try/catch blocks, log errors with console.error

## Contributing

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Run ESLint: `npm run lint`
4. Test thoroughly
5. Submit a pull request

## Performance Optimization

For optimal performance:
- Use TCP streaming when possible
- Consider lower resolution for smoother streaming
- Watch for excessive reconnection attempts
- Enable the debug panel to monitor performance

## Security Considerations

- API keys should be kept secret
- Consider adding user authentication for production
- Verify camera stream requests
- Don't expose sensitive system information
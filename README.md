# noobots

This is a [Next.js](https://nextjs.org) project bootstrapped with [create-next-app](https://github.com/vercel/next.js/tree/canary/packages/create-next-app). noobots provides a simple web interface to monitor and control your Raspberry Pi using WebSockets.

## Getting Started

### Running the Development Server

1. **Clone the repository:**

   ```bash
   git clone https://github.com/yourusername/noobots.git
   cd noobots
   ```

2. **Install dependencies:**

   ```bash
   npm install
   # or
   yarn
   ```

3. **Run the development server:**

   ```bash
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to view the interface.

## Connecting Your Raspberry Pi as the Server

Follow these instructions to set up and connect your Raspberry Pi to run the noobots server and make it available for control and monitoring.

### 1. Install Required Software

Make sure your Raspberry Pi's package index is up to date and install Node.js, npm, and PM2 (used for process management):

```bash
sudo apt update
sudo apt install nodejs npm
sudo npm install -g pm2
```

### 2. Clone and Set Up the Repository on Your Raspberry Pi

Clone the repository onto your Raspberry Pi and install its dependencies:

```bash
git clone https://github.com/yourusername/noobots.git
cd noobots
npm install
```

### 3. Configure the Environment (Optional)

If needed, set the WebSocket URL so that the client correctly connects to your Raspberry Pi. Create a `.env.local` file at the root of the project with the following content (adjust the IP address if necessary):

```env
NEXT_PUBLIC_WS_URL=ws://your-raspberry-pi-ip:3000/api/ws
```

> Replace `your-raspberry-pi-ip` with the actual IP address of your Raspberry Pi.

### 4. Start the noobots Server

You have two options to start the server on your Raspberry Pi:

#### a. Using PM2 (Recommended for Production)

Start the noobots server with PM2 so that it runs in the background and restarts automatically if needed:

```bash
pm2 start npm --name "noobots" -- start
pm2 save
```

#### b. Running the Server Directly

Alternatively, you can run the built-in server script which starts the WebSocket server (by default, it listens on port 3001):

```bash
npm run server
```

### 5. Access the Interface

Once the server is running, open your browser and navigate to:

```
http://<your-raspberry-pi-ip>:3000
```

This page shows the web interface where you can monitor system metrics (like CPU load, memory usage, and temperature) and issue commands (e.g., reboot or shutdown) to your Raspberry Pi.

## Learn More

To learn more about Next.js and additional development guidelines, check out the following resources:

- [Next.js Documentation](https://nextjs.org/docs) – Explore Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) – An interactive tutorial for beginners.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme). For more details, refer to the [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying).

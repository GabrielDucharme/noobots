#!/bin/bash
# Auto-setup script for noobots Raspberry Pi
# This script installs dependencies and sets up the automatic startup

# Text colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Banner
echo -e "${BLUE}"
echo "    _   __            __          __      "
echo "   / | / /___  ____  / /_  ____  / /______"
echo "  /  |/ / __ \/ __ \/ __ \/ __ \/ __/ ___/"
echo " / /|  / /_/ / /_/ / /_/ / /_/ / /_(__  ) "
echo "/_/ |_/\____/\____/_.___/\____/\__/____/  "
echo -e "                                        ${NC}"
echo -e "${YELLOW}Raspberry Pi Setup Script${NC}"
echo ""

# Check if running as root and restart with sudo if needed
if [ "$EUID" -ne 0 ]; then
  echo -e "${YELLOW}This script requires root privileges.${NC}"
  echo "Restarting with sudo..."
  sudo "$0" "$@"
  exit $?
fi

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Function to get the URL of the deployed app
get_app_url() {
  local default_url=""
  local url=""
  
  # Try to read from previous config
  if [ -f "/etc/noobots/config" ]; then
    source /etc/noobots/config
    default_url="$APP_URL"
  fi
  
  # Prompt for URL
  read -p "Enter your Noobots app URL (e.g. https://noobots.vercel.app) [$default_url]: " url
  
  # Use default if empty
  if [ -z "$url" ]; then
    url="$default_url"
  fi
  
  # Remove trailing slash if any
  url="${url%/}"
  
  echo "$url"
}

# Function to get API key
get_api_key() {
  local default_key=""
  local key=""
  
  # Try to read from previous config
  if [ -f "/etc/noobots/config" ]; then
    source /etc/noobots/config
    default_key="$API_KEY"
  fi
  
  # Prompt for API key
  if [ -n "$default_key" ]; then
    read -p "Enter your Noobots API key (leave empty to keep existing key): " key
    if [ -z "$key" ]; then
      key="$default_key"
    fi
  else
    # Generate a random key if none exists
    local random_key=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)
    read -p "Enter your Noobots API key (leave empty to use generated key): " key
    if [ -z "$key" ]; then
      key="$random_key"
      echo -e "${YELLOW}Generated API key: $key${NC}"
      echo -e "${YELLOW}Make sure to add this key to your Vercel environment variables as NOOBOTS_API_KEY${NC}"
    fi
  fi
  
  echo "$key"
}

# Check and install required packages
install_packages() {
  echo -e "\n${BLUE}Checking required packages...${NC}"
  
  # Update package lists
  echo "Updating package lists..."
  apt-get update > /dev/null
  
  # List of required packages
  local packages=("nodejs" "npm" "libcamera-apps" "ngrok")
  
  for pkg in "${packages[@]}"; do
    echo -n "Checking for $pkg: "
    
    if [ "$pkg" = "ngrok" ]; then
      # Special case for ngrok
      if command_exists ngrok; then
        echo -e "${GREEN}Installed${NC}"
      else
        echo -e "${YELLOW}Missing${NC}"
        echo "Installing ngrok..."
        curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
        echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | tee /etc/apt/sources.list.d/ngrok.list >/dev/null
        apt-get update > /dev/null
        apt-get install -y ngrok > /dev/null
      fi
    elif [ "$pkg" = "libcamera-apps" ]; then
      # Check for libcamera-vid command rather than package
      if command_exists libcamera-vid; then
        echo -e "${GREEN}Installed${NC}"
      else
        echo -e "${YELLOW}Missing${NC}"
        echo "Installing libcamera-apps..."
        apt-get install -y libcamera-apps > /dev/null
      fi
    else
      # Normal package check and install
      if command_exists "$pkg"; then
        echo -e "${GREEN}Installed${NC}"
      else
        echo -e "${YELLOW}Missing${NC}"
        echo "Installing $pkg..."
        apt-get install -y "$pkg" > /dev/null
      fi
    fi
  done
  
  # Check node version and upgrade if needed
  if command_exists node; then
    local node_version=$(node -v | cut -d 'v' -f 2)
    local node_major_version=$(echo "$node_version" | cut -d '.' -f 1)
    
    if [ "$node_major_version" -lt 16 ]; then
      echo -e "${YELLOW}Node.js version $node_version is too old. Upgrading to latest LTS...${NC}"
      curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null
      apt-get install -y nodejs > /dev/null
    fi
  fi
}

# Configure ngrok
configure_ngrok() {
  echo -e "\n${BLUE}Configuring ngrok...${NC}"
  
  # Check if ngrok is already configured
  if [ -f "$HOME/.ngrok2/ngrok.yml" ] || [ -f "$HOME/.config/ngrok/ngrok.yml" ]; then
    echo -e "${GREEN}ngrok already configured.${NC}"
    return 0
  fi
  
  # Use hardcoded ngrok token
  local ngrok_token="2sr6uahUZCicouJYhDmjqLPBOT5_7E5PCHGfH6b53xkAjrdJb"
  
  # Configure ngrok
  ngrok config add-authtoken "$ngrok_token" > /dev/null
  
  echo -e "${GREEN}ngrok configured automatically!${NC}"
}

# Create startup script
create_startup_script() {
  echo -e "\n${BLUE}Creating startup script...${NC}"
  
  # Get project directory
  local project_dir="/opt/noobots"
  read -p "Enter the path to install noobots [$project_dir]: " input_dir
  if [ -n "$input_dir" ]; then
    project_dir="$input_dir"
  fi
  
  # Create directory if it doesn't exist
  if [ ! -d "$project_dir" ]; then
    echo "Creating directory $project_dir..."
    mkdir -p "$project_dir"
  fi
  
  # Get app URL and API key
  local app_url=$(get_app_url)
  local api_key=$(get_api_key)
  
  # Create config directory if it doesn't exist
  if [ ! -d "/etc/noobots" ]; then
    mkdir -p "/etc/noobots"
  fi
  
  # Save configuration
  cat > /etc/noobots/config << EOF
# Noobots Configuration
APP_URL="$app_url"
API_KEY="$api_key"
PROJECT_DIR="$project_dir"
EOF
  
  # Create the startup script
  cat > "$project_dir/start-noobots.sh" << 'EOF'
#!/bin/bash
# Noobots auto-startup script with ngrok tunneling

# Load configuration
source /etc/noobots/config

# Set up logging
LOG_FILE="$PROJECT_DIR/noobots.log"
TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")

# Function for timestamped logging
log() {
  echo "[$TIMESTAMP] $1" | tee -a "$LOG_FILE"
}

# Clear previous log file
echo "--- Noobots startup $TIMESTAMP ---" > "$LOG_FILE"

# Make sure we're in the project directory
cd "$PROJECT_DIR" || {
  log "ERROR: Could not change to project directory $PROJECT_DIR"
  exit 1
}

# Kill any existing processes
log "Cleaning up existing processes..."
pkill -f "node server.js" || true
pkill -f "ngrok" || true

# Start the Node.js server in background
log "Starting Node.js server..."
nohup node server.js > server.log 2>&1 &
NODE_PID=$!
log "Node.js server started with PID: $NODE_PID"

# Wait for server to start
log "Waiting for server to initialize (5 seconds)..."
sleep 5

# Check if server is running
if ! ps -p $NODE_PID > /dev/null; then
  log "ERROR: Node.js server failed to start. Check server.log for details."
  exit 1
fi

# Start ngrok for both HTTP and TCP ports
log "Starting ngrok for WebSocket port (3001)..."
nohup ngrok http 3001 --log=stdout > ngrok_http.log 2>&1 &
NGROK_HTTP_PID=$!

log "Starting ngrok for TCP port (3002)..."
nohup ngrok tcp 3002 --log=stdout > ngrok_tcp.log 2>&1 &
NGROK_TCP_PID=$!

# Wait for ngrok to initialize
log "Waiting for ngrok to initialize (5 seconds)..."
sleep 5

# Extract ngrok URLs
log "Extracting ngrok URLs..."

# Use curl to get ngrok tunnel info
NGROK_HTTP_URL=$(curl -s http://localhost:4040/api/tunnels | grep -o '"public_url":"[^"]*' | grep -o 'http[^"]*' | head -1)
NGROK_TCP_URL=$(curl -s http://localhost:4041/api/tunnels | grep -o '"public_url":"[^"]*' | grep -o 'tcp://[^"]*' | head -1)

if [ -z "$NGROK_HTTP_URL" ] || [ -z "$NGROK_TCP_URL" ]; then
  log "WARNING: Could not extract ngrok URLs automatically. Check ngrok dashboard at http://localhost:4040."
else
  # Convert HTTP URL to WebSocket URL
  WS_URL=${NGROK_HTTP_URL/http:/ws:}
  WSS_URL=${NGROK_HTTP_URL/https:/wss:}
  
  # Update connection API
  log "Updating connection API..."
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
  echo "💻 Service information:"
  echo "- Node server PID: $NODE_PID"
  echo "- ngrok HTTP PID: $NGROK_HTTP_PID"
  echo "- ngrok TCP PID: $NGROK_TCP_PID"
  echo ""
  echo "✅ Connection info was automatically sent to: $APP_URL"
  echo "🔄 The connection will be used automatically by the app"
  echo ""
  echo "❌ To stop the server:"
  echo "   $PROJECT_DIR/stop-noobots.sh"
  echo "============================================================"
  
  # Log the same info to the log file
  log "WebSocket URL: $WS_URL"
  log "TCP Stream URL: $NGROK_TCP_URL"
  log "Connection info sent to: $APP_URL"
fi

# Create a stop script
cat > "$PROJECT_DIR/stop-noobots.sh" << 'STOPEOF'
#!/bin/bash
echo "Stopping noobots services..."
pkill -f "node server.js" || true
pkill -f "ngrok" || true
echo "All services stopped."
STOPEOF

# Make the stop script executable
chmod +x "$PROJECT_DIR/stop-noobots.sh"

log "Startup completed. Use $PROJECT_DIR/stop-noobots.sh to stop all services."
EOF
  
  # Make the startup script executable
  chmod +x "$project_dir/start-noobots.sh"
  
  # Create systemd service file for auto-start on boot
  cat > /etc/systemd/system/noobots.service << EOF
[Unit]
Description=Noobots Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$project_dir
ExecStart=$project_dir/start-noobots.sh
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
  
  # Reload systemd
  systemctl daemon-reload
  
  echo -e "${GREEN}Startup script created at $project_dir/start-noobots.sh${NC}"
  echo -e "${GREEN}Systemd service created at /etc/systemd/system/noobots.service${NC}"
}

# Download server files
download_server_files() {
  echo -e "\n${BLUE}Downloading server files...${NC}"
  
  # Get project directory from config
  source /etc/noobots/config
  
  # Ask for Git repository URL or download URL
  read -p "Enter Git repository URL or download URL (leave empty to skip): " repo_url
  
  if [ -z "$repo_url" ]; then
    # Manual file download
    echo "Skipping automatic download. You will need to place the server.js file manually."
    
    # Create a placeholder server.js if it doesn't exist
    if [ ! -f "$PROJECT_DIR/server.js" ]; then
      echo "Creating placeholder server.js. Remember to replace it with the actual file."
      cat > "$PROJECT_DIR/server.js" << 'EOF'
// Placeholder server.js
// Replace this with the actual server.js file from your Noobots project
console.log('Noobots server placeholder. Please replace with the actual server.js file.');
process.exit(1);
EOF
    fi
    
    return 0
  fi
  
  # If it's a Git repository, clone it
  if [[ "$repo_url" == *".git"* ]]; then
    echo "Cloning Git repository..."
    if command_exists git; then
      git clone "$repo_url" "$PROJECT_DIR/temp" --depth 1
      # Move server.js file if it exists
      if [ -f "$PROJECT_DIR/temp/server.js" ]; then
        mv "$PROJECT_DIR/temp/server.js" "$PROJECT_DIR/"
        echo -e "${GREEN}server.js downloaded successfully!${NC}"
      else
        echo -e "${RED}server.js not found in repository.${NC}"
      fi
      # Clean up
      rm -rf "$PROJECT_DIR/temp"
    else
      echo -e "${RED}Git not installed. Please install git or download the files manually.${NC}"
    fi
  else
    # Otherwise download directly
    echo "Downloading server.js..."
    curl -s -o "$PROJECT_DIR/server.js" "$repo_url"
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}server.js downloaded successfully!${NC}"
    else
      echo -e "${RED}Failed to download server.js. You'll need to add it manually.${NC}"
    fi
  fi
  
  # Install node dependencies
  echo "Installing Node.js dependencies..."
  cd "$PROJECT_DIR" && npm init -y > /dev/null && npm install ws express cors systeminformation > /dev/null
  echo -e "${GREEN}Node.js dependencies installed!${NC}"
}

# Enable or disable autostart
configure_autostart() {
  echo -e "\n${BLUE}Configuring autostart...${NC}"
  
  read -p "Do you want Noobots to start automatically on boot? (y/n) [y]: " autostart
  autostart=${autostart:-y}
  
  if [[ "$autostart" =~ ^[Yy]$ ]]; then
    systemctl enable noobots.service
    echo -e "${GREEN}Autostart enabled. Noobots will start automatically on boot.${NC}"
  else
    systemctl disable noobots.service
    echo -e "${YELLOW}Autostart disabled. You'll need to start Noobots manually.${NC}"
  fi
}

# Main installation process
main() {
  echo -e "\n${BLUE}Starting Noobots Raspberry Pi setup...${NC}"
  
  # Install required packages
  install_packages
  
  # Configure ngrok
  configure_ngrok
  
  # Create startup script
  create_startup_script
  
  # Download server files
  download_server_files
  
  # Configure autostart
  configure_autostart
  
  # Final instructions
  echo -e "\n${GREEN}Setup completed!${NC}"
  echo -e "${YELLOW}To start Noobots server:${NC}"
  echo -e "  ${BLUE}sudo systemctl start noobots${NC}  (if autostart is enabled)"
  echo -e "  ${BLUE}sudo /opt/noobots/start-noobots.sh${NC}  (manual start)"
  echo -e ""
  echo -e "${YELLOW}To stop Noobots server:${NC}"
  echo -e "  ${BLUE}sudo systemctl stop noobots${NC}  (if autostart is enabled)"
  echo -e "  ${BLUE}sudo /opt/noobots/stop-noobots.sh${NC}  (manual stop)"
  echo -e ""
  echo -e "${YELLOW}To check logs:${NC}"
  echo -e "  ${BLUE}sudo journalctl -u noobots${NC}  (service logs)"
  echo -e "  ${BLUE}cat /opt/noobots/noobots.log${NC}  (application logs)"
  echo -e ""
  echo -e "${GREEN}Your Raspberry Pi is now configured to connect to your Noobots app!${NC}"
  echo -e "${GREEN}The connection URL will be automatically updated in your Vercel app.${NC}"
}

# Run the main function
main
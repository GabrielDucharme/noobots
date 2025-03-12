import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// This route can't be static since it uses dynamic data
export const dynamic = 'force-dynamic';

// Simple file-based storage for connection information
const STORAGE_DIR = path.join(process.cwd(), '.connection-data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'connection-info.json');

// Ensure the directory exists
try {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
} catch (err) {
  console.error('Error creating storage directory:', err);
}

// Helper function to read connection info
function getConnectionInfo() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return null;
    }
    const data = fs.readFileSync(STORAGE_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading connection info:', err);
    return null;
  }
}

// Helper function to save connection info
function saveConnectionInfo(info) {
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(info, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Error saving connection info:', err);
    return false;
  }
}

export async function GET() {
  try {
    // Get connection info from file storage
    const connectionInfo = getConnectionInfo();
    
    return NextResponse.json(connectionInfo || { 
      wsUrl: null, 
      tcpUrl: null, 
      lastUpdated: null,
      status: 'offline'
    });
  } catch (error) {
    console.error('Error fetching connection info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connection info' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { wsUrl, tcpUrl, apiKey } = await request.json();
    
    // Verify API key - fallback to a default if not set in env
    const configuredApiKey = process.env.NOOBOTS_API_KEY || 'default-dev-key';
    if (apiKey !== configuredApiKey) {
      console.error('Invalid API key');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Update connection info
    const connectionInfo = {
      wsUrl,
      tcpUrl,
      lastUpdated: new Date().toISOString(),
      status: 'online'
    };
    
    const saved = saveConnectionInfo(connectionInfo);
    if (!saved) {
      return NextResponse.json(
        { error: 'Failed to save connection info' },
        { status: 500 }
      );
    }
    
    console.info('Connection info updated:', connectionInfo);
    
    return NextResponse.json({ success: true, message: 'Connection info updated successfully' });
  } catch (error) {
    console.error('Error updating connection info:', error);
    return NextResponse.json(
      { error: 'Failed to update connection info', details: error.message },
      { status: 500 }
    );
  }
}
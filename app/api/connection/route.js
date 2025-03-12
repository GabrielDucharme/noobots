import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv'; // We'll use Vercel KV instead of Edge Config as it's more stable

// This route can't be static since it uses dynamic data from KV
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get connection info from KV store
    const connectionInfo = await kv.get('connectionInfo');
    
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
    
    // Verify API key
    if (apiKey !== process.env.NOOBOTS_API_KEY) {
      console.log('Invalid API key');
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
    
    await kv.set('connectionInfo', connectionInfo);
    console.log('Connection info updated:', connectionInfo);
    
    return NextResponse.json({ success: true, message: 'Connection info updated successfully' });
  } catch (error) {
    console.error('Error updating connection info:', error);
    return NextResponse.json(
      { error: 'Failed to update connection info', details: error.message },
      { status: 500 }
    );
  }
}
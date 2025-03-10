import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// This API endpoint will allow downloading the setup script for the Raspberry Pi
export async function GET() {
  try {
    // Get the path to the setup script
    const scriptPath = path.join(process.cwd(), 'scripts', 'setup-pi.sh');
    
    // Read the script file
    const script = fs.readFileSync(scriptPath, 'utf-8');
    
    // Return the script with appropriate headers
    return new NextResponse(script, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="setup-pi.sh"'
      }
    });
  } catch (error) {
    console.error('Error serving setup script:', error);
    return NextResponse.json(
      { error: 'Failed to serve setup script' },
      { status: 500 }
    );
  }
}
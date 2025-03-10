import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// This API endpoint will allow downloading the README file for the Raspberry Pi
export async function GET() {
  try {
    // Get the path to the README file
    const readmePath = path.join(process.cwd(), 'scripts', 'README.md');
    
    // Read the README file
    const readme = fs.readFileSync(readmePath, 'utf-8');
    
    // Return the README with appropriate headers
    return new NextResponse(readme, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Content-Disposition': 'attachment; filename="NOOBOTS_PI_README.md"'
      }
    });
  } catch (error) {
    console.error('Error serving README file:', error);
    return NextResponse.json(
      { error: 'Failed to serve README file' },
      { status: 500 }
    );
  }
}
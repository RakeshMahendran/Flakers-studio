import { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Forward the request to the Python backend SSE endpoint
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${backendUrl}/scraping/preview-content-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward authorization header if present
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')!
        })
      },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return new Response(
        JSON.stringify(errorData),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Return the streaming response
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    });
    
  } catch (error) {
    console.error('Error streaming preview content:', error);
    return new Response(
      JSON.stringify({ detail: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

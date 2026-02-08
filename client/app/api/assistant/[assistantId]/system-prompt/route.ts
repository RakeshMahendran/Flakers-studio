import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string }> }
) {
  try {
    const { assistantId } = await params;
    
    // Forward the request to the Python backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${backendUrl}/assistant/${assistantId}/system-prompt`, {
      method: 'GET',
      headers: {
        // Forward authorization header if present
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')!
        })
      }
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      return NextResponse.json(errorData, { status: response.status });
    }
    
    const data = await response.json();
    return NextResponse.json(data);
    
  } catch (error) {
    console.error('Error fetching system prompt:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}

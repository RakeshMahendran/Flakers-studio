import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    
    // Forward the request to the Python backend
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    
    const response = await fetch(`${backendUrl}/api/v1/status/job/${jobId}`, {
      method: 'GET',
      headers: {
        // Forward authorization header if present
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')!
        })
      }
    });
    
    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        return NextResponse.json(errorData, { status: response.status });
      }

      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { detail: errorText || 'Request failed' },
        { status: response.status }
      );
    }
    
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      return NextResponse.json(data);
    }

    const text = await response.text();
    return new Response(text, {
      status: 200,
      headers: { 'Content-Type': contentType || 'text/plain' }
    });
    
  } catch (error) {
    console.error('Error fetching job status:', error);
    return NextResponse.json(
      { detail: 'Internal server error' },
      { status: 500 }
    );
  }
}
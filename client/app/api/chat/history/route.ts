import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/chat/history
 * Retrieve conversation history for a session
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('session_id');
    const assistantId = searchParams.get('assistant_id');

    if (!sessionId && !assistantId) {
      return NextResponse.json(
        { error: 'Either session_id or assistant_id is required' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const url = new URL(`${backendUrl}/api/chat/history`);
    
    if (sessionId) {
      url.searchParams.append('session_id', sessionId);
    }
    if (assistantId) {
      url.searchParams.append('assistant_id', assistantId);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch conversation history' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

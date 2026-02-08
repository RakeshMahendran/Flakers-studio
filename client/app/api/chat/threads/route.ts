import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/chat/threads
 * Retrieve conversation threads for an assistant
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const assistantId = searchParams.get('assistant_id');

    if (!assistantId) {
      return NextResponse.json(
        { error: 'assistant_id is required' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL || 'http://localhost:8000';
    const url = new URL(`${backendUrl}/api/chat/threads`);
    url.searchParams.append('assistant_id', assistantId);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Failed to fetch conversation threads' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching conversation threads:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

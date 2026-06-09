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
    // Backend mounts the chat router at `/chat`, not `/api/chat`
    // (see server/main.py: app.include_router(chat.router, prefix="/chat", ...)).
    const url = new URL(`${backendUrl}/chat/threads`);
    url.searchParams.append('assistant_id', assistantId);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Forward the caller's Authorization header so the backend's
        // `get_current_tenant` dependency can resolve the tenant.
        ...(request.headers.get('authorization') && {
          'Authorization': request.headers.get('authorization')!,
        }),
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

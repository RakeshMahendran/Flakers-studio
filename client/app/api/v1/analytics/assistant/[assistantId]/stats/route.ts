import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const { assistantId } = await params;
    const { search } = new URL(request.url);
    const response = await fetch(
      `${BACKEND_URL}/api/v1/analytics/assistant/${assistantId}/stats${search}`,
      {
        method: "GET",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      }
    );
    const data = await response.json().catch(() => ({ detail: "Failed to fetch assistant stats" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /api/v1/analytics/assistant/[id]/stats:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const { assistantId } = await params;
    const response = await fetch(`${BACKEND_URL}/assistant/${assistantId}/sync-status`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to sync status" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying POST /assistant/[id]/sync-status:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

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
    const response = await fetch(`${BACKEND_URL}/assistant/${assistantId}/api-keys`, {
      method: "GET",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to fetch API keys" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /assistant/[id]/api-keys:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

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
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${BACKEND_URL}/assistant/${assistantId}/api-keys`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({ detail: "Failed to create API key" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying POST /assistant/[id]/api-keys:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

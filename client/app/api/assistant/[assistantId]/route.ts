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
    const response = await fetch(`${BACKEND_URL}/assistant/${assistantId}`, {
      method: "GET",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to fetch assistant" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /assistant/[id]:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
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
    const response = await fetch(`${BACKEND_URL}/assistant/${assistantId}`, {
      method: "PUT",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({ detail: "Failed to update assistant" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying PUT /assistant/[id]:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const { assistantId } = await params;
    const response = await fetch(`${BACKEND_URL}/assistant/${assistantId}`, {
      method: "DELETE",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to delete assistant" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying DELETE /assistant/[id]:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

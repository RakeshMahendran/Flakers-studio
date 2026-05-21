import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }

    const { projectId } = await params;
    const { search } = new URL(request.url);
    const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}${search}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({ detail: "Failed to fetch project" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /api/projects/[projectId]:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }

    const { projectId } = await params;
    const { search } = new URL(request.url);
    const response = await fetch(`${BACKEND_URL}/api/projects/${projectId}${search}`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({ detail: "Failed to delete project" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying DELETE /api/projects/[projectId]:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

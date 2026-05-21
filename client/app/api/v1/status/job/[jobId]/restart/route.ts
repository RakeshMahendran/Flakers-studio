import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const { jobId } = await params;
    const response = await fetch(`${BACKEND_URL}/api/v1/status/job/${jobId}/restart`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to restart job" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying POST /api/v1/status/job/[id]/restart:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

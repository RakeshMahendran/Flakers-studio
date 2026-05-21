import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const response = await fetch(`${BACKEND_URL}/auth/tenant/members`, {
      method: "GET",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to fetch members" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /auth/tenant/members:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

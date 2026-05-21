import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${BACKEND_URL}/auth/change-password`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({ detail: "Failed to change password" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying POST /auth/change-password:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

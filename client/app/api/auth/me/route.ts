import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const response = await fetch(`${BACKEND_URL}/auth/me`, {
      method: "GET",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({ detail: "Failed to fetch profile" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /auth/me:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${BACKEND_URL}/auth/me`, {
      method: "PATCH",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({ detail: "Failed to update profile" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying PATCH /auth/me:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

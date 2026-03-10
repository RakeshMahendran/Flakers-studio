import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    const response = await fetch(`${backendUrl}/auth/me`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({ detail: "Failed to fetch profile" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying /auth/me:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

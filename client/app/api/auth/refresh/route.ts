import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

    const response = await fetch(`${backendUrl}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({ detail: "Token refresh failed" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying refresh:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

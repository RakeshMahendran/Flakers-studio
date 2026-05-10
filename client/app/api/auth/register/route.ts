import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/register
 *
 * Frontend proxy for signup. If the backend hasn't shipped a register
 * endpoint yet, we return 501 — the registration page treats 501/404 as
 * "queued" and shows the "Check your email" confirmation flow.
 */
export async function POST(request: NextRequest) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${backendUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying /auth/register:", error);
    return NextResponse.json(
      { detail: "Registration is not yet available." },
      { status: 501 }
    );
  }
}

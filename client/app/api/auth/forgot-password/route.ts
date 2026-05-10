import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/forgot-password
 *
 * Frontend proxy / stub for the password reset flow. If the backend
 * exposes `/auth/forgot-password`, we proxy to it. If not, we return
 * 200 OK with a queued payload so the UI can present the
 * account-enumeration-safe "If an account exists, a reset link is on
 * the way" state.
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
    const response = await fetch(`${backendUrl}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });

    // If the backend hasn't implemented this yet, fall through to the stub
    // response below so the UX is still consistent.
    if (response.status === 404 || response.status === 405 || response.status === 501) {
      return NextResponse.json(
        { status: "queued", detail: "Reset request accepted." },
        { status: 200 }
      );
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying /auth/forgot-password:", error);
    // Network failure to the backend — still respond 200 so we never leak
    // account-existence based on the response status.
    return NextResponse.json(
      { status: "queued", detail: "Reset request accepted." },
      { status: 200 }
    );
  }
}

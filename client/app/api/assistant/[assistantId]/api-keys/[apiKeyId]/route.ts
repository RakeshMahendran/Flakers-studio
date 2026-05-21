import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ assistantId: string; apiKeyId: string }> }
) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }
    const { assistantId, apiKeyId } = await params;
    const response = await fetch(
      `${BACKEND_URL}/assistant/${assistantId}/api-keys/${apiKeyId}`,
      {
        method: "DELETE",
        headers: { Authorization: authHeader, "Content-Type": "application/json" },
      }
    );
    const data = await response.json().catch(() => ({ detail: "Failed to revoke API key" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying DELETE /assistant/[id]/api-keys/[keyId]:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

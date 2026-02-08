import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const assistantId = searchParams.get("assistant_id");

    if (!assistantId) {
      return new Response(
        JSON.stringify({ detail: "assistant_id is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

    const response = await fetch(
      `${backendUrl}/api/projects/website/ingest?assistant_id=${assistantId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(request.headers.get("authorization") && {
            Authorization: request.headers.get("authorization")!,
          }),
        },
      }
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ detail: "Unknown error" }));
      return new Response(JSON.stringify(errorData), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the SSE response
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error starting ingestion:", error);
    return new Response(JSON.stringify({ detail: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

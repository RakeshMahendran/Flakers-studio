import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

    const response = await fetch(`${backendUrl}/api/projects/website/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("authorization") && {
          Authorization: request.headers.get("authorization")!,
        }),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: "Unknown error" }));
      return new Response(JSON.stringify(errorData), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error scraping website:", error);
    return new Response(JSON.stringify({ detail: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function GET(request: NextRequest) {
  try {
    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";
    const { pathname, searchParams } = new URL(request.url);

    const suffix = pathname.replace("/api/projects/website/scrape", "");
    const url = `${backendUrl}/api/projects/website/scrape${suffix}?${searchParams.toString()}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(request.headers.get("authorization") && {
          Authorization: request.headers.get("authorization")!,
        }),
      },
    });

    const text = await response.text();

    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Error proxying scrape GET:", error);
    return new Response(JSON.stringify({ detail: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

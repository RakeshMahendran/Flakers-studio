import { NextRequest } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params;
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");

    if (!url) {
      return new Response(
        JSON.stringify({ detail: "URL parameter is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

    const response = await fetch(
      `${backendUrl}/api/projects/website/scrape/${jobId}/content?url=${encodeURIComponent(url)}`,
      {
        method: "GET",
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

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching URL content:", error);
    return new Response(JSON.stringify({ detail: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

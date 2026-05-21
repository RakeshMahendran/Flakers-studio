import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }

    const { search } = new URL(request.url);
    const response = await fetch(`${BACKEND_URL}/api/projects${search}`, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({ detail: "Failed to fetch projects" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying GET /api/projects:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const response = await fetch(`${BACKEND_URL}/api/projects`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({ detail: "Failed to create project" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying POST /api/projects:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ detail: "Authorization header required" }, { status: 401 });
    }

    const { search } = new URL(request.url);
    const response = await fetch(`${BACKEND_URL}/api/projects${search}`, {
      method: "DELETE",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json().catch(() => ({ detail: "Failed to delete projects" }));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("Error proxying DELETE /api/projects:", error);
    return NextResponse.json({ detail: "Internal server error" }, { status: 500 });
  }
}

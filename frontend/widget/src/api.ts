import type { PublicChatResponse, ResolvedOptions, ServerWidgetConfig } from "./types";

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export function chatEndpoint(opts: ResolvedOptions): string {
  return joinUrl(opts.apiBaseUrl, opts.chatPath);
}

export function widgetConfigEndpoint(opts: ResolvedOptions): string {
  const base = joinUrl(opts.apiBaseUrl, opts.configPath);
  const url = `${base}/${encodeURIComponent(opts.assistantId)}`;
  if (opts.tenantId) {
    const qs = new URLSearchParams({ tenant_id: opts.tenantId });
    return `${url}?${qs.toString()}`;
  }
  return url;
}

function authHeaders(opts: ResolvedOptions): Record<string, string> {
  return opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {};
}

export async function postChat(
  opts: ResolvedOptions,
  message: string,
  sessionId?: string,
): Promise<PublicChatResponse> {
  const res = await fetch(chatEndpoint(opts), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders(opts) },
    body: JSON.stringify({
      assistant_id: opts.assistantId,
      tenant_id: opts.tenantId || undefined,
      user_message: message,
      session_id: sessionId,
    }),
    credentials: "omit", // SECURITY: Never send cookies cross-origin
  });

  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return (await res.json()) as PublicChatResponse;
}

export async function fetchWidgetConfig(opts: ResolvedOptions): Promise<ServerWidgetConfig> {
  const res = await fetch(widgetConfigEndpoint(opts), {
    method: "GET",
    headers: authHeaders(opts),
    credentials: "omit", // SECURITY: Never send cookies cross-origin
  });
  if (!res.ok) {
    throw new Error(`Widget config request failed (${res.status})`);
  }
  const payload = (await res.json()) as { widget_config?: ServerWidgetConfig };
  return payload.widget_config || {};
}

/**
 * Pull the assistant-facing text from a chat response, gracefully covering
 * the legacy `response`/`message`/`refusal` field names.
 */
export function extractAnswerText(payload: PublicChatResponse): string {
  if (payload.answer) return payload.answer;
  if (payload.reason) return payload.reason;
  if (payload.response) return payload.response;
  if (payload.message) return payload.message;
  if (payload.refusal) return payload.refusal;
  return "No response was returned.";
}

export function decisionIsRefuse(decision?: string): boolean {
  if (!decision) return false;
  const d = decision.toLowerCase();
  return d === "refuse" || d === "refused" || d === "blocked";
}

/**
 * Public types for the FlakersStudio embeddable widget.
 *
 * The widget is a vanilla TS bundle with NO React / framework dependency.
 * Theme tokens here mirror the canonical OKLCH design tokens from
 * `client/app/globals.css` so the widget feels visually identical to the
 * dashboard while remaining shadow-DOM isolated from the host page.
 */

export type WidgetPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

export type BubbleSize = "sm" | "md" | "lg";

export type WidgetDecision = "answer" | "refuse" | "clarify" | "answered" | "refused" | string;

export interface WidgetSource {
  title?: string;
  url?: string;
  intent?: string;
}

/**
 * Backend `PublicChatResponse` shape (see `backend/api/routes/public_chat.py`).
 * Some legacy fields (`response`, `message`, `refusal`) are also tolerated for
 * resilience against pre-public-chat endpoints.
 */
export interface PublicChatResponse {
  decision?: WidgetDecision;
  answer?: string | null;
  reason?: string | null;
  sources?: WidgetSource[];
  rules_applied?: string[];
  allowed_scope?: string[];
  session_id?: string;
  processing_time_ms?: number;

  // legacy / fallback fields some endpoints still return
  response?: string;
  message?: string;
  refusal?: string;
}

/**
 * Server-side widget config (returned by GET /api/v1/public/widget-config/{id}).
 * Field names mirror the snake_case the backend hands back. Anything not
 * provided falls back to the client-supplied options or built-in defaults.
 */
export interface ServerWidgetConfig {
  enabled?: boolean;
  allowed_origins?: string[];

  title?: string;
  subtitle?: string;
  greeting?: string;
  welcome_message?: string;
  placeholder?: string;
  launcher_label?: string;
  send_label?: string;

  primary_color?: string;
  accent_color?: string;
  position?: WidgetPosition;
  bubble_size?: BubbleSize;
  logo_url?: string;
  assistant_name?: string;

  show_sources?: boolean;
  show_governance?: boolean;
  show_powered_by?: boolean;
}

export interface FlakersWidgetOptions {
  /** Required — assistant UUID (matches the API key's bound assistant). */
  assistantId: string;
  /** Required for the public chat route — tenant UUID bound to the API key. */
  tenantId?: string;
  /** Public API key (sent as `Authorization: Bearer ...`). */
  apiKey?: string;

  /** Base URL of the backend (no trailing slash needed). Defaults to ''. */
  apiBaseUrl?: string;
  /** Path of the public chat endpoint. Defaults to `/api/v1/public/chat`. */
  chatPath?: string;
  /** Path of the widget-config endpoint. Defaults to `/api/v1/public/widget-config`. */
  configPath?: string;

  /** Where to mount — defaults to `document.body`. */
  container?: string | HTMLElement;

  // ---- Theme + copy ----
  title?: string;
  subtitle?: string;
  /** First assistant message in the thread. (`greeting` from server config wins.) */
  greeting?: string;
  /** Alias of `greeting`, kept for backward compat. */
  welcomeMessage?: string;
  placeholder?: string;
  launcherLabel?: string;
  sendLabel?: string;

  /** Overrides the gradient START. Any CSS color (oklch / hex / rgb). */
  primaryColor?: string;
  /** Overrides the gradient END. Any CSS color (oklch / hex / rgb). */
  accentColor?: string;

  position?: WidgetPosition;
  bubbleSize?: BubbleSize;

  logoUrl?: string;
  assistantName?: string;

  /** Show source chips on answer cards. Default: true. */
  showSources?: boolean;
  /** Expose the rules-applied chip + governance footer. Default: false. */
  showGovernance?: boolean;
  /** Show the "Powered by FlakersStudio" footer. Default: true (set false on Pro). */
  showPoweredBy?: boolean;
}

export type ResolvedOptions = Required<
  Omit<
    FlakersWidgetOptions,
    "container" | "logoUrl" | "primaryColor" | "accentColor" | "tenantId" | "apiKey" | "welcomeMessage"
  >
> & {
  container: string | HTMLElement | null;
  tenantId: string;
  apiKey: string;
  logoUrl: string | null;
  primaryColor: string | null;
  accentColor: string | null;
};

export interface WidgetInstance {
  open: () => void;
  close: () => void;
  toggle: () => void;
  destroy: () => void;
  /** Programmatically send a message as if the user typed it. */
  send: (message: string) => Promise<void>;
}

export type Role = "user" | "assistant" | "system";

export interface ThreadMessage {
  id: string;
  role: Role;
  text: string;
  decision?: WidgetDecision;
  reason?: string;
  sources?: WidgetSource[];
  rulesApplied?: string[];
  processingTimeMs?: number;
  /** Local epoch timestamp. */
  ts: number;
  /** True while the assistant is generating. */
  pending?: boolean;
  /** True if the request errored. */
  error?: boolean;
}

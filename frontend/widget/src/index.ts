type WidgetPosition = "bottom-right" | "bottom-left";

type PublicChatResponse = {
  answer?: string;
  response?: string;
  message?: string;
  refusal?: string;
  decision?: string;
  sources?: Array<{ title?: string; url?: string }>;
};

export type FlakersWidgetOptions = {
  assistantId: string;
  tenantId?: string;
  apiKey?: string;
  apiBaseUrl?: string;
  chatPath?: string;
  configPath?: string;
  title?: string;
  subtitle?: string;
  placeholder?: string;
  launcherLabel?: string;
  sendLabel?: string;
  primaryColor?: string;
  position?: WidgetPosition;
  container?: string | HTMLElement;
  welcomeMessage?: string;
};

type WidgetInstance = {
  open: () => void;
  close: () => void;
  destroy: () => void;
};

const DEFAULTS: Required<
  Pick<
    FlakersWidgetOptions,
    | "apiBaseUrl"
    | "chatPath"
    | "configPath"
    | "title"
    | "subtitle"
    | "placeholder"
    | "launcherLabel"
    | "sendLabel"
    | "primaryColor"
    | "position"
    | "welcomeMessage"
  >
> = {
  apiBaseUrl: "",
  chatPath: "/api/v1/public/chat",
  configPath: "/api/v1/public/widget-config",
  title: "Ask Flakers Studio",
  subtitle: "Governed answers from your assistant",
  placeholder: "Ask a question...",
  launcherLabel: "Chat",
  sendLabel: "Send",
  primaryColor: "#14532d",
  position: "bottom-right",
  welcomeMessage: "Hi. Ask a question to start the conversation.",
};

const STYLE_ID = "flakers-studio-widget-styles";

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .fsw-root{font-family:ui-sans-serif,system-ui,sans-serif;position:fixed;z-index:2147483000}
    .fsw-root[data-position="bottom-right"]{right:24px;bottom:24px}
    .fsw-root[data-position="bottom-left"]{left:24px;bottom:24px}
    .fsw-launcher{border:none;border-radius:999px;color:#fff;cursor:pointer;padding:14px 18px;font-size:14px;font-weight:700;box-shadow:0 18px 40px rgba(0,0,0,.2)}
    .fsw-panel{width:min(360px,calc(100vw - 32px));height:560px;max-height:calc(100vh - 96px);background:#f7f7f2;border:1px solid rgba(20,20,20,.1);border-radius:24px;box-shadow:0 24px 70px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden}
    .fsw-hidden{display:none}
    .fsw-header{padding:18px 18px 14px;color:#fff}
    .fsw-title{font-size:16px;font-weight:800;line-height:1.2}
    .fsw-subtitle{margin-top:4px;font-size:12px;opacity:.88}
    .fsw-close{margin-left:auto;background:rgba(255,255,255,.18);border:none;color:#fff;border-radius:999px;width:32px;height:32px;cursor:pointer}
    .fsw-row{display:flex;align-items:center;gap:10px}
    .fsw-messages{flex:1;overflow:auto;padding:16px;background:linear-gradient(180deg,#fffdf7 0%,#f0efe5 100%)}
    .fsw-message{max-width:85%;padding:12px 14px;border-radius:18px;margin-bottom:10px;font-size:14px;line-height:1.45;white-space:pre-wrap}
    .fsw-message-user{margin-left:auto;background:#163300;color:#fff;border-bottom-right-radius:4px}
    .fsw-message-assistant{background:#fff;color:#18230f;border:1px solid rgba(24,35,15,.08);border-bottom-left-radius:4px}
    .fsw-sources{margin-top:8px;font-size:12px}
    .fsw-sources a{color:inherit}
    .fsw-form{display:flex;gap:10px;padding:14px;border-top:1px solid rgba(24,35,15,.08);background:#fff}
    .fsw-input{flex:1;border:1px solid rgba(24,35,15,.16);border-radius:14px;padding:12px 14px;font:inherit;outline:none}
    .fsw-submit{border:none;color:#fff;border-radius:14px;padding:0 16px;font-weight:700;cursor:pointer}
    .fsw-footer{padding:0 14px 12px;font-size:11px;color:#55624d;background:#fff}
  `;
  document.head.appendChild(style);
}

function resolveContainer(container?: string | HTMLElement): HTMLElement {
  if (container instanceof HTMLElement) {
    return container;
  }
  if (typeof container === "string") {
    const found = document.querySelector<HTMLElement>(container);
    if (found) {
      return found;
    }
  }
  return document.body;
}

function normalizeOptions(options: FlakersWidgetOptions): Required<FlakersWidgetOptions> {
  return {
    ...DEFAULTS,
    tenantId: options.tenantId ?? "",
    apiKey: options.apiKey ?? "",
    apiBaseUrl: options.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
    chatPath: options.chatPath ?? DEFAULTS.chatPath,
    configPath: options.configPath ?? DEFAULTS.configPath,
    title: options.title ?? DEFAULTS.title,
    subtitle: options.subtitle ?? DEFAULTS.subtitle,
    placeholder: options.placeholder ?? DEFAULTS.placeholder,
    launcherLabel: options.launcherLabel ?? DEFAULTS.launcherLabel,
    sendLabel: options.sendLabel ?? DEFAULTS.sendLabel,
    primaryColor: options.primaryColor ?? DEFAULTS.primaryColor,
    position: options.position ?? DEFAULTS.position,
    container: options.container ?? document.body,
    welcomeMessage: options.welcomeMessage ?? DEFAULTS.welcomeMessage,
    assistantId: options.assistantId,
  };
}

function buildEndpoint(options: Required<FlakersWidgetOptions>): string {
  const base = options.apiBaseUrl.replace(/\/$/, "");
  const path = options.chatPath.startsWith("/") ? options.chatPath : `/${options.chatPath}`;
  return `${base}${path}`;
}

function buildConfigEndpoint(options: Required<FlakersWidgetOptions>): string {
  const base = options.apiBaseUrl.replace(/\/$/, "");
  const path = options.configPath.startsWith("/") ? options.configPath : `/${options.configPath}`;
  const query = new URLSearchParams({
    tenant_id: options.tenantId,
  });
  return `${base}${path}/${options.assistantId}?${query.toString()}`;
}

function extractAssistantMessage(payload: PublicChatResponse): string {
  return payload.answer || payload.response || payload.message || payload.refusal || "No response was returned.";
}

function createMessageNode(role: "assistant" | "user", text: string, sources?: PublicChatResponse["sources"]): HTMLDivElement {
  const node = document.createElement("div");
  node.className = `fsw-message ${role === "user" ? "fsw-message-user" : "fsw-message-assistant"}`;
  node.textContent = text;

  if (role === "assistant" && sources && sources.length > 0) {
    const sourcesNode = document.createElement("div");
    sourcesNode.className = "fsw-sources";
    sourcesNode.textContent = "Sources: ";
    sources.forEach((source, index) => {
      const link = document.createElement("a");
      link.href = source.url || "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = source.title || source.url || `Source ${index + 1}`;
      sourcesNode.appendChild(link);
      if (index < sources.length - 1) {
        sourcesNode.append(", ");
      }
    });
    node.appendChild(sourcesNode);
  }

  return node;
}

function renderWidget(options: Required<FlakersWidgetOptions>): WidgetInstance {
  injectStyles();

  const mountTarget = resolveContainer(options.container);
  const root = document.createElement("div");
  root.className = "fsw-root";
  root.dataset.position = options.position;

  const launcher = document.createElement("button");
  launcher.className = "fsw-launcher";
  launcher.type = "button";
  launcher.textContent = options.launcherLabel;
  launcher.style.background = options.primaryColor;

  const panel = document.createElement("section");
  panel.className = "fsw-panel fsw-hidden";

  const header = document.createElement("header");
  header.className = "fsw-header";
  header.style.background = `linear-gradient(135deg, ${options.primaryColor}, #111827)`;

  const headerRow = document.createElement("div");
  headerRow.className = "fsw-row";

  const heading = document.createElement("div");
  const title = document.createElement("div");
  title.className = "fsw-title";
  title.textContent = options.title;
  const subtitle = document.createElement("div");
  subtitle.className = "fsw-subtitle";
  subtitle.textContent = options.subtitle;
  heading.append(title, subtitle);

  const close = document.createElement("button");
  close.className = "fsw-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close chat");
  close.textContent = "x";

  headerRow.append(heading, close);
  header.appendChild(headerRow);

  const messages = document.createElement("div");
  messages.className = "fsw-messages";
  messages.appendChild(createMessageNode("assistant", options.welcomeMessage));

  const form = document.createElement("form");
  form.className = "fsw-form";

  const input = document.createElement("input");
  input.className = "fsw-input";
  input.type = "text";
  input.name = "message";
  input.placeholder = options.placeholder;

  const submit = document.createElement("button");
  submit.className = "fsw-submit";
  submit.type = "submit";
  submit.textContent = options.sendLabel;
  submit.style.background = options.primaryColor;

  const footer = document.createElement("div");
  footer.className = "fsw-footer";
  footer.textContent = "Responses are generated from configured assistant context.";

  form.append(input, submit);
  panel.append(header, messages, form, footer);
  root.append(panel, launcher);
  mountTarget.appendChild(root);

  const open = (): void => {
    panel.classList.remove("fsw-hidden");
    launcher.classList.add("fsw-hidden");
  };

  const closePanel = (): void => {
    panel.classList.add("fsw-hidden");
    launcher.classList.remove("fsw-hidden");
  };

  launcher.addEventListener("click", open);
  close.addEventListener("click", closePanel);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const userMessage = input.value.trim();
    if (!userMessage) {
      return;
    }

    messages.appendChild(createMessageNode("user", userMessage));
    messages.scrollTop = messages.scrollHeight;
    input.value = "";
    submit.disabled = true;

    try {
      const response = await fetch(buildEndpoint(options), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          assistant_id: options.assistantId,
          tenant_id: options.tenantId || undefined,
          user_message: userMessage,
        }),
      });

      if (!response.ok) {
        throw new Error(`Widget chat request failed (${response.status})`);
      }

      const payload = (await response.json()) as PublicChatResponse;
      messages.appendChild(createMessageNode("assistant", extractAssistantMessage(payload), payload.sources));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Widget chat request failed";
      messages.appendChild(createMessageNode("assistant", message));
    } finally {
      submit.disabled = false;
      messages.scrollTop = messages.scrollHeight;
    }
  });

  return {
    open,
    close: closePanel,
    destroy: () => {
      root.remove();
    },
  };
}

const instances = new Set<WidgetInstance>();

export const FlakersStudioWidget = {
  init(options: FlakersWidgetOptions): WidgetInstance {
    if (!options.assistantId) {
      throw new Error("assistantId is required");
    }

    const instance = renderWidget(normalizeOptions(options));
    instances.add(instance);
    return instance;
  },
  async initFromServer(options: FlakersWidgetOptions): Promise<WidgetInstance> {
    const normalized = normalizeOptions(options);
    const response = await fetch(buildConfigEndpoint(normalized), {
      method: "GET",
      headers: {
        ...(normalized.apiKey ? { Authorization: `Bearer ${normalized.apiKey}` } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Widget config request failed (${response.status})`);
    }

    const payload = await response.json() as {
      widget_config?: Record<string, unknown>;
    };
    const widgetConfig = payload.widget_config || {};

    return this.init({
      ...options,
      title: typeof widgetConfig.title === "string" ? widgetConfig.title : options.title,
      subtitle: typeof widgetConfig.subtitle === "string" ? widgetConfig.subtitle : options.subtitle,
      placeholder: typeof widgetConfig.placeholder === "string" ? widgetConfig.placeholder : options.placeholder,
      launcherLabel: typeof widgetConfig.launcher_label === "string" ? widgetConfig.launcher_label : options.launcherLabel,
      sendLabel: typeof widgetConfig.send_label === "string" ? widgetConfig.send_label : options.sendLabel,
      primaryColor: typeof widgetConfig.primary_color === "string" ? widgetConfig.primary_color : options.primaryColor,
      position:
        widgetConfig.position === "bottom-left" || widgetConfig.position === "bottom-right"
          ? widgetConfig.position
          : options.position,
      welcomeMessage: typeof widgetConfig.welcome_message === "string" ? widgetConfig.welcome_message : options.welcomeMessage,
    });
  },
  destroyAll(): void {
    for (const instance of instances) {
      instance.destroy();
    }
    instances.clear();
  },
};

declare global {
  interface Window {
    FlakersStudioWidget: typeof FlakersStudioWidget;
  }
}

if (typeof window !== "undefined") {
  window.FlakersStudioWidget = FlakersStudioWidget;
}

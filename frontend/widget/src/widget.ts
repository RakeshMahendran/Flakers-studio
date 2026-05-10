import { extractAnswerText, fetchWidgetConfig, postChat } from "./api";
import { el, getFocusable, svgIcon } from "./dom";
import { ICON_CHAT, ICON_CLOSE, ICON_MINIMIZE, ICON_SEND } from "./icons";
import {
  renderAnswerCard,
  renderAssistantPlain,
  renderSystem,
  renderTyping,
  renderUserBubble,
} from "./messages";
import { Store, loadThread, newId, saveThread } from "./state";
import { buildStylesheet } from "./styles";
import { BRAND_GRADIENT_END, BRAND_GRADIENT_START } from "./tokens";
import type {
  FlakersWidgetOptions,
  ResolvedOptions,
  ServerWidgetConfig,
  ThreadMessage,
  WidgetInstance,
  WidgetPosition,
} from "./types";

const VALID_POSITIONS: ReadonlySet<WidgetPosition> = new Set([
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
]);

const DEFAULTS = {
  apiBaseUrl: "",
  chatPath: "/api/v1/public/chat",
  configPath: "/api/v1/public/widget-config",
  title: "Assistant",
  subtitle: "Powered by FlakersStudio",
  greeting: "Hi! Ask me anything — I'll cite sources where I can.",
  placeholder: "Ask a question...",
  launcherLabel: "Open chat",
  sendLabel: "Send",
  position: "bottom-right" as WidgetPosition,
  bubbleSize: "md" as const,
  assistantName: "Assistant",
  showSources: true,
  showGovernance: false,
  showPoweredBy: true,
} as const;

const BUBBLE_PX = { sm: 48, md: 56, lg: 64 } as const;

export function resolveOptions(
  options: FlakersWidgetOptions,
  serverConfig?: ServerWidgetConfig,
): ResolvedOptions {
  const sc = serverConfig || {};
  const merged: ResolvedOptions = {
    assistantId: options.assistantId,
    tenantId: options.tenantId ?? "",
    apiKey: options.apiKey ?? "",
    apiBaseUrl: options.apiBaseUrl ?? DEFAULTS.apiBaseUrl,
    chatPath: options.chatPath ?? DEFAULTS.chatPath,
    configPath: options.configPath ?? DEFAULTS.configPath,
    container: options.container ?? null,

    title: sc.title ?? options.title ?? sc.assistant_name ?? options.assistantName ?? DEFAULTS.title,
    subtitle: sc.subtitle ?? options.subtitle ?? DEFAULTS.subtitle,
    greeting:
      sc.greeting ??
      sc.welcome_message ??
      options.greeting ??
      options.welcomeMessage ??
      DEFAULTS.greeting,
    placeholder: sc.placeholder ?? options.placeholder ?? DEFAULTS.placeholder,
    launcherLabel: sc.launcher_label ?? options.launcherLabel ?? DEFAULTS.launcherLabel,
    sendLabel: sc.send_label ?? options.sendLabel ?? DEFAULTS.sendLabel,

    primaryColor: sc.primary_color ?? options.primaryColor ?? null,
    accentColor: sc.accent_color ?? options.accentColor ?? null,

    position:
      (VALID_POSITIONS.has(sc.position as WidgetPosition) ? (sc.position as WidgetPosition) : null) ??
      (VALID_POSITIONS.has(options.position as WidgetPosition) ? (options.position as WidgetPosition) : null) ??
      DEFAULTS.position,

    bubbleSize: sc.bubble_size ?? options.bubbleSize ?? DEFAULTS.bubbleSize,
    logoUrl: sc.logo_url ?? options.logoUrl ?? null,
    assistantName: sc.assistant_name ?? options.assistantName ?? DEFAULTS.assistantName,

    showSources: sc.show_sources ?? options.showSources ?? DEFAULTS.showSources,
    showGovernance: sc.show_governance ?? options.showGovernance ?? DEFAULTS.showGovernance,
    showPoweredBy: sc.show_powered_by ?? options.showPoweredBy ?? DEFAULTS.showPoweredBy,
  };

  return merged;
}

function resolveContainer(value: string | HTMLElement | null): HTMLElement {
  if (value instanceof HTMLElement) return value;
  if (typeof value === "string") {
    const found = document.querySelector<HTMLElement>(value);
    if (found) return found;
  }
  return document.body;
}

function gradientPair(opts: ResolvedOptions): { start: string; end: string } {
  return {
    start: opts.primaryColor ?? BRAND_GRADIENT_START,
    end: opts.accentColor ?? BRAND_GRADIENT_END,
  };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  if (parts.length === 0) return "AI";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "AI";
}

interface MountedWidget {
  host: HTMLElement;
  shadow: ShadowRoot;
  root: HTMLElement;
  panel: HTMLElement;
  body: HTMLElement;
  launcher: HTMLButtonElement;
  textarea: HTMLTextAreaElement;
  sendBtn: HTMLButtonElement;
  unread: HTMLElement;
  destroyHandlers: Array<() => void>;
}

export function createWidget(rawOptions: FlakersWidgetOptions): WidgetInstance {
  if (!rawOptions.assistantId) {
    throw new Error("FlakersStudioWidget: `assistantId` is required");
  }

  let opts = resolveOptions(rawOptions);
  const mountTarget = resolveContainer(opts.container);

  // Shadow DOM host — `all: initial` inside the shadow root would still leak
  // a few inheritable properties (font, color) without a containing element
  // that resets them, so we put the boundary on a `<flakers-widget>` host.
  const host = document.createElement("flakers-widget");
  host.style.all = "initial";
  host.setAttribute("data-flakers-widget", "");
  const shadow = host.attachShadow({ mode: "open" });

  // Build initial stylesheet using the resolved theme.
  const { start, end } = gradientPair(opts);
  const styleEl = document.createElement("style");
  styleEl.textContent = buildStylesheet({
    primaryColor: start,
    accentColor: end,
    bubblePx: BUBBLE_PX[opts.bubbleSize] ?? BUBBLE_PX.md,
  });
  shadow.appendChild(styleEl);

  // Root container
  const root = el("div", {
    class: "fsw-root",
    "data-position": opts.position,
  });

  // ----- Launcher -----
  const launcher = el("button", {
    type: "button",
    class: "fsw-launcher",
    "aria-label": opts.launcherLabel,
    "aria-expanded": "false",
    "aria-haspopup": "dialog",
  });
  const launcherIcon = el("span", { class: "fsw-launcher__icon" });
  launcherIcon.appendChild(svgIcon(ICON_CHAT));
  launcher.appendChild(launcherIcon);
  const unreadDot = el("span", { class: "fsw-unread fsw-hidden", "aria-hidden": "true" });
  launcher.appendChild(unreadDot);

  // ----- Panel -----
  const panel = el("section", {
    class: "fsw-panel",
    role: "dialog",
    "aria-modal": "false",
    "aria-label": opts.title,
    tabindex: "-1",
  });

  // Header
  const header = el("header", { class: "fsw-header" });
  const avatar = el("div", { class: "fsw-avatar" });
  if (opts.logoUrl) {
    // SECURITY: Validate logo URL to prevent data: or javascript: URIs
    const isSafe = /^https?:\/\//i.test(opts.logoUrl);
    if (isSafe) {
      const img = el("img", { src: opts.logoUrl, alt: "" });
      // Add error handler to fallback to initials if image fails to load
      img.addEventListener("error", () => {
        img.remove();
        avatar.textContent = initials(opts.assistantName || opts.title);
      });
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials(opts.assistantName || opts.title);
    }
  } else {
    avatar.textContent = initials(opts.assistantName || opts.title);
  }
  const heading = el("div", { class: "fsw-header__heading" }, [
    el("div", { class: "fsw-header__title" }, [opts.title]),
    el("div", { class: "fsw-header__subtitle" }, [
      el("span", { class: "fsw-status-dot" }),
      opts.subtitle || "",
    ]),
  ]);
  const minimizeBtn = el("button", {
    type: "button",
    class: "fsw-iconbtn",
    "aria-label": "Minimize chat",
  });
  minimizeBtn.appendChild(svgIcon(ICON_MINIMIZE));
  const closeBtn = el("button", {
    type: "button",
    class: "fsw-iconbtn",
    "aria-label": "Close chat",
  });
  closeBtn.appendChild(svgIcon(ICON_CLOSE));

  header.append(avatar, heading, minimizeBtn, closeBtn);
  header.appendChild(el("div", { class: "fsw-header__strip" }));

  // Body
  const body = el("div", { class: "fsw-body", "aria-live": "polite", "aria-relevant": "additions" });

  // Composer
  const textarea = el("textarea", {
    class: "fsw-textarea",
    placeholder: opts.placeholder,
    rows: "1",
    "aria-label": "Message input",
  }) as HTMLTextAreaElement;
  const sendBtn = el("button", {
    type: "submit",
    class: "fsw-send",
    "aria-label": opts.sendLabel,
  }) as HTMLButtonElement;
  sendBtn.appendChild(svgIcon(ICON_SEND));

  const composerRow = el("div", { class: "fsw-composer__row" }, [textarea, sendBtn]);
  const form = el("form", { class: "fsw-composer", "aria-label": "Chat composer" }, [composerRow]);

  if (opts.showPoweredBy) {
    form.appendChild(
      el("div", { class: "fsw-footer-meta" }, [
        el("span", {}, ["Secured by governance"]),
        el(
          "a",
          {
            href: "https://flakersstudio.com",
            target: "_blank",
            rel: "noopener noreferrer",
          },
          [
            "Powered by ",
            el("strong", {}, ["FlakersStudio"]),
          ],
        ),
      ]),
    );
  }

  panel.append(header, body, form);
  root.append(launcher, panel);
  shadow.appendChild(root);
  mountTarget.appendChild(host);

  // ----- State -----
  const persisted = loadThread(opts.assistantId);
  const initial: ThreadMessage[] =
    persisted.length > 0
      ? persisted
      : [
          {
            id: newId(),
            role: "assistant",
            text: opts.greeting,
            ts: Date.now(),
          },
        ];
  const thread = new Store<ThreadMessage[]>(initial);
  const sessionId: { current: string | undefined } = { current: undefined };
  let isOpen = false;
  let lastFocusedBeforeOpen: Element | null = null;

  const messageNodes = new Map<string, HTMLElement>();

  const renderForMessage = (m: ThreadMessage): HTMLElement => {
    if (m.role === "user") return renderUserBubble(m);
    if (m.role === "system") return renderSystem(m);
    if (m.pending) return renderTyping();
    // Assistant — use mini AnswerCard if we have any decision metadata,
    // otherwise a plain bubble.
    const hasMeta =
      !!m.decision ||
      (m.sources && m.sources.length > 0) ||
      (m.rulesApplied && m.rulesApplied.length > 0);
    if (hasMeta) return renderAnswerCard(m, opts);
    return renderAssistantPlain(m);
  };

  const renderAll = (messages: ThreadMessage[]): void => {
    const desiredIds = new Set(messages.map((m) => m.id));
    // Remove stale nodes
    for (const [id, node] of messageNodes) {
      if (!desiredIds.has(id)) {
        node.remove();
        messageNodes.delete(id);
      }
    }
    // Append/replace nodes in order
    let prevNode: ChildNode | null = null;
    for (const m of messages) {
      let node = messageNodes.get(m.id);
      const fresh = renderForMessage(m);
      if (!node) {
        body.appendChild(fresh);
        messageNodes.set(m.id, fresh);
        node = fresh;
      } else if (node.outerHTML !== fresh.outerHTML) {
        // Cheap structural diff — only swap when actually different.
        node.replaceWith(fresh);
        messageNodes.set(m.id, fresh);
        node = fresh;
      }
      // Maintain DOM order in case messages array reordered.
      if (prevNode && prevNode.nextSibling !== node) {
        body.insertBefore(node, prevNode.nextSibling);
      } else if (!prevNode && body.firstChild !== node) {
        body.insertBefore(node, body.firstChild);
      }
      prevNode = node;
    }
    // Auto-scroll to bottom on render.
    requestAnimationFrame(() => {
      body.scrollTop = body.scrollHeight;
    });
  };

  thread.subscribe((messages) => {
    renderAll(messages);
    saveThread(opts.assistantId, messages);
  });
  renderAll(thread.get());

  // ----- Composer wiring -----
  const autosize = (): void => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };
  textarea.addEventListener("input", autosize);

  const performSend = async (rawMessage: string): Promise<void> => {
    const message = rawMessage.trim();
    if (!message) return;

    const userMsg: ThreadMessage = {
      id: newId(),
      role: "user",
      text: message,
      ts: Date.now(),
    };
    const pendingId = newId();
    const pending: ThreadMessage = {
      id: pendingId,
      role: "assistant",
      text: "",
      ts: Date.now(),
      pending: true,
    };
    thread.set((prev) => [...prev, userMsg, pending]);

    sendBtn.disabled = true;
    textarea.disabled = true;

    try {
      const payload = await postChat(opts, message, sessionId.current);
      if (payload.session_id) sessionId.current = payload.session_id;

      const text = extractAnswerText(payload);
      const finalMsg: ThreadMessage = {
        id: pendingId,
        role: "assistant",
        text,
        decision: payload.decision,
        reason: payload.reason ?? undefined,
        sources: payload.sources,
        rulesApplied: payload.rules_applied,
        processingTimeMs: payload.processing_time_ms,
        ts: Date.now(),
      };
      thread.set((prev) => prev.map((m) => (m.id === pendingId ? finalMsg : m)));
    } catch (err) {
      const errorText =
        err instanceof Error
          ? err.message
          : "Couldn't reach the assistant. Please try again.";
      thread.set((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, pending: false, error: true, text: errorText }
            : m,
        ),
      );
    } finally {
      sendBtn.disabled = false;
      textarea.disabled = false;
      autosize();
      if (isOpen) textarea.focus();
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = textarea.value;
    textarea.value = "";
    autosize();
    void performSend(text);
  });

  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const text = textarea.value;
      textarea.value = "";
      autosize();
      void performSend(text);
    }
  });

  // ----- Open / close + focus trap -----
  const setOpen = (next: boolean): void => {
    if (next === isOpen) return;
    isOpen = next;
    if (next) {
      lastFocusedBeforeOpen = (host.getRootNode() as Document | ShadowRoot).activeElement;
      panel.classList.add("fsw-panel--open");
      panel.setAttribute("aria-modal", "true");
      launcher.setAttribute("aria-expanded", "true");
      unreadDot.classList.add("fsw-hidden");
      requestAnimationFrame(() => textarea.focus());
    } else {
      panel.classList.remove("fsw-panel--open");
      panel.setAttribute("aria-modal", "false");
      launcher.setAttribute("aria-expanded", "false");
      // restore focus
      if (lastFocusedBeforeOpen instanceof HTMLElement) {
        try { lastFocusedBeforeOpen.focus(); } catch { /* noop */ }
      } else {
        launcher.focus();
      }
    }
  };

  launcher.addEventListener("click", () => setOpen(!isOpen));
  closeBtn.addEventListener("click", () => setOpen(false));
  minimizeBtn.addEventListener("click", () => setOpen(false));

  // Esc + focus trap
  const onKey: EventListener = (event) => {
    const e = event as KeyboardEvent;
    if (!isOpen) return;
    if (e.key === "Escape") {
      e.stopPropagation();
      e.preventDefault(); // Prevent host page from also handling Escape
      setOpen(false);
      return;
    }
    if (e.key === "Tab") {
      const focusable = getFocusable(panel);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = (host.getRootNode() as ShadowRoot).activeElement as HTMLElement | null;
      // ACCESSIBILITY: Proper focus trap - ensure Tab cycles within dialog
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };
  shadow.addEventListener("keydown", onKey as EventListener);

  // Mount metadata
  const mounted: MountedWidget = {
    host,
    shadow,
    root,
    panel,
    body,
    launcher,
    textarea,
    sendBtn,
    unread: unreadDot,
    destroyHandlers: [
      () => shadow.removeEventListener("keydown", onKey as EventListener),
    ],
  };

  // Public instance
  const instance: WidgetInstance = {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!isOpen),
    destroy: () => {
      mounted.destroyHandlers.forEach((fn) => fn());
      host.remove();
    },
    send: (m) => performSend(m),
  };

  // Optional: hydrate from server config asynchronously without blocking the
  // first paint. Server values win over client-supplied options for theme.
  if (rawOptions.tenantId && rawOptions.assistantId && !rawOptions.apiKey) {
    // No API key — skip server hydrate (would 401 anyway).
  } else if (rawOptions.tenantId) {
    void fetchWidgetConfig(opts)
      .then((cfg) => {
        if (!cfg || Object.keys(cfg).length === 0) return;
        opts = resolveOptions(rawOptions, cfg);
        rehydrate(opts, mounted);
      })
      .catch(() => {
        /* widget-config is best-effort — silently keep client defaults */
      });
  }

  return instance;
}

/**
 * Apply hot-swappable theme/copy changes from server config without
 * recreating the DOM tree. Stylesheet is rebuilt; copy is replaced.
 */
function rehydrate(opts: ResolvedOptions, w: MountedWidget): void {
  // Theme
  const { start, end } = gradientPair(opts);
  const styleEl = w.shadow.querySelector("style");
  if (styleEl) {
    styleEl.textContent = buildStylesheet({
      primaryColor: start,
      accentColor: end,
      bubblePx: BUBBLE_PX[opts.bubbleSize] ?? BUBBLE_PX.md,
    });
  }
  // Position
  w.root.setAttribute("data-position", opts.position);
  // Title / subtitle / placeholder / button labels
  const title = w.panel.querySelector(".fsw-header__title") as HTMLElement | null;
  const subtitle = w.panel.querySelector(".fsw-header__subtitle") as HTMLElement | null;
  if (title) title.textContent = opts.title;
  if (subtitle) {
    subtitle.innerHTML = "";
    const dot = document.createElement("span");
    dot.className = "fsw-status-dot";
    subtitle.appendChild(dot);
    subtitle.appendChild(document.createTextNode(opts.subtitle));
  }
  w.textarea.placeholder = opts.placeholder;
  w.launcher.setAttribute("aria-label", opts.launcherLabel);
  w.sendBtn.setAttribute("aria-label", opts.sendLabel);
}

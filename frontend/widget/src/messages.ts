import { el, safeHost } from "./dom";
import type { ResolvedOptions, ThreadMessage, WidgetSource } from "./types";
import { decisionIsRefuse } from "./api";

const MAX_VISIBLE_CHIPS = 2;

function sourceLabel(source: WidgetSource, fallback: string): string {
  return source.title || safeHost(source.url) || source.url || fallback;
}

function buildSourceChips(sources: WidgetSource[]): HTMLElement {
  const wrap = el("div", { class: "fsw-card__sources" });
  const visible = sources.slice(0, MAX_VISIBLE_CHIPS);
  const overflow = sources.length - visible.length;

  visible.forEach((src, i) => {
    if (src.url) {
      const a = el("a", {
        class: "fsw-chip",
        href: src.url,
        target: "_blank",
        rel: "noopener noreferrer",
        title: src.title || src.url,
      }, [sourceLabel(src, `Source ${i + 1}`)]);
      wrap.appendChild(a);
    } else {
      const span = el("span", {
        class: "fsw-chip",
        title: src.title || "",
      }, [sourceLabel(src, `Source ${i + 1}`)]);
      wrap.appendChild(span);
    }
  });

  if (overflow > 0) {
    const more = el(
      "button",
      {
        type: "button",
        class: "fsw-chip fsw-chip__more",
        title: sources
          .slice(MAX_VISIBLE_CHIPS)
          .map((s, i) => sourceLabel(s, `Source ${i + MAX_VISIBLE_CHIPS + 1}`))
          .join("\n"),
      },
      [`+${overflow} more`],
    );
    // Toggle: clicking expands all chips inline.
    more.addEventListener("click", () => {
      more.remove();
      sources.slice(MAX_VISIBLE_CHIPS).forEach((src, i) => {
        const idx = MAX_VISIBLE_CHIPS + i + 1;
        const node = src.url
          ? el(
              "a",
              {
                class: "fsw-chip",
                href: src.url,
                target: "_blank",
                rel: "noopener noreferrer",
                title: src.title || src.url,
              },
              [sourceLabel(src, `Source ${idx}`)],
            )
          : el("span", { class: "fsw-chip", title: src.title || "" }, [
              sourceLabel(src, `Source ${idx}`),
            ]);
        wrap.appendChild(node);
      });
    });
    wrap.appendChild(more);
  }

  return wrap;
}

function buildRulesChips(rules: string[]): HTMLElement {
  const wrap = el("div", { class: "fsw-card__sources" }, [
    el("span", {
      class: "fsw-chip fsw-chip__rule",
      title: rules.join(", "),
    }, [`${rules.length} rule${rules.length === 1 ? "" : "s"} applied`]),
  ]);
  return wrap;
}

/**
 * Mini AnswerCard — gradient stripe + body + (optional) source chips
 * + (optional) governance footer with confidence dot. ~92% width inside the
 * 380px panel.
 */
export function renderAnswerCard(message: ThreadMessage, opts: ResolvedOptions): HTMLElement {
  const isRefuse = decisionIsRefuse(message.decision);
  const card = el("article", {
    class: `fsw-card${isRefuse ? " fsw-card--refuse" : ""}`,
    role: "group",
    "aria-label": isRefuse ? "Refused answer" : "Assistant answer",
  });

  card.appendChild(el("div", { class: "fsw-card__stripe" }));

  const body = el("div", { class: "fsw-card__body" });

  if (isRefuse) {
    body.appendChild(
      el("div", { class: "fsw-refuse-banner" }, [
        el("span", { class: "fsw-conf__dot", style: "width:6px;height:6px;background:currentColor;box-shadow:none" }),
        "Refused",
      ]),
    );
  }

  body.appendChild(el("div", { class: "fsw-card__text" }, [message.text]));

  // Sources
  const sources = message.sources || [];
  if (opts.showSources && sources.length > 0) {
    body.appendChild(buildSourceChips(sources));
  }

  // Governance rule chips (only if explicitly enabled — most tenants hide)
  const rules = message.rulesApplied || [];
  if (opts.showGovernance && rules.length > 0) {
    body.appendChild(buildRulesChips(rules));
  }

  card.appendChild(body);

  // Footer with confidence dot + processing time
  if (opts.showGovernance || opts.showSources || isRefuse) {
    const footer = el("footer", { class: "fsw-card__footer" });
    const conf = el("span", { class: "fsw-conf" }, [
      el("span", { class: "fsw-conf__dot" }),
      isRefuse ? "Refused" : "Governance approved",
    ]);
    footer.appendChild(conf);
    if (typeof message.processingTimeMs === "number") {
      footer.appendChild(el("span", {}, [`${message.processingTimeMs}ms`]));
    }
    card.appendChild(footer);
  }

  return card;
}

export function renderUserBubble(message: ThreadMessage): HTMLElement {
  return el("div", { class: "fsw-msg-user", role: "log" }, [message.text]);
}

export function renderAssistantPlain(message: ThreadMessage): HTMLElement {
  return el("div", { class: "fsw-msg-assistant", role: "log" }, [message.text]);
}

export function renderSystem(message: ThreadMessage): HTMLElement {
  return el("div", { class: "fsw-msg-system", role: "alert" }, [message.text]);
}

export function renderTyping(): HTMLElement {
  return el("div", { class: "fsw-typing", "aria-label": "Assistant is typing" }, [
    el("span"),
    el("span"),
    el("span"),
  ]);
}

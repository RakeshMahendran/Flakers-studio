/**
 * DOM helpers — keep us off `innerHTML` for any user/network-supplied text
 * (XSS hardening) while still allowing static SVG/icon HTML where it's safe.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Partial<Record<string, string | boolean | number | undefined | null>>,
  children?: Array<Node | string | null | undefined | false>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = String(v);
      else if (k === "style") node.setAttribute("style", String(v));
      else if (k.startsWith("on") && typeof v === "function") {
        // (Not used here — we always wire listeners via addEventListener.)
        continue;
      } else if (k === "html") {
        // SECURITY: Never use this with user/network-supplied content.
        // Only for static, code-controlled HTML (e.g., SVG icons).
        // Validate that we're not receiving untrusted data.
        if (typeof v !== "string" || v.includes("script")) {
          throw new Error("Invalid HTML content");
        }
        node.innerHTML = String(v);
      } else {
        node.setAttribute(k, String(v));
      }
    }
  }
  if (children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

export function setText(node: HTMLElement, text: string): void {
  node.textContent = text;
}

export function svgIcon(html: string): HTMLSpanElement {
  // Static, code-controlled SVG — safe to use innerHTML.
  const span = document.createElement("span");
  span.setAttribute("aria-hidden", "true");
  span.style.display = "inline-flex";
  span.style.width = "100%";
  span.style.height = "100%";
  span.innerHTML = html;
  const svg = span.firstElementChild as SVGElement | null;
  if (svg) {
    svg.style.width = "100%";
    svg.style.height = "100%";
  }
  return span;
}

/**
 * Hostname extractor that works for relative URLs / malformed inputs without
 * throwing. Returns `null` if the URL cannot be parsed at all.
 */
export function safeHost(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url, window.location.href).host || null;
  } catch {
    return null;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const FOCUSABLE_SELECTOR =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
  );
}

/**
 * FlakersStudio Widget — public entry point.
 *
 * Two delivery formats are produced by the build:
 *   - `flakers-widget.iife.js`  Loads via a plain `<script src=...>` tag and
 *                                exposes `window.FlakersStudioWidget`.
 *   - `flakers-widget.js`       ESM build for bundler integrations.
 *
 * This widget intentionally has zero runtime dependencies. It boots on a
 * shadow DOM root so host page styles cannot affect (or be affected by) it.
 */

import { fetchWidgetConfig } from "./api";
import { resolveOptions, createWidget } from "./widget";
import type { FlakersWidgetOptions, WidgetInstance } from "./types";

export type {
  FlakersWidgetOptions,
  WidgetInstance,
  WidgetPosition,
  BubbleSize,
  WidgetSource,
  PublicChatResponse,
} from "./types";

const instances = new Set<WidgetInstance>();

function track(instance: WidgetInstance): WidgetInstance {
  instances.add(instance);
  const originalDestroy = instance.destroy;
  instance.destroy = (): void => {
    originalDestroy();
    instances.delete(instance);
  };
  return instance;
}

/**
 * Initialize the widget synchronously using locally-supplied options.
 * Server config (if `tenantId` + `apiKey` are provided) is fetched in the
 * background and re-applied without remounting.
 */
function init(options: FlakersWidgetOptions): WidgetInstance {
  return track(createWidget(options));
}

/**
 * Initialize after explicitly fetching server config first. Useful when the
 * theme/copy MUST be settled before first paint (e.g. server-side rendered
 * embed). Falls back to a client-only init if the config request fails.
 */
async function initFromServer(options: FlakersWidgetOptions): Promise<WidgetInstance> {
  try {
    const opts = resolveOptions(options);
    const cfg = await fetchWidgetConfig(opts);
    return track(createWidget({ ...options, ...mapServerToOptions(cfg as unknown as Record<string, unknown>) }));
  } catch {
    return track(createWidget(options));
  }
}

function mapServerToOptions(cfg: Record<string, unknown>): Partial<FlakersWidgetOptions> {
  const out: Partial<FlakersWidgetOptions> = {};
  if (typeof cfg.title === "string") out.title = cfg.title;
  if (typeof cfg.subtitle === "string") out.subtitle = cfg.subtitle;
  if (typeof cfg.greeting === "string") out.greeting = cfg.greeting;
  if (typeof cfg.placeholder === "string") out.placeholder = cfg.placeholder;
  if (typeof cfg.launcher_label === "string") out.launcherLabel = cfg.launcher_label;
  if (typeof cfg.send_label === "string") out.sendLabel = cfg.send_label;
  if (typeof cfg.primary_color === "string") out.primaryColor = cfg.primary_color;
  if (typeof cfg.accent_color === "string") out.accentColor = cfg.accent_color;
  if (typeof cfg.position === "string") {
    out.position = cfg.position as FlakersWidgetOptions["position"];
  }
  if (typeof cfg.bubble_size === "string") {
    out.bubbleSize = cfg.bubble_size as FlakersWidgetOptions["bubbleSize"];
  }
  if (typeof cfg.logo_url === "string") out.logoUrl = cfg.logo_url;
  if (typeof cfg.assistant_name === "string") out.assistantName = cfg.assistant_name;
  if (typeof cfg.show_sources === "boolean") out.showSources = cfg.show_sources;
  if (typeof cfg.show_governance === "boolean") out.showGovernance = cfg.show_governance;
  if (typeof cfg.show_powered_by === "boolean") out.showPoweredBy = cfg.show_powered_by;
  return out;
}

function destroyAll(): void {
  for (const i of Array.from(instances)) i.destroy();
  instances.clear();
}

export const FlakersStudioWidget = {
  init,
  initFromServer,
  destroyAll,
};

declare global {
  interface Window {
    FlakersStudioWidget: typeof FlakersStudioWidget;
  }
}

if (typeof window !== "undefined") {
  // Last-write-wins guard against double-loading.
  window.FlakersStudioWidget = FlakersStudioWidget;

  // Auto-init helper: drop a `<script src=".../flakers-widget.iife.js"
  //   data-assistant-id="..." data-tenant-id="..." data-api-key="..."
  //   data-api-base-url="https://..."></script>` tag and the widget
  // bootstraps itself. Useful for tenants who can't run JS.
  document.addEventListener("DOMContentLoaded", () => {
    const script = document.querySelector<HTMLScriptElement>(
      "script[data-flakers-widget][data-assistant-id]",
    );
    if (!script) return;
    const ds = script.dataset;
    if (!ds.assistantId) return;
    try {
      init({
        assistantId: ds.assistantId,
        tenantId: ds.tenantId,
        apiKey: ds.apiKey,
        apiBaseUrl: ds.apiBaseUrl,
        primaryColor: ds.primaryColor,
        accentColor: ds.accentColor,
        position: ds.position as FlakersWidgetOptions["position"] | undefined,
        bubbleSize: ds.bubbleSize as FlakersWidgetOptions["bubbleSize"] | undefined,
        greeting: ds.greeting,
        placeholder: ds.placeholder,
        title: ds.title,
        subtitle: ds.subtitle,
        logoUrl: ds.logoUrl,
        showSources: ds.showSources === undefined ? undefined : ds.showSources !== "false",
        showGovernance: ds.showGovernance === undefined ? undefined : ds.showGovernance === "true",
        showPoweredBy: ds.showPoweredBy === undefined ? undefined : ds.showPoweredBy !== "false",
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[FlakersStudioWidget] auto-init failed", err);
    }
  });
}

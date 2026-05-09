# FlakersStudio Widget

The drop-in chat widget tenants embed on their own marketing sites. Vanilla
TypeScript, single-file bundle, full shadow-DOM isolation, brand colors
sourced from the FlakersStudio design system (OKLCH).

- **Bundle size:** ~10 kB gzipped (budget: 50 kB, enforced in build)
- **Dependencies:** none at runtime — esbuild + TypeScript only
- **Isolation:** shadow DOM, host page styles cannot leak in or out
- **Endpoints:** `POST /api/v1/public/chat`, `GET /api/v1/public/widget-config/{assistantId}`
- **Persistence:** thread cached in `localStorage` under `flakers-widget:<assistantId>:thread`

## Build

```bash
npm install
npm run build           # type-checks + emits dist/, fails if >50 kB gzipped
npm run typecheck       # tsc --noEmit only
```

Output: `dist/flakers-widget.iife.js` (script-tag drop-in) and
`dist/flakers-widget.js` (ESM). A `dist/size-report.json` records the
post-build size for CI consumption.

## Install — script tag (auto-init)

```html
<script
  src="https://cdn.flakersstudio.com/widget/flakers-widget.iife.js"
  data-flakers-widget
  data-assistant-id="abc-123"
  data-tenant-id="tenant-uuid"
  data-api-key="public-key"
  data-api-base-url="https://api.flakersstudio.com"
  defer
></script>
```

## Install — programmatic

```html
<script src="/path/to/flakers-widget.iife.js"></script>
<script>
  window.FlakersStudioWidget.init({
    assistantId: "abc-123",
    tenantId: "tenant-uuid",
    apiKey: "public-key",
    apiBaseUrl: "https://api.flakersstudio.com",
    position: "bottom-right",
    bubbleSize: "md",
    showSources: true,
    showGovernance: false,
  });
</script>
```

`init()` returns `{ open, close, toggle, destroy, send }`.

## Configuration

Server-side config from `/api/v1/public/widget-config/{id}` always wins over
client options, so a tenant's dashboard is the single source of truth for
copy + theme.

| Option           | Type                                              | Default                              | Notes                                                              |
| ---------------- | ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| `assistantId`    | `string`                                          | (required)                           | Assistant UUID bound to the API key                                |
| `tenantId`       | `string`                                          | —                                    | Required for the public chat endpoint                              |
| `apiKey`         | `string`                                          | —                                    | Public API key, sent as `Authorization: Bearer ...`                |
| `apiBaseUrl`     | `string`                                          | `""`                                 | No trailing slash needed                                           |
| `position`       | `bottom-right` \| `bottom-left` \| `top-*`        | `bottom-right`                       |                                                                    |
| `bubbleSize`     | `sm` \| `md` \| `lg`                              | `md` (56 px)                         |                                                                    |
| `primaryColor`   | CSS color                                         | OKLCH brand-600                      | Overrides gradient START                                           |
| `accentColor`    | CSS color                                         | OKLCH cyan-500                       | Overrides gradient END                                             |
| `greeting`       | `string`                                          | "Hi! Ask me anything..."             | First assistant message                                            |
| `placeholder`    | `string`                                          | "Ask a question..."                  |                                                                    |
| `logoUrl`        | `string`                                          | —                                    | Avatar image; falls back to assistant initials                     |
| `assistantName`  | `string`                                          | "Assistant"                          |                                                                    |
| `showSources`    | `boolean`                                         | `true`                               | Source chips on the mini AnswerCard                                |
| `showGovernance` | `boolean`                                         | `false`                              | Rules-applied chip + governance footer (most tenants leave hidden) |
| `showPoweredBy`  | `boolean`                                         | `true`                               | Set `false` on Pro tier                                            |

## Theme examples

### Corporate (default brand gradient)

```js
window.FlakersStudioWidget.init({
  assistantId: "...", tenantId: "...", apiKey: "...",
  // Omit primaryColor/accentColor to use the canonical OKLCH brand gradient.
});
```

### Bold (custom magenta → orange)

```js
window.FlakersStudioWidget.init({
  assistantId: "...", tenantId: "...", apiKey: "...",
  primaryColor: "oklch(0.55 0.25 350)",
  accentColor:  "oklch(0.78 0.18 50)",
  bubbleSize: "lg",
  greeting: "Got a question? Hit me — I'm fast.",
});
```

### Minimal (mono, no governance, no powered-by)

```js
window.FlakersStudioWidget.init({
  assistantId: "...", tenantId: "...", apiKey: "...",
  primaryColor: "oklch(0.20 0 0)",
  accentColor:  "oklch(0.45 0 0)",
  bubbleSize: "sm",
  showSources: false,
  showGovernance: false,
  showPoweredBy: false,
});
```

## Local test page

Open `frontend/widget/test/index.html` after building. The page intercepts
fetch calls so no backend is required — it returns synthetic answer +
refusal payloads. The page also defines deliberately hostile global CSS
(forced `box-sizing: content-box`, magenta dashed buttons, Comic Sans
inputs) to verify shadow-DOM isolation holds.

## Accessibility

- Panel exposes `role="dialog"` with `aria-modal` toggled on open.
- Esc closes; Tab is trapped inside the panel while open.
- Focus restores to the previously focused element after close.
- `aria-live="polite"` body announces new assistant messages.
- All decorative SVGs carry `aria-hidden="true"`; controls have `aria-label`s.

## Source map

| File                        | Responsibility                                                |
| --------------------------- | ------------------------------------------------------------- |
| `src/index.ts`              | Public API (`init`, `initFromServer`, `destroyAll`, auto-init) |
| `src/widget.ts`             | Mount, panel/launcher DOM, focus trap, send pipeline           |
| `src/messages.ts`           | Mini AnswerCard + RefusalCard + typing indicator               |
| `src/styles.ts`             | Single CSS string injected into the shadow root                |
| `src/tokens.ts`             | OKLCH tokens vendored from `client/app/globals.css`            |
| `src/api.ts`                | Chat + widget-config fetch helpers                             |
| `src/state.ts`              | Tiny `Store<T>` event bus + `localStorage` thread persistence  |
| `src/dom.ts`                | `el()` helper, focus utilities, safe SVG icon insertion        |
| `src/icons.ts`              | Inline SVG strings (chat / send / close / minimize / sparkle)  |
| `scripts/build.mjs`         | esbuild → IIFE + ESM, gzipped size budget enforcement          |

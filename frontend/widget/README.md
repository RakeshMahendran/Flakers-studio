# Flakers Studio Widget

Standalone embeddable widget bundle for CDN-style delivery.

Build:

```bash
npm install
npm run build
```

Usage:

```html
<script src="/dist/flakers-widget.js"></script>
<script>
  window.FlakersStudioWidget.init({
    assistantId: "assistant-id",
    tenantId: "tenant-id",
    apiKey: "public-api-key",
    apiBaseUrl: "https://api.example.com",
    chatPath: "/api/v1/public/chat",
    primaryColor: "#14532d",
    position: "bottom-right",
    launcherLabel: "Ask us"
  });
</script>
```

The bundle is intentionally framework-agnostic and keeps the chat endpoint configurable so it can switch from internal routes to the dedicated public API added in `M6-2` without another bundle refactor.

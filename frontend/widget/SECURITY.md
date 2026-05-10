# Widget Security Guidelines

## Overview

The FlakersStudio widget is designed to be embedded in third-party websites. This document outlines security measures implemented and hosting requirements.

## Security Features Implemented

### 1. Shadow DOM Isolation

- **Full style isolation**: Host page CSS cannot affect widget internals
- **No CSS leakage**: Widget styles don't affect host page
- **Separate DOM tree**: Widget DOM is completely isolated from parent document
- **Reset boundary**: `all: initial` on shadow host prevents inheritance

### 2. XSS Prevention

#### Content Security
- **No `innerHTML` for user content**: All user/server text rendered via `textContent` or `createTextNode()`
- **Static HTML only for icons**: SVG icons use `innerHTML` but are code-controlled constants
- **URL validation**: All URLs (sources, logo) validated to block `javascript:`, `data:`, `vbscript:` schemes
- **String truncation**: Source labels truncated to 200 chars to prevent UI overflow attacks
- **No `eval()` or `Function()`**: No dynamic code execution anywhere in codebase

#### Attribute Sanitization
- All DOM attributes set via `setAttribute()` with string coercion
- No event handlers set via attributes (`onclick`, etc.)
- Event listeners added exclusively via `addEventListener()`

### 3. Network Security

#### CORS & Credentials
- **No credential sharing**: `credentials: "omit"` on all fetch requests
- **API key in header only**: Never sent in URL query params
- **HTTPS enforcement**: Widget should only be loaded over HTTPS in production

#### Request Validation
- All API responses validated before use
- Graceful fallback on config fetch failure
- Error messages sanitized before display

### 4. Third-Party Embedding Protection

#### Origin Isolation
- Widget makes no assumptions about parent page origin
- No `window.parent` or `postMessage` usage (not needed for this design)
- No access to parent cookies/localStorage (isolated by shadow DOM boundary)

#### CSP Compatibility
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://your-cdn.com;
  connect-src 'self' https://api.flakersstudio.com;
  img-src 'self' https: data:;
  style-src 'unsafe-inline';
  font-src 'self' data:;
```

**Note**: `style-src 'unsafe-inline'` required because styles are injected into shadow root via `<style>` tag. This is safe because:
1. Styles are in shadow DOM (isolated)
2. All style content is code-controlled (no user input in CSS)
3. Shadow boundary prevents any CSS from affecting parent page

### 5. Accessibility & Focus Management

- **Keyboard trap when open**: Tab/Shift+Tab cycles only within widget dialog
- **Focus restoration**: Returns focus to pre-open element on close
- **Escape to close**: Properly handled without leaking to parent page
- **ARIA attributes**: `role="dialog"`, `aria-modal`, `aria-label` properly set
- **Screen reader support**: `aria-live="polite"` for message stream

## Deployment Requirements

### Required Backend Configuration

1. **CORS Headers** (if widget served from different origin than API):
```
Access-Control-Allow-Origin: https://customer-site.com
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
Access-Control-Max-Age: 86400
```

2. **API Rate Limiting**: Implement per-tenant/per-IP rate limits on:
   - `/api/v1/public/chat` (e.g., 60 req/min per IP)
   - `/api/v1/public/widget-config/*` (e.g., 10 req/min per IP)

3. **API Key Validation**: Backend MUST validate:
   - API key matches tenant ID
   - API key has `public_chat` scope
   - Assistant ID belongs to tenant

### Recommended Host Page CSP

For pages embedding the widget:
```
script-src 'self' https://cdn.flakersstudio.com;
connect-src 'self' https://api.flakersstudio.com;
img-src 'self' https: data:;
```

### CDN Configuration

- Enable Subresource Integrity (SRI) for script tag:
```html
<script 
  src="https://cdn.flakersstudio.com/widget/flakers-widget.iife.js"
  integrity="sha384-[hash]"
  crossorigin="anonymous">
</script>
```

- Set long cache headers: `Cache-Control: public, max-age=31536000, immutable`
- Use versioned URLs: `flakers-widget.v1.2.3.iife.js` (not `latest`)

## Known Limitations

### 1. localStorage Persistence

- Widget stores conversation history in `localStorage` keyed by assistant ID
- **Risk**: Other scripts on host page can read/modify this data
- **Mitigation**: 
  - Don't store sensitive data in messages
  - Clear thread on logout: `FlakersStudioWidget.destroyAll(); localStorage.removeItem('flakers-widget:...')`

### 2. No Subresource Integrity in Auto-Init

The auto-init feature (data attributes on script tag) can't validate the API endpoint.
**Mitigation**: Document that `apiBaseUrl` should be hardcoded, not user-supplied.

### 3. Custom Element Name Collision

If host page already defines `<flakers-widget>`, widget may fail to mount.
**Mitigation**: Namespace is sufficiently unique; document as a known risk.

## Security Testing Checklist

- [ ] Test with hostile parent styles (see `test/index.html`)
- [ ] Verify no cookies sent in API requests (check Network tab)
- [ ] Confirm URL validation blocks `javascript:` and `data:` URIs
- [ ] Test keyboard trap doesn't leak focus to parent page
- [ ] Verify error messages don't expose stack traces
- [ ] Test with various CSP policies on host page
- [ ] Confirm bundle size under budget (prevents payload bloat attacks)
- [ ] Audit for accidental `innerHTML` usage with user content

## Reporting Security Issues

Email: security@flakersstudio.com

**Do NOT** open public GitHub issues for security vulnerabilities.

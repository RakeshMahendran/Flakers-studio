# Browser Compatibility

## Supported Browsers

### ✅ Fully Supported (No Polyfills Required)

| Browser | Minimum Version | Notes |
|---------|----------------|-------|
| Chrome | 63+ (Dec 2017) | Native Shadow DOM v1, ES2020 |
| Edge | 79+ (Jan 2020) | Chromium-based, full support |
| Safari | 10.1+ (Mar 2017) | Shadow DOM v1 support |
| Firefox | 63+ (Oct 2018) | Shadow DOM v1 support |
| Opera | 50+ (Jan 2018) | Chromium-based |
| Samsung Internet | 8.0+ (May 2018) | Chromium-based |

**Market Coverage**: ~96% of global users (caniuse.com, May 2026)

### ⚠️ Requires Polyfills

| Browser | Minimum Version | Required Polyfills |
|---------|----------------|-------------------|
| Edge Legacy | 18 | Shadow DOM v1 polyfill |
| Safari | 10.0 | Shadow DOM v1 polyfill |
| UC Browser | 13+ | Shadow DOM v1 polyfill |

### ❌ Not Supported

- Internet Explorer 11 and below (lacks Shadow DOM, no polyfill available)
- Opera Mini (limited JS support)
- Android Browser 4.x (lacks ES2020 features)

## Feature Requirements

### Critical Features (Widget Won't Work Without)

1. **Shadow DOM v1 (attachShadow)**
   - Chrome 53+, Safari 10.1+, Firefox 63+
   - No IE support possible
   - Polyfill: [@webcomponents/webcomponentsjs](https://github.com/webcomponents/polyfills/tree/master/packages/webcomponentsjs)

2. **Custom Elements v1**
   - Automatically available with Shadow DOM v1
   - Widget uses `<flakers-widget>` as shadow host

3. **ES2020 (target in tsconfig/build)**
   - Optional chaining (`?.`)
   - Nullish coalescing (`??`)
   - `Promise`, `async/await`, `fetch`

4. **CSS Custom Properties (CSS Variables)**
   - Widely supported (Chrome 49+, Safari 9.1+, Firefox 31+)
   - Used for theming in shadow root

### Nice-to-Have Features (Graceful Degradation)

1. **`:focus-visible` pseudo-class**
   - Chrome 86+, Safari 15.4+, Firefox 85+
   - Fallback: uses `:focus` in unsupported browsers
   - No action needed (browser handles)

2. **`dvh` (Dynamic Viewport Height)**
   - Safari 15.4+, Chrome 108+, Firefox 101+
   - Used in `@media (max-width: 500px)` for mobile fullscreen
   - Fallback: `100vh` is acceptable

3. **`color-scheme` meta tag**
   - Not used (widget ignores system dark mode)
   - Widget always renders in light mode with branded colors

## localStorage

- **Required**: Yes
- **Fallback**: Widget works without it (just no thread persistence)
- **Browser Support**: Universal (IE8+, all modern browsers)
- **Incognito/Private**: May be unavailable or throw quota errors
  - Widget catches exceptions, continues without persistence

## Network/Security Requirements

### fetch() API
- Chrome 42+, Safari 10.3+, Firefox 39+, Edge 14+
- **No polyfill planned**: Minimum browser requirement

### CORS
- Widget requires backend to send proper CORS headers if cross-origin
- All modern browsers support CORS

### Content Security Policy (CSP)
- Widget requires `style-src 'unsafe-inline'` (for shadow root `<style>` tag)
- This is acceptable because styles are isolated in shadow DOM
- See SECURITY.md for recommended CSP

## Responsive Design

### Breakpoints
- **Desktop**: 380×600px widget panel
- **Mobile** (`max-width: 500px`): Fullscreen (100vw × 100dvh)

### Touch Support
- All interactive elements have min 32×32px touch targets (WCAG 2.5.5 Level AAA)
- `-webkit-tap-highlight-color: transparent` for clean touch feedback

## Testing Matrix

### Automated Testing (Recommended)

Use BrowserStack or similar for:
- Chrome 63, 90, latest
- Safari 10.1, 15, latest
- Firefox 63, 100, latest
- Edge 79, latest
- Samsung Internet latest

### Manual Testing Checklist

- [ ] Widget mounts without console errors
- [ ] Launcher button visible and clickable
- [ ] Panel opens/closes smoothly
- [ ] Text input accepts keyboard input
- [ ] Send button triggers message
- [ ] Scrolling works in message body
- [ ] Mobile fullscreen mode triggers correctly
- [ ] Focus trap works (Tab/Shift+Tab)
- [ ] Escape closes panel
- [ ] Host page styles don't leak into widget
- [ ] Widget styles don't leak to host page

## Adding Polyfills (If Needed)

If you need to support older browsers, add polyfills **before** loading the widget:

```html
<!-- Option 1: Load only if needed (recommended) -->
<script>
  if (!('attachShadow' in Element.prototype)) {
    document.write('<script src="https://unpkg.com/@webcomponents/webcomponentsjs@2/webcomponents-loader.js"><\/script>');
  }
</script>

<!-- Option 2: Always load (simpler, but adds overhead) -->
<script src="https://unpkg.com/@webcomponents/webcomponentsjs@2/webcomponents-loader.js"></script>

<!-- Then load widget -->
<script src="https://cdn.flakersstudio.com/widget/flakers-widget.iife.js"></script>
```

**Note**: Polyfilled Shadow DOM has performance overhead and may not 100% match native behavior. Test thoroughly.

## Known Browser-Specific Issues

### Safari 10.1-12.x
- **Issue**: Shadow DOM CSS `:host` selector sometimes doesn't apply `all: initial`
- **Workaround**: Already applied in widget.ts line 143 (`host.style.all = "initial"`)
- **Status**: Fixed in Safari 13+

### Firefox < 63
- **Issue**: No Shadow DOM v1 support
- **Workaround**: Require Firefox 63+ or use polyfill
- **Status**: Firefox 63 released Oct 2018, safe to require

### Samsung Internet 7.x
- **Issue**: Shadow DOM v1 supported but buggy (events sometimes don't bubble)
- **Workaround**: Require Samsung Internet 8.0+ (May 2018)
- **Status**: Resolved in v8.0+

## Performance Characteristics

### Initial Load (Cold Cache)
- **Bundle download**: ~35kB raw, ~10.5kB gzipped
- **Parse + Execute**: <50ms on modern devices
- **First paint**: <100ms after DOMContentLoaded

### Memory Footprint
- **Idle (closed)**: ~500kB
- **Open with 10 messages**: ~1.2MB
- **Open with 50 messages (persistence limit)**: ~2.5MB

### Animations
- All animations use `transform` and `opacity` (GPU-accelerated)
- `prefers-reduced-motion` respected (animations disabled)
- No layout thrashing (animations don't trigger reflow)

## Deprecation Timeline

- **2026 Q2**: Drop Safari 10.0 support (already done, requires 10.1+)
- **2027 Q1**: Drop Chrome < 80 support (if ES2021 features needed)
- **No plans**: To support IE11 or Edge Legacy

## Testing in Older Browsers Locally

Use BrowserStack Live, or:

1. **Safari 10.1-12**: Use a macOS VM with older OS version
2. **Chrome 63-80**: `npx playwright install chromium@80` (not guaranteed)
3. **Firefox 63**: Download from [Mozilla FTP archive](https://ftp.mozilla.org/pub/firefox/releases/)

## Accessibility Testing

- **NVDA (Windows)**: Works with Chrome/Firefox
- **JAWS (Windows)**: Works with Chrome/Edge/Firefox
- **VoiceOver (macOS/iOS)**: Works with Safari
- **TalkBack (Android)**: Works with Chrome

All screen readers should announce:
- "Open chat" launcher button
- "Ask Atlas" dialog when opened
- "Message input" for textarea
- "Send" button
- New messages as they arrive (via `aria-live="polite"`)

## Further Reading

- [Shadow DOM v1 Spec](https://w3c.github.io/webcomponents/spec/shadow/)
- [Custom Elements v1 Spec](https://html.spec.whatwg.org/multipage/custom-elements.html)
- [Can I Use: Shadow DOM](https://caniuse.com/shadowdomv1)
- [MDN: Using Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_shadow_DOM)

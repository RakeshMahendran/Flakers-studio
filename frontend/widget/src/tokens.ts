/**
 * Design tokens — vendored from the canonical FlakersStudio design system at
 * `client/app/globals.css`.
 *
 * These OKLCH values are baked into the widget's shadow-DOM stylesheet so the
 * widget renders identical brand colors with **zero** dependency on the host
 * page's CSS — host page cannot accidentally override them, and the widget
 * cannot leak its styles back out.
 *
 * Source of truth (do NOT diverge — if globals.css updates, sync these):
 *   `--brand-600`        oklch(0.52 0.20 272)   primary brand gradient start
 *   `--accent-cyan-500`  oklch(0.75 0.15 200)   gradient end + focus ring
 *   `--trust-600`        oklch(0.58 0.16 160)   confidence dot (allow)
 *   `--refuse-600`       oklch(0.55 0.20 25)    refuse strip + dot
 *   `--caution-700`      oklch(0.54 0.12 55)    caution / low-confidence
 *   `--gradient-brand`   linear-gradient(135deg, oklch(0.60 0.18 270), oklch(0.75 0.15 200))
 */
export const BRAND_GRADIENT_START = "oklch(0.60 0.18 270)";
export const BRAND_GRADIENT_END = "oklch(0.75 0.15 200)";

export const TOKEN_VARS = {
  // Surfaces
  surface: "oklch(1.00 0 0)",
  surfaceSunken: "oklch(0.965 0.005 270)",
  surfaceMuted: "oklch(0.985 0.005 270)",
  surfaceInverse: "oklch(0.20 0.012 270)",

  // Text
  textPrimary: "oklch(0.20 0.012 270)",
  textSecondary: "oklch(0.38 0.012 270)",
  textMuted: "oklch(0.49 0.011 270)",
  textOnBrand: "oklch(1.00 0 0)",

  // Brand
  brand: "oklch(0.52 0.20 272)",
  brandHover: "oklch(0.45 0.20 275)",
  brandSoft: "oklch(0.98 0.02 270)",
  brandSoftHover: "oklch(0.95 0.04 270)",
  brandBorder: "oklch(0.90 0.07 270)",
  brand200: "oklch(0.90 0.07 270)",
  brand700: "oklch(0.45 0.20 275)",

  // Accent (cyan)
  accent: "oklch(0.62 0.14 200)",
  accentSoft: "oklch(0.97 0.03 200)",
  accentBorder: "oklch(0.90 0.08 200)",
  accent200: "oklch(0.90 0.08 200)",
  accent500: "oklch(0.75 0.15 200)",
  accent700: "oklch(0.50 0.12 200)",

  // Trust (allow / confidence)
  trust: "oklch(0.58 0.16 160)",
  trustStrong: "oklch(0.46 0.13 160)",
  trustSoft: "oklch(0.97 0.03 160)",
  trustBorder: "oklch(0.90 0.09 160)",

  // Caution (low confidence)
  caution: "oklch(0.54 0.12 55)",
  cautionStrong: "oklch(0.42 0.09 50)",
  cautionSoft: "oklch(0.98 0.03 75)",
  cautionBorder: "oklch(0.92 0.10 75)",

  // Refuse
  refuse: "oklch(0.55 0.20 25)",
  refuseStrong: "oklch(0.45 0.18 25)",
  refuseSoft: "oklch(0.97 0.02 25)",
  refuseBorder: "oklch(0.90 0.08 25)",

  // Borders
  borderSubtle: "oklch(0.965 0.005 270)",
  borderDefault: "oklch(0.925 0.006 270)",
  borderStrong: "oklch(0.870 0.007 270)",

  // Focus ring
  focusRing: "oklch(0.75 0.15 200)",

  // Gradients (literal strings so the widget does not need them computed)
  gradientBrand: `linear-gradient(135deg, ${BRAND_GRADIENT_START} 0%, ${BRAND_GRADIENT_END} 100%)`,
  gradientRefuse: "linear-gradient(135deg, oklch(0.65 0.20 25) 0%, oklch(0.78 0.15 75) 100%)",

  // Elevation
  elevation1:
    "0 1px 2px oklch(0 0 0 / 0.04), 0 1px 3px oklch(0 0 0 / 0.06)",
  elevation3:
    "0 12px 24px -6px oklch(0 0 0 / 0.08), 0 4px 8px -4px oklch(0 0 0 / 0.04)",
  elevation4:
    "0 24px 48px -12px oklch(0 0 0 / 0.18), 0 8px 16px -8px oklch(0 0 0 / 0.06)",
  glowBrand: "0 0 24px -4px oklch(0.60 0.18 270 / 0.40)",

  // Easing
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeSpring: "cubic-bezier(0.34, 1.56, 0.64, 1)",
};

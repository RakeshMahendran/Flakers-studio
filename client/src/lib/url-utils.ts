/**
 * URL validation and sanitization utilities for governance components
 *
 * Security considerations:
 * - Prevents XSS via javascript:, data:, and other dangerous protocols
 * - Validates URL structure before display
 * - Provides safe fallbacks for invalid URLs
 */

const ALLOWED_PROTOCOLS = ['http:', 'https:'];
const DANGEROUS_PROTOCOLS = ['javascript:', 'data:', 'vbscript:', 'file:'];

/**
 * Validates if a URL is safe to use in href attributes
 * @param url - The URL to validate
 * @returns true if the URL is safe, false otherwise
 */
export function isSafeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  try {
    const parsed = new URL(url);

    // Check for dangerous protocols
    if (DANGEROUS_PROTOCOLS.some(proto => parsed.protocol === proto)) {
      return false;
    }

    // Only allow http/https for external links
    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL
    return false;
  }
}

/**
 * Extracts a safe display hostname from a URL
 * @param url - The URL to extract hostname from
 * @returns The hostname without 'www.' prefix, or a safe fallback
 */
export function getSafeHostname(url: string): string {
  if (!url || typeof url !== 'string') {
    return '(invalid URL)';
  }

  try {
    const parsed = new URL(url);

    // Validate protocol
    if (!parsed.protocol.startsWith('http')) {
      return '(invalid URL)';
    }

    return parsed.host.replace(/^www\./, '');
  } catch {
    // Non-URL or malformed
    return '(local file)';
  }
}

/**
 * Sanitizes a URL for safe use in href attributes
 * Returns undefined if the URL is not safe, which prevents navigation
 * @param url - The URL to sanitize
 * @returns The sanitized URL or undefined if unsafe
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) {
    return undefined;
  }

  if (isSafeUrl(url)) {
    return url;
  }

  return undefined;
}

/**
 * Validates that a favicon URL is safe to load
 * @param url - The favicon URL to validate
 * @returns true if safe to load, false otherwise
 */
export function isSafeFaviconUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }

  return isSafeUrl(url);
}

/**
 * FlakersStudio Security Utilities
 * --------------------------------------------------------------------
 * Centralized security functions for input validation, sanitization,
 * and safe navigation.
 * --------------------------------------------------------------------
 */

/**
 * Sanitize route paths to prevent injection attacks
 * Only allows alphanumeric, dash, slash, and underscore characters
 */
export function sanitizeRoute(route: string): string {
  if (typeof route !== 'string') {
    return '/dashboard'; // Safe fallback
  }
  // Remove any potentially dangerous characters
  const sanitized = route.replace(/[^a-zA-Z0-9\-/_]/g, '');
  // Ensure the route starts with a slash
  return sanitized.startsWith('/') ? sanitized : `/${sanitized}`;
}

/**
 * Validate and sanitize assistant/resource IDs
 * Prevents path traversal and injection attacks
 */
export function sanitizeId(id: string): string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('Invalid ID provided');
  }
  // Only allow alphanumeric, dash, and underscore
  const sanitized = id.replace(/[^a-zA-Z0-9\-_]/g, '');
  if (sanitized.length === 0) {
    throw new Error('ID contains no valid characters');
  }
  return sanitized;
}

/**
 * Validate data series for sparklines/charts
 * Prevents DoS attacks from extremely large datasets
 */
export function validateDataSeries(
  data: unknown,
  maxLength = 1000
): number[] {
  if (!Array.isArray(data)) {
    return [];
  }

  // Limit array size to prevent memory issues
  const limited = data.slice(0, maxLength);

  // Ensure all values are finite numbers
  return limited
    .map(v => typeof v === 'number' ? v : parseFloat(String(v)))
    .filter(v => Number.isFinite(v));
}

/**
 * Sanitize user-provided text for display
 * Prevents XSS while preserving basic formatting
 */
export function sanitizeText(text: unknown): string {
  if (typeof text !== 'string') {
    return '';
  }

  // Remove potentially dangerous patterns
  return text
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .slice(0, 10000); // Reasonable max length
}

/**
 * Validate URL for external links
 * Only allows http(s) protocols
 */
export function validateExternalUrl(url: unknown): string | null {
  if (typeof url !== 'string') {
    return null;
  }

  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {
    // Invalid URL
  }

  return null;
}

/**
 * Rate limiting helper for user actions
 * Prevents spam and abuse
 */
export class RateLimiter {
  private timestamps: number[] = [];

  constructor(
    private maxAttempts: number,
    private windowMs: number
  ) {}

  canProceed(): boolean {
    const now = Date.now();
    // Remove old timestamps outside the window
    this.timestamps = this.timestamps.filter(
      t => now - t < this.windowMs
    );

    if (this.timestamps.length >= this.maxAttempts) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.timestamps = [];
  }
}

/**
 * Debounced validation for user input
 * Prevents excessive API calls or processing
 */
export function createDebouncedValidator<T>(
  validator: (value: T) => boolean,
  delay = 300
): (value: T) => Promise<boolean> {
  let timeoutId: NodeJS.Timeout | null = null;

  return (value: T): Promise<boolean> => {
    return new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        resolve(validator(value));
      }, delay);
    });
  };
}

/**
 * Content Security Policy helpers
 */
export const CSP_NONCE = {
  generate(): string {
    if (typeof window !== 'undefined' && window.crypto) {
      const array = new Uint8Array(16);
      window.crypto.getRandomValues(array);
      return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for SSR or old browsers
    return Math.random().toString(36).substring(2, 15);
  }
};

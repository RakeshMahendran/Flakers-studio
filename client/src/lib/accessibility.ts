/**
 * FlakersStudio Accessibility Utilities
 * --------------------------------------------------------------------
 * Helpers for WCAG 2.1 AA compliance, keyboard navigation,
 * screen reader support, and focus management.
 * --------------------------------------------------------------------
 */

/**
 * Minimum touch target size (44x44px per WCAG 2.1 AA)
 */
export const MIN_TOUCH_TARGET = {
  width: 44,
  height: 44,
  className: 'min-h-[44px] min-w-[44px]'
} as const;

/**
 * Focus trap for modal dialogs and overlays
 */
export class FocusTrap {
  private firstFocusable: HTMLElement | null = null;
  private lastFocusable: HTMLElement | null = null;
  private previousActiveElement: HTMLElement | null = null;

  constructor(private container: HTMLElement) {
    this.updateFocusableElements();
  }

  activate(): void {
    this.previousActiveElement = document.activeElement as HTMLElement;
    this.updateFocusableElements();

    // Focus the first focusable element
    if (this.firstFocusable) {
      this.firstFocusable.focus();
    }

    this.container.addEventListener('keydown', this.handleKeyDown);
  }

  deactivate(): void {
    this.container.removeEventListener('keydown', this.handleKeyDown);

    // Restore focus to the previously focused element
    if (this.previousActiveElement && document.body.contains(this.previousActiveElement)) {
      this.previousActiveElement.focus();
    }
  }

  private updateFocusableElements(): void {
    const focusableSelectors = [
      'a[href]',
      'button:not([disabled])',
      'textarea:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([tabindex="-1"])'
    ].join(', ');

    const focusableElements = Array.from(
      this.container.querySelectorAll<HTMLElement>(focusableSelectors)
    );

    this.firstFocusable = focusableElements[0] || null;
    this.lastFocusable = focusableElements[focusableElements.length - 1] || null;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === this.firstFocusable) {
        event.preventDefault();
        this.lastFocusable?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === this.lastFocusable) {
        event.preventDefault();
        this.firstFocusable?.focus();
      }
    }
  };
}

/**
 * Announce changes to screen readers
 */
export class LiveRegionAnnouncer {
  private readonly liveRegion: HTMLDivElement;

  constructor() {
    // Create or find existing live region
    let region = document.getElementById('a11y-live-region') as HTMLDivElement;

    if (!region) {
      region = document.createElement('div');
      region.id = 'a11y-live-region';
      region.setAttribute('aria-live', 'polite');
      region.setAttribute('aria-atomic', 'true');
      region.className = 'sr-only';
      document.body.appendChild(region);
    }

    this.liveRegion = region;
  }

  announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
    this.liveRegion.setAttribute('aria-live', priority);

    // Clear and set message to ensure screen readers pick it up
    this.liveRegion.textContent = '';
    setTimeout(() => {
      this.liveRegion.textContent = message;
    }, 100);
  }

  clear(): void {
    this.liveRegion.textContent = '';
  }
}

/**
 * Keyboard navigation helpers
 */
export const KeyboardNav = {
  /**
   * Handle arrow key navigation in a list
   */
  handleArrowKeys: (
    event: React.KeyboardEvent,
    currentIndex: number,
    maxIndex: number,
    onNavigate: (newIndex: number) => void
  ): void => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        onNavigate(Math.min(currentIndex + 1, maxIndex));
        break;
      case 'ArrowUp':
        event.preventDefault();
        onNavigate(Math.max(currentIndex - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        onNavigate(0);
        break;
      case 'End':
        event.preventDefault();
        onNavigate(maxIndex);
        break;
    }
  },

  /**
   * Check if an element is keyboard-activatable
   */
  isActivationKey: (event: React.KeyboardEvent): boolean => {
    return event.key === 'Enter' || event.key === ' ';
  }
};

/**
 * Skip link component helper
 */
export function focusMainContent(): void {
  const main = document.getElementById('main-content');
  if (main) {
    main.focus();
    main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

/**
 * Contrast ratio calculation for WCAG compliance
 */
export function getContrastRatio(
  foreground: string,
  background: string
): number | null {
  try {
    // This is a simplified version - in production, use a proper color library
    const getLuminance = (hex: string): number => {
      const rgb = parseInt(hex.slice(1), 16);
      const r = ((rgb >> 16) & 0xff) / 255;
      const g = ((rgb >> 8) & 0xff) / 255;
      const b = (rgb & 0xff) / 255;

      const [rs, gs, bs] = [r, g, b].map(c =>
        c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
      );

      return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
    };

    const l1 = getLuminance(foreground);
    const l2 = getLuminance(background);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);

    return (lighter + 0.05) / (darker + 0.05);
  } catch {
    return null;
  }
}

/**
 * Generate unique IDs for accessibility attributes
 */
let idCounter = 0;
export function generateId(prefix = 'a11y'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

/**
 * Reduced motion detection
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * High contrast mode detection
 */
export function prefersHighContrast(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-contrast: high)').matches;
}

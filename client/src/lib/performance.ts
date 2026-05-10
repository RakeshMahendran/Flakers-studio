/**
 * FlakersStudio Performance Utilities
 * --------------------------------------------------------------------
 * Helpers for optimizing rendering, data processing, and memory usage
 * in dashboard components with large datasets.
 * --------------------------------------------------------------------
 */

/**
 * Virtual scrolling helper for large lists
 */
export class VirtualScroller {
  constructor(
    private itemHeight: number,
    private containerHeight: number,
    private overscan = 3
  ) {}

  getVisibleRange(scrollTop: number, totalItems: number): {
    start: number;
    end: number;
    offsetY: number;
  } {
    const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.overscan);
    const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);
    const end = Math.min(totalItems, start + visibleCount + this.overscan * 2);

    return {
      start,
      end,
      offsetY: start * this.itemHeight
    };
  }

  getTotalHeight(totalItems: number): number {
    return totalItems * this.itemHeight;
  }
}

/**
 * Debounce function for expensive operations
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return function debounced(...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
    }, wait);
  };
}

/**
 * Throttle function for high-frequency events
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return function throttled(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Data pagination helper
 */
export function paginate<T>(
  data: T[],
  page: number,
  pageSize: number
): {
  items: T[];
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
} {
  const totalPages = Math.ceil(data.length / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;

  return {
    items: data.slice(start, end),
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

/**
 * Batch processing for large datasets
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (batch: T[]) => Promise<R[]>,
  batchSize = 50
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processor(batch);
    results.push(...batchResults);

    // Allow UI to breathe between batches
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return results;
}

/**
 * Memoization cache for expensive computations
 */
export class MemoCache<K, V> {
  private cache = new Map<string, { value: V; timestamp: number }>();

  constructor(private maxAge = 60000) {} // 1 minute default

  get(key: K): V | undefined {
    const k = JSON.stringify(key);
    const cached = this.cache.get(k);

    if (!cached) return undefined;

    // Check if expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(k);
      return undefined;
    }

    return cached.value;
  }

  set(key: K, value: V): void {
    const k = JSON.stringify(key);
    this.cache.set(k, { value, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Lazy component loader with retry
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  importFunc: () => Promise<{ default: T }>,
  maxRetries = 3
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    let lastError: Error | null = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        return await importFunc();
      } catch (error) {
        lastError = error as Error;
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }

    throw lastError;
  });
}

/**
 * Performance monitoring
 */
export class PerformanceMonitor {
  private marks = new Map<string, number>();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string): number | null {
    const start = this.marks.get(startMark);
    if (!start) return null;

    const duration = performance.now() - start;

    if (typeof window !== 'undefined' && window.performance?.measure) {
      try {
        window.performance.measure(name, { start, duration });
      } catch {
        // Ignore if browser doesn't support
      }
    }

    return duration;
  }

  clear(name?: string): void {
    if (name) {
      this.marks.delete(name);
    } else {
      this.marks.clear();
    }
  }
}

/**
 * Intersection Observer hook helper for lazy loading
 */
export function createIntersectionObserver(
  callback: (entries: IntersectionObserverEntry[]) => void,
  options?: IntersectionObserverInit
): IntersectionObserver | null {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
    return null;
  }

  return new IntersectionObserver(callback, {
    rootMargin: '50px',
    threshold: 0.01,
    ...options
  });
}

/**
 * Request Animation Frame batching
 */
export class RAFBatcher {
  private pending: (() => void)[] = [];
  private rafId: number | null = null;

  schedule(callback: () => void): void {
    this.pending.push(callback);

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }

  private flush(): void {
    const callbacks = this.pending.slice();
    this.pending = [];
    this.rafId = null;

    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        console.error('RAF batch error:', error);
      }
    }
  }
}

/**
 * Web Worker helper for offloading heavy computations
 */
export function createWorker(fn: Function): Worker | null {
  if (typeof window === 'undefined' || !window.Worker) {
    return null;
  }

  const blob = new Blob([`(${fn.toString()})()`], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  return new Worker(url);
}

// Re-export React for lazy loading
import * as React from 'react';

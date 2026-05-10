import type { ThreadMessage } from "./types";

/**
 * Tiny event-bus + persistent thread store used by the widget.
 *
 * No framework — just a typed Set of listeners and a localStorage write-through
 * cache keyed by assistantId. Persistence lets returning visitors pick up
 * where they left off without re-greeting.
 */
type Listener<T> = (value: T) => void;

export class Store<T> {
  private value: T;
  private listeners = new Set<Listener<T>>();

  constructor(initial: T) {
    this.value = initial;
  }

  get(): T {
    return this.value;
  }

  set(next: T | ((prev: T) => T)): void {
    const computed = typeof next === "function" ? (next as (prev: T) => T)(this.value) : next;
    if (Object.is(computed, this.value)) return;
    this.value = computed;
    for (const l of this.listeners) l(computed);
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

const PERSIST_VERSION = 1;
const PERSIST_LIMIT = 50; // never persist more than the last 50 messages

interface PersistShape {
  v: number;
  messages: ThreadMessage[];
}

export function persistKey(assistantId: string): string {
  return `flakers-widget:${assistantId}:thread`;
}

export function loadThread(assistantId: string): ThreadMessage[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(persistKey(assistantId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistShape;
    if (!parsed || parsed.v !== PERSIST_VERSION || !Array.isArray(parsed.messages)) {
      return [];
    }
    return parsed.messages;
  } catch {
    return [];
  }
}

export function saveThread(assistantId: string, messages: ThreadMessage[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    // Drop pending placeholders so a refresh mid-request doesn't show a
    // half-loaded message that will never resolve.
    const sanitized = messages
      .filter((m) => !m.pending)
      .slice(-PERSIST_LIMIT);
    const payload: PersistShape = { v: PERSIST_VERSION, messages: sanitized };
    localStorage.setItem(persistKey(assistantId), JSON.stringify(payload));
  } catch {
    /* quota exceeded or private mode — silently ignore */
  }
}

export function clearThread(assistantId: string): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(persistKey(assistantId));
  } catch {
    /* noop */
  }
}

export function newId(): string {
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * CSV export utility — converts an array of objects to a CSV string
 * and triggers a browser download.
 */

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // RFC 4180: quote if contains comma, quote, newline, or carriage return.
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Convert rows to a CSV string. The keys of the first row determine columns
 * (unless `columns` is provided).
 */
export function toCSV<T extends Record<string, unknown>>(
  rows: T[],
  columns?: (keyof T | string)[]
): string {
  if (rows.length === 0 && !columns) return "";
  const cols = (columns ?? Object.keys(rows[0] ?? {})) as string[];
  const header = cols.map(escapeCell).join(",");
  const body = rows
    .map((row) => cols.map((c) => escapeCell((row as Record<string, unknown>)[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

/**
 * Trigger a browser download of `content` as a file named `filename`.
 */
export function downloadCSV(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Minimal, timezone-safe date helpers working on YYYY-MM-DD strings (UTC). */

export function parseISO(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, day || 1));
}

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const now = new Date();
  return toISO(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function addDays(d: string, n: number): string {
  const x = parseISO(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toISO(x);
}

export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86_400_000);
}

export function monthKey(d: string): string {
  return d.slice(0, 7);
}

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

export function isValidISO(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return toISO(parseISO(d)) === d;
}

/** Monday of the week containing d. */
export function startOfWeek(d: string): string {
  const x = parseISO(d);
  const dow = (x.getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

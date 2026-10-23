let LOCALE: "de-DE" | "en-GB" = "de-DE";
export function setLocale(l: "de-DE" | "en-GB") {
  LOCALE = l;
}

const cache = new Map<string, Intl.NumberFormat>();
function nf(opts: Intl.NumberFormatOptions) {
  const key = LOCALE + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, opts);
    cache.set(key, f);
  }
  return f;
}

export const fmt = {
  eur(n: number | null | undefined, digits = 0) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    return nf({ style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  },
  eurCompact(n: number | null | undefined) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return nf({ style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0, notation: "compact" }).format(n);
    if (abs >= 10_000) return nf({ style: "currency", currency: "EUR", maximumFractionDigits: 0, notation: "compact" }).format(n);
    return fmt.eur(n);
  },
  num(n: number | null | undefined, digits = 0) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    return nf({ maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  },
  pct(n: number | null | undefined, digits = 0) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "n/a";
    return nf({ style: "percent", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
  },
  months(n: number | null | undefined) {
    if (n === null || n === undefined || !Number.isFinite(n)) return "Not reached";
    if (n === 0) return "Immediate";
    return `${fmt.num(n, 1)} mo`;
  },
  date(d: string) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  },
  shortDate(d: string) {
    const [y, m, day] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString(LOCALE, { day: "2-digit", month: "short", timeZone: "UTC" });
  },
  month(m: string) {
    const [y, mm] = m.split("-").map(Number);
    return new Date(Date.UTC(y, mm - 1, 1)).toLocaleDateString(LOCALE, { month: "short", year: "2-digit", timeZone: "UTC" });
  },
  relative(iso: string) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    const d = Math.floor(diff / 86400);
    return d === 1 ? "yesterday" : `${d} days ago`;
  },
};

/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  IMPRESSUM & DATENSCHUTZ — NUR DIESE 4 ANGABEN EINTRAGEN
 * ─────────────────────────────────────────────────────────────────────────────
 * FLOWSTATE ist ein privates, nicht-kommerzielles Bewerbungsprojekt. Dafür reicht
 * eine Anbieterkennzeichnung nach § 18 Abs. 1 MStV (Name + Anschrift) plus E-Mail.
 * Solange ein Wert mit "TODO:" beginnt, zeigen die Rechtsseiten einen roten Hinweis.
 * Hinweis: Vorlage, keine Rechtsberatung.
 */
export const LEGAL = {
  /** Vor- und Nachname. */
  name: "Nadin Okil",
  /** Ladungsfähige Anschrift (kein Postfach). */
  street: "TODO: Straße Hausnummer",
  postalCodeCity: "TODO: PLZ Ort",
  /** Kontakt-E-Mail. */
  email: "nadinokil.contact@gmail.com",
  country: "Deutschland",
  /** Stand der Datenschutzerklärung. */
  privacyUpdated: "20.10.2026",
} as const;

/** Dienstleister, die beim Betrieb Daten verarbeiten (für die Datenschutzerklärung). */
export const PROCESSORS = {
  hosting: { name: "Vercel Inc.", country: "USA", privacyUrl: "https://vercel.com/legal/privacy-policy" },
  ai: { name: "Anthropic PBC", country: "USA", privacyUrl: "https://www.anthropic.com/legal/privacy" },
} as const;

export function legalPlaceholders(): string[] {
  return Object.entries(LEGAL)
    .filter(([, v]) => typeof v === "string" && v.startsWith("TODO:"))
    .map(([k]) => k);
}

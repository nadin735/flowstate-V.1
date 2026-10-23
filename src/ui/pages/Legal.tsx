import React, { useEffect } from "react";
import { LuArrowLeft, LuTriangleAlert } from "react-icons/lu";
import { LEGAL, PROCESSORS, legalPlaceholders } from "../../legal.config";

export type LegalKind = "impressum" | "datenschutz";

function Val({ v }: { v: string }) {
  return v.startsWith("TODO:") ? <mark className="legal-todo">[{v.slice(5).trim()}]</mark> : <>{v}</>;
}

/** Impressum (§ 18 MStV, private non-commercial project) and Datenschutzerklärung (Art. 13 DSGVO), in German. Values come from src/legal.config.ts. */
export function LegalPage({ kind, onBack }: { kind: LegalKind; onBack: () => void }) {
  const todo = legalPlaceholders();
  useEffect(() => {
    document.title = `${kind === "impressum" ? "Impressum" : "Datenschutzerklärung"} · FLOWSTATE`;
    document.documentElement.lang = "de";
    window.scrollTo({ top: 0 });
    return () => {
      document.documentElement.lang = "en";
    };
  }, [kind]);

  return (
    <div className="legal-wrap">
      <main className="legal" id="main">
        <button className="link-btn legal-back" onClick={onBack}><LuArrowLeft aria-hidden /> Zurück zu FLOWSTATE</button>
        {todo.length > 0 && (
          <div className="callout callout-danger" role="alert">
            <LuTriangleAlert aria-hidden />
            <div><b>Noch nicht vollständig.</b> Die markierten Angaben müssen in <code>src/legal.config.ts</code> eingetragen werden ({todo.length} offen).</div>
          </div>
        )}
        {kind === "impressum" ? <Impressum /> : <Datenschutz />}
        <nav className="legal-links" aria-label="Rechtliches">
          <a href="#/impressum">Impressum</a> · <a href="#/datenschutz">Datenschutz</a> · <a href="third-party-notices.txt" target="_blank" rel="noopener">Open-Source-Lizenzen</a>
        </nav>
      </main>
    </div>
  );
}

function Address() {
  return (
    <p>
      <Val v={LEGAL.name} /><br />
      <Val v={LEGAL.street} /><br />
      <Val v={LEGAL.postalCodeCity} /><br />
      {LEGAL.country}<br />
      E-Mail: <Val v={LEGAL.email} />
    </p>
  );
}

function Impressum() {
  return (
    <article>
      <h1>Impressum</h1>
      <h2>Angaben gemäß § 18 Abs. 1 MStV</h2>
      <Address />
      <h2>Über dieses Projekt</h2>
      <p>FLOWSTATE ist ein privates, nicht-kommerzielles Bewerbungs- und Portfolioprojekt. Es werden keine Waren oder Dienstleistungen angeboten und keine Einnahmen erzielt.</p>
      <p>Alle Einsparungen, ROI-Werte und Empfehlungen sind Modellschätzungen auf Basis der eingegebenen Daten. Die Testdaten beschreiben ein fiktives Unternehmen.</p>
    </article>
  );
}

function Datenschutz() {
  const h = PROCESSORS.hosting;
  const ai = PROCESSORS.ai;
  return (
    <article>
      <h1>Datenschutzerklärung</h1>
      <p className="muted">Stand: {LEGAL.privacyUpdated}</p>

      <h2>1. Verantwortlich</h2>
      <Address />

      <h2>2. Kurz gesagt</h2>
      <p>Keine Konten, kein Tracking, keine Werbung, keine Cookies außer einem technisch notwendigen Sitzungscookie (nur beim Betrieb mit eigenem Server). Schriftarten und Skripte kommen vom eigenen Server, nicht von Google oder CDNs. Ihre Eingaben werden nicht dauerhaft gespeichert.</p>

      <h2>3. Hosting</h2>
      <p>Die Seite wird bei {h.name} ({h.country}) gehostet; die Serverfunktionen laufen in der Region Frankfurt (EU), statische Dateien werden über das weltweite Netz des Anbieters ausgeliefert. Beim Aufruf verarbeitet der Hoster technisch notwendige Verbindungsdaten (u. a. IP-Adresse, Zeitpunkt, aufgerufene Adresse, Browser-Kennung), um die Seite auszuliefern und abzusichern. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO. Die Übermittlung in die USA erfolgt laut Anbieter auf Grundlage geeigneter Garantien (Art. 44 ff. DSGVO). Details: <a href={h.privacyUrl} target="_blank" rel="noopener noreferrer">Datenschutzerklärung von {h.name}</a>.</p>

      <h2>4. Ihre Eingaben in der Anwendung</h2>
      <p>Eingegebene oder importierte Prozessdaten liegen nur im <code>sessionStorage</code> Ihres Browser-Tabs und werden beim Schließen des Tabs oder mit „End session &amp; delete data“ gelöscht. PDFs werden im Browser gelesen und nicht hochgeladen, außer Sie wählen ausdrücklich das Lesen per KI. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO; die Speicherung ist für die gewünschte Funktion unbedingt erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG). Bitte geben Sie keine personenbezogenen Daten Dritter ein.</p>

      <h2>5. KI-Funktionen</h2>
      <p>Nur wenn Sie im „Transformation Consultant“ die Option „AI“ nutzen oder ein PDF per KI lesen lassen, werden die dafür nötigen Daten (Prozessdaten, Ihre Beschreibung bzw. das PDF) an {ai.name} ({ai.country}) übermittelt, um das Ergebnis zu erzeugen. Ohne Ihr Auslösen findet keine Übermittlung statt. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO. Details: <a href={ai.privacyUrl} target="_blank" rel="noopener noreferrer">Datenschutzhinweise von {ai.name}</a>.</p>

      <h2>6. Ihre Rechte</h2>
      <p>Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO) sowie auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde, etwa der an Ihrem Wohnort (Art. 77 DSGVO). Da hier nichts dauerhaft gespeichert wird, können Sie Ihre Daten jederzeit selbst exportieren oder löschen.</p>
    </article>
  );
}

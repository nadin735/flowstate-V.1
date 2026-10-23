import React from "react";
import { LuArrowRight } from "react-icons/lu";
import { Button, PageHeader, Segmented } from "../components/ui";
import { navigate } from "../app";

type L = "en" | "de" | "ar";

const T: Record<L, { title: string; lead: string; goalH: string; goal: string; benefitH: string; benefit: string; stepsH: string; steps: [string, string][]; viewsH: string; views: [string, string][]; videoH: string; videoNote: string; cta: string; start: string }> = {
  en: {
    title: "How to use FLOWSTATE",
    lead: "A one-minute guide: what this is for and how to work with it.",
    goalH: "Goal",
    goal: "Decide whether automating your invoice handling pays off, then plan and track the change until it is live.",
    benefitH: "Benefit",
    benefit: "You see cost, time and errors today and after the change, with a payback figure. All figures are estimates from your own inputs, and you stay in control of every decision.",
    stepsH: "Three steps",
    steps: [["Know today", "Enter or import your process: volume, labour cost and the steps."], ["Compare options", "Three options are priced for you. Pick one and see savings and payback."], ["Plan and track", "Turn the choice into a roadmap with tasks, owners and milestones."]],
    viewsH: "The dashboard has three views",
    views: [["Workspace", "All answers on one page: does it pay off, what changes, is the project on track."], ["Assistant", "Pick a question and get one answer from your figures."], ["Focus", "Only the next three tasks that need you today."]],
    videoH: "Watch the guide",
    videoNote: "About one minute, shown on the real app. The voice is artificially generated.",
    cta: "Open the dashboard",
    start: "Start here",
  },
  de: {
    title: "So nutzen Sie FLOWSTATE",
    lead: "Eine Minute Anleitung: wofür das gedacht ist und wie Sie damit arbeiten.",
    goalH: "Ziel",
    goal: "Entscheiden, ob sich die Automatisierung Ihrer Rechnungsbearbeitung lohnt, und die Umsetzung bis zum Livegang planen und verfolgen.",
    benefitH: "Nutzen",
    benefit: "Sie sehen Kosten, Zeit und Fehler heute und nach der Umstellung, mit Amortisationszeit. Alle Zahlen sind Schätzungen aus Ihren eigenen Angaben, und jede Entscheidung bleibt bei Ihnen.",
    stepsH: "Drei Schritte",
    steps: [["Heute kennen", "Prozess eingeben oder importieren: Menge, Personalkosten und die Schritte."], ["Optionen vergleichen", "Drei Optionen sind bepreist. Eine wählen und Ersparnis und Amortisation sehen."], ["Planen und verfolgen", "Die Wahl wird zum Fahrplan mit Aufgaben, Verantwortlichen und Meilensteinen."]],
    viewsH: "Das Dashboard hat drei Ansichten",
    views: [["Workspace", "Alle Antworten auf einer Seite: lohnt es sich, was ändert sich, läuft das Projekt."], ["Assistant", "Eine Frage wählen und eine Antwort aus Ihren Zahlen bekommen."], ["Focus", "Nur die nächsten drei Aufgaben, die heute Sie brauchen."]],
    videoH: "Anleitung ansehen",
    videoNote: "Etwa eine Minute, gezeigt an der echten App. Die Stimme ist künstlich erzeugt.",
    cta: "Dashboard öffnen",
    start: "Hier beginnen",
  },
  ar: {
    title: "كيف تستخدم FLOWSTATE",
    lead: "دليل من دقيقة واحدة: ما الغرض منه وكيف تعمل به.",
    goalH: "الهدف",
    goal: "تقرير ما إذا كانت أتمتة معالجة الفواتير مجدية، ثم تخطيط التنفيذ ومتابعته حتى التشغيل.",
    benefitH: "الفائدة",
    benefit: "ترى التكلفة والوقت والأخطاء اليوم وبعد التغيير مع مدة الاسترداد. كل الأرقام تقديرات من بياناتك أنت، والقرار يبقى بيدك.",
    stepsH: "ثلاث خطوات",
    steps: [["اعرف الوضع الحالي", "أدخل العملية أو استوردها: الحجم وتكلفة العمالة والخطوات."], ["قارن الخيارات", "ثلاثة خيارات مسعّرة لك. اختر واحدًا وشاهد التوفير ومدة الاسترداد."], ["خطّط وتابع", "حوّل الاختيار إلى خطة بمهام ومسؤولين ومراحل."]],
    viewsH: "للوحة ثلاث طرق عرض",
    views: [["Workspace", "كل الإجابات في صفحة واحدة: هل هو مجدٍ، ما الذي يتغير، وهل المشروع على المسار."], ["Assistant", "اختر سؤالًا واحصل على إجابة واحدة من أرقامك."], ["Focus", "فقط المهام الثلاث التالية التي تحتاجك اليوم."]],
    videoH: "شاهد الدليل",
    videoNote: "نحو دقيقة، على التطبيق الحقيقي. الصوت مولَّد اصطناعيًا.",
    cta: "افتح لوحة المعلومات",
    start: "ابدأ من هنا",
  },
};

const LANGS: { value: L; label: string }[] = [{ value: "en", label: "English" }, { value: "de", label: "Deutsch" }, { value: "ar", label: "العربية" }];
let chosen: L = "en";

export function GuidePage() {
  const [lang, setLang] = React.useState<L>(chosen);
  const t = T[lang];
  const sx = lang === "en" ? "" : `-${lang}`;
  const pick = (l: L) => { chosen = l; setLang(l); };
  return (
    <div className="page guide">
      <PageHeader eyebrow="Guide" title={t.title} description={t.lead} />
      <Segmented<L> label="Language" value={lang} onChange={pick} options={LANGS} />
      <div className="gd-grid" dir={lang === "ar" ? "rtl" : "ltr"} lang={lang}>
        <div className="gd-col">
          <section className="ov-board"><h2 className="gd-h">{t.goalH}</h2><p className="gd-p">{t.goal}</p><h2 className="gd-h">{t.benefitH}</h2><p className="gd-p">{t.benefit}</p></section>
          <section className="ov-board"><h2 className="gd-h">{t.stepsH}</h2>
            <ol className="gd-steps">{t.steps.map(([a, b]) => <li key={a}><b>{a}</b><span>{b}</span></li>)}</ol>
          </section>
          <section className="ov-board"><h2 className="gd-h">{t.viewsH}</h2>
            <dl className="gd-views">{t.views.map(([a, b]) => <div key={a}><dt>{a}</dt><dd>{b}</dd></div>)}</dl>
          </section>
        </div>
        <div className="gd-col">
          <section className="ov-board"><h2 className="gd-h">{t.videoH}</h2>
            <video key={lang} className="gd-video" controls preload="metadata" playsInline poster={`video/guide-poster${sx}.png`}>
              <source src={`video/guide${sx}.mp4`} type="video/mp4" />
              <source src={`video/guide${sx}.webm`} type="video/webm" />
              <track kind="captions" srcLang={lang} label={LANGS.find((x) => x.value === lang)!.label} src={`video/guide${sx}.vtt`} default />
            </video>
            <p className="small muted">{t.videoNote}</p>
            <div><Button variant="primary" onClick={() => navigate("overview")}>{t.cta} <LuArrowRight aria-hidden /></Button></div>
          </section>
        </div>
      </div>
    </div>
  );
}

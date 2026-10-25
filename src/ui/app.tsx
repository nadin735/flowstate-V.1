import React, { useEffect, useState } from "react";
import { LuMessageCircleQuestion, LuLightbulb, LuMoon, LuSun, LuLogOut, LuLayoutDashboard, LuWorkflow, LuSparkles, LuCalculator, LuChartGantt, LuChartLine, LuSettings, LuFileText, LuMenu, LuX, LuCloud, LuHardDrive, LuCircleAlert, LuLoaderCircle, LuCheck, LuFlaskConical } from "react-icons/lu";
import { StoreProvider, isTestData, useStore } from "./state/store";
import { Confirm, Toasts, cx } from "./components/ui";
import { useResolvedColorMode } from "./state/colorMode";
import { OverviewPage } from "./pages/Overview";
import { ProcessPage } from "./pages/Process";
import { ConsultantPage } from "./pages/Consultant";
import { SimulatorPage } from "./pages/Simulator";
import { RoadmapPage } from "./pages/Roadmap";
import { AnalyticsPage } from "./pages/Analytics";
import { SettingsPage } from "./pages/Settings";
import { ReportPage } from "./pages/Report";
import { LegalPage } from "./pages/Legal";
import { AssistantPage } from "./pages/Assistant";
import { WorkspacePage } from "./pages/Workspace";
import { WelcomePage } from "./pages/Welcome";

export type Route = "welcome" | "impressum" | "datenschutz" | "overview" | "process" | "consultant" | "simulator" | "roadmap" | "analytics" | "settings" | "report" | "assistant" | "workspace";

const NAV: { id: Route; label: string; icon: React.ReactNode; group: string }[] = [
  { id: "overview", label: "Executive Overview", icon: <LuLayoutDashboard />, group: "Analyze" },
  { id: "process", label: "Process Intelligence", icon: <LuWorkflow />, group: "Analyze" },
  { id: "consultant", label: "Transformation Consultant", icon: <LuSparkles />, group: "Design" },
  { id: "assistant", label: "Assistant", icon: <LuMessageCircleQuestion />, group: "Design" },
  { id: "workspace", label: "Creative Workspace", icon: <LuLightbulb />, group: "Design" },
  { id: "simulator", label: "Scenario Simulator", icon: <LuCalculator />, group: "Design" },
  { id: "roadmap", label: "Transformation Roadmap", icon: <LuChartGantt />, group: "Deliver" },
  { id: "analytics", label: "KPI & Impact", icon: <LuChartLine />, group: "Deliver" },
  { id: "report", label: "Report", icon: <LuFileText />, group: "Workspace" },
  { id: "settings", label: "Settings", icon: <LuSettings />, group: "Workspace" },
];

function readRoute(): Route {
  const h = location.hash.replace(/^#\/?/, "").split("?")[0] as Route;
  if (h === "welcome" || h === "impressum" || h === "datenschutz") return h;
  if ((h as string) === "demo") return "overview";
  return NAV.some((n) => n.id === h) ? h : "overview";
}

export function navigate(r: Route) {
  location.hash = `#/${r}`;
}

function SaveIndicator() {
  const { mode, saveState, saveError } = useStore();
  const where = mode === "server" ? "Server · this session only" : mode === "browser" ? "This tab only" : "Not stored";
  const icon =
    saveState === "saving" ? <LuLoaderCircle className="spin" /> : saveState === "error" ? <LuCircleAlert /> : mode === "server" ? <LuCloud /> : mode === "browser" ? <LuHardDrive /> : <LuCircleAlert />;
  const text = saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : saveState === "saved" ? "All changes saved" : "Autosave on";
  return (
    <div className={cx("save-ind", saveState === "error" && "save-err")} title={saveError ?? `Storage: ${where}`}>
      {icon}
      <div>
        <div>{mode === "memory" ? "Changes not saved" : text}</div>
        <div className="save-where">{where}</div>
      </div>
    </div>
  );
}

function Shell() {
  const [route, setRoute] = useState<Route>(readRoute());
  const [navOpen, setNavOpen] = useState(false);
  const { project, today, dispatch, endSession, resetProject } = useStore();
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    const on = () => {
      setRoute(readRoute());
      setNavOpen(false);
      document.querySelector(".main")?.scrollTo({ top: 0 });
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  useEffect(() => {
    const label = NAV.find((n) => n.id === route)?.label;
    if (label) document.title = `${label} · FLOWSTATE`;
  }, [route]);

  const resolvedMode = useResolvedColorMode(project.preferences.colorMode);
  useEffect(() => {
    document.documentElement.dataset.accent = project.preferences.accent;
  }, [project.preferences.accent]);

  if (route === "impressum" || route === "datenschutz") {
    return <LegalPage kind={route} onBack={() => (history.length > 1 ? history.back() : navigate(project.preferences.onboarded ? "overview" : "welcome"))} />;
  }

  if (route === "welcome" || !project.preferences.onboarded) {
    const enter = (r: string) => {
      if (!project.preferences.onboarded) dispatch({ type: "updatePrefs", patch: { onboarded: true } });
      const target = (NAV.some((n) => n.id === r) ? r : "overview") as Route;
      if (readRoute() === target) setRoute(target);
      else navigate(target);
      window.scrollTo({ top: 0 });
    };
    return (
      <>
        <WelcomePage onEnter={enter} />
        <Toasts />
      </>
    );
  }

  const groups = Array.from(new Set(NAV.map((n) => n.group)));
  const Page = { overview: OverviewPage, process: ProcessPage, consultant: ConsultantPage, assistant: AssistantPage, workspace: WorkspacePage, simulator: SimulatorPage, roadmap: RoadmapPage, analytics: AnalyticsPage, settings: SettingsPage, report: ReportPage }[route];

  return (
    <div className={cx("shell", project.preferences.density === "compact" && "density-compact")}>
      <a href="#main" className="skip">Skip to content</a>
      <aside className={cx("sidebar", navOpen && "sidebar-open")} aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark" aria-hidden><span /><span /><span /></div>
          <div>
            <div className="brand-name">FLOWSTATE</div>
            <div className="brand-sub">Transformation Intelligence</div>
          </div>
          <button className="icon-btn nav-close" onClick={() => setNavOpen(false)} aria-label="Close navigation"><LuX /></button>
        </div>
        <button className="workspace-pill" onClick={() => navigate("settings")} title="Change company in Settings">
          <span className="ws-text">
            <span className="ws-name">{project.company.name || "Add company name"}</span>
            <span className="ws-proj">{project.name}</span>
          </span>
        </button>
        <nav>
          {groups.map((g) => (
            <div key={g} className="nav-group">
              <div className="nav-group-label">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <a key={n.id} href={`#/${n.id}`} className={cx("nav-item", route === n.id && "nav-active")} aria-current={route === n.id ? "page" : undefined}>
                  <span className="nav-icon" aria-hidden>{n.icon}</span>
                  {n.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <SaveIndicator />
          <button className="end-session" onClick={() => setConfirmEnd(true)}><LuLogOut aria-hidden /> End session & delete data</button>
          <div className="demo-note">Session data · deleted when the session ends</div>
          <div className="legal-foot"><a href="#/impressum">Impressum</a> · <a href="#/datenschutz">Datenschutz</a></div>
        </div>
      </aside>
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}
      <div className="main-wrap">
        <header className="topbar">
          <button className="icon-btn nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open navigation"><LuMenu /></button>
          <div className="crumbs">
            {project.company.name && <><span className="crumb-muted">{project.company.name}</span>
            <span className="crumb-sep" aria-hidden>/</span></>}
            <span>{NAV.find((n) => n.id === route)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="asof" title="Reference date used for overdue calculations">As of {new Date(today + "T00:00:00Z").toLocaleDateString(project.preferences.locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" })}</span>
            <button className="icon-btn mode-toggle" aria-label={resolvedMode === "dark" ? "Switch to light mode" : "Switch to dark mode"} title={resolvedMode === "dark" ? "Light mode" : "Dark mode"} onClick={() => dispatch({ type: "updatePrefs", patch: { colorMode: resolvedMode === "dark" ? "light" : "dark" } })}>{resolvedMode === "dark" ? <LuSun /> : <LuMoon />}</button>
          </div>
        </header>
        <main className="main" id="main" tabIndex={-1}>
          {isTestData(project) && (
            <div className="demo-banner" role="note">
              <LuFlaskConical aria-hidden />
              <span><b>Demo</b>: fictional company (Hanse Präzisionsteile GmbH) with illustrative figures. Everything is editable; nothing is stored beyond this tab.</span>
              <button className="btn btn-sm btn-primary" onClick={async () => { await resetProject(); navigate("overview"); }}>Start with my own data</button>
            </div>
          )}
          <Page />
        </main>
      </div>
      <Confirm open={confirmEnd} danger title="End session and delete all data?" confirmLabel="Delete data" body="Everything entered in this session is deleted. Export the project in Settings first if you want to keep a copy." onCancel={() => setConfirmEnd(false)} onConfirm={async () => { setConfirmEnd(false); await endSession(); }} />
      <Toasts />
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

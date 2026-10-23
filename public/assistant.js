/* Guide assistant. Self contained, no network calls, no AI service: it answers from the fixed questions below. */
(function () {
  if (window.__eiGuide) return;
  window.__eiGuide = true;
  var C = {"id": "fs", "name": "Welle", "accent": "#6085f2", "ink": "#ffffff", "bg": "#0f1424", "fg": "#e8ecfa", "card": "#182038", "line": "#2f3a62", "mute": "#9fabd0", "avatar": "wave", "sub": ["Kurzanleitung zu FLOWSTATE", "Quick guide to FLOWSTATE"], "hello": ["Hallo, ich bin Welle. Ich erkläre dir, wie du ein Transformationsprojekt aufsetzt.", "Hi, I am Welle. I will explain how to set up a transformation project."], "qa": [{"q": ["Womit fange ich an?", "Where do I start?"], "a": ["FLOWSTATE startet leer. Beschreibe dein Problem, analysiere den Prozess und bekomme Engpässe und gerankte Maßnahmen.", "FLOWSTATE starts empty. Describe your problem, analyse the process and get bottlenecks and ranked interventions."], "k": ["anfang", "start", "begin", "erste", "first", "leer", "empty"]}, {"q": ["Was sind die drei Szenarien?", "What are the three scenarios?"], "a": ["Drei Transformationsszenarien mit transparenter ROI Rechnung. Du siehst die Annahmen und kannst sie ändern.", "Three transformation scenarios with transparent ROI maths. You see the assumptions and can change them."], "k": ["szenario", "scenario", "roi", "rechnung", "maths", "kosten", "cost"]}, {"q": ["Was passiert mit meinen Daten?", "What happens to my data?"], "a": ["Jede Sitzung ist privat. Die Daten werden nicht dauerhaft gespeichert und mit „End session & delete data“, nach Inaktivität oder beim Schließen gelöscht.", "Every session is private. Data is not stored permanently and is deleted with \"End session & delete data\", after inactivity or when you close the browser."], "k": ["daten", "data", "privat", "private", "sitzung", "session", "lösch", "delete", "speicher", "stored"]}, {"q": ["Gibt es einen Fahrplan?", "Is there a roadmap?"], "a": ["Ja, aus dem gewählten Szenario entsteht ein Umsetzungsplan, den du verfolgen kannst.", "Yes, the chosen scenario produces an implementation plan you can track."], "k": ["fahrplan", "roadmap", "plan", "umsetz", "implement", "aufgaben", "task"]}]};
  var AV = {
    diamond: '<path d="M16 3l11 8-11 18L5 11z" fill="currentColor"/><path d="M5 11h22L16 3z" fill="#fff" fill-opacity=".28"/>',
    coin: '<circle cx="16" cy="16" r="12" fill="currentColor"/><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><path d="M16 10v12M12 14h6a2 2 0 010 4h-6" stroke="#fff" stroke-opacity=".7" stroke-width="2" fill="none"/>',
    leaf: '<path d="M6 26C6 13 13 6 27 5c0 14-7 21-19 21z" fill="currentColor"/><path d="M8 24C13 17 18 13 24 9" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none"/>',
    compass: '<circle cx="16" cy="16" r="12" fill="currentColor"/><path d="M21 11l-3 7-7 3 3-7z" fill="#fff" fill-opacity=".8"/>',
    bars: '<rect x="5" y="17" width="5" height="10" rx="1" fill="currentColor"/><rect x="13.5" y="10" width="5" height="17" rx="1" fill="currentColor"/><rect x="22" y="4" width="5" height="23" rx="1" fill="currentColor"/>',
    wave: '<path d="M3 20c4-10 8-10 13 0s9 10 13 0" stroke="currentColor" stroke-width="4" fill="none" stroke-linecap="round"/>',
    hex: '<path d="M16 3l10 6v14l-10 6-10-6V9z" fill="currentColor"/><circle cx="16" cy="16" r="4" fill="#fff" fill-opacity=".75"/>',
    db: '<ellipse cx="16" cy="8" rx="10" ry="4" fill="currentColor"/><path d="M6 8v8c0 2.2 4.5 4 10 4s10-1.8 10-4V8c0 2.2-4.5 4-10 4S6 10.200 6 8z" fill="currentColor" fill-opacity=".8"/><path d="M6 16v8c0 2.2 4.5 4 10 4s10-1.8 10-4v-8c0 2.2-4.5 4-10 4S6 18.200 6 16z" fill="currentColor" fill-opacity=".6"/>',
    spark: '<path d="M16 3l3.500 9.500L29 16l-9.500 3.500L16 29l-3.500-9.500L3 16l9.500-3.500z" fill="currentColor"/>',
    nodes: '<circle cx="8" cy="9" r="4" fill="currentColor"/><circle cx="24" cy="9" r="4" fill="currentColor"/><circle cx="16" cy="24" r="4" fill="currentColor"/><path d="M8 9h16M8 9l8 15M24 9l-8 15" stroke="currentColor" stroke-width="2" fill="none"/>',
    blocks: '<rect x="4" y="4" width="11" height="11" rx="2" fill="currentColor"/><rect x="17" y="4" width="11" height="11" rx="2" fill="currentColor" fill-opacity=".7"/><rect x="4" y="17" width="11" height="11" rx="2" fill="currentColor" fill-opacity=".7"/><rect x="17" y="17" width="11" height="11" rx="2" fill="currentColor"/>'
  };
  function svg(n, s) {
    return '<svg viewBox="0 0 32 32" width="' + s + '" height="' + s + '" aria-hidden="true">' + (AV[n] || AV.spark) + '</svg>';
  }
  function lang() {
    var h = (location.hash || '').replace('#', '').slice(0, 2).toLowerCase();
    var l = (document.documentElement.lang || '').slice(0, 2).toLowerCase();
    var s = (h === 'de' || h === 'en' || h === 'ar') ? h : l;
    if (!s) { try { s = (navigator.language || 'en').slice(0, 2).toLowerCase(); } catch (e) { s = 'en'; } }
    return s === 'de' ? 'de' : 'en';
  }
  var T = {
    de: { open: 'Hilfe öffnen', close: 'Schließen', ph: 'Frage eingeben', send: 'Fragen', note: 'Kurzanleitung mit festen Antworten, kein KI Dienst. Es verlässt nichts diese Seite.', none: 'Dazu habe ich keine feste Antwort. Wähle eine der Fragen:', sug: 'Häufige Fragen' },
    en: { open: 'Open help', close: 'Close', ph: 'Type a question', send: 'Ask', note: 'Quick guide with fixed answers, not an AI service. Nothing leaves this page.', none: 'I have no fixed answer for that. Pick one of these:', sug: 'Common questions' }
  };
  var host = document.createElement('div');
  host.setAttribute('data-guide', C.id);
  var root = host.attachShadow({ mode: 'open' });
  var css = '' +
    ':host{all:initial}*{box-sizing:border-box;font-family:' + (C.font || 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif') + '}' +
    '.fab{position:fixed;right:18px;bottom:18px;z-index:2147483000;width:54px;height:54px;border-radius:50%;border:0;cursor:pointer;background:' + C.accent + ';color:' + C.ink + ';display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.28)}' +
    '.fab:focus-visible,.x:focus-visible,.chip:focus-visible,input:focus-visible,.go:focus-visible{outline:2px solid ' + C.accent + ';outline-offset:2px}' +
    '.panel{position:fixed;right:18px;bottom:84px;z-index:2147483000;width:min(360px,calc(100vw - 36px));max-height:min(540px,calc(100vh - 110px));display:none;flex-direction:column;background:' + C.bg + ';color:' + C.fg + ';border:1px solid ' + C.line + ';border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.35);overflow:hidden}' +
    '.panel.on{display:flex}' +
    '.hd{display:flex;align-items:center;gap:10px;padding:12px 14px;background:' + C.accent + ';color:' + C.ink + '}' +
    '.hd .av{width:34px;height:34px;border-radius:50%;background:' + C.ink + ';color:' + C.accent + ';display:grid;place-items:center;flex:none}' +
    '.hd b{display:block;font-size:14px;line-height:1.2}.hd span{display:block;font-size:11.500px;opacity:.85;line-height:1.3}' +
    '.x{margin-left:auto;border:0;background:transparent;color:inherit;font-size:22px;line-height:1;cursor:pointer;padding:4px 8px;border-radius:6px}' +
    '.log{flex:1;overflow:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px;font-size:13.500px;line-height:1.5}' +
    '.m{max-width:92%;padding:9px 12px;border-radius:12px;white-space:pre-line}' +
    '.bot{background:' + C.card + ';border:1px solid ' + C.line + ';align-self:flex-start}' +
    '.me{background:' + C.accent + ';color:' + C.ink + ';align-self:flex-end}' +
    '.sug{display:flex;flex-wrap:wrap;gap:6px}' +
    '.chip{border:1px solid ' + C.line + ';background:transparent;color:' + C.fg + ';font-size:12.500px;padding:6px 10px;border-radius:999px;cursor:pointer;text-align:left}' +
    '.chip:hover{border-color:' + C.accent + '}' +
    '.row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid ' + C.line + '}' +
    'input{flex:1;min-width:0;border:1px solid ' + C.line + ';background:' + C.card + ';color:' + C.fg + ';border-radius:8px;padding:8px 10px;font-size:13.500px}' +
    '.go{border:0;background:' + C.accent + ';color:' + C.ink + ';border-radius:8px;padding:8px 12px;font-size:13px;font-weight:600;cursor:pointer}' +
    '.note{font-size:11px;color:' + C.mute + ';padding:0 14px 10px;line-height:1.4}' +
    '@media (prefers-reduced-motion:no-preference){.panel.on{animation:u .16s ease-out}@keyframes u{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}}';
  try {
    var sh = new CSSStyleSheet(); sh.replaceSync(css); root.adoptedStyleSheets = [sh];
  } catch (e) {
    var st = document.createElement('style'); st.textContent = css; root.appendChild(st);
  }
  var wrap = document.createElement('div');
  root.appendChild(wrap);
  var fab = document.createElement('button');
  fab.className = 'fab'; fab.type = 'button'; fab.innerHTML = svg(C.avatar, 30);
  var panel = document.createElement('div');
  panel.className = 'panel'; panel.setAttribute('role', 'dialog');
  wrap.appendChild(fab); wrap.appendChild(panel);
  function I() { return L === 'de' ? 0 : 1; }
  var L, log, input, started = false;
  function qa() { return C.qa; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function say(txt, who) { var m = el('div', 'm ' + who, txt); log.appendChild(m); log.scrollTop = log.scrollHeight; }
  function chips(list) {
    var s = el('div', 'sug');
    list.forEach(function (it) {
      var b = el('button', 'chip', it.q[I()]); b.type = 'button';
      b.addEventListener('click', function () { say(it.q[I()], 'me'); say(it.a[I()], 'bot'); });
      s.appendChild(b);
    });
    log.appendChild(s); log.scrollTop = log.scrollHeight;
  }
  function score(text, it) {
    var t = text.toLowerCase(), n = 0;
    it.k.forEach(function (w) { if (t.indexOf(w) > -1) n += w.length > 4 ? 2 : 1; });
    return n;
  }
  function ask(text) {
    text = (text || '').trim(); if (!text) return;
    say(text, 'me');
    var best = null, bs = 0;
    qa().forEach(function (it) { var s = score(text, it); if (s > bs) { bs = s; best = it; } });
    if (best) say(best.a[I()], 'bot'); else { say(T[L].none, 'bot'); chips(qa()); }
  }
  function build() {
    L = lang();
    panel.innerHTML = '';
    panel.setAttribute('aria-label', C.name);
    fab.setAttribute('aria-label', T[L].open);
    var hd = el('div', 'hd');
    var av = el('div', 'av'); av.innerHTML = svg(C.avatar, 20);
    var nm = el('div'); nm.appendChild(el('b', '', C.name)); nm.appendChild(el('span', '', C.sub[I()]));
    var x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', T[L].close);
    x.addEventListener('click', toggle);
    hd.appendChild(av); hd.appendChild(nm); hd.appendChild(x);
    log = el('div', 'log'); log.setAttribute('aria-live', 'polite');
    var row = el('form', 'row');
    input = el('input'); input.type = 'text'; input.placeholder = T[L].ph; input.setAttribute('aria-label', T[L].ph);
    var go = el('button', 'go', T[L].send); go.type = 'submit';
    row.appendChild(input); row.appendChild(go);
    row.addEventListener('submit', function (e) { e.preventDefault(); var v = input.value; input.value = ''; ask(v); });
    panel.appendChild(hd); panel.appendChild(log); panel.appendChild(row);
    panel.appendChild(el('div', 'note', T[L].note));
    say(C.hello[I()], 'bot');
    chips(qa());
  }
  function toggle() {
    var on = panel.classList.toggle('on');
    fab.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { if (!started || L !== lang()) { build(); started = true; } input.focus(); }
  }
  fab.setAttribute('aria-expanded', 'false');
  fab.setAttribute('aria-label', 'Help');
  fab.addEventListener('click', toggle);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('on')) toggle(); });
  function mount() { document.body.appendChild(host); fab.setAttribute('aria-label', T[lang()].open); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();

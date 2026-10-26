# Erzeugt das Guide Video (en, de, ar) als Aufnahme der echten App. Aufruf: python3 scripts/make-guide-video.py en|de|ar
# Erst "node scripts/build.mjs" ausführen. Benötigt scripts/video_core.py.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from video_core import run

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEXT = {
 "en": [
  "Welcome to Flowstate. It helps you decide whether automating your invoice handling pays off, and then plan the change. Here is how to use it in one minute.",
  "You can start with your own data or with test data. We use the test data.",
  "At the top you see the goal and three steps: know today, compare options, plan and track.",
  "The workspace view answers four questions on one page: does it pay off, what changes, is the project on track, and where does the money go.",
  "The assistant view is for quick answers. Pick a question and you get one answer from your own figures.",
  "The focus view shows only the next three tasks that need you today.",
  "In the simulator you compare three options and see savings and payback. Every figure is an estimate from your inputs.",
  "The roadmap turns your choice into tasks, owners and milestones. That is all. Good luck."],
 "de": [
  "Willkommen bei Flowstate. Hier entscheiden Sie, ob sich die Automatisierung Ihrer Rechnungsbearbeitung lohnt, und planen die Umsetzung. So nutzen Sie es in einer Minute.",
  "Sie können mit eigenen Daten oder mit Testdaten starten. Wir nehmen die Testdaten.",
  "Oben sehen Sie das Ziel und drei Schritte: heute kennen, Optionen vergleichen, planen und verfolgen.",
  "Die Workspace Ansicht beantwortet vier Fragen auf einer Seite: lohnt es sich, was ändert sich, läuft das Projekt, und wohin geht das Geld.",
  "Die Assistant Ansicht ist für schnelle Antworten. Wählen Sie eine Frage und bekommen Sie eine Antwort aus Ihren Zahlen.",
  "Die Focus Ansicht zeigt nur die nächsten drei Aufgaben, die heute Sie brauchen.",
  "Im Simulator vergleichen Sie drei Optionen und sehen Ersparnis und Amortisation. Jede Zahl ist eine Schätzung aus Ihren Angaben.",
  "Der Fahrplan macht Ihre Wahl zu Aufgaben, Verantwortlichen und Meilensteinen. Das ist alles. Viel Erfolg."],
 "ar": [
  "مرحبًا بك في Flowstate. هنا تقرر ما إذا كانت أتمتة معالجة الفواتير مجدية، ثم تخطط للتنفيذ. إليك طريقة الاستخدام في دقيقة.",
  "يمكنك البدء ببياناتك أو ببيانات تجريبية. سنستخدم البيانات التجريبية.",
  "في الأعلى ترى الهدف وثلاث خطوات: اعرف الوضع الحالي، قارن الخيارات، خطط وتابع.",
  "عرض Workspace يجيب عن أربعة أسئلة في صفحة واحدة: هل هو مجدٍ، ما الذي يتغير، هل المشروع على المسار، وأين يذهب المال.",
  "عرض Assistant للإجابات السريعة. اختر سؤالًا واحصل على إجابة واحدة من أرقامك.",
  "عرض Focus يُظهر فقط المهام الثلاث التالية التي تحتاجك اليوم.",
  "في المحاكي تقارن ثلاثة خيارات وترى التوفير ومدة الاسترداد. كل رقم هو تقدير من بياناتك.",
  "الخطة تحوّل اختيارك إلى مهام ومسؤولين ومراحل. هذا كل شيء. بالتوفيق."],
}


def scene(i, h):
    if i == 0: h.pg.mouse.move(700, 300, steps=10); h.wait(1500)
    elif i == 1: h.go("button.wl-go:has-text('test data')", click=True); h.pg.wait_for_selector(".ov-path"); h.wait(800)
    elif i == 2: h.go(".ov-step >> nth=0", click=False); h.wait(1200); h.go(".ov-step >> nth=2", click=False)
    elif i == 3: h.go(".ov-switch .seg >> nth=0", click=True); h.wait(800); h.scroll_to("#ov-b2", 90); h.wait(2500); h.scroll_to("#ov-b4", 90)
    elif i == 4: h.pg.evaluate("window.scrollTo({top:0})"); h.wait(700); h.go("button.seg:has-text('Assistant')", click=True); h.wait(700); h.go(".ov-ask >> nth=1", click=True)
    elif i == 5: h.pg.evaluate("window.scrollTo({top:0})"); h.go("button.seg:has-text('Focus')", click=True); h.wait(1000); h.go(".ov-focus-list button >> nth=0", click=False)
    elif i == 6: h.go("a.nav-item:has-text('Scenario Simulator')", click=True); h.wait(2500); h.pg.evaluate("window.scrollTo({top:500,behavior:'smooth'})")
    elif i == 7: h.go("a.nav-item:has-text('Transformation Roadmap')", click=True); h.wait(1500); h.pg.evaluate("window.scrollTo({top:400,behavior:'smooth'})")


if __name__ == "__main__":
    L = sys.argv[1] if len(sys.argv) > 1 else "en"
    run("guide", L, TEXT, scene, os.path.join(ROOT, "dist"), os.path.join(ROOT, "public/video"), start_hash="#/welcome", ready_sel="button.wl-go", poster_scene=2)

import React, { useState } from "react";
import { LuMessageCircleQuestion, LuArrowRight, LuLoaderCircle, LuSend } from "react-icons/lu";
import { useStore } from "../state/store";
import { Button, Card, DataTag, PageHeader, cx } from "../components/ui";
import { QUESTIONS, answer, type Answer, type QuestionId } from "../../domain/assistant";
import { navigate } from "../app";
import { GoalCoach } from "../components/GoalCoach";
import { claudeSample, sampleErrorMessage } from "../ai/claude";

interface Turn { q: string; a: Answer | null; text?: string; model?: string }

function projectFacts(a: Record<QuestionId, Answer>): string {
  return (Object.keys(a) as QuestionId[]).map((k) => `${a[k].headline}\n- ${a[k].points.join("\n- ")}`).join("\n\n");
}

export function AssistantPage() {
  const { project: p, selectedResult: r, today, ai } = useStore();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [free, setFree] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = (id: QuestionId) => {
    const q = QUESTIONS.find((x) => x.id === id)!;
    setTurns((t) => [{ q: q.label, a: answer(id, p, r, today) }, ...t]);
  };

  const askFree = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = free.trim();
    if (!q || loading) return;
    setError(null);
    setLoading(true);
    try {
      const sample = await claudeSample();
      if (!sample) throw new Error("Claude is not available in this view.");
      const facts = projectFacts(Object.fromEntries(QUESTIONS.map((x) => [x.id, answer(x.id, p, r, today)])) as Record<QuestionId, Answer>);
      const prompt = `You are an assistant inside a process automation planning tool. Answer the question using ONLY the project facts below. If the facts do not contain the answer, say so. Do not invent numbers. Be concise (max 120 words).\n\nProject facts:\n${facts}\n\nQuestion: ${q}`;
      const out = await sample(prompt, { modelTier: "default", cache: false });
      setTurns((t) => [{ q, a: null, text: out.text, model: "Claude" }, ...t]);
      setFree("");
    } catch (err) {
      setError(sampleErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Assistant" title="Ask your project" description={<>Short answers built from your own numbers: process map, selected scenario and roadmap. Figures are <DataTag kind="estimate" /> calculated from your inputs.</>} />
      <GoalCoach />
      <h2 className="coach-qa-title">Ask a question</h2>
      <div className="grid-consult">
        <Card title="Questions" subtitle="Pick one. The answer shows where the numbers come from.">
          <div className="ask-list">
            {QUESTIONS.map((q) => (
              <button key={q.id} type="button" className="ask-btn" onClick={() => ask(q.id)}>
                <LuMessageCircleQuestion aria-hidden /> {q.label}
              </button>
            ))}
          </div>
          {ai.available && (
            <form onSubmit={askFree} className="ask-free">
              <label className="field-label" htmlFor="ask-free">Your own question</label>
              <textarea id="ask-free" className="input" rows={3} maxLength={400} value={free} onChange={(e) => setFree(e.target.value)} placeholder="e.g. Which step should we automate first and why?" />
              <p className="small muted">Sends a summary of your project facts to Claude via your claude.ai account. Answers use only those facts.</p>
              {error && <div className="callout callout-danger" role="alert">{error}</div>}
              <Button variant="primary" type="submit" disabled={loading || !free.trim()} icon={loading ? <LuLoaderCircle className="spin" /> : <LuSend />}>{loading ? "Waiting for Claude…" : "Ask Claude"}</Button>
            </form>
          )}
          {!ai.available && <p className="small muted ask-note">Answers are calculated in your browser. Nothing is sent anywhere.</p>}
        </Card>
        <div className="stack" aria-live="polite">
          {turns.length === 0 ? (
            <Card><div className="empty"><LuMessageCircleQuestion aria-hidden /><h3>No question yet</h3><p>Choose a question on the left.</p></div></Card>
          ) : (
            turns.map((t, i) => (
              <Card key={turns.length - i} title={t.q} subtitle={t.a ? "Calculated from your project data" : `${t.model} · based on your project facts, review before use`}>
                {t.a ? (
                  <>
                    <p className={cx("ans-head")}>{t.a.headline}</p>
                    <ul className="ans-list">{t.a.points.map((x, k) => <li key={k}>{x}</li>)}</ul>
                    {t.a.link && <Button size="sm" icon={<LuArrowRight />} onClick={() => navigate(t.a!.link!.route)}>{t.a.link.label}</Button>}
                  </>
                ) : (
                  <p className="ans-text">{t.text}</p>
                )}
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

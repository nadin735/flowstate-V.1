import React, { useState } from "react";
import { LuLightbulb, LuPlus, LuTrash2, LuArrowRight, LuArrowLeft, LuListPlus } from "react-icons/lu";
import { useStore } from "../state/store";
import { Badge, Button, Card, Field, PageHeader, cx } from "../components/ui";
import { IdeaSchema, type Idea, type IdeaStage } from "../../domain/types";
import { navigate } from "../app";

const COLUMNS: { stage: IdeaStage; title: string; hint: string }[] = [
  { stage: "inbox", title: "Inbox", hint: "Just captured" },
  { stage: "exploring", title: "Exploring", hint: "Worth a closer look" },
  { stage: "promoted", title: "On roadmap", hint: "Became a task" },
];

export function WorkspacePage() {
  const { project: p, dispatch, toast } = useStore();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [stepId, setStepId] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const idea: Idea = { id: `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, title: title.trim(), note: note.trim(), stepId: stepId || null, stage: "inbox", createdAt: new Date().toISOString() };
    const parsed = IdeaSchema.safeParse(idea);
    if (!parsed.success) return;
    dispatch({ type: "addIdea", idea: parsed.data });
    setTitle(""); setNote(""); setStepId(""); setSubmitted(false);
  };
  const titleError = submitted && title.trim().length < 2 ? "Title needs at least 2 characters" : undefined;
  const stepName = (id: string | null) => p.process.steps.find((s) => s.id === id)?.name;
  const order: IdeaStage[] = ["inbox", "exploring"];
  const move = (i: Idea, dir: -1 | 1) => {
    const next = order[order.indexOf(i.stage) + dir];
    if (next) dispatch({ type: "updateIdea", id: i.id, patch: { stage: next } });
  };
  const promote = (i: Idea) => {
    if (p.phases.length === 0) { toast({ tone: "warning", title: "No roadmap phases yet", body: "Create the roadmap first." }); return; }
    dispatch({ type: "promoteIdea", id: i.id });
    toast({ tone: "success", title: "Added to roadmap", body: `“${i.title}” is now a task.` });
  };

  return (
    <div className="page">
      <PageHeader eyebrow="Creative Workspace" title="Capture ideas, then decide" description="Collect improvement ideas, link them to a process step and move the good ones onto the roadmap. Ideas are saved with the project." />
      <div className="ws-layout">
        <Card title="New idea">
          <form onSubmit={add} noValidate>
            <Field label="Idea" htmlFor="idea-title" error={titleError}>
              <input id="idea-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!titleError} placeholder="e.g. Read invoice data with OCR at the mailbox" />
            </Field>
            <Field label="Notes (optional)" htmlFor="idea-note">
              <textarea id="idea-note" className="input" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <Field label="Related process step (optional)" htmlFor="idea-step">
              <select id="idea-step" className="input select" value={stepId} onChange={(e) => setStepId(e.target.value)}>
                <option value="">None</option>
                {p.process.steps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Button variant="primary" type="submit" className="w-full" icon={<LuPlus />}>Add idea</Button>
          </form>
        </Card>
        <div className="ws-board">
          {p.ideas.length === 0 && (
            <div className="empty ws-empty"><LuLightbulb aria-hidden /><h3>No ideas yet</h3><p>Write down the first one on the left. You can also adopt recommendations in the <button type="button" className="link-btn" onClick={() => navigate("consultant")}>Consultant</button>.</p></div>
          )}
          <div className="ws-cols">
            {COLUMNS.map((c) => {
              const list = p.ideas.filter((i) => i.stage === c.stage);
              return (
                <section key={c.stage} className="ws-col" aria-label={c.title}>
                  <header><b>{c.title}</b><Badge>{list.length}</Badge><span className="small muted">{c.hint}</span></header>
                  {list.map((i) => (
                    <article key={i.id} className={cx("idea", c.stage === "promoted" && "idea-done")}>
                      <h4>{i.title}</h4>
                      {i.note && <p>{i.note}</p>}
                      {stepName(i.stepId) && <span className="chip">{stepName(i.stepId)}</span>}
                      <div className="idea-actions">
                        {c.stage !== "promoted" && (
                          <>
                            {c.stage === "exploring" && <Button size="sm" variant="ghost" aria-label={`Move “${i.title}” back to inbox`} icon={<LuArrowLeft />} onClick={() => move(i, -1)} />}
                            {c.stage === "inbox" && <Button size="sm" variant="ghost" aria-label={`Explore “${i.title}”`} icon={<LuArrowRight />} onClick={() => move(i, 1)}>Explore</Button>}
                            <Button size="sm" icon={<LuListPlus />} onClick={() => promote(i)}>To roadmap</Button>
                          </>
                        )}
                        {c.stage === "promoted" && <Button size="sm" variant="ghost" onClick={() => navigate("roadmap")}>Open roadmap</Button>}
                        <Button size="sm" variant="ghost" aria-label={`Delete “${i.title}”`} icon={<LuTrash2 />} onClick={() => dispatch({ type: "deleteIdea", id: i.id })} />
                      </div>
                    </article>
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

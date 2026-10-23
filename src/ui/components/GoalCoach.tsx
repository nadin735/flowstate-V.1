import React, { useMemo, useState } from "react";
import { LuTarget, LuArrowRight, LuPlus, LuCheck, LuLightbulb } from "react-icons/lu";
import { useStore } from "../state/store";
import { Button, Card, DataTag, cx } from "./ui";
import { GOALS, coach, detectGoal, type CoachRec, type GoalId } from "../../domain/coach";
import { navigate } from "../app";

/** Goal dashboard: pick or describe a goal, get recommendations and next steps from the project's own numbers. */
export function GoalCoach() {
  const { project: p, results, selectedResult: r, today, dispatch } = useStore();
  const [goal, setGoal] = useState<GoalId>("cost");
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  const plan = useMemo(() => coach(goal, p, results, r, today), [goal, p, results, r, today]);

  const describe = (e: React.FormEvent) => {
    e.preventDefault();
    const g = detectGoal(text);
    if (g) {
      setGoal(g);
      setNote(`Understood as “${GOALS.find((x) => x.id === g)!.label}”.`);
    } else {
      setNote("I could not match that to a goal. Pick one of the goals above.");
    }
  };

  const apply = (rec: CoachRec) => {
    const c = rec.cta;
    if (c.kind === "scenario") {
      dispatch({ type: "selectScenario", id: c.id as never });
      setDone((d) => ({ ...d, [rec.id]: "Scenario selected" }));
    } else if (c.kind === "idea") {
      const id = `i${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
      dispatch({ type: "addIdea", idea: { id, title: c.title, note: c.note.slice(0, 600), stepId: c.stepId, stage: "exploring", createdAt: new Date().toISOString() } });
      dispatch({ type: "promoteIdea", id });
      setDone((d) => ({ ...d, [rec.id]: "Added to the roadmap" }));
    } else {
      navigate(c.route);
    }
  };

  return (
    <section className="coach" aria-label="Goal coach">
      <Card title="What do you want to achieve?" subtitle="Pick a goal or describe it. Recommendations use your own process, scenarios and roadmap." actions={<DataTag kind="estimate" />}>
        <div className="coach-goals" role="radiogroup" aria-label="Goal">
          {GOALS.map((g) => (
            <button key={g.id} type="button" role="radio" aria-checked={goal === g.id} className={cx("coach-goal", goal === g.id && "coach-goal-on")} onClick={() => { setGoal(g.id); setNote(null); }}>
              <LuTarget aria-hidden />
              <span><b>{g.label}</b><small>{g.hint}</small></span>
            </button>
          ))}
        </div>
        <form className="coach-form" onSubmit={describe}>
          <label className="field-label" htmlFor="coach-text">Or describe your goal in your own words</label>
          <div className="coach-row">
            <input id="coach-text" className="input" value={text} maxLength={160} onChange={(e) => setText(e.target.value)} placeholder="e.g. We want to pay invoices faster and make fewer mistakes" />
            <Button type="submit" disabled={!text.trim()}>Use this goal</Button>
          </div>
          {note && <p className="small muted" role="status">{note}</p>}
        </form>
      </Card>

      <div className="coach-result" aria-live="polite">
        <Card title={plan.headline}>
          {plan.facts.length > 0 && (
            <div className="coach-facts">
              {plan.facts.map((f) => (<div key={f.label}><span>{f.label}</span><b>{f.value}</b></div>))}
            </div>
          )}
          <h3 className="subhead">Recommended for this goal</h3>
          <ul className="coach-recs">
            {plan.recs.map((rec) => (
              <li key={rec.id}>
                <div>
                  <p className="coach-rec-title">{rec.title}</p>
                  <p className="small muted">{rec.why}</p>
                  {rec.impact && <p className="small"><b>{rec.impact}</b></p>}
                </div>
                {done[rec.id] ? (
                  <span className="coach-done"><LuCheck aria-hidden /> {done[rec.id]}</span>
                ) : (
                  <Button size="sm" icon={rec.cta.kind === "route" ? <LuArrowRight /> : rec.cta.kind === "idea" ? <LuPlus /> : <LuLightbulb />} onClick={() => apply(rec)}>
                    {rec.cta.kind === "route" ? rec.cta.label : rec.cta.kind === "idea" ? "Add to roadmap" : "Use this scenario"}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <h3 className="subhead">Your next steps</h3>
          <ol className="coach-steps">{plan.steps.map((s, i) => (<li key={i}>{s}</li>))}</ol>
        </Card>
      </div>
    </section>
  );
}

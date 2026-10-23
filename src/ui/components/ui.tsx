import React, { useEffect, useId, useRef, useState } from "react";
import { LuX, LuCircleCheck, LuTriangleAlert, LuInfo, LuCircleAlert } from "react-icons/lu";
import { useToasts } from "../state/store";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "violet";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary", size = "md", icon, children, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md"; icon?: React.ReactNode }) {
  return (
    <button type="button" className={cx("btn", `btn-${variant}`, size === "sm" && "btn-sm", className)} {...rest}>
      {icon && <span className="btn-icon" aria-hidden>{icon}</span>}
      {children}
    </button>
  );
}

export function Card({ title, subtitle, actions, children, className, pad = true, id }: { title?: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; pad?: boolean; id?: string }) {
  return (
    <section className={cx("card", className)} id={id}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2 className="card-title">{title}</h2>}
            {subtitle && <p className="card-sub">{subtitle}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={cx(pad && "card-body")}>{children}</div>
    </section>
  );
}

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return <span className={cx("badge", `badge-${tone}`)}>{dot && <span className="badge-dot" />}{children}</span>;
}

/** Marks a value as input / estimate / simulated / measured. */
export function DataTag({ kind }: { kind: "input" | "estimate" | "simulated" | "measured" }) {
  const map = { input: ["Input", "neutral"], estimate: ["Estimate", "violet"], simulated: ["Simulated", "violet"], measured: ["Measured", "neutral"] } as const;
  const [label, tone] = map[kind];
  return <span className={cx("datatag", `datatag-${tone}`)} title={kind === "input" ? "Value you entered" : kind === "measured" ? "Measurement you recorded" : "Calculated estimate, not a measured outcome"}>{label}</span>;
}

export function Stat({ label, value, sub, tag, trend, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tag?: React.ReactNode; trend?: { text: string; good: boolean } | null; tone?: "accent" }) {
  return (
    <div className={cx("stat", tone === "accent" && "stat-accent")}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {tag}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-foot">
        {trend && <span className={cx("trend", trend.good ? "trend-good" : "trend-bad")}>{trend.text}</span>}
        {sub && <span className="stat-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function Progress({ value, tone = "accent", label }: { value: number; tone?: Tone; label?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div className={cx("progress", `progress-${tone}`)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}>
      <div className="progress-bar" style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor, aside }: { label: string; hint?: React.ReactNode; error?: string; children: React.ReactNode; htmlFor?: string; aside?: React.ReactNode }) {
  return (
    <div className={cx("field", error && "field-error")}>
      <div className="field-label-row">
        <label className="field-label" htmlFor={htmlFor}>{label}</label>
        {aside}
      </div>
      {children}
      {error ? <p className="field-msg" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

/**
 * Number input with optional slider. Keeps a local text buffer so the user can
 * type freely; commits only valid, clamped values and shows inline validation.
 */
export function NumberInput({
  label, value, onChange, min, max, step = 1, unit, hint, slider = false, scale = 1, digits, aside, id: idProp, disabled, sliderMax,
}: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; unit?: string; hint?: React.ReactNode;
  slider?: boolean; scale?: number; digits?: number; aside?: React.ReactNode; id?: string; disabled?: boolean; sliderMax?: number;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const shown = value * scale;
  const d = digits ?? (step * scale < 1 ? String(step * scale).split(".")[1]?.length ?? 1 : 0);
  const [text, setText] = useState(shown.toFixed(d));
  const [error, setError] = useState<string | undefined>();
  const focused = useRef(false);
  const lastSent = useRef<number | null>(null);
  useEffect(() => {
    // Resync when not editing, or when the value changed from elsewhere (e.g. another step selected).
    const external = lastSent.current === null || Math.abs(shown - lastSent.current) > 1e-9;
    if (!focused.current || external) {
      setText(shown.toFixed(d));
      setError(undefined);
      lastSent.current = null;
    }
  }, [shown, d]);
  const lo = min * scale;
  const hi = max * scale;
  const sHi = Math.max(shown, (sliderMax ?? max) * scale);
  const commit = (raw: string) => {
    const n = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(n)) {
      setError("Enter a number");
      return;
    }
    if (n < lo || n > hi) {
      setError(`Allowed range ${lo.toLocaleString()}–${hi.toLocaleString()}${unit ? " " + unit : ""}`);
      return;
    }
    setError(undefined);
    lastSent.current = n;
    onChange(n / scale);
  };
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} aside={aside}>
      <div className="num-row">
        {slider && (
          <input
            type="range" className="range" min={lo} max={sHi} step={step * scale} value={Math.min(sHi, Math.max(lo, shown))} disabled={disabled}
            aria-label={`${label} slider`}
            onChange={(e) => onChange(Number(e.target.value) / scale)}
            style={{ ["--fill" as string]: `${((Math.min(sHi, Math.max(lo, shown)) - lo) / (sHi - lo || 1)) * 100}%` }}
          />
        )}
        <div className={cx("num-input", slider && "num-input-compact")}>
          <input
            id={id} inputMode="decimal" value={text} disabled={disabled} aria-invalid={!!error}
            onFocus={(e) => {
              focused.current = true;
              // Typing should replace the value: an empty field for 0 ("0.0" + "42" must not become 0.042),
              // otherwise the current value is selected.
              if (shown === 0) setText("");
              else e.currentTarget.select();
            }}
            onChange={(e) => {
              setText(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => {
              focused.current = false;
              if (!error || text.trim() === "") {
                setError(undefined);
                setText(shown.toFixed(d));
              }
            }}
          />
          {unit && <span className="num-unit">{unit}</span>}
        </div>
      </div>
    </Field>
  );
}

export function TextInput({ label, value, onChange, error, hint, multiline, id: idProp, maxLength, placeholder, type = "text" }: { label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; multiline?: boolean; id?: string; maxLength?: number; placeholder?: string; type?: string }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field label={label} error={error} hint={hint} htmlFor={id}>
      {multiline ? (
        <textarea id={id} className="input" rows={4} value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      ) : (
        <input id={id} type={type} className="input" value={value} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
      )}
    </Field>
  );
}

export function Select<T extends string>({ label, value, onChange, options, id: idProp, hint }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; id?: string; hint?: string }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <select id={id} className="input select" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={cx("seg", value === o.value && "seg-on")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, id: idProp }: { checked: boolean; onChange: (v: boolean) => void; label: string; id?: string }) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <label className="switch-row" htmlFor={id}>
      <span>{label}</span>
      <button id={id} type="button" role="switch" aria-label={label} aria-checked={checked} className={cx("switch", checked && "switch-on")} onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </label>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => ref.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={cx("modal", wide && "modal-wide")} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close dialog"><LuX /></button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({ open, title, body, confirmLabel, danger, onConfirm, onCancel }: { open: boolean; title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} footer={<><Button onClick={onCancel}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="confirm-body">{body}</div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts, dismiss } = useToasts();
  const icon = { success: <LuCircleCheck />, error: <LuCircleAlert />, warning: <LuTriangleAlert />, info: <LuInfo /> };
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx("toast", `toast-${t.tone}`)} role={t.tone === "error" ? "alert" : "status"}>
          <span className="toast-icon" aria-hidden>{icon[t.tone]}</span>
          <div className="toast-text">
            <strong>{t.title}</strong>
            {t.body && <p>{t.body}</p>}
          </div>
          <button className="icon-btn" onClick={() => dismiss(t.id)} aria-label="Dismiss notification"><LuX /></button>
        </div>
      ))}
    </div>
  );
}

export function Empty({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon" aria-hidden>{icon}</div>}
      <strong>{title}</strong>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function LevelBadge({ level, kind }: { level: "low" | "medium" | "high"; kind: "priority" | "risk" | "level" }) {
  const tone: Tone = level === "high" ? (kind === "priority" ? "accent" : "danger") : level === "medium" ? "warning" : "neutral";
  return <Badge tone={tone}>{kind === "risk" ? "Risk " : ""}{level[0].toUpperCase() + level.slice(1)}</Badge>;
}

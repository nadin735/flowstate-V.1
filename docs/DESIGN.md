# FLOWSTATE — Design

## Principles
- Calm, data-first workspace: content on white cards over a light grey ground, no decoration that does not carry meaning.
- One primary action per screen; secondary actions as outline buttons.
- Labels in sentence case, numbers as digits, short titles.
- Animation only where it explains or gives feedback (toasts, dialogs, progress). The welcome background is the single decorative motion and respects "reduce motion".

## Colours (default theme "Electric blue", light)
| Token | Value | Use |
|---|---|---|
| `--bg` | `#f4f5f8` | page ground |
| `--surface` | `#ffffff` | cards |
| `--surface-2` | `#f8f9fb` | table headers, inset areas |
| `--border` | `#e3e6ec` | inputs, dividers |
| `--text` | `#0e1525` | primary text |
| `--text-2` | `#4a5468` | secondary text |
| `--text-3` | `#626d82` | muted text (≥ 4.5:1 on white) |
| `--accent` | `#3b5bfd` | primary actions, active states |
| `--success` / `--success-ink` | `#12a065` / `#0b5c3a` | positive values; ink for text on light |
| `--warning` / `--warning-ink` | `#d97a06` / `#8a4b02` | warnings |
| `--danger` / `--danger-ink` | `#e0444a` / `#9b2227` | bottleneck, errors |
| `--nav` | `#0a1222` | sidebar |

Themes: Electric blue (default), Forest, Neon yellow — each with a dark variant (`data-accent`, `data-mode`). Dark ground `#0b0f1a`. All themes pass WCAG AA (`npm run a11y`).

Welcome background: animated topology lines `#00dfff` on `#eaeaea` (dark: on `#0b0f1a`), implemented in `src/ui/components/vanta.ts`.

## Typography
- **Inter** (self-hosted, weights 400/500/600/700, OFL). Monospace only for formulas and code.
- Page title 26–28 px / 700; card title 15 px / 650; body 13–15 px; small 11.5–12.5 px.
- Tabular figures for numbers in tables and stats.

## Spacing and shape
- Base spacing 4 px; card padding `--pad` (20 px); page padding 28 px (16 px on phones).
- Radius: cards 10 px (`--radius`), inputs/buttons 7 px (`--radius-sm`), chips 999 px.
- Shadow: soft single shadow on cards (light mode, no border); stronger shadow only for dialogs and toasts.

## Components
Button (primary / secondary / ghost / danger, sm / md) · Card (title, subtitle, actions) · Field + NumberInput (label, unit, hint, inline error, optional slider) · Segmented · Switch · Badge (status only) · DataTag (Input / Estimate / Simulated / Measured) · Modal · Confirm · Toast · Stat · Progress · Ring · HBars / LineChart / BarChart / Sparkline · Empty state.

## Layout
- Desktop: fixed dark sidebar (navigation, save state, end session, legal links) + sticky white top bar + content.
- Phone (< 900 px): sidebar becomes a drawer; tables scroll horizontally with a sticky first column.

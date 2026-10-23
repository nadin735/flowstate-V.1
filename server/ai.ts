/**
 * AI endpoints shared by the Node server (server.ts) and the Vercel functions (vercel.ts):
 * request validation, the Anthropic Messages API call and schema validation of the answer.
 * The API key is only ever read here, on the server side.
 */
import { z } from "zod";
import { ProjectSchema, RecommendationSchema } from "../src/domain/types";
import { CONSTRAINTS, PROBLEMS } from "../src/domain/recommendations";
import { buildRecommendationPrompt, coerceRecommendations, EXTRACT_INSTRUCTIONS } from "../src/domain/aiPrompt";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export interface AiConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export function aiConfigFromEnv(): AiConfig {
  return {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    model: process.env.FLOWSTATE_AI_MODEL || "claude-sonnet-5-5",
    timeoutMs: Number(process.env.FLOWSTATE_AI_TIMEOUT_MS || 45000),
  };
}

/** Sliding one-minute window; returns true when the caller has used up its budget. */
export function rateLimited(hits: number[], now = Date.now(), perMinute = 6): boolean {
  while (hits.length && now - hits[0] >= 60_000) hits.shift();
  if (hits.length >= perMinute) return true;
  hits.push(now);
  return false;
}

const RecRequest = z.object({
  project: ProjectSchema,
  request: z.object({
    problem: z.enum(PROBLEMS.map((p) => p.id) as [string, ...string[]]),
    description: z.string().min(1).max(4000),
    constraints: z.array(z.enum(CONSTRAINTS.map((c) => c.id) as [string, ...string[]])).max(10),
    budgetCap: z.number().positive().nullable(),
  }),
});

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object in model response");
  return JSON.parse(text.slice(start, end + 1));
}

async function callClaude(cfg: AiConfig, body: Record<string, unknown>, label: string) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: cfg.model, ...body }),
    });
  } catch (e) {
    throw new HttpError(504, (e as Error).name === "AbortError" ? "AI request timed out" : "Could not reach the AI service");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[ai] ${label} upstream ${response.status}: ${detail.slice(0, 300)}`);
    const hint = response.status === 401 ? " — check ANTHROPIC_API_KEY" : response.status === 404 ? " — check FLOWSTATE_AI_MODEL" : "";
    throw new HttpError(502, `AI service returned ${response.status}${hint}`);
  }
  const data = (await response.json()) as { content?: { type: string; text?: string }[]; model?: string };
  const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  return { text, model: data.model || cfg.model };
}

export async function runRecommendations(cfg: AiConfig, raw: unknown) {
  if (!cfg.apiKey) throw new HttpError(503, "AI is not configured on this server. Set ANTHROPIC_API_KEY.");
  const parsed = RecRequest.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, `Invalid request: ${parsed.error.issues[0].path.join(".")} ${parsed.error.issues[0].message}`);
  const { system, user } = buildRecommendationPrompt(parsed.data.project, parsed.data.request);
  const { text, model } = await callClaude(cfg, { max_tokens: 4000, system, messages: [{ role: "user", content: user }] }, "recommendations");
  let items: unknown;
  try {
    items = (extractJson(text) as { items?: unknown }).items;
  } catch (e) {
    throw new HttpError(502, `AI response was not valid JSON (${(e as Error).message})`);
  }
  const valid = z.array(RecommendationSchema).min(1).max(10).safeParse(coerceRecommendations(items));
  if (!valid.success) throw new HttpError(502, "AI response did not match the recommendation schema");
  const cap = parsed.data.request.budgetCap;
  return { model, items: valid.data.filter((r) => cap === null || r.investment <= cap) };
}

const ExtractRequest = z.object({ filename: z.string().max(200), pdfBase64: z.string().min(100).max(14_000_000) });

export async function runExtract(cfg: AiConfig, raw: unknown) {
  if (!cfg.apiKey) throw new HttpError(503, "AI is not configured on this server.");
  const parsed = ExtractRequest.safeParse(raw);
  if (!parsed.success) throw new HttpError(422, "Invalid request");
  if (!Buffer.from(parsed.data.pdfBase64.slice(0, 8), "base64").toString("latin1").startsWith("%PDF")) throw new HttpError(422, "Not a PDF file");
  const { text, model } = await callClaude(
    cfg,
    {
      max_tokens: 1500,
      messages: [{ role: "user", content: [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: parsed.data.pdfBase64 } }, { type: "text", text: EXTRACT_INSTRUCTIONS }] }],
    },
    "extract",
  );
  return { model, text: text.slice(0, 20_000) };
}

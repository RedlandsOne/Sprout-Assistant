import { profile } from "./memory.js";
import { snapshot, peripherals, senses } from "./system.js";

const API_KEY = process.env.GEMINI_API_KEY;
const FAST = "gemini-flash-lite-latest";
const SMART = "gemini-3.8-flash";

interface Turn { role: "user" | "model"; text: string; }
const history: Turn[] = []; // short-term conversation memory (this session)

const HARDWARE_RE =
  /\b(plug|plugged|usb|accessor|wifi|wi-?fi|network|bluetooth|monitor|display|screen|device|connected|headphone|airpod|mouse|keyboard|webcam|camera|charger)\b/i;
const DEVICES_RE =
  /\b(usb|accessor|bluetooth|monitor|display|screen|device|plugged|connected|mouse|keyboard|headphone|airpod|webcam|drive)\b/i;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function pickModel(prompt: string): { model: string; fast: boolean } {
  const p = prompt.toLowerCase();
  const needsBrains =
    DEVICES_RE.test(prompt) ||
    /\b(code|function|script|debug|error|regex|algorithm|explain|analyze|analyse|calculate|solve|essay|summar)\b/.test(p) ||
    /\d\s*[\*\/\+\-x]\s*\d/.test(p) ||
    prompt.length > 200;
  return needsBrains ? { model: SMART, fast: false } : { model: FAST, fast: true };
}

type ModelResult = { ok: true; answer: string } | { ok: false; status: number; body: string };

async function callModel(model: string, body: unknown): Promise<ModelResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  const payload = JSON.stringify(body);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload });
      if (res.status === 503 || res.status === 429) {
        if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
        return { ok: false, status: res.status, body: await res.text() };
      }
      if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
      const data: any = await res.json();
      return { ok: true, answer: data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(no answer)" };
    } catch (err: any) {
      if (attempt < 2) { await sleep(800 * (attempt + 1)); continue; }
      return { ok: false, status: 0, body: err.message };
    }
  }
  return { ok: false, status: 503, body: "busy" };
}

// `prompt` is what the model sees this turn (may include a big file).
// `recordAs` is the short version stored in memory (so we don't bloat history
// with raw file contents). Defaults to `prompt`.
export async function askAI(prompt: string, recordAs?: string): Promise<string> {
  if (!API_KEY) return "AI isn't set up yet. Add a GEMINI_API_KEY to enable it.";

  const routeOn = recordAs ?? prompt;
  const { model } = pickModel(routeOn);
  const sys = snapshot();
  const mem = profile();
  const periph = HARDWARE_RE.test(routeOn) ? peripherals() : "";
  const extra = senses(routeOn);

  const systemText =
    `You are Sprøut, the user's warm personal assistant running inside their terminal.\n` +
    `IMPORTANT: Only state system/hardware facts that appear below. If a detail isn't present, say you don't have it — never invent values.\n\n` +
    `Current machine state:\n${sys}\n` +
    (periph ? `\nConnected hardware (RAW output — read it; only say "nothing" if truly empty):\n${periph}\n` : ``) +
    (extra ? `\nLive context:\n${extra}\n` : ``) +
    (mem ? `\nAbout the user:\n${mem}\n` : ``);

  const contents = [
    ...history.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    { role: "user", parts: [{ text: prompt }] },
  ];
  const body = { systemInstruction: { parts: [{ text: systemText }] }, contents };

  const chain = model === FAST ? [FAST] : [model, FAST];
  for (const mdl of chain) {
    const r = await callModel(mdl, body);
    if (r.ok) {
      // Record this exchange so follow-ups ("make it shorter", "what did you say?") work.
      history.push({ role: "user", text: recordAs ?? prompt });
      history.push({ role: "model", text: r.answer });
      if (history.length > 20) history.splice(0, history.length - 20);
      return r.answer;
    }
    if (r.status !== 503 && r.status !== 429 && r.status !== 0) return `AI error ${r.status}: ${r.body}`;
  }
  return "Both Google models are busy right now — give it a minute and try again.";
}

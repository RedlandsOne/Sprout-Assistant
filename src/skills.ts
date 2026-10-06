import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { remember, profile } from "./memory.js";
import { vitals } from "./system.js";
import { askAI } from "./ai.js";

type Confirm = (prompt: string) => Promise<boolean>;

export interface Skill {
  name: string;
  help: string;
  patterns: RegExp[];
  run: (input: string, confirm: Confirm) => Promise<void>;
}

const WIN = process.platform === "win32";

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf8", timeout: 10000, windowsHide: true }).trim(); }
  catch { return ""; }
}

function fmtSize(bytes: number): string {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, n = bytes;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)}${u[i]}`;
}

async function readTextFile(target: string): Promise<{ text: string | null; note?: string }> {
  const ext = path.extname(target).toLowerCase();
  if (ext === ".pdf") {
    try {
      const load = async (spec: string) => {
        const m: any = await import(spec);
        return [m, m?.default, m?.default?.default].find((x) => typeof x === "function");
      };
      let pdf = await load("pdf-parse/lib/pdf-parse.js").catch(() => undefined);
      if (!pdf) pdf = await load("pdf-parse").catch(() => undefined);
      if (!pdf) throw new Error("pdf-parse not found — run `npm install pdf-parse@1.1.1`");
      const data = await pdf(fs.readFileSync(target));
      return { text: (data.text || "").trim() || "(the PDF had no extractable text — it may be scanned images)" };
    } catch (err: any) {
      return { text: null, note: `Couldn't read the PDF: ${err.message}` };
    }
  }
  if ([".docx", ".doc", ".pages", ".key", ".numbers", ".zip", ".png", ".jpg", ".jpeg", ".heic", ".mp4", ".mov", ".mp3"].includes(ext)) {
    return { text: null, note: `"${path.basename(target)}" is a ${ext} file — I can only read plain text and PDFs for now.` };
  }
  const buf = fs.readFileSync(target);
  if (buf.subarray(0, 1024).includes(0)) {
    return { text: null, note: `"${path.basename(target)}" looks like a binary file, so I can't read it as words.` };
  }
  return { text: buf.toString("utf8") };
}

const LOG = path.join(os.homedir(), ".sprout", "last-organize.json");

function resolveDir(input: string): string {
  const home = os.homedir();
  const explicit = input.match(/(~?\/[^\s]+|[A-Za-z]:\\[^\s]+)/);
  if (explicit) return explicit[1].replace(/^~/, home);
  if (/\bdownloads?\b/i.test(input)) return path.join(home, "Downloads");
  if (/\bdesktop\b/i.test(input)) return path.join(home, "Desktop");
  if (/\bdocuments?\b/i.test(input)) return path.join(home, "Documents");
  return process.cwd();
}

function resolveFile(name: string): string | null {
  let t = name.replace(/^~/, os.homedir());
  if (path.isAbsolute(t)) return fs.existsSync(t) ? t : null;
  const roots = [process.cwd(), path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "Downloads"), path.join(os.homedir(), "Documents")];
  for (const r of roots) { const c = path.join(r, t); if (fs.existsSync(c)) return c; }
  return null;
}

function locate(query: string): string[] {
  const q = query.toLowerCase().replace(/^~\//, "");
  if (!q || q.length < 2) return [];
  const roots = [path.join(os.homedir(), "Desktop"), path.join(os.homedir(), "Downloads"), path.join(os.homedir(), "Documents"), process.cwd()];
  const hits: { p: string; m: number }[] = [];
  const walk = (d: string, depth = 0) => {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (!/^(node_modules|Library|\.git)$/i.test(e.name)) walk(full, depth + 1); }
      else if (e.name.toLowerCase().includes(q)) { try { hits.push({ p: full, m: fs.statSync(full).mtimeMs }); } catch {} }
    }
  };
  for (const r of roots) walk(r);
  const seen = new Set<string>();
  return hits.sort((a, b) => b.m - a.m).map((h) => h.p).filter((p) => !seen.has(p) && seen.add(p));
}

function locateFromPhrase(input: string): { target: string | null; others: string[]; tried: string[] } {
  const cleaned = input.toLowerCase()
    .replace(/\b(read|summar(y|ise|ize)|explain|review|analy[sz]e|rewrite|improve|proofread|critique|open|show me|contents? of|cat)\b/gi, " ")
    .replace(/\b(the|my|this|that|a|an|for|to|it|please|can|you|could|what'?s?|wrong|with|does|say|of|and|is|are|me|in|on|about)\b/gi, " ")
    .replace(/[^\w.\s/~-]/g, " ")
    .trim();
  const pathTok = cleaned.match(/(~?\/[^\s]+|\S+\.\w{1,6})/)?.[0];
  const words = cleaned.split(/\s+/).filter((w) => w.length >= 2).sort((a, b) => b.length - a.length);
  const candidates = [pathTok, cleaned.replace(/\s+/g, "-"), ...words].filter(Boolean) as string[];
  const tried: string[] = [];
  for (const cand of candidates) {
    if (tried.includes(cand)) continue;
    tried.push(cand);
    const direct = resolveFile(cand);
    if (direct) return { target: direct, others: [], tried };
    const hits = locate(cand);
    if (hits.length) return { target: hits[0], others: hits.slice(1, 5), tried };
  }
  return { target: null, others: [], tried };
}

const CATEGORIES: Record<string, string[]> = {
  Images: [".jpg", ".jpeg", ".png", ".gif", ".heic", ".webp", ".svg"],
  Documents: [".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".pages"],
  Spreadsheets: [".xls", ".xlsx", ".csv", ".numbers"],
  Video: [".mp4", ".mov", ".avi", ".mkv", ".webm"],
  Audio: [".mp3", ".wav", ".flac", ".m4a", ".aac"],
  Archives: [".zip", ".tar", ".gz", ".rar", ".7z", ".dmg"],
  Code: [".js", ".ts", ".py", ".go", ".rs", ".java", ".sh", ".json", ".html", ".css"],
};

function categoryFor(ext: string): string {
  for (const [name, exts] of Object.entries(CATEGORIES)) {
    if (exts.includes(ext.toLowerCase())) return name;
  }
  return "Other";
}

export const skills: Skill[] = [
  {
    name: "understand",
    help: "summarize / explain / review <file> — the AI reads a file (incl. PDFs) and helps.",
    patterns: [/\b(summar(y|ise|ize)|explain|proofread|review|analy[sz]e|rewrite|improve|critique|what'?s wrong with|what does)\b.*\b(file|doc|document|note|essay|code|script|letter|resume|cv|readme|vodcast|podcast|\.\w{1,6})\b/i],
    run: async (input) => {
      const { target, others, tried } = locateFromPhrase(input);
      if (!target) { console.log(`Couldn't find a file from that. I looked for: ${tried.slice(0, 5).join(", ")}. Try naming it, or tell me the folder.`); return; }
      console.log(`📄 Reading ${target} …`);
      const { text, note } = await readTextFile(target);
      if (!text) { console.log(note); return; }
      // Send the full file to the model, but remember only the short command.
      const answer = await askAI(`${input}\n\nHere is the file "${path.basename(target)}":\n\n${text.slice(0, 12000)}`, input);
      console.log(`\n${answer}`);
      if (others.length) console.log(`\n(If you meant a different file: ${others.map((o) => path.basename(o)).join(", ")})`);
    },
  },
  {
    name: "read",
    help: "read <file> — print a text or PDF file's contents (just name it).",
    patterns: [/\bread\b/i, /\bcat\b/i, /\bcontents? of\b/i, /\bshow me\b.*\.\w+/i],
    run: async (input) => {
      const { target, others } = locateFromPhrase(input);
      if (!target || fs.statSync(target).isDirectory()) { console.log(`Couldn't find that file. Try: read notes`); return; }
      const { text, note } = await readTextFile(target);
      if (!text) { console.log(note); return; }
      console.log(`📄 ${target}\n`);
      console.log(text.length > 4000 ? text.slice(0, 4000) + "\n…(truncated)" : (text || "(empty file)"));
      if (others.length) console.log(`\n(Other matches: ${others.map((o) => path.basename(o)).join(", ")})`);
    },
  },
  {
    name: "newfile",
    help: "create file <name> — make a new empty file.",
    patterns: [/\b(create|make|new)\b.*\bfile\b/i, /\btouch\b/i],
    run: async (input) => {
      const m = input.match(/file\s+(?:called\s+|named\s+|name\s+)?["']?(.+?)["']?(?:\s+(?:in|on|under|inside)\b.*)?$/i)
        || input.match(/touch\s+["']?(.+?)["']?$/i);
      const name = m?.[1]?.trim();
      if (!name) { console.log("What should I call it? Try: create file called notes.txt"); return; }
      const full = path.join(resolveDir(input), name);
      if (fs.existsSync(full)) { console.log(`"${name}" already exists.`); return; }
      fs.writeFileSync(full, "");
      console.log(`📄 Created ${full}`);
    },
  },
  {
    name: "newfolder",
    help: "create folder <name> in <folder> — make a new folder.",
    patterns: [/\b(create|make|new)\b.*\bfolder\b/i, /\bmkdir\b/i],
    run: async (input) => {
      const m = input.match(/folder\s+(?:called\s+|named\s+|name\s+)?["']?(.+?)["']?(?:\s+(?:in|on|under|inside)\b.*)?$/i);
      const name = m?.[1]?.trim();
      if (!name) { console.log("What should I call it? Try: create folder Projects in documents"); return; }
      const full = path.join(resolveDir(input), name);
      fs.mkdirSync(full, { recursive: true });
      console.log(`📁 Created ${full}`);
    },
  },
  {
    name: "scan",
    help: "scan <folder> / what's in <folder> — list every file grouped by type.",
    patterns: [/\bscan\b/i, /\bwhat'?s in\b/i, /\blist\b.*\b(file|folder)/i],
    run: async (input) => {
      const dir = resolveDir(input);
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => !e.name.startsWith(".")); }
      catch { console.log(`Can't read ${dir}.`); return; }
      const files = entries.filter((e) => e.isFile());
      const folders = entries.filter((e) => e.isDirectory());
      if (!files.length && !folders.length) { console.log(`📂 ${dir} is empty.`); return; }
      const groups: Record<string, { name: string; size: number }[]> = {};
      let total = 0;
      for (const f of files) {
        const size = fs.statSync(path.join(dir, f.name)).size;
        total += size;
        (groups[categoryFor(path.extname(f.name))] ||= []).push({ name: f.name, size });
      }
      console.log(`📂 ${dir}`);
      if (folders.length) console.log(`   📁 ${folders.length} subfolder(s): ${folders.map((f) => f.name).join(", ")}`);
      for (const [cat, items] of Object.entries(groups)) {
        console.log(`\n   ${cat} (${items.length}):`);
        for (const it of items.slice(0, 15)) console.log(`     • ${it.name}  —  ${fmtSize(it.size)}`);
        if (items.length > 15) console.log(`     …and ${items.length - 15} more`);
      }
      console.log(`\n   Total: ${files.length} loose files, ${fmtSize(total)}`);
    },
  },
  {
    name: "organize",
    help: "organize <folder> — preview then tidy into subfolders (undoable).",
    patterns: [/\borgan/i, /\btidy\b/i, /\bsort\b/i, /\bclean ?up\b/i],
    run: async (input, confirm) => {
      const dir = resolveDir(input);
      const files = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith("."));
      if (files.length === 0) { console.log(`Nothing to organize in ${dir}.`); return; }
      const plan: Record<string, string[]> = {};
      for (const f of files) (plan[categoryFor(path.extname(f.name))] ||= []).push(f.name);
      console.log(`📋 Here's exactly what I'll do:`);
      for (const [cat, names] of Object.entries(plan)) {
        console.log(`\n   → into ${path.join(dir, cat)}/   (${names.length} file${names.length > 1 ? "s" : ""})`);
        for (const n of names.slice(0, 10)) console.log(`       • ${n}`);
        if (names.length > 10) console.log(`       …and ${names.length - 10} more`);
      }
      if (!(await confirm(`\nMove these ${files.length} files?`))) { console.log("Okay, left everything as it was."); return; }
      const moves: { from: string; to: string }[] = [];
      for (const f of files) {
        const targetDir = path.join(dir, categoryFor(path.extname(f.name)));
        fs.mkdirSync(targetDir, { recursive: true });
        const from = path.join(dir, f.name);
        const to = path.join(targetDir, f.name);
        fs.renameSync(from, to);
        moves.push({ from, to });
      }
      fs.mkdirSync(path.dirname(LOG), { recursive: true });
      fs.writeFileSync(LOG, JSON.stringify(moves, null, 2));
      console.log(`\n✅ Organized ${moves.length} files. Don't like it? Type 'undo'.`);
    },
  },
  {
    name: "undo",
    help: "undo — reverse the last organize.",
    patterns: [/\bundo\b/i, /\brevert\b/i, /\bput (it|them|everything) back\b/i],
    run: async () => {
      let moves: { from: string; to: string }[];
      try { moves = JSON.parse(fs.readFileSync(LOG, "utf8")); }
      catch { console.log("Nothing to undo — I have no record of a recent organize."); return; }
      let restored = 0;
      for (const m of moves) { try { fs.mkdirSync(path.dirname(m.from), { recursive: true }); fs.renameSync(m.to, m.from); restored++; } catch {} }
      try { fs.unlinkSync(LOG); } catch {}
      console.log(`↩️  Put ${restored} file${restored === 1 ? "" : "s"} back.`);
    },
  },
  {
    name: "rename",
    help: "rename <old> to <new> — rename a file or folder (just name it).",
    patterns: [/\brename\b/i],
    run: async (input, confirm) => {
      const m = input.match(/rename\s+["']?(.+?)["']?\s+to\s+["']?(.+?)["']?$/i);
      if (!m) { console.log("Try: rename old.txt to new.txt"); return; }
      const from = resolveFile(m[1]) ?? locate(m[1])[0];
      if (!from) { console.log(`Can't find "${m[1]}".`); return; }
      const to = path.join(path.dirname(from), m[2].trim());
      if (!(await confirm(`Rename "${path.basename(from)}" → "${path.basename(to)}"?`))) return;
      fs.renameSync(from, to);
      console.log(`✅ Renamed to ${path.basename(to)}`);
    },
  },
  {
    name: "find",
    help: "find <term> in <folder> — search for files by name.",
    patterns: [/\bfind\b/i, /\bsearch\b/i, /\blocate\b/i, /\bwhere is\b/i],
    run: async (input) => {
      const dir = resolveDir(input);
      const term = (input.match(/(?:find|search|locate|where is)\s+(.+?)(?:\s+in\b|$)/i)?.[1] ?? "").trim().toLowerCase();
      if (!term) { console.log("What should I search for? Try: find invoice in downloads"); return; }
      const hits: string[] = [];
      const walk = (d: string, depth = 0) => {
        if (depth > 4) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (e.name.startsWith(".")) continue;
          const full = path.join(d, e.name);
          if (e.isDirectory()) walk(full, depth + 1);
          else if (e.name.toLowerCase().includes(term)) hits.push(full);
        }
      };
      walk(dir);
      console.log(hits.length ? `Found ${hits.length}:\n${hits.join("\n")}` : `No files matching "${term}" under ${dir}.`);
    },
  },
  {
    name: "open",
    help: "open <app or website> — e.g. 'open spotify' or 'open youtube.com'.",
    patterns: [/^\s*open\b/i, /\blaunch\b/i],
    run: async (input, confirm) => {
      const target = input.replace(/^.*?\b(open|launch)\b\s*/i, "").trim().replace(/[.?!]$/, "");
      if (!target) { console.log("Open what? Try: open spotify"); return; }
      if (!(await confirm(`Open ${target}?`))) return;
      const folders: Record<string, string> = { downloads: "Downloads", desktop: "Desktop", documents: "Documents" };
      const url = /^https?:\/\//i.test(target) ? target : (/\.[a-z]{2,}($|\/)/i.test(target) ? "https://" + target : null);
      try {
        if (url) { WIN ? execSync(`start "" "${url}"`, { shell: "cmd.exe" }) : execSync(`open ${JSON.stringify(url)}`); }
        else if (folders[target.toLowerCase()]) {
          const p = path.join(os.homedir(), folders[target.toLowerCase()]);
          WIN ? execSync(`start "" "${p}"`, { shell: "cmd.exe" }) : execSync(`open ${JSON.stringify(p)}`);
        } else { WIN ? execSync(`start "" "${target}"`, { shell: "cmd.exe" }) : execSync(`open -a ${JSON.stringify(target)}`); }
        console.log(`✅ Opened ${target}.`);
      } catch { console.log(`Couldn't open "${target}" — is the name right?`); }
    },
  },
  {
    name: "volume",
    help: "set volume to <0-100> / mute / unmute (macOS).",
    patterns: [/\bvolume\b/i, /\bmute\b/i, /\bunmute\b/i],
    run: async (input) => {
      if (WIN) { console.log("Volume control isn't supported on Windows yet (no clean built-in)."); return; }
      if (/\bunmute\b/i.test(input)) { execSync(`osascript -e 'set volume output muted false'`); console.log("🔊 Unmuted."); return; }
      if (/\bmute\b/i.test(input)) { execSync(`osascript -e 'set volume output muted true'`); console.log("🔇 Muted."); return; }
      const cur = () => Number(sh(`osascript -e 'output volume of (get volume settings)'`)) || 0;
      const num = input.match(/(\d{1,3})/);
      let level: number | null = null;
      if (num) level = Number(num[1]);
      else if (/\b(up|louder|raise|increase)\b/i.test(input)) level = cur() + 10;
      else if (/\b(down|lower|quieter|decrease)\b/i.test(input)) level = cur() - 10;
      if (level === null) { console.log(`🔊 Volume is at ${cur()}%.`); return; }
      level = Math.min(100, Math.max(0, level));
      execSync(`osascript -e 'set volume output volume ${level}'`);
      console.log(`🔊 Volume set to ${level}%.`);
    },
  },
  {
    name: "trash",
    help: "empty trash — permanently clear your Trash / Recycle Bin.",
    patterns: [/\bempty (the )?(trash|recycle)/i, /\bclear (the )?(trash|recycle)/i, /\btake out (the )?trash\b/i],
    run: async (input, confirm) => {
      if (!(await confirm("Permanently empty your Trash / Recycle Bin?"))) return;
      if (WIN) execSync(`powershell -NoProfile -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"`, { windowsHide: true });
      else execSync(`osascript -e 'tell application "Finder" to empty trash'`);
      console.log("🗑️  Emptied.");
    },
  },
  {
    name: "screenshot",
    help: "screenshot — capture the screen to your Desktop.",
    patterns: [/\bscreenshot\b/i, /\bscreen ?cap/i, /\bcapture.*screen\b/i],
    run: async () => {
      const file = path.join(os.homedir(), "Desktop", `sprout-${Date.now()}.png`);
      try {
        if (WIN) {
          execSync(`powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $b=[System.Windows.Forms.SystemInformation]::VirtualScreen; $bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height; $g=[System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size); $bmp.Save('${file.replace(/\\/g, "\\\\")}')"`, { windowsHide: true });
        } else {
          execSync(`screencapture ${JSON.stringify(file)}`);
        }
        console.log(`📸 Saved screenshot to ${file}`);
      } catch (err: any) { console.log(`Couldn't take a screenshot: ${err.message}`); }
    },
  },
  {
    name: "weather",
    help: "weather — current conditions for your location.",
    patterns: [/\bweather\b/i, /\btemperature\b/i, /\bforecast\b/i, /\bhow('?s| is)? (it )?outside\b/i],
    run: async () => {
      try {
        const res = await fetch("https://wttr.in/?format=%l:+%c+%t+(feels+%f),+%h+humidity,+wind+%w");
        console.log(`🌤️  ${(await res.text()).trim()}`);
      } catch { console.log("Couldn't fetch the weather right now."); }
    },
  },
  {
    name: "status",
    help: "status / vitals — full system dashboard.",
    patterns: [/^\s*status\s*$/i, /^\s*vitals\s*$/i, /\bfull (status|report|dashboard|readout)\b/i],
    run: async () => { console.log(vitals()); },
  },
  {
    name: "remember",
    help: "remember <something> — save a fact about you.",
    patterns: [/\bremember\b/i, /\bnote that\b/i, /\bdon'?t forget\b/i],
    run: async (input) => {
      const fact = input.replace(/^.*?\b(remember|note that|don'?t forget)\b\s*(that\s+)?/i, "").trim();
      if (!fact) { console.log("Remember what? Try: remember I love drawing"); return; }
      remember(fact);
      console.log(`🌱 Got it — I'll remember that ${fact}.`);
    },
  },
  {
    name: "aboutme",
    help: "about me — show everything Sprøut remembers about you.",
    patterns: [/\babout me\b/i, /\bwhat do you know about me\b/i],
    run: async () => {
      const p = profile();
      console.log(p ? `Here's what I know about you:\n${p}` : "I don't know you yet! Tell me things with 'remember ...'.");
    },
  },
];

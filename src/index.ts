import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { match } from "./brain.js";
import { skills } from "./skills.js";
import { askAI, pickModel } from "./ai.js";

const c = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  cyan: "\x1b[36m", bcyan: "\x1b[96m",
  green: "\x1b[32m", bgreen: "\x1b[92m",
  magenta: "\x1b[35m", bmagenta: "\x1b[95m",
  yellow: "\x1b[33m", gray: "\x1b[90m",
};

const rl = readline.createInterface({ input: stdin, output: stdout });

const confirm = async (prompt: string): Promise<boolean> => {
  const answer = await rl.question(`${c.yellow}${prompt} [y/N] ${c.reset}`);
  return answer.trim().toLowerCase() === "y";
};

function startSpinner(label: string): () => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const timer = setInterval(() => {
    const f = frames[(i = (i + 1) % frames.length)];
    stdout.write(`\r${c.bgreen}${f}${c.reset} ${c.dim}${label}${c.reset}`);
  }, 80);
  return () => { clearInterval(timer); stdout.write("\r\x1b[K"); };
}

async function typeOut(text: string, delay = 4): Promise<void> {
  for (const ch of text) { stdout.write(ch); await new Promise((r) => setTimeout(r, delay)); }
  stdout.write("\n");
}

function banner() {
  const art = [
    "███████ ██████  ██████   █████  ██   ██ ████████",
    "██      ██   ██ ██   ██ ██   ██ ██   ██    ██   ",
    "███████ ██████  ██████  ██   ██ ██   ██    ██   ",
    "     ██ ██      ██   ██ ██   ██ ██   ██    ██   ",
    "███████ ██      ██   ██  █████   █████     ██   ",
  ];
  const grad = [c.bgreen, c.bgreen, c.green, c.green, c.cyan];
  console.log();
  art.forEach((line, i) => console.log(`  ${grad[i]}${c.bold}${line}${c.reset}`));
  console.log();
  console.log(`  ${c.bgreen}🌱 Sprøut${c.reset}  ${c.gray}·${c.reset}  ${c.cyan}⚡ fast${c.reset} ${c.gray}+${c.reset} ${c.magenta}🧠 smart${c.reset}  ${c.gray}·${c.reset}  ${c.dim}${skills.length} skills loaded${c.reset}`);
  console.log(`  ${c.gray}type ${c.reset}${c.green}help${c.reset}${c.gray}  ·  ${c.reset}${c.green}try again${c.reset}${c.gray} to repeat  ·  ${c.reset}${c.green}exit${c.reset}${c.gray} to quit${c.reset}`);
  console.log();
}

async function boot() {
  const stop = startSpinner("waking up Sprøut…");
  await new Promise((r) => setTimeout(r, 700));
  stop();
  banner();
}

async function main() {
  await boot();
  let lastInput = "";

  while (true) {
    let input = (await rl.question(`${c.bcyan}you ›${c.reset} `)).trim();
    if (!input) continue;

    if (/^(try again|retry|do (that|it) again|again)$/i.test(input)) {
      if (!lastInput) { console.log(`${c.dim}Nothing to retry yet.${c.reset}\n`); continue; }
      input = lastInput;
      console.log(`${c.dim}↻ retrying: ${input}${c.reset}`);
    }

    if (input.toLowerCase() === "exit") { console.log(`${c.bgreen}sprøut ›${c.reset} see ya 🌱`); break; }

    if (input.toLowerCase() === "help") {
      console.log(`${c.green}${c.bold}I know how to:${c.reset}`);
      for (const s of skills) console.log(`  ${c.green}•${c.reset} ${s.help}`);
      console.log();
      continue;
    }

    const skill = match(input);
    if (skill) {
      lastInput = input;
      try { await skill.run(input, confirm); }
      catch (err: any) { console.log(`${c.yellow}Something went wrong: ${err.message}${c.reset}`); }
    } else {
      lastInput = input;
      const { fast } = pickModel(input);
      const stop = startSpinner(fast ? "thinking…" : "thinking hard…");
      const answer = await askAI(input); // memory handled inside askAI now
      stop();
      stdout.write(`${c.bgreen}sprøut ›${c.reset} `);
      await typeOut(answer);
    }
    console.log();
  }
  rl.close();
}

main();

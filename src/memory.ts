import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Sprøut's memory lives in a private file in your home folder.
const DIR = path.join(os.homedir(), ".sprout");
const FILE = path.join(DIR, "memory.json");

export interface Memory { facts: string[]; }

export function load(): Memory {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); }
  catch { return { facts: [] }; }
}

export function save(mem: Memory): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(mem, null, 2));
}

export function remember(fact: string): void {
  const mem = load();
  mem.facts.push(fact);
  save(mem);
}

// A readable summary of everything Sprøut knows about you.
export function profile(): string {
  const mem = load();
  return mem.facts.length ? mem.facts.map((f) => `- ${f}`).join("\n") : "";
}

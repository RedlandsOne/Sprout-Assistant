What it is
A terminal AI assistant, described in the README as:

A rule-based terminal assistant with a free Gemini AI fallback. Rules run first (instant, offline); anything unmatched goes to the AI.

The repo's tagline is "A brain for your computer, a window into the complex world of your device." Internally the README calls the project Artificial-Brain (recently renamed from mac-brain).

How it works
Rules first — matched commands run instantly and offline.
AI fallback — anything unmatched is sent to Google's Gemini (needs a free GEMINI_API_KEY).
You extend it by adding a skill to the skills array in src/skills.ts.
Setup:


Code



Copy
npm install
export GEMINI_API_KEY=your_key
npm run dev
Repo facts
Owner/org: RedlandsOne — forked from 
Robotpixeldisplay/Sprout
, currently 1 commit ahead.
Language: TypeScript 100%.
Activity: 2 commits, latest by Jed-Thompson12 — 
"Rename project from 'mac-brain' to 'Artificial-Brain'"
 on Oct 7, 2026.
Stats: 0 stars, 0 watchers, 0 forks, no releases or packages published, no listed contributors.
Files: src/, .gitignore, README.md, package.json, package-lock.json, tsconfig.json.

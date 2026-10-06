# 🧠 mac-brain

A rule-based terminal assistant with a free Gemini AI fallback.
Rules run first (instant, offline); anything unmatched goes to the AI.

## Setup
    npm install
    export GEMINI_API_KEY=your_key   # free key at aistudio.google.com/apikey
    npm run dev

## Teach it a new trick
Add a skill to the `skills` array in `src/skills.ts`.

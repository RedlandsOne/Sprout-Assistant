# Artificial-Brain

## What It Is

**Artificial-Brain** is a terminal-based AI assistant designed to act as a lightweight interface between you and your computer.

Its core approach is simple:

> **Rules first. AI when needed.**

The assistant uses a collection of local, rule-based skills to handle recognised commands instantly and offline. If a request doesn't match any available rule, it falls back to Google's Gemini AI for a more general response.

The project's tagline is:

> **A brain for your computer, a window into the complex world of your device.**

Artificial-Brain was recently renamed from **`mac-brain`**.

## How It Works

Artificial-Brain follows a two-stage process:

### 1. Rules First

When you enter a command, Artificial-Brain first checks its built-in rules and skills.

- Runs locally
- Works instantly
- Doesn't require an internet connection
- Avoids using AI when a known rule can handle the request

### 2. AI Fallback

If no rule matches the request, Artificial-Brain sends it to **Google Gemini**.

This provides a flexible fallback for questions and commands that aren't explicitly supported by the local rule system.

A free `GEMINI_API_KEY` is required to use the AI fallback.

### Extending Artificial-Brain

New functionality can be added by creating or registering additional skills in:

```text
src/skills.ts
```

Skills can handle specific commands locally before the request ever reaches Gemini.

## Setup

Install the project's dependencies:

```bash
npm install
```

Set your Gemini API key:

```bash
export GEMINI_API_KEY=your_key
```

Then start the assistant:

```bash
npm run dev
```

## Repository Facts

| Category | Details |
|---|---|
| **Owner / Organisation** | RedlandsOne |
| **Original Repository** | Robotpixeldisplay/Sprout |
| **Repository Status** | Fork |
| **Current Language** | TypeScript (100%) |
| **Commits** | 2 |
| **Stars** | 0 |
| **Watchers** | 0 |
| **Forks** | 0 |
| **Releases** | None |
| **Published Packages** | None |
| **Listed Contributors** | None |

The repository is currently **1 commit ahead** of its upstream repository.

The latest commit was made by **Jed-Thompson12** on **7 October 2026**:

**Rename project from `mac-brain` to `Artificial-Brain`**

## Repository Structure

```text
Artificial-Brain/
├── src/
├── .gitignore
├── README.md
├── package.json
├── package-lock.json
└── tsconfig.json
```

## Project Philosophy

Artificial-Brain is built around a simple principle:

**Use deterministic local rules whenever possible, and use AI when the rules aren't enough.**

This keeps common operations fast and predictable while still providing the flexibility of a general-purpose AI assistant when needed.

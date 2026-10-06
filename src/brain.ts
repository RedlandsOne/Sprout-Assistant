import { skills, type Skill } from "./skills.js";

export function match(input: string): Skill | null {
  let best: Skill | null = null;
  let bestScore = 0;
  for (const skill of skills) {
    const score = skill.patterns.filter((p) => p.test(input)).length;
    if (score > bestScore) {
      bestScore = score;
      best = skill;
    }
  }
  return bestScore > 0 ? best : null;
}

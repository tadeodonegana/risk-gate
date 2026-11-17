import type { Config } from '../config.ts';
import type { RulesResult } from './rules.ts';

/** Change this when the Decision shape changes. Old cached decisions are then ignored. */
export const DECISION_VERSION = 1;

export interface JevAnswer {
  model: string;
  /** Probability of each tier, lowest tier first. */
  tierProbabilities: number[];
  inputTokens: number;
  cost?: number;
}

export type JevOutcome = JevAnswer | { error: string };

export interface Decision {
  v: number;
  sha: string;
  configHash: string;
  tier: number;
  tierName: string;
  required: number;
  /** Markdown lines for the PR comment. */
  reasons: string[];
  model?: string;
  inputTokens?: number;
  error?: string;
}

export interface DecideInput {
  cfg: Config;
  rules: RulesResult;
  jev: JevOutcome;
  author: string;
  /** True when a bot account (an agent) opened the PR. */
  authorIsBot: boolean;
  sha: string;
  /** Diffs that Jev did not see because of the size limit. */
  omittedDiffs?: number;
}

const fmt = (n: number): string => n.toFixed(2);

/** The most probable tier. A tie goes to the higher tier. */
export function pickTier(probabilities: number[]): number {
  let best = 0;
  probabilities.forEach((p, i) => {
    if (p >= (probabilities[best] ?? 0)) best = i;
  });
  return best;
}

export function decide({ cfg, rules, jev, author, authorIsBot, sha, omittedDiffs = 0 }: DecideInput): Decision {
  const names = cfg.tiers.map((t) => t.name);
  const reasons = rules.hits.map(
    (hit) => `Rule **${hit.label}** matched ${hit.evidence}: min tier \`${names[hit.minTier]}\`.`,
  );
  const decision: Decision = { v: DECISION_VERSION, sha, configHash: cfg.hash, tier: 0, tierName: '', required: 0, reasons };
  let tier = rules.floor;

  if ('error' in jev) {
    decision.error = jev.error;
    tier = Math.max(tier, cfg.decider.onError);
    reasons.push(`Jev failed (${jev.error}). Fail closed: tier \`${names[cfg.decider.onError]}\` (\`decider.on_error\`).`);
  } else {
    decision.model = jev.model;
    decision.inputTokens = jev.inputTokens;
    const jevTier = pickTier(jev.tierProbabilities);
    const probs = jev.tierProbabilities.map((p, i) => `${names[i]} ${fmt(p)}`).join(' · ');
    reasons.push(`Jev: \`${names[jevTier]}\` (${probs}).`);
    if (omittedDiffs > 0) reasons.push(`Jev did not see the diffs of ${omittedDiffs} files (size limit or binary).`);
    tier = Math.max(tier, jevTier);
  }

  let required = cfg.tiers[tier]?.approvals ?? 0;
  if (cfg.requireHumanForAgentPrs && authorIsBot) {
    required = Math.max(required, 1);
    reasons.push(`Author @${author} is a bot (agent PR): at least 1 human approval.`);
  }

  decision.tier = tier;
  decision.tierName = names[tier] ?? '';
  decision.required = required;
  return decision;
}

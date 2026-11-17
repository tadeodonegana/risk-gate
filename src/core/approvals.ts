import { normalizeLogin } from '../config.ts';
import type { Decision } from './decide.ts';

export interface Review {
  login: string;
  isBot: boolean;
  /** APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED or PENDING. */
  state: string;
  commitId: string | null;
}

export interface GateResult {
  state: 'success' | 'pending';
  description: string;
  approvers: string[];
  changesRequestedBy: string[];
}

/** The latest review that sets an approval state, per user. GitHub lists reviews from oldest to newest. */
export function latestReviews(reviews: Review[]): Map<string, Review> {
  const latest = new Map<string, Review>();
  for (const r of reviews) {
    if (r.state === 'APPROVED' || r.state === 'CHANGES_REQUESTED' || r.state === 'DISMISSED') {
      latest.set(normalizeLogin(r.login), r);
    }
  }
  return latest;
}

export interface GateInput {
  decision: Decision;
  latest: Map<string, Review>;
  headSha: string;
  author: string;
  /** Lowercase logins with write access to the repo. */
  writers: Set<string>;
  mode: 'enforce' | 'shadow';
}

const MAX_DESCRIPTION = 140;

export function evaluateGate(input: GateInput): GateResult {
  const { decision, latest, headSha, writers, mode } = input;
  const author = normalizeLogin(input.author);
  // Only humans with write access count. Bot (agent) reviews never count.
  const counts = (r: Review) => {
    const key = normalizeLogin(r.login);
    return !r.isBot && key !== author && writers.has(key);
  };
  const reviews = [...latest.values()].filter(counts);
  // An approval covers one commit only.
  const approvers = reviews.filter((r) => r.state === 'APPROVED' && r.commitId === headSha).map((r) => r.login);
  const changesRequestedBy = reviews.filter((r) => r.state === 'CHANGES_REQUESTED').map((r) => r.login);

  const missing: string[] = [];
  if (approvers.length < decision.required) missing.push(`${approvers.length}/${decision.required} approvals`);
  if (changesRequestedBy.length) missing.push(`changes requested by @${changesRequestedBy.join(', @')}`);

  const summary = missing.length ? missing.join('; ') : `${approvers.length}/${decision.required} approvals`;
  let description = `${decision.tierName}: ${summary}`;
  if (mode === 'shadow') description = `shadow · ${description}`;
  if (description.length > MAX_DESCRIPTION) description = `${description.slice(0, MAX_DESCRIPTION - 1)}…`;

  return {
    state: mode === 'shadow' || missing.length === 0 ? 'success' : 'pending',
    description,
    approvers,
    changesRequestedBy,
  };
}

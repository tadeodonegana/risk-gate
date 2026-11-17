import { loadConfig, type Config } from './config.ts';
import { evaluateGate, latestReviews, type GateResult } from './core/approvals.ts';
import { parseDecision, renderComment } from './core/comment.ts';
import { decide, type Decision, type JevAnswer, type JevOutcome } from './core/decide.ts';
import { evaluateRules, type ChangedFile, type RulesResult } from './core/rules.ts';
import { buildState } from './core/state.ts';
import type { GitHubPort } from './github.ts';
import type { AskJevOptions } from './jev.ts';

export interface RunInputs {
  prNumber: number;
  eventName: string;
  configPath: string;
  apiUrl: string;
  apiKey: string;
  /** Link for statuses that have no comment yet. */
  runUrl?: string;
}

export interface RunDeps {
  gh: GitHubPort;
  ask: (o: AskJevOptions) => Promise<JevAnswer>;
  log: (message: string) => void;
  warn: (message: string) => void;
}

export interface RunResult {
  skipped?: string;
  decision?: Decision;
  gate?: GateResult;
  /** True when the decision came from the PR comment and Jev was not called. */
  cached?: boolean;
  commentUrl?: string;
}

/**
 * One gate run. On a new commit (or a config change) it decides the tier and writes the comment.
 * On other events it reuses that decision. Then it counts the approvals and sets the status.
 */
export async function run(inputs: RunInputs, deps: RunDeps): Promise<RunResult> {
  const { gh } = deps;
  const pr = await gh.getPull(inputs.prNumber);

  if (inputs.eventName === 'pull_request_review' && pr.isFork) {
    return {
      skipped:
        'A review event on a fork PR gets a read-only token, so the status cannot change. Re-run the last risk-gate job of this PR to count the approvals.',
    };
  }

  // The config comes from the base branch, so a PR cannot change its own rules.
  const configText = await gh.getFile(pr.baseRef, inputs.configPath);
  if (configText === null) {
    await gh.setStatus(pr.headSha, 'error', `No ${inputs.configPath} on ${pr.baseRef}`, inputs.runUrl);
    throw new Error(`No config file at ${inputs.configPath} on the base branch ${pr.baseRef}.`);
  }
  let cfg: Config;
  try {
    cfg = loadConfig(configText);
  } catch (e) {
    await gh.setStatus(pr.headSha, 'error', 'Invalid risk-gate config. See the job log.', inputs.runUrl);
    throw e;
  }

  const comment = await gh.findDecisionComment(pr.number);
  const cachedDecision = comment ? parseDecision(comment.body) : null;
  let decision: Decision;
  let commentUrl = comment?.url;
  const cached = cachedDecision?.sha === pr.headSha && cachedDecision.configHash === cfg.hash;

  if (cached) {
    decision = cachedDecision;
    deps.log(`Reusing the decision for ${pr.headSha}: ${decision.tierName}, ${decision.required} approvals.`);
  } else {
    const files = await gh.listFiles(pr.number);
    const rules = evaluateRules(cfg, files, pr.author, inputs.configPath);
    const { jev, omittedDiffs } = await classify(cfg, files, rules, inputs, deps);
    if ('error' in jev) deps.warn(`Jev failed, so the gate fails closed: ${jev.error}`);
    decision = decide({ cfg, rules, jev, author: pr.author, authorIsBot: pr.authorIsBot, sha: pr.headSha, omittedDiffs });
    commentUrl = await gh.writeDecisionComment(pr.number, renderComment(decision, cfg.mode), comment?.id ?? null);
    deps.log(`New decision for ${pr.headSha}: ${decision.tierName}, ${decision.required} approvals.`);
  }

  const latest = latestReviews(await gh.listReviews(pr.number));
  const writers = new Set<string>();
  for (const [key, review] of latest) {
    if (!review.isBot && review.state !== 'DISMISSED' && (await gh.hasWriteAccess(review.login))) writers.add(key);
  }
  const gate = evaluateGate({ decision, latest, headSha: pr.headSha, author: pr.author, writers, mode: cfg.mode });
  await gh.setStatus(pr.headSha, gate.state, gate.description, commentUrl ?? inputs.runUrl);
  deps.log(`Status ${gate.state}: ${gate.description}`);
  return { decision, gate, cached, commentUrl };
}

async function classify(
  cfg: Config,
  files: ChangedFile[],
  rules: RulesResult,
  inputs: RunInputs,
  deps: RunDeps,
): Promise<{ jev: JevOutcome; omittedDiffs: number }> {
  if (!inputs.apiKey) return { jev: { error: 'no api-key input' }, omittedDiffs: 0 };
  try {
    const { state, omittedDiffs } = buildState(files, rules.hitFiles, cfg.decider.maxStateBytes);
    const jev = await deps.ask({
      apiUrl: inputs.apiUrl,
      apiKey: inputs.apiKey,
      model: cfg.decider.model,
      state,
      tierDescriptions: cfg.tiers.map((t) => t.description),
    });
    return { jev, omittedDiffs };
  } catch (e) {
    return { jev: { error: (e as Error).message }, omittedDiffs: 0 };
  }
}

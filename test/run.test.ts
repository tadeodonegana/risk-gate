import { describe, expect, it, vi } from 'vitest';
import type { Review } from '../src/core/approvals.ts';
import type { JevAnswer } from '../src/core/decide.ts';
import type { ChangedFile } from '../src/core/rules.ts';
import type { GitHubPort, PullRequest, StatusState } from '../src/github.ts';
import type { AskJevOptions } from '../src/jev.ts';
import { run, type RunInputs } from '../src/run.ts';
import { configText, file } from './fixtures.ts';

/** An in-memory GitHub for one PR. */
class FakeGitHub implements GitHubPort {
  pr: PullRequest = { number: 7, headSha: 'sha-1', baseRef: 'main', author: 'mallory', authorIsBot: false, isFork: false };
  files: ChangedFile[] = [file('src/app.ts'), file('db/migrations/9.sql')];
  reviews: Review[] = [];
  writers = new Set(['alice', 'bob']);
  configs: Record<string, string> = { 'main:.github/risk-gate.yml': configText() };
  comment: { id: number; body: string; url: string } | null = null;
  statuses: { sha: string; state: StatusState; description: string }[] = [];
  commentWrites = 0;

  getPull = async () => ({ ...this.pr });
  getFile = async (ref: string, path: string) => this.configs[`${ref}:${path}`] ?? null;
  listFiles = async () => this.files;
  listReviews = async () => this.reviews;
  hasWriteAccess = async (login: string) => this.writers.has(login.toLowerCase());
  findDecisionComment = async () => this.comment;
  writeDecisionComment = async (_n: number, body: string, id: number | null) => {
    this.commentWrites++;
    this.comment = { id: id ?? 1, body, url: 'https://github.com/o/r/pull/7#issuecomment-1' };
    return this.comment.url;
  };
  setStatus = async (sha: string, state: StatusState, description: string) => {
    this.statuses.push({ sha, state, description });
  };
}

const jevAnswer: JevAnswer = {
  model: 'typesafe/jev-1.14',
  tierProbabilities: [0.7, 0.2, 0.08, 0.02],
  inputTokens: 500,
};

const inputs = (eventName = 'pull_request_target'): RunInputs => ({
  prNumber: 7,
  eventName,
  configPath: '.github/risk-gate.yml',
  apiUrl: 'https://openrouter.ai/api/v1',
  apiKey: 'sk-test',
});

const setup = () => {
  const gh = new FakeGitHub();
  const ask = vi.fn(async (_o: AskJevOptions) => jevAnswer);
  const deps = { gh, ask, log: () => {}, warn: vi.fn() };
  return { gh, ask, deps };
};

describe('run', () => {
  it('decides on a new commit, writes the comment and sets a pending status', async () => {
    const { gh, ask, deps } = setup();
    const result = await run(inputs(), deps);

    expect(ask).toHaveBeenCalledOnce();
    // The rule floor "high" beats the Jev tier "low".
    expect(result.decision).toMatchObject({ tierName: 'high', required: 2, sha: 'sha-1' });
    expect(result.cached).toBe(false);
    expect(gh.comment?.body).toContain('Risk gate: `high` · 2 human approvals required');
    expect(gh.statuses).toEqual([{ sha: 'sha-1', state: 'pending', description: 'high: 0/2 approvals' }]);

    // Jev sees the migration diff first.
    const sent = ask.mock.calls[0]?.[0] as { state: { diffs: { file: string }[] } };
    expect(sent.state.diffs[0]?.file).toBe('db/migrations/9.sql');
  });

  it('reuses the decision on a review event and passes when the approvals arrive', async () => {
    const { gh, ask, deps } = setup();
    await run(inputs(), deps);
    gh.reviews = [
      { login: 'alice', state: 'APPROVED', commitId: 'sha-1', isBot: false },
      { login: 'bob', state: 'APPROVED', commitId: 'sha-1', isBot: false },
    ];
    const result = await run(inputs('pull_request_review'), deps);

    expect(ask).toHaveBeenCalledOnce();
    expect(gh.commentWrites).toBe(1);
    expect(result.cached).toBe(true);
    expect(gh.statuses.at(-1)).toEqual({ sha: 'sha-1', state: 'success', description: 'high: 2/2 approvals' });
  });

  it('decides again after a new commit or a config change, and old approvals stop counting', async () => {
    const { gh, ask, deps } = setup();
    gh.reviews = [{ login: 'alice', state: 'APPROVED', commitId: 'sha-1', isBot: false }];
    await run(inputs(), deps);
    gh.pr.headSha = 'sha-2';
    await run(inputs(), deps);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(gh.commentWrites).toBe(2);
    expect(gh.statuses.at(-1)?.description).toBe('high: 0/2 approvals');

    gh.configs['main:.github/risk-gate.yml'] = configText({ extra: 'mode: shadow' });
    await run(inputs('pull_request_review'), deps);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(gh.statuses.at(-1)).toMatchObject({ state: 'success', description: 'shadow · high: 0/2 approvals' });
  });

  it('asks for 1 human approval on a low-risk PR from a bot', async () => {
    const { gh, deps } = setup();
    gh.pr = { ...gh.pr, author: 'claude[bot]', authorIsBot: true };
    gh.files = [file('README.md')];
    const result = await run(inputs(), deps);
    expect(result.decision).toMatchObject({ tierName: 'low', required: 1 });
    expect(gh.statuses.at(-1)).toEqual({ sha: 'sha-1', state: 'pending', description: 'low: 0/1 approvals' });
  });

  it('fails closed without an API key', async () => {
    const { gh, ask, deps } = setup();
    const result = await run({ ...inputs(), apiKey: '' }, deps);
    expect(ask).not.toHaveBeenCalled();
    expect(result.decision).toMatchObject({ tierName: 'critical', error: 'no api-key input' });
    expect(deps.warn).toHaveBeenCalled();
    expect(gh.statuses.at(-1)?.state).toBe('pending');
  });

  it('sets an error status when the base branch has no config', async () => {
    const { gh, deps } = setup();
    gh.configs = {};
    await expect(run(inputs(), deps)).rejects.toThrow(/No config file/);
    expect(gh.statuses).toEqual([{ sha: 'sha-1', state: 'error', description: 'No .github/risk-gate.yml on main' }]);
  });

  it('skips review events on fork PRs (read-only token)', async () => {
    const { gh, deps } = setup();
    gh.pr.isFork = true;
    expect((await run(inputs('pull_request_review'), deps)).skipped).toMatch(/fork/);
    expect(gh.statuses).toEqual([]);
  });

  it('does not trust a decision comment for another commit', async () => {
    const { gh, ask, deps } = setup();
    await run(inputs(), deps);
    gh.comment = { id: 1, body: gh.comment!.body.replace(/decision \S+/, 'decision AAAA'), url: 'u' };
    await run(inputs('pull_request_review'), deps);
    expect(ask).toHaveBeenCalledTimes(2);
  });
});

import { describe, expect, it } from 'vitest';
import { parseDecision, renderComment } from '../src/core/comment.ts';
import { decide, pickTier, type DecideInput, type JevAnswer } from '../src/core/decide.ts';
import { evaluateRules, type RulesResult } from '../src/core/rules.ts';
import { config, file } from './fixtures.ts';

const noRules: RulesResult = { floor: 0, hits: [], hitFiles: new Set() };

const jev = (tierProbabilities: number[]): JevAnswer => ({ model: 'typesafe/jev-1.14', tierProbabilities, inputTokens: 1234 });

const input = (over: Partial<DecideInput>): DecideInput => ({
  cfg: config(),
  rules: noRules,
  jev: jev([1, 0, 0, 0]),
  author: 'alice',
  authorIsBot: false,
  sha: 'abc1234def',
  ...over,
});

describe('pickTier', () => {
  it('takes the most probable tier', () => {
    expect(pickTier([0.1, 0.6, 0.2, 0.1])).toBe(1);
    expect(pickTier([0.9, 0.05, 0.03, 0.02])).toBe(0);
    expect(pickTier([0, 0, 0, 1])).toBe(3);
  });

  it('gives a tie to the higher tier', () => {
    expect(pickTier([0.4, 0.4, 0.2, 0])).toBe(1);
    expect(pickTier([0.25, 0.25, 0.25, 0.25])).toBe(3);
  });
});

describe('decide', () => {
  it('uses the Jev tier when it is above the rule floor', () => {
    const d = decide(input({ jev: jev([0.1, 0.2, 0.6, 0.1]) }));
    expect(d).toMatchObject({ tier: 2, tierName: 'high', required: 2, model: 'typesafe/jev-1.14', inputTokens: 1234 });
    expect(d.reasons).toEqual(['Jev: `high` (low 0.10 · medium 0.20 · high 0.60 · critical 0.10).']);
  });

  it('never lets Jev lower the rule floor', () => {
    const rules = evaluateRules(config(), [file('db/migrations/2.sql')], 'alice', '.github/risk-gate.yml');
    const d = decide(input({ rules, jev: jev([1, 0, 0, 0]) }));
    expect(d.tierName).toBe('high');
    expect(d.reasons[0]).toBe('Rule **migrations** matched `db/migrations/2.sql`: min tier `high`.');
  });

  it('fails closed to on_error when Jev fails', () => {
    const d = decide(input({ jev: { error: 'HTTP 401' } }));
    expect(d).toMatchObject({ tierName: 'critical', required: 2, error: 'HTTP 401' });
  });

  it('needs 1 human approval for a bot PR when require_human_for_agent_prs is true', () => {
    expect(decide(input({ author: 'claude[bot]', authorIsBot: true }))).toMatchObject({ tierName: 'low', required: 1 });
    expect(decide(input({ authorIsBot: false })).required).toBe(0);
    const off = config({ agents: 'require_human_for_agent_prs: false' });
    expect(decide(input({ cfg: off, author: 'claude[bot]', authorIsBot: true })).required).toBe(0);
  });

  it('does not change a tier that already needs approvals', () => {
    const d = decide(input({ jev: jev([0, 0, 1, 0]), author: 'claude[bot]', authorIsBot: true }));
    expect(d.required).toBe(2);
  });
});

describe('decision comment', () => {
  it('stores the decision in a marker that parses back', () => {
    const d = decide(input({ jev: jev([0.1, 0.2, 0.6, 0.1]) }));
    const body = renderComment(d, 'shadow');
    expect(body).toMatch(/^<!-- risk-gate:decision [A-Za-z0-9+/=]+ -->/);
    expect(body).toContain('### Risk gate: `high` · 2 human approvals required');
    expect(body).toContain('Shadow mode');
    expect(parseDecision(body)).toEqual(d);
  });

  it('ignores broken or old markers', () => {
    expect(parseDecision('no marker')).toBeNull();
    expect(parseDecision('<!-- risk-gate:decision bm90IGpzb24= -->')).toBeNull();
    const old = Buffer.from(JSON.stringify({ v: 0, sha: 'x' })).toString('base64');
    expect(parseDecision(`<!-- risk-gate:decision ${old} -->`)).toBeNull();
  });
});

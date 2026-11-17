import { describe, expect, it } from 'vitest';
import { evaluateGate, latestReviews, type GateInput, type Review } from '../src/core/approvals.ts';
import type { Decision } from '../src/core/decide.ts';

const HEAD = 'head-sha';
const decision: Decision = { v: 1, sha: HEAD, configHash: 'h', tier: 2, tierName: 'high', required: 2, reasons: [] };
const review = (login: string, state = 'APPROVED', commitId = HEAD, isBot = false): Review => ({ login, state, commitId, isBot });

const gate = (reviews: Review[], over: Partial<GateInput> = {}) =>
  evaluateGate({
    decision,
    latest: latestReviews(reviews),
    headSha: HEAD,
    author: 'author',
    writers: new Set(['alice', 'bob', 'carol', 'author']),
    mode: 'enforce',
    ...over,
  });

describe('evaluateGate', () => {
  it('passes with enough approvals on the head commit', () => {
    const g = gate([review('alice'), review('Bob')]);
    expect(g).toMatchObject({ state: 'success', description: 'high: 2/2 approvals', approvers: ['alice', 'Bob'] });
  });

  it('ignores approvals on older commits, from bots, from the author and from readers', () => {
    const g = gate([
      review('alice', 'APPROVED', 'old-sha'),
      review('claude[bot]', 'APPROVED', HEAD, true),
      review('author'),
      review('reader'),
      review('bob'),
    ]);
    expect(g.approvers).toEqual(['bob']);
    expect(g).toMatchObject({ state: 'pending', description: 'high: 1/2 approvals' });
  });

  it('uses the latest review per user: a dismissed approval does not count', () => {
    const g = gate([review('alice'), review('alice', 'DISMISSED'), review('bob'), review('bob', 'COMMENTED')]);
    expect(g.approvers).toEqual(['bob']);
  });

  it('blocks on requested changes until the reviewer approves', () => {
    expect(gate([review('alice'), review('bob'), review('carol', 'CHANGES_REQUESTED', 'old')]).description).toBe(
      'high: changes requested by @carol',
    );
    expect(gate([review('alice'), review('carol', 'CHANGES_REQUESTED'), review('carol')]).state).toBe('success');
  });

  it('always succeeds in shadow mode but keeps the facts in the description', () => {
    const g = gate([], { mode: 'shadow' });
    expect(g).toMatchObject({ state: 'success', description: 'shadow · high: 0/2 approvals' });
  });
});

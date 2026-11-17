import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { configJsonSchema, loadConfig } from '../src/config.ts';
import { config } from './fixtures.ts';

describe('loadConfig', () => {
  it('applies defaults and resolves tier names to indexes', () => {
    const c = config();
    expect(c.mode).toBe('enforce');
    expect(c.rules).toEqual([
      { label: 'migrations', paths: ['**/migrations/**'], minChangedLines: undefined, authors: undefined, minTier: 2 },
      { label: 'big', paths: undefined, minChangedLines: 500, authors: undefined, minTier: 1 },
    ]);
    expect(c.decider).toEqual({ model: 'typesafe/jev-1.14', onError: 3, maxStateBytes: 30000 });
    expect(c.requireHumanForAgentPrs).toBe(true);
  });

  it('turns the agent check off by default', () => {
    expect(config({ agents: '' }).requireHumanForAgentPrs).toBe(false);
  });

  it('parses the example config', () => {
    const c = loadConfig(readFileSync('examples/risk-gate.yml', 'utf8'));
    expect(c.mode).toBe('shadow');
    expect(c.tiers.map((t) => t.name)).toEqual(['low', 'medium', 'high', 'critical']);
    expect(c.requireHumanForAgentPrs).toBe(true);
    expect(c.decider.onError).toBe(3);
  });

  it('rejects unknown tier names', () => {
    expect(() => config({ decider: 'decider:\n  on_error: urgent' })).toThrow(/Unknown tier "urgent"/);
    expect(() => config({ rules: 'rules:\n  - {paths: ["a"], min_tier: urgent}' })).toThrow(/Unknown tier "urgent"/);
  });

  it('rejects duplicate tiers, unknown keys and incomplete rules', () => {
    expect(() =>
      loadConfig('tiers:\n  - {name: a, description: x, approvals: 0}\n  - {name: a, description: y, approvals: 1}'),
    ).toThrow(/Duplicate tier names: a/);
    expect(() => config({ extra: 'mood: happy' })).toThrow(/mood/);
    expect(() => config({ rules: 'rules:\n  - {min_tier: high}' })).toThrow(/needs paths, min_changed_lines or authors/);
    expect(() => config({ rules: 'rules:\n  - {paths: ["a"]}' })).toThrow(/min_tier/);
  });

  it('rejects the removed keys', () => {
    expect(() => config({ decider: 'decider:\n  escalate_at: 0.3' })).toThrow(/escalate_at/);
    expect(() => config({ decider: 'decider:\n  min_confidence: 0.5' })).toThrow(/min_confidence/);
    expect(() => config({ decider: 'decider:\n  flags: [x]' })).toThrow(/flags/);
    expect(() => config({ rules: 'rules:\n  - {paths: ["a"], min_tier: high, extra_approvals: 1}' })).toThrow(
      /extra_approvals/,
    );
    expect(() => config({ extra: 'authors:\n  agents:\n    - login: "claude[bot]"' })).toThrow(/authors/);
  });

  it('changes the hash when the text changes', () => {
    expect(config().hash).not.toBe(config({ extra: 'mode: shadow' }).hash);
  });
});

describe('JSON Schema', () => {
  it('matches the committed schema file (run "npm run schema")', () => {
    const committed = JSON.parse(readFileSync('schema/risk-gate.schema.json', 'utf8'));
    expect(committed).toEqual(configJsonSchema());
  });
});

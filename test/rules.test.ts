import { describe, expect, it } from 'vitest';
import { evaluateRules } from '../src/core/rules.ts';
import { config, file } from './fixtures.ts';

const CONFIG_PATH = '.github/risk-gate.yml';

describe('evaluateRules', () => {
  it('gives tier 0 and no hits for an ordinary change', () => {
    const r = evaluateRules(config(), [file('src/app.ts')], 'alice', CONFIG_PATH);
    expect(r).toMatchObject({ floor: 0, hits: [] });
  });

  it('applies path rules, also to the old name of a renamed file', () => {
    const renamed = { ...file('db/schema.sql'), previousPath: 'db/migrations/001.sql', status: 'renamed' };
    const r = evaluateRules(config(), [renamed, file('README.md')], 'alice', CONFIG_PATH);
    expect(r.floor).toBe(2);
    expect(r.hits).toEqual([{ label: 'migrations', minTier: 2, evidence: '`db/schema.sql`' }]);
    expect(r.hitFiles).toEqual(new Set(['db/schema.sql']));
  });

  it('always gives the highest tier to workflow files and the config file', () => {
    for (const path of ['.github/workflows/ci.yml', CONFIG_PATH]) {
      const r = evaluateRules(config({ rules: '' }), [file(path)], 'alice', `./${CONFIG_PATH}`);
      expect(r.floor).toBe(3);
      expect(r.hits[0]?.label).toMatch(/built-in/);
    }
  });

  it('counts additions plus deletions for min_changed_lines', () => {
    expect(evaluateRules(config(), [file('a.ts', 499)], 'alice', CONFIG_PATH).floor).toBe(0);
    expect(evaluateRules(config(), [file('a.ts', 300), file('b.ts', 200)], 'alice', CONFIG_PATH).floor).toBe(1);
  });

  it('takes the highest min_tier when several rules match', () => {
    const r = evaluateRules(config(), [file('db/migrations/2.sql', 600)], 'alice', CONFIG_PATH);
    expect(r.hits.map((h) => h.label)).toEqual(['migrations', 'big']);
    expect(r.floor).toBe(2);
  });

  it('matches a rule only when all of its parts match, with case-insensitive logins', () => {
    const c = config({ rules: 'rules:\n  - {name: intern infra, paths: ["infra/**"], authors: ["@Intern"], min_tier: critical}' });
    const infra = [file('infra/main.tf')];
    expect(evaluateRules(c, infra, 'intern', CONFIG_PATH).floor).toBe(3);
    expect(evaluateRules(c, infra, 'alice', CONFIG_PATH).floor).toBe(0);
    const other = evaluateRules(c, [file('src/a.ts')], 'intern', CONFIG_PATH);
    expect(other.floor).toBe(0);
    expect(other.hitFiles.size).toBe(0);
  });
});

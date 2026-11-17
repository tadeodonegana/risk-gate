import { describe, expect, it } from 'vitest';
import { buildState, OversizeError } from '../src/core/state.ts';
import { file } from './fixtures.ts';

const size = (v: unknown) => Buffer.byteLength(JSON.stringify(v), 'utf8');

describe('buildState', () => {
  it('lists every file and puts rule-matched files first, then smaller changes', () => {
    const files = [file('big.ts', 50), file('small.ts', 1), file('db/migrations/1.sql', 90)];
    const { state, omittedDiffs } = buildState(files, new Set(['db/migrations/1.sql']), 30000);
    expect(state.changed_files).toEqual([
      'modified big.ts (+50 -0)',
      'modified small.ts (+1 -0)',
      'modified db/migrations/1.sql (+90 -0)',
    ]);
    expect(state.diffs.map((d) => d.file)).toEqual(['db/migrations/1.sql', 'small.ts', 'big.ts']);
    expect(omittedDiffs).toBe(0);
    expect(state.omitted_diffs).toBeUndefined();
  });

  it('stays under the byte limit: it cuts the diffs that do not fit and omits the rest', () => {
    const quotes = '"\\'.repeat(3000); // JSON escaping doubles these characters
    const files = [file('a.ts', 1, `+${quotes}`), file('b.ts', 2, `+${'x'.repeat(9000)}`), file('c.ts', 3, `+${'y'.repeat(9000)}`)];
    const { state, shownDiffs, omittedDiffs } = buildState(files, new Set(), 8000);
    expect(size(state)).toBeLessThanOrEqual(8000);
    expect(shownDiffs + omittedDiffs).toBe(3);
    expect(omittedDiffs).toBeGreaterThan(0);
    expect(state.omitted_diffs).toMatch(new RegExp(`${omittedDiffs} changed files`));
    for (const d of state.diffs) expect(d.patch).toMatch(/\[diff truncated\]$/);
  });

  it('counts files without a patch (binary) as omitted', () => {
    const binary = { ...file('logo.png'), patch: undefined };
    expect(buildState([binary], new Set(), 30000).omittedDiffs).toBe(1);
  });

  it('throws when the file list alone is over the limit', () => {
    const files = Array.from({ length: 200 }, (_, i) => file(`src/very/long/path/to/module-${i}.ts`));
    expect(() => buildState(files, new Set(), 2000)).toThrow(OversizeError);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { askJev, JevError, TIER_INSTRUCTIONS } from '../src/jev.ts';

const OK_BODY = {
  model: 'typesafe/jev-1.14',
  answers: {
    tier: { type: 'score', score: 1.4, confidence: 0.7, legend: { 0: 'a', 1: 'b', 2: 'c' }, probabilities: { 0: 0.1, 1: 0.4, 2: 0.5 } },
  },
  usage: { input_tokens: 812, output_tokens: 9, cost: 0.000034 },
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const options = (fetchFn: typeof fetch) => ({
  apiUrl: 'https://openrouter.ai/api/v1/',
  apiKey: 'sk-test',
  model: 'typesafe/jev-1.14',
  state: { changed_files: ['modified a.ts (+1 -0)'], diffs: [] },
  tierDescriptions: ['a', 'b', 'c'],
  fetchFn,
  retryDelayMs: 0,
});

describe('askJev', () => {
  it('sends one Score question for the tiers, then parses the answer', async () => {
    const fetchFn = vi.fn(async () => json(200, OK_BODY));
    const answer = await askJev(options(fetchFn as unknown as typeof fetch));

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/systemone');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'typesafe/jev-1.14',
      state: { changed_files: ['modified a.ts (+1 -0)'], diffs: [] },
      questions: {
        tier: { type: 'score', instructions: TIER_INSTRUCTIONS, criteria: ['a', 'b', 'c'] },
      },
    });
    expect(answer).toEqual({
      model: 'typesafe/jev-1.14',
      tierProbabilities: [0.1, 0.4, 0.5],
      inputTokens: 812,
      cost: 0.000034,
    });
  });

  it('retries on 429 and 5xx, then succeeds', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(json(429, { error: { message: 'slow down' } }))
      .mockResolvedValueOnce(json(502, {}))
      .mockResolvedValueOnce(json(200, OK_BODY));
    await expect(askJev(options(fetchFn))).resolves.toMatchObject({ inputTokens: 812 });
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a 401', async () => {
    const fetchFn = vi.fn(async () => json(401, { error: { message: 'bad key' } }));
    await expect(askJev(options(fetchFn as unknown as typeof fetch))).rejects.toThrow(/HTTP 401/);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('rejects a refusal or a missing score answer', async () => {
    const refusal = { ...OK_BODY, answers: { tier: { type: 'refusal' } } };
    await expect(askJev(options(async () => json(200, refusal)))).rejects.toThrow(/refused/);
    const noScore = { ...OK_BODY, answers: {} };
    await expect(askJev(options(async () => json(200, noScore)))).rejects.toThrow(JevError);
  });
});

import type { JevAnswer } from './core/decide.ts';

export const DEFAULT_API_URL = 'https://openrouter.ai/api/v1';

export const TIER_INSTRUCTIONS =
  'Rate the risk of merging this code change into production. ' +
  'Consider what can break, how many users or systems it affects, and how hard it is to undo.';

export interface AskJevOptions {
  /** OpenRouter (https://openrouter.ai/api/v1) or TypeSafe (https://api.typesafe.ai/v1). Both serve POST /systemone. */
  apiUrl: string;
  apiKey: string;
  model: string;
  state: unknown;
  /** Tier descriptions, lowest risk first. They become the Score levels. */
  tierDescriptions: string[];
  fetchFn?: typeof fetch;
  attempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
}

export class JevError extends Error {}

const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504, 524, 529]);

interface RawAnswer {
  type?: string;
  probabilities?: Record<string, number>;
}

interface RawResponse {
  model?: string;
  answers?: Record<string, RawAnswer>;
  usage?: { input_tokens?: number; cost?: number };
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One System One request with one Score question over the tiers. */
export async function askJev(o: AskJevOptions): Promise<JevAnswer> {
  const fetchFn = o.fetchFn ?? fetch;
  const attempts = o.attempts ?? 3;
  const questions = {
    tier: { type: 'score', instructions: TIER_INSTRUCTIONS, criteria: o.tierDescriptions },
  };
  const body = JSON.stringify({ model: o.model, state: o.state, questions });

  let lastError = 'no attempt';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (attempt > 1) await new Promise((r) => setTimeout(r, (o.retryDelayMs ?? 2000) * (attempt - 1)));
    let res: Response;
    try {
      res = await fetchFn(`${o.apiUrl.replace(/\/+$/, '')}/systemone`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${o.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'risk-gate',
        },
        body,
        signal: AbortSignal.timeout(o.timeoutMs ?? 30_000),
      });
    } catch (e) {
      lastError = `network error: ${(e as Error).message}`;
      continue;
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 300);
      lastError = `HTTP ${res.status}${text ? `: ${text}` : ''}`;
      if (RETRY_STATUS.has(res.status)) continue;
      throw new JevError(lastError);
    }
    return parseAnswer((await res.json()) as RawResponse, o.tierDescriptions.length);
  }
  throw new JevError(lastError);
}

export function parseAnswer(json: RawResponse, tierCount: number): JevAnswer {
  const tier = json.answers?.tier;
  if (tier?.type === 'refusal') throw new JevError('Jev refused to answer');
  if (tier?.type !== 'score' || !tier.probabilities) {
    throw new JevError('the response has no score answer for "tier"');
  }
  const probabilities = tier.probabilities;
  const tierProbabilities = Array.from({ length: tierCount }, (_, i) => {
    const p = probabilities[String(i)];
    return isNumber(p) ? p : 0;
  });
  return {
    model: json.model ?? 'unknown',
    tierProbabilities,
    inputTokens: json.usage?.input_tokens ?? 0,
    cost: json.usage?.cost,
  };
}

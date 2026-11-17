import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const DEFAULT_CONFIG_PATH = '.github/risk-gate.yml';
export const DEFAULT_MODEL = 'typesafe/jev-1.14';

/** Paths that always get the highest tier. The config path is added at run time. */
export const BUILTIN_PROTECTED_PATHS = ['.github/workflows/**'];

const tierName = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Use letters, digits, "-" or "_".');

const tierSchema = z.strictObject({
  name: tierName,
  description: z
    .string()
    .min(1)
    .describe('When this tier applies. Jev reads this text, so write it in English.'),
  approvals: z.int().min(0).max(10).describe('Human approvals that this tier needs.'),
});

const ruleSchema = z
  .strictObject({
    name: z.string().min(1).optional().describe('A label for the PR comment.'),
    paths: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe('Globs. This part matches when one changed file (or its old name) matches one glob.'),
    min_changed_lines: z
      .int()
      .min(1)
      .optional()
      .describe('This part matches when additions + deletions >= this value.'),
    authors: z
      .array(z.string().min(1))
      .min(1)
      .optional()
      .describe('This part matches when the PR author is in this list.'),
    min_tier: tierName.describe('The lowest tier that a matched PR can get.'),
  })
  .describe('A rule matches only when all of its given parts match.')
  .refine((r) => r.paths || r.min_changed_lines || r.authors, {
    message: 'A rule needs paths, min_changed_lines or authors.',
  });

export const configSchema = z
  .strictObject({
    mode: z
      .enum(['enforce', 'shadow'])
      .default('enforce')
      .describe('shadow: comment only, the status is always success.'),
    tiers: z
      .array(tierSchema)
      .min(2)
      .max(10)
      .describe('Risk tiers, from the lowest to the highest risk.'),
    rules: z.array(ruleSchema).default([]),
    require_human_for_agent_prs: z
      .boolean()
      .default(false)
      .describe('If true, a PR opened by a bot account (an agent) needs at least 1 human approval, also when its tier needs 0.'),
    decider: z
      .strictObject({
        model: z.string().min(1).default(DEFAULT_MODEL),
        on_error: tierName
          .optional()
          .describe('The tier to use when Jev fails. Default: the highest tier.'),
        max_state_bytes: z
          .int()
          .min(2000)
          .max(200000)
          .default(30000)
          .describe('Size limit of the input to Jev. Keep it under about 32 KB.'),
      })
      .prefault({}),
  })
  .superRefine((c, ctx) => {
    const names = c.tiers.map((t) => t.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) ctx.addIssue({ code: 'custom', path: ['tiers'], message: `Duplicate tier names: ${dupes.join(', ')}` });
    c.rules.forEach((r, i) => {
      if (!names.includes(r.min_tier)) {
        ctx.addIssue({ code: 'custom', path: ['rules', i, 'min_tier'], message: `Unknown tier "${r.min_tier}"` });
      }
    });
    if (c.decider.on_error && !names.includes(c.decider.on_error)) {
      ctx.addIssue({ code: 'custom', path: ['decider', 'on_error'], message: `Unknown tier "${c.decider.on_error}"` });
    }
  });

export interface Tier {
  name: string;
  description: string;
  approvals: number;
}

export interface Rule {
  label: string;
  paths?: string[];
  minChangedLines?: number;
  authors?: string[];
  minTier: number;
}

export interface Config {
  mode: 'enforce' | 'shadow';
  tiers: Tier[];
  rules: Rule[];
  requireHumanForAgentPrs: boolean;
  decider: {
    model: string;
    onError: number;
    maxStateBytes: number;
  };
  /** Changes when the config text changes. Part of the decision cache key. */
  hash: string;
}

export class ConfigError extends Error {}

export const normalizeLogin = (l: string): string => l.replace(/^@/, '').toLowerCase();

export function loadConfig(text: string): Config {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (e) {
    throw new ConfigError(`The config is not valid YAML: ${(e as Error).message}`);
  }
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) throw new ConfigError(`The config is not valid:\n${z.prettifyError(parsed.error)}`);
  const c = parsed.data;
  const index = (name: string) => c.tiers.findIndex((t) => t.name === name);
  return {
    mode: c.mode,
    tiers: c.tiers,
    rules: c.rules.map((r, i) => ({
      label: r.name ?? `rules[${i}]`,
      paths: r.paths,
      minChangedLines: r.min_changed_lines,
      authors: r.authors?.map(normalizeLogin),
      minTier: index(r.min_tier),
    })),
    requireHumanForAgentPrs: c.require_human_for_agent_prs,
    decider: {
      model: c.decider.model,
      onError: c.decider.on_error === undefined ? c.tiers.length - 1 : index(c.decider.on_error),
      maxStateBytes: c.decider.max_state_bytes,
    },
    hash: createHash('sha256').update(text).digest('hex').slice(0, 12),
  };
}

export function configJsonSchema(): Record<string, unknown> {
  return {
    ...z.toJSONSchema(configSchema, { io: 'input' }),
    title: 'risk-gate config',
  };
}

import { loadConfig, type Config } from '../src/config.ts';
import type { ChangedFile } from '../src/core/rules.ts';

const TIERS = `
tiers:
  - { name: low, description: Docs or tests only., approvals: 0 }
  - { name: medium, description: A normal change in one module., approvals: 1 }
  - { name: high, description: Shared code or the data model., approvals: 2 }
  - { name: critical, description: "Auth, secrets or infrastructure.", approvals: 2 }
`;

const RULES = `
rules:
  - name: migrations
    paths: ["**/migrations/**"]
    min_tier: high
  - name: big
    min_changed_lines: 500
    min_tier: medium
`;

const AGENTS = 'require_human_for_agent_prs: true';

export interface ConfigParts {
  rules?: string;
  agents?: string;
  decider?: string;
  extra?: string;
}

/** The test config. Replace one block to test it. */
export const configText = (p: ConfigParts = {}): string =>
  [TIERS, p.rules ?? RULES, p.agents ?? AGENTS, p.decider ?? '', p.extra ?? ''].join('\n');

export const config = (p: ConfigParts = {}): Config => loadConfig(configText(p));

export const file = (path: string, changes = 10, patch = `@@ -1 +1 @@\n-old\n+new`): ChangedFile => ({
  path,
  status: 'modified',
  additions: changes,
  deletions: 0,
  patch,
});

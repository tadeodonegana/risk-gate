import picomatch from 'picomatch';
import { BUILTIN_PROTECTED_PATHS, normalizeLogin, type Config, type Rule } from '../config.ts';

export interface ChangedFile {
  path: string;
  previousPath?: string;
  status: string;
  additions: number;
  deletions: number;
  /** GitHub omits the patch for binary files and very large diffs. */
  patch?: string;
}

export interface RuleHit {
  label: string;
  minTier: number;
  evidence: string;
}

export interface RulesResult {
  /** The lowest tier the PR can get. */
  floor: number;
  hits: RuleHit[];
  /** Files that matched a path rule. Jev sees their diffs first. */
  hitFiles: Set<string>;
}

const MAX_LISTED_FILES = 3;

function listFiles(paths: string[]): string {
  const shown = paths.slice(0, MAX_LISTED_FILES).map((p) => `\`${p}\``);
  const more = paths.length - shown.length;
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ');
}

/** Deterministic rules. They run before Jev and Jev cannot lower their result. */
export function evaluateRules(cfg: Config, files: ChangedFile[], author: string, configPath: string): RulesResult {
  const builtIn: Rule = {
    label: 'built-in: CI workflows and the risk-gate config',
    paths: [...BUILTIN_PROTECTED_PATHS, configPath.replace(/^\.\//, '')],
    minTier: cfg.tiers.length - 1,
  };
  const changedLines = files.reduce((n, f) => n + f.additions + f.deletions, 0);
  const authorKey = normalizeLogin(author);
  const result: RulesResult = { floor: 0, hits: [], hitFiles: new Set() };

  for (const rule of [builtIn, ...cfg.rules]) {
    const evidence: string[] = [];
    let matchedFiles: string[] = [];
    if (rule.paths) {
      const isMatch = picomatch(rule.paths, { dot: true });
      matchedFiles = files
        .filter((f) => isMatch(f.path) || (f.previousPath !== undefined && isMatch(f.previousPath)))
        .map((f) => f.path);
      if (matchedFiles.length === 0) continue;
      evidence.push(listFiles(matchedFiles));
    }
    if (rule.minChangedLines !== undefined) {
      if (changedLines < rule.minChangedLines) continue;
      evidence.push(`${changedLines} changed lines`);
    }
    if (rule.authors) {
      if (!rule.authors.includes(authorKey)) continue;
      evidence.push(`author @${author}`);
    }
    for (const p of matchedFiles) result.hitFiles.add(p);
    result.floor = Math.max(result.floor, rule.minTier);
    result.hits.push({ label: rule.label, minTier: rule.minTier, evidence: evidence.join(', ') });
  }
  return result;
}

import type { ChangedFile } from './rules.ts';

/** The input ("state") that Jev reads. It has no PR title or body: the change sets the tier, not the author. */
export interface JevState {
  changed_files: string[];
  diffs: { file: string; patch: string }[];
  omitted_diffs?: string;
}

export class OversizeError extends Error {}

const bytes = (v: unknown): number => Buffer.byteLength(JSON.stringify(v), 'utf8');
/** Room for the omitted_diffs note and the commas between entries. */
const RESERVE = 200;
const MIN_PARTIAL_PATCH = 400;
const TRUNCATED = '\n[diff truncated]';

/**
 * Builds the Jev input under maxBytes. Files that matched a path rule come first,
 * then the smaller changes, so Jev sees as many files as possible.
 */
export function buildState(
  files: ChangedFile[],
  priority: Set<string>,
  maxBytes: number,
): { state: JevState; shownDiffs: number; omittedDiffs: number } {
  const state: JevState = {
    changed_files: files.map(
      (f) => `${f.status} ${f.previousPath ? `${f.previousPath} -> ` : ''}${f.path} (+${f.additions} -${f.deletions})`,
    ),
    diffs: [],
  };
  let size = bytes(state) + RESERVE;
  if (size > maxBytes) {
    throw new OversizeError(`the file list alone is ${size} bytes, over the ${maxBytes}-byte limit`);
  }

  const ordered = [...files].sort(
    (a, b) =>
      Number(priority.has(b.path)) - Number(priority.has(a.path)) ||
      a.additions + a.deletions - (b.additions + b.deletions),
  );
  let omitted = 0;
  for (const f of ordered) {
    if (!f.patch) {
      omitted++;
      continue;
    }
    let entry = { file: f.path, patch: f.patch };
    let cost = bytes(entry) + 1;
    if (size + cost > maxBytes) {
      // Cut the patch until it fits. JSON escaping makes the byte count larger than the char count.
      let chars = maxBytes - size - bytes({ file: f.path, patch: TRUNCATED });
      while (chars >= MIN_PARTIAL_PATCH) {
        entry = { file: f.path, patch: f.patch.slice(0, chars) + TRUNCATED };
        cost = bytes(entry) + 1;
        if (size + cost <= maxBytes) break;
        chars = Math.floor(chars * 0.8);
      }
      if (chars < MIN_PARTIAL_PATCH) {
        omitted++;
        continue;
      }
    }
    state.diffs.push(entry);
    size += cost;
  }
  if (omitted > 0) {
    state.omitted_diffs = `The diffs of ${omitted} changed files are not shown (size limit, binary file or very large diff).`;
  }
  return { state, shownDiffs: state.diffs.length, omittedDiffs: omitted };
}

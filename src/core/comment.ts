import { DECISION_VERSION, type Decision } from './decide.ts';

const MARKER_RE = /<!-- risk-gate:decision ([A-Za-z0-9+/=]+) -->/;

export const hasMarker = (body: string): boolean => MARKER_RE.test(body);

/** Reads the cached decision from a PR comment. Returns null for a missing, broken or old marker. */
export function parseDecision(body: string): Decision | null {
  const match = MARKER_RE.exec(body);
  if (!match?.[1]) return null;
  try {
    const d = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8')) as Partial<Decision>;
    const valid =
      d.v === DECISION_VERSION &&
      typeof d.sha === 'string' &&
      typeof d.configHash === 'string' &&
      typeof d.tier === 'number' &&
      typeof d.tierName === 'string' &&
      typeof d.required === 'number' &&
      Array.isArray(d.reasons);
    return valid ? (d as Decision) : null;
  } catch {
    return null;
  }
}

export function renderComment(d: Decision, mode: 'enforce' | 'shadow'): string {
  const marker = `<!-- risk-gate:decision ${Buffer.from(JSON.stringify(d)).toString('base64')} -->`;
  const approvals = d.required === 1 ? '1 human approval' : `${d.required} human approvals`;
  const footer = [
    `commit ${d.sha.slice(0, 7)}`,
    d.model ? `model ${d.model}` : '',
    d.inputTokens !== undefined ? `${d.inputTokens.toLocaleString('en-US')} input tokens` : '',
    `config ${d.configHash.slice(0, 7)}`,
  ].filter(Boolean);
  return [
    marker,
    `### Risk gate: \`${d.tierName}\` · ${approvals} required`,
    '',
    ...(mode === 'shadow' ? ['> Shadow mode: this check does not block the merge.', ''] : []),
    ...d.reasons.map((r) => `- ${r}`),
    '',
    'The `risk-gate` status shows the approval count. Only approvals on the latest commit count.',
    '',
    `<sub>${footer.join(' · ')}</sub>`,
  ].join('\n');
}

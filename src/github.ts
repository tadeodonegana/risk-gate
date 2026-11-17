import { getOctokit } from '@actions/github';
import type { Review } from './core/approvals.ts';
import { hasMarker } from './core/comment.ts';
import type { ChangedFile } from './core/rules.ts';

export const STATUS_CONTEXT = 'risk-gate';
/** The decision cache is trusted only from comments by this account (the default GITHUB_TOKEN). */
export const COMMENT_AUTHOR = 'github-actions[bot]';

export interface PullRequest {
  number: number;
  headSha: string;
  baseRef: string;
  author: string;
  /** True for GitHub App accounts such as claude[bot] or Copilot. */
  authorIsBot: boolean;
  isFork: boolean;
}

export type StatusState = 'success' | 'pending' | 'error';

/** Everything the run needs from GitHub. Tests use a fake. */
export interface GitHubPort {
  getPull(number: number): Promise<PullRequest>;
  /** Returns null when the file does not exist on that ref. */
  getFile(ref: string, path: string): Promise<string | null>;
  listFiles(number: number): Promise<ChangedFile[]>;
  listReviews(number: number): Promise<Review[]>;
  hasWriteAccess(login: string): Promise<boolean>;
  findDecisionComment(number: number): Promise<{ id: number; body: string; url: string } | null>;
  /** Updates the comment when id is set, else creates one. Returns the comment URL. */
  writeDecisionComment(number: number, body: string, id: number | null): Promise<string>;
  setStatus(sha: string, state: StatusState, description: string, targetUrl?: string): Promise<void>;
}

const httpStatus = (e: unknown): number | undefined => (e as { status?: number }).status;

export function createGitHubPort(token: string, owner: string, repo: string): GitHubPort {
  const octokit = getOctokit(token);
  const rest = octokit.rest;
  return {
    async getPull(number) {
      const { data } = await rest.pulls.get({ owner, repo, pull_number: number });
      return {
        number,
        headSha: data.head.sha,
        baseRef: data.base.ref,
        author: data.user?.login ?? '',
        authorIsBot: data.user?.type === 'Bot',
        isFork: data.head.repo?.full_name !== data.base.repo.full_name,
      };
    },

    async getFile(ref, path) {
      try {
        const { data } = await rest.repos.getContent({ owner, repo, path, ref });
        if (Array.isArray(data) || data.type !== 'file') return null;
        return Buffer.from(data.content, 'base64').toString('utf8');
      } catch (e) {
        if (httpStatus(e) === 404) return null;
        throw e;
      }
    },

    async listFiles(number) {
      const files = await octokit.paginate(rest.pulls.listFiles, { owner, repo, pull_number: number, per_page: 100 });
      return files.map((f) => ({
        path: f.filename,
        previousPath: f.previous_filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch,
      }));
    },

    async listReviews(number) {
      const reviews = await octokit.paginate(rest.pulls.listReviews, { owner, repo, pull_number: number, per_page: 100 });
      return reviews.map((r) => ({
        login: r.user?.login ?? '',
        isBot: r.user?.type === 'Bot',
        state: r.state,
        commitId: r.commit_id ?? null,
      }));
    },

    async hasWriteAccess(login) {
      try {
        const { data } = await rest.repos.getCollaboratorPermissionLevel({ owner, repo, username: login });
        // "permission" maps maintain to write and triage to read.
        return data.permission === 'admin' || data.permission === 'write';
      } catch (e) {
        if (httpStatus(e) === 404) return false;
        throw e;
      }
    },

    async findDecisionComment(number) {
      const comments = await octokit.paginate(rest.issues.listComments, { owner, repo, issue_number: number, per_page: 100 });
      const ours = comments.filter((c) => c.user?.login === COMMENT_AUTHOR && c.body && hasMarker(c.body)).at(-1);
      return ours ? { id: ours.id, body: ours.body ?? '', url: ours.html_url } : null;
    },

    async writeDecisionComment(number, body, id) {
      if (id !== null) {
        const { data } = await rest.issues.updateComment({ owner, repo, comment_id: id, body });
        return data.html_url;
      }
      const { data } = await rest.issues.createComment({ owner, repo, issue_number: number, body });
      return data.html_url;
    },

    async setStatus(sha, state, description, targetUrl) {
      await rest.repos.createCommitStatus({
        owner,
        repo,
        sha,
        state,
        context: STATUS_CONTEXT,
        description,
        target_url: targetUrl,
      });
    },
  };
}

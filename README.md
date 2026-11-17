<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <img alt="risk-gate logo" src="docs/assets/logo-light.svg" width="96" height="96">
  </picture>
</p>

# risk-gate

Human approval for pull requests, scaled by risk.

**Documentation:** https://risk-gate.readthedocs.io/

risk-gate gives each PR a risk tier. The tier sets how many human approvals the PR needs. Two sources decide the tier:

1. **Rules** that you write: paths, change size and authors. They are deterministic.
2. **[Jev](https://typesafe.ai)**, the TypeSafe decision model, through OpenRouter. Jev reads the diff and gives a probability for each of your tiers.

The final tier is the higher of the two. Jev can raise the tier above the rules, but it can never lower it.

risk-gate then counts the valid human approvals and sets a commit status named `risk-gate`. Make that status a required check, and GitHub blocks the merge until the PR has enough approvals.

## Setup

1. Get an [OpenRouter](https://openrouter.ai) API key. Add it as the repository (or organization) secret `OPENROUTER_API_KEY`.
2. Copy [`examples/risk-gate.yml`](examples/risk-gate.yml) to `.github/risk-gate.yml` on your default branch. Edit the tiers and rules.
3. Copy [`examples/workflow.yml`](examples/workflow.yml) to `.github/workflows/risk-gate.yml`.
4. Keep `mode: shadow` for one or two weeks. risk-gate then comments on each PR, but the status is always `success`. Read the comments and tune the tiers and rules.
5. Set `mode: enforce`. In a branch ruleset, add `risk-gate` as a required status check and set the required approvals to 0. risk-gate now does the approval count. To cover all repositories, use an organization ruleset and an organization secret.

## How the tier is decided

On each new commit (or after a config change):

1. **Rules.** Each matched rule sets a minimum tier (`min_tier`). A rule matches only when all of its parts (`paths`, `min_changed_lines`, `authors`) match. If several rules match, the highest `min_tier` wins.
2. **Jev input.** risk-gate sends the list of changed files and the diffs, under `decider.max_state_bytes` (default 30,000). Files that matched a path rule come first. If the diffs are too large, risk-gate cuts some and tells Jev how many it did not send.
3. **Jev tier.** Jev gives a probability for each tier. risk-gate takes the most probable tier. In a tie, it takes the higher tier.
4. **Final tier** = max(rule tier, Jev tier).
5. **Required approvals** = the approvals of the final tier. If `require_human_for_agent_prs` is `true` and a bot account opened the PR, the minimum is 1.

If Jev fails (no key, HTTP error, refusal, file list too large), risk-gate fails closed: it uses `decider.on_error` (default: the highest tier).

risk-gate stores the decision in a hidden marker in its PR comment. Review events reuse it and do not call Jev again. So the tier does not change between two reviews, and a PR costs one Jev call per commit.

## Which approvals count

risk-gate reads the latest review of each user. An approval counts only when:

- it is on the head commit of the PR,
- the reviewer has write, maintain or admin access,
- the reviewer is not the PR author or a bot account.

A "changes requested" review from a counted reviewer blocks the gate until that reviewer approves or the review is dismissed.

An "agent PR" is a PR whose author is a bot account (a GitHub App, such as `claude[bot]`, Copilot or Dependabot). With `require_human_for_agent_prs: true`, such a PR needs at least 1 human approval. This changes only tiers that need 0 approvals, because every approval that counts is already human. An agent that opens PRs from a normal user account is not detected.

## Config reference

The full schema is in [`schema/risk-gate.schema.json`](schema/risk-gate.schema.json). Add this line at the top of your config file for editor autocomplete:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/tadeodonegana/risk-gate/v1/schema/risk-gate.schema.json
```

| Key | Default | Meaning |
|---|---|---|
| `mode` | `enforce` | `shadow`: comment only, the status is always `success` |
| `tiers[]` | required | 2 to 10 tiers, lowest risk first: `name`, `description` (Jev reads it), `approvals` |
| `rules[]` | `[]` | `paths`, `min_changed_lines`, `authors`, and the required `min_tier` |
| `require_human_for_agent_prs` | `false` | `true`: a PR from a bot account needs at least 1 human approval |
| `decider.model` | `typesafe/jev-1.14` | Pin a version. A new model version can move the tiers |
| `decider.on_error` | highest tier | Tier when Jev fails |
| `decider.max_state_bytes` | `30000` | Size limit of the Jev input. Above about 32 KB, Jev is slower and less accurate |

Write the tier descriptions in English. Jev is most accurate in English.

## Inputs and outputs

| Input | Default | |
|---|---|---|
| `api-key` | none | OpenRouter key. Without it, every PR gets the `on_error` tier |
| `api-url` | `https://openrouter.ai/api/v1` | Use `https://api.typesafe.ai/v1` with a direct TypeSafe key (then use a model name like `jev-latest`) |
| `config-path` | `.github/risk-gate.yml` | Read from the base branch |
| `github-token` | `${{ github.token }}` | Keep the default |

Outputs: `tier`, `required-approvals`, `approvals`, `state`, `cached`.

## Security model and limits

- **The config comes from the base branch.** A PR cannot change the rules that apply to it. A PR that changes the config gets the highest tier.
- **No PR code runs.** The workflow uses `pull_request_target`, so fork PRs also get the API key. risk-gate never checks out the PR. It reads the diff through the API.
- **Prompt injection.** The diff can contain text that asks Jev for a low tier. Jev can only raise the tier above the rules, so put your sensitive paths in `rules`.
- **Statuses from `GITHUB_TOKEN` are not tamper-proof.** In a same-repository PR, a new workflow file can also post `risk-gate: success` with `GITHUB_TOKEN`. The built-in rule makes such a PR critical, but it cannot stop that workflow from posting. For strict enforcement, post the status from a GitHub App and set that App as the required source of the check in the ruleset.
- **Only comments by `github-actions[bot]` are read as a cached decision.** Other workflows that use `GITHUB_TOKEN` post as the same account.
- **Fork PRs:** a review event on a fork PR gets a read-only token, so risk-gate cannot update the status. After the approvals, re-run the last risk-gate job of the PR.
- **Jev gives no text.** The comment shows the tier probabilities, not an explanation.

## Cost

Jev 1.14 on OpenRouter costs US$0.042 per million input tokens. Output tokens are free. A PR with a 30 KB diff uses about 8,000 tokens, which is about US$0.0003 per commit.

## Development

```sh
npm install
npm run typecheck
npm test
npm run schema   # regenerate schema/risk-gate.schema.json from src/config.ts
npm run build    # bundle to dist/index.js (commit it)
npm run all      # all of the above
npm run docs     # preview the docs site (needs uv) on http://localhost:8000
```

The docs site lives in `docs/` and `zensical.toml`, and Read the Docs builds it with `.readthedocs.yaml`.

`src/core/` has the pure logic (rules, Jev input, decision, approvals, comment). `src/jev.ts` calls the System One API. `src/github.ts` is the only file that calls GitHub. `src/run.ts` connects them.

To release: run `npm run all`, commit `dist/`, tag `v1.0.0`, and move the `v1` tag to the same commit. Publish to the GitHub Marketplace from the release page. Turn on immutable releases in the repository settings.

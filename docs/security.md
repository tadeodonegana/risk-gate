# Security and limits

## What protects the gate

**The config comes from the base branch.**
A pull request cannot change the rules that apply to it. A PR that changes the config file gets the highest tier, so the change itself needs the most review.

**No pull request code runs.**
The workflow uses `pull_request_target`, so PRs from forks also get the API key. risk-gate never checks out the PR. It reads the file list and the diff through the GitHub API.

**Jev can only raise the tier.**
A diff can contain text that tries to make Jev choose a low tier. The final tier is never lower than the rule tier, so put your sensitive paths in [rules](concepts/tiers.md#rules).

**It fails closed.**
Without an API key, or when the API fails or refuses, risk-gate uses the `decider.on_error` tier, which is the highest tier by default. A missing or broken config sets the status to `error`.

**Only real human approvals count.**
Approvals must be on the latest commit, from a person with write access who is not the author. Bot approvals never count. See [Which approvals count](concepts/approvals.md).

**The decision cache trusts one account.**
risk-gate reads saved decisions only from comments by `github-actions[bot]`, and only for the same commit and the same config.

## Known limits

!!! warning "Statuses from `GITHUB_TOKEN` are not tamper-proof"
    In a pull request from a branch of the same repository, a new workflow file can also post a `risk-gate: success` status with `GITHUB_TOKEN`, and it can also write a comment as `github-actions[bot]`. The built-in rule gives such a PR the highest tier, but it cannot stop the new workflow from posting. For strict enforcement, post the status from a GitHub App and set that App as the required source of the check in the ruleset.

**Review events on fork pull requests.**
A `pull_request_review` event on a PR from a fork gets a read-only token, so risk-gate cannot update the status. After the approvals, re-run the last risk-gate job of the PR.

**Agent detection.**
risk-gate detects agent PRs by the bot account type. An agent that uses a normal user account is not detected.

**Jev does not explain.**
Jev returns probabilities, not text. The comment shows the probability of each tier, not a reason in words.

**Language.**
Jev is most accurate in English. Write the tier descriptions in English.

## Protect your copy of the action

Every repository that uses risk-gate runs its code with its own secrets. If you fork or host the action:

- turn on two-factor authentication for the owner account,
- protect the `main` branch and the `v*` tags with rulesets,
- turn on immutable releases,
- tell users to pin a commit SHA.

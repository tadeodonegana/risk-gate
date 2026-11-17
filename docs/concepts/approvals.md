# Which approvals count

risk-gate reads the **latest review of each person** on the PR. An approval counts only when all of these are true:

- it is on the **head commit** of the PR,
- the reviewer has **write, maintain or admin** access to the repository,
- the reviewer is **not a bot** and **not the author** of the PR.

## Examples

| Reviewer | Latest review | Counts? | Why |
|---|---|---|---|
| alice | APPROVED on the head commit | yes | Write access, latest commit. |
| bob | APPROVED on an older commit | no | An approval covers one commit only. |
| carol | APPROVED on the head commit | no | She has read access only. |
| claude[bot] | APPROVED on the head commit | no | Bot reviews never count. |
| dave | CHANGES_REQUESTED | blocks | Blocks until dave approves or someone dismisses the review. |

## New commits

An approval covers one commit. When the author pushes a new commit, the old approvals stop counting, and risk-gate decides the tier again for the new commit. Reviewers must approve the latest commit.

## Requested changes

A "changes requested" review from a person who counts blocks the gate, even if the PR has enough approvals. It stops blocking when that person approves, or when someone dismisses the review.

## Agent PRs

An **agent PR** is a pull request whose author is a bot account: a GitHub App such as `claude[bot]`, Copilot or Dependabot.

```yaml
require_human_for_agent_prs: true
```

With `true`, an agent PR needs **at least one human approval**, even when its tier needs zero. With `false`, or without the key, risk-gate does not check this.

!!! info "When this changes something"
    Every approval that counts is already human. So this option changes only the tiers that need zero approvals. A `critical` PR from an agent still needs the approvals of `critical`.

!!! warning "Limit"
    risk-gate detects agents by the account type. An agent that opens PRs from a normal user account looks like a human author.

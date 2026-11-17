---
title: Home
hide:
  - navigation
  - toc
---

<div class="rg-hero" markdown>

![](assets/logo-light.svg#only-light){ .rg-logo }
![](assets/logo-dark.svg#only-dark){ .rg-logo }

<h1 class="rg-name">risk-gate</h1>

<p class="rg-slogan">Human approval, scaled by risk.</p>

risk-gate is a GitHub Action that gives each pull request a **risk tier**. The tier sets how many **human approvals** the PR needs before it can merge. Your rules and the Jev decision model choose the tier together.

[Get started](get-started/install.md){ .md-button .md-button--primary }
[Try the simulator](simulator.md){ .md-button }

</div>

## How it works

Say that your repository has database migrations. You add `.github/risk-gate.yml` to your default branch:

```yaml title=".github/risk-gate.yml"
tiers: # lowest risk first
  - name: low
    description: Docs, tests, comments or copy. No change to runtime behavior.
    approvals: 0
  - name: medium
    description: A normal feature or bug fix inside one module.
    approvals: 1
  - name: high
    description: Shared code, a public API, the data model or payments.
    approvals: 2

rules:
  - name: migrations
    paths: ["**/migrations/**"]
    min_tier: high
```

Then, on each new commit of a pull request:

1. Your **rules** set a minimum tier. A PR that touches a migration is at least `high`.
2. **Jev** reads the changed files and the diff, and gives a probability for each tier. risk-gate takes the most probable tier. Jev can raise the tier above your rules, but it can never lower it.
3. risk-gate writes the decision in a PR comment and sets a commit status named `risk-gate`. The status stays `pending` until the PR has enough human approvals on its latest commit. Then it changes to `success`.

Make `risk-gate` a required status check, and GitHub blocks the merge until the right number of people approved.

<div class="rg-comment" markdown>
<div class="rg-comment__head">github-actions[bot] commented</div>
<div class="rg-comment__body" markdown>

#### Risk gate: `high` · 2 human approvals required

- Rule **migrations** matched `db/migrations/0042_add_index.sql`: min tier `high`.
- Jev: `medium` (low 0.10 · medium 0.62 · high 0.28).

The `risk-gate` status shows the approval count. Only approvals on the latest commit count.

</div>
</div>

## Features

<div class="grid cards" markdown>

-   **Rules that you control**

    ---

    Paths, change size and authors set a minimum tier. CI workflows and the risk-gate config always get the highest tier.

    [Read more](concepts/tiers.md#rules)

-   **A decision model, not a chatbot**

    ---

    Jev answers one typed question: which of your tiers fits this change. It returns a probability for each tier, for a fraction of a cent.

    [Read more](concepts/tiers.md#jev)

-   **Only real approvals count**

    ---

    The latest review of each person, on the latest commit, from people with write access. Bot reviews never count.

    [Read more](concepts/approvals.md)

-   **Agent pull requests**

    ---

    One switch: a PR from a bot account, such as a coding agent, needs at least one human approval.

    [Read more](concepts/approvals.md#agent-prs)

-   **Shadow mode**

    ---

    Comment on every PR without blocking anything. Tune your tiers and rules, then enforce.

    [Read more](get-started/enforce.md)

-   **Fails closed**

    ---

    No API key, an API error or a refusal gives a high tier, never a free pass.

    [Read more](concepts/tiers.md#when-jev-fails)

</div>

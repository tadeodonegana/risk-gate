# Enforce

Roll out risk-gate in two steps: watch first in shadow mode, then enforce.

## 1. Shadow mode

With `mode: shadow`, risk-gate does everything except block:

- it writes the decision comment on each PR,
- it sets the `risk-gate` status, but always to `success`. The description starts with `shadow ·` and shows the real count, for example `shadow · high: 0/2 approvals`.

Keep shadow mode for one or two weeks. Read the comments on real PRs and ask:

- Do the tiers match what your reviewers think?
- Is a tier description too wide or too narrow? Jev reads the descriptions, so a better description gives better tiers.
- Do some paths always need a minimum tier? Add a [rule](../concepts/tiers.md#rules).

## 2. Enforce mode

Set `mode: enforce` in `.github/risk-gate.yml` on the default branch. Then make the status block the merge:

1. Open **Settings** → **Rules** → **Rulesets** and create (or edit) a branch ruleset for your default branch.
2. Turn on **Require status checks to pass** and add `risk-gate`.
3. Turn on **Require a pull request before merging** and set **Required approvals** to `0`.

Why 0? GitHub accepts only one fixed number of approvals for all pull requests. risk-gate counts the approvals for each PR from its tier, and reports the result through the `risk-gate` status.

To cover all the repositories of an organization, use an organization ruleset and an organization secret.

## What a PR author sees

- A comment that gives the tier, the number of approvals and the reasons. risk-gate updates the same comment on each new commit.
- The `risk-gate` status in the checks list:

| Status | Example description | Meaning |
|---|---|---|
| `pending` | `high: 1/2 approvals` | The PR needs one more approval on its latest commit. |
| `pending` | `high: changes requested by @alice` | A reviewer who counts requested changes. |
| `success` | `high: 2/2 approvals` | The PR can merge. |
| `error` | `Invalid risk-gate config. See the job log.` | The config file is not valid. |

## Roll back

Set `mode: shadow` again, or remove `risk-gate` from the required status checks of the ruleset.

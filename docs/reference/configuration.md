# Configuration

The config file is `.github/risk-gate.yml` (change the path with the [`config-path`](action.md#inputs) input). risk-gate reads it from the base branch of each PR.

The JSON Schema is at [`schema/risk-gate.schema.json`](https://github.com/tadeodonegana/risk-gate/blob/main/schema/risk-gate.schema.json). risk-gate rejects unknown keys, so a typo stops the run instead of being ignored.

## Top level

| Key | Type | Default | Description |
|---|---|---|---|
| `mode` | `enforce` or `shadow` | `enforce` | `shadow`: write the comment, but the status is always `success`. |
| `tiers` | list | required | 2 to 10 tiers, lowest risk first. |
| `rules` | list | `[]` | Deterministic rules that set a minimum tier. |
| `require_human_for_agent_prs` | boolean | `false` | `true`: a PR from a bot account needs at least 1 human approval. |
| `decider` | object | see below | Settings for the Jev call. |

## `tiers[]`

| Key | Type | Description |
|---|---|---|
| `name` | string | Letters, digits, `-` and `_`. Must be unique. Rules and `on_error` refer to it. |
| `description` | string | When this tier applies. Jev reads this text, so write it in English. |
| `approvals` | integer, 0 to 10 | Human approvals that a PR of this tier needs. |

## `rules[]`

| Key | Type | Description |
|---|---|---|
| `name` | string, optional | A label for the PR comment. Default: `rules[N]`. |
| `paths` | list of globs, optional | Matches when one changed file (or its old name) matches one glob. |
| `min_changed_lines` | integer, optional | Matches when additions plus deletions reach this value. |
| `authors` | list of logins, optional | Matches when the PR author is in the list. Case does not matter; a leading `@` is allowed. |
| `min_tier` | tier name, required | The lowest tier that a matched PR can get. |

A rule needs at least one of `paths`, `min_changed_lines` and `authors`. When it has more than one, all of them must match.

## `decider`

| Key | Type | Default | Description |
|---|---|---|---|
| `model` | string | `typesafe/jev-1.14` | The Jev model. Pin a version: a new version can move the tiers. |
| `on_error` | tier name | the highest tier | The tier to use when Jev fails. |
| `max_state_bytes` | integer, 2,000 to 200,000 | `30000` | Size limit of the input that Jev reads. Above about 32 KB, Jev runs in a long-context mode that is slower and less accurate. If the file list alone is larger than the limit, the run uses `on_error`. |

## Full example

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/tadeodonegana/risk-gate/v1/schema/risk-gate.schema.json
mode: enforce

tiers:
  - name: low
    description: Docs, tests, comments or copy. No change to runtime behavior.
    approvals: 0
  - name: medium
    description: A normal feature or bug fix inside one module.
    approvals: 1
  - name: high
    description: Shared code, a public API, the data model or payments.
    approvals: 2
  - name: critical
    description: Authentication, permissions, secrets, infrastructure or database migrations.
    approvals: 2

rules:
  - name: migrations and infra
    paths: ["**/migrations/**", "infra/**", "**/*.tf"]
    min_tier: high
  - name: auth code
    paths: ["**/auth/**"]
    min_tier: critical
  - name: large change
    min_changed_lines: 800
    min_tier: high

require_human_for_agent_prs: true

decider:
  model: typesafe/jev-1.14
  on_error: critical
  max_state_bytes: 30000
```

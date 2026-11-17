# Configure

risk-gate reads its config from `.github/risk-gate.yml` on the **base branch** of each pull request. A PR therefore cannot change the rules that apply to it.

## A complete example

```yaml title=".github/risk-gate.yml"
# yaml-language-server: $schema=https://raw.githubusercontent.com/tadeodonegana/risk-gate/v1/schema/risk-gate.schema.json

mode: shadow # start here; change to "enforce" after you tune the tiers

tiers: # lowest risk first, 2 to 10 tiers
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

rules: # each rule sets the lowest tier that a matched PR can get
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
```

The first line gives you autocomplete and validation in editors that support the YAML language server.

## Tiers

Write the tiers from the lowest risk to the highest risk. Each tier has:

- a `name` that you use in rules and that people see in the PR comment,
- a `description`. **Jev reads this text** to decide the tier, so describe the kind of change, and write it in English (Jev is most accurate in English),
- the number of human `approvals` that a PR of this tier needs.

## Rules

Each rule sets a minimum tier (`min_tier`) for the PRs that it matches. A rule can check:

- `paths`: globs. The rule matches when one changed file matches one glob.
- `min_changed_lines`: the rule matches when additions plus deletions reach this number.
- `authors`: the rule matches when the PR author is in the list.

When a rule has more than one of these parts, **all of them must match**. If several rules match, the highest `min_tier` wins. See [How the tier is decided](../concepts/tiers.md#rules) for more examples.

## Agent pull requests

`require_human_for_agent_prs: true` makes a PR from a bot account (for example a coding agent such as `claude[bot]` or Copilot) need at least one human approval. With `false`, or without the key, risk-gate does not check this. See [Agent PRs](../concepts/approvals.md#agent-prs).

## Decider

`decider.model`
:   The Jev model on OpenRouter. Pin a version: a new model version can move the tiers.

`decider.on_error`
:   The tier to use when Jev fails. The default is the highest tier.

`decider.max_state_bytes`
:   The size limit of the input that Jev reads. The default is 30,000 bytes.

## When the config is not valid

risk-gate validates the file each time it runs. A YAML error, an unknown key, an unknown tier name or a rule without `min_tier` stops the run. The `risk-gate` status changes to `error`, and the job log shows the problem. This is intentional: a broken config must not let PRs merge.

The full list of keys is in the [configuration reference](../reference/configuration.md).

Next: [Enforce](enforce.md).

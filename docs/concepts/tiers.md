# How the tier is decided

Two sources decide the tier of a pull request: your **rules** and **Jev**. The higher of the two wins.

```text
final tier = max(rule tier, Jev tier)
required approvals = approvals of the final tier
```

## Tiers

You define 2 to 10 tiers, from the lowest risk to the highest. Their order is important: "higher" always means "later in the list". Each tier has a name, a description that Jev reads, and a number of approvals.

## Rules

A rule sets the lowest tier that a matched PR can get. Rules are deterministic: the same PR always gives the same result.

```yaml
rules:
  - name: migrations
    paths: ["**/migrations/**"]
    min_tier: high
  - name: large change
    min_changed_lines: 800
    min_tier: high
  - name: interns on infrastructure
    paths: ["infra/**"]
    authors: ["intern-1", "intern-2"]
    min_tier: critical
```

How rules match:

- `paths` matches when **one** changed file matches **one** glob. A renamed file also matches by its old name. Globs match dotfiles too.
- `min_changed_lines` matches when the additions plus the deletions of all the files reach the number.
- `authors` matches when the PR author is in the list. The comparison ignores case and a leading `@`.
- When a rule has more than one part, **all parts must match**. In the example above, the third rule matches only when an intern changes a file in `infra/`.
- If several rules match, the highest `min_tier` wins. If no rule matches, the floor is the lowest tier.

!!! info "Built-in rule"
    A PR that changes `.github/workflows/**` or the risk-gate config file always gets the **highest tier**. These files control your CI and the gate itself. You cannot turn this rule off.

## Jev

[Jev](https://typesafe.ai) is a decision model from TypeSafe. It is not a chat model: it does not write text. It reads an input and answers typed questions with probabilities. risk-gate calls it through OpenRouter.

### What Jev reads

- The list of changed files, with their status and line counts.
- The diffs, up to `decider.max_state_bytes` (30,000 bytes by default). The diffs of files that matched a path rule come first, then the smaller changes. If the diffs do not fit, risk-gate cuts some and tells Jev how many it did not send.

Jev does **not** read the PR title, the PR body or the author. The change sets the tier, not the person or the text that describes it.

### What Jev answers

risk-gate asks one question of the type `Score`: "Rate the risk of merging this code change into production." The levels of the score are your tier descriptions, in order. Jev returns a probability for each tier, and risk-gate takes the **most probable tier**. In a tie, it takes the higher tier.

For example, with `low 0.15 · medium 0.50 · high 0.25 · critical 0.10`, the Jev tier is `medium`.

### Jev can only raise the tier

The final tier is the higher of the rule tier and the Jev tier. So Jev can find risk that your rules do not cover, but it cannot lower a tier that a rule set. This also limits prompt injection: text in a diff that asks for a low tier cannot go below your rules.

### Cost

Jev 1.14 on OpenRouter costs US$0.042 per million input tokens, and output tokens are free. A PR with a 30 KB diff uses about 8,000 tokens: about US$0.0003 per commit. Reviews reuse the decision and cost nothing.

## When Jev fails

If risk-gate has no API key, or the API returns an error, a refusal or an answer without the score, risk-gate **fails closed**: it uses the `decider.on_error` tier (the highest tier by default). The comment shows the error, and the job log shows a warning.

## Example

A coding agent opens a PR that changes `src/auth/session.ts` and `README.md`. The config is the [example config](../get-started/configure.md#a-complete-example).

| Step | Result |
|---|---|
| Rules | `auth code` matches `src/auth/session.ts`: floor `critical` |
| Jev | low 0.15 · medium 0.50 · high 0.25 · critical 0.10: `medium` |
| Final tier | max(`critical`, `medium`) = `critical` |
| Approvals | `critical` needs 2 |

Try other cases in the [simulator](../simulator.md).

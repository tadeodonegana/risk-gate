# Action inputs and outputs

## Usage

```yaml
- uses: tadeodonegana/risk-gate@v1
  with:
    api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

The action runs on the `node24` runtime. It needs the permissions `contents: read`, `pull-requests: write` and `statuses: write`, and it must run on `pull_request_target` and `pull_request_review` events. See [Install](../get-started/install.md#2-add-the-workflow) for the full workflow.

## Inputs

| Input | Default | Description |
|---|---|---|
| `api-key` | none | OpenRouter API key. Without it, every PR gets the `decider.on_error` tier. |
| `api-url` | `https://openrouter.ai/api/v1` | Base URL of the System One API. |
| `config-path` | `.github/risk-gate.yml` | Path of the config file, read from the base branch. |
| `github-token` | `${{ github.token }}` | Token for the GitHub API. Keep the default: the decision cache trusts only comments by `github-actions[bot]`. |

### Use a TypeSafe key directly

If you have a TypeSafe account, you can call Jev without OpenRouter:

```yaml
- uses: tadeodonegana/risk-gate@v1
  with:
    api-key: ${{ secrets.TYPESAFE_API_KEY }}
    api-url: https://api.typesafe.ai/v1
```

Then set `decider.model` to a TypeSafe model name, for example `jev-latest`.

## Outputs

| Output | Description |
|---|---|
| `tier` | The risk tier of the PR. |
| `required-approvals` | The number of human approvals that the PR needs. |
| `approvals` | The number of valid human approvals on the head commit. |
| `state` | The `risk-gate` status: `success` or `pending`. |
| `cached` | `true` when the decision came from the PR comment and Jev was not called. |

## Commit status

| Field | Value |
|---|---|
| Context | `risk-gate` |
| State | `success`, `pending` or `error` |
| Description | `<tier>: <approvals>/<required> approvals`, plus the reason when something blocks. Starts with `shadow ·` in shadow mode. |
| Link | The decision comment, or the workflow run when there is no comment. |

## Versions

- `@v1` follows the latest `v1.x` release.
- `@v1.0.0` is a fixed, immutable release.
- `@<commit-sha>` is the safest choice. Keep the version in a comment: `@<commit-sha> # v1.0.0`.

A new major version (`v2`) means a breaking change, for example in the config format. `v1` stays on the last `v1.x` release.

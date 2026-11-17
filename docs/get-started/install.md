# Install

You need three things in the repository that you want to protect: an API key secret, a workflow file and a config file. This page covers the first two. [Configure](configure.md) covers the config file.

## Requirements

- A GitHub repository where you can add secrets, workflows and rulesets.
- An [OpenRouter](https://openrouter.ai) account. risk-gate calls the Jev model through OpenRouter.
- GitHub-hosted runners, or self-hosted runners that support the `node24` runtime.

## 1. Add the API key

Create an API key in OpenRouter. Then add it as a secret named `OPENROUTER_API_KEY`:

=== "GitHub CLI"

    ```sh
    gh secret set OPENROUTER_API_KEY --repo <owner>/<repo>
    ```

=== "Web UI"

    **Settings** → **Secrets and variables** → **Actions** → **New repository secret**.

To use one key in all the repositories of an organization, add it as an organization secret.

!!! note "Without a key"
    If the key is missing, risk-gate does not fail open. Every PR gets the `decider.on_error` tier, which is the highest tier by default.

## 2. Add the workflow

Create `.github/workflows/risk-gate.yml`:

```yaml title=".github/workflows/risk-gate.yml"
name: risk-gate

on:
  # pull_request_target also gives the API key to fork PRs.
  # risk-gate never checks out or runs PR code: it reads the diff via the API.
  pull_request_target:
    types: [opened, synchronize, reopened, ready_for_review]
  pull_request_review:
    types: [submitted, dismissed]

permissions:
  contents: read
  pull-requests: write
  statuses: write

concurrency:
  group: risk-gate-${{ github.event.pull_request.number }}
  cancel-in-progress: false

jobs:
  risk-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: tadeodonegana/risk-gate@v1
        with:
          api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

What each part does:

`pull_request_target`
:   Runs when a PR opens or gets a new commit. risk-gate decides the tier and writes the PR comment.

`pull_request_review`
:   Runs when someone submits or dismisses a review. risk-gate reuses the decision and only counts the approvals again.

`permissions`
:   `contents: read` reads the config file. `pull-requests: write` writes the PR comment. `statuses: write` sets the `risk-gate` status.

`concurrency`
:   Runs one job at a time per PR, so two events cannot write the comment at the same time.

!!! warning "Put the workflow on the default branch first"
    `pull_request_target` uses the workflow file from the base branch, not from the PR. Merge the workflow and the config file into your default branch before you test with a pull request.

!!! tip "Pin the version"
    `@v1` follows the latest `v1.x` release. For the strongest supply-chain protection, pin the full commit SHA of a release and keep the version in a comment: `uses: tadeodonegana/risk-gate@<commit-sha> # v1.0.0`.

If your organization allows only selected actions, an admin must add `tadeodonegana/risk-gate@*` to the allow list.

Next: [Configure](configure.md).

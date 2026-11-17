# Development

## Repository layout

| Path | Contents |
|---|---|
| `action.yml` | The action definition: inputs, outputs and the `node24` runtime. |
| `src/core/` | Pure logic: rules, the Jev input, the decision, the approvals and the comment. No network calls. |
| `src/jev.ts` | The client for the System One API. |
| `src/github.ts` | The only file that calls the GitHub API. |
| `src/run.ts` | One run: config, cache, rules, Jev, comment, approvals and status. |
| `src/main.ts` | The entry point. |
| `dist/index.js` | The bundle that GitHub runs. It is committed. |
| `schema/` | The JSON Schema, generated from `src/config.ts`. |
| `examples/` | The example config and workflow. |
| `docs/`, `zensical.toml` | This website. |

## Build and test

```sh
npm install
npm run typecheck
npm test
npm run schema   # regenerate schema/risk-gate.schema.json from src/config.ts
npm run build    # bundle src/ to dist/index.js
npm run all      # all of the above
```

Commit `dist/` and `schema/` with your change. The CI workflow fails if they are not up to date.

## Docs

The site uses [Zensical](https://zensical.org). You need [uv](https://docs.astral.sh/uv/).

```sh
npm run docs        # live preview on http://localhost:8000
npm run docs:build  # build to site/
```

The site is hosted on [Read the Docs](https://readthedocs.org). `.readthedocs.yaml` tells it how to build the site with Zensical. Read the Docs builds one copy of the docs for each version: `latest` follows `main`, `stable` follows the newest release tag, and each release tag gets its own copy. It also builds a preview for each pull request.

One-time setup, after the repository is public:

1. Sign in to Read the Docs with your GitHub account.
2. Import the `risk-gate` repository.
3. In the project settings, activate the versions to publish, and turn on **Build pull requests for this project**.

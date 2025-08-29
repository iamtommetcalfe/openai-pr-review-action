# OpenAI PR Review Action

🤖 GitHub Action that posts AI-powered code review comments on pull requests using OpenAI.  
Feedback is categorised for clarity:

- 🔴 Must fix
- 🟡 Should improve
- 🔵 Nice to have
- 🧾 Standards (DRY, SIMPLE, SOLID)

## Usage

1. Create a workflow in your repo:

```yaml
# .github/workflows/ai-pr-review.yml
name: OpenAI PR review

on:
    pull_request:
      types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
    review:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/checkout@v4
              with:
                fetch-depth: 0
            - name: AI review
              uses: iamtommetcalfe/openai-pr-review-action@v1
              env:
                GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
              with:
                openai_api_key: ${{ secrets.OPENAI_API_KEY }}
                model: gpt-4.1-mini
                max_chars: 120000
```

2. Add your `OPENAI_API_KEY` secret under repo **Settings → Secrets and variables → Actions**.

---

### Notes
- The action posts **one summary comment** per PR.
- Diff content is truncated at `max_chars` (default 120k).
- Minimal GitHub permissions are used (`contents: read`, `pull-requests: write`).
- Logs are kept clean — diff content is not printed.

## Inputs
- `openai_api_key` — OpenAI API key. If not provided, the action falls back to `OPENAI_API_KEY` environment variable. Required when `dry_run` is `false`.
- `model` — default `gpt-4.1-mini`. Allowed: `gpt-4.1-mini`, `gpt-4.1`, `gpt-4o-mini`, `gpt-4o`.
- `max_chars` — default `120000`. Bounded to `[10000, 300000]` to prevent extreme payloads.
- `category_style` — default `default`. Allowed: `default`, `strict`.
- `include_globs` — optional, comma-separated glob patterns to include (e.g., `**/*.js,**/*.ts`).
- `exclude_globs` — optional, comma-separated glob patterns to exclude; takes precedence over `include_globs`.
- `posting_mode` — where to post the result. One of: `comment` (default), `review`, `pr_description`.
- `dry_run` — default `false`. If true, the action will not call OpenAI or post; it will expose a `review_body` output for preview.
- `pr_number` — optional; use for manual runs via `workflow_dispatch`.

## Test the action without side effects (dry run)

- From GitHub CLI after committing the workflow:
  - Trigger: `gh workflow run "AI PR Review (Dry Run)" -f pr_number=123`
  - Then view logs: `gh run watch --exit-status && gh run view --log`
  - The job prints a preview of `steps.review.outputs.review_body`.

- Locally with act (example):
  - Create a file `.act-dryrun.json`:
    ```json
    { "inputs": { "pr_number": "123", "model": "gpt-4.1-mini", "max_chars": "120000", "category_style": "default" } }
    ```
  - Run: `act workflow_dispatch -W .github/workflows/action-dry-run.yml -e .act-dryrun.json`

Notes:
- The dry-run flow requires only `GITHUB_TOKEN`; `openai_api_key` is not needed.
- For normal PR reviews (non-dry), provide `OPENAI_API_KEY` as shown above.

## Node.js support

This action targets Node.js 20.
- GitHub Actions runtime: node20 (see action.yml)
- package.json engines: ^20.0.0

If you use a self-hosted runner, ensure Node 20 is available on the runner.

## Build & distribution (for contributors)

This Action is bundled with @vercel/ncc and the built files are committed to dist/ (action.yml points to dist/index.js).

Commands:
- npm run build — builds without source maps (default, what CI verifies)
- npm run build:debug — builds with inline source maps and register hook for local debugging

Consistency:
- A CI workflow verifies that rebuilding produces no changes under dist/.
- Publishing/tagging runs a build via npm preversion and prepublishOnly to ensure dist is current.

Notes on source maps:
- Default builds exclude source maps to avoid bundling extra files and to keep diffs stable.
- Use build:debug locally if you need stack traces mapped to sources.

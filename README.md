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
- `openai_api_key` (required unless `dry_run: true`)
- `model` (default `gpt-4.1-mini`)
- `max_chars` (default `120000`)
- `category_style` (default `default`)
- `dry_run` (default `false`) — if true, the action will not call OpenAI or post a comment; it will expose a `review_body` output for preview.
- `pr_number` (optional) — use for manual runs via `workflow_dispatch`.

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

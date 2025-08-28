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
name: AI PR review

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
              uses: your-org/ai-pr-review-action@v1
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
- `openai_api_key` (required)
- `model` (default `gpt-4.1-mini`)
- `max_chars` (default `120000`)
- `category_style` (default `default`)
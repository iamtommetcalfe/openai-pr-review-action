# Contributing to OpenAI PR Reviewer Action

Thank you for your interest in contributing! This document explains how to get set up for local development, how to test, and how to cut a release.

## Prerequisites
- Node.js 20.x (the Action runs on Node 20). Install via nvm or your package manager.
- npm 9+.

## Getting Started
1. Install dependencies:
   ```bash
   npm ci
   ```
2. Build the action bundle (using @vercel/ncc):
   ```bash
   npm run build
   ```
   This generates the runnable code under `dist/` used by `action.yml`.

## Running Locally
This action is designed to run in GitHub Actions. For local iteration you can:
- Invoke the main script with environment variables that mimic the runner, or
- Use a small workflow in a test repository.

Key environment/inputs:
- `OPENAI_API_KEY` (or `inputs.openai_api_key` when running in Actions)
- Optional inputs: `model`, `max_chars`, `category_style`

## Testing
- Unit tests use Vitest. Run:
  ```bash
  npm test
  ```
- The repository includes a CI workflow to run tests on push/PR.

## Dry-run the Action (no OpenAI calls, no comments)
Use the provided workflow to preview the generated review body safely:

- Trigger via GitHub CLI (after pushing the workflow):
  ```bash
  gh workflow run "AI PR Review (Dry Run)" -f pr_number=123
  gh run watch --exit-status && gh run view --log
  ```
  The job prints a truncated preview of `steps.review.outputs.review_body`.

- Trigger locally with act:
  1. Create `.act-dryrun.json`:
     ```json
     { "inputs": { "pr_number": "123", "model": "gpt-4.1-mini", "max_chars": "120000", "category_style": "default" } }
     ```
  2. Execute:
     ```bash
     act workflow_dispatch -W .github/workflows/action-dry-run.yml -e .act-dryrun.json
     ```

Notes:
- Dry run requires only `GITHUB_TOKEN`.
- For normal runs (non-dry), provide `OPENAI_API_KEY`.

## Coding Guidelines
- Node 20 features are allowed; keep compatibility with the specified engines in `package.json`.
- Avoid logging sensitive data. Do not print full patches or API keys.
- Prefer small modules and clear functions.

## Build Artifacts
Always run `npm run build` before committing changes that affect runtime code. The CI and release process expect `dist/` to be up to date.

## Releasing
1. Update `CHANGELOG.md`.
2. Bump `version` in `package.json` following SemVer (patch for docs/metadata only; minor for features; major for breaking changes).
3. Run `npm run build` to update `dist/`.
4. Commit changes including `dist/` and tag the release (e.g., `v1.0.1`).
5. Push the tag to GitHub. If using a release workflow, let it perform validation.

## Security
See `SECURITY.md` for reporting vulnerabilities.

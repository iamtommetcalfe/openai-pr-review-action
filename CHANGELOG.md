# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project adheres to Semantic Versioning.

## [Unreleased]
### Added

## [1.0.2] - 2025-08-29
### Added
- GitHub Actions CI workflow to run tests (Node 20) on push and pull requests.
- Dry-run mode (`dry_run` input) and `review_body` output to preview the review without calling OpenAI or posting.
- `pr_number` input to target PRs during manual runs (workflow_dispatch).
- New workflow: "AI PR Review (Dry Run)" to test via GitHub CLI or locally with `act`.

## [1.0.1] - 2025-08-29
### Added
- CONTRIBUTING.md with development, build, and release guidelines.
- SECURITY.md with a responsible disclosure process.
- Issue and PR templates under `.github/` to standardize contributions.
- Initial testing scaffolding: added Vitest, an `npm test` script, and a unit test for diffChunker.

### Changed
- Pinned Node.js runtime via `engines` in `package.json` to Node 20 to match `action.yml`.
- Bumped package version from 1.0.0 to 1.0.1 (docs/metadata + testing scaffolding).

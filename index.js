// Node 20 ESM
import * as core from "@actions/core";
import * as github from "@actions/github";
import OpenAI from "openai";

const ALLOWED_MODELS = ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"];
const ALLOWED_CATEGORY_STYLES = ["default", "strict"];
const ALLOWED_POSTING_MODES = ["comment", "review", "pr_description"];
const MAX_CHARS_DEFAULT = 120_000;
const MAX_CHARS_MIN = 10_000;
const MAX_CHARS_MAX = 300_000;

/** ---------- Standards blocks (short, token-friendly) ---------- */
const GLOBAL_STANDARDS = `
📐 Global engineering standards:
- Principles: DRY, KISS, YAGNI, SOLID where OO applies, single responsibility per module.
- Readability: small functions, clear names, early returns, shallow nesting, document the "why".
- Errors: fail fast, no swallowed errors, preserve stack and context, clear messages.
- Tests: cover critical paths and edges, deterministic, fast.
- Security: never log secrets, validate and sanitise inputs, least privilege for tokens, avoid eval.
- Performance: avoid N+1s, unnecessary allocations, sync I/O on hot paths; stream or chunk large data.
- Observability: structured logs and useful errors, minimal noise, correlation IDs if present.
- Accessibility: label controls, keyboard navigation, colour contrast when UI is touched.
- Git hygiene: small focused PRs, clear commit messages.
`.trim();

const JS_TS_STANDARDS = `
JS/TS:
- Prefer TypeScript types over JSDoc, strict null checks, avoid \`any\` unless justified.
- Side-effect free modules, pure functions where feasible.
- Validate inputs at boundaries, do not trust \`unknown\`.
- Use async/await, no unhandled promises, wrap external I/O in try/catch.
- Follow project tsconfig and ESLint rules.
`.trim();

const VUE_STANDARDS = `
Vue 3:
- Composition API preferred, small composables.
- Typed, validated props, no prop mutation, typed emits.
- Keep templates simple: computed > methods > watchers, no heavy logic in templates.
`.trim();

const LARAVEL_STANDARDS = `
PHP/Laravel:
- PSR-12, strict types where possible.
- Thin controllers; Services or Actions for business logic; Repositories for data access.
- Eloquent: avoid N+1, eager load, no heavy work in model events.
- Validate with Form Requests; Policies/Gates for auth.
- Migrations reversible and safe.
`.trim();

const API_SECURITY_STANDARDS = `
API/security:
- OWASP awareness: validate input, encode output, CSRF where relevant.
- Explicit AuthN/AuthZ, no secrets in repo or logs, rotate keys, short-lived tokens.
- Pagination and rate limiting for lists, no unbounded responses.
- Consistent error shapes, do not leak internals.
`.trim();

/** Pick add-ons based on changed file names */
function detectLanguageAddons(files) {
    const names = files.map(f => f.filename || "");
    const has = (re) => names.some(n => re.test(n));

    const wantsJS = has(/\.(ts|tsx|js|jsx|mts|cts)$/i) || has(/package\.json$/i);
    const wantsVue = has(/\.vue$/i);
    const wantsLaravel = has(/\.(php)$/i) || has(/^app\/|^database\/migrations\/|^routes\//i);
    // Show API/security whenever backend or HTTP assets appear, otherwise always include as a light guard
    const wantsApiSec = wantsLaravel || wantsJS || has(/(api|routes|controllers?|middleware)/i);

    let out = [];
    if (wantsJS) out.push(JS_TS_STANDARDS);
    if (wantsVue) out.push(VUE_STANDARDS);
    if (wantsLaravel) out.push(LARAVEL_STANDARDS);
    if (wantsApiSec) out.push(API_SECURITY_STANDARDS);

    return out.join("\n\n");
}

/** Build the system prompt with categories and standards */
function buildSystemPrompt(style = "default", addons = "") {
    const categories = `
You are a senior reviewer. Provide feedback on a pull request.

Output format with emojis:
- 📋 Summary: one short paragraph
- 🔴 Must fix (blocking)
- 🟡 Should improve (important, not blocking)
- 🔵 Nice to have (advice, style, tests, performance)
- 🧾 Standards: note where the code meets or violates the standards below

Rules:
- Be concise and actionable.
- Use bullet points for the content of each category but not for the category title.
- If no items in a category, write "None".
- Include code blocks only when they clarify a fix.
`.trim();

    const standards = [GLOBAL_STANDARDS, addons].filter(Boolean).join("\n\n");
    return `${categories}\n\n${standards}`;
}

/** ---------- Existing helpers ---------- */
function chunkFiles(files, maxChars) {
    let used = 0;
    const out = [];
    for (const f of files) {
        if (!f.patch) continue;
        const chunk = `\n---\nFile: ${f.filename}\n${f.patch}`;
        if (used + chunk.length > maxChars) break;
        out.push(chunk);
        used += chunk.length;
    }
    return out.join("\n");
}

function splitPatterns(input) {
    if (!input) return [];
    return String(input).split(",").map(s => s.trim()).filter(Boolean);
}

function globToRegExp(glob) {
    let re = glob
        .replace(/[.+^${}()|\[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "__DOUBLE_STAR__")
        .replace(/\*/g, "[^/]*")
        .replace(/__DOUBLE_STAR__/g, ".*");
    return new RegExp(`^${re}$`);
}

function anyMatch(patterns, text) {
    if (!patterns.length) return false;
    return patterns.some(p => globToRegExp(p).test(text));
}

function filterFilesByGlobs(files, includeGlobs, excludeGlobs) {
    const include = splitPatterns(includeGlobs);
    const exclude = splitPatterns(excludeGlobs);
    return files.filter(f => {
        const name = f.filename || "";
        if (exclude.length && anyMatch(exclude, name)) return false;
        if (include.length) return anyMatch(include, name);
        return true;
    });
}

function normalizeMaxChars(raw) {
    const n = parseInt(raw ?? `${MAX_CHARS_DEFAULT}`, 10);
    if (!Number.isFinite(n) || n <= 0) return MAX_CHARS_DEFAULT;
    if (n < MAX_CHARS_MIN) {
        core.info(`max_chars (${n}) below minimum ${MAX_CHARS_MIN}; using minimum.`);
        return MAX_CHARS_MIN;
    }
    if (n > MAX_CHARS_MAX) {
        core.info(`max_chars (${n}) above maximum ${MAX_CHARS_MAX}; using maximum.`);
        return MAX_CHARS_MAX;
    }
    return n;
}

async function postResult(octokit, { owner, repo, prNumber }, postingMode, body) {
    if (postingMode === "comment") {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
        core.info("Posted AI review as PR comment.");
        return;
    }
    if (postingMode === "review") {
        await octokit.rest.pulls.createReview({ owner, repo, pull_number: prNumber, body, event: "COMMENT" });
        core.info("Posted AI review as PR review.");
        return;
    }
    if (postingMode === "pr_description") {
        const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
        const start = "<!-- ai-pr-review: start -->";
        const end = "<!-- ai-pr-review: end -->";
        const section = `${start}\n\n## 🤖 AI Review\n\n${body}\n\n${end}`;
        let nextBody = pr.body || "";
        if (nextBody.includes(start) && nextBody.includes(end)) {
            nextBody = nextBody.replace(new RegExp(`${start}[\\s\\S]*?${end}`), section);
        } else {
            nextBody = `${nextBody}\n\n${section}`.trim();
        }
        await octokit.rest.pulls.update({ owner, repo, pull_number: prNumber, body: nextBody });
        core.info("Upserted AI review section into PR description.");
        return;
    }
    throw new Error(`Unsupported posting_mode: ${postingMode}`);
}

async function run() {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error("Missing GITHUB_TOKEN");

        const dryRunInput = core.getInput("dry_run") || "false";
        const dryRun = String(dryRunInput).toLowerCase() === "true";

        const openaiKeyInput = core.getInput("openai_api_key", { required: false });
        const openaiKey = openaiKeyInput || process.env.OPENAI_API_KEY || "";

        const model = core.getInput("model") || "gpt-4.1-mini";
        if (!ALLOWED_MODELS.includes(model)) {
            throw new Error(`Invalid model: ${model}. Allowed: ${ALLOWED_MODELS.join(", ")}`);
        }

        const maxChars = normalizeMaxChars(core.getInput("max_chars") || `${MAX_CHARS_DEFAULT}`);

        const categoryStyle = core.getInput("category_style") || "default";
        if (!ALLOWED_CATEGORY_STYLES.includes(categoryStyle)) {
            throw new Error(`Invalid category_style: ${categoryStyle}. Allowed: ${ALLOWED_CATEGORY_STYLES.join(", ")}`);
        }

        const postingMode = (core.getInput("posting_mode") || "comment").toLowerCase();
        if (!ALLOWED_POSTING_MODES.includes(postingMode)) {
            throw new Error(`Invalid posting_mode: ${postingMode}. Allowed: ${ALLOWED_POSTING_MODES.join(", ")}`);
        }

        const includeGlobs = core.getInput("include_globs") || "";
        const excludeGlobs = core.getInput("exclude_globs") || "";

        const context = github.context;
        const { owner, repo } = context.repo;

        let prNumber = context.payload.pull_request?.number;
        if (!prNumber) {
            const prInput = core.getInput("pr_number");
            if (prInput) prNumber = parseInt(prInput, 10);
        }
        if (!prNumber) {
            core.info("No pull_request in context and no pr_number input provided, skipping.");
            return;
        }

        const octokit = github.getOctokit(token);

        // Pull files for this PR
        const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner, repo, pull_number: prNumber, per_page: 100,
        });

        // Filter and build diff
        const filteredFiles = filterFilesByGlobs(files, includeGlobs, excludeGlobs);
        core.info(`Fetched ${files.length} files, ${filteredFiles.length} matched filters for PR #${prNumber}`);

        const patches = chunkFiles(filteredFiles, maxChars);
        if (!patches) {
            const body = "No diff content to review.";
            core.setOutput?.("review_body", body);
            if (!dryRun) {
                await postResult(octokit, { owner, repo, prNumber }, postingMode, body);
                core.info("Posted 'no diff' result.");
            } else {
                core.info("DRY RUN: would post 'no diff' result");
            }
            return;
        }

        // Build standards based on changed files
        const addons = detectLanguageAddons(filteredFiles);
        const system = buildSystemPrompt(categoryStyle, addons);
        const user = `Repository: ${owner}/${repo}
PR #${prNumber}
Changed files and patches:
${patches}
`;

        let content = "No issues found.";

        if (!dryRun) {
            if (!openaiKey) {
                throw new Error("Missing OpenAI API key: provide 'openai_api_key' input or set OPENAI_API_KEY env var");
            }
            const openai = new OpenAI({ apiKey: openaiKey });
            try {
                const resp = await openai.chat.completions.create({
                    model,
                    temperature: 0.2,
                    messages: [
                        { role: "system", content: system },
                        { role: "user", content: user },
                    ],
                });
                content = resp.choices?.[0]?.message?.content?.trim() || content;
            } catch (aiErr) {
                core.warning(`OpenAI call failed: ${aiErr?.message || aiErr}`);
                content = "The AI review failed to run. Please check action logs.";
            }

            await postResult(octokit, { owner, repo, prNumber }, postingMode, content);
        } else {
            const previewHeader = `DRY RUN: Preview review for ${owner}/${repo} PR #${prNumber}`;
            const truncated = patches.slice(0, 2000);
            content = `${previewHeader}\n\nSystem prompt style: ${categoryStyle}\nModel: ${model}\nPosting mode: ${postingMode}\n\nStandards included:\n${addons || "(none beyond global)"}\n\nIncluded patches (truncated preview):\n${truncated}`;
            core.info("DRY RUN: generated preview content (not posted). Use outputs.review_body to view.");
        }

        core.setOutput?.("review_body", content);
    } catch (err) {
        core.setFailed(err instanceof Error ? err.message : String(err));
    }
}

run();
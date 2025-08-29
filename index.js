// Node 20 ESM
import * as core from "@actions/core";
import * as github from "@actions/github";
import OpenAI from "openai";

const ALLOWED_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
];
const ALLOWED_CATEGORY_STYLES = ["default", "strict"];
const ALLOWED_POSTING_MODES = ["comment", "review", "pr_description"];
const MAX_CHARS_DEFAULT = 120_000;
const MAX_CHARS_MIN = 10_000;
const MAX_CHARS_MAX = 300_000;

function buildSystemPrompt(style = "default") {
  // Future: vary by style
  return `
You are a senior reviewer. Provide feedback on a pull request.

Output format with emojis:
- 📋 Summary: one short paragraph
- 🔴 Must fix (blocking)
- 🟡 Should improve (important, not blocking)
- 🔵 Nice to have (advice, style, tests, performance)
- 🧾 Standards: note DRY, SIMPLE, SOLID adherence or violations

Rules:
- Be concise and actionable.
- Use bullet points for the content of each category but not for the category title.
- If no items in a category, write "None".
- Include code blocks only when they clarify a fix.
`;
}

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
  return String(input)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function globToRegExp(glob) {
  // Escape regex special chars, then replace glob tokens
  let re = glob
    .replace(/[.+^${}()|\[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__") // temp token
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${re}$`);
}

function anyMatch(patterns, text) {
  if (!patterns.length) return false;
  return patterns.some((p) => globToRegExp(p).test(text));
}

function filterFilesByGlobs(files, includeGlobs, excludeGlobs) {
  const include = splitPatterns(includeGlobs);
  const exclude = splitPatterns(excludeGlobs);
  return files.filter((f) => {
    const name = f.filename || "";
    if (exclude.length && anyMatch(exclude, name)) return false;
    if (include.length) return anyMatch(include, name);
    return true; // no include means include all (minus excludes)
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

    // Inputs and validation
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

    // Determine PR number from event or input
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

    // Pull files
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });

    // Filter files by include/exclude
    const filteredFiles = filterFilesByGlobs(files, includeGlobs, excludeGlobs);

    // Avoid leaking secrets in logs
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

    const system = buildSystemPrompt(categoryStyle);
    const user = `Repository: ${owner}/${repo}\nPR #${prNumber}\nChanged files and patches:\n${patches}\n`;

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

      // Post based on selected mode
      await postResult(octokit, { owner, repo, prNumber }, postingMode, content);
    } else {
      // Dry run preview content (no external calls)
      const previewHeader = `DRY RUN: Preview review for ${owner}/${repo} PR #${prNumber}`;
      const truncated = patches.slice(0, 2000);
      content = `${previewHeader}\n\nSystem prompt style: ${categoryStyle}\nModel: ${model}\nPosting mode: ${postingMode}\n\nIncluded patches (truncated preview):\n${truncated}`;
      core.info("DRY RUN: generated preview content (not posted). Use outputs.review_body to view.");
    }

    core.setOutput?.("review_body", content);
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
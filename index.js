// Node 20 ESM
import * as core from "@actions/core";
import * as github from "@actions/github";
import OpenAI from "openai";

function buildSystemPrompt(style = "default") {
    // Add styles if you want variants later
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
- Use bullet points per category.
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

async function run() {
    try {
        const token = process.env.GITHUB_TOKEN;
        if (!token) throw new Error("Missing GITHUB_TOKEN");

        const dryRunInput = core.getInput("dry_run") || "false";
        const dryRun = String(dryRunInput).toLowerCase() === "true";

        const openaiKey = core.getInput("openai_api_key", { required: false });
        const model = core.getInput("model") || "gpt-4.1-mini";
        const maxChars = parseInt(core.getInput("max_chars") || "120000", 10);
        const categoryStyle = core.getInput("category_style") || "default";

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
            owner, repo, pull_number: prNumber, per_page: 100,
        });

        // Avoid leaking secrets in logs
        core.info(`Fetched ${files.length} changed files for PR #${prNumber}`);

        const patches = chunkFiles(files, maxChars);
        if (!patches) {
            const body = "No diff content to review.";
            core.setOutput?.("review_body", body);
            if (!dryRun) {
                await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
                core.info("Posted 'no diff' comment");
            } else {
                core.info("DRY RUN: would post 'no diff' comment");
            }
            return;
        }

        const system = buildSystemPrompt(categoryStyle);
        const user = `Repository: ${owner}/${repo}\nPR #${prNumber}\nChanged files and patches:\n${patches}\n`;

        let content = "No issues found.";

        if (!dryRun) {
            if (!openaiKey) {
                throw new Error("Missing openai_api_key (required when dry_run is false)");
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

            // Post a single summary comment
            await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body: content });
            core.info("Posted AI review comment.");
        } else {
            // Dry run preview content (no external calls)
            const previewHeader = `DRY RUN: Preview review for ${owner}/${repo} PR #${prNumber}`;
            const truncated = patches.slice(0, 2000);
            content = `${previewHeader}\n\nSystem prompt style: ${categoryStyle}\nModel: ${model}\n\nIncluded patches (truncated preview):\n${truncated}`;
            core.info("DRY RUN: generated preview content (not posted). Use outputs.review_body to view.");
        }

        core.setOutput?.("review_body", content);
    } catch (err) {
        core.setFailed(err instanceof Error ? err.message : String(err));
    }
}

run();
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
        const openaiKey = core.getInput("openai_api_key", { required: true });
        const model = core.getInput("model") || "gpt-4.1-mini";
        const maxChars = parseInt(core.getInput("max_chars") || "120000", 10);
        const categoryStyle = core.getInput("category_style") || "default";

        const context = github.context;
        const { owner, repo } = context.repo;
        const pr = context.payload.pull_request;
        if (!pr) {
            core.info("No pull_request in context, skipping.");
            return;
        }
        const prNumber = pr.number;

        const octokit = github.getOctokit(token);

        // Pull files
        const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
            owner, repo, pull_number: prNumber, per_page: 100,
        });

        // Avoid leaking secrets in logs
        core.info(`Fetched ${files.length} changed files for PR #${prNumber}`);

        const patches = chunkFiles(files, maxChars);
        if (!patches) {
            await octokit.rest.issues.createComment({
                owner, repo, issue_number: prNumber,
                body: "No diff content to review.",
            });
            core.info("Posted 'no diff' comment");
            return;
        }

        const system = buildSystemPrompt(categoryStyle);
        const user = `Repository: ${owner}/${repo}
PR #${prNumber}
Changed files and patches:
${patches}
`;

        const openai = new OpenAI({ apiKey: openaiKey });

        // Call OpenAI with conservative settings
        let content = "No issues found.";
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
        await octokit.rest.issues.createComment({
            owner, repo, issue_number: prNumber, body: content,
        });

        core.info("Posted AI review comment.");
    } catch (err) {
        core.setFailed(err instanceof Error ? err.message : String(err));
    }
}

run();
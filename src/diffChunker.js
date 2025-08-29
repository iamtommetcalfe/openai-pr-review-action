// Pure utility for chunking PR file patches by approximate character budget.
// Mirrors the logic used in index.js to keep behavior consistent, but isolated for testing.

/**
 * Build a single concatenated string of file patches up to maxChars budget.
 * - Skips files without a "patch" field.
 * - Appends in order of input until adding the next chunk would exceed maxChars.
 * - Each chunk is prefixed with a marker and the filename for readability.
 *
 * @param {Array<{filename: string, patch?: string}>} files
 * @param {number} maxChars
 * @returns {string} concatenated patches (empty string when nothing added)
 */
export function chunkFiles(files, maxChars) {
  let used = 0;
  const out = [];
  for (const f of files || []) {
    if (!f || !f.patch) continue;
    const chunk = `\n---\nFile: ${f.filename}\n${f.patch}`;
    if (used + chunk.length > maxChars) break;
    out.push(chunk);
    used += chunk.length;
  }
  return out.join("\n");
}

export default chunkFiles;

// Configuration helpers mirroring logic from index.js for isolated testing

export const MAX_CHARS_DEFAULT = 120_000;
export const MAX_CHARS_MIN = 10_000;
export const MAX_CHARS_MAX = 300_000;

export function normalizeMaxChars(raw) {
  const n = parseInt(raw ?? `${MAX_CHARS_DEFAULT}`, 10);
  if (!Number.isFinite(n) || n <= 0) return MAX_CHARS_DEFAULT;
  if (n < MAX_CHARS_MIN) return MAX_CHARS_MIN;
  if (n > MAX_CHARS_MAX) return MAX_CHARS_MAX;
  return n;
}

export const ALLOWED_MODELS = [
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o",
];

export const ALLOWED_CATEGORY_STYLES = ["default", "strict"];
export const ALLOWED_POSTING_MODES = ["comment", "review", "pr_description"];

// File filtering helpers mirroring logic from index.js for isolated testing

export function splitPatterns(input) {
  if (!input) return [];
  return String(input)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function globToRegExp(glob) {
  // Escape regex special chars, then replace glob tokens
  let re = glob
    .replace(/[.+^${}()|\[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "__DOUBLE_STAR__") // temp token
    .replace(/\*/g, "[^/]*")
    .replace(/__DOUBLE_STAR__/g, ".*");
  return new RegExp(`^${re}$`);
}

export function anyMatch(patterns, text) {
  if (!patterns.length) return false;
  return patterns.some((p) => globToRegExp(p).test(text));
}

export function filterFilesByGlobs(files, includeGlobs, excludeGlobs) {
  const include = splitPatterns(includeGlobs);
  const exclude = splitPatterns(excludeGlobs);
  return (files || []).filter((f) => {
    const name = (f && f.filename) || "";
    if (exclude.length && anyMatch(exclude, name)) return false;
    if (include.length) return anyMatch(include, name);
    return true; // no include means include all (minus excludes)
  });
}

export default filterFilesByGlobs;

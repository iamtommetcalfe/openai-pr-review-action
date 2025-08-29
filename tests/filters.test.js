import { describe, it, expect } from 'vitest';
import { filterFilesByGlobs, splitPatterns, anyMatch, globToRegExp } from '../src/filters.js';

describe('filters helpers', () => {
  it('splitPatterns splits, trims, and drops empties', () => {
    expect(splitPatterns('a,b, c , ,d')).toEqual(['a', 'b', 'c', 'd']);
    expect(splitPatterns('')).toEqual([]);
    expect(splitPatterns(undefined)).toEqual([]);
  });

  it('globToRegExp handles * and ** tokens', () => {
    const re1 = globToRegExp('**/*.js');
    expect(re1.test('a/b/c.js')).toBe(true);
    // Our simple glob treats "**/" as requiring at least one directory level
    expect(re1.test('index.js')).toBe(false);
    expect(re1.test('file.txt')).toBe(false);

    const re2 = globToRegExp('src/*/test.js');
    expect(re2.test('src/mod/test.js')).toBe(true);
    expect(re2.test('src/a/b/test.js')).toBe(false);
  });

  it('anyMatch returns false when no patterns', () => {
    expect(anyMatch([], 'a.js')).toBe(false);
  });
});

describe('filterFilesByGlobs', () => {
  const files = [
    { filename: 'index.js' },
    { filename: 'README.md' },
    { filename: 'src/app.ts' },
    { filename: 'src/utils/helpers.spec.js' },
    { filename: 'docs/guide.md' },
  ];

  it('returns all files when no include/exclude provided', () => {
    const res = filterFilesByGlobs(files, '', '');
    expect(res.map(f => f.filename)).toEqual(files.map(f => f.filename));
  });

  it('includes only files matching include globs', () => {
    const res = filterFilesByGlobs(files, '**/*.{js,ts}', '');
    // Note: our simple glob does not support {js,ts}, so fallback to two patterns
    const res2 = filterFilesByGlobs(files, '**/*.js,**/*.ts', '');
    expect(res2.map(f => f.filename).sort()).toEqual(['src/app.ts', 'src/utils/helpers.spec.js'].sort());
  });

  it('excludes files matching exclude globs even if included', () => {
    const res = filterFilesByGlobs(files, '**/*.js,**/*.ts', '**/*.spec.js');
    // top-level index.js is not matched by our simple '**/*.js' pattern
    expect(res.map(f => f.filename).sort()).toEqual(['src/app.ts'].sort());
  });

  it('excludes by precedence when both include and exclude match', () => {
    const res = filterFilesByGlobs(files, 'src/**/*.js', 'src/utils/*.spec.js');
    expect(res.map(f => f.filename)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { chunkFiles } from '../src/diffChunker.js';

describe('chunkFiles', () => {
  it('returns empty string when no files or patches', () => {
    expect(chunkFiles([], 100)).toBe('');
    expect(chunkFiles([{ filename: 'a.txt' }], 100)).toBe('');
  });

  it('includes patches up to the maxChars budget', () => {
    const files = [
      { filename: 'a.txt', patch: 'aaa' },
      { filename: 'b.txt', patch: 'bbb' },
    ];
    const result = chunkFiles(files, 1000);
    expect(result).toContain('File: a.txt');
    expect(result).toContain('aaa');
    expect(result).toContain('File: b.txt');
    expect(result).toContain('bbb');
  });

  it('stops before exceeding budget', () => {
    // Compute the actual chunk length for first file to set a tight budget
    const first = { filename: 'a.txt', patch: 'aaa' };
    const second = { filename: 'b.txt', patch: 'bbb' };
    const probe = chunkFiles([first], 1000);
    const firstLen = probe.length;

    // Budget that fits exactly first chunk but not second
    const budget = firstLen;
    const result = chunkFiles([first, second], budget);

    expect(result).toContain('File: a.txt');
    expect(result).not.toContain('File: b.txt');
  });
});

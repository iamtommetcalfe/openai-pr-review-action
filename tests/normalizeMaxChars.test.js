import { describe, it, expect } from 'vitest';
import { normalizeMaxChars, MAX_CHARS_DEFAULT, MAX_CHARS_MIN, MAX_CHARS_MAX } from '../src/config.js';

describe('normalizeMaxChars', () => {
  it('returns default when input is undefined or empty', () => {
    expect(normalizeMaxChars(undefined)).toBe(MAX_CHARS_DEFAULT);
    expect(normalizeMaxChars('')).toBe(MAX_CHARS_DEFAULT);
  });

  it('clamps below minimum to MIN and uses DEFAULT for non-positive', () => {
    expect(normalizeMaxChars('999')).toBe(MAX_CHARS_MIN);
    expect(normalizeMaxChars('0')).toBe(MAX_CHARS_DEFAULT);
  });

  it('clamps above maximum to MAX', () => {
    expect(normalizeMaxChars(String(MAX_CHARS_MAX + 1))).toBe(MAX_CHARS_MAX);
    expect(normalizeMaxChars('9999999')).toBe(MAX_CHARS_MAX);
  });

  it('passes through valid values within bounds', () => {
    expect(normalizeMaxChars(String(MAX_CHARS_MIN))).toBe(MAX_CHARS_MIN);
    expect(normalizeMaxChars('15000')).toBe(15000);
    expect(normalizeMaxChars(String(MAX_CHARS_MAX - 1))).toBe(MAX_CHARS_MAX - 1);
  });

  it('returns default for non-numeric or negative values', () => {
    expect(normalizeMaxChars('abc')).toBe(MAX_CHARS_DEFAULT);
    expect(normalizeMaxChars('-1')).toBe(MAX_CHARS_DEFAULT);
  });
});

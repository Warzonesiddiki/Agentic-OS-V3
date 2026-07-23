/**
 * strings.test.ts — Tests for string utility functions.
 */
import { describe, it, expect } from 'vitest';
import { truncate } from '../../src/lib/strings.js';

describe('truncate', () => {
  it('returns original string if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns original string if exactly at limit', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates with ellipsis when exceeding limit', () => {
    const result = truncate('hello world', 8);
    expect(result.length).toBeLessThanOrEqual(8);
    expect(result).toContain('…');
  });

  it('handles empty string', () => {
    expect(truncate('', 5)).toBe('');
  });

  it('handles limit of 1', () => {
    const result = truncate('hello', 1);
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it('trims trailing whitespace before ellipsis', () => {
    const result = truncate('hello world test', 10);
    // Should not end with space before ellipsis
    expect(result).not.toMatch(/\s…$/);
  });
});

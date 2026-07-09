import { describe, it, expect } from 'vitest';
import { synthesizeClusterLabel } from '../src/services/memory-cluster.js';

describe('memory-cluster / synthesizeClusterLabel', () => {
  it('uses the longest member text as the label and includes the count', () => {
    const label = synthesizeClusterLabel([
      { id: '1', text: 'short' },
      { id: '2', text: 'a much longer piece of text content for the cluster' },
      { id: '3', text: 'medium length text' },
    ]);
    expect(label).toContain('a much longer piece of text content for the cluster'.slice(0, 42));
    expect(label).toContain('(3)');
  });

  it('truncates long text with an ellipsis', () => {
    const longText = 'x'.repeat(100);
    const label = synthesizeClusterLabel([{ id: '1', text: longText }]);
    expect(label.endsWith('… (1)')).toBe(true);
    // 42 chars + ellipsis
    expect(label.length).toBe(42 + 2 + ' (1)'.length);
  });

  it('falls back to cluster-<id> when no text present', () => {
    const label = synthesizeClusterLabel([{ id: '1' }, { id: '2' }]);
    expect(label.startsWith('cluster-')).toBe(true);
  });

  it('ignores empty/whitespace text but still counts members', () => {
    const label = synthesizeClusterLabel([
      { id: '1', text: '   ' },
      { id: '2', text: 'real content here' },
    ]);
    expect(label).toContain('real content here');
    expect(label).toContain('(2)');
  });

  it('handles a single member', () => {
    expect(synthesizeClusterLabel([{ id: '1', text: 'hello' }])).toContain('hello');
  });
});

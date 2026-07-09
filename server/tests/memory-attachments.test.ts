import { describe, it, expect } from 'vitest';
import {
  highlightCode,
  generateImageThumbnail,
} from '../src/services/memory-attachments.js';

describe('memory-attachments / highlightCode', () => {
  it('escapes HTML special characters', () => {
    const html = highlightCode('const a = 1 < 2 && 3 > 2;');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).not.toContain('< 2');
  });

  it('wraps keywords in a kw span', () => {
    const html = highlightCode('const x = function() { return 1; }');
    expect(html).toContain('<span class="kw">const</span>');
    expect(html).toContain('<span class="kw">function</span>');
    expect(html).toContain('<span class="kw">return</span>');
  });

  it('wraps string literals in a str span', () => {
    const html = highlightCode('const s = "hello";');
    expect(html).toContain('<span class="str">"hello"</span>');
  });

  it('defaults language to text in the data-lang attribute', () => {
    expect(highlightCode('x = 1')).toContain('data-lang="text"');
  });

  it('honors an explicit language', () => {
    expect(highlightCode('x = 1', 'python')).toContain('data-lang="python"');
  });

  it('wraps output in a pre/code structure', () => {
    const html = highlightCode('const x = 1');
    expect(html.startsWith('<pre class="codehilite"')).toBe(true);
    expect(html).toContain('<code>');
  });
});

describe('memory-attachments / generateImageThumbnail', () => {
  it('produces an SVG data URI with default dimensions and label', () => {
    const uri = generateImageThumbnail({});
    expect(uri.startsWith('data:image/svg+xml;utf8,')).toBe(true);
    const svg = decodeURIComponent(uri.replace('data:image/svg+xml;utf8,', ''));
    expect(svg).toContain('width="200"');
    expect(svg).toContain('height="120"');
    expect(svg).toContain('attachment'); // default label
  });

  it('uses provided dimensions', () => {
    const svg = decodeURIComponent(
      generateImageThumbnail({ width: 320, height: 240 }).replace('data:image/svg+xml;utf8,', '')
    );
    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="240"');
  });

  it('uses provided label and strips unsafe characters', () => {
    const svg = decodeURIComponent(
      generateImageThumbnail({ label: 'my <img> pic' }).replace('data:image/svg+xml;utf8,', '')
    );
    expect(svg).toContain('my img pic');
    expect(svg).not.toContain('<img>');
  });
});

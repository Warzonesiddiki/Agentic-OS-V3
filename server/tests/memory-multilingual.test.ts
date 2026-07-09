import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../src/services/memory-multilingual.js';

describe('memory-multilingual / detectLanguage', () => {
  it('returns unknown for empty input', () => {
    expect(detectLanguage('')).toBe('unknown');
    expect(detectLanguage('   ')).toBe('unknown');
  });

  it('detects CJK scripts', () => {
    // Chinese
    expect(detectLanguage('这是一段中文文本用于测试语言检测')).toBe('zh');
    // Japanese (hiragana/katakana)
    expect(detectLanguage('これは日本語のテストです')).toBe('ja');
    // Korean (hangul)
    expect(detectLanguage('이것은 한국어 테스트입니다')).toBe('ko');
  });

  it('detects Arabic script', () => {
    expect(detectLanguage('هذا نص عربي للاختبار')).toBe('ar');
  });

  it('detects Cyrillic (Russian) via script', () => {
    expect(detectLanguage('Это т��стовый русский текст')).toBe('ru');
  });

  it('detects Latin languages by stopwords', () => {
    expect(detectLanguage('the is are and of to')).toBe('en');
    expect(detectLanguage('el la de que en un')).toBe('es');
    expect(detectLanguage('le la est que en un')).toBe('fr');
    expect(detectLanguage('der die das ist und ein')).toBe('de');
  });

  it('returns unknown for unrecognized scripts/short gibberish', () => {
    expect(detectLanguage('qzx')).toBe('unknown');
  });
});

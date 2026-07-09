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
    expect(detectLanguage('Это тестовый русский текст')).toBe('ru');
  });

  it('detects Latin languages by stopwords', () => {
    expect(detectLanguage('this is a test of the english language detection')).toBe('en');
    expect(detectLanguage('esto es una prueba de detección en español')).toBe('es');
    expect(detectLanguage('ceci est un test de détection en français')).toBe('fr');
    expect(detectLanguage('dies ist ein test der deutschen sprache erkennung')).toBe('de');
  });

  it('returns unknown for unrecognized scripts/short gibberish', () => {
    expect(detectLanguage('qzx')).toBe('unknown');
  });
});

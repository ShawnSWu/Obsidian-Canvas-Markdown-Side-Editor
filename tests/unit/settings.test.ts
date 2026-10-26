import { describe, it, expect } from 'vitest';
import { migrateLegacyFontSizes } from '../../src/settings';

describe('migrateLegacyFontSizes', () => {
  it('folds the oldest per-pane px size into fontSize', () => {
    const s: Record<string, unknown> = { editorFontSize: 18, previewFontSize: 14 };
    const out = migrateLegacyFontSizes(s);
    expect(out.fontSize).toBe(18);
    expect('editorFontSize' in out).toBe(false);
    expect('previewFontSize' in out).toBe(false);
  });

  it('folds the intermediate base × scale model into fontSize', () => {
    const s: Record<string, unknown> = { baseFontSize: 16, panelFontScale: 1.25 };
    const out = migrateLegacyFontSizes(s);
    expect(out.fontSize).toBe(20);
    expect('baseFontSize' in out).toBe(false);
    expect('panelFontScale' in out).toBe(false);
  });

  it('chains the oldest shape through the intermediate one', () => {
    const s: Record<string, unknown> = { editorFontSize: 18, panelFontScale: 1.5 };
    const out = migrateLegacyFontSizes(s);
    expect(out.fontSize).toBe(27);
  });

  it('does not overwrite an existing fontSize', () => {
    const s: Record<string, unknown> = { fontSize: 22, baseFontSize: 16, panelFontScale: 2 };
    const out = migrateLegacyFontSizes(s);
    expect(out.fontSize).toBe(22);
    expect('baseFontSize' in out).toBe(false);
    expect('panelFontScale' in out).toBe(false);
  });

  it('is a no-op on already-migrated settings', () => {
    const s: Record<string, unknown> = { fontSize: 16, tableFontScale: 0.75 };
    const out = migrateLegacyFontSizes(s);
    expect(out.fontSize).toBe(16);
    expect(out.tableFontScale).toBe(0.75);
  });
});

import { describe, it, expect } from 'vitest';
import { nextViewMode, migrateLegacyReadOnly, type ViewMode } from '../../src/view-mode';

describe('nextViewMode', () => {
  it('cycles editor -> both', () => {
    expect(nextViewMode('editor')).toBe('both');
  });
  it('cycles both -> preview', () => {
    expect(nextViewMode('both')).toBe('preview');
  });
  it('cycles preview -> editor', () => {
    expect(nextViewMode('preview')).toBe('editor');
  });
});

describe('migrateLegacyReadOnly', () => {
  it('maps readOnly=true to viewMode=preview when viewMode is missing', () => {
    const s: Record<string, unknown> = { readOnly: true };
    const out = migrateLegacyReadOnly(s);
    expect(out.viewMode).toBe('preview');
    expect('readOnly' in out).toBe(false);
  });

  it('maps readOnly=false (or missing) to viewMode=both when viewMode is missing', () => {
    const s1: Record<string, unknown> = { readOnly: false };
    expect(migrateLegacyReadOnly(s1).viewMode).toBe('both');
    const s2: Record<string, unknown> = {};
    expect(migrateLegacyReadOnly(s2).viewMode).toBe('both');
  });

  it('does not overwrite an existing viewMode and still strips readOnly', () => {
    const s: Record<string, unknown> = { viewMode: 'editor', readOnly: true };
    const out = migrateLegacyReadOnly(s);
    expect(out.viewMode).toBe('editor');
    expect('readOnly' in out).toBe(false);
  });

  it('returns a settings object usable as { viewMode: ViewMode }', () => {
    const out = migrateLegacyReadOnly({ readOnly: true });
    const m: ViewMode = out.viewMode;
    expect(['editor', 'both', 'preview']).toContain(m);
  });
});

describe('migrateLegacyReadOnly + DEFAULT_SETTINGS merge ordering (issue #16 regression)', () => {
  it('produces viewMode=preview when raw data has readOnly=true even if defaults define viewMode=both', () => {
    // Simulate the order onload uses: migrate raw FIRST, then merge with defaults.
    const raw: Record<string, unknown> = { readOnly: true };
    migrateLegacyReadOnly(raw);
    const DEFAULTS = { viewMode: 'both' as const, foo: 1 };
    const merged = Object.assign({}, DEFAULTS, raw);
    expect(merged.viewMode).toBe('preview');
    expect('readOnly' in merged).toBe(false);
  });

  it('respects an explicit viewMode in raw data over the default', () => {
    const raw: Record<string, unknown> = { viewMode: 'editor' };
    migrateLegacyReadOnly(raw);
    const DEFAULTS = { viewMode: 'both' as const };
    const merged = Object.assign({}, DEFAULTS, raw);
    expect(merged.viewMode).toBe('editor');
  });
});

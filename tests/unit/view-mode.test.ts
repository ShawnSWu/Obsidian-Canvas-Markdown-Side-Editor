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

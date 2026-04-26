import { describe, it, expect } from 'vitest';
import { extractTitleFromText, patchFirstLineWithTitle, buildRenamePath } from '../../../src/utils/card-title';

describe('extractTitleFromText', () => {
  it('returns the first line for plain text', () => {
    expect(extractTitleFromText('Hello world\nBody here')).toBe('Hello world');
  });

  it('strips markdown heading markers up to level 6', () => {
    expect(extractTitleFromText('# Foo')).toBe('Foo');
    expect(extractTitleFromText('## Bar')).toBe('Bar');
    expect(extractTitleFromText('###### Baz\nmore')).toBe('Baz');
  });

  it('only strips when a space follows the hashes', () => {
    expect(extractTitleFromText('#nope')).toBe('#nope');
  });

  it('returns empty string for an empty document', () => {
    expect(extractTitleFromText('')).toBe('');
  });
});

describe('patchFirstLineWithTitle', () => {
  it('replaces a plain first line', () => {
    expect(patchFirstLineWithTitle('Old title\nbody', 'New title')).toBe('New title\nbody');
  });

  it('preserves the heading marker level', () => {
    expect(patchFirstLineWithTitle('# Foo\n\nbody', 'Bar')).toBe('# Bar\n\nbody');
    expect(patchFirstLineWithTitle('### Foo', 'Bar')).toBe('### Bar');
  });

  it('treats an empty document as a single line of just the new title', () => {
    expect(patchFirstLineWithTitle('', 'Hello')).toBe('Hello');
  });

  it('does not touch lines after the first', () => {
    const doc = 'old\nline2\nline3';
    expect(patchFirstLineWithTitle(doc, 'new')).toBe('new\nline2\nline3');
  });
});

describe('buildRenamePath', () => {
  it('replaces only the basename, preserving folder and extension', () => {
    const r = buildRenamePath('notes/foo.md', 'bar');
    expect(r).toEqual({ valid: true, path: 'notes/bar.md' });
  });

  it('handles vault-root files', () => {
    expect(buildRenamePath('foo.md', 'bar')).toEqual({ valid: true, path: 'bar.md' });
  });

  it('handles files with no extension', () => {
    expect(buildRenamePath('folder/foo', 'bar')).toEqual({ valid: true, path: 'folder/bar' });
  });

  it('rejects empty / whitespace-only basenames', () => {
    expect(buildRenamePath('a.md', '')).toEqual({ valid: false, reason: 'Empty filename' });
    expect(buildRenamePath('a.md', '   ')).toEqual({ valid: false, reason: 'Empty filename' });
  });

  it('rejects basenames with forbidden characters', () => {
    for (const bad of ['a/b', 'x:y', 'q?z', 'a*b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\\b']) {
      const r = buildRenamePath('a.md', bad);
      expect(r.valid).toBe(false);
    }
  });

  it('trims whitespace around the basename', () => {
    expect(buildRenamePath('a.md', '  hello  ')).toEqual({ valid: true, path: 'hello.md' });
  });
});

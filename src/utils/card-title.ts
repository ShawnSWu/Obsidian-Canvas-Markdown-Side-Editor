// Helpers for the optional "edit card title in side panel" feature (issue #10).
//
// For text cards we treat the first line as the visible title. If that line
// is a markdown heading (e.g. "## Foo") the heading marker is preserved when
// the user commits a new title.
//
// For file cards we just need to translate a new basename into a vault path
// while preserving the original directory and extension.

const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/;

export function extractTitleFromText(doc: string): string {
  const firstLine = doc.split(/\r?\n/, 1)[0] ?? '';
  const m = firstLine.match(/^(#{1,6})\s+(.*)$/);
  return m ? m[2] : firstLine;
}

export function patchFirstLineWithTitle(doc: string, newTitle: string): string {
  const lines = doc.split(/\r?\n/);
  if (lines.length === 0) return newTitle;
  const firstLine = lines[0] ?? '';
  const m = firstLine.match(/^(#{1,6})\s+/);
  lines[0] = m ? `${m[1]} ${newTitle}` : newTitle;
  return lines.join('\n');
}

export type RenamePlan =
  | { valid: true; path: string }
  | { valid: false; reason: string };

export function buildRenamePath(currentPath: string, newBasename: string): RenamePlan {
  const trimmed = newBasename.trim();
  if (!trimmed) return { valid: false, reason: 'Empty filename' };
  if (FORBIDDEN_FILENAME_CHARS.test(trimmed)) {
    return { valid: false, reason: 'Filename contains invalid characters' };
  }

  const slash = currentPath.lastIndexOf('/');
  const dir = slash === -1 ? '' : currentPath.slice(0, slash);
  const filename = slash === -1 ? currentPath : currentPath.slice(slash + 1);
  const dot = filename.lastIndexOf('.');
  const ext = dot === -1 ? '' : filename.slice(dot);

  const newPath = dir ? `${dir}/${trimmed}${ext}` : `${trimmed}${ext}`;
  return { valid: true, path: newPath };
}

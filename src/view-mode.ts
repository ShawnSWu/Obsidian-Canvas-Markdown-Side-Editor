// Single source of truth for the side panel's view mode.
//
// Three states: editor-only (source), live (Obsidian Live Preview hosted
// in the panel via a detached MarkdownView leaf — file cards only; text
// cards transparently fall back to source since they have no backing
// TFile), preview-only (rendered reading view).
//
// Cycle order is monotonic "more rendered" as you tab through:
//   editor (source) → live (live preview) → preview (reading) → editor

export type ViewMode = 'editor' | 'live' | 'preview';

const NEXT: Record<ViewMode, ViewMode> = {
  editor: 'live',
  live: 'preview',
  preview: 'editor',
};

export function nextViewMode(curr: ViewMode): ViewMode {
  return NEXT[curr];
}

// One-time settings migrations. Mutates `s` in place and returns the
// same object (not a copy). Idempotent: safe to call on already-
// migrated settings.
//  - legacy `readOnly` boolean → viewMode
//  - retired 'both' split mode → 'live' (closest single-pane experience)
export function migrateLegacyReadOnly<T extends Record<string, unknown>>(
  s: T,
): T & { viewMode: ViewMode } {
  if (s.viewMode == null) {
    (s as Record<string, unknown>).viewMode = s.readOnly === true ? 'preview' : 'both';
  }
  if (s.viewMode === 'both') {
    (s as Record<string, unknown>).viewMode = 'live';
  }
  delete (s as { readOnly?: boolean }).readOnly;
  return s as T & { viewMode: ViewMode };
}

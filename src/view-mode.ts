// Single source of truth for the side panel's view mode.
//
// Originally three states (issue #16): editor-only, editor+preview,
// preview-only. Issue #20 adds 'live' — full Obsidian Live Preview hosted
// inside the side panel via a detached MarkdownView leaf (file cards only;
// text cards transparently fall back to source rendering since they have
// no backing TFile to bind a leaf to).
//
// Cycle order is monotonic "more rendered" as you tab through:
//   editor (source) → live (live preview) → both (source + reading) → preview (reading) → editor

export type ViewMode = 'editor' | 'live' | 'both' | 'preview';

const NEXT: Record<ViewMode, ViewMode> = {
  editor: 'live',
  live: 'both',
  both: 'preview',
  preview: 'editor',
};

export function nextViewMode(curr: ViewMode): ViewMode {
  return NEXT[curr];
}

// One-time settings migration for users upgrading from a build that had
// the legacy `readOnly` boolean. Mutates `s` in place and returns the
// same object (not a copy). Idempotent: safe to call on already-
// migrated settings.
export function migrateLegacyReadOnly<T extends Record<string, unknown>>(
  s: T,
): T & { viewMode: ViewMode } {
  if (s.viewMode == null) {
    (s as Record<string, unknown>).viewMode = s.readOnly === true ? 'preview' : 'both';
  }
  delete (s as { readOnly?: boolean }).readOnly;
  return s as T & { viewMode: ViewMode };
}

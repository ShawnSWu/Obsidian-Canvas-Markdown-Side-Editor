// Single source of truth for the side panel's view mode.
//
// The panel has three states: editor-only, editor+preview, preview-only.
// Issue #16 collapses the previously-entangled `previewCollapsed`
// (session) and `readOnly` (persisted) flags into one persisted enum.

export type ViewMode = 'editor' | 'both' | 'preview';

const NEXT: Record<ViewMode, ViewMode> = {
  editor: 'both',
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

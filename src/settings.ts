import type { ViewMode } from './view-mode';

export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';

export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px (used when docked left/right)
  defaultPanelHeight: number; // px (used when docked top/bottom)
  previewDebounceMs: number;
  // Panel font size (px); null = capture the theme's size on first open.
  // Both panes share this one value; the toolbar slider adjusts it.
  fontSize: number | null;
  // Rendered table font size as a fraction of the pane font (0.75 = 75%).
  // Applies to tables in preview mode and Live Preview via CSS variable.
  tableFontScale: number;
  viewMode: ViewMode;              // single source of truth for issue #16
  dockPosition?: DockPosition;     // panel docking edge (issue #11)
  // Floating-mode persisted state (issue #11). Px values relative to the
  // canvas containerEl. Updated on drag-end and resize-end.
  floatingX?: number;
  floatingY?: number;
  floatingWidth?: number;
  floatingHeight?: number;
  // Vault-wide "headline mode" toggle (issue #13). When true, every text /
  // file canvas card visually collapses to just its first H1; full content
  // remains accessible through the side editor.
  headlineMode?: boolean;
  // Title size in headline mode, expressed as a percentage of the card's
  // width (CSS `cqi` multiplier). Bigger number → bigger text. Clamped to
  // a sane min/max in CSS so very small / very large cards still look
  // reasonable.
  headlineH1Size?: number;
}

// One-time migration of retired font settings into the single `fontSize`
// px value. Chains through both older shapes:
//   editorFontSize (per-pane px) → baseFontSize → baseFontSize × panelFontScale → fontSize
// Mutates `s` in place and returns it. Idempotent.
export function migrateLegacyFontSizes<T extends Record<string, unknown>>(s: T): T {
  if (s.baseFontSize == null && typeof s.editorFontSize === 'number' && s.editorFontSize > 0) {
    (s as Record<string, unknown>).baseFontSize = s.editorFontSize;
  }
  if (s.fontSize == null && typeof s.baseFontSize === 'number' && s.baseFontSize > 0) {
    const scale = typeof s.panelFontScale === 'number' && s.panelFontScale > 0 ? s.panelFontScale : 1;
    (s as Record<string, unknown>).fontSize = Math.round(s.baseFontSize * scale);
  }
  delete (s as Record<string, unknown>).editorFontSize;
  delete (s as Record<string, unknown>).previewFontSize;
  delete (s as Record<string, unknown>).baseFontSize;
  delete (s as Record<string, unknown>).panelFontScale;
  return s;
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  defaultPanelHeight: 360,
  previewDebounceMs: 80,
  fontSize: null,
  tableFontScale: 0.75,
  viewMode: 'live',
  dockPosition: 'right',
  floatingX: 80,
  floatingY: 80,
  floatingWidth: 480,
  floatingHeight: 400,
  headlineMode: false,
  headlineH1Size: 22,
};

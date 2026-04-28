export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';

export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px (used when docked left/right)
  defaultPanelHeight: number; // px (used when docked top/bottom)
  previewDebounceMs: number;
  editorFontSize: number | null;   // px, null = follow theme
  previewFontSize: number | null;  // px, null = follow theme
  readOnly?: boolean;              // when true, show only preview (no editor)
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

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  defaultPanelHeight: 360,
  previewDebounceMs: 80,
  editorFontSize: null,
  previewFontSize: null,
  readOnly: false,
  dockPosition: 'right',
  floatingX: 80,
  floatingY: 80,
  floatingWidth: 480,
  floatingHeight: 400,
  headlineMode: false,
  headlineH1Size: 22,
};

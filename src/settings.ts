export type DockPosition = 'left' | 'right' | 'top' | 'bottom';

export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px (used when docked left/right)
  defaultPanelHeight: number; // px (used when docked top/bottom)
  previewDebounceMs: number;
  editorFontSize: number | null;   // px, null = follow theme
  previewFontSize: number | null;  // px, null = follow theme
  readOnly?: boolean;              // when true, show only preview (no editor)
  showCardTitle?: boolean;         // when true, toolbar shows an editable card title (issue #10)
  dockPosition?: DockPosition;     // panel docking edge (issue #11)
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  defaultPanelHeight: 360,
  previewDebounceMs: 80,
  editorFontSize: null,
  previewFontSize: null,
  readOnly: false,
  showCardTitle: false,
  dockPosition: 'right',
};

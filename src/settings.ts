export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px
  previewDebounceMs: number;
  defaultPreviewCollapsed: boolean;
  lastPreviewCollapsed?: boolean;
  editorFontSize: number;   // px, 0 = use theme default
  previewFontSize: number;  // px, 0 = use theme default
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  previewDebounceMs: 80,
  defaultPreviewCollapsed: false,
  editorFontSize: 0,
  previewFontSize: 0,
};

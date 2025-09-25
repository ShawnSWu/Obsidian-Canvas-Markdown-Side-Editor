export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px
  previewDebounceMs: number;
  defaultPreviewCollapsed: boolean;
  lastPreviewCollapsed?: boolean;
  editorFontSize: number | null;   // px, null = follow theme
  previewFontSize: number | null;  // px, null = follow theme
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  previewDebounceMs: 80,
  defaultPreviewCollapsed: false,
  editorFontSize: null,
  previewFontSize: null,
};

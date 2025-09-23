export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px
  previewDebounceMs: number;
  defaultPreviewCollapsed: boolean;
  lastPreviewCollapsed?: boolean;
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  previewDebounceMs: 80,
  defaultPreviewCollapsed: false,
};

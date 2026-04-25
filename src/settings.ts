export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number; // px
  previewDebounceMs: number;
  editorFontSize: number | null;   // px, null = follow theme
  previewFontSize: number | null;  // px, null = follow theme
  readOnly?: boolean;              // when true, show only preview (no editor)
  showCardTitle?: boolean;         // when true, toolbar shows an editable card title (issue #10)
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  previewDebounceMs: 80,
  editorFontSize: null,
  previewFontSize: null,
  readOnly: false,
  showCardTitle: false,
};

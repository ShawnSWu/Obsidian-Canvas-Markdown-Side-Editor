export type CanvasNode = {
  id: string;
  type: 'text' | 'file' | 'link' | string;
  text?: string; // when type = 'text'
  file?: string; // when type = 'file'
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: unknown;
};

export type CanvasData = {
  nodes: CanvasNode[];
  edges: unknown[];
};

// Minimal Canvas object shape we rely on across Obsidian versions
export interface CanvasLike {
  // optional APIs across versions; use existence checks before calling
  getData?(): unknown;
  requestSave?(): void;
  updateNode?(id: string, data: Partial<CanvasNode>): void;
  setNodeText?(id: string, text: string): void;
  zoomToSelection?(...args: unknown[]): unknown;
  [k: string]: unknown;
}

// Minimal Canvas view shape used by this plugin
export interface CanvasLikeView {
  containerEl: HTMLElement;
  contentEl?: HTMLElement;
  file?: import('obsidian').TFile;
  canvas?: CanvasLike;
  [k: string]: unknown;
}

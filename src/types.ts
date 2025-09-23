export type CanvasNode = {
  id: string;
  type: 'text' | 'file' | 'link' | string;
  text?: string; // when type = 'text'
  file?: string; // when type = 'file'
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  [key: string]: any;
};

export type CanvasData = {
  nodes: CanvasNode[];
  edges: any[];
};

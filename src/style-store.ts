// Pure data layer for the canvas style suite. Holds per-canvas style
// overrides (headline on/off, per-node headline styling, per-edge label
// styling and anchor offsets) keyed by canvas file path.
//
// Persisted inside the plugin's data.json — style data NEVER touches the
// .canvas files themselves, so a vault opened without this plugin renders
// completely native canvases.
//
// Resolution hierarchy everywhere: global setting → per-canvas → per-node/edge,
// each level falling back to the one above. Mutators prune empty objects so
// data.json stays free of `{}` litter.

export type AnchorOffset = 0.25 | 0.5 | 0.75;

export interface NodeStyle {
  h1Size?: number;   // cqi multiplier, same 5–60 range as the global setting
  h1Color?: string;  // any CSS color
}

export interface EdgeStyle {
  labelSize?: number;        // px
  labelColor?: string;       // any CSS color
  fromOffset?: AnchorOffset; // position along the from-side; 0.5 = native midpoint
  toOffset?: AnchorOffset;
}

export interface CanvasStyleData {
  headline?: 'on' | 'off';               // per-canvas override; absent = follow global
  nodes?: Record<string, NodeStyle>;     // nodeId → style
  edges?: Record<string, EdgeStyle>;     // edgeId → style
}

export type CanvasStylesMap = Record<string, CanvasStyleData>;

export function resolveHeadline(
  map: CanvasStylesMap | undefined,
  canvasPath: string | null,
  globalOn: boolean,
): boolean {
  if (!map || !canvasPath) return globalOn;
  const override = map[canvasPath]?.headline;
  if (override === 'on') return true;
  if (override === 'off') return false;
  return globalOn;
}

export function getNodeStyle(
  map: CanvasStylesMap | undefined,
  canvasPath: string | null,
  nodeId: string,
): NodeStyle {
  if (!map || !canvasPath) return {};
  return { ...(map[canvasPath]?.nodes?.[nodeId] ?? {}) };
}

export function getEdgeStyle(
  map: CanvasStylesMap | undefined,
  canvasPath: string | null,
  edgeId: string,
): EdgeStyle {
  if (!map || !canvasPath) return {};
  return { ...(map[canvasPath]?.edges?.[edgeId] ?? {}) };
}

export function setCanvasHeadline(
  map: CanvasStylesMap,
  canvasPath: string,
  v: 'on' | 'off' | null,
): CanvasStylesMap {
  if (v === null) {
    const entry = map[canvasPath];
    if (entry) {
      delete entry.headline;
      pruneCanvas(map, canvasPath);
    }
    return map;
  }
  (map[canvasPath] ??= {}).headline = v;
  return map;
}

export function setNodeStyle(
  map: CanvasStylesMap,
  canvasPath: string,
  nodeId: string,
  patch: Partial<NodeStyle> | null,
): CanvasStylesMap {
  applyStylePatch(map, canvasPath, 'nodes', nodeId, patch);
  return map;
}

export function setEdgeStyle(
  map: CanvasStylesMap,
  canvasPath: string,
  edgeId: string,
  patch: Partial<EdgeStyle> | null,
): CanvasStylesMap {
  applyStylePatch(map, canvasPath, 'edges', edgeId, patch);
  return map;
}

export function renameCanvasKey(map: CanvasStylesMap, oldPath: string, newPath: string): void {
  const entry = map[oldPath];
  if (!entry) return;
  delete map[oldPath];
  map[newPath] = entry;
}

export function deleteCanvasKey(map: CanvasStylesMap, path: string): void {
  delete map[path];
}

// --- internals ---

function applyStylePatch(
  map: CanvasStylesMap,
  canvasPath: string,
  bucket: 'nodes' | 'edges',
  id: string,
  patch: Record<string, unknown> | null,
): void {
  const entry = (map[canvasPath] ??= {});
  const styles = (entry[bucket] ??= {}) as Record<string, Record<string, unknown>>;
  if (patch === null) {
    delete styles[id];
  } else {
    const style = (styles[id] ??= {});
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete style[k];
      else style[k] = v;
    }
    if (Object.keys(style).length === 0) delete styles[id];
  }
  if (Object.keys(styles).length === 0) delete entry[bucket];
  pruneCanvas(map, canvasPath);
}

function pruneCanvas(map: CanvasStylesMap, canvasPath: string): void {
  const entry = map[canvasPath];
  if (entry && Object.keys(entry).length === 0) delete map[canvasPath];
}

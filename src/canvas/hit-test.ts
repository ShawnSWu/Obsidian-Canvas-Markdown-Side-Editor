// Canvas node resolution: given a screen point (or the current selection),
// figure out which canvas node the user means. Three strategies are tried
// by callers in order of preference:
//   1. findNodeIdAtPoint   — DOM hit testing via elementsFromPoint
//   2. tryCanvasAPIsForHit — version-dependent Canvas runtime hit-test APIs
//   3. hitTestNodeAt       — geometric test against canvas JSON bounds
// plus getSelectedCanvasNodeId for selection-based fallback.
import type { CanvasLikeView, CanvasLike, CanvasNode } from '../types';
import type { App } from 'obsidian';
import { screenToCanvasPoint } from './geometry';
import { readCanvasData } from './data';

export function findNodeIdAtPoint(clientX: number, clientY: number): string | null {
  try {
    const path = (document.elementsFromPoint(clientX, clientY) || []) as HTMLElement[];
    for (const el of path) {
      const host = el.closest('[data-node-id], [data-id], .canvas-node, .canvas-card') as HTMLElement | null;
      if (!host) continue;
      const id = host.getAttribute('data-node-id') || host.getAttribute('data-id');
      if (id) return id;
    }
  } catch {}
  return null;
}

export async function getSelectedCanvasNodeId(view: CanvasLikeView): Promise<string | null> {
  try {
    const canvas: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
    if (!canvas) return null;
    // Try getSelection() API if present
    let sel: unknown = undefined;
    try {
      const maybeGetSel = (canvas as { getSelection?: () => unknown }).getSelection;
      if (typeof maybeGetSel === 'function') {
        sel = maybeGetSel.call(canvas);
      }
    } catch {}
    // Fallback to property
    if (sel == null) sel = (canvas as Record<string, unknown>).selection as unknown;
    // Array case
    if (Array.isArray(sel) && sel.length) {
      const first = sel[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && 'id' in first && typeof (first as any).id === 'string') return (first as any).id as string;
    }
    // Set case
    if (sel instanceof Set && sel.size) {
      const first = (sel as Set<unknown>).values().next().value;
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && 'id' in (first as any)) return (first as any).id as string;
    }
    // Object with id
    if (sel && typeof sel === 'object' && 'id' in (sel as any) && typeof (sel as any).id === 'string') return (sel as any).id as string;
  } catch {}
  return null;
}

export async function tryCanvasAPIsForHit(view: CanvasLikeView, clientX: number, clientY: number): Promise<string | null> {
  try {
    const canvas: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
    if (!canvas) return null;
    const methods: Array<string> = [
      'getNodeAtPos', 'getNodeAtPoint', 'nodeAt', 'hitTest', 'pickNode',
      'getNodeFromScreenPoint', 'getNodeFromPoint', 'getNodeAtScreenPos', 'getNodeAtScreenPoint'
    ];
    for (const m of methods) {
      const fn = (canvas as Record<string, unknown>)[m];
      if (typeof fn === 'function') {
        try {
          const res: unknown = (fn as Function).call(canvas, clientX, clientY);
          let id: string | null = null;
          if (!res) {
            // no-op
          } else if (typeof res === 'string') {
            id = res;
          } else if (typeof res === 'object') {
            if ('id' in (res as any) && (res as any).id) id = (res as any).id as string;
            else if (Array.isArray(res) && res.length) {
              const first = res[0];
              if (typeof first === 'string') id = first;
              else if (first && typeof first === 'object' && 'id' in (first as any)) id = (first as any).id as string;
            }
          }
          if (id) return id;
        } catch {}
      }
    }
    // No hit-test API produced an id. Selection is intentionally NOT used
    // as a fallback here: selection is not a hit test, and on background
    // clicks it can still hold the previously open card, which callers
    // would mistake for the click target.
    return null;
  } catch {}
  return null;
}

// Narrowing helper to ensure values are finite numbers
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export async function hitTestNodeAt(app: App, view: CanvasLikeView, clientX: number, clientY: number): Promise<string | null> {
  const data = await readCanvasData(app, view);
  if (!data) return null;
  const { x, y } = screenToCanvasPoint(view, clientX, clientY);
  const getBounds = (n: CanvasNode | Record<string, unknown>) => {
    if (typeof (n as CanvasNode).x === 'number' && typeof (n as CanvasNode).y === 'number' && typeof (n as CanvasNode).width === 'number' && typeof (n as CanvasNode).height === 'number') {
      // Canvas JSON x/y is the node's TOP-LEFT corner per the .canvas spec.
      // (A center-origin fallback used to be listed here too; its phantom
      // box extended half a node beyond the bottom-right edges and made
      // blank clicks next to a node count as hitting it.)
      return [
        { left: (n as CanvasNode).x!, top: (n as CanvasNode).y!, width: (n as CanvasNode).width!, height: (n as CanvasNode).height! },
      ];
    }
    const rec = n as Record<string, unknown>;
    const posVal = rec['pos'] as unknown;
    const sizeVal = rec['size'] as unknown;
    const posObj = (posVal && typeof posVal === 'object') ? (posVal as Record<string, unknown>) : undefined;
    const posArr = Array.isArray(posVal) ? (posVal as unknown[]) : undefined;
    const sizeObj = (sizeVal && typeof sizeVal === 'object' && !Array.isArray(sizeVal)) ? (sizeVal as Record<string, unknown>) : undefined;
    const sizeArr = Array.isArray(sizeVal) ? (sizeVal as unknown[]) : undefined;
    if ((posObj || posArr) && (sizeObj || sizeArr)) {
      const px = typeof posObj?.x === 'number' ? posObj!.x as number : (typeof posArr?.[0] === 'number' ? posArr![0] as number : undefined);
      const py = typeof posObj?.y === 'number' ? posObj!.y as number : (typeof posArr?.[1] === 'number' ? posArr![1] as number : undefined);
      const w = typeof sizeObj?.w === 'number' ? sizeObj!.w as number
              : typeof sizeObj?.width === 'number' ? sizeObj!.width as number
              : typeof sizeArr?.[0] === 'number' ? sizeArr![0] as number : undefined;
      const h = typeof sizeObj?.h === 'number' ? sizeObj!.h as number
              : typeof sizeObj?.height === 'number' ? sizeObj!.height as number
              : typeof sizeArr?.[1] === 'number' ? sizeArr![1] as number : undefined;
      if (isNum(px) && isNum(py) && isNum(w) && isNum(h)) {
        const _px = px, _py = py, _w = w, _h = h;
        return [
          { left: _px, top: _py, width: _w, height: _h },
        ];
      }
    }
    return [] as Array<{ left: number; top: number; width: number; height: number }>;
  };

  for (let i = data.nodes.length - 1; i >= 0; i--) {
    const n = data.nodes[i];
    const candidates = getBounds(n);
    for (const b of candidates) {
      if (x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height) {
        return n.id as string;
      }
    }
  }
  return null;
}

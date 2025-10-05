// Canvas selection helpers that try multiple Canvas APIs across versions
import type { CanvasLikeView, CanvasLike } from '../types';

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
    // As a last resort, wait a bit and re-check selection
    await new Promise((r) => setTimeout(r, 120));
    const sel = await getSelectedCanvasNodeId(view);
    return sel ?? null;
  } catch {}
  return null;
}

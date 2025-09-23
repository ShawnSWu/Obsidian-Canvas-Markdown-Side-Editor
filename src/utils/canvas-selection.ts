// Canvas selection helpers that try multiple Canvas APIs across versions

export async function getSelectedCanvasNodeId(view: any): Promise<string | null> {
  try {
    const canvas = (view as any)?.canvas;
    if (!canvas) return null;
    // Try getSelection() API if present
    let sel: any = undefined;
    try {
      if (typeof canvas.getSelection === 'function') {
        sel = canvas.getSelection();
      }
    } catch {}
    // Fallback to property
    if (!sel) sel = (canvas as any).selection;
    if (Array.isArray(sel) && sel.length) {
      const first = sel[0];
      if (first) {
        if (typeof first === 'string') return first as string;
        if ((first as any).id) return (first as any).id as string;
      }
    }
    if (sel instanceof Set && sel.size) {
      const first: any = (sel as Set<any>).values().next().value;
      if (first) {
        if (typeof first === 'string') return first as string;
        if (first.id) return first.id as string;
      }
    }
    if (sel && typeof sel === 'object' && 'id' in sel && (sel as any).id) return (sel as any).id as string;
  } catch {}
  return null;
}

export async function tryCanvasAPIsForHit(view: any, clientX: number, clientY: number): Promise<string | null> {
  try {
    const canvas = (view as any)?.canvas;
    if (!canvas) return null;
    const methods: Array<string> = [
      'getNodeAtPos', 'getNodeAtPoint', 'nodeAt', 'hitTest', 'pickNode',
      'getNodeFromScreenPoint', 'getNodeFromPoint', 'getNodeAtScreenPos', 'getNodeAtScreenPoint'
    ];
    for (const m of methods) {
      const fn: any = (canvas as any)[m];
      if (typeof fn === 'function') {
        try {
          const res = fn.call(canvas, clientX, clientY);
          let id: string | null = null;
          if (!res) {
            // no-op
          } else if (typeof res === 'string') {
            id = res;
          } else if (typeof res === 'object') {
            if ('id' in res && (res as any).id) id = (res as any).id as string;
            else if (Array.isArray(res) && res.length) {
              const first = res[0];
              if (typeof first === 'string') id = first;
              else if (first && typeof first === 'object' && 'id' in first) id = (first as any).id as string;
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

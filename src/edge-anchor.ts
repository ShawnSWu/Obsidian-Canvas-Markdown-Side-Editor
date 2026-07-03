// EXPERIMENTAL — quantized edge anchor offsets (canvas style suite phase 4).
//
// The JSONCanvas format only stores which SIDE an edge attaches to; Obsidian
// always renders the endpoint at that side's midpoint, so parallel edges
// pile up. This module post-adjusts the rendered SVG path: it wraps each
// edge object's `updatePath` (non-public API, feature-detected) and, after
// the native renderer runs, rewrites the path's first and last coordinate
// pairs shifted along the side by the stored 25/50/75% offset.
//
// Fail-safe by design: anything unexpected (missing method, missing SVG
// path, unparsable path data) leaves native rendering untouched. Offsets
// live in the plugin's data.json, so a vault without the plugin renders
// standard mid-side edges.

import type { EdgeStyle } from './style-store';

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface Delta { dx: number; dy: number; }

// (offset - 0.5) × side length, along the side's axis: top/bottom sides run
// horizontally (X), left/right sides run vertically (Y).
export function anchorDelta(side: Side, offset: number, w: number, h: number): Delta {
  const t = offset - 0.5;
  if (side === 'top' || side === 'bottom') return { dx: t * w, dy: 0 };
  return { dx: 0, dy: t * h };
}

const NUM = String.raw`[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?`;
const FIRST_PAIR = new RegExp(String.raw`^(\s*[Mm]\s*)(${NUM})([ ,])(${NUM})`);
const LAST_PAIR = new RegExp(String.raw`(${NUM})([ ,])(${NUM})\s*$`);

// Rewrites the "M x,y" start and the final coordinate pair of an SVG path.
// Returns `d` unchanged when it doesn't look like a path we understand.
export function shiftPathEndpoints(d: string, from: Delta, to: Delta): string {
  if (from.dx === 0 && from.dy === 0 && to.dx === 0 && to.dy === 0) return d;
  const start = d.match(FIRST_PAIR);
  const end = d.match(LAST_PAIR);
  if (!start || !end) return d;
  let out = d;
  if (from.dx !== 0 || from.dy !== 0) {
    out = out.replace(
      FIRST_PAIR,
      (_m, head: string, x: string, sep: string, y: string) =>
        `${head}${fmt(Number(x) + from.dx)}${sep}${fmt(Number(y) + from.dy)}`,
    );
  }
  if (to.dx !== 0 || to.dy !== 0) {
    out = out.replace(
      LAST_PAIR,
      (_m, x: string, sep: string, y: string) =>
        `${fmt(Number(x) + to.dx)}${sep}${fmt(Number(y) + to.dy)}`,
    );
  }
  return out;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

interface PatchableEdge {
  id?: string;
  from?: { side?: string; node?: { width?: number; height?: number } };
  to?: { side?: string; node?: { width?: number; height?: number } };
  path?: { display?: unknown };
  updatePath?: (...args: unknown[]) => unknown;
}

const SIDES: ReadonlySet<string> = new Set(['top', 'bottom', 'left', 'right']);

// Wraps every patchable edge in the canvas's edges Map. Returns an
// uninstall function restoring the original methods. Edges that don't match
// the expected shape are skipped with a single console.warn for the whole
// install (not one per edge).
export function installEdgeAnchorPatch(
  canvas: { edges?: unknown },
  getStyle: (edgeId: string) => EdgeStyle,
): () => void {
  const restores: Array<() => void> = [];
  let warned = false;
  const warnOnce = () => {
    if (warned) return;
    warned = true;
    try { console.warn('CanvasMdSideEditor: edge anchor patch skipped an edge (unexpected canvas internals shape)'); } catch {}
  };

  try {
    const edges = canvas?.edges;
    const entries: Iterable<[unknown, unknown]> = edges instanceof Map ? edges.entries() : [];
    for (const [key, raw] of entries) {
      const edge = raw as PatchableEdge;
      const id = typeof key === 'string' ? key : edge?.id;
      const original = edge?.updatePath;
      if (!id || typeof original !== 'function') { warnOnce(); continue; }

      const wrapped = function (this: unknown, ...args: unknown[]): unknown {
        const result = original.apply(this, args);
        try {
          const style = getStyle(id);
          const fromD = sideDelta(edge.from, style.fromOffset);
          const toD = sideDelta(edge.to, style.toOffset);
          if (fromD || toD) {
            // Duck-typed rather than `instanceof SVGPathElement`: popout
            // windows have their own globals, so instanceof checks against
            // this window's constructors would wrongly fail there.
            const pathEl = edge.path?.display as
              | { getAttribute?: (n: string) => string | null; setAttribute?: (n: string, v: string) => void }
              | undefined;
            if (typeof pathEl?.getAttribute === 'function' && typeof pathEl?.setAttribute === 'function') {
              const d = pathEl.getAttribute('d');
              if (d) {
                pathEl.setAttribute(
                  'd',
                  shiftPathEndpoints(d, fromD ?? { dx: 0, dy: 0 }, toD ?? { dx: 0, dy: 0 }),
                );
              }
            }
          }
        } catch {}
        return result;
      };

      edge.updatePath = wrapped;
      restores.push(() => {
        if (edge.updatePath === wrapped) edge.updatePath = original;
      });
    }
  } catch {}

  return () => {
    while (restores.length) {
      try { restores.pop()?.(); } catch {}
    }
  };
}

function sideDelta(
  end: { side?: string; node?: { width?: number; height?: number } } | undefined,
  offset: number | undefined,
): Delta | null {
  if (offset == null || offset === 0.5) return null;
  const side = end?.side;
  const w = end?.node?.width;
  const h = end?.node?.height;
  if (!side || !SIDES.has(side) || typeof w !== 'number' || typeof h !== 'number') return null;
  return anchorDelta(side as Side, offset, w, h);
}

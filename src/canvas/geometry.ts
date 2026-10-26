// Canvas DOM and geometry helpers
import type { CanvasLikeView } from '../types';

export function getViewportEl(view: CanvasLikeView): HTMLElement | null {
  const container: HTMLElement | undefined = view?.containerEl;
  if (!container) return null;
  const el = container.querySelector(
    '.canvas-viewport, .canvas-wrapper, .canvas-container'
  ) as HTMLElement | null;
  return el ?? container;
}

// The element that carries Canvas's pan/zoom transform — `.canvas` in
// current Obsidian builds (the inner container that moves/scales under the
// untransformed `.canvas-wrapper`).
export function getTransformEl(view: CanvasLikeView): HTMLElement | null {
  const container: HTMLElement | undefined = view?.containerEl;
  if (!container) return null;
  const qs = ['.canvas', '.canvas-zoom', '.canvas-transform', '.canvas-viewport', '.canvas-wrapper', '.canvas-container'];
  const found: HTMLElement[] = [];
  for (const q of qs) {
    const el = container.querySelector(q) as HTMLElement | null;
    if (el && !found.includes(el)) found.push(el);
  }
  // Prefer a structural candidate that currently carries a transform.
  for (const el of found) {
    const t = getComputedStyle(el).transform;
    if (t && t !== 'none') return el;
  }
  // None transformed → the canvas is at rest and identity math is correct.
  // Deliberately do NOT scan arbitrary descendants: node elements use
  // transforms for their own positioning and would be mistaken for the
  // zoom container.
  return found[0] ?? getViewportEl(view);
}

export function parseTransform(el: HTMLElement): { scale: number; tx: number; ty: number } {
  const cs = getComputedStyle(el);
  const t = cs.transform || 'none';
  if (!t || t === 'none') return { scale: 1, tx: 0, ty: 0 };
  const m = t.match(/matrix\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (p.length >= 6) {
      const a = p[0];
      const d = p[3];
      const e = p[4];
      const f = p[5];
      const scale = (Math.abs(a) + Math.abs(d)) / 2 || 1;
      return { scale, tx: e || 0, ty: f || 0 };
    }
  }
  const m3 = t.match(/matrix3d\(([^)]+)\)/);
  if (m3) {
    const p = m3[1].split(',').map((s) => parseFloat(s.trim()));
    if (p.length >= 16) {
      const a = p[0];
      const d = p[5];
      const e = p[12];
      const f = p[13];
      const scale = (Math.abs(a) + Math.abs(d)) / 2 || 1;
      return { scale, tx: e || 0, ty: f || 0 };
    }
  }
  return { scale: 1, tx: 0, ty: 0 };
}

export function screenToCanvasPoint(view: CanvasLikeView, clientX: number, clientY: number): { x: number; y: number } {
  // The rect MUST come from an untransformed element (the viewport).
  // getBoundingClientRect() of the transform carrier already includes the
  // pan/zoom, so mixing that rect with tx/ty double-counts the transform
  // and yields garbage coordinates whenever the canvas is zoomed or panned
  // (blank clicks then "hit" phantom nodes and reopen the panel).
  const viewport = getViewportEl(view);
  if (!viewport) return { x: clientX, y: clientY };
  const rect = viewport.getBoundingClientRect();
  const tEl = getTransformEl(view);
  // If the viewport itself were the transform carrier its rect would be
  // unusable; treat as identity rather than producing garbage. (Does not
  // happen in Obsidian's real DOM — the transform lives on `.canvas`.)
  const { scale, tx, ty } = (tEl && tEl !== viewport) ? parseTransform(tEl) : { scale: 1, tx: 0, ty: 0 };
  const x = (clientX - rect.left - tx) / (scale || 1);
  const y = (clientY - rect.top - ty) / (scale || 1);
  return { x, y };
}

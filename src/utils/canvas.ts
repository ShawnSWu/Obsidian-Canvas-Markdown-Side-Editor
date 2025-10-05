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

export function getTransformEl(view: CanvasLikeView): HTMLElement | null {
  const container: HTMLElement | undefined = view?.containerEl;
  if (!container) return null;
  const candidates: HTMLElement[] = [];
  const qs = ['.canvas-zoom', '.canvas-transform', '.canvas-viewport', '.canvas-wrapper', '.canvas-container'];
  for (const q of qs) {
    const found = container.querySelector(q) as HTMLElement | null;
    if (found) candidates.push(found);
  }
  candidates.push(...Array.from(container.querySelectorAll('*')) as HTMLElement[]);
  for (const el of candidates) {
    const t = getComputedStyle(el).transform;
    if (t && t !== 'none') return el;
  }
  return getViewportEl(view);
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
  const el = getTransformEl(view) ?? getViewportEl(view);
  if (!el) return { x: clientX, y: clientY };
  const rect = el.getBoundingClientRect();
  const { scale, tx, ty } = parseTransform(el);
  const x = (clientX - rect.left - tx) / (scale || 1);
  const y = (clientY - rect.top - ty) / (scale || 1);
  return { x, y };
}

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

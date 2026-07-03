// Stamps canvas-style-suite state onto canvas DOM: the per-canvas headline
// class on a canvas view's containerEl, per-node CSS variables on
// `.canvas-node` elements, and per-edge label variables on edge label
// elements. Pure DOM in / DOM out — no Obsidian imports, so it is fully
// unit-testable.
//
// Variables are REMOVED (not set to '') when a style lacks the field, so
// the cascade falls back to the body-level defaults / theme values.

import type { EdgeStyle, NodeStyle } from './style-store';

export function applyCanvasHeadlineClass(containerEl: HTMLElement, on: boolean): void {
  containerEl.classList.toggle('cmside-headline-mode', on);
}

const NODE_SELECTOR = '.canvas-node';

function nodeIdOf(el: HTMLElement): string | null {
  return el.getAttribute('data-node-id') ?? el.getAttribute('data-id');
}

export function applyNodeStyleVars(
  containerEl: HTMLElement,
  nodes: Record<string, NodeStyle>,
): void {
  const els = containerEl.querySelectorAll<HTMLElement>(NODE_SELECTOR);
  els.forEach((el) => {
    const id = nodeIdOf(el);
    if (!id) return;
    const style = nodes[id] ?? {};
    setOrRemove(el, '--cmside-h1-size', style.h1Size != null ? String(style.h1Size) : null);
    setOrRemove(el, '--cmside-h1-color', style.h1Color ?? null);
  });
}

export function clearNodeStyleVars(containerEl: HTMLElement): void {
  applyNodeStyleVars(containerEl, {});
}

export function applyEdgeLabelStyles(
  edges: Iterable<[string, { labelEl?: HTMLElement | null }]>,
  styles: Record<string, EdgeStyle>,
): void {
  for (const [id, edge] of edges) {
    const labelEl = edge?.labelEl;
    if (!labelEl) continue;
    const style = styles[id] ?? {};
    setOrRemove(labelEl, '--cmside-edge-label-size', style.labelSize != null ? `${style.labelSize}px` : null);
    setOrRemove(labelEl, '--cmside-edge-label-color', style.labelColor ?? null);
  }
}

function setOrRemove(el: HTMLElement, prop: string, value: string | null): void {
  if (value == null) el.style.removeProperty(prop);
  else el.style.setProperty(prop, value);
}

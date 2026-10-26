import { describe, it, expect, beforeEach } from 'vitest';
import { parseTransform, screenToCanvasPoint } from '../../src/canvas/geometry';
import { findNodeIdAtPoint } from '../../src/canvas/hit-test';
import type { CanvasLikeView } from '../../src/types';

// Override getComputedStyle to control transform/position values per-element.
const transformMap = new WeakMap<Element, string>();
const positionMap = new WeakMap<Element, string>();
const originalGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = ((el: Element) => {
  const real = originalGCS(el);
  return new Proxy(real, {
    get(target, prop, recv) {
      if (prop === 'transform') return transformMap.get(el) ?? 'none';
      if (prop === 'position') return positionMap.get(el) ?? 'static';
      return Reflect.get(target, prop, recv);
    },
  }) as CSSStyleDeclaration;
}) as typeof window.getComputedStyle;

function setTransform(el: Element, transform: string) { transformMap.set(el, transform); }
function setRect(el: Element, rect: { left: number; top: number; width: number; height: number }) {
  (el as any).getBoundingClientRect = () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height, x: rect.left, y: rect.top, toJSON: () => ({}) });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('parseTransform', () => {
  it('returns identity for "none"', () => {
    const el = document.createElement('div');
    setTransform(el, 'none');
    expect(parseTransform(el)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('parses 2D matrix', () => {
    const el = document.createElement('div');
    setTransform(el, 'matrix(2, 0, 0, 2, 30, 40)');
    expect(parseTransform(el)).toEqual({ scale: 2, tx: 30, ty: 40 });
  });

  it('parses matrix3d', () => {
    const el = document.createElement('div');
    setTransform(el, 'matrix3d(1.5, 0, 0, 0, 0, 1.5, 0, 0, 0, 0, 1, 0, 10, 20, 0, 1)');
    expect(parseTransform(el)).toEqual({ scale: 1.5, tx: 10, ty: 20 });
  });

  it('handles malformed transform gracefully', () => {
    const el = document.createElement('div');
    setTransform(el, 'rotate(45deg)');
    expect(parseTransform(el)).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});

describe('screenToCanvasPoint', () => {
  it('returns client coords when no transform target found', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = { containerEl: container } as unknown as CanvasLikeView;
    // No transformed children; getBoundingClientRect default 0,0,0,0
    setRect(container, { left: 0, top: 0, width: 100, height: 100 });
    const pt = screenToCanvasPoint(view, 25, 50);
    expect(pt).toEqual({ x: 25, y: 50 });
  });

  it('applies inverse transform with scale and translate', () => {
    // Real Obsidian canvas DOM: transform lives on the inner `.canvas`
    // element, while the viewport stays untransformed.
    const container = document.createElement('div');
    const viewport = document.createElement('div');
    viewport.className = 'canvas-viewport';
    const canvasEl = document.createElement('div');
    canvasEl.className = 'canvas';
    viewport.appendChild(canvasEl);
    container.appendChild(viewport);
    document.body.appendChild(container);
    setRect(viewport, { left: 100, top: 50, width: 800, height: 600 });
    setTransform(canvasEl, 'matrix(2, 0, 0, 2, 10, 20)');

    const view = { containerEl: container } as unknown as CanvasLikeView;
    // clientX=100 + 10 + 2*x  => x = (100 - 100 - 10) / 2 = -5
    // clientY=50  + 20 + 2*y  => y = (50  - 50  - 20) / 2 = -10
    expect(screenToCanvasPoint(view, 100, 50)).toEqual({ x: -5, y: -10 });
    // clientX=210, clientY=170 => x=(210-100-10)/2=50, y=(170-50-20)/2=50
    expect(screenToCanvasPoint(view, 210, 170)).toEqual({ x: 50, y: 50 });
  });

  it('ignores the transform carrier’s own bounding rect (zoomed-out canvas)', () => {
    // Regression: the old code read getBoundingClientRect() from the
    // TRANSFORMED element, double-counting the pan/zoom and producing
    // garbage coordinates — blank clicks then "hit" phantom nodes.
    const container = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-wrapper';
    const canvasEl = document.createElement('div');
    canvasEl.className = 'canvas';
    wrapper.appendChild(canvasEl);
    container.appendChild(wrapper);
    document.body.appendChild(container);
    setRect(wrapper, { left: 0, top: 0, width: 1000, height: 800 });
    // The transformed element's rect reflects the visual (already
    // transformed) box — the conversion must not use it.
    setRect(canvasEl, { left: 120, top: 60, width: 500, height: 400 });
    setTransform(canvasEl, 'matrix(0.5, 0, 0, 0.5, 120, 60)');

    const view = { containerEl: container } as unknown as CanvasLikeView;
    // x = (220 - 0 - 120) / 0.5 = 200 ; y = (160 - 0 - 60) / 0.5 = 200
    expect(screenToCanvasPoint(view, 220, 160)).toEqual({ x: 200, y: 200 });
  });

  it('never mistakes a positioned node’s transform for the zoom transform', () => {
    // Canvas at rest (`.canvas` has no transform) while node elements use
    // transforms for their own positioning — identity math must win.
    const container = document.createElement('div');
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-wrapper';
    const canvasEl = document.createElement('div');
    canvasEl.className = 'canvas';
    const node = document.createElement('div');
    node.className = 'canvas-node';
    canvasEl.appendChild(node);
    wrapper.appendChild(canvasEl);
    container.appendChild(wrapper);
    document.body.appendChild(container);
    setRect(wrapper, { left: 100, top: 50, width: 800, height: 600 });
    setTransform(node, 'matrix(1, 0, 0, 1, 300, 200)');

    const view = { containerEl: container } as unknown as CanvasLikeView;
    expect(screenToCanvasPoint(view, 150, 90)).toEqual({ x: 50, y: 40 });
  });
});

describe('findNodeIdAtPoint', () => {
  it('returns null when no canvas node under point', () => {
    expect(findNodeIdAtPoint(0, 0)).toBeNull();
  });

  it('finds id via data-node-id', () => {
    const node = document.createElement('div');
    node.className = 'canvas-node';
    node.setAttribute('data-node-id', 'abc123');
    document.body.appendChild(node);
    // Stub elementsFromPoint to return the node we care about.
    (document as any).elementsFromPoint = () => [node];
    expect(findNodeIdAtPoint(10, 10)).toBe('abc123');
  });

  it('finds id via data-id fallback', () => {
    const node = document.createElement('div');
    node.className = 'canvas-card';
    node.setAttribute('data-id', 'fallback-id');
    document.body.appendChild(node);
    (document as any).elementsFromPoint = () => [node];
    expect(findNodeIdAtPoint(10, 10)).toBe('fallback-id');
  });

  it('walks up to canvas-node ancestor', () => {
    const node = document.createElement('div');
    node.className = 'canvas-node';
    node.setAttribute('data-node-id', 'parent-id');
    const child = document.createElement('span');
    node.appendChild(child);
    document.body.appendChild(node);
    (document as any).elementsFromPoint = () => [child, node];
    expect(findNodeIdAtPoint(10, 10)).toBe('parent-id');
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { readCanvasData, getCanvasNodeById, hitTestNodeAt } from '../../../src/utils/canvas-data';
import type { CanvasLikeView } from '../../../src/types';

const originalGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = ((el: Element) => {
  const real = originalGCS(el);
  return new Proxy(real, {
    get(target, prop, recv) {
      if (prop === 'transform') return 'none';
      if (prop === 'position') return 'static';
      return Reflect.get(target, prop, recv);
    },
  }) as CSSStyleDeclaration;
}) as typeof window.getComputedStyle;

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeView(opts: { containerEl?: HTMLElement; canvas?: any; file?: TFile } = {}): CanvasLikeView {
  const containerEl = opts.containerEl ?? document.createElement('div');
  return {
    containerEl,
    canvas: opts.canvas,
    file: opts.file,
  } as unknown as CanvasLikeView;
}

describe('readCanvasData', () => {
  it('prefers in-memory canvas.getData() when valid', async () => {
    const data = { nodes: [{ id: 'n1', type: 'text', text: 'hi' }], edges: [] };
    const view = makeView({ canvas: { getData: () => data } });
    const result = await readCanvasData(new App(), view);
    expect(result).toEqual(data);
  });

  it('falls back to vault.read when getData missing', async () => {
    const app = new App();
    const file = new (TFile as any)('board.canvas') as TFile;
    (app.vault as any).__seed('board.canvas', JSON.stringify({ nodes: [{ id: 'n1' }], edges: [] }));
    const view = makeView({ file });
    const result = await readCanvasData(app, view);
    expect(result?.nodes).toEqual([{ id: 'n1' }]);
  });

  it('returns null when getData yields invalid shape and no file', async () => {
    const view = makeView({ canvas: { getData: () => ({ wrong: true }) } });
    const result = await readCanvasData(new App(), view);
    expect(result).toBeNull();
  });

  it('returns null when vault.read throws', async () => {
    const app = new App();
    const file = new (TFile as any)('missing.canvas') as TFile;
    // Not seeded, getAbstractFileByPath returns null but we still pass file directly.
    (app.vault.read as any).mockImplementationOnce(async () => { throw new Error('nope'); });
    const view = makeView({ file });
    const result = await readCanvasData(app, view);
    expect(result).toBeNull();
  });
});

describe('getCanvasNodeById', () => {
  it('returns the node when present', async () => {
    const data = { nodes: [{ id: 'a', type: 'text' }, { id: 'b', type: 'file', file: 'x.md' }], edges: [] };
    const view = makeView({ canvas: { getData: () => data } });
    const node = await getCanvasNodeById(new App(), view, 'b');
    expect(node).toEqual({ id: 'b', type: 'file', file: 'x.md' });
  });

  it('returns null when node id not in data', async () => {
    const view = makeView({ canvas: { getData: () => ({ nodes: [], edges: [] }) } });
    expect(await getCanvasNodeById(new App(), view, 'missing')).toBeNull();
  });

  it('returns null when no data is available', async () => {
    const view = makeView();
    expect(await getCanvasNodeById(new App(), view, 'x')).toBeNull();
  });
});

describe('hitTestNodeAt', () => {
  function setupView(nodes: any[]): CanvasLikeView {
    const containerEl = document.createElement('div');
    document.body.appendChild(containerEl);
    // Ensure screenToCanvasPoint maps client coords 1:1 to canvas coords.
    (containerEl as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) });
    return makeView({ containerEl, canvas: { getData: () => ({ nodes, edges: [] }) } });
  }

  it('hits a node using top-left x/y/width/height bounds', async () => {
    // Note: hitTestNodeAt also accepts a center-origin interpretation as
    // a fallback, so we pick a coordinate well outside both bounding boxes.
    const view = setupView([{ id: 'n1', type: 'text', x: 10, y: 20, width: 100, height: 50 }]);
    expect(await hitTestNodeAt(new App(), view, 50, 40)).toBe('n1');
    expect(await hitTestNodeAt(new App(), view, 500, 500)).toBeNull();
  });

  it('iterates from end so top-most node wins on overlap', async () => {
    const view = setupView([
      { id: 'bottom', type: 'text', x: 0, y: 0, width: 100, height: 100 },
      { id: 'top',    type: 'text', x: 0, y: 0, width: 100, height: 100 },
    ]);
    expect(await hitTestNodeAt(new App(), view, 10, 10)).toBe('top');
  });

  it('hits a node using pos/size object form', async () => {
    const view = setupView([{ id: 'p', type: 'text', pos: { x: 100, y: 200 }, size: { w: 50, h: 60 } }]);
    expect(await hitTestNodeAt(new App(), view, 120, 220)).toBe('p');
  });

  it('hits a node using pos/size array form', async () => {
    const view = setupView([{ id: 'arr', type: 'text', pos: [10, 10], size: [40, 40] }]);
    expect(await hitTestNodeAt(new App(), view, 20, 20)).toBe('arr');
    expect(await hitTestNodeAt(new App(), view, 100, 100)).toBeNull();
  });

  it('returns null when data unavailable', async () => {
    const view = makeView();
    expect(await hitTestNodeAt(new App(), view, 0, 0)).toBeNull();
  });
});

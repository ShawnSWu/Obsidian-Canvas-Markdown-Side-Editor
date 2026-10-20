// Regression: reattaching to a Canvas must not leave stale/duplicate DOM listeners.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import CanvasMdSideEditorPlugin from '../../src/main';
import type { CanvasLikeView } from '../../src/types';

function makeCanvasView(containerEl: HTMLElement): CanvasLikeView {
  return {
    containerEl,
    contentEl: containerEl,
    canvas: { getData: () => ({ nodes: [], edges: [] }), requestSave: () => {}, updateNode: () => {} },
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
}

async function makePlugin() {
  const plugin = new CanvasMdSideEditorPlugin(new App(), { id: 'test', version: '0.0.0' } as any);
  await plugin.onload();
  plugin.settings.viewMode = 'preview';
  return plugin;
}

function click(el: HTMLElement) {
  const opts = { bubbles: true, button: 0, clientX: 5, clientY: 5 } as any;
  el.dispatchEvent(new (window as any).PointerEvent('pointerdown', opts));
  el.dispatchEvent(new (window as any).PointerEvent('pointerup', opts));
}

const flush = () => new Promise((r) => setTimeout(r, 600));

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('canvas listener lifecycle', () => {
  it('repeated attach registers handlers only once', async () => {
    const plugin = await makePlugin();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    const add = vi.spyOn(container, 'addEventListener');
    const remove = vi.spyOn(container, 'removeEventListener');

    await (plugin as any).attachToCanvas(view);
    const first = add.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).attachToCanvas(view);

    // each re-attach removes every listener it previously added, with matching capture flag
    expect(remove.mock.calls.length).toBe(first * 2);
    for (const [type, fn, cap] of remove.mock.calls) {
      const match = add.mock.calls.find((c) => c[0] === type && c[1] === fn);
      expect(match).toBeTruthy();
      const addCap = typeof match![2] === 'boolean' ? match![2] : !!(match![2] as any)?.capture;
      expect(cap).toBe(addCap);
    }
  });

  it('click after repeated attach opens a card once; old view is inert after reattach', async () => {
    const plugin = await makePlugin();
    const spy = vi.spyOn(plugin as any, 'openEditorForNode').mockResolvedValue(undefined);
    vi.spyOn(plugin as any, 'isOnCanvasView').mockReturnValue(true);

    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    document.body.append(c1, c2);
    const card1 = document.createElement('div');
    card1.setAttribute('data-node-id', 'n1');
    c1.appendChild(card1);
    const card2 = document.createElement('div');
    card2.setAttribute('data-node-id', 'n1');
    c2.appendChild(card2);
    const v1 = makeCanvasView(c1);
    const v2 = makeCanvasView(c2);
    const node = { id: 'n1', type: 'text', text: 'x' };
    for (const v of [v1, v2]) {
      (v.canvas as any).getData = () => ({ nodes: [node], edges: [] });
      (v.canvas as any).selection = new Set([{ id: 'n1' }]);
    }

    await (plugin as any).attachToCanvas(v1);
    await (plugin as any).attachToCanvas(v1);
    await (plugin as any).attachToCanvas(v1);
    click(card1);
    await flush();
    expect(spy.mock.calls.length).toBe(1);
    const afterV1 = spy.mock.calls.length;

    await (plugin as any).attachToCanvas(v2);
    click(card1);
    await flush();
    expect(spy.mock.calls.length).toBe(afterV1); // stale view listeners removed

    click(card2);
    await flush();
    expect(spy.mock.calls.length).toBe(afterV1 + 1);
    for (const call of spy.mock.calls) expect([v1, v2]).toContain(call[0]);
    expect(spy.mock.calls.slice(afterV1).every((c) => c[0] === v2)).toBe(true);
  });
});

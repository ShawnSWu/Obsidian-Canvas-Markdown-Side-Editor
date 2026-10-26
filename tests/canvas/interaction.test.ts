import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { CanvasInteraction, type InteractionDelegate } from '../../src/canvas/interaction';
import type { CanvasLikeView } from '../../src/types';

// End-to-end-ish coverage of the pointer routing: a blank single click must
// close the panel (saveAndClose), a click on a card must open it — even
// while Canvas's selection still holds a stale id.

const NODE = { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'hello' };

function makeView(opts?: { selection?: unknown }) {
  const containerEl = document.createElement('div');
  const wrapper = document.createElement('div');
  wrapper.className = 'canvas-wrapper';
  const canvasEl = document.createElement('div');
  canvasEl.className = 'canvas';
  wrapper.appendChild(canvasEl);
  containerEl.appendChild(wrapper);
  document.body.appendChild(containerEl);
  // Untransformed viewport at the origin → client coords map 1:1 to canvas coords.
  (wrapper as any).getBoundingClientRect = () => ({
    left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}),
  });
  const canvas = {
    getData: () => ({ nodes: [NODE], edges: [] }),
    getSelection: () => opts?.selection ?? [],
  };
  const view = {
    containerEl,
    canvas,
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
  return { view, wrapper };
}

function makeDelegate() {
  const panelEl = document.createElement('div');
  document.body.appendChild(panelEl);
  const delegate: InteractionDelegate = {
    getPanelEl: () => panelEl,
    getOpenNodeId: () => null,
    save: vi.fn(async () => {}),
    saveAndClose: vi.fn(async () => {}),
    openNode: vi.fn(async () => {}),
  };
  return { delegate, panelEl };
}

function pointer(el: Element, type: string, x: number, y: number) {
  el.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }));
}

async function settle(ms = 0) {
  await new Promise((r) => setTimeout(r, ms));
}

describe('CanvasInteraction pointer routing', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    (document as any).elementsFromPoint = () => [];
  });

  it('blank click closes the panel even when selection still holds the open card', async () => {
    // Regression: the previously open card can linger in Canvas's selection
    // during a background click; it must not be mistaken for the click target.
    const { view, wrapper } = makeView({ selection: [NODE] });
    const { delegate } = makeDelegate();
    const interaction = new CanvasInteraction(new App(), delegate);
    interaction.attach(view);

    pointer(wrapper, 'pointerdown', 500, 500);
    await settle(50); // let the post-pointerdown selection re-check run
    pointer(wrapper, 'pointerup', 500, 500);
    await settle(10);

    expect(delegate.openNode).not.toHaveBeenCalled();
    expect(delegate.saveAndClose).toHaveBeenCalledTimes(1);
    interaction.detach();
  });

  it('clicking a card opens it via geometric hit test', async () => {
    const { view, wrapper } = makeView();
    const { delegate } = makeDelegate();
    const interaction = new CanvasInteraction(new App(), delegate);
    interaction.attach(view);

    pointer(wrapper, 'pointerdown', 50, 40);
    pointer(wrapper, 'pointerup', 50, 40);
    await settle(10);

    expect(delegate.openNode).toHaveBeenCalledTimes(1);
    expect((delegate.openNode as any).mock.calls[0][1]).toMatchObject({ id: 'n1' });
    expect(delegate.saveAndClose).not.toHaveBeenCalled();
    interaction.detach();
  });

  it('drag (movement beyond tolerance) neither opens nor closes', async () => {
    const { view, wrapper } = makeView();
    const { delegate } = makeDelegate();
    const interaction = new CanvasInteraction(new App(), delegate);
    interaction.attach(view);

    pointer(wrapper, 'pointerdown', 50, 40);
    pointer(wrapper, 'pointermove', 80, 70);
    pointer(wrapper, 'pointerup', 80, 70);
    await settle(10);

    expect(delegate.openNode).not.toHaveBeenCalled();
    expect(delegate.saveAndClose).not.toHaveBeenCalled();
    interaction.detach();
  });
});

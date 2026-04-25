// Integration test for issue #11 — dock position live refresh.
//
// Asserts that calling plugin.applyDockPosition() updates the open panel's
// dock class without rebuilding it. This is the path the settings tab uses
// when the user changes the dropdown.

import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import CanvasMdSideEditorPlugin from '../../src/main';
import type { CanvasNode, CanvasLikeView } from '../../src/types';

const originalGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = ((el: Element) => {
  const real = originalGCS(el);
  return new Proxy(real, {
    get(target, prop, recv) {
      if (prop === 'position') return 'relative';
      if (prop === 'transform') return 'none';
      if (prop === 'fontSize') return '16px';
      return Reflect.get(target, prop, recv);
    },
  }) as CSSStyleDeclaration;
}) as typeof window.getComputedStyle;

function makeCanvasView(containerEl: HTMLElement): CanvasLikeView {
  return {
    containerEl,
    contentEl: containerEl,
    canvas: { getData: () => ({ nodes: [], edges: [] }), requestSave: () => {} },
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
}

async function makePlugin(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
  await plugin.onload();
  plugin.settings.readOnly = true; // skip CodeMirror
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('issue #11 — dock position live refresh', () => {
  it('opening with dockPosition=right applies cmside-dock-right', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    plugin.settings.dockPosition = 'right';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'text', text: 'x' } as CanvasNode);

    const panel = (plugin as any).panelEl as HTMLElement;
    expect(panel.classList.contains('cmside-dock-right')).toBe(true);
  });

  it('applyDockPosition swaps the dock class on an open panel', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    plugin.settings.dockPosition = 'right';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'text', text: 'x' } as CanvasNode);
    const panel = (plugin as any).panelEl as HTMLElement;
    expect(panel.classList.contains('cmside-dock-right')).toBe(true);

    plugin.settings.dockPosition = 'bottom';
    plugin.applyDockPosition();

    expect(panel.classList.contains('cmside-dock-bottom')).toBe(true);
    expect(panel.classList.contains('cmside-dock-right')).toBe(false);
  });

  it('opening with dockPosition=top applies the height preset', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    plugin.settings.dockPosition = 'top';
    plugin.settings.defaultPanelHeight = 360;

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'text', text: 'x' } as CanvasNode);

    const panel = (plugin as any).panelEl as HTMLElement;
    expect(panel.classList.contains('cmside-dock-top')).toBe(true);
    expect(panel.classList.contains('cmside-height-h360')).toBe(true);
    expect(panel.className).not.toMatch(/cmside-width-w/);
  });
});

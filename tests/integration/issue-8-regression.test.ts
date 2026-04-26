// Regression test for GitHub issue #8:
// "Panel fails to reopen after switching views"
//
// Repro: open Canvas, use side editor, switch to a text note, switch back,
// click a card -> panel does not appear.
//
// Hypothesised root cause: this.panelEl is only cleared in teardownPanel()
// (called from onunload), so after Obsidian destroys/recreates the Canvas
// view's containerEl, panelEl is left orphaned. ensurePanel() early-returns
// because panelEl is non-null, and openEditorForNode adds 'open' class to a
// detached node => invisible.
//
// This test asserts the user-visible contract: after leaving Canvas and
// returning, opening a node should result in a panel mounted under the
// CURRENT canvas containerEl. It is expected to FAIL on the buggy code and
// PASS once the fix lands.

import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import CanvasMdSideEditorPlugin from '../../src/main';
import type { CanvasNode, CanvasLikeView } from '../../src/types';

// Make getBoundingClientRect / getComputedStyle predictable enough for happy-dom.
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
  const canvasObj: any = {
    getData: () => ({ nodes: [], edges: [] }),
    requestSave: () => {},
    updateNode: () => {},
  };
  const view: any = {
    containerEl,
    contentEl: containerEl,
    canvas: canvasObj,
    getViewType: () => 'canvas',
  };
  return view as CanvasLikeView;
}

function makeTextNode(id: string, text: string): CanvasNode {
  return { id, type: 'text', text } as CanvasNode;
}

async function makePlugin(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
  // Ensure read-only path so CodeMirror is not instantiated (keeps test light).
  await plugin.onload();
  plugin.settings.readOnly = true;
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('issue #8: panel reopens after switching views', () => {
  it('panel mounts under the current canvas container after a leaf round-trip', async () => {
    const app = new App();
    const plugin = await makePlugin(app);

    // --- 1. Initial canvas view, attach + open panel for a node ---
    const oldContainer = document.createElement('div');
    oldContainer.id = 'old-canvas-container';
    document.body.appendChild(oldContainer);
    const oldView = makeCanvasView(oldContainer);

    await (plugin as any).attachToCanvas(oldView);
    await (plugin as any).openEditorForNode(oldView, makeTextNode('node-1', 'hello'));

    // Sanity: panel exists and is mounted under the original container.
    const firstPanel = (plugin as any).panelEl as HTMLElement | null;
    expect(firstPanel).toBeTruthy();
    expect(firstPanel!.parentElement).toBe(oldContainer);
    expect(firstPanel!.isConnected).toBe(true);

    // --- 2. User navigates away from Canvas ---
    // Simulate Obsidian destroying the previous view: detach & remove the container.
    oldContainer.remove();
    expect(firstPanel!.isConnected).toBe(false); // panel is now orphaned

    // --- 3. User navigates back to Canvas; Obsidian provides a fresh containerEl ---
    const newContainer = document.createElement('div');
    newContainer.id = 'new-canvas-container';
    document.body.appendChild(newContainer);
    const newView = makeCanvasView(newContainer);

    // attach() in onload would call this on active-leaf-change.
    await (plugin as any).attachToCanvas(newView);

    // --- 4. User clicks a card again -> open panel ---
    await (plugin as any).openEditorForNode(newView, makeTextNode('node-1', 'hello again'));

    // --- 5. The panel must now be mounted under the NEW container ---
    const currentPanel = (plugin as any).panelEl as HTMLElement | null;
    expect(currentPanel).toBeTruthy();
    expect(currentPanel!.isConnected).toBe(true);
    expect(currentPanel!.parentElement).toBe(newContainer);
  });

  it('after leaving canvas, the orphaned panel state is reset on return', async () => {
    const app = new App();
    const plugin = await makePlugin(app);

    const oldContainer = document.createElement('div');
    document.body.appendChild(oldContainer);
    const oldView = makeCanvasView(oldContainer);
    await (plugin as any).attachToCanvas(oldView);
    await (plugin as any).openEditorForNode(oldView, makeTextNode('node-A', 'A'));

    // Leave canvas
    oldContainer.remove();

    // Return with new view
    const newContainer = document.createElement('div');
    document.body.appendChild(newContainer);
    const newView = makeCanvasView(newContainer);
    await (plugin as any).attachToCanvas(newView);

    // The plugin must NOT still hold a reference to a detached panel after
    // re-attach; it should either be cleared or be re-created under the new
    // container. We accept either, but it must not be stuck pointing at the
    // detached element.
    const panelAfterReattach = (plugin as any).panelEl as HTMLElement | null;
    if (panelAfterReattach) {
      expect(panelAfterReattach.isConnected).toBe(true);
      expect(panelAfterReattach.parentElement).toBe(newContainer);
    } else {
      // Acceptable: state cleared, will be rebuilt on next openEditorForNode.
      expect(panelAfterReattach).toBeNull();
    }
  });
});

// Regression test for the "editor blank after view-mode toggle" bug.
//
// Symptom (manual repro): user toggles the side panel view mode randomly;
// the editor pane occasionally appears blank.
//
// Root cause: cmView is intentionally disposed inside openEditorForNode when
// it runs in preview mode (main.ts ~L701), to prevent saveCurrentEdits from
// dumping a previous card's content into a different node. setViewMode only
// flips a CSS data-attribute — it never recreates cmView. So after the
// dispose path runs, toggling preview → editor/both leaves the editor pane
// visible without any CodeMirror inside.
//
// This test asserts the user-visible contract: after a card is open and the
// user toggles back to a non-preview view mode, the editor must have a live
// CodeMirror instance.

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
  const canvasObj: any = {
    getData: () => ({ nodes: [], edges: [] }),
    requestSave: () => {},
    updateNode: () => {},
  };
  return {
    containerEl,
    contentEl: containerEl,
    canvas: canvasObj,
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
}

async function makePluginInBothMode(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
  await plugin.onload();
  plugin.settings.viewMode = 'both';
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('view-mode toggle leaves editor pane non-blank', () => {
  it('rebuilds cmView when toggling out of preview after dispose path ran', async () => {
    const app = new App();
    const plugin = await makePluginInBothMode(app);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);

    const node: CanvasNode = { id: 'n1', type: 'text', text: 'hello world' } as CanvasNode;

    // 1. Open card in 'both' — cmView created.
    await (plugin as any).openEditorForNode(view, node);
    expect((plugin as any).cmView).toBeTruthy();

    // 2. Toggle to preview, re-open the card → dispose path fires.
    await plugin.setViewMode('preview');
    await (plugin as any).openEditorForNode(view, node);
    expect((plugin as any).cmView).toBeNull();

    // 3. Toggle back to 'both' — cmView must be rebuilt, otherwise
    //    the editor pane becomes visible-but-blank.
    await plugin.setViewMode('both');
    expect((plugin as any).cmView).toBeTruthy();
  });

  it('rebuilds cmView when toggling out of preview where card was first opened in preview', async () => {
    const app = new App();
    const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
    await plugin.onload();
    // Simulate persisted setting from a prior session.
    plugin.settings.viewMode = 'preview';

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);

    const node: CanvasNode = { id: 'n1', type: 'text', text: 'hello' } as CanvasNode;

    // 1. Open card while already in preview — cmView never created.
    await (plugin as any).openEditorForNode(view, node);
    expect((plugin as any).cmView).toBeNull();

    // 2. Toggle to 'editor' — cmView must be rebuilt.
    await plugin.setViewMode('editor');
    expect((plugin as any).cmView).toBeTruthy();
  });

  it('does not rebuild cmView when toggling without an open card', async () => {
    const app = new App();
    const plugin = await makePluginInBothMode(app);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);

    // No card opened. Toggle around — cmView should stay null because
    // there is nothing to rebuild for.
    await plugin.setViewMode('preview');
    await plugin.setViewMode('both');
    expect((plugin as any).cmView).toBeNull();
  });
});

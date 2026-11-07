// Regression test for the "editor blank after view-mode toggle" bug.
//
// Symptom (manual repro): user toggles the side panel view mode randomly;
// the editor pane occasionally appears blank.
//
// Root cause: cmView is intentionally disposed inside openEditorForNode when
// it runs in preview mode (main.ts ~L701), to prevent saveCurrentEdits from
// dumping a previous card's content into a different node. setViewMode only
// flips a CSS data-attribute — it never recreates cmView. So after the
// dispose path runs, toggling preview → editor leaves the editor pane
// visible without any CodeMirror inside.
//
// This test asserts the user-visible contract: after a card is open and the
// user toggles back to a non-preview view mode, the editor must have a live
// CodeMirror instance.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { __notices } from '../__mocks__/obsidian';
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

async function makePluginInEditorMode(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
  await plugin.onload();
  plugin.settings.viewMode = 'editor';
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = '';
  __notices.length = 0;
});

describe('view-mode toggle leaves editor pane non-blank', () => {
  it('rebuilds cmView when toggling out of preview after dispose path ran', async () => {
    const app = new App();
    const plugin = await makePluginInEditorMode(app);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);

    const node: CanvasNode = { id: 'n1', type: 'text', text: 'hello world' } as CanvasNode;

    // 1. Open card in 'editor' — cmView created.
    await (plugin as any).openEditorForNode(view, node);
    expect((plugin as any).cmView).toBeTruthy();

    // 2. Toggle to preview, re-open the card → dispose path fires.
    await plugin.setViewMode('preview');
    await (plugin as any).openEditorForNode(view, node);
    expect((plugin as any).cmView).toBeNull();

    // 3. Toggle back to 'editor' — cmView must be rebuilt, otherwise
    //    the editor pane becomes visible-but-blank.
    await plugin.setViewMode('editor');
    expect((plugin as any).cmView).toBeTruthy();
  });

  describe('Live Preview notice for text cards', () => {
    const notice = 'Obsidian’s native Live Preview editor is available only for Markdown file cards. Text cards use the basic editor instead.';
    const node: CanvasNode = { id: 'n1', type: 'text', text: 'hello world' };

    it('does not show the notice when opening a text card in Live Preview', async () => {
      const app = new App();
      const plugin = await makePluginInEditorMode(app);
      plugin.settings.viewMode = 'live';
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = makeCanvasView(container);
      await (plugin as any).attachToCanvas(view);

      await (plugin as any).openEditorForNode(view, node);

      expect(__notices).toEqual([]);
      expect((plugin as any).cmView.state.doc.toString()).toBe('hello world');
      plugin.onunload();
    });

    it('rebuilds the basic editor and shows the notice when switching from Preview to Live Preview', async () => {
      const plugin = await makePluginInEditorMode(new App());
      plugin.settings.viewMode = 'preview';
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = makeCanvasView(container);
      await (plugin as any).attachToCanvas(view);
      await (plugin as any).openEditorForNode(view, node);
      expect(__notices).toEqual([]);
      expect((plugin as any).cmView).toBeNull();

      await plugin.setViewMode('live');

      expect(__notices).toEqual([notice]);
      expect((plugin as any).cmView.state.doc.toString()).toBe('hello world');
      plugin.onunload();
    });

    it('shows the notice when switching an open text card to Live Preview, but not when reselecting it', async () => {
      const plugin = await makePluginInEditorMode(new App());
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = makeCanvasView(container);
      await (plugin as any).attachToCanvas(view);
      await (plugin as any).openEditorForNode(view, node);
      expect(__notices).toEqual([]);

      await plugin.setViewMode('preview');
      await plugin.setViewMode('editor');
      expect(__notices).toEqual([]);
      await plugin.setViewMode('live');
      await plugin.setViewMode('live');

      expect(__notices).toEqual([notice]);
      expect((plugin as any).cmView.state.doc.toString()).toBe('hello world');
      plugin.onunload();
    });

    it('shows the notice when the toolbar cycles from Editor to Live Preview', async () => {
      const plugin = await makePluginInEditorMode(new App());
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = makeCanvasView(container);
      await (plugin as any).attachToCanvas(view);
      await (plugin as any).openEditorForNode(view, node);
      const button = container.querySelector<HTMLButtonElement>('.cmside-toggle-preview-btn');
      expect(button).not.toBeNull();

      button!.click();

      await vi.waitFor(() => expect(__notices).toEqual([notice]));
      expect(plugin.settings.viewMode).toBe('live');
      plugin.onunload();
    });

    it('does not show the notice for a file card or when no card is open', async () => {
      const app = new App();
      (app.vault as any).__seed('notes/example.md', 'content');
      const plugin = await makePluginInEditorMode(app);
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = makeCanvasView(container);
      await (plugin as any).attachToCanvas(view);
      await plugin.setViewMode('live');
      expect(__notices).toEqual([]);
      await plugin.setViewMode('editor');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});
      await (plugin as any).openEditorForNode(view, { id: 'f1', type: 'file', file: 'notes/example.md' });
      await plugin.setViewMode('live');
      expect(__notices).toEqual([]);
      error.mockRestore();
      plugin.onunload();
    });

    it('does not show the notice after the panel is closed', async () => {
      const plugin = await makePluginInEditorMode(new App());
      const container = document.createElement('div');
      document.body.appendChild(container);
      const view = makeCanvasView(container);
      await (plugin as any).attachToCanvas(view);
      await (plugin as any).openEditorForNode(view, node);
      (plugin as any).session.close();

      await plugin.setViewMode('live');

      expect(__notices).toEqual([]);
      plugin.onunload();
    });
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
    const plugin = await makePluginInEditorMode(app);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);

    // No card opened. Toggle around — cmView should stay null because
    // there is nothing to rebuild for.
    await plugin.setViewMode('preview');
    await plugin.setViewMode('editor');
    expect((plugin as any).cmView).toBeNull();
  });
});

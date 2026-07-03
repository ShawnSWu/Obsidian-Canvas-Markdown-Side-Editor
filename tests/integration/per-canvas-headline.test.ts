// Integration tests for the canvas style suite — per-canvas headline mode.
//
// Headline mode used to be a body-level class covering every canvas at once.
// Now each canvas view's containerEl carries `cmside-headline-mode` based on
// resolveHeadline(global default, per-canvas override), so two canvases in a
// split view can disagree.

import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import CanvasMdSideEditorPlugin from '../../src/main';
import type { CanvasLikeView } from '../../src/types';

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

function makeCanvasView(path: string): CanvasLikeView {
  const containerEl = document.createElement('div');
  document.body.appendChild(containerEl);
  return {
    containerEl,
    contentEl: containerEl,
    file: { path },
    canvas: { getData: () => ({ nodes: [], edges: [] }), requestSave: () => {} },
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
}

async function makePlugin(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
  await plugin.onload();
  plugin.settings.viewMode = 'preview'; // skip CodeMirror
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('per-canvas headline mode', () => {
  it('override wins over the global default, per canvas', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const b = makeCanvasView('B.canvas');
    app.workspace.leaves = [{ view: a }, { view: b }];

    plugin.settings.headlineMode = false;
    plugin.settings.canvasStyles = { 'A.canvas': { headline: 'on' } };
    plugin.applyHeadlineMode();

    expect(a.containerEl.classList.contains('cmside-headline-mode')).toBe(true);
    expect(b.containerEl.classList.contains('cmside-headline-mode')).toBe(false);
    // the legacy body-level class must never come back
    expect(document.body.classList.contains('cmside-headline-mode')).toBe(false);
  });

  it('global on + per-canvas off leaves that canvas plain', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    app.workspace.leaves = [{ view: a }];

    plugin.settings.headlineMode = true;
    plugin.settings.canvasStyles = { 'A.canvas': { headline: 'off' } };
    plugin.applyHeadlineMode();

    expect(a.containerEl.classList.contains('cmside-headline-mode')).toBe(false);
  });

  it('toggleHeadlineForActiveCanvas flips the active canvas and persists an override', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    plugin.settings.headlineMode = false;
    plugin.toggleHeadlineForActiveCanvas();

    expect(plugin.settings.canvasStyles?.['A.canvas']?.headline).toBe('on');
    expect(a.containerEl.classList.contains('cmside-headline-mode')).toBe(true);
    expect(plugin.saveData).toHaveBeenCalled();

    plugin.toggleHeadlineForActiveCanvas();
    expect(plugin.settings.canvasStyles?.['A.canvas']?.headline).toBe('off');
    expect(a.containerEl.classList.contains('cmside-headline-mode')).toBe(false);
  });

  it('resetHeadlineOverrideForActiveCanvas returns the canvas to the global default', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    plugin.settings.headlineMode = true;
    plugin.settings.canvasStyles = { 'A.canvas': { headline: 'off' } };
    plugin.resetHeadlineOverrideForActiveCanvas();

    expect(plugin.settings.canvasStyles?.['A.canvas']).toBeUndefined();
    expect(a.containerEl.classList.contains('cmside-headline-mode')).toBe(true);
  });

  it('vault rename remaps the style key; delete prunes it', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    plugin.settings.canvasStyles = { 'old.canvas': { headline: 'on' } };

    app.vault.__emit('rename', { path: 'new.canvas' }, 'old.canvas');
    expect(plugin.settings.canvasStyles['old.canvas']).toBeUndefined();
    expect(plugin.settings.canvasStyles['new.canvas']).toEqual({ headline: 'on' });

    app.vault.__emit('delete', { path: 'new.canvas' });
    expect(plugin.settings.canvasStyles['new.canvas']).toBeUndefined();
  });
});

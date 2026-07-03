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

  it('applyCanvasStyles stamps per-node vars on attach-time nodes', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const n1 = document.createElement('div');
    n1.className = 'canvas-node';
    n1.setAttribute('data-node-id', 'n1');
    const n2 = document.createElement('div');
    n2.className = 'canvas-node';
    n2.setAttribute('data-node-id', 'n2');
    a.containerEl.append(n1, n2);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    plugin.settings.canvasStyles = { 'A.canvas': { nodes: { n1: { h1Size: 40, h1Color: '#ff0000' } } } };
    (plugin as any).applyCanvasStyles(a);

    expect(n1.style.getPropertyValue('--cmside-h1-size')).toBe('40');
    expect(n1.style.getPropertyValue('--cmside-h1-color')).toBe('#ff0000');
    expect(n2.style.getPropertyValue('--cmside-h1-size')).toBe('');
  });

  it('late-mounted canvas nodes get vars via the mutation observer', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    app.workspace.leaves = [{ view: a }];
    plugin.settings.canvasStyles = { 'A.canvas': { nodes: { late: { h1Color: '#00ff00' } } } };

    await (plugin as any).attachToCanvas(a);

    const late = document.createElement('div');
    late.className = 'canvas-node';
    late.setAttribute('data-node-id', 'late');
    a.containerEl.appendChild(late);
    await new Promise((r) => setTimeout(r, 0));

    expect(late.style.getPropertyValue('--cmside-h1-color')).toBe('#00ff00');
  });

  it('canvas:node-menu adds a Headline style item that opens the popover and persists edits', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const n1 = document.createElement('div');
    n1.className = 'canvas-node';
    n1.setAttribute('data-node-id', 'n1');
    a.containerEl.appendChild(n1);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    let clickCb: (() => void) | null = null;
    const item = {
      setTitle: () => item,
      setIcon: () => item,
      onClick: (cb: () => void) => { clickCb = cb; return item; },
    };
    const menu = { addItem: (cb: (i: unknown) => void) => cb(item) };
    app.workspace.__emit('canvas:node-menu', menu, { id: 'n1', nodeEl: n1 });
    expect(clickCb).toBeTruthy();
    clickCb!();

    const popover = document.querySelector('.cmside-style-popover') as HTMLElement;
    expect(popover).toBeTruthy();

    const range = popover.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '44';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(plugin.settings.canvasStyles?.['A.canvas']?.nodes?.n1?.h1Size).toBe(44);
    expect(n1.style.getPropertyValue('--cmside-h1-size')).toBe('44');
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

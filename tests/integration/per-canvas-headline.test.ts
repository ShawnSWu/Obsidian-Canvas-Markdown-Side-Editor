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

  it('applyCanvasStyles stamps node vars via the canvas.nodes map when DOM has no id attributes (real Obsidian)', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    // Real canvas cards carry NO data-node-id / data-id attributes — the id
    // lives only in the internal canvas.nodes Map.
    const n1 = document.createElement('div');
    n1.className = 'canvas-node';
    const n2 = document.createElement('div');
    n2.className = 'canvas-node';
    a.containerEl.append(n1, n2);
    (a.canvas as any).nodes = new Map([
      ['n1', { id: 'n1', nodeEl: n1 }],
      ['n2', { id: 'n2', nodeEl: n2 }],
    ]);
    app.workspace.leaves = [{ view: a }];

    plugin.settings.canvasStyles = { 'A.canvas': { nodes: { n1: { h1Size: 40, h1Color: '#ff0000' } } } };
    (plugin as any).applyCanvasStyles(a);

    expect(n1.style.getPropertyValue('--cmside-h1-size')).toBe('40');
    expect(n1.style.getPropertyValue('--cmside-h1-color')).toBe('#ff0000');
    expect(n2.style.getPropertyValue('--cmside-h1-size')).toBe('');

    // clearing the style removes the stamped vars too
    plugin.settings.canvasStyles = {};
    (plugin as any).applyCanvasStyles(a);
    expect(n1.style.getPropertyValue('--cmside-h1-color')).toBe('');
  });

  it('applyCanvasStyles stamps edge label vars via the canvas.edges map', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const l1 = document.createElement('div');
    const l2 = document.createElement('div');
    (a.canvas as any).edges = new Map([
      ['e1', { labelElement: { wrapperEl: l1 } }],
      ['e2', { labelElement: { wrapperEl: l2 } }],
      ['e3', {}], // unlabeled edge must be skipped
    ]);
    app.workspace.leaves = [{ view: a }];

    plugin.settings.canvasStyles = { 'A.canvas': { edges: { e1: { labelSize: 18, labelColor: '#123456' } } } };
    (plugin as any).applyCanvasStyles(a);

    expect(l1.style.getPropertyValue('--cmside-edge-label-size')).toBe('18px');
    expect(l1.style.getPropertyValue('--cmside-edge-label-color')).toBe('#123456');
    expect(l2.style.getPropertyValue('--cmside-edge-label-size')).toBe('');

    plugin.settings.canvasStyles = {};
    (plugin as any).applyCanvasStyles(a);
    expect(l1.style.getPropertyValue('--cmside-edge-label-size')).toBe('');
  });

  it('canvas:edge-menu adds a Label style item that persists edits', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const label = document.createElement('div');
    (a.canvas as any).edges = new Map([['e1', { id: 'e1', labelElement: { wrapperEl: label } }]]);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    let clickCb: (() => void) | null = null;
    const item = {
      setTitle: () => item,
      setIcon: () => item,
      onClick: (cb: () => void) => { clickCb = cb; return item; },
    };
    const menu = { addItem: (cb: (i: unknown) => void) => cb(item) };
    app.workspace.__emit('canvas:edge-menu', menu, { id: 'e1' });
    expect(clickCb).toBeTruthy();
    clickCb!();

    const popover = document.querySelector('.cmside-style-popover') as HTMLElement;
    expect(popover).toBeTruthy();
    const range = popover.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '20';
    range.dispatchEvent(new Event('input', { bubbles: true }));

    expect(plugin.settings.canvasStyles?.['A.canvas']?.edges?.e1?.labelSize).toBe(20);
    expect(label.style.getPropertyValue('--cmside-edge-label-size')).toBe('20px');
  });

  it('experimental flag installs the edge anchor patch on attach', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', 'M 10,20 C 30,40 50,60 70,80');
    const nativeD = 'M 10,20 C 30,40 50,60 70,80';
    const edge: any = {
      id: 'e1',
      from: { side: 'right', node: { width: 200, height: 100 } },
      to: { side: 'left', node: { width: 200, height: 100 } },
      path: { display: pathEl },
      updatePath: () => { pathEl.setAttribute('d', nativeD); },
    };
    (a.canvas as any).edges = new Map([['e1', edge]]);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    plugin.settings.experimentalEdgeAnchors = true;
    plugin.settings.canvasStyles = { 'A.canvas': { edges: { e1: { fromOffset: 0.75 } } } };
    await (plugin as any).attachToCanvas(a);

    edge.updatePath();
    expect(pathEl.getAttribute('d')).toBe('M 10,45 C 30,40 50,60 70,80');
  });

  it('flag off leaves edge rendering native', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const nativeD = 'M 10,20 C 30,40 50,60 70,80';
    pathEl.setAttribute('d', nativeD);
    const edge: any = {
      id: 'e1',
      from: { side: 'right', node: { width: 200, height: 100 } },
      to: { side: 'left', node: { width: 200, height: 100 } },
      path: { display: pathEl },
      updatePath: () => { pathEl.setAttribute('d', nativeD); },
    };
    (a.canvas as any).edges = new Map([['e1', edge]]);
    app.workspace.leaves = [{ view: a }];

    plugin.settings.experimentalEdgeAnchors = false;
    plugin.settings.canvasStyles = { 'A.canvas': { edges: { e1: { fromOffset: 0.75 } } } };
    await (plugin as any).attachToCanvas(a);

    edge.updatePath();
    expect(pathEl.getAttribute('d')).toBe(nativeD);
  });

  it('canvas:selection-menu adds Label style when exactly one edge is selected', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const label = document.createElement('div');
    const edgeObj = { id: 'e1', from: {}, to: {}, labelElement: { wrapperEl: label } };
    (a.canvas as any).edges = new Map([['e1', edgeObj]]);
    (a.canvas as any).selection = new Set([edgeObj]);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    let clickCb: (() => void) | null = null;
    const item = {
      setTitle: () => item,
      setIcon: () => item,
      setSection: () => item,
      onClick: (cb: () => void) => { clickCb = cb; return item; },
    };
    const menu = { addItem: (cb: (i: unknown) => void) => cb(item) };
    app.workspace.__emit('canvas:selection-menu', menu, a.canvas);
    expect(clickCb).toBeTruthy();
    clickCb!();

    const popover = document.querySelector('.cmside-style-popover') as HTMLElement;
    expect(popover).toBeTruthy();
    const range = popover.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '22';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(plugin.settings.canvasStyles?.['A.canvas']?.edges?.e1?.labelSize).toBe(22);
  });

  it('canvas:selection-menu adds Headline style when exactly one node is selected', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const nodeEl = document.createElement('div');
    nodeEl.className = 'canvas-node';
    a.containerEl.appendChild(nodeEl);
    const nodeObj = { id: 'n1', nodeEl };
    (a.canvas as any).nodes = new Map([['n1', nodeObj]]);
    (a.canvas as any).selection = new Set([nodeObj]);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    let clickCb: (() => void) | null = null;
    const item = {
      setTitle: () => item,
      setIcon: () => item,
      setSection: () => item,
      onClick: (cb: () => void) => { clickCb = cb; return item; },
    };
    const menu = { addItem: (cb: (i: unknown) => void) => cb(item) };
    app.workspace.__emit('canvas:selection-menu', menu, a.canvas);
    expect(clickCb).toBeTruthy();
    clickCb!();

    const popover = document.querySelector('.cmside-style-popover') as HTMLElement;
    expect(popover).toBeTruthy();
    const range = popover.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '33';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(plugin.settings.canvasStyles?.['A.canvas']?.nodes?.n1?.h1Size).toBe(33);
    expect(nodeEl.style.getPropertyValue('--cmside-h1-size')).toBe('33');
  });

  it('canvas:selection-menu ignores multi-selection', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const a = makeCanvasView('A.canvas');
    const n1 = { id: 'n1', nodeEl: document.createElement('div') };
    const n2 = { id: 'n2', nodeEl: document.createElement('div') };
    (a.canvas as any).selection = new Set([n1, n2]);
    app.workspace.leaves = [{ view: a }];
    app.workspace.activeLeaf = { view: a };

    let added = 0;
    const item = { setTitle: () => item, setIcon: () => item, setSection: () => item, onClick: () => item };
    const menu = { addItem: (cb: (i: unknown) => void) => { added++; cb(item); } };
    app.workspace.__emit('canvas:selection-menu', menu, a.canvas);
    expect(added).toBe(0);
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

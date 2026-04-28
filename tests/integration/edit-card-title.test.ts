// Integration tests for issue #10 — editable card title in the side panel.
//
// We exercise the plugin end-to-end (within happy-dom) by opening a node and
// then triggering the title input's commit path, asserting on the resulting
// vault state (file rename) or canvas data write (text first-line patch).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App, TFile } from 'obsidian';
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
    requestSave: vi.fn(),
    updateNode: vi.fn(),
  };
  return {
    containerEl,
    contentEl: containerEl,
    canvas: canvasObj,
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
}

async function makePlugin(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'test', version: '0.0.0' } as any);
  await plugin.onload();
  return plugin;
}

function getTitleInput(): HTMLInputElement | null {
  return document.querySelector('input.cmside-title-input') as HTMLInputElement | null;
}

beforeEach(() => {
  document.body.innerHTML = '';
  __notices.length = 0;
});

describe('issue #10 — file card title', () => {
  it('renders the basename and renames the file on commit', async () => {
    const app = new App();
    (app.vault as any).__seed('notes/foo.md', 'body content');

    const plugin = await makePlugin(app);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);

    const node: CanvasNode = { id: 'n1', type: 'file', file: 'notes/foo.md' };
    await (plugin as any).openEditorForNode(view, node);

    const input = getTitleInput();
    expect(input).toBeTruthy();
    expect(input!.value).toBe('foo');

    // User edits and commits.
    input!.value = 'bar';
    input!.dispatchEvent(new Event('blur'));
    // commitFileRename is async — yield to flush.
    await new Promise((r) => setTimeout(r, 0));

    expect(app.vault.rename).toHaveBeenCalledTimes(1);
    const [renamedFile, newPath] = (app.vault.rename as any).mock.calls[0];
    expect((renamedFile as TFile).path).toBe('notes/bar.md');
    expect(newPath).toBe('notes/bar.md');
    // Node reference updated for subsequent saves.
    expect(node.file).toBe('notes/bar.md');
  });

  it('shows a Notice and skips rename on filename collision', async () => {
    const app = new App();
    (app.vault as any).__seed('notes/foo.md', 'a');
    (app.vault as any).__seed('notes/bar.md', 'b'); // collision target

    const plugin = await makePlugin(app);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'file', file: 'notes/foo.md' });

    const input = getTitleInput()!;
    input.value = 'bar';
    input.dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 0));

    expect(app.vault.rename).not.toHaveBeenCalled();
    expect(__notices).toContain('A file with that name already exists');
  });

  it('shows a Notice and skips rename for an empty filename', async () => {
    const app = new App();
    (app.vault as any).__seed('notes/foo.md', 'a');
    const plugin = await makePlugin(app);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'file', file: 'notes/foo.md' });

    const input = getTitleInput()!;
    input.value = '   ';
    input.dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 0));

    expect(app.vault.rename).not.toHaveBeenCalled();
    expect(__notices.some((n: string) => n.includes('Cannot rename'))).toBe(true);
  });
});

describe('issue #10 — text card title', () => {
  it('renders the first line and rewrites the heading prefix on commit', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    // Mark the canvas view's file so writeNodeContent can use the JSON fallback.
    const canvasFile = new (TFile as any)('board.canvas') as TFile;
    (app.vault as any).__seed('board.canvas', JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', text: '## Heading\nbody' }],
      edges: [],
    }));
    (view as any).file = canvasFile;
    await (plugin as any).attachToCanvas(view);

    const node: CanvasNode = { id: 'n1', type: 'text', text: '## Heading\nbody' };
    await (plugin as any).openEditorForNode(view, node);

    const input = getTitleInput()!;
    expect(input.value).toBe('Heading');

    input.value = 'New title';
    input.dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 0));

    // The cmView should now reflect the patched first line.
    const cmText = (plugin as any).cmView.state.doc.toString();
    expect(cmText).toBe('## New title\nbody');

    // And the in-memory canvas API was asked to persist the new content.
    expect(view.canvas?.updateNode).toHaveBeenCalledWith('n1', { text: '## New title\nbody' });
  });

  it('renders the plain first line and rewrites it on commit when there is no heading', async () => {
    const app = new App();
    const plugin = await makePlugin(app);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    const canvasFile = new (TFile as any)('board.canvas') as TFile;
    (app.vault as any).__seed('board.canvas', JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', text: 'first line\nsecond' }],
      edges: [],
    }));
    (view as any).file = canvasFile;
    await (plugin as any).attachToCanvas(view);

    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'text', text: 'first line\nsecond' });

    const input = getTitleInput()!;
    expect(input.value).toBe('first line');

    input.value = 'replaced';
    input.dispatchEvent(new Event('blur'));
    await new Promise((r) => setTimeout(r, 0));

    expect((plugin as any).cmView.state.doc.toString()).toBe('replaced\nsecond');
  });
});


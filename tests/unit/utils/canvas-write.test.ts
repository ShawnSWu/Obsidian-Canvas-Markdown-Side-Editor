import { describe, it, expect, vi } from 'vitest';
import { App, TFile } from 'obsidian';
import { writeNodeContent } from '../../../src/utils/canvas-write';
import type { CanvasLikeView, CanvasNode } from '../../../src/types';

function makeView(opts: { canvas?: any; file?: TFile } = {}): CanvasLikeView {
  return { containerEl: document.createElement('div'), canvas: opts.canvas, file: opts.file } as unknown as CanvasLikeView;
}

describe('writeNodeContent — file node', () => {
  it('writes the new content via vault.modify and asks canvas to save', async () => {
    const app = new App();
    (app.vault as any).__seed('notes/a.md', 'old');
    const requestSave = vi.fn();
    const view = makeView({ canvas: { requestSave } });
    const node: CanvasNode = { id: 'n1', type: 'file', file: 'notes/a.md' };

    await writeNodeContent(app, view, node, 'n1', 'new body');

    expect(app.vault.modify).toHaveBeenCalledTimes(1);
    const [fileArg, contentArg] = (app.vault.modify as any).mock.calls[0];
    expect((fileArg as TFile).path).toBe('notes/a.md');
    expect(contentArg).toBe('new body');
    expect(requestSave).toHaveBeenCalled();
  });

  it('does not throw when the linked file is missing in the vault', async () => {
    const app = new App();
    const view = makeView();
    const node: CanvasNode = { id: 'n1', type: 'file', file: 'missing.md' };
    await expect(writeNodeContent(app, view, node, 'n1', 'x')).resolves.toBeUndefined();
    expect(app.vault.modify).not.toHaveBeenCalled();
  });
});

describe('writeNodeContent — text node, in-memory canvas API', () => {
  it('prefers updateNode when present', async () => {
    const app = new App();
    const updateNode = vi.fn();
    const setNodeText = vi.fn();
    const requestSave = vi.fn();
    const view = makeView({ canvas: { updateNode, setNodeText, requestSave } });
    const node: CanvasNode = { id: 'n1', type: 'text', text: 'old' };

    await writeNodeContent(app, view, node, 'n1', 'new');

    expect(updateNode).toHaveBeenCalledWith('n1', { text: 'new' });
    expect(setNodeText).not.toHaveBeenCalled();
    expect(requestSave).toHaveBeenCalled();
  });

  it('uses setNodeText when updateNode is absent', async () => {
    const app = new App();
    const setNodeText = vi.fn();
    const requestSave = vi.fn();
    const view = makeView({ canvas: { setNodeText, requestSave } });
    const node: CanvasNode = { id: 'n1', type: 'text', text: 'old' };

    await writeNodeContent(app, view, node, 'n1', 'new');

    expect(setNodeText).toHaveBeenCalledWith('n1', 'new');
    expect(requestSave).toHaveBeenCalled();
  });
});

describe('writeNodeContent — text node, JSON fallback', () => {
  it('rewrites the .canvas file when no in-memory APIs are available', async () => {
    const app = new App();
    const file = new (TFile as any)('board.canvas') as TFile;
    const initial = { nodes: [{ id: 'n1', type: 'text', text: 'old' }, { id: 'n2', type: 'text', text: 'keep' }], edges: [] };
    (app.vault as any).__seed('board.canvas', JSON.stringify(initial));
    const requestSave = vi.fn();
    const view = makeView({ canvas: { requestSave }, file });
    const node: CanvasNode = { id: 'n1', type: 'text', text: 'old' };

    await writeNodeContent(app, view, node, 'n1', 'new');

    expect(app.vault.modify).toHaveBeenCalledTimes(1);
    const [, written] = (app.vault.modify as any).mock.calls[0];
    const parsed = JSON.parse(written);
    expect(parsed.nodes.find((n: any) => n.id === 'n1').text).toBe('new');
    expect(parsed.nodes.find((n: any) => n.id === 'n2').text).toBe('keep');
    expect(requestSave).toHaveBeenCalled();
  });

  it('skips writing when the canvas file cannot be resolved', async () => {
    const app = new App();
    const view = makeView({ canvas: {} });
    const node: CanvasNode = { id: 'n1', type: 'text', text: 'old' };
    await writeNodeContent(app, view, node, 'n1', 'new');
    expect(app.vault.modify).not.toHaveBeenCalled();
  });
});

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { CanvasData, CanvasNode } from '../types';

export async function writeNodeContent(
  app: App,
  view: any,
  currentNode: CanvasNode | null,
  nodeId: string,
  text: string,
): Promise<void> {
  const node = currentNode;
  if (node?.type === 'file' && typeof node.file === 'string') {
    const mdFile = resolveVaultFile(app, node.file);
    if (mdFile) {
      try {
        await app.vault.modify(mdFile, text);
      } catch (e) {
        console.error('CanvasMdSideEditor: failed to write file node content', e);
      }
    }
    // try to ask canvas to refresh/save
    try {
      const canvas = (view as any)?.canvas;
      if (canvas?.requestSave) canvas.requestSave();
    } catch {}
    return;
  }
  // Try in-memory canvas API first if present
  try {
    const canvas = (view as any)?.canvas;
    if (canvas?.updateNode) {
      canvas.updateNode(nodeId, { text });
      if (canvas?.requestSave) canvas.requestSave();
      return;
    }
    if (canvas?.setNodeText) {
      canvas.setNodeText(nodeId, text);
      if (canvas?.requestSave) canvas.requestSave();
      return;
    }
  } catch {}

  // Fallback: write to file JSON
  const file: TFile | undefined = (view as any)?.file ?? view?.file;
  if (!file) return;
  try {
    const raw = await app.vault.read(file);
    const data = JSON.parse(raw) as CanvasData;
    const idx = data.nodes.findIndex((n) => n.id === nodeId);
    if (idx !== -1) {
      data.nodes[idx].text = text;
      await app.vault.modify(file, JSON.stringify(data, null, 2));
      try {
        const canvas = (view as any)?.canvas;
        if (canvas?.requestSave) canvas.requestSave();
      } catch {}
    }
  } catch (e) {
    console.error('CanvasMdSideEditor: failed to write canvas text', e);
  }
}

function resolveVaultFile(app: App, path: string) {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

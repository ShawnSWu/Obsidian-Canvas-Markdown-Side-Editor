// Canvas data access layer: reading canvas JSON, resolving nodes, and
// writing edited content back — both through Obsidian's (undocumented)
// in-memory Canvas APIs and via direct file rewrites as a fallback.
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { CanvasData, CanvasNode, CanvasLikeView, CanvasLike } from '../types';

export function resolveVaultFile(app: App, path: string): TFile | null {
  const file = app.vault.getAbstractFileByPath(path);
  return file instanceof TFile ? file : null;
}

export async function readCanvasData(app: App, view: CanvasLikeView): Promise<CanvasData | null> {
  try {
    const canvas: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
    if (canvas?.getData) {
      const dataUnknown = canvas.getData();
      if (isCanvasData(dataUnknown)) return dataUnknown;
    }
  } catch {}
  try {
    const file: TFile | undefined = view?.file as TFile | undefined;
    if (!file) return null;
    const raw = await app.vault.read(file);
    const data = JSON.parse(raw) as CanvasData;
    return data;
  } catch {
    return null;
  }
}

export async function getCanvasNodeById(app: App, view: CanvasLikeView, nodeId: string): Promise<CanvasNode | null> {
  const data = await readCanvasData(app, view);
  if (!data) return null;
  const node = data.nodes.find((n) => n.id === nodeId);
  return node ?? null;
}

export async function writeNodeContent(
  app: App,
  view: CanvasLikeView,
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
    const canvas: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
    if (canvas?.updateNode) {
      canvas.updateNode(nodeId, { text });
      canvas.requestSave?.();
      return;
    }
    if (canvas?.setNodeText) {
      canvas.setNodeText(nodeId, text);
      canvas.requestSave?.();
      return;
    }
  } catch {}

  // Fallback: write to file JSON
  const maybeFile: unknown = (view as unknown as { file?: TFile; viewState?: { file?: TFile } })?.file
    ?? (view as unknown as { viewState?: { file?: TFile } })?.viewState?.file
    ?? view?.file;
  if (!(maybeFile instanceof TFile)) return;
  const file: TFile = maybeFile;
  try {
    const raw = await app.vault.read(file);
    const data = JSON.parse(raw) as CanvasData;
    const idx = data.nodes.findIndex((n) => n.id === nodeId);
    if (idx !== -1) {
      data.nodes[idx].text = text;
      await app.vault.modify(file, JSON.stringify(data, null, 2));
      try {
        const canvas: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
        canvas?.requestSave?.();
      } catch {}
    }
  } catch (e) {
    console.error('CanvasMdSideEditor: failed to write canvas text', e);
  }
}

function isCanvasData(x: unknown): x is CanvasData {
  if (!x || typeof x !== 'object') return false;
  const obj = x as Record<string, unknown>;
  return Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

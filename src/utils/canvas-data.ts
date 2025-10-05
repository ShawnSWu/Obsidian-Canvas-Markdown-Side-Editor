import type { App, TFile } from 'obsidian';
import type { CanvasData, CanvasNode, CanvasLikeView, CanvasLike } from '../types';
import { screenToCanvasPoint } from './canvas';

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

export async function hitTestNodeAt(app: App, view: CanvasLikeView, clientX: number, clientY: number): Promise<string | null> {
  const data = await readCanvasData(app, view);
  if (!data) return null;
  const { x, y } = screenToCanvasPoint(view, clientX, clientY);
  const getBounds = (n: CanvasNode | Record<string, unknown>) => {
    if (typeof (n as CanvasNode).x === 'number' && typeof (n as CanvasNode).y === 'number' && typeof (n as CanvasNode).width === 'number' && typeof (n as CanvasNode).height === 'number') {
      return [
        { left: (n as CanvasNode).x!, top: (n as CanvasNode).y!, width: (n as CanvasNode).width!, height: (n as CanvasNode).height! },
        { left: (n as CanvasNode).x! - (n as CanvasNode).width! / 2, top: (n as CanvasNode).y! - (n as CanvasNode).height! / 2, width: (n as CanvasNode).width!, height: (n as CanvasNode).height! },
      ];
    }
    const rec = n as Record<string, unknown>;
    const posVal = rec['pos'] as unknown;
    const sizeVal = rec['size'] as unknown;
    const posObj = (posVal && typeof posVal === 'object') ? (posVal as Record<string, unknown>) : undefined;
    const posArr = Array.isArray(posVal) ? (posVal as unknown[]) : undefined;
    const sizeObj = (sizeVal && typeof sizeVal === 'object' && !Array.isArray(sizeVal)) ? (sizeVal as Record<string, unknown>) : undefined;
    const sizeArr = Array.isArray(sizeVal) ? (sizeVal as unknown[]) : undefined;
    if ((posObj || posArr) && (sizeObj || sizeArr)) {
      const px = typeof posObj?.x === 'number' ? posObj!.x as number : (typeof posArr?.[0] === 'number' ? posArr![0] as number : undefined);
      const py = typeof posObj?.y === 'number' ? posObj!.y as number : (typeof posArr?.[1] === 'number' ? posArr![1] as number : undefined);
      const w = typeof sizeObj?.w === 'number' ? sizeObj!.w as number
              : typeof sizeObj?.width === 'number' ? sizeObj!.width as number
              : (typeof sizeArr?.[0] === 'number' ? sizeArr![0] as number : undefined);
      const h = typeof sizeObj?.h === 'number' ? sizeObj!.h as number
              : typeof sizeObj?.height === 'number' ? sizeObj!.height as number
              : (typeof sizeArr?.[1] === 'number' ? sizeArr![1] as number : undefined);
      if ([px, py, w, h].every((v) => typeof v === 'number')) {
        return [
          { left: px, top: py, width: w, height: h },
          { left: px - w / 2, top: py - h / 2, width: w, height: h },
        ];
      }
    }
    return [] as Array<{ left: number; top: number; width: number; height: number }>;
  };

  for (let i = data.nodes.length - 1; i >= 0; i--) {
    const n = data.nodes[i];
    const candidates = getBounds(n);
    for (const b of candidates) {
      if (x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height) {
        return n.id as string;
      }
    }
  }
  return null;
}

function isCanvasData(x: unknown): x is CanvasData {
  if (!x || typeof x !== 'object') return false;
  const obj = x as Record<string, unknown>;
  return Array.isArray(obj.nodes) && Array.isArray(obj.edges);
}

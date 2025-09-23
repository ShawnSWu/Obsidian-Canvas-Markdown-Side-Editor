import type { App, TFile } from 'obsidian';
import type { CanvasData, CanvasNode } from '../types';
import { screenToCanvasPoint } from './canvas';

export async function readCanvasData(app: App, view: any): Promise<CanvasData | null> {
  try {
    const canvas = (view as any)?.canvas;
    if (canvas?.getData) {
      const data = canvas.getData();
      if ((data as any)?.nodes && (data as any)?.edges) return data as CanvasData;
    }
  } catch {}
  try {
    const file: TFile | undefined = (view as any)?.file ?? view?.file;
    if (!file) return null;
    const raw = await app.vault.read(file);
    const data = JSON.parse(raw) as CanvasData;
    return data;
  } catch {
    return null;
  }
}

export async function getCanvasNodeById(app: App, view: any, nodeId: string): Promise<CanvasNode | null> {
  const data = await readCanvasData(app, view);
  if (!data) return null;
  const node = data.nodes.find((n) => n.id === nodeId);
  return node ?? null;
}

export async function hitTestNodeAt(app: App, view: any, clientX: number, clientY: number): Promise<string | null> {
  const data = await readCanvasData(app, view);
  if (!data) return null;
  const { x, y } = screenToCanvasPoint(view, clientX, clientY);
  const getBounds = (n: any) => {
    if (typeof n.x === 'number' && typeof n.y === 'number' && typeof n.width === 'number' && typeof n.height === 'number') {
      return [
        { left: n.x, top: n.y, width: n.width, height: n.height },
        { left: n.x - n.width / 2, top: n.y - n.height / 2, width: n.width, height: n.height },
      ];
    }
    if (n?.pos && n?.size) {
      const px = n.pos.x ?? n.pos[0];
      const py = n.pos.y ?? n.pos[1];
      const w = n.size.w ?? n.size.width ?? n.size[0];
      const h = n.size.h ?? n.size.height ?? n.size[1];
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

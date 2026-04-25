import { describe, it, expect, vi } from 'vitest';
import { getSelectedCanvasNodeId, tryCanvasAPIsForHit } from '../../../src/utils/canvas-selection';
import type { CanvasLikeView } from '../../../src/types';

function makeView(canvas?: any): CanvasLikeView {
  return { containerEl: document.createElement('div'), canvas } as unknown as CanvasLikeView;
}

describe('getSelectedCanvasNodeId', () => {
  it('returns null when no canvas object is attached', async () => {
    expect(await getSelectedCanvasNodeId(makeView())).toBeNull();
  });

  it('reads getSelection() returning an array of strings', async () => {
    const canvas = { getSelection: () => ['id-1', 'id-2'] };
    expect(await getSelectedCanvasNodeId(makeView(canvas))).toBe('id-1');
  });

  it('reads getSelection() returning an array of objects with id', async () => {
    const canvas = { getSelection: () => [{ id: 'obj-id' }] };
    expect(await getSelectedCanvasNodeId(makeView(canvas))).toBe('obj-id');
  });

  it('falls back to selection property as a Set', async () => {
    const canvas = { selection: new Set([{ id: 'set-id' }]) };
    expect(await getSelectedCanvasNodeId(makeView(canvas))).toBe('set-id');
  });

  it('falls back to selection property as a single object', async () => {
    const canvas = { selection: { id: 'single' } };
    expect(await getSelectedCanvasNodeId(makeView(canvas))).toBe('single');
  });

  it('returns null when selection is empty', async () => {
    expect(await getSelectedCanvasNodeId(makeView({ selection: [] }))).toBeNull();
  });
});

describe('tryCanvasAPIsForHit', () => {
  it('returns null when canvas object is missing', async () => {
    expect(await tryCanvasAPIsForHit(makeView(), 0, 0)).toBeNull();
  });

  it('uses the first hit method that returns a string id', async () => {
    const canvas = {
      getNodeAtPos: vi.fn(() => null),
      getNodeAtPoint: vi.fn(() => 'hit-id'),
      hitTest: vi.fn(),
    };
    const id = await tryCanvasAPIsForHit(makeView(canvas), 10, 10);
    expect(id).toBe('hit-id');
    expect(canvas.getNodeAtPos).toHaveBeenCalled();
    expect(canvas.getNodeAtPoint).toHaveBeenCalled();
    // hitTest is later in the list — it should not be invoked once we have a hit.
    expect(canvas.hitTest).not.toHaveBeenCalled();
  });

  it('extracts id from object return values', async () => {
    const canvas = { getNodeAtPos: () => ({ id: 'from-obj' }) };
    expect(await tryCanvasAPIsForHit(makeView(canvas), 0, 0)).toBe('from-obj');
  });

  it('extracts id from array return values', async () => {
    const canvas = { getNodeAtPos: () => [{ id: 'arr-id' }] };
    expect(await tryCanvasAPIsForHit(makeView(canvas), 0, 0)).toBe('arr-id');
  });

  it('falls back to selection when every method returns nothing', async () => {
    const canvas = {
      getNodeAtPos: () => null,
      getSelection: () => ['fallback-sel'],
    };
    const id = await tryCanvasAPIsForHit(makeView(canvas), 0, 0);
    expect(id).toBe('fallback-sel');
  });

  it('returns null when nothing matches and selection is empty', async () => {
    const canvas = { getNodeAtPos: () => null };
    expect(await tryCanvasAPIsForHit(makeView(canvas), 0, 0)).toBeNull();
  });
});

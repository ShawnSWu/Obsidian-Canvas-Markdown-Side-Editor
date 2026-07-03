import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { anchorDelta, shiftPathEndpoints, installEdgeAnchorPatch } from '../../src/edge-anchor';

describe('anchorDelta', () => {
  it('moves along X for top/bottom sides', () => {
    expect(anchorDelta('top', 0.25, 200, 100)).toEqual({ dx: -50, dy: 0 });
    expect(anchorDelta('bottom', 0.75, 200, 100)).toEqual({ dx: 50, dy: 0 });
  });

  it('moves along Y for left/right sides', () => {
    expect(anchorDelta('left', 0.25, 200, 100)).toEqual({ dx: 0, dy: -25 });
    expect(anchorDelta('right', 0.75, 200, 100)).toEqual({ dx: 0, dy: 25 });
  });

  it('offset 0.5 is the native midpoint — no delta', () => {
    expect(anchorDelta('top', 0.5, 200, 100)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('shiftPathEndpoints', () => {
  it('shifts the M start and the final coordinate pair', () => {
    const d = 'M 10,20 C 30,40 50,60 70,80';
    const out = shiftPathEndpoints(d, { dx: 5, dy: -5 }, { dx: -10, dy: 10 });
    expect(out).toBe('M 15,15 C 30,40 50,60 60,90');
  });

  it('zero deltas return the path unchanged', () => {
    const d = 'M 10,20 C 30,40 50,60 70,80';
    expect(shiftPathEndpoints(d, { dx: 0, dy: 0 }, { dx: 0, dy: 0 })).toBe(d);
  });

  it('malformed path data is returned unchanged', () => {
    expect(shiftPathEndpoints('garbage', { dx: 5, dy: 5 }, { dx: 5, dy: 5 })).toBe('garbage');
  });
});

function makeFakeEdge(d: string) {
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', d);
  const edge: any = {
    id: 'e1',
    from: { side: 'right', node: { width: 200, height: 100 } },
    to: { side: 'left', node: { width: 200, height: 100 } },
    path: { display: pathEl },
    updatePath: vi.fn(function (this: any) {
      // the "native" renderer resets the path each call
      pathEl.setAttribute('d', d);
    }),
  };
  return { edge, pathEl };
}

describe('installEdgeAnchorPatch', () => {
  beforeEach(() => { vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('wraps updatePath so stored offsets shift the rendered endpoints', () => {
    const { edge, pathEl } = makeFakeEdge('M 10,20 C 30,40 50,60 70,80');
    const canvas: any = { edges: new Map([['e1', edge]]) };
    const uninstall = installEdgeAnchorPatch(canvas, () => ({ fromOffset: 0.75, toOffset: 0.25 }));

    edge.updatePath();
    // from: right side, offset .75 → dy = +25; to: left side, offset .25 → dy = -25
    expect(pathEl.getAttribute('d')).toBe('M 10,45 C 30,40 50,60 70,55');

    uninstall();
    edge.updatePath();
    expect(pathEl.getAttribute('d')).toBe('M 10,20 C 30,40 50,60 70,80');
  });

  it('edges without stored offsets render natively', () => {
    const { edge, pathEl } = makeFakeEdge('M 10,20 C 30,40 50,60 70,80');
    const canvas: any = { edges: new Map([['e1', edge]]) };
    installEdgeAnchorPatch(canvas, () => ({}));
    edge.updatePath();
    expect(pathEl.getAttribute('d')).toBe('M 10,20 C 30,40 50,60 70,80');
  });

  it('feature-detection failure warns once and never throws', () => {
    const canvas: any = { edges: new Map([['weird', { id: 'weird' }]]) };
    expect(() => {
      const uninstall = installEdgeAnchorPatch(canvas, () => ({ fromOffset: 0.25 }));
      uninstall();
    }).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

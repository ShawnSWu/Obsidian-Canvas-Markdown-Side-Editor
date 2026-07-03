import { describe, it, expect } from 'vitest';
import {
  resolveHeadline,
  getNodeStyle,
  getEdgeStyle,
  setCanvasHeadline,
  setNodeStyle,
  setEdgeStyle,
  renameCanvasKey,
  deleteCanvasKey,
  type CanvasStylesMap,
} from '../../src/style-store';

describe('resolveHeadline', () => {
  it('falls back to the global setting when no entry exists', () => {
    expect(resolveHeadline(undefined, 'a.canvas', true)).toBe(true);
    expect(resolveHeadline({}, 'a.canvas', false)).toBe(false);
  });

  it('per-canvas override wins over the global setting', () => {
    const map: CanvasStylesMap = { 'a.canvas': { headline: 'on' } };
    expect(resolveHeadline(map, 'a.canvas', false)).toBe(true);
    map['a.canvas'].headline = 'off';
    expect(resolveHeadline(map, 'a.canvas', true)).toBe(false);
  });

  it('null canvasPath always follows global', () => {
    const map: CanvasStylesMap = { 'a.canvas': { headline: 'on' } };
    expect(resolveHeadline(map, null, false)).toBe(false);
  });
});

describe('getNodeStyle / getEdgeStyle', () => {
  it('returns {} when nothing is stored', () => {
    expect(getNodeStyle(undefined, 'a.canvas', 'n1')).toEqual({});
    expect(getEdgeStyle({}, 'a.canvas', 'e1')).toEqual({});
    expect(getNodeStyle({ 'a.canvas': {} }, 'a.canvas', 'n1')).toEqual({});
    expect(getNodeStyle({ 'a.canvas': {} }, null, 'n1')).toEqual({});
  });

  it('returns the stored style', () => {
    const map: CanvasStylesMap = {
      'a.canvas': { nodes: { n1: { h1Size: 30, h1Color: '#f00' } }, edges: { e1: { labelSize: 14 } } },
    };
    expect(getNodeStyle(map, 'a.canvas', 'n1')).toEqual({ h1Size: 30, h1Color: '#f00' });
    expect(getEdgeStyle(map, 'a.canvas', 'e1')).toEqual({ labelSize: 14 });
  });
});

describe('setCanvasHeadline', () => {
  it('creates the entry lazily and stores the override', () => {
    const map: CanvasStylesMap = {};
    setCanvasHeadline(map, 'a.canvas', 'on');
    expect(map['a.canvas'].headline).toBe('on');
  });

  it('null clears the override and prunes an empty entry', () => {
    const map: CanvasStylesMap = { 'a.canvas': { headline: 'on' } };
    setCanvasHeadline(map, 'a.canvas', null);
    expect(map['a.canvas']).toBeUndefined();
  });

  it('null keeps the entry when node styles remain', () => {
    const map: CanvasStylesMap = { 'a.canvas': { headline: 'on', nodes: { n1: { h1Size: 30 } } } };
    setCanvasHeadline(map, 'a.canvas', null);
    expect(map['a.canvas']).toEqual({ nodes: { n1: { h1Size: 30 } } });
  });
});

describe('setNodeStyle / setEdgeStyle', () => {
  it('creates and merges patches', () => {
    const map: CanvasStylesMap = {};
    setNodeStyle(map, 'a.canvas', 'n1', { h1Size: 40 });
    setNodeStyle(map, 'a.canvas', 'n1', { h1Color: '#0f0' });
    expect(map['a.canvas'].nodes!.n1).toEqual({ h1Size: 40, h1Color: '#0f0' });
  });

  it('undefined fields in a patch clear those fields', () => {
    const map: CanvasStylesMap = {};
    setNodeStyle(map, 'a.canvas', 'n1', { h1Size: 40, h1Color: '#0f0' });
    setNodeStyle(map, 'a.canvas', 'n1', { h1Size: undefined });
    expect(map['a.canvas'].nodes!.n1).toEqual({ h1Color: '#0f0' });
  });

  it('null patch removes the node entry and prunes empty parents', () => {
    const map: CanvasStylesMap = {};
    setNodeStyle(map, 'a.canvas', 'n1', { h1Size: 40 });
    setNodeStyle(map, 'a.canvas', 'n1', null);
    expect(map['a.canvas']).toBeUndefined();
  });

  it('clearing every field removes the entry', () => {
    const map: CanvasStylesMap = {};
    setEdgeStyle(map, 'a.canvas', 'e1', { labelSize: 12 });
    setEdgeStyle(map, 'a.canvas', 'e1', { labelSize: undefined });
    expect(map['a.canvas']).toBeUndefined();
  });

  it('edge styles support anchor offsets', () => {
    const map: CanvasStylesMap = {};
    setEdgeStyle(map, 'a.canvas', 'e1', { fromOffset: 0.25, toOffset: 0.75 });
    expect(getEdgeStyle(map, 'a.canvas', 'e1')).toEqual({ fromOffset: 0.25, toOffset: 0.75 });
  });
});

describe('rename / delete housekeeping', () => {
  it('renameCanvasKey moves the entry', () => {
    const map: CanvasStylesMap = { 'old.canvas': { headline: 'on' } };
    renameCanvasKey(map, 'old.canvas', 'new.canvas');
    expect(map['old.canvas']).toBeUndefined();
    expect(map['new.canvas']).toEqual({ headline: 'on' });
  });

  it('renameCanvasKey is a no-op for unknown keys', () => {
    const map: CanvasStylesMap = {};
    renameCanvasKey(map, 'nope.canvas', 'other.canvas');
    expect(Object.keys(map)).toEqual([]);
  });

  it('deleteCanvasKey removes the entry', () => {
    const map: CanvasStylesMap = { 'a.canvas': { headline: 'off' } };
    deleteCanvasKey(map, 'a.canvas');
    expect(map['a.canvas']).toBeUndefined();
  });
});

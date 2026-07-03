import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyCanvasHeadlineClass,
  applyNodeStyleVars,
  clearNodeStyleVars,
  applyEdgeLabelStyles,
} from '../../src/style-applier';
import type { EdgeStyle, NodeStyle } from '../../src/style-store';

function makeCanvasContainer(nodeIds: Array<string | null>): HTMLElement {
  const container = document.createElement('div');
  for (const id of nodeIds) {
    const node = document.createElement('div');
    node.className = 'canvas-node';
    if (id !== null) node.setAttribute('data-node-id', id);
    container.appendChild(node);
  }
  return container;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('applyCanvasHeadlineClass', () => {
  it('toggles the class on and off idempotently', () => {
    const el = document.createElement('div');
    applyCanvasHeadlineClass(el, true);
    applyCanvasHeadlineClass(el, true);
    expect(el.classList.contains('cmside-headline-mode')).toBe(true);
    applyCanvasHeadlineClass(el, false);
    expect(el.classList.contains('cmside-headline-mode')).toBe(false);
  });
});

describe('applyNodeStyleVars', () => {
  it('stamps vars only on nodes with a stored style', () => {
    const container = makeCanvasContainer(['n1', 'n2']);
    const styles: Record<string, NodeStyle> = { n1: { h1Size: 40, h1Color: '#ff0000' } };
    applyNodeStyleVars(container, styles);
    const [n1, n2] = Array.from(container.children) as HTMLElement[];
    expect(n1.style.getPropertyValue('--cmside-h1-size')).toBe('40');
    expect(n1.style.getPropertyValue('--cmside-h1-color')).toBe('#ff0000');
    expect(n2.style.getPropertyValue('--cmside-h1-size')).toBe('');
    expect(n2.style.getPropertyValue('--cmside-h1-color')).toBe('');
  });

  it('removes vars when the style loses fields', () => {
    const container = makeCanvasContainer(['n1']);
    const n1 = container.firstElementChild as HTMLElement;
    applyNodeStyleVars(container, { n1: { h1Size: 40, h1Color: '#ff0000' } });
    applyNodeStyleVars(container, { n1: { h1Color: '#00ff00' } });
    expect(n1.style.getPropertyValue('--cmside-h1-size')).toBe('');
    expect(n1.style.getPropertyValue('--cmside-h1-color')).toBe('#00ff00');
    applyNodeStyleVars(container, {});
    expect(n1.style.getPropertyValue('--cmside-h1-color')).toBe('');
  });

  it('supports data-id as the fallback id attribute and skips id-less nodes', () => {
    const container = makeCanvasContainer([null]);
    const viaDataId = document.createElement('div');
    viaDataId.className = 'canvas-node';
    viaDataId.setAttribute('data-id', 'n9');
    container.appendChild(viaDataId);
    applyNodeStyleVars(container, { n9: { h1Size: 12 } });
    expect(viaDataId.style.getPropertyValue('--cmside-h1-size')).toBe('12');
    // the id-less node must simply be skipped without throwing
  });
});

describe('clearNodeStyleVars', () => {
  it('removes stamped vars from every node', () => {
    const container = makeCanvasContainer(['n1', 'n2']);
    applyNodeStyleVars(container, { n1: { h1Size: 40 }, n2: { h1Color: '#00f' } });
    clearNodeStyleVars(container);
    for (const el of Array.from(container.children) as HTMLElement[]) {
      expect(el.style.getPropertyValue('--cmside-h1-size')).toBe('');
      expect(el.style.getPropertyValue('--cmside-h1-color')).toBe('');
    }
  });
});

describe('applyEdgeLabelStyles', () => {
  it('stamps label vars per edge and removes cleared ones', () => {
    const l1 = document.createElement('div');
    const l2 = document.createElement('div');
    const edges: Array<[string, { labelEl?: HTMLElement | null }]> = [
      ['e1', { labelEl: l1 }],
      ['e2', { labelEl: l2 }],
      ['e3', { labelEl: null }],
    ];
    const styles: Record<string, EdgeStyle> = { e1: { labelSize: 18, labelColor: 'red' } };
    applyEdgeLabelStyles(edges, styles);
    expect(l1.style.getPropertyValue('--cmside-edge-label-size')).toBe('18px');
    expect(l1.style.getPropertyValue('--cmside-edge-label-color')).toBe('red');
    expect(l2.style.getPropertyValue('--cmside-edge-label-size')).toBe('');

    applyEdgeLabelStyles(edges, {});
    expect(l1.style.getPropertyValue('--cmside-edge-label-size')).toBe('');
    expect(l1.style.getPropertyValue('--cmside-edge-label-color')).toBe('');
  });
});

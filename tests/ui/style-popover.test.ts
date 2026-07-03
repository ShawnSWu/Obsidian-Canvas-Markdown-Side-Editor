import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openStylePopover } from '../../src/ui/style-popover';

function makeAnchor(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('openStylePopover', () => {
  it('renders a titled popover with one row per field and initial values', () => {
    const { el, close } = openStylePopover({
      anchorEl: makeAnchor(),
      title: 'Headline style',
      fields: [
        { key: 'h1Color', label: 'Color', kind: 'color', value: '#ff0000' },
        { key: 'h1Size', label: 'Size', kind: 'size', min: 5, max: 60, value: 30 },
      ],
      onChange: () => {},
    });
    expect(document.body.contains(el)).toBe(true);
    expect(el.classList.contains('cmside-style-popover')).toBe(true);
    expect(el.textContent).toContain('Headline style');
    const color = el.querySelector('input[type="color"]') as HTMLInputElement;
    const range = el.querySelector('input[type="range"]') as HTMLInputElement;
    expect(color.value).toBe('#ff0000');
    expect(range.value).toBe('30');
    expect(range.min).toBe('5');
    expect(range.max).toBe('60');
    close();
    expect(document.body.contains(el)).toBe(false);
  });

  it('fires onChange with a number for size and a string for color', () => {
    const onChange = vi.fn();
    const { el } = openStylePopover({
      anchorEl: makeAnchor(),
      title: 'x',
      fields: [
        { key: 'c', label: 'Color', kind: 'color', value: '#000000' },
        { key: 's', label: 'Size', kind: 'size', min: 8, max: 48, value: 12 },
      ],
      onChange,
    });
    const color = el.querySelector('input[type="color"]') as HTMLInputElement;
    color.value = '#00ff00';
    color.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('c', '#00ff00');

    const range = el.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '24';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('s', 24);
  });

  it('per-field reset fires onChange(key, null)', () => {
    const onChange = vi.fn();
    const { el } = openStylePopover({
      anchorEl: makeAnchor(),
      title: 'x',
      fields: [{ key: 'c', label: 'Color', kind: 'color', value: '#000000' }],
      onChange,
    });
    const reset = el.querySelector('button.cmside-style-reset') as HTMLButtonElement;
    reset.click();
    expect(onChange).toHaveBeenCalledWith('c', null);
  });

  it('closes on Escape and on outside pointerdown, calling onClose once', () => {
    const onClose = vi.fn();
    const first = openStylePopover({
      anchorEl: makeAnchor(),
      title: 'x',
      fields: [{ key: 'c', label: 'Color', kind: 'color' }],
      onChange: () => {},
      onClose,
    });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.contains(first.el)).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);

    const onClose2 = vi.fn();
    const second = openStylePopover({
      anchorEl: makeAnchor(),
      title: 'x',
      fields: [{ key: 'c', label: 'Color', kind: 'color' }],
      onChange: () => {},
      onClose: onClose2,
    });
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.body.contains(second.el)).toBe(false);
    expect(onClose2).toHaveBeenCalledTimes(1);
  });

  it('pointerdown inside the popover does not close it', () => {
    const { el } = openStylePopover({
      anchorEl: makeAnchor(),
      title: 'x',
      fields: [{ key: 'c', label: 'Color', kind: 'color' }],
      onChange: () => {},
    });
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(document.body.contains(el)).toBe(true);
  });
});

// Tiny style-editing popover for the canvas style suite. Deliberately plain
// DOM (no Obsidian Modal): it anchors next to the element being styled, one
// row per field, per-field reset, closes on Escape / outside pointerdown.
// The caller owns persistence — every input change fires onChange immediately
// so edits preview live on the canvas.

export interface StylePopoverField {
  key: string;
  label: string;
  kind: 'color' | 'size';
  min?: number;
  max?: number;
  value?: string | number;
}

export interface StylePopoverHandle {
  el: HTMLElement;
  close(): void;
}

export function openStylePopover(opts: {
  anchorEl: HTMLElement;
  title: string;
  fields: StylePopoverField[];
  onChange(key: string, value: string | number | null): void;
  onClose?(): void;
}): StylePopoverHandle {
  const el = document.createElement('div');
  el.className = 'cmside-style-popover';

  const titleEl = document.createElement('div');
  titleEl.className = 'cmside-style-popover-title';
  titleEl.textContent = opts.title;
  el.appendChild(titleEl);

  for (const field of opts.fields) {
    el.appendChild(buildRow(field, opts.onChange));
  }

  document.body.appendChild(el);
  positionNear(el, opts.anchorEl);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    el.remove();
    try { opts.onClose?.(); } catch {}
  };
  const onKeydown = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') close();
  };
  const onPointerDown = (evt: Event) => {
    if (el.contains(evt.target as Node)) return;
    close();
  };
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('pointerdown', onPointerDown, true);

  return { el, close };
}

function buildRow(
  field: StylePopoverField,
  onChange: (key: string, value: string | number | null) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'cmside-style-popover-row';

  const label = document.createElement('label');
  label.className = 'cmside-style-label';
  label.textContent = field.label;
  row.appendChild(label);

  const input = document.createElement('input');
  if (field.kind === 'color') {
    input.type = 'color';
    if (typeof field.value === 'string') input.value = field.value;
    input.addEventListener('input', () => onChange(field.key, input.value));
  } else {
    input.type = 'range';
    if (field.min != null) input.min = String(field.min);
    if (field.max != null) input.max = String(field.max);
    if (field.value != null) input.value = String(field.value);
    const readout = document.createElement('span');
    readout.className = 'cmside-style-readout';
    readout.textContent = input.value;
    input.addEventListener('input', () => {
      readout.textContent = input.value;
      const n = Number(input.value);
      if (Number.isFinite(n)) onChange(field.key, n);
    });
    row.appendChild(input);
    row.appendChild(readout);
    row.appendChild(buildReset(field.key, onChange));
    return row;
  }
  row.appendChild(input);
  row.appendChild(buildReset(field.key, onChange));
  return row;
}

function buildReset(
  key: string,
  onChange: (key: string, value: string | number | null) => void,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'cmside-style-reset';
  btn.textContent = 'Reset';
  btn.title = 'Remove this override';
  btn.addEventListener('click', () => onChange(key, null));
  return btn;
}

function positionNear(el: HTMLElement, anchorEl: HTMLElement): void {
  try {
    const rect = anchorEl.getBoundingClientRect();
    // Clamp into the viewport so a card near the right edge still shows the
    // whole popover. Sizes read after append so offsetWidth is real.
    const margin = 8;
    let left = rect.right + margin;
    let top = rect.top;
    const w = el.offsetWidth || 240;
    const h = el.offsetHeight || 120;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, rect.left - w - margin);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  } catch {}
}

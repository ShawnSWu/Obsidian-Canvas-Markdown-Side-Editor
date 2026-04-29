import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PanelController } from '../../src/ui/panel';
import { DEFAULT_SETTINGS, type CanvasMdSideEditorSettings } from '../../src/settings';

const originalGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = ((el: Element) => {
  const real = originalGCS(el);
  return new Proxy(real, {
    get(target, prop, recv) {
      if (prop === 'position') return 'relative';
      if (prop === 'fontSize') return '16px';
      if (prop === 'transform') return 'none';
      return Reflect.get(target, prop, recv);
    },
  }) as CSSStyleDeclaration;
}) as typeof window.getComputedStyle;

function setup(overrides: Partial<CanvasMdSideEditorSettings> = {}, previewCollapsed = false) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const settings: CanvasMdSideEditorSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const persistSettings = vi.fn(async () => {});
  const controller = new PanelController(container, () => settings, persistSettings, previewCollapsed);
  return { container, controller, settings, persistSettings };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('PanelController.create', () => {
  it('builds the expected DOM skeleton', () => {
    const { container, controller } = setup();
    const refs = controller.create();

    expect(container.querySelector('.canvas-md-side-editor-panel')).toBe(refs.panelEl);
    expect(refs.panelEl.querySelector('.cmside-toolbar')).toBeTruthy();
    expect(refs.panelEl.querySelector('.cmside-title')?.textContent).toBe('Canvas MD Side Editor');
    expect(refs.closeBtn.classList.contains('cmside-close-btn')).toBe(true);
    expect(refs.editorRootEl.classList.contains('cmside-editor-root')).toBe(true);
    expect(refs.previewRootEl.classList.contains('cmside-preview-root')).toBe(true);
    expect(refs.panelEl.querySelector('.cmside-divider')).toBeTruthy();
    expect(refs.panelEl.querySelector('.cmside-panel-resizer')).toBeTruthy();
  });

  it('applies default panel-width preset class from settings', () => {
    const { controller } = setup({ defaultPanelWidth: 480 });
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('cmside-has-custom-width')).toBe(true);
    // 480 quantizes within [300..800] step 20 → exact 480
    expect(refs.panelEl.classList.contains('cmside-width-w480')).toBe(true);
  });

  it('captures theme defaults for font sizes when settings are unset', () => {
    const { controller, settings, persistSettings } = setup({ editorFontSize: null, previewFontSize: null });
    controller.create();
    expect(settings.editorFontSize).toBeGreaterThanOrEqual(8);
    expect(settings.previewFontSize).toBeGreaterThanOrEqual(8);
    expect(persistSettings).toHaveBeenCalled();
  });
});

describe('PanelController state toggles', () => {
  it('setPreviewCollapsed toggles the preview-collapsed class', () => {
    const { controller } = setup({}, true);
    const refs = controller.create();
    // Default is collapsed (edit mode hides preview); flip it open first.
    controller.setPreviewCollapsed(false);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);
    controller.setPreviewCollapsed(true);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(true);
    controller.setPreviewCollapsed(false);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);
  });

  it('setReadOnly binds preview visibility 1:1 with !readOnly', () => {
    const { controller } = setup({}, true);  // start collapsed (edit-mode default)
    const refs = controller.create();
    // Default: edit mode → preview collapsed (hidden).
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(true);

    controller.setReadOnly(true);
    expect(refs.panelEl.classList.contains('read-only')).toBe(true);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);

    controller.setReadOnly(false);
    expect(refs.panelEl.classList.contains('read-only')).toBe(false);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(true);
  });
});

describe('PanelController button handlers', () => {
  it('onClose fires when close button is clicked', () => {
    const { controller } = setup();
    const refs = controller.create();
    const cb = vi.fn();
    controller.onClose(cb);
    refs.closeBtn.click();
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe('PanelController.applyFontSizes', () => {
  it('maps editor and preview font sizes to nearest preset classes', () => {
    const { controller, settings } = setup({ editorFontSize: 14, previewFontSize: 18 });
    const refs = controller.create();
    settings.editorFontSize = 14;
    settings.previewFontSize = 18;
    controller.applyFontSizes();
    expect(refs.panelEl.classList.contains('cmside-editor-font-md')).toBe(true);
    expect(refs.panelEl.classList.contains('cmside-preview-font-xl')).toBe(true);
  });

  it('removes the previous font class when the size changes', () => {
    const { controller, settings } = setup({ editorFontSize: 12, previewFontSize: 12 });
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('cmside-editor-font-xs')).toBe(true);
    settings.editorFontSize = 18;
    controller.applyFontSizes();
    expect(refs.panelEl.classList.contains('cmside-editor-font-xs')).toBe(false);
    expect(refs.panelEl.classList.contains('cmside-editor-font-xl')).toBe(true);
  });
});

describe('PanelController.setTitle', () => {
  it('renders static text when no commit handler is provided', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setTitle('My note');
    const titleEl = refs.panelEl.querySelector('.cmside-title') as HTMLElement;
    expect(titleEl.textContent).toBe('My note');
    expect(titleEl.querySelector('input')).toBeFalsy();
    expect(titleEl.classList.contains('cmside-title-editable')).toBe(false);
  });

  it('renders an editable input when a commit handler is provided', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setTitle('foo', () => {});
    const titleEl = refs.panelEl.querySelector('.cmside-title') as HTMLElement;
    const input = titleEl.querySelector('input.cmside-title-input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('foo');
    expect(titleEl.classList.contains('cmside-title-editable')).toBe(true);
  });

  it('fires the commit handler on Enter when the value changed', () => {
    const onCommit = vi.fn();
    const { controller } = setup();
    controller.create();
    controller.setTitle('foo', onCommit);
    const input = document.querySelector('input.cmside-title-input') as HTMLInputElement;
    input.value = 'bar';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // Enter triggers blur which triggers commit
    input.dispatchEvent(new Event('blur'));
    expect(onCommit).toHaveBeenCalledWith('bar');
  });

  it('fires the commit handler on blur when the value changed', () => {
    const onCommit = vi.fn();
    const { controller } = setup();
    controller.create();
    controller.setTitle('foo', onCommit);
    const input = document.querySelector('input.cmside-title-input') as HTMLInputElement;
    input.value = 'baz';
    input.dispatchEvent(new Event('blur'));
    expect(onCommit).toHaveBeenCalledWith('baz');
  });

  it('does not fire the commit handler when the value is unchanged', () => {
    const onCommit = vi.fn();
    const { controller } = setup();
    controller.create();
    controller.setTitle('foo', onCommit);
    const input = document.querySelector('input.cmside-title-input') as HTMLInputElement;
    input.dispatchEvent(new Event('blur'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('Escape reverts the value and skips the commit handler', () => {
    const onCommit = vi.fn();
    const { controller } = setup();
    controller.create();
    controller.setTitle('foo', onCommit);
    const input = document.querySelector('input.cmside-title-input') as HTMLInputElement;
    input.value = 'changed';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    input.dispatchEvent(new Event('blur'));
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe('foo');
  });

  it('switching from editable back to static replaces the input', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setTitle('a', () => {});
    expect(refs.panelEl.querySelector('input.cmside-title-input')).toBeTruthy();
    controller.setTitle('Static');
    expect(refs.panelEl.querySelector('input.cmside-title-input')).toBeFalsy();
    expect(refs.panelEl.querySelector('.cmside-title')?.textContent).toBe('Static');
  });
});

describe('PanelController docking (issue #11)', () => {
  it('applies cmside-dock-right by default', () => {
    const { controller } = setup();
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('cmside-dock-right')).toBe(true);
  });

  it('applies the configured dock class on create', () => {
    const { controller } = setup({ dockPosition: 'left' });
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('cmside-dock-left')).toBe(true);
    expect(refs.panelEl.classList.contains('cmside-dock-right')).toBe(false);
  });

  it('uses width preset for horizontal docks and height preset for vertical docks', () => {
    const { controller: leftCtl } = setup({ dockPosition: 'left', defaultPanelWidth: 480 });
    const leftRefs = leftCtl.create();
    expect(leftRefs.panelEl.classList.contains('cmside-width-w480')).toBe(true);

    const { controller: topCtl } = setup({ dockPosition: 'top', defaultPanelHeight: 360 });
    const topRefs = topCtl.create();
    expect(topRefs.panelEl.classList.contains('cmside-height-h360')).toBe(true);
    expect(topRefs.panelEl.className).not.toMatch(/cmside-width-w/);
  });

  it('setDockPosition swaps the dock class and re-applies the right size preset', () => {
    const { controller } = setup({ dockPosition: 'right', defaultPanelWidth: 480, defaultPanelHeight: 360 });
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('cmside-width-w480')).toBe(true);

    controller.setDockPosition('bottom');
    expect(refs.panelEl.classList.contains('cmside-dock-bottom')).toBe(true);
    expect(refs.panelEl.classList.contains('cmside-dock-right')).toBe(false);
    expect(refs.panelEl.classList.contains('cmside-width-w480')).toBe(false);
    expect(refs.panelEl.classList.contains('cmside-height-h360')).toBe(true);

    controller.setDockPosition('left');
    expect(refs.panelEl.classList.contains('cmside-dock-left')).toBe(true);
    expect(refs.panelEl.classList.contains('cmside-dock-bottom')).toBe(false);
    expect(refs.panelEl.classList.contains('cmside-width-w480')).toBe(true);
    expect(refs.panelEl.classList.contains('cmside-height-h360')).toBe(false);
  });
});

describe('PanelController floating mode (issue #11)', () => {
  function stubRect(el: Element, rect: { left: number; top: number; width: number; height: number }) {
    (el as any).getBoundingClientRect = () => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    });
  }

  it('applies cmside-dock-floating class and writes the CSS variables on create', () => {
    const { container, controller } = setup({
      dockPosition: 'floating',
      floatingX: 100,
      floatingY: 50,
      floatingWidth: 520,
      floatingHeight: 360,
    });
    stubRect(container, { left: 0, top: 0, width: 1200, height: 800 });
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('cmside-dock-floating')).toBe(true);
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-x')).toBe('100px');
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-y')).toBe('50px');
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-w')).toBe('520px');
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-h')).toBe('360px');
  });

  it('renders a corner resizer element', () => {
    const { controller } = setup({ dockPosition: 'floating' });
    const refs = controller.create();
    expect(refs.panelEl.querySelector('.cmside-corner-resizer')).toBeTruthy();
  });

  it('toolbar drag updates floating CSS variables and persists on pointerup', async () => {
    const { container, controller, persistSettings, settings } = setup({
      dockPosition: 'floating',
      floatingX: 100,
      floatingY: 100,
      floatingWidth: 400,
      floatingHeight: 300,
    });
    stubRect(container, { left: 0, top: 0, width: 1200, height: 800 });
    const refs = controller.create();
    stubRect(refs.panelEl, { left: 100, top: 100, width: 400, height: 300 });

    const toolbar = refs.panelEl.querySelector('.cmside-toolbar') as HTMLElement;
    const titleEl = refs.panelEl.querySelector('.cmside-title') as HTMLElement;
    // Dispatch pointerdown on the title element (NOT inside .cmside-actions),
    // which qualifies as a valid drag origin.
    titleEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 150 }));

    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 250, clientY: 220 }));
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-x')).toBe('150px');
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-y')).toBe('170px');

    // Update stub so pointerup reads the post-move bounding box for persistence.
    stubRect(refs.panelEl, { left: 150, top: 170, width: 400, height: 300 });
    window.dispatchEvent(new PointerEvent('pointerup'));
    await new Promise((r) => setTimeout(r, 0));
    expect(settings.floatingX).toBe(150);
    expect(settings.floatingY).toBe(170);
    expect(persistSettings).toHaveBeenCalled();

    // Ensure toolbar variable name was used; suppress unused-var lint
    expect(toolbar).toBe(toolbar);
  });

  it('clicks on action buttons do not start a drag', async () => {
    const { container, controller, persistSettings } = setup({ dockPosition: 'floating', editorFontSize: 14, previewFontSize: 14 });
    stubRect(container, { left: 0, top: 0, width: 1200, height: 800 });
    const refs = controller.create();
    stubRect(refs.panelEl, { left: 100, top: 100, width: 400, height: 300 });
    persistSettings.mockClear();

    refs.closeBtn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 150 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 400, clientY: 400 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    await new Promise((r) => setTimeout(r, 0));
    expect(persistSettings).not.toHaveBeenCalled();
    // CSS vars unchanged from initial values applied on create
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-x')).toBe('80px');
  });

  it('drag is constrained so the panel cannot leave the viewport entirely', () => {
    const { container, controller } = setup({ dockPosition: 'floating', floatingX: 100, floatingY: 100, floatingWidth: 400, floatingHeight: 300 });
    stubRect(container, { left: 0, top: 0, width: 1000, height: 600 });
    const refs = controller.create();
    stubRect(refs.panelEl, { left: 100, top: 100, width: 400, height: 300 });
    const titleEl = refs.panelEl.querySelector('.cmside-title') as HTMLElement;

    titleEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 150 }));
    // Drag far past the right/bottom edge — should clamp to keep panel
    // partially inside (FLOATING_MARGIN = 80 inside container).
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 9999, clientY: 9999 }));
    const xPx = refs.panelEl.style.getPropertyValue('--cmside-float-x');
    const yPx = refs.panelEl.style.getPropertyValue('--cmside-float-y');
    expect(parseInt(xPx, 10)).toBe(1000 - 80); // container.width - FLOATING_MARGIN
    expect(parseInt(yPx, 10)).toBe(600 - 80);  // container.height - FLOATING_MARGIN
    window.dispatchEvent(new PointerEvent('pointerup'));
  });

  it('corner resizer updates W and H CSS vars and persists on pointerup', async () => {
    const { container, controller, persistSettings, settings } = setup({
      dockPosition: 'floating',
      floatingX: 100, floatingY: 100, floatingWidth: 400, floatingHeight: 300,
    });
    stubRect(container, { left: 0, top: 0, width: 1200, height: 800 });
    const refs = controller.create();
    stubRect(refs.panelEl, { left: 100, top: 100, width: 400, height: 300 });
    const corner = refs.panelEl.querySelector('.cmside-corner-resizer') as HTMLElement;

    corner.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 400 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 580, clientY: 460 }));
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-w')).toBe('480px');
    expect(refs.panelEl.style.getPropertyValue('--cmside-float-h')).toBe('360px');

    stubRect(refs.panelEl, { left: 100, top: 100, width: 480, height: 360 });
    window.dispatchEvent(new PointerEvent('pointerup'));
    await new Promise((r) => setTimeout(r, 0));
    expect(settings.floatingWidth).toBe(480);
    expect(settings.floatingHeight).toBe(360);
    expect(persistSettings).toHaveBeenCalled();
  });

  it('drag handler is a no-op when the panel is not in floating mode', () => {
    const { container, controller, persistSettings } = setup({ dockPosition: 'right', editorFontSize: 14, previewFontSize: 14 });
    stubRect(container, { left: 0, top: 0, width: 1200, height: 800 });
    const refs = controller.create();
    persistSettings.mockClear();
    const toolbar = refs.panelEl.querySelector('.cmside-toolbar') as HTMLElement;
    toolbar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 100, clientY: 100 }));
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 300 }));
    window.dispatchEvent(new PointerEvent('pointerup'));
    expect(persistSettings).not.toHaveBeenCalled();
  });
});

describe('PanelController.destroy', () => {
  it('removes the panel from the container', () => {
    const { container, controller } = setup();
    controller.create();
    expect(container.querySelector('.canvas-md-side-editor-panel')).toBeTruthy();
    controller.destroy();
    expect(container.querySelector('.canvas-md-side-editor-panel')).toBeFalsy();
  });

  it('detaches the close button click handler', () => {
    const { controller } = setup();
    const refs = controller.create();
    const cb = vi.fn();
    controller.onClose(cb);
    controller.destroy();
    refs.closeBtn.click();
    expect(cb).not.toHaveBeenCalled();
  });
});

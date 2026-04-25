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
    expect(refs.toggleBtn.classList.contains('cmside-toggle-preview-btn')).toBe(true);
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
    const { controller } = setup();
    const refs = controller.create();
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);
    controller.setPreviewCollapsed(true);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(true);
    controller.setPreviewCollapsed(false);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);
  });

  it('setReadOnly forces preview visible and adds read-only class', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setPreviewCollapsed(true);
    controller.setReadOnly(true);
    expect(refs.panelEl.classList.contains('read-only')).toBe(true);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);

    // Note: setReadOnly(true) clears the collapsed flag, so leaving read-only
    // does not restore the previous collapsed state — preview stays visible.
    controller.setReadOnly(false);
    expect(refs.panelEl.classList.contains('read-only')).toBe(false);
    expect(refs.panelEl.classList.contains('preview-collapsed')).toBe(false);
  });
});

describe('PanelController button handlers', () => {
  it('onToggle fires when toggle button is clicked', () => {
    const { controller } = setup();
    const refs = controller.create();
    const cb = vi.fn();
    controller.onToggle(cb);
    refs.toggleBtn.click();
    expect(cb).toHaveBeenCalledTimes(1);
  });

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

describe('PanelController.destroy', () => {
  it('removes the panel from the container', () => {
    const { container, controller } = setup();
    controller.create();
    expect(container.querySelector('.canvas-md-side-editor-panel')).toBeTruthy();
    controller.destroy();
    expect(container.querySelector('.canvas-md-side-editor-panel')).toBeFalsy();
  });

  it('detaches the toggle button click handler', () => {
    const { controller } = setup();
    const refs = controller.create();
    const cb = vi.fn();
    controller.onToggle(cb);
    controller.destroy();
    refs.toggleBtn.click();
    expect(cb).not.toHaveBeenCalled();
  });
});

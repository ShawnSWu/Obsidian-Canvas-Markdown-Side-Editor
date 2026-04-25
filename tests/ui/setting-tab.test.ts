import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App } from 'obsidian';
import { CanvasMdSideEditorSettingTab } from '../../src/ui/setting-tab';
import { DEFAULT_SETTINGS, type CanvasMdSideEditorSettings } from '../../src/settings';

beforeEach(() => {
  document.body.innerHTML = '';
});

function setup(overrides: Partial<CanvasMdSideEditorSettings> = {}) {
  const settings: CanvasMdSideEditorSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const plugin = {
    settings,
    saveData: vi.fn(async () => {}),
    setReadOnly: vi.fn(),
    applyFontSizes: vi.fn(),
  };
  const tab = new CanvasMdSideEditorSettingTab(new App(), plugin as any);
  tab.display();
  return { tab, plugin, settings };
}

function nthInput(container: HTMLElement, index: number): HTMLInputElement {
  return container.querySelectorAll('input')[index] as HTMLInputElement;
}

function fire(input: HTMLInputElement, value: string | boolean) {
  if (typeof value === 'boolean') {
    input.checked = value;
    input.dispatchEvent(new Event('change'));
  } else {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
}

describe('CanvasMdSideEditorSettingTab.display', () => {
  it('renders one input per setting', () => {
    const { tab } = setup();
    // 4 number inputs (panel width, debounce, editor font, preview font)
    // + 2 checkboxes (read only, show card title)
    expect(tab.containerEl.querySelectorAll('input').length).toBe(6);
  });
});

describe('Default panel width input', () => {
  it('persists valid values above the 240 minimum', async () => {
    const { tab, plugin, settings } = setup({ defaultPanelWidth: 480 });
    const input = nthInput(tab.containerEl, 0);
    fire(input, '600');
    expect(settings.defaultPanelWidth).toBe(600);
    expect(plugin.saveData).toHaveBeenCalledWith(settings);
  });

  it('rejects values at or below the minimum', () => {
    const { tab, plugin, settings } = setup({ defaultPanelWidth: 480 });
    const input = nthInput(tab.containerEl, 0);
    fire(input, '200');
    expect(settings.defaultPanelWidth).toBe(480);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});

describe('Preview debounce input', () => {
  it('persists non-negative integers', () => {
    const { tab, plugin, settings } = setup({ previewDebounceMs: 80 });
    const input = nthInput(tab.containerEl, 1);
    fire(input, '150');
    expect(settings.previewDebounceMs).toBe(150);
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('rejects negative values', () => {
    const { tab, plugin, settings } = setup({ previewDebounceMs: 80 });
    const input = nthInput(tab.containerEl, 1);
    fire(input, '-10');
    expect(settings.previewDebounceMs).toBe(80);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});

// Handlers in setting-tab await saveData before invoking the plugin callback,
// so tests must yield a microtask before asserting on the callback.
const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0));

describe('Read only toggle', () => {
  it('persists the toggle state and calls setReadOnly', async () => {
    const { tab, plugin, settings } = setup({ readOnly: false });
    const checkbox = nthInput(tab.containerEl, 2);
    fire(checkbox, true);
    expect(settings.readOnly).toBe(true);
    await flushAsync();
    expect(plugin.saveData).toHaveBeenCalled();
    expect(plugin.setReadOnly).toHaveBeenCalledWith(true);
  });
});

describe('Font size inputs', () => {
  it('persists editor font size and re-applies', async () => {
    const { tab, plugin, settings } = setup({ editorFontSize: 16 });
    const input = nthInput(tab.containerEl, 4);
    fire(input, '14');
    expect(settings.editorFontSize).toBe(14);
    await flushAsync();
    expect(plugin.applyFontSizes).toHaveBeenCalled();
  });

  it('persists preview font size and re-applies', async () => {
    const { tab, plugin, settings } = setup({ previewFontSize: 16 });
    const input = nthInput(tab.containerEl, 5);
    fire(input, '18');
    expect(settings.previewFontSize).toBe(18);
    await flushAsync();
    expect(plugin.applyFontSizes).toHaveBeenCalled();
  });

  it('rejects font sizes below 8 px', async () => {
    const { tab, plugin, settings } = setup({ editorFontSize: 16 });
    const input = nthInput(tab.containerEl, 4);
    fire(input, '4');
    expect(settings.editorFontSize).toBe(16);
    await flushAsync();
    expect(plugin.applyFontSizes).not.toHaveBeenCalled();
  });
});

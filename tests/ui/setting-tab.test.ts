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
    applyDockPosition: vi.fn(),
  };
  const tab = new CanvasMdSideEditorSettingTab(new App(), plugin as any);
  tab.display();
  return { tab, plugin, settings };
}

// Input slots in display order:
//   dockPosition (select, not <input>)
//   defaultPanelWidth (input #0)
//   defaultPanelHeight (input #1)
//   previewDebounceMs (input #2)
//   readOnly (input #3, checkbox)
//   headlineMode (input #4, checkbox)
//   headlineH1Size (input #5)
//   editorFontSize (input #6)
//   previewFontSize (input #7)

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

const flushAsync = () => new Promise<void>((r) => setTimeout(r, 0));

describe('CanvasMdSideEditorSettingTab.display', () => {
  it('renders the expected control set', () => {
    const { tab } = setup();
    // 6 number inputs + 2 checkboxes = 8 <input> elements
    expect(tab.containerEl.querySelectorAll('input').length).toBe(8);
    // 1 dropdown (<select>) for dock position
    expect(tab.containerEl.querySelectorAll('select').length).toBe(1);
  });
});

describe('Dock position dropdown (issue #11)', () => {
  it('initialises to the persisted value', () => {
    const { tab } = setup({ dockPosition: 'bottom' });
    const select = tab.containerEl.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('bottom');
  });

  it('persists the new value and calls applyDockPosition', async () => {
    const { tab, plugin, settings } = setup({ dockPosition: 'right' });
    const select = tab.containerEl.querySelector('select') as HTMLSelectElement;
    select.value = 'left';
    select.dispatchEvent(new Event('change'));
    await flushAsync();
    expect(settings.dockPosition).toBe('left');
    expect(plugin.saveData).toHaveBeenCalled();
    expect(plugin.applyDockPosition).toHaveBeenCalled();
  });

  it('rejects values outside the allowed enum', async () => {
    const { tab, plugin, settings } = setup({ dockPosition: 'right' });
    const select = tab.containerEl.querySelector('select') as HTMLSelectElement;
    // Force a non-enum value past the dropdown (e.g. corrupted persisted data).
    Object.defineProperty(select, 'value', { value: 'middle', configurable: true });
    select.dispatchEvent(new Event('change'));
    await flushAsync();
    expect(settings.dockPosition).toBe('right');
    expect(plugin.applyDockPosition).not.toHaveBeenCalled();
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

describe('Default panel height input (issue #11)', () => {
  it('persists valid values above the 160 minimum', () => {
    const { tab, plugin, settings } = setup({ defaultPanelHeight: 360 });
    const input = nthInput(tab.containerEl, 1);
    fire(input, '420');
    expect(settings.defaultPanelHeight).toBe(420);
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('rejects values at or below the minimum', () => {
    const { tab, plugin, settings } = setup({ defaultPanelHeight: 360 });
    const input = nthInput(tab.containerEl, 1);
    fire(input, '100');
    expect(settings.defaultPanelHeight).toBe(360);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});

describe('Preview debounce input', () => {
  it('persists non-negative integers', () => {
    const { tab, plugin, settings } = setup({ previewDebounceMs: 80 });
    const input = nthInput(tab.containerEl, 2);
    fire(input, '150');
    expect(settings.previewDebounceMs).toBe(150);
    expect(plugin.saveData).toHaveBeenCalled();
  });

  it('rejects negative values', () => {
    const { tab, plugin, settings } = setup({ previewDebounceMs: 80 });
    const input = nthInput(tab.containerEl, 2);
    fire(input, '-10');
    expect(settings.previewDebounceMs).toBe(80);
    expect(plugin.saveData).not.toHaveBeenCalled();
  });
});

describe('Read only toggle', () => {
  it('persists the toggle state and calls setReadOnly', async () => {
    const { tab, plugin, settings } = setup({ readOnly: false });
    const checkbox = nthInput(tab.containerEl, 3);
    fire(checkbox, true);
    expect(settings.readOnly).toBe(true);
    await flushAsync();
    expect(plugin.saveData).toHaveBeenCalled();
    expect(plugin.setReadOnly).toHaveBeenCalledWith(true);
  });
});

describe('Headline mode toggle (issue #13)', () => {
  it('persists the toggle state and calls applyHeadlineMode', async () => {
    const settings: CanvasMdSideEditorSettings = { ...DEFAULT_SETTINGS, headlineMode: false };
    const plugin = {
      settings,
      saveData: vi.fn(async () => {}),
      setReadOnly: vi.fn(),
      applyFontSizes: vi.fn(),
      applyDockPosition: vi.fn(),
      applyHeadlineMode: vi.fn(),
    };
    const tab = new CanvasMdSideEditorSettingTab(new App(), plugin as any);
    tab.display();
    const checkbox = nthInput(tab.containerEl, 4);
    fire(checkbox, true);
    expect(settings.headlineMode).toBe(true);
    await flushAsync();
    expect(plugin.saveData).toHaveBeenCalled();
    expect(plugin.applyHeadlineMode).toHaveBeenCalled();
  });
});

describe('Headline title size input (issue #13)', () => {
  function setupWithApply(overrides: Partial<CanvasMdSideEditorSettings> = {}) {
    const settings: CanvasMdSideEditorSettings = { ...DEFAULT_SETTINGS, ...overrides };
    const plugin = {
      settings,
      saveData: vi.fn(async () => {}),
      setReadOnly: vi.fn(),
      applyFontSizes: vi.fn(),
      applyDockPosition: vi.fn(),
      applyHeadlineMode: vi.fn(),
    };
    const tab = new CanvasMdSideEditorSettingTab(new App(), plugin as any);
    tab.display();
    return { tab, plugin, settings };
  }

  it('persists title size and re-applies headline mode', async () => {
    const { tab, plugin, settings } = setupWithApply({ headlineMode: true, headlineH1Size: 22 });
    const input = nthInput(tab.containerEl, 5);
    fire(input, '30');
    expect(settings.headlineH1Size).toBe(30);
    await flushAsync();
    expect(plugin.applyHeadlineMode).toHaveBeenCalled();
  });

  it('rejects title sizes outside 5–60', async () => {
    const { tab, plugin, settings } = setupWithApply({ headlineMode: true, headlineH1Size: 22 });
    const input = nthInput(tab.containerEl, 5);
    fire(input, '999');
    expect(settings.headlineH1Size).toBe(22);
    await flushAsync();
    expect(plugin.applyHeadlineMode).not.toHaveBeenCalled();
  });

  it('starts disabled when headline mode is off', () => {
    const { tab } = setupWithApply({ headlineMode: false });
    const input = nthInput(tab.containerEl, 5);
    expect(input.disabled).toBe(true);
    // its row should carry the visual-disabled class
    const settingRow = input.closest('.setting-item') as HTMLElement | null;
    expect(settingRow?.classList.contains('cmside-setting-disabled')).toBe(true);
  });

  it('starts enabled when headline mode is on', () => {
    const { tab } = setupWithApply({ headlineMode: true });
    const input = nthInput(tab.containerEl, 5);
    expect(input.disabled).toBe(false);
    const settingRow = input.closest('.setting-item') as HTMLElement | null;
    expect(settingRow?.classList.contains('cmside-setting-disabled')).toBe(false);
  });

  it('toggles the disabled state when headline mode is flipped', async () => {
    const { tab } = setupWithApply({ headlineMode: false });
    const titleInput = nthInput(tab.containerEl, 5);
    const headlineToggle = nthInput(tab.containerEl, 4);
    expect(titleInput.disabled).toBe(true);
    fire(headlineToggle, true);
    await flushAsync();
    expect(titleInput.disabled).toBe(false);
    fire(headlineToggle, false);
    await flushAsync();
    expect(titleInput.disabled).toBe(true);
  });
});

describe('Font size inputs', () => {
  it('persists editor font size and re-applies', async () => {
    const { tab, plugin, settings } = setup({ editorFontSize: 16 });
    const input = nthInput(tab.containerEl, 6);
    fire(input, '14');
    expect(settings.editorFontSize).toBe(14);
    await flushAsync();
    expect(plugin.applyFontSizes).toHaveBeenCalled();
  });

  it('persists preview font size and re-applies', async () => {
    const { tab, plugin, settings } = setup({ previewFontSize: 16 });
    const input = nthInput(tab.containerEl, 7);
    fire(input, '18');
    expect(settings.previewFontSize).toBe(18);
    await flushAsync();
    expect(plugin.applyFontSizes).toHaveBeenCalled();
  });

  it('rejects font sizes below 8 px', async () => {
    const { tab, plugin, settings } = setup({ editorFontSize: 16 });
    const input = nthInput(tab.containerEl, 6);
    fire(input, '4');
    expect(settings.editorFontSize).toBe(16);
    await flushAsync();
    expect(plugin.applyFontSizes).not.toHaveBeenCalled();
  });
});

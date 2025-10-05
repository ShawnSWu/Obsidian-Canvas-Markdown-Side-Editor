import { App, PluginSettingTab, Setting } from 'obsidian';
import type { CanvasMdSideEditorSettings } from '../settings';

// Minimal plugin surface used by this settings tab
interface CanvasMdSideEditorPluginLike {
  settings: CanvasMdSideEditorSettings;
  saveData(data: unknown): Promise<void>;
  setReadOnly?(v: boolean): void;
  applyFontSizes?(): void;
}

export class CanvasMdSideEditorSettingTab extends PluginSettingTab {
  plugin: CanvasMdSideEditorPluginLike;

  constructor(app: App, plugin: CanvasMdSideEditorPluginLike) {
    // cast only to satisfy PluginSettingTab's base constructor typing; avoid 'any'
    super(app, plugin as unknown as import('obsidian').Plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Canvas MD Side Editor' });

    new Setting(containerEl)
      .setName('Default panel width')
      .setDesc('Initial width of the side panel (in pixels). Dragging the panel edge will persist the new width.')
      .addText((tb) => {
        tb.inputEl.type = 'number';
        tb.setValue(String(this.plugin.settings.defaultPanelWidth));
        tb.onChange(async (v) => {
          const n = Number(v);
          if (isFinite(n) && n > 240) {
            this.plugin.settings.defaultPanelWidth = Math.round(n);
            await this.plugin.saveData(this.plugin.settings);
          }
        });
      });

    new Setting(containerEl)
      .setName('Preview debounce (ms)')
      .setDesc('Delay before updating the preview on edits. Increase for very large notes.')
      .addText((tb) => {
        tb.inputEl.type = 'number';
        tb.setValue(String(this.plugin.settings.previewDebounceMs));
        tb.onChange(async (v) => {
          const n = Number(v);
          if (isFinite(n) && n >= 0) {
            this.plugin.settings.previewDebounceMs = Math.round(n);
            await this.plugin.saveData(this.plugin.settings as CanvasMdSideEditorSettings);
          }
        });
      });

    new Setting(containerEl)
      .setName('Read only')
      .setDesc('When enabled, the side panel shows only the Preview pane (no editor).')
      .addToggle((tg) => {
        tg.setValue(!!this.plugin.settings.readOnly);
        tg.onChange(async (val) => {
          this.plugin.settings.readOnly = !!val;
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.setReadOnly?.(!!val);
        });
      });

    containerEl.createEl('h3', { text: 'Typography' });

    new Setting(containerEl)
      .setName('Editor font size (px)')
      .setDesc('Set the font size for the side editor. Initially uses your theme’s current size when the panel first opens.')
      .addText((tb) => {
        tb.inputEl.type = 'number';
        tb.inputEl.min = '8';
        tb.setValue(String(this.plugin.settings.editorFontSize ?? 16));
        tb.onChange(async (v) => {
          const n = Number(v);
          if (isFinite(n) && n >= 8) {
            this.plugin.settings.editorFontSize = Math.round(n);
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyFontSizes?.();
          }
        });
      });

    new Setting(containerEl)
      .setName('Preview font size (px)')
      .setDesc('Set the font size for the preview pane. Initially uses your theme’s current size when the panel first opens.')
      .addText((tb) => {
        tb.inputEl.type = 'number';
        tb.inputEl.min = '8';
        tb.setValue(String(this.plugin.settings.previewFontSize ?? 16));
        tb.onChange(async (v) => {
          const n = Number(v);
          if (isFinite(n) && n >= 8) {
            this.plugin.settings.previewFontSize = Math.round(n);
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyFontSizes?.();
          }
        });
      });
  }
}

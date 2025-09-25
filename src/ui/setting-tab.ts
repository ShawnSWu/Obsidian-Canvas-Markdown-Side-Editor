import { App, PluginSettingTab, Setting } from 'obsidian';
import type { CanvasMdSideEditorSettings } from '../settings';

export class CanvasMdSideEditorSettingTab extends PluginSettingTab {
  // Avoid circular type dependency on the plugin class by using 'any'
  plugin: any;

  constructor(app: App, plugin: any) {
    super(app, plugin);
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
            await this.plugin.saveData(this.plugin.settings as CanvasMdSideEditorSettings);
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
          await this.plugin.saveData(this.plugin.settings as CanvasMdSideEditorSettings);
          try { this.plugin.panelController?.setReadOnly?.(!!val); } catch {}
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
            await this.plugin.saveData(this.plugin.settings as CanvasMdSideEditorSettings);
            try { this.plugin.panelController?.applyFontSizes?.(); } catch {}
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
            await this.plugin.saveData(this.plugin.settings as CanvasMdSideEditorSettings);
            try { this.plugin.panelController?.applyFontSizes?.(); } catch {}
          }
        });
      });
  }
}

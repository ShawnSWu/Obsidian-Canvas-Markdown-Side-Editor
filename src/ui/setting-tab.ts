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
      .setName('Start with preview hidden')
      .setDesc('When opening the panel, start with the preview pane collapsed by default.')
      .addToggle((tg) => {
        tg.setValue(this.plugin.settings.defaultPreviewCollapsed);
        tg.onChange(async (val) => {
          this.plugin.settings.defaultPreviewCollapsed = !!val;
          await this.plugin.saveData(this.plugin.settings as CanvasMdSideEditorSettings);
        });
      });
  }
}

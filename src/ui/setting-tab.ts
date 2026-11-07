import { App, PluginSettingTab, Setting } from 'obsidian';
import { DEFAULT_SETTINGS, HEADLINE_SIZE_LIMITS, type CanvasMdSideEditorSettings } from '../settings';
import type { ViewMode } from '../view-mode';

// Minimal plugin surface used by this settings tab
interface CanvasMdSideEditorPluginLike {
  settings: CanvasMdSideEditorSettings;
  saveData(data: unknown): Promise<void>;
  setViewMode?(mode: ViewMode): Promise<void>;
  applyFontSizes?(): void;
  refreshCardTitle?(): void;
  applyDockPosition?(): void;
  applyHeadlineMode?(): void;
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
      .setName('Dock position')
      .setDesc('Which edge of the canvas the side panel docks against.')
      .addDropdown((dd) => {
        dd.addOption('right', 'Right');
        dd.addOption('left', 'Left');
        dd.addOption('top', 'Top');
        dd.addOption('bottom', 'Bottom');
        dd.addOption('floating', 'Floating');
        dd.setValue(this.plugin.settings.dockPosition ?? 'right');
        dd.onChange(async (v: string) => {
          const allowed = ['left', 'right', 'top', 'bottom', 'floating'] as const;
          if ((allowed as readonly string[]).includes(v)) {
            this.plugin.settings.dockPosition = v as typeof allowed[number];
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyDockPosition?.();
          }
        });
      });

    new Setting(containerEl)
      .setName('Default panel width')
      .setDesc('Initial width of the side panel (in pixels) when docked left or right. Dragging the panel edge persists the new width.')
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
      .setName('Default panel height')
      .setDesc('Initial height of the side panel (in pixels) when docked top or bottom. Dragging the panel edge persists the new height.')
      .addText((tb) => {
        tb.inputEl.type = 'number';
        tb.setValue(String(this.plugin.settings.defaultPanelHeight));
        tb.onChange(async (v) => {
          const n = Number(v);
          if (isFinite(n) && n > 160) {
            this.plugin.settings.defaultPanelHeight = Math.round(n);
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
      .setName('Default view mode')
      .setDesc('Sets the initial view mode for newly opened cards. You can change it any time from the toolbar. "Live Preview" only applies to file-type cards; text cards transparently use Editor.')
      .addDropdown((dd) => {
        dd.addOption('editor', 'Editor');
        dd.addOption('live', 'Live Preview');
        dd.addOption('preview', 'Preview');
        dd.setValue(this.plugin.settings.viewMode);
        dd.onChange(async (val) => {
          const mode = val as ViewMode;
          await this.plugin.setViewMode?.(mode);
        });
      });

    // Headline sizing is only meaningful when headline mode is on, so these
    // controls are disabled until the toggle is enabled. Each text tier has
    // its own slider on the same scale: equal values render at equal size.
    const headlineSliderEls: HTMLElement[] = [];
    const headlineSettingEls: HTMLElement[] = [];
    const syncHeadlineSizesEnabled = (enabled: boolean) => {
      for (const el of headlineSliderEls) (el as HTMLInputElement).disabled = !enabled;
      for (const el of headlineSettingEls) el.classList.toggle('cmside-setting-disabled', !enabled);
    };
    type HeadlineSizeKey = 'headlineH1Size' | 'headlineBadgeSize' | 'headlineCategorySize' | 'headlineSubtitleSize';
    const addHeadlineSizeSlider = (name: string, desc: string, key: HeadlineSizeKey) => {
      const fallback = DEFAULT_SETTINGS[key] ?? HEADLINE_SIZE_LIMITS[key].min;
      const { min, max } = HEADLINE_SIZE_LIMITS[key];
      const setting = new Setting(containerEl).setName(name).setDesc(desc).addSlider((sl) => {
        sl.setLimits(min, max, 1)
          .setValue(Math.round(this.plugin.settings[key] ?? fallback))
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings[key] = Math.max(min, Math.min(max, Math.round(v)));
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyHeadlineMode?.();
          });
        headlineSliderEls.push(sl.sliderEl);
      });
      headlineSettingEls.push(setting.settingEl);
    };

    new Setting(containerEl)
      .setName('Headline mode')
      .setDesc('Render every Canvas card as a compact dashboard card: the first H1 becomes the main headline, and the first [!note] callout below it provides an optional "ID | Category" metadata row and the subtitle. Full content stays accessible through inline editing or the side editor. Turn off here to restore normal cards.')
      .addToggle((tg) => {
        tg.setValue(!!this.plugin.settings.headlineMode);
        tg.onChange(async (val) => {
          this.plugin.settings.headlineMode = !!val;
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.applyHeadlineMode?.();
          syncHeadlineSizesEnabled(!!val);
        });
      });

    addHeadlineSizeSlider('Headline title size', 'Size of the main headline (the first H1), relative to the card\'s shorter side. Default 25 is the middle of the range.', 'headlineH1Size');
    addHeadlineSizeSlider('Headline badge size', 'Size of the identifier badge (e.g. P01) on the same scale as the headline. Default 16 is the middle of the range.', 'headlineBadgeSize');
    addHeadlineSizeSlider('Headline category size', 'Size of the category label next to the badge, on the same scale as the headline. Default 18 is the middle of the range.', 'headlineCategorySize');
    addHeadlineSizeSlider('Headline subtitle size', 'Size of the subtitle (the [!note] callout body), on the same scale as the headline. Default 11 is the middle of the range.', 'headlineSubtitleSize');
    syncHeadlineSizesEnabled(!!this.plugin.settings.headlineMode);

    containerEl.createEl('h3', { text: 'Typography' });

    new Setting(containerEl)
      .setName('Font size (px)')
      .setDesc('Font size for the side panel. Both the editor and preview share it; the toolbar slider adjusts this same value. Initially uses your theme’s size when the panel first opens.')
      .addText((tb) => {
        tb.inputEl.type = 'number';
        tb.inputEl.min = '8';
        tb.setValue(String(this.plugin.settings.fontSize ?? 16));
        tb.onChange(async (v) => {
          const n = Number(v);
          if (isFinite(n) && n >= 8) {
            this.plugin.settings.fontSize = Math.round(n);
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyFontSizes?.();
          }
        });
      });

    new Setting(containerEl)
      .setName('Table font scale')
      .setDesc('Rendered table font size as a percentage of the panel font. Applies to tables in Preview and Live Preview.')
      .addSlider((sl) => {
        sl.setLimits(50, 100, 5)
          .setValue(Math.round((this.plugin.settings.tableFontScale ?? 0.75) * 100))
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.tableFontScale = v / 100;
            await this.plugin.saveData(this.plugin.settings);
            this.plugin.applyFontSizes?.();
          });
      });
  }
}

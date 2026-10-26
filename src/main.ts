/*
 Canvas Markdown Side Editor
 - Detect clicks on Canvas Markdown (text) cards
 - Open a right-side editor styled like Obsidian
 - Save edits back to the Canvas file on background click or switching cards

 This file is the plugin's lifecycle + wiring only. Feature logic lives in:
   core/editor-session.ts    open/save/close state machine + panel lifecycle
   canvas/interaction.ts     canvas DOM event routing + single-click detection
   canvas/{geometry,data,hit-test}.ts   canvas geometry / data / node lookup
   editor/*                  editor primitives (CM6 + Live Preview leaf host)
   features/*                orthogonal features (card title, paste, headline)
   ui/*                      panel, preview, settings tab
*/
import { Plugin } from 'obsidian';
import { CanvasMdSideEditorSettings, DEFAULT_SETTINGS, migrateLegacyFontSizes } from './settings';
import { migrateLegacyReadOnly, type ViewMode } from './view-mode';
import type { CanvasNode, CanvasLikeView } from './types';
import { CanvasMdSideEditorSettingTab } from './ui/setting-tab';
import { registerCommands } from './commands/register';
import { EditorSession } from './core/editor-session';
import { CanvasInteraction, getActiveCanvasView } from './canvas/interaction';
import { applyHeadlineMode as applyHeadlineModeStyles, removeHeadlineMode } from './features/headline-mode';

export default class CanvasMdSideEditorPlugin extends Plugin {
  public settings!: CanvasMdSideEditorSettings;

  private session!: EditorSession;
  private interaction!: CanvasInteraction;

  async onload() {
    // Load settings and register settings tab
    let raw: Record<string, unknown> = {};
    try {
      const data = (await this.loadData()) as Record<string, unknown> | null;
      if (data && typeof data === 'object') raw = data;
    } catch {}

    // Issue #16 migration: collapse legacy `readOnly` boolean into
    // `viewMode` BEFORE merging with DEFAULT_SETTINGS, so the default
    // `viewMode: 'live'` doesn't mask a legacy `readOnly: true` save.
    // Also retires the removed 'both' split mode to 'live', and folds the
    // old font settings (editorFontSize / baseFontSize × panelFontScale)
    // into the single `fontSize` px value.
    // Idempotent; running on already-migrated data is a no-op.
    const hadLegacy =
      'readOnly' in raw
      || raw.viewMode === 'both'
      || 'editorFontSize' in raw
      || 'previewFontSize' in raw
      || 'baseFontSize' in raw
      || 'panelFontScale' in raw;
    migrateLegacyReadOnly(raw);
    migrateLegacyFontSizes(raw);
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw) as CanvasMdSideEditorSettings;
    if (hadLegacy) {
      try { await this.saveData(this.settings); } catch {}
    }

    this.addSettingTab(new CanvasMdSideEditorSettingTab(this.app, this));

    // Apply headline-mode body class on load so it covers any canvas that's
    // already open before our event listeners fire.
    applyHeadlineModeStyles(this.settings);

    // Core state machine + canvas event routing
    this.session = new EditorSession({
      app: this.app,
      plugin: this,
      getSettings: () => this.settings,
      persistSettings: (s) => this.saveData(s),
    });
    this.interaction = new CanvasInteraction(this.app, {
      getPanelEl: () => this.session.panel,
      getOpenNodeId: () => this.session.openNodeId,
      save: (view) => this.session.save(view),
      saveAndClose: (view) => this.session.saveAndClose(view),
      openNode: (view, node) => this.session.open(view, node),
    });

    // Track canvas changes
    const attach = async () => {
      const view = getActiveCanvasView(this.app);
      if (view) {
        await this.attachToCanvas(view);
      } else if (this.session.panel) {
        // Left the Canvas: persist any unsaved edits to the previous canvas,
        // then drop panel state so a fresh one is built when we return.
        const prev = this.session.boundView;
        try { if (prev) await this.session.save(prev); } catch {}
        this.interaction.detach();
        this.session.teardown();
        this.session.boundView = null;
      }
    };
    // Initial attach if already on a Canvas
    void attach();

    // Register commands
    registerCommands(this);

    // Re-attach on leaf/view changes
    const ref1 = this.app.workspace.on('active-leaf-change', () => { void attach(); });
    const ref2 = this.app.workspace.on('layout-change', () => { void attach(); });
    this.registerEvent(ref1);
    this.registerEvent(ref2);

    // When the leaf-hosted editor changes, schedule a preview re-render so
    // the right-hand pane stays in sync. The 'editor-change' event fires
    // for any markdown view in the workspace; the session filters to the
    // file it currently has embedded.
    const refEdit = this.app.workspace.on('editor-change', (_editor, info) => {
      this.session.handleWorkspaceEditorChange(info);
    });
    this.registerEvent(refEdit);
  }

  onunload() {
    removeHeadlineMode();
    this.session?.teardown();
    this.interaction?.detach();
  }

  // Attach the interaction layer to a canvas view. If the existing panel
  // was attached to a destroyed/different container (e.g. user left and
  // returned to a Canvas leaf that Obsidian rebuilt), save any pending
  // edits to the previous canvas and drop the stale panel so the session
  // can rebuild it under the new container. Fixes issue #8.
  private async attachToCanvas(view: CanvasLikeView) {
    this.interaction.detach();
    const container: HTMLElement | undefined = view?.containerEl;
    const panel = this.session.panel;
    const stale = !!panel && (!panel.isConnected || (!!container && panel.parentElement !== container));
    if (stale) {
      const prev = this.session.boundView;
      if (prev && prev !== view) {
        try { await this.session.save(prev); } catch {}
      }
      this.session.teardown();
    }
    this.session.boundView = view;
    this.interaction.attach(view);
  }

  // ---------------------------------------------------------------------
  // Internal delegation shims. Kept as runtime members because the
  // integration tests drive the plugin through them (via `as any`).
  // ---------------------------------------------------------------------

  private async openEditorForNode(view: CanvasLikeView, node: CanvasNode): Promise<void> {
    return this.session.open(view, node);
  }

  private get panelEl(): HTMLElement | null {
    return this.session?.panel ?? null;
  }

  private get previewRootEl(): HTMLElement | null {
    return this.session?.previewRoot ?? null;
  }

  private get cmView() {
    return this.session?.cmView ?? null;
  }

  // ---------------------------------------------------------------------
  // Public API used by commands and the settings tab
  // ---------------------------------------------------------------------

  public cycleViewMode(): void {
    this.session.cycleViewMode();
  }

  public async setViewMode(mode: ViewMode): Promise<void> {
    await this.session.setViewMode(mode);
  }

  public applyFontSizes(): void {
    this.session.applyFontSizes();
  }

  public applyDockPosition(): void {
    this.session.applyDockPosition();
  }

  public refreshCardTitle(): void {
    this.session.refreshCardTitle();
  }

  public applyHeadlineMode(): void {
    applyHeadlineModeStyles(this.settings);
  }
}

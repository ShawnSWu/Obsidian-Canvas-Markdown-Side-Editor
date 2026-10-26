// EditorSession — the state machine at the heart of the plugin.
//
// Owns everything about "a card is open in the side panel":
//   - panel lifecycle (create / teardown via PanelController)
//   - which canvas node is open, and which canvas view it belongs to
//   - the active editor primitive (CM6 for text cards, MarkdownLeafHost
//     Live Preview for file cards in 'live' mode) behind EditorHost
//   - the generation counter that keeps rapid consecutive opens from
//     interleaving their async reads
//   - saving edits back to the canvas file, preview rendering, the
//     editable card title, pasted images, and view-mode transitions
//
// CanvasInteraction (canvas/interaction.ts) routes raw pointer events into
// open()/save()/saveAndClose(); the plugin class (main.ts) only wires
// workspace lifecycle events to the session.
import { App, Notice, Plugin, TFile, setIcon } from 'obsidian';
import type { EditorView } from '@codemirror/view';
import type { CanvasMdSideEditorSettings } from '../settings';
import { nextViewMode, type ViewMode } from '../view-mode';
import type { CanvasNode, CanvasLikeView } from '../types';
import { PanelController } from '../ui/panel';
import { PreviewHelper } from '../ui/preview';
import { attachPreviewLinkInterop } from '../ui/preview-link-interop';
import { Cm6EditorHost } from '../editor/cm6-host';
import { MarkdownLeafHost } from '../editor/leaf-host';
import { resolveVaultFile, writeNodeContent } from '../canvas/data';
import { buildRenamePath, extractTitleFromText, patchFirstLineWithTitle } from '../features/card-title';
import { savePastedImagesToVault } from '../features/paste-images';
import { SideEditorScope } from './keymap-scope';

// Toolbar icon + tooltip per current viewMode (issue #16, #20).
// Cycle order: editor → live → preview → editor.
const MODE_ICONS: Record<ViewMode, string> = {
  editor: 'pencil',
  live: 'square-pen',
  preview: 'book-open',
};
const MODE_TOOLTIPS: Record<ViewMode, string> = {
  editor: 'View: Editor only — click for Live Preview',
  live: 'View: Live Preview — click for Preview',
  preview: 'View: Preview only — click for Editor',
};

export interface EditorSessionDeps {
  app: App;
  plugin: Plugin;
  getSettings: () => CanvasMdSideEditorSettings;
  persistSettings: (s: CanvasMdSideEditorSettings) => Promise<void> | void;
}

export class EditorSession {
  private app: App;
  private plugin: Plugin;
  private getSettings: () => CanvasMdSideEditorSettings;
  private persistSettings: (s: CanvasMdSideEditorSettings) => Promise<void> | void;

  // Panel
  private panelController: PanelController | null = null;
  private panelEl: HTMLElement | null = null;
  private editorRootEl: HTMLElement | null = null;
  private previewRootEl: HTMLElement | null = null;
  private previewHelper: PreviewHelper | null = null;
  private applyToolbarIcon: ((mode: ViewMode) => void) | null = null;
  private sideEditorScope: SideEditorScope | null = null;

  // Editor primitives
  private cm6Host: Cm6EditorHost = new Cm6EditorHost();
  private leafHost: MarkdownLeafHost | null = null;
  // Whether the currently open card is being rendered through the
  // MarkdownLeafHost (file card) vs. the CM6 editor (text card).
  private usingLeafHost: boolean = false;

  // Open-node state
  private currentNodeId: string | null = null;
  private currentNode: CanvasNode | null = null;
  private currentCanvasFile: TFile | null = null;
  private currentSourcePath: string = '';

  // The canvas view the panel is currently bound to. Set by the plugin's
  // canvas-attachment coordinator; used to save unsaved edits before
  // tearing down a stale panel (issue #8) and to re-open on view-mode
  // transitions.
  public boundView: CanvasLikeView | null = null;

  // Monotonically-increasing generation counter for open().
  // Concurrent rapid clicks (e.g. fast double-click on one card, then a
  // click on another) can fire multiple open() invocations that all
  // suspend on `await vault.read(...)`. Reads can complete out of order,
  // so an earlier-issued call's resume could clobber a later-issued call's
  // render — including writing the wrong content to the wrong card on save
  // (CM6 mode) or just showing the wrong preview (preview-only view mode).
  // Each call captures its own myGen on entry and bails after every await
  // if a newer call has bumped the counter.
  private openGeneration: number = 0;

  constructor(deps: EditorSessionDeps) {
    this.app = deps.app;
    this.plugin = deps.plugin;
    this.getSettings = deps.getSettings;
    this.persistSettings = deps.persistSettings;
  }

  // ---------------------------------------------------------------------
  // Read-only state accessors (used by CanvasInteraction and tests)
  // ---------------------------------------------------------------------

  get panel(): HTMLElement | null {
    return this.panelEl;
  }

  get previewRoot(): HTMLElement | null {
    return this.previewRootEl;
  }

  get cmView(): EditorView | null {
    return this.cm6Host.view;
  }

  get isUsingLeafHost(): boolean {
    return this.usingLeafHost;
  }

  get sourcePath(): string {
    return this.currentSourcePath;
  }

  get openNodeId(): string | null {
    return this.currentNodeId;
  }

  // ---------------------------------------------------------------------
  // Panel lifecycle
  // ---------------------------------------------------------------------

  private ensurePanel(view: CanvasLikeView): void {
    if (this.panelEl) return;
    const container: HTMLElement | undefined = view.containerEl;
    if (!container) return;
    if (!this.panelController) {
      this.panelController = new PanelController(
        container,
        this.getSettings,
        (s) => this.persistSettings(s),
      );
      const refs = this.panelController.create();
      this.panelEl = refs.panelEl;
      this.editorRootEl = refs.editorRootEl;
      this.previewRootEl = refs.previewRootEl;
      if (!this.previewHelper) this.previewHelper = new PreviewHelper(this.app, this.plugin);
      this.previewHelper.setContainer(this.previewRootEl!);
      attachPreviewLinkInterop({
        app: this.app,
        plugin: this.plugin,
        container: this.previewRootEl!,
        getSourcePath: () => this.currentSourcePath,
      });

      const applyIcon = (mode: ViewMode) => {
        setIcon(refs.toggleBtn, MODE_ICONS[mode]);
        refs.toggleBtn.setAttribute('aria-label', MODE_TOOLTIPS[mode]);
        refs.toggleBtn.setAttribute('title', MODE_TOOLTIPS[mode]);
      };
      applyIcon(this.getSettings().viewMode);

      this.panelController.onToggle(() => { this.cycleViewMode(); });
      this.panelController.onClose(() => { try { void this.saveAndClose(view); } catch {} });
      this.applyToolbarIcon = applyIcon; // expose for setViewMode to repaint
      this.sideEditorScope = new SideEditorScope(this.app, () => this.cm6Host.view);
      this.sideEditorScope.install();
      return;
    }
  }

  teardown(): void {
    if (this.sideEditorScope) {
      this.sideEditorScope.uninstall();
      this.sideEditorScope = null;
    }
    // Prefer controller cleanup if present
    if (this.panelController) {
      try { this.panelController.destroy(); } catch {}
      this.panelController = null;
    }
    // Drop the toolbar icon callback so it doesn't retain a detached <button>.
    this.applyToolbarIcon = null;
    // Drop the embedded live-preview leaf (if any) before nuking the panel.
    if (this.leafHost) {
      try { void this.leafHost.detach(); } catch {}
      this.leafHost = null;
    }
    this.usingLeafHost = false;
    void this.cm6Host.dispose();
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
    this.editorRootEl = null;
    this.previewRootEl = null;
    this.currentNodeId = null;
    this.currentCanvasFile = null;
    this.currentNode = null;
  }

  close(): void {
    // TEMP debug tracing — remove with the [cmside] logs in interaction.ts.
    try { console.debug('[cmside] close(): open before =', this.panelEl?.classList.contains('open')); } catch {}
    if (this.panelEl) this.panelEl.classList.remove('open');
    this.currentNodeId = null;
    try { console.debug('[cmside] close(): open after =', this.panelEl?.classList.contains('open')); } catch {}
  }

  // ---------------------------------------------------------------------
  // Open / save
  // ---------------------------------------------------------------------

  async save(view: CanvasLikeView): Promise<void> {
    if (!this.currentNodeId) return;
    // File cards routed through the live-preview leaf write directly to
    // the bound .md file. We never dump anything into the canvas JSON for
    // them since file cards only reference the file by path. But the
    // leaf's own save is debounced ~2s — force a flush here so the
    // close-panel / switch-canvas paths don't lose typed-but-unsaved
    // content if the user just stopped typing.
    if (this.usingLeafHost) {
      try { await this.leafHost?.flush(); } catch {}
      return;
    }
    const cmView = this.cm6Host.view;
    if (!cmView) return;
    const newText = cmView.state.doc.toString();
    await writeNodeContent(this.app, view, this.currentNode, this.currentNodeId, newText);
  }

  async saveAndClose(view: CanvasLikeView): Promise<void> {
    // Kick the save off first — its synchronous prefix captures everything
    // it needs (node id, editor buffer, leaf host) before the first await —
    // then hide the panel immediately so a slow or hung save (e.g. a
    // detached-leaf flush) can never block the close.
    const pendingSave = this.save(view).catch(() => {});
    this.close();
    await pendingSave;
    try { console.debug('[cmside] saveAndClose: finished'); } catch {}
  }

  async open(view: CanvasLikeView, node: CanvasNode): Promise<void> {
    // Stake out a unique generation for this invocation. Concurrent
    // rapid clicks bump the counter; if our gen is no longer current
    // after any await, we must bail before applying side effects.
    const myGen = ++this.openGeneration;

    // Safety net: drop any orphaned panel reference before (re)building.
    if (this.panelEl && !this.panelEl.isConnected) {
      this.teardown();
    }
    this.ensurePanel(view);
    if (!this.panelEl || !this.editorRootEl) return;
    this.currentNodeId = node.id;
    this.currentNode = node;
    const file: TFile | undefined = view?.file;
    this.currentCanvasFile = file ?? null;
    this.currentSourcePath =
      node.type === 'file' && typeof node.file === 'string'
        ? node.file
        : this.currentCanvasFile?.path ?? '';
    this.previewHelper?.setSourcePath(this.currentSourcePath);

    // Load content (only used by the CM6 editor path; the MarkdownLeafHost
    // reads directly from the file).
    let initial = '';
    if (node.type === 'text') {
      initial = node.text ?? '';
    } else if (node.type === 'file' && typeof node.file === 'string') {
      const mdFile = resolveVaultFile(this.app, node.file);
      if (mdFile) {
        initial = await this.app.vault.read(mdFile);
        if (this.openGeneration !== myGen) return;
      }
    }

    // Live Preview leaf hijack (issue #9 / #20). The cold-start race that
    // previously blocked this is resolved by MarkdownLeafHost calling
    // leaf.loadIfDeferred() to promote a DeferredView placeholder. The
    // leaf path is only used when:
    //   - viewMode is 'live'
    //   - the node is a file card with a resolvable .md TFile
    // Text cards or unresolved files transparently fall back to the
    // CM6 editor for this session without persisting the fallback.
    const liveTarget =
      this.getSettings().viewMode === 'live'
      && node.type === 'file'
      && typeof node.file === 'string'
        ? resolveVaultFile(this.app, node.file)
        : null;

    if (liveTarget && this.editorRootEl) {
      // Burn down any leftover CM6 before mounting the leaf into the same
      // root element. Otherwise the leaf's reparent into editorRootEl
      // would race with CM6 DOM still attached.
      await this.cm6Host.dispose();
      if (!this.leafHost) this.leafHost = new MarkdownLeafHost(this.app);
      const liveView = await this.leafHost.open(liveTarget, this.editorRootEl);
      if (this.openGeneration !== myGen) return;
      if (liveView) {
        this.usingLeafHost = true;
      } else {
        // Couldn't construct a leaf on this Obsidian build — quiet
        // per-session fallback to CM6 source mode. Don't persist this;
        // the next card / next session may succeed.
        try { await this.leafHost.detach(); } catch {}
        if (this.openGeneration !== myGen) return;
        this.usingLeafHost = false;
        await this.openCmEditor(initial);
        if (this.openGeneration !== myGen) return;
      }
    } else {
      if (this.leafHost) {
        await this.leafHost.detach();
        if (this.openGeneration !== myGen) return;
      }
      this.usingLeafHost = false;
      if (this.getSettings().viewMode !== 'preview') {
        await this.openCmEditor(initial);
        if (this.openGeneration !== myGen) return;
      } else if (this.cm6Host.view) {
        // Burn down any cmView left over from a prior editor-or-both view-mode session.
        // Otherwise the next save would dump the previous card's
        // editor content back into whatever node is currently selected — for
        // file cards that means overwriting the linked .md file with the
        // wrong text, which then surfaces as the bug where clicking card 2
        // shows card 1's content (the file got rewritten on the way in).
        await this.cm6Host.dispose();
      }
    }

    // Initial preview render. For file cards, read fresh content so the
    // preview matches what the leaf is now showing.
    let initialForPreview = initial;
    if (this.usingLeafHost) {
      initialForPreview = this.leafHost?.getValue() ?? initial;
    }
    // Belt: don't even kick off the markdown render if we're already
    // stale. Suspenders: PreviewHelper.renderText is single-flight so
    // even if we do enqueue a stale text, it will be replaced by a
    // newer one before MarkdownRenderer ever sees it.
    if (this.openGeneration !== myGen) return;
    await this.renderPreview(initialForPreview);
    if (this.openGeneration !== myGen) return;

    // Render the toolbar title (static or editable depending on settings).
    this.applyCardTitle(view, node, initialForPreview);

    // Slide in
    this.panelEl.classList.add('open');
    // Re-render shortly after opening to account for layout/transition
    // timing. We deliberately use initialForPreview rather than reading
    // from the CM6 view here: in preview-only view mode openCmEditor is
    // skipped, so cmView retains content from whatever card was last opened
    // in editor or both view mode. Reading from it at +80ms would clobber
    // the correct preview we just rendered with that stale content. If the
    // user is editing in editor or both view mode, schedulePreviewRender's
    // debounced path will reflect those edits independently of this nudge.
    setTimeout(() => {
      if (this.openGeneration !== myGen) return;
      void this.renderPreview(initialForPreview);
    }, 80);
    // Focus editor for immediate typing (skip in preview-only view mode)
    if (this.getSettings().viewMode !== 'preview') {
      try {
        if (this.usingLeafHost) {
          this.leafHost?.focus();
        } else {
          this.cm6Host.focus();
        }
      } catch {}
    }
  }

  // Build (or update) the CM6 editor with the given content. Used by text
  // cards and as a fallback when the live-preview leaf can't be constructed
  // on this Obsidian build.
  private async openCmEditor(initial: string): Promise<void> {
    if (!this.editorRootEl) return;
    this.cm6Host.open(this.editorRootEl, initial, {
      onDocChange: () => this.schedulePreviewRender(),
      onPasteImages: (files, view) => { this.handlePasteImages(files, view).catch(() => {}); },
      onScroll: () => this.syncPreviewScroll(),
      enableBlankClickFocus: () => this.getSettings().viewMode !== 'preview',
    });
  }

  // Re-create the CM6 editor with the latest content of the currently-open
  // node. Mirrors the source-of-truth resolution in open(): text cards read
  // from node.text, file cards re-read from disk.
  private async rebuildCmViewForCurrentNode(): Promise<void> {
    const node = this.currentNode;
    if (!node) return;
    let initial = '';
    if (node.type === 'text') {
      initial = node.text ?? '';
    } else if (node.type === 'file' && typeof node.file === 'string') {
      const f = resolveVaultFile(this.app, node.file);
      if (f) initial = await this.app.vault.read(f);
    }
    await this.openCmEditor(initial);
  }

  // ---------------------------------------------------------------------
  // View mode
  // ---------------------------------------------------------------------

  // Cycle Editor → Live → Preview → Editor (issue #16, #20).
  cycleViewMode(): void {
    void this.setViewMode(nextViewMode(this.getSettings().viewMode));
  }

  // Apply a specific view mode: persist + push to panel + repaint toolbar
  // icon. Used by the cycle button, the settings dropdown, and command
  // callbacks.
  async setViewMode(mode: ViewMode): Promise<void> {
    const settings = this.getSettings();
    const prevMode = settings.viewMode;
    settings.viewMode = mode;
    try { await this.persistSettings(settings); } catch {}
    try { this.panelController?.setViewMode?.(mode); } catch {}
    try { this.applyToolbarIcon?.(mode); } catch {}

    // Transitions that change the active editor primitive — CM6 ↔
    // detached MarkdownLeaf (Live Preview) — need a full re-open so the
    // right primitive ends up mounted in editorRootEl. We detect both
    // directions by checking what's currently displayed vs. what the new
    // mode wants. The CM6-only cycles (editor/preview) are handled
    // by the cheap rebuild below.
    if (this.currentNode && this.boundView) {
      const isLeavingLive = prevMode === 'live' && this.usingLeafHost;
      const isEnteringLive =
        mode === 'live'
        && this.currentNode.type === 'file'
        && typeof this.currentNode.file === 'string'
        && resolveVaultFile(this.app, this.currentNode.file) != null;
      if (isLeavingLive || isEnteringLive) {
        // Flush the leaf's in-memory buffer first if we're tearing it
        // down — otherwise typed-but-unsaved content disappears on
        // detach and the next read sees stale disk data.
        if (isLeavingLive) {
          try { await this.leafHost?.flush(); } catch {}
        }
        await this.open(this.boundView, this.currentNode);
        return;
      }
    }

    // Rebuild cmView when leaving preview if the dispose path in open()
    // (or simply opening a card while already in preview) left it null.
    // Without this, the editor pane becomes visible-but-blank.
    // Note: 'live' mode reaches here only when the leaf path was skipped
    // (text card, or unresolvable file) — in that case we still need a
    // CM6 fallback so the pane isn't empty.
    if (mode !== 'preview' && !this.cm6Host.view && this.currentNode && this.editorRootEl) {
      try { await this.rebuildCmViewForCurrentNode(); } catch {}
    }
  }

  // ---------------------------------------------------------------------
  // Preview
  // ---------------------------------------------------------------------

  private schedulePreviewRender(): void {
    const debounce = this.getSettings()?.previewDebounceMs ?? 50;
    if (this.usingLeafHost && this.leafHost) {
      const host = this.leafHost;
      this.previewHelper?.scheduleFromText(() => host.getValue() ?? '', debounce);
      return;
    }
    const cmView = this.cm6Host.view;
    if (!cmView) return;
    this.previewHelper?.scheduleFromEditor(cmView, debounce);
  }

  private async renderPreview(text: string): Promise<void> {
    if (!this.previewHelper) return;
    await this.previewHelper.renderText(text);
    this.syncPreviewScroll();
  }

  private syncPreviewScroll(): void {
    const cmView = this.cm6Host.view;
    if (!cmView) return;
    this.previewHelper?.syncScrollFromEditor(cmView);
  }

  // When the leaf-hosted editor changes, schedule a preview re-render so
  // the right-hand pane stays in sync. The workspace 'editor-change' event
  // fires for any markdown view; we filter to the file we currently have
  // embedded.
  handleWorkspaceEditorChange(info: unknown): void {
    if (!this.usingLeafHost) return;
    if (!info) return;
    const file = (info as { file?: { path?: string } }).file;
    if (!file) return;
    if (this.currentSourcePath && file.path === this.currentSourcePath) {
      this.schedulePreviewRender();
    }
  }

  // ---------------------------------------------------------------------
  // Pasted images (CM6 path only — the leaf host's Obsidian editor handles
  // image paste natively)
  // ---------------------------------------------------------------------

  private async handlePasteImages(files: File[], view: EditorView): Promise<void> {
    try {
      const insertText = await savePastedImagesToVault(this.app, files, this.currentSourcePath || '');
      if (insertText == null) return;
      const tr = view.state.update({ changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: insertText } });
      view.dispatch(tr);
      // schedule preview render with new content
      this.schedulePreviewRender();
    } catch (e) {
      try { console.error('CanvasMdSideEditor: handlePasteImages failed', e); } catch {}
    }
  }

  // ---------------------------------------------------------------------
  // Card title
  // ---------------------------------------------------------------------

  // Re-render the toolbar title using the currently open node. Called by the
  // settings tab when the user toggles "Show editable card title".
  refreshCardTitle(): void {
    if (!this.panelController || !this.currentNode || !this.boundView) return;
    const initial = this.usingLeafHost
      ? (this.leafHost?.getValue() ?? '')
      : (this.cm6Host.view?.state.doc.toString() ?? '');
    this.applyCardTitle(this.boundView, this.currentNode, initial);
  }

  private applyCardTitle(view: CanvasLikeView, node: CanvasNode, currentContent: string): void {
    if (!this.panelController) return;
    if (node.type === 'file' && typeof node.file === 'string') {
      const file = resolveVaultFile(this.app, node.file);
      const basename = file?.basename ?? '';
      this.panelController.setTitle(basename, (newName) => {
        if (file) void this.commitFileRename(file, newName, node);
      });
      return;
    }
    if (node.type === 'text') {
      const initialTitle = extractTitleFromText(currentContent);
      this.panelController.setTitle(initialTitle, (newTitle) => {
        void this.commitTextTitle(view, newTitle);
      });
      return;
    }
    this.panelController.setTitle('Canvas MD Side Editor');
  }

  private async commitFileRename(file: TFile, newBasename: string, node: CanvasNode): Promise<void> {
    const plan = buildRenamePath(file.path, newBasename);
    if (!plan.valid) {
      new Notice(`Cannot rename: ${plan.reason}`);
      this.refreshCardTitle();
      return;
    }
    if (plan.path === file.path) return;
    if (this.app.vault.getAbstractFileByPath(plan.path)) {
      new Notice('A file with that name already exists');
      this.refreshCardTitle();
      return;
    }
    try {
      await this.app.vault.rename(file, plan.path);
      // Keep our in-memory references in sync so subsequent saves go to the
      // new path rather than the now-defunct one.
      if (typeof node.file === 'string') node.file = plan.path;
      this.currentSourcePath = plan.path;
      this.previewHelper?.setSourcePath(plan.path);
    } catch {
      new Notice('Rename failed');
      this.refreshCardTitle();
    }
  }

  private async commitTextTitle(view: CanvasLikeView, newTitle: string): Promise<void> {
    const cmView = this.cm6Host.view;
    if (!cmView) return;
    const doc = cmView.state.doc.toString();
    const patched = patchFirstLineWithTitle(doc, newTitle);
    if (patched === doc) return;
    cmView.dispatch({ changes: { from: 0, to: doc.length, insert: patched } });
    await this.save(view);
  }

  // ---------------------------------------------------------------------
  // Settings-driven panel appearance (delegated from the settings tab)
  // ---------------------------------------------------------------------

  applyFontSizes(): void {
    try { this.panelController?.applyFontSizes?.(); } catch {}
  }

  // Apply the persisted dock position to the open panel (issue #11).
  applyDockPosition(): void {
    try {
      const pos = this.getSettings().dockPosition ?? 'right';
      this.panelController?.setDockPosition?.(pos);
    } catch {}
  }
}

// Live Preview host (issue #9, approach A).
//
// Hosts a real Obsidian `MarkdownView` inside our side panel by creating a
// `WorkspaceLeaf` via the (undocumented but stable) runtime constructor and
// reparenting the view's container into a chosen mount point. This gives
// the side panel the full Live Preview experience — wikilinks, embeds,
// callouts, hidden markers, the whole thing — for `file`-type canvas
// nodes (which point at a real .md file in the vault).
//
// Why undocumented constructor: Obsidian's public API only exposes
// `Workspace.getLeaf(...)` which always attaches a leaf to the workspace
// tree (creating a visible tab). To embed a hidden, side-panel-only
// MarkdownView we need a leaf that has no workspace parent. Multiple
// long-lived community plugins (Hover Editor, Make.md, Edit-in-Modal)
// rely on the same pattern.

import { App, MarkdownView, TFile, WorkspaceLeaf } from 'obsidian';

export class MarkdownLeafHost {
  private app: App;
  private leaf: WorkspaceLeaf | null = null;
  private mountEl: HTMLElement | null = null;

  constructor(app: App) {
    this.app = app;
  }

  // Open the given .md file in a fresh detached leaf and mount its DOM into
  // `mountEl`. Returns the live `MarkdownView` on success, or null if the
  // runtime refused to construct a detached leaf.
  async open(file: TFile, mountEl: HTMLElement): Promise<MarkdownView | null> {
    await this.detach();
    this.mountEl = mountEl;

    let leaf: WorkspaceLeaf;
    try {
      leaf = new (WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf)(this.app);
    } catch (e) {
      try { console.error('CanvasMdSideEditor: detached WorkspaceLeaf ctor failed', e); } catch {}
      return null;
    }
    this.leaf = leaf;

    // Force Live Preview regardless of the user's global default by passing
    // `source: false` alongside `mode: 'source'`. (Obsidian exposes "Live
    // Preview" as a sub-state of source mode rather than a top-level mode.)
    try {
      await leaf.setViewState({
        type: 'markdown',
        state: { file: file.path, mode: 'source', source: false } as unknown as Record<string, unknown>,
      });
    } catch (e) {
      try { console.error('CanvasMdSideEditor: setViewState failed', e); } catch {}
      await this.detach();
      return null;
    }

    const view = leaf.view;
    if (!(view instanceof MarkdownView)) {
      try { console.warn('CanvasMdSideEditor: leaf.view is not a MarkdownView', view); } catch {}
      await this.detach();
      return null;
    }

    // Reparent the view's content area into our editor pane. We pick
    // `contentEl` (not `containerEl`) so the embedded view skips its own
    // tab header / breadcrumb chrome — the side panel already has its own
    // toolbar. The leaf still owns the view; we're just giving its DOM a
    // different visual home.
    const embedEl = (view.contentEl ?? view.containerEl) as HTMLElement;
    mountEl.empty();
    mountEl.appendChild(embedEl);

    // Nudge the editor to recompute its size against the new parent.
    try { view.onResize(); } catch {}
    // Some Obsidian builds don't lay out the editor until they think the
    // view is "loaded" in the workspace. Trigger a manual measure on the
    // next frame too, just in case.
    try {
      requestAnimationFrame(() => { try { view.onResize(); } catch {} });
    } catch {}

    return view;
  }

  async detach(): Promise<void> {
    if (this.leaf) {
      const leaf = this.leaf;
      this.leaf = null;
      try { leaf.detach(); } catch {}
    }
    if (this.mountEl) {
      try { this.mountEl.empty(); } catch {}
      this.mountEl = null;
    }
  }

  getView(): MarkdownView | null {
    const v = this.leaf?.view;
    return v instanceof MarkdownView ? v : null;
  }

  // Read the latest editor content. Returns null if nothing's open.
  getValue(): string | null {
    const v = this.getView();
    if (!v) return null;
    try { return v.getViewData(); } catch { return null; }
  }

  hasOpen(): boolean {
    return this.getView() != null;
  }
}

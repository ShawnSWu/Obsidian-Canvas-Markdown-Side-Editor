// Pre-warm a detached MarkdownView leaf so the first user-visible card
// open lands in the same hot path the second open already does.
//
// Background: Obsidian 1.7.2+ creates new leaves in a "deferred" state.
// The first time `new WorkspaceLeaf(app)` runs in a session, the view
// returned by `setViewState({ type: 'markdown', ... })` is a placeholder
// DeferredView rather than a real MarkdownView, and our duck-type check
// in MarkdownLeafHost.open() falls back to CM6. After one full cycle
// the machinery is warm and subsequent leaves get real MarkdownViews.
//
// This helper performs that one full cycle at plugin onload (after
// layout-ready), so the user never sees the cold version.

import { App, WorkspaceLeaf } from 'obsidian';

export async function prewarmMarkdownLeaf(app: App): Promise<void> {
  // Pick any markdown file in the vault to feed the warm-up. If none
  // exists there's nothing to warm against and the user has no file
  // cards to open anyway.
  let firstMd;
  try {
    firstMd = (app.vault as unknown as { getMarkdownFiles?: () => Array<{ path: string }> })
      .getMarkdownFiles?.()[0];
  } catch {
    return;
  }
  if (!firstMd) return;

  let leaf: WorkspaceLeaf;
  try {
    leaf = new (WorkspaceLeaf as unknown as new (app: App) => WorkspaceLeaf)(app);
  } catch {
    // Older / future Obsidian build refuses the undocumented constructor.
    // Pre-warm becomes a no-op; first open will still try the real path.
    return;
  }

  try {
    await leaf.setViewState({
      type: 'markdown',
      state: { file: firstMd.path, mode: 'source', source: false } as unknown as Record<string, unknown>,
    });
    const lf = leaf as unknown as { isDeferred?: boolean; loadIfDeferred?: () => Promise<void> };
    if (lf.isDeferred && typeof lf.loadIfDeferred === 'function') {
      await lf.loadIfDeferred();
    }
  } catch {
    // best-effort — swallow; we'll still detach below
  } finally {
    try { leaf.detach(); } catch {}
  }
}

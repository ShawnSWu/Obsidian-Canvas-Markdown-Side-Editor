# Live Preview Pre-warm — Design

Date: 2026-04-29
Issue: GitHub #9 (follow-up to commit `00b28ee`)

## Problem

Side editor for file-type Canvas cards uses a detached `WorkspaceLeaf` to host
Obsidian's real `MarkdownView`, giving the panel a full Live Preview
experience. The current shipped behaviour (commit `00b28ee`) has a cold-start
race:

- **First open of any file card after Obsidian starts:** leaf hijack fails,
  panel falls back to home-grown CM6 (raw markdown text — no headings, bold,
  link decorations).
- **Second open onwards:** leaf hijack succeeds, panel shows Obsidian's own
  CM6 with full Live Preview decorations.

The user-visible symptom is that the very first card they click looks
broken (image #8 in the brainstorming session) until they close and reopen
the panel, after which it stays correct (image #7).

## Root Cause (Best Hypothesis)

Obsidian 1.7.2+ creates new leaves in a "deferred" state. The first time
`new WorkspaceLeaf(app)` runs in a session, Obsidian's view-type registry
and supporting machinery for `markdown` views is cold — `setViewState` does
not synchronously promote the leaf's view from `DeferredView` placeholder
to a real `MarkdownView`. By the time we duck-type-check `leaf.view`, it
fails the check and we fall back. After the second leaf creation, the
machinery is warm and the same code path succeeds.

A previous fix attempt (uncommitted, working tree) added `loadIfDeferred()`
plus an early `containerEl` mount. It did not solve the cold-start race
and added more error noise. That working tree will be discarded as part of
this fix.

## Goal

First open of any file card after plugin load lands directly in the
Live Preview leaf-hijack path — same visual result as a second open does
today. No user-visible difference between first and Nth open.

## Non-Goals

- No changes to `markdown-leaf.ts` semantics. The `00b28ee` version of
  that file already succeeds on the second-and-later opens; the fix
  ensures the first open behaves like a second open.
- No switch to "real workspace leaf + reparent" approach (Hover-Editor
  pattern). That is the documented escalation path if pre-warm proves
  insufficient, not part of this design.
- No changes to the Headline mode work in commit `407b842`.

## Approach

Three discrete pieces of work, in order:

### 1. Reset uncommitted working tree to `00b28ee`

Discard all 8 modified/deleted files in the working tree. Specifically:
- `src/main.ts`
- `src/ui/panel.ts`
- `src/ui/markdown-leaf.ts`
- `src/commands/register.ts`
- `src/ui/icons.ts` (was deleted; restore it)
- `styles.css`
- `tests/ui/panel.test.ts`
- `tests/unit/ui/markdown-leaf.test.ts`

Rationale: every uncommitted change either failed (`loadIfDeferred`,
duck-typing tweaks) or was a UX side quest (`hide preview when not
readonly`) that should land as a separate, focused commit on a clean
baseline rather than tangled with the cold-start fix.

### 2. Pre-warm a markdown leaf at `onLayoutReady`

Add a private `prewarmMarkdownLeaf()` method on the plugin class. Invoked
from `onload()` via `app.workspace.onLayoutReady(...)`:

```ts
// Inside CanvasMdSideEditor.onload()
this.app.workspace.onLayoutReady(() => {
  void this.prewarmMarkdownLeaf();
});
```

The method:

1. Locate any markdown file in the vault (`app.vault.getMarkdownFiles()[0]`).
   If none exists, return immediately — nothing to warm against.
2. Construct a detached leaf inline via the same undocumented
   `new WorkspaceLeaf(app)` constructor that `MarkdownLeafHost` uses.
   The pre-warm path does **not** go through `MarkdownLeafHost.open()` —
   it deliberately skips the `containerEl` mount step because the
   pre-warm leaf is never visible. Wrap in try/catch; swallow errors
   silently (this is best-effort).
3. Call `leaf.setViewState({ type: 'markdown', state: { file: <path>,
   mode: 'source', source: false } })` and `await` it.
4. If `leaf.isDeferred && typeof leaf.loadIfDeferred === 'function'`,
   `await leaf.loadIfDeferred()`.
5. `leaf.detach()`. The pre-warm leaf is never visible to the user and
   leaves no DOM trace.

The whole operation is fire-and-forget from `onload`'s perspective; we
do not await it before plugin onload completes.

### 3. Re-add "preview pane only in read-only mode" as a separate commit

After the pre-warm fix is in place and verified, layer back the UX change
that was in the discarded working tree:

- Remove the toggle-preview button from the panel toolbar.
- Bind `previewCollapsed = !readOnly` in `setReadOnly`.
- Default `previewCollapsed = true` (preview hidden by default since
  default mode is edit).
- Update `tests/ui/panel.test.ts` to match the 1:1 binding.

Lands as its own commit on top of the pre-warm fix so each change has a
single concern.

## Architecture / File Touch List

| File | Pre-warm fix | Preview-readonly fix |
| ---- | ------------ | -------------------- |
| `src/main.ts` | add `prewarmMarkdownLeaf()` + onLayoutReady hook | bind preview to readOnly |
| `src/ui/panel.ts` | — | remove toggle button, drop manual setPreviewCollapsed callers |
| `src/ui/markdown-leaf.ts` | unchanged from `00b28ee` | unchanged |
| `src/commands/register.ts` | unchanged | drop "Toggle preview" command |
| `src/ui/icons.ts` | unchanged | delete (no longer referenced) |
| `styles.css` | unchanged | drop toggle-button styles |
| `tests/unit/main/prewarm.test.ts` (new) | unit test for prewarm | — |
| `tests/ui/panel.test.ts` | unchanged | update for 1:1 binding |

## Testing

### New test: `tests/unit/main/prewarm.test.ts`

Mocks `WorkspaceLeaf` and `app.vault.getMarkdownFiles` (re-using the
existing test mock surface). Asserts:

- When at least one markdown file exists, `prewarmMarkdownLeaf` calls
  the leaf constructor exactly once, calls `setViewState` with
  `mode: 'source', source: false`, awaits `loadIfDeferred` if exposed,
  and calls `detach`.
- When no markdown file exists, no leaf is constructed.
- Errors during construction or `setViewState` are swallowed silently
  (no rejection bubbling out of `prewarmMarkdownLeaf`).

### Manual verification

1. `npm run build`.
2. Copy `main.js` + `styles.css` + `manifest.json` to vault plugin folder.
3. Quit Obsidian completely (not just reload — pre-warm only runs at
   plugin load).
4. Reopen Obsidian.
5. Open a Canvas with file-type cards.
6. Click a card. Expected: panel renders immediately as image #7
   (Obsidian CM6 with heading sizes, bold rendering, link styling).
   First open should be indistinguishable from second open.
7. Repeat with a different card to confirm second-and-later opens still
   work.

## Acceptance Criteria

- [ ] All existing tests pass (132/132 baseline).
- [ ] New `prewarm.test.ts` tests pass.
- [ ] Manual: first card open after fresh Obsidian start renders Live
      Preview, not raw text.
- [ ] No console errors at plugin load related to pre-warm.
- [ ] `git status` is clean except for the two intended commits.

## Risks and Fallback

| Risk | Likelihood | Mitigation |
| ---- | ---------- | ---------- |
| Cold-start state is per-leaf, not per-app — pre-warming one leaf doesn't help the next leaf | Medium | If verification fails, escalate to Approach B (real workspace leaf + DOM reparent). Spec for that lives in a separate doc if needed. |
| `onLayoutReady` fires before view-type registry is fully initialized | Low | Pre-warm is best-effort; if it fails it logs and returns, leaving behaviour identical to `00b28ee`. |
| Vault has zero markdown files at plugin load (e.g. brand-new vault) | Low | Method early-returns. User won't have file cards to open anyway, so nothing to warm against. |
| Pre-warm leaks DOM / leaves ghost leaf in workspace | Low | `detach()` is the standard cleanup; we never insert `containerEl` into the document, so there is no DOM to leak. |

## Out of Scope

- Refactoring `MarkdownLeafHost` itself.
- Changing the fallback CM6 path's appearance.
- Improvements to Headline mode (#13, shipped in `407b842`).
- Switching to the "real leaf + reparent" architecture.

## Rollback Plan

Either commit can be reverted independently with `git revert`:
- Reverting the preview-readonly commit restores the always-visible
  preview pane behaviour.
- Reverting the pre-warm commit restores the `00b28ee` cold-start
  behaviour ("first open broken, second open works").

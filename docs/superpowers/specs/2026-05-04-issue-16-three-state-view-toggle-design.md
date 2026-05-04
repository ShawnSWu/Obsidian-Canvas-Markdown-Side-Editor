# Issue #16 — Three-state view toggle

**Status:** design approved, ready for implementation plan
**Date:** 2026-05-04
**Issue:** [#16 [enhancement] Support quick 3 state toggle](https://github.com/Code52/Obsidian-Canvas-Markdown-Side-Editor/issues/16)
**Scope:** the side panel's editor↔preview toolbar control; nothing else.

## Problem

The side panel today has two overlapping flags:

- `previewCollapsed` (session-only) toggles between **Editor only** ↔ **Both**.
- `readOnly` (persisted setting) forces **Preview only** when true.

There is no single control that gives the user all three states. Reaching "Preview only" requires opening Settings; reaching "Editor only" requires the toolbar button. The two mechanisms are entangled (`setReadOnly(true)` overrides `setPreviewCollapsed`) which makes new modes (e.g. issue #18's possible focus mode) hard to add without further entanglement.

## Goal

One toolbar button cycles through three view modes. The current mode persists globally and survives restarts. The two existing entangled flags collapse into a single source of truth.

## Non-goals

- Per-card memory of view mode.
- A fourth "focus" mode (issue #18 territory).
- Reverse cycle / shift+click / animations.
- Three direct-set commands (`Show editor only` etc.) — YAGNI; add when requested.
- Touching `src/ui/preview.ts` (issue #17), Headline mode (issue #18), or `MarkdownLeafHost` (still dormant).

## State model

```ts
// src/types.ts
export type ViewMode = 'editor' | 'both' | 'preview';
```

Single source of truth: `CanvasMdSideEditorSettings.viewMode: ViewMode`. Persisted. The legacy `readOnly: boolean` setting is removed and migrated.

**Cycle order** (`editor → both → preview → editor`):

```ts
const NEXT: Record<ViewMode, ViewMode> = {
  editor: 'both',
  both:   'preview',
  preview:'editor',
};
```

**Pane mapping** — what `panel.setViewMode(mode)` produces:

| Mode    | editor pane | preview pane | divider | edits possible |
|---------|-------------|--------------|---------|----------------|
| editor  | shown       | hidden       | hidden  | yes            |
| both    | shown       | shown        | shown   | yes            |
| preview | hidden      | shown        | hidden  | no (no editor in DOM viewport) |

## Data flow

```
[user clicks toolbar button]
        │
        ▼
plugin.cycleViewMode()
        │   next = NEXT[settings.viewMode]
        ▼
plugin.setViewMode(next)
        │
        ├─ this.settings.viewMode = next
        ├─ await this.saveSettings()       (persist)
        ├─ this.panel.setViewMode(next)    (single setter; decides both panes + divider)
        └─ this.applyToolbarIcon(next)     (icon + tooltip)
```

Opening a card calls `panel.setViewMode(this.settings.viewMode)` once during card bind, replacing the current `setPreviewCollapsed` / `setReadOnly` calls in that path.

## Migration

Run once at `onload()`, immediately after `loadData()` and before any UI binding:

```ts
function migrateLegacyReadOnly(s: Partial<Settings>): Settings {
  if (s.viewMode == null) {
    s.viewMode = s.readOnly === true ? 'preview' : 'both';
  }
  delete (s as { readOnly?: boolean }).readOnly;
  return s as Settings;
}
```

After migration the next `saveData()` removes the `readOnly` field from `data.json`.

## Component changes

### `src/types.ts`
- Add `export type ViewMode = 'editor' | 'both' | 'preview';`

### `src/settings.ts`
- `CanvasMdSideEditorSettings`: remove `readOnly?: boolean`, add `viewMode: ViewMode`.
- `DEFAULT_SETTINGS`: drop `readOnly`, add `viewMode: 'both'`.

### `src/ui/setting-tab.ts`
- Replace the existing **Read only** toggle row (currently lines 94–104, the `new Setting(containerEl).setName('Read only')...addToggle(...)` block) with a dropdown:
  - `.setName('Default view mode')`
  - `.setDesc('Sets the initial view mode for newly opened cards. You can change it any time from the toolbar.')`
  - `.addDropdown(d => d.addOption('editor','Editor').addOption('both','Both').addOption('preview','Preview').setValue(this.plugin.settings.viewMode).onChange(...))`
  - `onChange` body: `await plugin.setViewMode(value as ViewMode)` — applies immediately to any open card and persists.

### `src/ui/panel.ts`
- Remove public `setPreviewCollapsed(boolean)` and `setReadOnly(boolean)`.
- Add public `setViewMode(mode: ViewMode): void`. Internally:
  - sets `display` on `.cmside-pane-editor`, `.cmside-pane-preview`, `.cmside-divider` per the table above
  - writes `data-view-mode={mode}` on `.canvas-md-side-editor-panel` (CSS hook for future #18 work)
  - updates the toolbar button's `title` and `aria-label` per the tooltip table below
- Replace the internal `previewCollapsed: boolean` field with `viewMode: ViewMode`.

### `src/main.ts`
- Remove `previewCollapsed` field — read state directly from `this.settings.viewMode`.
- Remove `togglePreview()`. Add:
  - `cycleViewMode(): void` → computes `NEXT[curr]`, calls `setViewMode(next)`.
  - `setViewMode(mode: ViewMode): Promise<void>` → settings write + saveSettings + panel.setViewMode + icon update.
- Toolbar button click handler → `cycleViewMode()`.
- Card-open path → `panel.setViewMode(this.settings.viewMode)` (replaces existing readOnly+collapsed wiring).
- `onload()` → call `migrateLegacyReadOnly(this.settings)` and `saveSettings()` if it mutated.

### `src/commands/register.ts`
- Update interface: `togglePreview?(): void` → `cycleViewMode?(): void`.
- **Keep** command id `cmside-toggle-preview` and name `Canvas Side Editor: Toggle Preview` (preserves user hotkey bindings).
- Callback body → `plugin.cycleViewMode?.()`.
- Description (if Obsidian's command API supports it) → mention the cycle order.

### Untouched files
- `src/ui/preview.ts` — preview pipeline unchanged.
- `src/ui/editor.ts` — CM6 factory unchanged.
- `src/ui/markdown-leaf.ts` — dormant; not awakened.
- Headline mode CSS / `applyHeadlineMode()` — orthogonal.

## Toolbar UX

**Icons** (Lucide, available in Obsidian):

| Mode    | icon        |
|---------|-------------|
| editor  | `pencil`    |
| both    | `panel-left`|
| preview | `book-open` |

If `panel-left` reads poorly under default + minimal themes during implementation review, fall back to `columns-2` or `split-square-horizontal`. The icon choice is the only piece that gets a visual sanity check before merging.

**Tooltip / aria-label**

| Current viewMode | tooltip                                  |
|------------------|------------------------------------------|
| editor           | `View: Editor only — click for Both`     |
| both             | `View: Both — click for Preview`         |
| preview          | `View: Preview only — click for Editor`  |

This communicates current state, next state, and that the button cycles, in one line.

**DOM hook**: `data-view-mode="editor|both|preview"` lives on `.canvas-md-side-editor-panel`. No new body classes (the existing `cmside-headline-mode` body class is legacy; do not extend that pattern).

## Testing

**Unit (Vitest, no DOM)**
- `nextViewMode(curr)` — three assertions covering full cycle.
- `migrateLegacyReadOnly(settings)` — three cases:
  - `{ readOnly: true }` → `{ viewMode: 'preview' }`, `readOnly` deleted
  - `{ readOnly: false }` → `{ viewMode: 'both' }`, `readOnly` deleted
  - `{ viewMode: 'editor' }` (already-migrated) → unchanged

**Integration (Vitest + jsdom or happy-dom, only if the project already has DOM test infra; otherwise skip and rely on manual)**
- `panel.setViewMode('editor')` → preview pane and divider hidden, editor pane visible.
- `panel.setViewMode('preview')` → editor pane and divider hidden, preview visible.
- `panel.setViewMode('both')` → all three visible.

If `package.json` has no jsdom/happy-dom setup, do not introduce one for this feature; the manual checklist below is sufficient.

**Manual verification in Obsidian**
- [ ] Click button 4× returns to starting mode.
- [ ] Hover tooltip shows the current → next text from the table.
- [ ] Restart Obsidian; viewMode persists.
- [ ] Switch dock to left / right / top / bottom; toolbar button stays usable, no overlap.
- [ ] Headline mode on; cycling does not affect H1 size.
- [ ] Command palette search for "toggle preview" finds the command (hotkey backward compat).
- [ ] Edit `data.json` to `{ "readOnly": true }` only; restart → file becomes `{ "viewMode": "preview" }` (`readOnly` field gone).
- [ ] Settings dropdown change applies immediately to any open card.

## Risks

1. **Migration timing.** `cycleViewMode` invoked before migration would read `viewMode: undefined`. Mitigation: migration runs synchronously in `onload()` after `loadData()` and before any handler is wired up. No async window for the race.
2. **Hidden-pane side effects.** Paste-image and blur-save handlers must be no-ops while the editor pane is `display: none`. They likely already are (events don't fire on hidden DOM), but verify during implementation by toggling to Preview and confirming no console errors / no spurious save attempts.
3. **Settings dropdown semantics.** Labeled "Default view mode" but stores the live current value. Acceptable: the user-facing name is friendlier than "Current view mode," and changing it from settings does immediately apply (which is what users would expect from a setting they just edited).

## Open implementation choices (decide during plan, not spec)

- Whether to expose `setViewMode` on `main.ts` as a public method or only via `cycleViewMode`. Expose both — settings dropdown needs `setViewMode(specific)`.
- CSS technique for hiding panes — match the existing pattern in `panel.ts` (likely inline `display: none` toggling); do not introduce new CSS classes for the basic show/hide.
- Whether the toolbar button gets a small label next to the icon for very wide docks. Default: no, single icon only (matches current toolbar density).

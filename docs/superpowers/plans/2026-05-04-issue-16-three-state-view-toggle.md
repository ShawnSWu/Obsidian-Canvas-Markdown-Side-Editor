# Issue #16 — Three-state view toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the entangled `previewCollapsed` (session) + `readOnly` (persisted) flags with a single `viewMode: 'editor' | 'both' | 'preview'` setting. The toolbar's existing single button becomes a 3-way cycle button.

**Architecture:** A new `ViewMode` type and pure helpers (`nextViewMode`, `migrateLegacyReadOnly`) live in `src/view-mode.ts`. `PanelController` exposes a single `setViewMode(mode)` that sets a `data-view-mode` attribute on the panel root; CSS keys layout off that attribute. `main.ts` reads/writes only `settings.viewMode`. The legacy `readOnly` field, the legacy `setPreviewCollapsed`/`setReadOnly` panel methods, and the custom `cmside-one-col`/`cmside-two-cols` icons are removed in a final cleanup task after all consumers are migrated.

**Tech Stack:** TypeScript, esbuild, Vitest + happy-dom, Obsidian API (`setIcon` with Lucide icon names).

**Pre-flight:** This plan assumes you start on a feature branch off master. If still on `master`, create one before Task 1:

```bash
git checkout -b feat/issue-16-three-state-view-toggle
```

---

## File structure

**New files**
- `src/view-mode.ts` — `ViewMode` type, `nextViewMode()`, `migrateLegacyReadOnly()`. Pure module, no Obsidian imports.
- `tests/unit/view-mode.test.ts` — unit tests for the two helpers above.

**Modified files**
- `src/settings.ts` — add `viewMode: ViewMode`; remove `readOnly?: boolean` (final cleanup task).
- `src/ui/panel.ts` — add `setViewMode(mode)`; refactor old setters to write `data-view-mode`; finally remove old setters.
- `src/main.ts` — remove `previewCollapsed` field; rename `togglePreview()` → `cycleViewMode()`; add `setViewMode(mode)`; update toolbar icon wiring; run migration on load; replace `settings.readOnly` reads with `settings.viewMode === 'preview'` checks; remove `setReadOnly` public method; remove custom icon registrations.
- `src/ui/setting-tab.ts` — replace the **Read only** toggle row with a **Default view mode** dropdown.
- `src/commands/register.ts` — interface uses `cycleViewMode?()`; keep command id `cmside-toggle-preview`.
- `styles.css` — replace `.preview-collapsed` and `.read-only` selectors with `[data-view-mode="editor"]` and `[data-view-mode="preview"]`. Toggle button stays visible in all modes.
- `tests/ui/panel.test.ts` — replace setPreviewCollapsed/setReadOnly assertions with setViewMode assertions; update setup helper signature.
- `tests/ui/setting-tab.test.ts` — replace Read-only toggle test with Default-view-mode dropdown test; update input index expectations; remove `setReadOnly` from plugin mock.

---

### Task 1: Add `ViewMode` type and pure helpers

**Files:**
- Create: `src/view-mode.ts`
- Test: `tests/unit/view-mode.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/view-mode.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { nextViewMode, migrateLegacyReadOnly, type ViewMode } from '../../src/view-mode';

describe('nextViewMode', () => {
  it('cycles editor -> both', () => {
    expect(nextViewMode('editor')).toBe('both');
  });
  it('cycles both -> preview', () => {
    expect(nextViewMode('both')).toBe('preview');
  });
  it('cycles preview -> editor', () => {
    expect(nextViewMode('preview')).toBe('editor');
  });
});

describe('migrateLegacyReadOnly', () => {
  it('maps readOnly=true to viewMode=preview when viewMode is missing', () => {
    const s: Record<string, unknown> = { readOnly: true };
    const out = migrateLegacyReadOnly(s);
    expect(out.viewMode).toBe('preview');
    expect('readOnly' in out).toBe(false);
  });

  it('maps readOnly=false (or missing) to viewMode=both when viewMode is missing', () => {
    const s1: Record<string, unknown> = { readOnly: false };
    expect(migrateLegacyReadOnly(s1).viewMode).toBe('both');
    const s2: Record<string, unknown> = {};
    expect(migrateLegacyReadOnly(s2).viewMode).toBe('both');
  });

  it('does not overwrite an existing viewMode and still strips readOnly', () => {
    const s: Record<string, unknown> = { viewMode: 'editor', readOnly: true };
    const out = migrateLegacyReadOnly(s);
    expect(out.viewMode).toBe('editor');
    expect('readOnly' in out).toBe(false);
  });

  it('returns a settings object usable as { viewMode: ViewMode }', () => {
    const out = migrateLegacyReadOnly({ readOnly: true });
    const m: ViewMode = out.viewMode;
    expect(['editor', 'both', 'preview']).toContain(m);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/view-mode.test.ts`
Expected: FAIL — module `../../src/view-mode` not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/view-mode.ts`:

```ts
// Single source of truth for the side panel's view mode.
//
// The panel has three states: editor-only, editor+preview, preview-only.
// Issue #16 collapses the previously-entangled `previewCollapsed`
// (session) and `readOnly` (persisted) flags into one persisted enum.

export type ViewMode = 'editor' | 'both' | 'preview';

const NEXT: Record<ViewMode, ViewMode> = {
  editor: 'both',
  both: 'preview',
  preview: 'editor',
};

export function nextViewMode(curr: ViewMode): ViewMode {
  return NEXT[curr];
}

// One-time settings migration for users upgrading from a build that had
// the legacy `readOnly` boolean. Idempotent: safe to call on already-
// migrated settings.
export function migrateLegacyReadOnly<T extends Record<string, unknown>>(
  s: T,
): T & { viewMode: ViewMode } {
  if (s.viewMode == null) {
    s.viewMode = s.readOnly === true ? 'preview' : 'both';
  }
  delete (s as { readOnly?: boolean }).readOnly;
  return s as T & { viewMode: ViewMode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/view-mode.test.ts`
Expected: PASS — 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/view-mode.ts tests/unit/view-mode.test.ts
git commit -m ":sparkles: Add ViewMode type and pure helpers for issue #16"
```

---

### Task 2: Add `viewMode` to settings (additive, keep `readOnly`)

This task adds the field without removing the legacy one, so the build stays green while subsequent tasks migrate consumers one at a time. The legacy field is removed in Task 8.

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: Edit `src/settings.ts`**

Add the import and field. Update `DEFAULT_SETTINGS`:

```ts
// at top of file, before the existing DockPosition export:
import type { ViewMode } from './view-mode';

export type DockPosition = 'left' | 'right' | 'top' | 'bottom' | 'floating';

export interface CanvasMdSideEditorSettings {
  defaultPanelWidth: number;
  defaultPanelHeight: number;
  previewDebounceMs: number;
  editorFontSize: number | null;
  previewFontSize: number | null;
  readOnly?: boolean;              // LEGACY — removed in Task 8 after migration
  viewMode: ViewMode;              // single source of truth for issue #16
  dockPosition?: DockPosition;
  floatingX?: number;
  floatingY?: number;
  floatingWidth?: number;
  floatingHeight?: number;
  headlineMode?: boolean;
  headlineH1Size?: number;
}

export const DEFAULT_SETTINGS: CanvasMdSideEditorSettings = {
  defaultPanelWidth: 480,
  defaultPanelHeight: 360,
  previewDebounceMs: 80,
  editorFontSize: null,
  previewFontSize: null,
  readOnly: false,
  viewMode: 'both',
  dockPosition: 'right',
  floatingX: 80,
  floatingY: 80,
  floatingWidth: 480,
  floatingHeight: 400,
  headlineMode: false,
  headlineH1Size: 22,
};
```

- [ ] **Step 2: Verify the project still type-checks**

Run: `npm run build`
Expected: build completes (writes `main.js`) without TypeScript errors.

- [ ] **Step 3: Run all existing tests**

Run: `npm test`
Expected: all tests pass (no behavioral change yet; only an added field with a default).

- [ ] **Step 4: Commit**

```bash
git add src/settings.ts
git commit -m ":sparkles: Add viewMode setting alongside legacy readOnly (issue #16)"
```

---

### Task 3: Run migration on plugin load

**Files:**
- Modify: `src/main.ts:88-93` (the `onload` settings loader)

- [ ] **Step 1: Edit `src/main.ts`**

Find the existing settings load block:

```ts
    try {
      const data = (await this.loadData()) as Partial<CanvasMdSideEditorSettings> | null;
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
```

Add the migration call immediately after, and persist if it mutated. First, add the import near the other local imports at the top of the file:

```ts
import { migrateLegacyReadOnly } from './view-mode';
```

Then update the block to:

```ts
    try {
      const data = (await this.loadData()) as Partial<CanvasMdSideEditorSettings> | null;
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }

    // Issue #16 migration: collapse legacy `readOnly` boolean into
    // `viewMode`. Idempotent; running on already-migrated data is a no-op.
    const hadReadOnly = 'readOnly' in this.settings;
    migrateLegacyReadOnly(this.settings as unknown as Record<string, unknown>);
    if (hadReadOnly) {
      try { await this.saveData(this.settings); } catch {}
    }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Run all tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m ":sparkles: Run readOnly→viewMode migration on plugin load (issue #16)"
```

---

### Task 4: Add `setViewMode` to `PanelController` and update CSS in lockstep

This task makes `data-view-mode` the source of truth for the panel's layout. The legacy `setPreviewCollapsed` / `setReadOnly` methods are kept (they now write the same attribute) so callers in `main.ts` keep working until Task 5 migrates them.

**Files:**
- Modify: `src/ui/panel.ts`
- Modify: `styles.css` (lines around 302–305 and 336–339)
- Modify: `tests/ui/panel.test.ts`

- [ ] **Step 1: Update existing panel tests to assert the new attribute (failing tests)**

Replace the `PanelController state toggles` block in `tests/ui/panel.test.ts` (lines ~64–89) with these tests. They will fail until Step 3 lands.

```ts
describe('PanelController setViewMode', () => {
  it('writes data-view-mode="editor" and hides preview pane', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setViewMode('editor');
    expect(refs.panelEl.getAttribute('data-view-mode')).toBe('editor');
  });

  it('writes data-view-mode="both" and shows both panes', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setViewMode('both');
    expect(refs.panelEl.getAttribute('data-view-mode')).toBe('both');
  });

  it('writes data-view-mode="preview" and hides editor pane', () => {
    const { controller } = setup();
    const refs = controller.create();
    controller.setViewMode('preview');
    expect(refs.panelEl.getAttribute('data-view-mode')).toBe('preview');
  });

  it('applies initial viewMode from settings on create', () => {
    const { controller } = setup({ viewMode: 'preview' });
    const refs = controller.create();
    expect(refs.panelEl.getAttribute('data-view-mode')).toBe('preview');
  });
});
```

Also update the `setup` helper at the top of the test file (line ~18) — the constructor signature still takes `previewCollapsed` for now (we don't change the public ctor in this task), but the new tests don't use it. Leave the setup helper unchanged.

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/ui/panel.test.ts`
Expected: 4 new tests fail (`controller.setViewMode is not a function` or attribute not set).

- [ ] **Step 3: Add `setViewMode` to `PanelController`**

In `src/ui/panel.ts`:

(a) Add the import at the top:

```ts
import type { CanvasMdSideEditorSettings, DockPosition } from '../settings';
import type { ViewMode } from '../view-mode';
```

(b) Add a private `viewMode` field next to the existing `previewCollapsed` and `readOnly` fields (around lines 24–25):

```ts
  private previewCollapsed: boolean;
  private readOnly: boolean = false;
  private viewMode: ViewMode = 'both';
```

(c) Inside `create()`, after `this.previewCollapsed` is processed and before the `setReadOnly` from settings call (currently lines 124–128), seed `viewMode` from settings and apply it. Replace this block:

```ts
    // Initialize preview collapsed UI
    if (this.previewCollapsed) panel.classList.add('preview-collapsed');
    // Ensure layout reflects collapsed state (editor should occupy full width)
    this.applyCollapsedLayout();

    // Apply initial read-only from settings if available
    try {
      const s = this.getSettings();
      this.setReadOnly(!!s?.readOnly);
    } catch {}
```

with:

```ts
    // Initialize view mode from settings (issue #16). This is the single
    // source of truth for editor/preview pane visibility.
    const initialMode: ViewMode = (this.getSettings()?.viewMode ?? 'both') as ViewMode;
    this.viewMode = initialMode;
    panel.setAttribute('data-view-mode', initialMode);
    // Legacy class kept in sync briefly so tasks 5–7 can land without flicker.
    if (this.previewCollapsed) panel.classList.add('preview-collapsed');
    this.applyCollapsedLayout();
```

(d) Add the `setViewMode` method below the existing `setReadOnly` method (around line 207):

```ts
  // Single setter for the 3-way view mode (issue #16). Drives layout via
  // the `data-view-mode` attribute on the panel element; CSS does the rest.
  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    if (!this.panelEl) return;
    this.panelEl.setAttribute('data-view-mode', mode);
    // Keep the legacy classes in sync until Task 8 removes them. CSS no
    // longer keys off these classes after Task 4 ships, but other code
    // paths (tests, third-party CSS) may still observe them.
    this.panelEl.classList.toggle('preview-collapsed', mode === 'editor');
    this.panelEl.classList.toggle('read-only', mode === 'preview');
  }
```

(e) Make the legacy `setPreviewCollapsed` and `setReadOnly` methods delegate to `setViewMode`. Replace the bodies (lines ~186–207) with:

```ts
  // LEGACY — removed in Task 8 after main.ts migrates to setViewMode.
  setPreviewCollapsed(collapsed: boolean) {
    this.previewCollapsed = !!collapsed;
    // Honor read-only override: when read-only is on, force preview-only.
    if (this.readOnly) { this.setViewMode('preview'); return; }
    this.setViewMode(this.previewCollapsed ? 'editor' : 'both');
  }

  // LEGACY — removed in Task 8 after main.ts migrates to setViewMode.
  setReadOnly(ro: boolean) {
    this.readOnly = !!ro;
    if (this.readOnly) { this.setViewMode('preview'); return; }
    this.setViewMode(this.previewCollapsed ? 'editor' : 'both');
  }
```

- [ ] **Step 4: Update `styles.css`**

Find these blocks and replace them.

Block at lines ~301–305 (read-only state):

```css
/* Read-only state: hide editor and divider; make preview full width; hide toggle button */
.canvas-md-side-editor-panel.read-only .cmside-pane-editor { display: none; }
.canvas-md-side-editor-panel.read-only .cmside-divider { display: none; }
.canvas-md-side-editor-panel.read-only .cmside-pane-preview { flex: 1 1 auto; }
.canvas-md-side-editor-panel.read-only .cmside-toggle-preview-btn { display: none; }
```

Replace with:

```css
/* Preview-only state (issue #16): hide editor and divider; make preview full width.
   Toggle button stays visible — it now cycles through all three states. */
.canvas-md-side-editor-panel[data-view-mode="preview"] .cmside-pane-editor { display: none; }
.canvas-md-side-editor-panel[data-view-mode="preview"] .cmside-divider { display: none; }
.canvas-md-side-editor-panel[data-view-mode="preview"] .cmside-pane-preview { flex: 1 1 auto; }
```

Block at lines ~335–339 (collapsed preview state):

```css
/* Collapsed preview state */
.canvas-md-side-editor-panel.preview-collapsed .cmside-pane-preview { display: none; }
.canvas-md-side-editor-panel.preview-collapsed .cmside-divider { display: none; }
.canvas-md-side-editor-panel.preview-collapsed .cmside-pane-editor { flex: 1 1 auto !important; }
.canvas-md-side-editor-panel.preview-collapsed .cmside-editor-root { border-right: none; }
```

Replace with:

```css
/* Editor-only state (issue #16): hide preview pane and divider; editor goes full width. */
.canvas-md-side-editor-panel[data-view-mode="editor"] .cmside-pane-preview { display: none; }
.canvas-md-side-editor-panel[data-view-mode="editor"] .cmside-divider { display: none; }
.canvas-md-side-editor-panel[data-view-mode="editor"] .cmside-pane-editor { flex: 1 1 auto !important; }
.canvas-md-side-editor-panel[data-view-mode="editor"] .cmside-editor-root { border-right: none; }
```

(`data-view-mode="both"` needs no rules — it's the default split layout.)

- [ ] **Step 5: Run tests, expect green**

Run: `npx vitest run tests/ui/panel.test.ts`
Expected: PASS — all panel tests pass, including the four new `setViewMode` cases.

Run: `npm test`
Expected: full suite passes.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add src/ui/panel.ts styles.css tests/ui/panel.test.ts
git commit -m ":sparkles: PanelController.setViewMode + data-view-mode CSS (issue #16)"
```

---

### Task 5: Refactor `main.ts` to drive `viewMode` (icons, cycle command, settings reads)

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Replace the toolbar wiring block**

Find the block at lines ~582–611 starting with `if (!this.panelController) {` and the `setToggleIcon` definition. Replace the inner block (starting from `this.panelController = new PanelController(...)` through the `return; // use controller-built panel`) with:

```ts
      this.panelController = new PanelController(
        container,
        () => this.settings,
        (s) => this.saveData(s),
        false, // legacy previewCollapsedInitial — unused now; ctor still expects a boolean.
      );
      const refs = this.panelController.create();
      this.panelEl = refs.panelEl;
      this.editorRootEl = refs.editorRootEl;
      this.previewRootEl = refs.previewRootEl;
      if (!this.previewHelper) this.previewHelper = new PreviewHelper(this.app, this);
      this.previewHelper.setContainer(this.previewRootEl!);

      // Toolbar icon + tooltip per current viewMode (issue #16).
      const ICONS: Record<ViewMode, string> = {
        editor: 'pencil',
        both: 'panel-left',
        preview: 'book-open',
      };
      const TOOLTIPS: Record<ViewMode, string> = {
        editor: 'View: Editor only — click for Both',
        both: 'View: Both — click for Preview',
        preview: 'View: Preview only — click for Editor',
      };
      const applyIcon = (mode: ViewMode) => {
        setIcon(refs.toggleBtn, ICONS[mode]);
        refs.toggleBtn.setAttribute('aria-label', TOOLTIPS[mode]);
        refs.toggleBtn.setAttribute('title', TOOLTIPS[mode]);
      };
      applyIcon(this.settings.viewMode);

      this.panelController.onToggle(() => { this.cycleViewMode(); });
      this.panelController.onClose(() => { try { this.saveAndClose(view); } catch {} });
      this.applyToolbarIcon = applyIcon; // expose for setViewMode to repaint
      return;
```

Add a private field for `applyToolbarIcon` near the other private fields at the top of the class (around line 46):

```ts
  private applyToolbarIcon: ((mode: ViewMode) => void) | null = null;
```

- [ ] **Step 2: Add the `ViewMode` import**

At the top of `src/main.ts`, alongside the other local imports:

```ts
import { migrateLegacyReadOnly, nextViewMode, type ViewMode } from './view-mode';
```

- [ ] **Step 3: Replace the `togglePreview` public method with `cycleViewMode` + `setViewMode`**

Find lines ~615–622:

```ts
  // Public method for commands to toggle preview (delegates to the toolbar button)
  public togglePreview(): void {
    try {
      if (!this.panelEl) return;
      const btn = this.panelEl.querySelector('.cmside-toggle-preview-btn') as HTMLButtonElement | null;
      btn?.click();
    } catch {}
  }
```

Replace with:

```ts
  // Cycle Editor → Both → Preview → Editor (issue #16).
  public cycleViewMode(): void {
    void this.setViewMode(nextViewMode(this.settings.viewMode));
  }

  // Apply a specific view mode: persist + push to panel + repaint toolbar icon.
  // Used by the cycle button, the settings dropdown, and command callbacks.
  public async setViewMode(mode: ViewMode): Promise<void> {
    this.settings.viewMode = mode;
    try { await this.saveData(this.settings); } catch {}
    try { this.panelController?.setViewMode?.(mode); } catch {}
    try { this.applyToolbarIcon?.(mode); } catch {}
  }
```

- [ ] **Step 4: Replace `settings.readOnly` reads with `viewMode === 'preview'` checks**

Three call sites:

(a) Line ~672 — gate around `openCmEditor`:

```ts
    if (!this.settings.readOnly) {
      await this.openCmEditor(initial);
```

becomes:

```ts
    if (this.settings.viewMode !== 'preview') {
      await this.openCmEditor(initial);
```

(b) Line ~717 — focus on open:

```ts
    if (!this.settings.readOnly) {
```

becomes:

```ts
    if (this.settings.viewMode !== 'preview') {
```

(c) Line ~978 — `if (!this.editorRootEl || !this.cmView || this.settings.readOnly) return;`:

```ts
    if (!this.editorRootEl || !this.cmView || this.settings.viewMode === 'preview') return;
```

- [ ] **Step 5: Remove the `previewCollapsed` field and its initialization**

Line ~46:

```ts
  private previewCollapsed: boolean = false;
```

Delete that line.

Line ~98:

```ts
    // Start with preview visible by default. Collapsed state is session-only.
    this.previewCollapsed = false;
```

Delete the assignment and the comment above it (the field is gone).

- [ ] **Step 6: Update the `setReadOnly` public wrapper**

Lines ~786–789:

```ts
  // Public wrappers used by the settings tab to avoid touching private fields
  public setReadOnly(v: boolean) {
    try { this.panelController?.setReadOnly?.(!!v); } catch {}
  }
```

Delete this method entirely. The settings tab will call `setViewMode` directly after Task 6.

- [ ] **Step 7: Verify build**

Run: `npm run build`
Expected: clean build. (TypeScript will flag any leftover references to removed pieces — fix them; there should be none after the steps above.)

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: full suite passes (`tests/ui/setting-tab.test.ts` may still pass since the legacy `setReadOnly` mock is a `vi.fn()` that is never asserted with new test setup — it will be replaced in Task 6).

- [ ] **Step 9: Commit**

```bash
git add src/main.ts
git commit -m ":sparkles: Drive panel from settings.viewMode in main.ts (issue #16)"
```

---

### Task 6: Replace settings-tab Read-only toggle with Default-view-mode dropdown

**Files:**
- Modify: `src/ui/setting-tab.ts:94-104`
- Modify: `tests/ui/setting-tab.test.ts`

- [ ] **Step 1: Update the failing test first**

In `tests/ui/setting-tab.test.ts`:

(a) Update the `setup` helper at the top of the file (lines 10–22). Remove `setReadOnly` and add `setViewMode`:

```ts
function setup(overrides: Partial<CanvasMdSideEditorSettings> = {}) {
  const settings: CanvasMdSideEditorSettings = { ...DEFAULT_SETTINGS, ...overrides };
  const plugin = {
    settings,
    saveData: vi.fn(async () => {}),
    setViewMode: vi.fn(async () => {}),
    applyFontSizes: vi.fn(),
    applyDockPosition: vi.fn(),
  };
  const tab = new CanvasMdSideEditorSettingTab(new App(), plugin as any);
  tab.display();
  return { tab, plugin, settings };
}
```

(b) Update the layout comment (lines 24–33). The `readOnly` row becomes a `<select>` so it leaves the input list. Final layout:

```ts
// Input slots in display order:
//   dockPosition (select #0)
//   defaultPanelWidth (input #0)
//   defaultPanelHeight (input #1)
//   previewDebounceMs (input #2)
//   viewMode (select #1)            ← issue #16, replaces readOnly toggle
//   headlineMode (input #3, checkbox)
//   headlineH1Size (input #4)
//   editorFontSize (input #5)
//   previewFontSize (input #6)
```

(c) Update the "renders the expected control set" test (line ~52):

```ts
describe('CanvasMdSideEditorSettingTab.display', () => {
  it('renders the expected control set', () => {
    const { tab } = setup();
    // 5 number inputs + 2 checkboxes = 7 <input> elements (readOnly was input #3, now a <select>)
    expect(tab.containerEl.querySelectorAll('input').length).toBe(7);
    // 2 dropdowns: dockPosition + viewMode
    expect(tab.containerEl.querySelectorAll('select').length).toBe(2);
  });
});
```

(d) Replace the `Read only toggle` describe block (lines 145–155) with a viewMode-dropdown test:

```ts
describe('Default view mode dropdown (issue #16)', () => {
  it('persists the selected mode and calls setViewMode', async () => {
    const { tab, plugin, settings } = setup({ viewMode: 'both' });
    const selects = tab.containerEl.querySelectorAll('select');
    // Index 0 is dockPosition, index 1 is viewMode.
    const viewModeSelect = selects[1] as HTMLSelectElement;
    viewModeSelect.value = 'preview';
    viewModeSelect.dispatchEvent(new Event('change'));
    await flushAsync();
    expect(settings.viewMode).toBe('preview');
    expect(plugin.setViewMode).toHaveBeenCalledWith('preview');
  });

  it('reflects the current viewMode as the initial selected option', () => {
    const { tab } = setup({ viewMode: 'editor' });
    const selects = tab.containerEl.querySelectorAll('select');
    expect((selects[1] as HTMLSelectElement).value).toBe('editor');
  });
});
```

(e) Update the existing tests at lines 159–193 that build their own plugin mocks (Headline mode toggle and Headline title size). Replace `setReadOnly: vi.fn(),` with `setViewMode: vi.fn(async () => {}),` in those mocks (3 call sites near lines 163, 185, and any other inline mocks). Adjust any `nthInput(...)` indices if they referred to inputs after the old readOnly toggle:
  - Headline mode checkbox was input #4 (after readOnly checkbox); it is now input #3.
  - Headline title size was input #5; now input #4.
  - Editor font size was input #6; now input #5.
  - Preview font size was input #7; now input #6.
  Update each `nthInput(tab.containerEl, N)` accordingly.

- [ ] **Step 2: Run tests, expect failure**

Run: `npx vitest run tests/ui/setting-tab.test.ts`
Expected: FAIL — `plugin.setViewMode` not invoked because the source still renders a Read-only toggle.

- [ ] **Step 3: Update `src/ui/setting-tab.ts`**

Add the import at the top:

```ts
import type { ViewMode } from '../view-mode';
```

Find the Read-only toggle block (lines 94–104):

```ts
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
```

Replace with:

```ts
    new Setting(containerEl)
      .setName('Default view mode')
      .setDesc('Sets the initial view mode for newly opened cards. You can change it any time from the toolbar.')
      .addDropdown((dd) => {
        dd.addOption('editor', 'Editor');
        dd.addOption('both', 'Both');
        dd.addOption('preview', 'Preview');
        dd.setValue(this.plugin.settings.viewMode);
        dd.onChange(async (val) => {
          const mode = val as ViewMode;
          this.plugin.settings.viewMode = mode;
          await this.plugin.saveData(this.plugin.settings);
          this.plugin.setViewMode?.(mode);
        });
      });
```

- [ ] **Step 4: Run tests, expect green**

Run: `npx vitest run tests/ui/setting-tab.test.ts`
Expected: all setting-tab tests pass.

Run: `npm test`
Expected: full suite passes.

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 6: Commit**

```bash
git add src/ui/setting-tab.ts tests/ui/setting-tab.test.ts
git commit -m ":sparkles: Replace Read-only toggle with Default view mode dropdown (issue #16)"
```

---

### Task 7: Update command registration

**Files:**
- Modify: `src/commands/register.ts`

- [ ] **Step 1: Edit `src/commands/register.ts`**

Replace the file contents with:

```ts
// Command registration for the Canvas MD Side Editor plugin.

type Command = {
  id: string;
  name: string;
  callback: () => void;
};

interface CommandRegistrablePlugin {
  addCommand(cmd: Command): void;
  cycleViewMode?(): void;
}

export function registerCommands(plugin: CommandRegistrablePlugin) {
  // Cycle the side panel's view mode through Editor → Both → Preview.
  // Command id is preserved from the previous "toggle preview" command so
  // users with existing hotkey bindings keep them working.
  plugin.addCommand({
    id: 'cmside-toggle-preview',
    name: 'Canvas Side Editor: Toggle Preview',
    callback: () => plugin.cycleViewMode?.(),
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: clean build.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add src/commands/register.ts
git commit -m ":wrench: Wire toggle-preview command to cycleViewMode (issue #16)"
```

---

### Task 8: Cleanup — remove legacy fields, methods, icons

This task strips everything that is no longer reached. After Task 7, the `readOnly` setting is unread and unwritten; the legacy panel methods are unused; the custom icons are unreferenced.

**Files:**
- Modify: `src/settings.ts`
- Modify: `src/ui/panel.ts`
- Modify: `src/main.ts`
- Modify: `tests/ui/panel.test.ts`

- [ ] **Step 1: Remove `readOnly` from settings**

In `src/settings.ts`:

(a) Remove the `readOnly?: boolean;` line from the interface.
(b) Remove the `readOnly: false,` line from `DEFAULT_SETTINGS`.

- [ ] **Step 2: Remove legacy panel methods**

In `src/ui/panel.ts`:

(a) Delete `setPreviewCollapsed(collapsed: boolean)` (the legacy delegating wrapper added in Task 4).
(b) Delete `setReadOnly(ro: boolean)` (same).
(c) Delete the `private readOnly: boolean = false;` field.
(d) Delete the `private previewCollapsed: boolean;` field and the lines in `create()` that set the `preview-collapsed` legacy class — they are no longer needed:

```ts
    // Legacy class kept in sync briefly so tasks 5–7 can land without flicker.
    if (this.previewCollapsed) panel.classList.add('preview-collapsed');
    this.applyCollapsedLayout();
```

becomes simply (the comment also goes):

```ts
    this.applyCollapsedLayout();
```

(e) Inside `setViewMode`, remove the legacy class-sync lines:

```ts
    this.panelEl.classList.toggle('preview-collapsed', mode === 'editor');
    this.panelEl.classList.toggle('read-only', mode === 'preview');
```

(f) Update the constructor — the 4th argument `previewCollapsedInitial: boolean` is now dead. Delete it from the parameter list and the constructor body. Update the corresponding setup helper in `tests/ui/panel.test.ts` (line ~23) to drop the trailing argument:

```ts
const controller = new PanelController(container, () => settings, persistSettings);
```

And update the helper's parameter list (line ~18) to remove `previewCollapsed = false`.

(g) Update the `main.ts` `new PanelController(...)` call site (around line 584) — drop the trailing `false` argument.

- [ ] **Step 3: Remove the custom icon registrations**

In `src/main.ts`:

(a) Delete the `addIcon` calls and their try/catch (lines ~100–104):

```ts
    // Register custom icons for toggle button
    try {
      addIcon('cmside-two-cols', iconTwoCols);
      addIcon('cmside-one-col', iconOneCol);
    } catch {}
```

(b) Remove `addIcon` from the `obsidian` import (line 2). Final import:

```ts
import { Notice, Plugin, TFile, WorkspaceLeaf, setIcon } from 'obsidian';
```

(c) Find and remove the `iconTwoCols` and `iconOneCol` constants (string literals defined elsewhere in `main.ts`). Search for `iconTwoCols` and `iconOneCol` and delete their declarations.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: clean build with no TypeScript errors.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: full suite passes.

- [ ] **Step 6: Commit**

```bash
git add src/settings.ts src/ui/panel.ts src/main.ts tests/ui/panel.test.ts
git commit -m ":fire: Remove legacy readOnly setting, panel setters, custom icons (issue #16)"
```

---

### Task 9: Manual verification in Obsidian

This task has no automated tests; it's a sanity pass against the spec's manual checklist. Run after Task 8 commits.

**Files:**
- None (verification only)

- [ ] **Step 1: Build the plugin**

Run: `npm run build`
Expected: `main.js` is up-to-date.

- [ ] **Step 2: Reload Obsidian and walk through the checklist**

Open Obsidian on a vault with this plugin sideloaded. Open a Canvas, click into a card to open the side editor, and verify each item:

- [ ] Click the toolbar button 4 times — view returns to its starting state.
- [ ] Hover the toolbar button — tooltip shows `View: <current> — click for <next>`.
- [ ] Restart Obsidian — last-set viewMode is restored.
- [ ] Switch dock to left / right / top / bottom / floating — toolbar button stays usable in each, no overlap.
- [ ] Toggle Headline mode on (issue #13 setting) — cycling viewMode does not affect H1 size.
- [ ] Open Command Palette and search "toggle preview" — the command is found and executes a cycle.
- [ ] Edit `<vault>/.obsidian/plugins/canvas-markdown-side-editor/data.json` to `{ "readOnly": true }`, restart Obsidian, reopen the file — file now contains `"viewMode": "preview"` and no `readOnly` key.
- [ ] Open Settings → Canvas MD Side Editor → change Default view mode dropdown — any open card immediately reflects the change.

- [ ] **Step 3: If everything passed, push the branch**

```bash
git push -u origin feat/issue-16-three-state-view-toggle
```

If anything failed, file follow-up commits scoped to the failing item. Do not amend already-pushed commits.

---

## Self-review notes (post-write)

This was checked once after the plan was drafted:

- **Spec coverage:** every requirement in `docs/superpowers/specs/2026-05-04-issue-16-three-state-view-toggle-design.md` maps to a task — state model (Task 1), settings (Tasks 2, 6, 8), migration (Tasks 1, 3), panel API (Task 4), main wiring (Task 5), settings tab (Task 6), command (Task 7), CSS (Task 4), tests (Tasks 1, 4, 6), manual checklist (Task 9). Cleanup of orphan icons and dead `readOnly` field — Task 8.
- **Type consistency:** `setViewMode` signature is `(mode: ViewMode) => void` on PanelController and `(mode: ViewMode) => Promise<void>` on the plugin. The plugin version is async because it calls `saveData`. Test mocks reflect this (`vi.fn(async () => {})`). Command callback uses `cycleViewMode?.()` consistently.
- **Placeholder scan:** none.
- **Risk:** Task 5 step 1 leaves a vestigial `false` argument to `new PanelController(...)` until Task 8 step 2(f)–2(g) drops the unused parameter. Documented inline.

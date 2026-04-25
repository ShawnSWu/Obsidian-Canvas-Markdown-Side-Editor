import type { CanvasMdSideEditorSettings, DockPosition } from '../settings';

const DOCK_CLASSES: Record<DockPosition, string> = {
  left: 'cmside-dock-left',
  right: 'cmside-dock-right',
  top: 'cmside-dock-top',
  bottom: 'cmside-dock-bottom',
  floating: 'cmside-dock-floating',
};
const ALL_DOCK_CLASSES = Object.values(DOCK_CLASSES);

export type PanelRefs = {
  panelEl: HTMLElement;
  editorRootEl: HTMLElement;
  previewRootEl: HTMLElement;
  toggleBtn: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
};

export class PanelController {
  private container: HTMLElement;
  private getSettings: () => CanvasMdSideEditorSettings;
  private persistSettings: (s: CanvasMdSideEditorSettings) => Promise<void> | void;
  private previewCollapsed: boolean;
  private readOnly: boolean = false;
  private dockPosition: DockPosition = 'right';

  private panelEl: HTMLElement | null = null;
  private editorRootEl: HTMLElement | null = null;
  private previewRootEl: HTMLElement | null = null;
  private toggleBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;
  private titleEl!: HTMLElement;
  private dividerEl!: HTMLElement;
  private editorPaneEl!: HTMLElement;
  private previewPaneEl!: HTMLElement;
  private panelResizerEl!: HTMLElement;
  private cornerResizerEl!: HTMLElement;
  private toolbarEl!: HTMLElement;
  private detachFns: Array<() => void> = [];
  private containerPosPatched = false;
  private editorFlexBeforeCollapse: string | null = null;
  // Track currently applied preset classes so we can swap cleanly
  private currentPanelWidthClass: string | null = null;
  private currentEditorWidthClass: string | null = null;
  private currentEditorFontClass: string | null = null;
  private currentPreviewFontClass: string | null = null;

  constructor(
    container: HTMLElement,
    getSettings: () => CanvasMdSideEditorSettings,
    persistSettings: (s: CanvasMdSideEditorSettings) => Promise<void> | void,
    previewCollapsedInitial: boolean,
  ) {
    this.container = container;
    this.getSettings = getSettings;
    this.persistSettings = persistSettings;
    this.previewCollapsed = !!previewCollapsedInitial;
  }

  create(): PanelRefs {
    // Ensure container is positioned so the absolute panel anchors correctly
    try {
      const pos = getComputedStyle(this.container).position;
      if (!pos || pos === 'static') {
        this.container.classList.add('cmside-container-patched');
        this.containerPosPatched = true;
      }
    } catch {}

    const panel = this.container.createDiv({ cls: 'canvas-md-side-editor-panel' });
    // Apply dock position class based on settings (issue #11). Size and
    // floating-position rules are applied lazily inside applyDockSizing()
    // because that path is also reused by setDockPosition().
    const initialDock = this.getSettings()?.dockPosition ?? 'right';
    this.dockPosition = initialDock;
    panel.classList.add(DOCK_CLASSES[initialDock]);

    const toolbar = panel.createDiv({ cls: 'cmside-toolbar' });
    const titleEl = toolbar.createDiv({ cls: 'cmside-title' });
    titleEl.setText('Canvas MD Side Editor');
    const actionsEl = toolbar.createDiv({ cls: 'cmside-actions' });
    const toggleBtn = actionsEl.createEl('button', { cls: 'cmside-toggle-preview-btn' });
    const closeBtn = actionsEl.createEl('button', { cls: 'cmside-close-btn', text: '×' });

    const split = panel.createDiv({ cls: 'cmside-split' });
    const editorPane = split.createDiv({ cls: 'cmside-pane cmside-pane-editor' });
    const editorHeader = editorPane.createDiv({ cls: 'cmside-pane-header' });
    editorHeader.setText('Editor');
    const editorRoot = editorPane.createDiv({ cls: 'cmside-editor-root markdown-source-view cm-s-obsidian mod-cm6' });

    const divider = split.createDiv({ cls: 'cmside-divider', title: 'Drag to resize' });

    const previewPane = split.createDiv({ cls: 'cmside-pane cmside-pane-preview' });
    const previewHeader = previewPane.createDiv({ cls: 'cmside-pane-header' });
    previewHeader.setText('Preview');
    const previewRoot = previewPane.createDiv({ cls: 'cmside-preview-root markdown-reading-view markdown-preview-view markdown-rendered' });

    // Panel width resizer (left edge)
    const panelResizer = panel.createDiv({ cls: 'cmside-panel-resizer', title: 'Drag to resize panel' });

    // Bottom-right corner resize handle, only visible in floating mode (issue #11).
    const cornerResizer = panel.createDiv({ cls: 'cmside-corner-resizer', title: 'Drag to resize' });

    // Store refs
    this.panelEl = panel;
    this.editorRootEl = editorRoot;
    this.previewRootEl = previewRoot;
    this.toggleBtn = toggleBtn;
    this.closeBtn = closeBtn;
    this.titleEl = titleEl;
    this.dividerEl = divider;
    this.editorPaneEl = editorPane;
    this.previewPaneEl = previewPane;
    this.panelResizerEl = panelResizer;
    this.cornerResizerEl = cornerResizer;
    this.toolbarEl = toolbar;

    // Initialize preview collapsed UI
    if (this.previewCollapsed) panel.classList.add('preview-collapsed');
    // Ensure layout reflects collapsed state (editor should occupy full width)
    this.applyCollapsedLayout();

    // Apply initial read-only from settings if available
    try {
      const s = this.getSettings();
      this.setReadOnly(!!s?.readOnly);
    } catch {}

    // Initialize and apply font sizes from settings (capture theme defaults if unset or legacy <= 0)
    try {
      const s = this.getSettings();
      let changed = false;
      // Capture current computed sizes as defaults if null
      if (s) {
        if (s.editorFontSize == null || (typeof s.editorFontSize === 'number' && s.editorFontSize <= 0)) {
          const ef = parseInt(getComputedStyle(editorRoot).fontSize || '16', 10);
          if (isFinite(ef)) { s.editorFontSize = Math.max(8, Math.round(ef)); changed = true; }
        }
        if (s.previewFontSize == null || (typeof s.previewFontSize === 'number' && s.previewFontSize <= 0)) {
          const pf = parseInt(getComputedStyle(previewRoot).fontSize || '16', 10);
          if (isFinite(pf)) { s.previewFontSize = Math.max(8, Math.round(pf)); changed = true; }
        }
        if (changed) {
          try { this.persistSettings(s); } catch {}
        }
        // Apply sizes via CSS variables on the panel element
        if (this.panelEl) {
          this.applyFontSizeClassesFromSettings(s);
        }
      }
    } catch {}

    // Apply size / floating-position presets matching the current dock.
    this.applyDockSizing();

    // Listeners
    this.setupPanelResize(panel);
    this.setupSplitResize(panel, editorPane, previewPane, divider);
    this.setupScrollGuards(panel);
    this.setupFloatingDrag(panel);
    this.setupFloatingResize(panel);

    return {
      panelEl: panel,
      editorRootEl: editorRoot,
      previewRootEl: previewRoot,
      toggleBtn,
      closeBtn,
    };
  }

  // Attach external handlers
  onToggle(cb: () => void) {
    const handler = () => { try { cb(); } catch {} };
    this.toggleBtn.addEventListener('click', handler);
    this.detachFns.push(() => this.toggleBtn.removeEventListener('click', handler));
  }
  onClose(cb: () => void) {
    const handler = () => { try { cb(); } catch {} };
    this.closeBtn.addEventListener('click', handler);
    this.detachFns.push(() => this.closeBtn.removeEventListener('click', handler));
  }

  // UI state
  setPreviewCollapsed(collapsed: boolean) {
    if (!this.panelEl) return;
    if (this.readOnly) collapsed = false; // force visible in read-only
    this.previewCollapsed = !!collapsed;
    if (this.previewCollapsed) this.panelEl.classList.add('preview-collapsed');
    else this.panelEl.classList.remove('preview-collapsed');
    this.applyCollapsedLayout();
  }

  setReadOnly(ro: boolean) {
    this.readOnly = !!ro;
    if (!this.panelEl) return;
    if (this.readOnly) {
      this.panelEl.classList.add('read-only');
      // ensure preview is visible and layout updated
      this.setPreviewCollapsed(false);
    } else {
      this.panelEl.classList.remove('read-only');
      // restore layout based on current collapsed state
      this.setPreviewCollapsed(this.previewCollapsed);
    }
  }

  private applyCollapsedLayout() {
    try {
      // Layout is driven by CSS classes in styles.css (e.g., .preview-collapsed)
      // No inline style manipulation needed here.
    } catch {}
  }

  applyFontSizes() {
    try {
      const s = this.getSettings();
      if (this.panelEl && s) this.applyFontSizeClassesFromSettings(s);
    } catch {}
  }

  // Render the toolbar title. When `onCommit` is provided the title is shown
  // as an editable <input>; the callback fires on Enter or blur, but only if
  // the value actually changed (Escape reverts and skips the callback).
  setTitle(text: string, onCommit?: (newText: string) => void): void {
    if (!this.titleEl) return;
    this.titleEl.empty();
    this.titleEl.classList.toggle('cmside-title-editable', !!onCommit);
    if (!onCommit) {
      this.titleEl.setText(text);
      return;
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cmside-title-input';
    input.value = text;
    input.spellcheck = false;

    let committed = false;
    let original = text;
    const commit = () => {
      if (committed) return;
      committed = true;
      const newText = input.value;
      if (newText !== original) {
        try { onCommit(newText); } catch {}
      }
    };
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        input.value = original;
        committed = true;
        input.blur();
      }
    });
    input.addEventListener('blur', commit);

    this.titleEl.appendChild(input);
  }

  // Swap the dock position class. The drag axis used by the panel resizer is
  // re-derived from this on each drag, so no resizer rebuild is needed.
  setDockPosition(pos: DockPosition): void {
    this.dockPosition = pos;
    if (!this.panelEl) return;
    for (const c of ALL_DOCK_CLASSES) this.panelEl.classList.remove(c);
    this.panelEl.classList.add(DOCK_CLASSES[pos]);
    this.applyDockSizing();
  }

  // Apply the size class (width or height preset) and, when floating, the
  // position / size CSS variables. Called from create() and setDockPosition().
  private applyDockSizing(): void {
    if (!this.panelEl) return;
    if (this.currentPanelWidthClass) {
      this.panelEl.classList.remove(this.currentPanelWidthClass);
      this.currentPanelWidthClass = null;
    }
    const pos = this.dockPosition;
    const s = this.getSettings();
    if (pos === 'floating') {
      // Floating uses freeform CSS variables for x/y/w/h rather than preset
      // classes since the values are arbitrary px coordinates.
      const x = Math.round(s?.floatingX ?? 80);
      const y = Math.round(s?.floatingY ?? 80);
      const w = Math.round(s?.floatingWidth ?? 480);
      const h = Math.round(s?.floatingHeight ?? 400);
      this.panelEl.style.setProperty('--cmside-float-x', `${x}px`);
      this.panelEl.style.setProperty('--cmside-float-y', `${y}px`);
      this.panelEl.style.setProperty('--cmside-float-w', `${w}px`);
      this.panelEl.style.setProperty('--cmside-float-h', `${h}px`);
      return;
    }
    try {
      const isHorizontal = pos === 'left' || pos === 'right';
      const dim = isHorizontal ? s?.defaultPanelWidth : s?.defaultPanelHeight;
      if (typeof dim === 'number' && dim > 0) {
        this.panelEl.classList.add('cmside-has-custom-width');
        const cls = isHorizontal
          ? this.mapToPanelWidthClass(Math.round(dim))
          : this.mapToPanelHeightClass(Math.round(dim));
        if (cls) {
          this.panelEl.classList.add(cls);
          this.currentPanelWidthClass = cls;
        }
      }
    } catch {}
  }

  // Internal wiring
  private setupPanelResize(panel: HTMLElement) {
    const onPanelResizerPointerDown = (ev: PointerEvent) => {
      ev.preventDefault();
      // Dock direction decides which axis the user is dragging along, and
      // whether the panel grows/shrinks with positive or negative delta.
      const pos = this.dockPosition;
      const isHorizontal = pos === 'left' || pos === 'right';
      const startCoord = isHorizontal ? ev.clientX : ev.clientY;
      const rect = panel.getBoundingClientRect();
      const startSize = isHorizontal ? rect.width : rect.height;
      const containerRect = this.container.getBoundingClientRect();
      const containerSize = isHorizontal ? containerRect.width : containerRect.height;
      const minSize = isHorizontal ? 300 : 200; // px (align with preset classes)
      const maxSize = Math.max(minSize, Math.min(containerSize - 120, containerSize));
      // Resizer sits on the inner edge of the panel:
      //   right dock  → resizer on left edge  → drag right shrinks (delta>0 → -)
      //   left  dock  → resizer on right edge → drag right grows   (delta>0 → +)
      //   bottom dock → resizer on top edge   → drag down shrinks  (delta>0 → -)
      //   top    dock → resizer on bottom edge → drag down grows   (delta>0 → +)
      const sign = (pos === 'right' || pos === 'bottom') ? -1 : 1;
      panel.classList.add('resizing-panel');
      try { (ev.target as Element)?.setPointerCapture?.(ev.pointerId); } catch {}

      const onMove = (mv: PointerEvent) => {
        const cur = isHorizontal ? mv.clientX : mv.clientY;
        const delta = (cur - startCoord) * sign;
        const newSize = Math.min(maxSize, Math.max(minSize, startSize + delta));
        panel.classList.add('cmside-has-custom-width');
        const cls = isHorizontal
          ? this.mapToPanelWidthClass(Math.round(newSize))
          : this.mapToPanelHeightClass(Math.round(newSize));
        if (cls && this.currentPanelWidthClass !== cls) {
          if (this.currentPanelWidthClass) panel.classList.remove(this.currentPanelWidthClass);
          panel.classList.add(cls);
          this.currentPanelWidthClass = cls;
        }
      };
      const onUp = async () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        panel.classList.remove('resizing-panel');
        // Persist the new size to the dimension matching the current dock.
        try {
          const s = this.getSettings();
          const r = panel.getBoundingClientRect();
          const newDim = isHorizontal ? r.width : r.height;
          if (newDim && isFinite(newDim) && s) {
            if (isHorizontal) s.defaultPanelWidth = Math.round(newDim);
            else s.defaultPanelHeight = Math.round(newDim);
            await this.persistSettings(s);
          }
        } catch {}
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    };
    const onPanelResizerDblClick = () => {
      try {
        panel.classList.remove('cmside-has-custom-width');
        if (this.currentPanelWidthClass) panel.classList.remove(this.currentPanelWidthClass);
        this.currentPanelWidthClass = null;
      } catch {}
    };

    this.panelResizerEl.addEventListener('pointerdown', onPanelResizerPointerDown);
    this.panelResizerEl.addEventListener('dblclick', onPanelResizerDblClick);
    this.detachFns.push(() => this.panelResizerEl.removeEventListener('pointerdown', onPanelResizerPointerDown));
    this.detachFns.push(() => this.panelResizerEl.removeEventListener('dblclick', onPanelResizerDblClick));
  }

  private setupSplitResize(panel: HTMLElement, editorPane: HTMLElement, previewPane: HTMLElement, divider: HTMLElement) {
    const onDividerPointerDown = (ev: PointerEvent) => {
      ev.preventDefault();
      const panelRect = (panel.querySelector('.cmside-split') as HTMLElement).getBoundingClientRect();
      const startX = ev.clientX;
      const editorRect = editorPane.getBoundingClientRect();
      const dividerRect = divider.getBoundingClientRect();
      const minWidth = 200; // px
      const maxWidth = Math.max(minWidth, panelRect.width - dividerRect.width - minWidth);
      panel.classList.add('resizing');

      const onMove = (mv: PointerEvent) => {
        const delta = mv.clientX - startX;
        const newW = Math.min(maxWidth, Math.max(minWidth, editorRect.width + delta));
        // Lock editor width via preset class; preview flex is handled by CSS
        panel.classList.add('cmside-editor-fixed');
        const cls = this.mapToEditorWidthClass(Math.round(newW));
        if (cls && this.currentEditorWidthClass !== cls) {
          if (this.currentEditorWidthClass) panel.classList.remove(this.currentEditorWidthClass);
          panel.classList.add(cls);
          this.currentEditorWidthClass = cls;
        }
      };
      const onUp = async () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        panel.classList.remove('resizing');
        // Persist width to settings
        try {
          const s = this.getSettings();
          const newWidth = panel.getBoundingClientRect().width;
          if (newWidth && isFinite(newWidth)) {
            s.defaultPanelWidth = Math.round(newWidth);
            await this.persistSettings(s);
          }
        } catch {}
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    };

    divider.addEventListener('pointerdown', onDividerPointerDown);
    this.detachFns.push(() => divider.removeEventListener('pointerdown', onDividerPointerDown));
  }

  private setupScrollGuards(panel: HTMLElement) {
    const stopWheelBubble = (e: WheelEvent) => { e.stopPropagation(); };
    panel.addEventListener('wheel', stopWheelBubble, { capture: true, passive: true } as AddEventListenerOptions);
    panel.addEventListener('wheel', stopWheelBubble, { capture: false, passive: true } as AddEventListenerOptions);

    const stopTouchMoveBubble = (e: TouchEvent) => { e.stopPropagation(); };
    panel.addEventListener('touchmove', stopTouchMoveBubble, { capture: true, passive: true } as AddEventListenerOptions);
    panel.addEventListener('touchmove', stopTouchMoveBubble, { capture: false, passive: true } as AddEventListenerOptions);

    this.detachFns.push(() => panel.removeEventListener('wheel', stopWheelBubble, true));
    this.detachFns.push(() => panel.removeEventListener('wheel', stopWheelBubble, false));
    this.detachFns.push(() => panel.removeEventListener('touchmove', stopTouchMoveBubble, true));
    this.detachFns.push(() => panel.removeEventListener('touchmove', stopTouchMoveBubble, false));
  }

  // Floating-mode drag (issue #11). The toolbar acts as the drag handle, but
  // we ignore drags that started on the title input or one of the action
  // buttons so those keep their normal interactivity.
  private setupFloatingDrag(panel: HTMLElement) {
    const KEEP_INTERACTIVE = 'input, button, .cmside-actions';
    const FLOATING_MARGIN = 80; // px — keep at least this much inside viewport
    const onPointerDown = (ev: PointerEvent) => {
      if (this.dockPosition !== 'floating') return;
      if (ev.button !== 0) return;
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(KEEP_INTERACTIVE)) return;

      ev.preventDefault();
      const rect = panel.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const startX = ev.clientX;
      const startY = ev.clientY;
      // Position of panel relative to the container (not the viewport).
      const startPanelX = rect.left - containerRect.left;
      const startPanelY = rect.top - containerRect.top;
      const panelW = rect.width;
      const panelH = rect.height;
      panel.classList.add('cmside-floating-dragging');
      try { (ev.target as Element)?.setPointerCapture?.(ev.pointerId); } catch {}

      const onMove = (mv: PointerEvent) => {
        const dx = mv.clientX - startX;
        const dy = mv.clientY - startY;
        const minX = FLOATING_MARGIN - panelW;            // allow panel mostly off-left, keep margin visible
        const maxX = containerRect.width - FLOATING_MARGIN;
        const minY = 0;                                   // never above container top
        const maxY = containerRect.height - FLOATING_MARGIN;
        const newX = Math.min(maxX, Math.max(minX, startPanelX + dx));
        const newY = Math.min(maxY, Math.max(minY, startPanelY + dy));
        panel.style.setProperty('--cmside-float-x', `${Math.round(newX)}px`);
        panel.style.setProperty('--cmside-float-y', `${Math.round(newY)}px`);
      };
      const onUp = async () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        panel.classList.remove('cmside-floating-dragging');
        try {
          const s = this.getSettings();
          if (!s) return;
          const r = panel.getBoundingClientRect();
          s.floatingX = Math.round(r.left - this.container.getBoundingClientRect().left);
          s.floatingY = Math.round(r.top - this.container.getBoundingClientRect().top);
          await this.persistSettings(s);
        } catch {}
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    };
    this.toolbarEl.addEventListener('pointerdown', onPointerDown);
    this.detachFns.push(() => this.toolbarEl.removeEventListener('pointerdown', onPointerDown));
  }

  // Floating-mode bottom-right corner resize (issue #11).
  private setupFloatingResize(panel: HTMLElement) {
    const MIN_W = 280;
    const MIN_H = 200;
    const onPointerDown = (ev: PointerEvent) => {
      if (this.dockPosition !== 'floating') return;
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.stopPropagation();
      const startX = ev.clientX;
      const startY = ev.clientY;
      const rect = panel.getBoundingClientRect();
      const startW = rect.width;
      const startH = rect.height;
      const containerRect = this.container.getBoundingClientRect();
      const panelLeft = rect.left - containerRect.left;
      const panelTop = rect.top - containerRect.top;
      const maxW = Math.max(MIN_W, containerRect.width - panelLeft);
      const maxH = Math.max(MIN_H, containerRect.height - panelTop);
      panel.classList.add('cmside-floating-resizing');
      try { (ev.target as Element)?.setPointerCapture?.(ev.pointerId); } catch {}

      const onMove = (mv: PointerEvent) => {
        const newW = Math.min(maxW, Math.max(MIN_W, startW + (mv.clientX - startX)));
        const newH = Math.min(maxH, Math.max(MIN_H, startH + (mv.clientY - startY)));
        panel.style.setProperty('--cmside-float-w', `${Math.round(newW)}px`);
        panel.style.setProperty('--cmside-float-h', `${Math.round(newH)}px`);
      };
      const onUp = async () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        panel.classList.remove('cmside-floating-resizing');
        try {
          const s = this.getSettings();
          if (!s) return;
          const r = panel.getBoundingClientRect();
          s.floatingWidth = Math.round(r.width);
          s.floatingHeight = Math.round(r.height);
          await this.persistSettings(s);
        } catch {}
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    };
    this.cornerResizerEl.addEventListener('pointerdown', onPointerDown);
    this.detachFns.push(() => this.cornerResizerEl.removeEventListener('pointerdown', onPointerDown));
  }

  // Helpers: map numeric values to preset classes and apply font-size classes
  private mapToPanelWidthClass(px: number): string | null {
    // Quantize to 300..800, step 20 -> class: cmside-width-w{px}
    const q = this.quantize(px, 300, 800, 20);
    return q ? `cmside-width-w${q}` : null;
  }

  private mapToPanelHeightClass(px: number): string | null {
    // Quantize to 200..700, step 20 -> class: cmside-height-h{px}
    const q = this.quantize(px, 200, 700, 20);
    return q ? `cmside-height-h${q}` : null;
  }

  private mapToEditorWidthClass(px: number): string | null {
    // Quantize to 200..800, step 20 -> class: cmside-editor-w-{px}
    const q = this.quantize(px, 200, 800, 20);
    return q ? `cmside-editor-w-${q}` : null;
  }

  private mapToEditorFontClass(px: number): string | null {
    const presets: Array<{ cls: string; px: number }> = [
      { cls: 'cmside-editor-font-xs', px: 12 },
      { cls: 'cmside-editor-font-sm', px: 13 },
      { cls: 'cmside-editor-font-md', px: 14 },
      { cls: 'cmside-editor-font-lg', px: 16 },
      { cls: 'cmside-editor-font-xl', px: 18 },
    ];
    return this.pickNearestPreset(px, presets);
  }

  private mapToPreviewFontClass(px: number): string | null {
    const presets: Array<{ cls: string; px: number }> = [
      { cls: 'cmside-preview-font-xs', px: 12 },
      { cls: 'cmside-preview-font-sm', px: 13 },
      { cls: 'cmside-preview-font-md', px: 14 },
      { cls: 'cmside-preview-font-lg', px: 16 },
      { cls: 'cmside-preview-font-xl', px: 18 },
    ];
    return this.pickNearestPreset(px, presets);
  }

  private pickNearestPreset(px: number, presets: Array<{ cls: string; px: number }>): string | null {
    if (!isFinite(px)) return null;
    let best: { cls: string; px: number } | null = null;
    let bestDiff = Infinity;
    for (const p of presets) {
      const d = Math.abs(px - p.px);
      if (d < bestDiff) { best = p; bestDiff = d; }
    }
    return best?.cls ?? null;
  }

  private quantize(px: number, min: number, max: number, step: number): number | null {
    if (!isFinite(px)) return null;
    const clamped = Math.max(min, Math.min(max, px));
    const q = Math.round((clamped - min) / step) * step + min;
    return q;
  }

  private applyFontSizeClassesFromSettings(s: CanvasMdSideEditorSettings) {
    if (!this.panelEl) return;
    // Editor font
    if (this.currentEditorFontClass) this.panelEl.classList.remove(this.currentEditorFontClass);
    if (s.editorFontSize != null && s.editorFontSize > 0) {
      const cls = this.mapToEditorFontClass(Math.round(s.editorFontSize));
      if (cls) {
        this.panelEl.classList.add(cls);
        this.currentEditorFontClass = cls;
      } else {
        this.currentEditorFontClass = null;
      }
    } else {
      this.currentEditorFontClass = null;
    }
    // Preview font
    if (this.currentPreviewFontClass) this.panelEl.classList.remove(this.currentPreviewFontClass);
    if (s.previewFontSize != null && s.previewFontSize > 0) {
      const cls = this.mapToPreviewFontClass(Math.round(s.previewFontSize));
      if (cls) {
        this.panelEl.classList.add(cls);
        this.currentPreviewFontClass = cls;
      } else {
        this.currentPreviewFontClass = null;
      }
    } else {
      this.currentPreviewFontClass = null;
    }
  }

  destroy() {
    while (this.detachFns.length) {
      const off = this.detachFns.pop();
      try { off && off(); } catch {}
    }
    if (this.panelEl) {
      try { this.panelEl.remove(); } catch {}
      this.panelEl = null;
    }
    if (this.containerPosPatched) {
      try { this.container.classList.remove('cmside-container-patched'); } catch {}
      this.containerPosPatched = false;
    }
    this.editorRootEl = null;
    this.previewRootEl = null;
  }
}

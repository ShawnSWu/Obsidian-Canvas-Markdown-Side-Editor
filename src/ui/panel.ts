import type { CanvasMdSideEditorSettings } from '../settings';

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

  private panelEl: HTMLElement | null = null;
  private editorRootEl: HTMLElement | null = null;
  private previewRootEl: HTMLElement | null = null;
  private toggleBtn!: HTMLButtonElement;
  private closeBtn!: HTMLButtonElement;
  private dividerEl!: HTMLElement;
  private editorPaneEl!: HTMLElement;
  private previewPaneEl!: HTMLElement;
  private panelResizerEl!: HTMLElement;
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
    // Apply default width from settings
    try {
      const w = this.getSettings()?.defaultPanelWidth;
      if (typeof w === 'number' && w > 0) {
        panel.classList.add('cmside-has-custom-width');
        const cls = this.mapToPanelWidthClass(Math.round(w));
        if (cls) {
          panel.classList.add(cls);
          this.currentPanelWidthClass = cls;
        }
      }
    } catch {}

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

    // Store refs
    this.panelEl = panel;
    this.editorRootEl = editorRoot;
    this.previewRootEl = previewRoot;
    this.toggleBtn = toggleBtn;
    this.closeBtn = closeBtn;
    this.dividerEl = divider;
    this.editorPaneEl = editorPane;
    this.previewPaneEl = previewPane;
    this.panelResizerEl = panelResizer;

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

    // Listeners
    this.setupPanelResize(panel);
    this.setupSplitResize(panel, editorPane, previewPane, divider);
    this.setupScrollGuards(panel);

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

  // Internal wiring
  private setupPanelResize(panel: HTMLElement) {
    const onPanelResizerPointerDown = (ev: PointerEvent) => {
      ev.preventDefault();
      const startX = ev.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      const containerRect = this.container.getBoundingClientRect();
      const minWidth = 300; // px (align with preset classes)
      const maxWidth = Math.max(minWidth, Math.min(containerRect.width - 120, containerRect.width));
      panel.classList.add('resizing-panel');
      try { (ev.target as Element)?.setPointerCapture?.((ev as any).pointerId); } catch {}

      const onMove = (mv: PointerEvent) => {
        const delta = mv.clientX - startX; // dragging right -> delta>0 -> width decreases
        const newW = Math.min(maxWidth, Math.max(minWidth, startWidth - delta));
        // Apply nearest preset class live while dragging
        panel.classList.add('cmside-has-custom-width');
        const cls = this.mapToPanelWidthClass(Math.round(newW));
        if (cls && this.currentPanelWidthClass !== cls) {
          if (this.currentPanelWidthClass) panel.classList.remove(this.currentPanelWidthClass);
          panel.classList.add(cls);
          this.currentPanelWidthClass = cls;
        }
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        panel.classList.remove('resizing-panel');
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

    this.detachFns.push(() => panel.removeEventListener('wheel', stopWheelBubble, { capture: true } as any));
    this.detachFns.push(() => panel.removeEventListener('wheel', stopWheelBubble, { capture: false } as any));
    this.detachFns.push(() => panel.removeEventListener('touchmove', stopTouchMoveBubble, { capture: true } as any));
    this.detachFns.push(() => panel.removeEventListener('touchmove', stopTouchMoveBubble, { capture: false } as any));
  }

  // Helpers: map numeric values to preset classes and apply font-size classes
  private mapToPanelWidthClass(px: number): string | null {
    // Quantize to 300..800, step 20 -> class: cmside-width-w{px}
    const q = this.quantize(px, 300, 800, 20);
    return q ? `cmside-width-w${q}` : null;
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

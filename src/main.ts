import { EditorView } from '@codemirror/view';
import { Plugin, TFile, WorkspaceLeaf, addIcon, setIcon } from 'obsidian';
import { CanvasMdSideEditorSettings, DEFAULT_SETTINGS } from './settings';
import type { CanvasNode, CanvasData } from './types';
import { iconOneCol, iconTwoCols } from './ui/icons';
import { CanvasMdSideEditorSettingTab } from './ui/setting-tab';
import { findNodeIdAtPoint } from './utils/canvas';
import { registerCommands } from './commands/register';
import { createEditor } from './ui/editor';
import { hitTestNodeAt as hitTestNodeAtUtil, getCanvasNodeById as getNodeByIdUtil, readCanvasData as readCanvasDataUtil } from './utils/canvas-data';
import { getSelectedCanvasNodeId as getSelId, tryCanvasAPIsForHit as tryAPIsHit } from './utils/canvas-selection';
import { PreviewHelper } from './ui/preview';
import { PanelController } from './ui/panel';
import { writeNodeContent as writeNodeContentUtil } from './utils/canvas-write';

/*
 Canvas Markdown Side Editor
 - Detect clicks on Canvas Markdown (text) cards
 - Open a right-side CodeMirror editor styled like Obsidian
 - Save edits back to the Canvas file on background click or switching cards
*/

// types and settings imported from modules

class CanvasMdSideEditorPlugin extends Plugin {
  private panelEl: HTMLElement | null = null;
  private editorRootEl: HTMLElement | null = null;
  private cmView: EditorView | null = null;
  private currentNodeId: string | null = null;
  private currentCanvasFile: TFile | null = null;
  private currentNode: CanvasNode | null = null;
  private detachHandlers: Array<() => void> = [];
  private pendingNodeId: string | null = null;
  private previewRootEl: HTMLElement | null = null;
  private previewTimer: number | null = null;
  private currentSourcePath: string = '';
  private cmScrollHandler: ((e: Event) => void) | null = null;
  private onResizeHandler: (() => void) | null = null;
  // UX helpers for editor focusing on blank clicks
  private editorClickHandler: ((e: MouseEvent) => void) | null = null;
  private editorClickAttachedEl: HTMLElement | null = null;
  private containerElRef: HTMLElement | null = null;
  private containerPosPatched: boolean = false;
  private previewCollapsed: boolean = false;
  private previewHelper: PreviewHelper | null = null;
  private panelController: PanelController | null = null;
  public settings!: CanvasMdSideEditorSettings;

  // Zoom-to-selection integration
  private canvasPatchedRef: any | null = null;
  private originalZoomToSelection: ((...args: any[]) => any) | null = null;
  private zoomingToSelection: boolean = false;

  // Single-click detection state
  private pointerDownTime: number = 0;
  private pointerDownX: number = 0;
  private pointerDownY: number = 0;
  private pointerDragging: boolean = false;
  private readonly MOVE_TOLERANCE_PX: number = 6; // distance threshold to treat as drag
  private readonly LONG_PRESS_MS: number = 350;   // duration threshold to treat as long-press

  async onload() {
    // Load settings and register settings tab
    try {
      const data = (await this.loadData()) as Partial<CanvasMdSideEditorSettings> | null;
      this.settings = Object.assign({}, DEFAULT_SETTINGS, data ?? {});
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }

    this.addSettingTab(new CanvasMdSideEditorSettingTab((this as any).app, this));

    // Start with preview visible by default. Collapsed state is session-only.
    this.previewCollapsed = false;

    // Register custom icons for toggle button
    try {
      addIcon('cmside-two-cols', iconTwoCols);
      addIcon('cmside-one-col', iconOneCol);
    } catch {}

    // Styles are now provided by styles.css bundled with the plugin
    // Track canvas changes
    const attach = () => {
      const view = this.getActiveCanvasView();
      if (view) this.attachToCanvas(view);
    };
    // Initial attach if already on a Canvas
    attach();

    // Register commands
    registerCommands(this);

    // Re-attach on leaf/view changes
    const ref1 = this.app.workspace.on('active-leaf-change', () => attach());
    const ref2 = this.app.workspace.on('layout-change', () => attach());
    this.registerEvent(ref1);
    this.registerEvent(ref2);
  }

  // Save pasted images to vault and insert markdown links at cursor
  private async handlePasteImages(files: File[], view: EditorView): Promise<void> {
    try {
      if (!files || files.length === 0) return;
      const vault: any = (this as any).app?.vault;
      const metadata: any = (this as any).app?.metadataCache;
      const now = new Date();

      const sourcePath = this.currentSourcePath || '';
      const sourceDir = sourcePath.includes('/') ? sourcePath.substring(0, sourcePath.lastIndexOf('/')) : '';

      const getCfg = (k: string) => {
        try { return vault?.getConfig?.(k); } catch { return undefined; }
      };
      const attachSetting = getCfg('attachmentFolderPath');
      const useMdLinks = !!getCfg('useMarkdownLinks');

      // Resolve preferred attachments folder
      let folderPath = '';
      if (typeof attachSetting === 'string' && attachSetting.trim()) {
        const v = attachSetting.trim();
        if (v.startsWith('./')) {
          // relative to current file folder
          const rel = v.slice(2);
          folderPath = sourceDir ? (rel ? `${sourceDir}/${rel}` : sourceDir) : rel;
        } else {
          // vault-absolute folder
          folderPath = v;
        }
      } else {
        // default: same folder as current source, else vault root
        folderPath = sourceDir || '';
      }

      // Ensure folder exists (if not root)
      if (folderPath) {
        const exists = this.app.vault.getAbstractFileByPath(folderPath);
        if (!exists) {
          try { await this.app.vault.createFolder(folderPath); } catch {}
        }
      }

      // Helper to create a unique file path
      const toTwo = (n: number) => (n < 10 ? `0${n}` : `${n}`);
      const ts = `${now.getFullYear()}${toTwo(now.getMonth()+1)}${toTwo(now.getDate())}_${toTwo(now.getHours())}${toTwo(now.getMinutes())}${toTwo(now.getSeconds())}`;

      const savedPaths: string[] = [];
      for (let idx = 0; idx < files.length; idx++) {
        const f = files[idx];
        const extFromType = (f.type && f.type.includes('/')) ? `.${f.type.split('/')[1]}` : '';
        const baseName = `Pasted image ${ts}${files.length>1 ? ` ${idx+1}` : ''}${extFromType || '.png'}`;
        let targetPath = folderPath ? `${folderPath}/${baseName}` : baseName;
        // de-dup if exists
        let attempt = 1;
        while (this.app.vault.getAbstractFileByPath(targetPath)) {
          const alt = `Pasted image ${ts}${files.length>1 ? ` ${idx+1}` : ''} (${++attempt})${extFromType || '.png'}`;
          targetPath = folderPath ? `${folderPath}/${alt}` : alt;
        }
        const buf = await f.arrayBuffer();
        await this.app.vault.createBinary(targetPath, buf);
        savedPaths.push(targetPath);
      }

      // Insert links
      const insertParts: string[] = [];
      for (const p of savedPaths) {
        if (useMdLinks) {
          // Try to make relative if possible
          let rel = p;
          if (sourceDir && p.startsWith(sourceDir + '/')) rel = p.substring(sourceDir.length + 1);
          insertParts.push(`![](${rel})`);
        } else {
          // wikilink
          const fileName = p.includes('/') ? p.substring(p.lastIndexOf('/') + 1) : p;
          insertParts.push(`![[${fileName}]]`);
        }
      }
      const insertText = insertParts.join('\n');

      const tr = view.state.update({ changes: { from: view.state.selection.main.from, to: view.state.selection.main.to, insert: insertText } });
      view.dispatch(tr);
      // schedule preview render with new content
      this.schedulePreviewRender();
    } catch (e) {
      try { console.error('CanvasMdSideEditor: handlePasteImages failed', e); } catch {}
    }
  }

  onunload() {
    this.teardownPanel();
    this.detachFromCanvas();
  }

  private resolveVaultFile(path: string): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(path);
    return file instanceof TFile ? file : null;
  }

  private getActiveCanvasView(): any | null {
    const leaf: WorkspaceLeaf | null = this.app.workspace.activeLeaf ?? null;
    if (!leaf) return null;
    const view: any = leaf.view as any;
    if (view?.getViewType && view.getViewType() === 'canvas') return view;
    return null;
  }

  

  private attachToCanvas(view: any) {
    this.detachFromCanvas();
    const container: HTMLElement | undefined = view?.containerEl;
    if (!container) return;
    const contentEl: HTMLElement | undefined = (view as any)?.contentEl;
    const innerEl: HTMLElement | null = container.querySelector(
      '.canvas-container, .canvas-wrapper, .canvas-viewport'
    );
    const targets: HTMLElement[] = [container];
    if (contentEl && contentEl !== container) targets.push(contentEl);
    if (innerEl && !targets.includes(innerEl)) targets.push(innerEl);
    const canvasEls = Array.from(container.querySelectorAll('canvas')) as HTMLElement[];
    for (const c of canvasEls) {
      if (!targets.includes(c)) targets.push(c);
    }
    try { console.debug?.('CanvasMdSideEditor: potential targets', targets.map(t => ({ tag: t.tagName, cls: (t as HTMLElement).className }))); } catch {}
    try {
      const canvasObj = (view as any)?.canvas;
      if (canvasObj) {
        const proto = Object.getPrototypeOf(canvasObj);
        const keys = Object.keys(canvasObj);
        const protoNames = Object.getOwnPropertyNames(proto ?? {});
        console.debug?.('CanvasMdSideEditor: canvas api keys', { keys, protoNames });
        // Patch zoomToSelection to close side editor and mark zooming state
        try {
          const z = (canvasObj as any).zoomToSelection;
          if (typeof z === 'function' && this.canvasPatchedRef !== canvasObj) {
            this.originalZoomToSelection = z.bind(canvasObj);
            const plugin = this;
            (canvasObj as any).zoomToSelection = async function(...args: any[]) {
              try { plugin.zoomingToSelection = true; } catch {}
              try {
                if (plugin.panelEl) await plugin.saveAndClose(view);
              } catch {}
              try {
                return await plugin.originalZoomToSelection?.(...args);
              } finally {
                try { setTimeout(() => { plugin.zoomingToSelection = false; }, 200); } catch {}
              }
            };
            this.canvasPatchedRef = canvasObj;
            // Ensure restore on detach
            this.detachHandlers.push(() => {
              try {
                if (this.canvasPatchedRef === canvasObj && this.originalZoomToSelection) {
                  (canvasObj as any).zoomToSelection = this.originalZoomToSelection;
                }
              } catch {}
              this.canvasPatchedRef = null;
              this.originalZoomToSelection = null;
              this.zoomingToSelection = false;
            });
          }
        } catch {}
      }
    } catch {}

    // Click handler removed in favor of precise single-click detection via pointer events

    // Use capture on pointerdown to catch background clicks before Canvas swallows them
    const onPointerDown = async (evt: PointerEvent) => {
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside the panel
      if (this.panelEl && this.panelEl.contains(target)) return;
      // record pointer down state for single-click detection
      this.pointerDownTime = Date.now();
      this.pointerDownX = (evt as PointerEvent).clientX;
      this.pointerDownY = (evt as PointerEvent).clientY;
      this.pointerDragging = false;
      const cardEl = target.closest(
        '.canvas-node, .canvas-card, [data-node-id], [data-id]'
      ) as HTMLElement | null;
      const domId = cardEl?.getAttribute('data-node-id') || cardEl?.getAttribute('data-id') || null;
      const idByPoint = findNodeIdAtPoint((evt as PointerEvent).clientX, (evt as PointerEvent).clientY);
      let hitId: string | null = null;
      if (!domId && !idByPoint) {
        hitId = await hitTestNodeAtUtil(this.app, view, (evt as PointerEvent).clientX, (evt as PointerEvent).clientY);
      }
      this.pendingNodeId = (domId ?? idByPoint ?? hitId) ?? null;
      try { console.debug?.('CanvasMdSideEditor: pointerdown outside panel — DOM nodeId', domId, 'idByPoint', idByPoint, 'hitId', hitId); } catch {}
      // Also re-check selection shortly after pointerdown
      setTimeout(async () => {
        const selId = await getSelId(view);
        try { console.debug?.('CanvasMdSideEditor: selection shortly after pointerdown', selId); } catch {}
        if (!this.pendingNodeId && selId) this.pendingNodeId = selId;
      }, 30);
      // Only save if panel is open
      if (this.panelEl) {
        // Clicking another card should also save current, but avoid saving if clicking the same card
        if (this.pendingNodeId) {
          if (this.currentNodeId && this.currentNodeId !== this.pendingNodeId) {
            try { console.debug?.('CanvasMdSideEditor: pointerdown — preparing to switch from', this.currentNodeId, 'to', this.pendingNodeId, '— saving edits'); } catch {}
            await this.saveCurrentEdits(view);
          }
        } else {
          // Background pointerdown: pre-save edits
          try { console.debug?.('CanvasMdSideEditor: pointerdown background — saving edits'); } catch {}
          await this.saveCurrentEdits(view);
        }
      }
      // Don't close here, allow click handler to reopen if it's a card
    };

    // Detect dragging by measuring movement beyond a tolerance
    const onPointerMove = (evt: PointerEvent) => {
      if (!this.pointerDownTime) return;
      const dx = Math.abs(evt.clientX - this.pointerDownX);
      const dy = Math.abs(evt.clientY - this.pointerDownY);
      if (dx > this.MOVE_TOLERANCE_PX || dy > this.MOVE_TOLERANCE_PX) {
        this.pointerDragging = true;
      }
    };

    // Finalize on pointerup for better alignment with Canvas selection update timing
    const onPointerUp = async (evt: PointerEvent) => {
      if (!this.isOnCanvasView(view)) return;
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      if (this.panelEl && this.panelEl.contains(target)) return;
      // Do not open editor while zoom-to-selection in progress
      if (this.zoomingToSelection) {
        this.pendingNodeId = null;
        this.pointerDownTime = 0; this.pointerDragging = false;
        return;
      }

      // qualify as a true single click only if primary button, short press, and no drag
      const isPrimaryButton = evt.button === 0;
      const dt = this.pointerDownTime ? (Date.now() - this.pointerDownTime) : 0;
      const dx = Math.abs(evt.clientX - this.pointerDownX);
      const dy = Math.abs(evt.clientY - this.pointerDownY);
      const moved = dx > this.MOVE_TOLERANCE_PX || dy > this.MOVE_TOLERANCE_PX;
      const isLongPress = dt >= this.LONG_PRESS_MS;

      const qualifiesSingleClick = isPrimaryButton && !this.pointerDragging && !moved && !isLongPress;

      try { console.debug?.('CanvasMdSideEditor: pointerup qualify', { isPrimaryButton, dt, dx, dy, moved, isLongPress, qualifiesSingleClick }); } catch {}

      if (qualifiesSingleClick) {
        // Always resolve the clicked node id to avoid stale pendingNodeId
        let clickId: string | null = findNodeIdAtPoint(evt.clientX, evt.clientY);
        if (!clickId) clickId = await tryAPIsHit(view, evt.clientX, evt.clientY);
        if (!clickId) clickId = await getSelId(view);
        if (!clickId) clickId = this.pendingNodeId ?? null;

        try { console.debug?.('CanvasMdSideEditor: pointerup resolved clickId', clickId, 'pending', this.pendingNodeId); } catch {}
        if (clickId) {
          const node = await getNodeByIdUtil(this.app, view, clickId);
          if (node) {
            const isMd = node.type === 'text' || (node.type === 'file' && typeof node.file === 'string' && node.file.toLowerCase().endsWith('.md'));
            if (isMd) {
              if (this.panelEl && this.currentNodeId && this.currentNodeId !== clickId) {
                await this.saveCurrentEdits(view);
              }
              await this.openEditorForNode(view, node);
              this.pendingNodeId = null;
              // reset pointer tracking and return
              this.pointerDownTime = 0; this.pointerDragging = false;
              return;
            }
          }
        }
        // Background case: if editor open, save & close
        if (this.panelEl) await this.saveAndClose(view);
      }
      // clear states on non-qualifying interactions without acting
      this.pendingNodeId = null;
      this.pointerDownTime = 0; this.pointerDragging = false;
    };

    // Suppress Canvas default double-click zoom when our panel is active
    const onDblClick = (evt: MouseEvent) => {
      try {
        if (!this.isOnCanvasView(view)) return;
        const target = evt.target as HTMLElement | null;
        if (!target) return;
        // Allow dblclicks inside panel (e.g., selecting text within editor/preview)
        if (this.panelEl && this.panelEl.contains(target)) return;
        // Only suppress when our editor panel is open/active
        const panelOpen = !!this.panelEl && this.panelEl.classList.contains('open');
        if (!panelOpen) return;
        // Only act on primary-button double clicks
        if (evt.button !== 0) return;
        // Prevent Canvas from handling zoom-to-selection or opening native editor
        evt.preventDefault();
        evt.stopImmediatePropagation();
        evt.stopPropagation();
        try { console.debug?.('CanvasMdSideEditor: suppressed dblclick zoom'); } catch {}
      } catch {}
    };

    // Close side panel immediately when Canvas' own inline editor gets focus or typing begins
    const onFocusIn = async (evt: FocusEvent) => {
      try {
        const target = evt.target as HTMLElement | null;
        if (!target) return;
        // Ignore focus inside our side panel
        if (this.panelEl && this.panelEl.contains(target)) return;
        if (this.isCanvasInlineEditTarget(target)) {
          try { console.debug?.('CanvasMdSideEditor: focus entered Canvas inline editor — closing side panel'); } catch {}
          if (this.panelEl) await this.saveAndClose(view);
        }
      } catch {}
    };

    const onKeyDown = async (evt: KeyboardEvent) => {
      try {
        // In case focusin didn't fire for some reason, detect typing within Canvas inline editor
        const target = evt.target as HTMLElement | null;
        if (!target) return;
        if (this.panelEl && this.panelEl.contains(target)) return;
        if (this.isCanvasInlineEditTarget(target)) {
          try { console.debug?.('CanvasMdSideEditor: keydown inside Canvas inline editor — closing side panel'); } catch {}
          if (this.panelEl) await this.saveAndClose(view);
        }
      } catch {}
    };

    // Use bubbling phase for click so Canvas can update selection first
    for (const t of targets) {
      // click listener removed to avoid false triggers from long-press/drag
      this.registerDomEvent(t, 'pointerdown', onPointerDown, { capture: true } as AddEventListenerOptions);
      this.registerDomEvent(t, 'pointermove', onPointerMove);
      this.registerDomEvent(t, 'pointerup', onPointerUp);
      this.registerDomEvent(t, 'dblclick', onDblClick, { capture: true } as AddEventListenerOptions);
      this.registerDomEvent(t, 'focusin', onFocusIn, { capture: true } as AddEventListenerOptions);
      this.registerDomEvent(t, 'keydown', onKeyDown, { capture: true } as AddEventListenerOptions);
      // For debugging; you can comment these out later
      try { console.debug?.('CanvasMdSideEditor: attached listeners on', t); } catch {}
    }
  }

  private detachFromCanvas() {
    while (this.detachHandlers.length) {
      const off = this.detachHandlers.pop();
      try { off && off(); } catch {}
    }
    // Safety: if we were patched and not restored, restore now
    try {
      const view = this.getActiveCanvasView();
      const canvasObj = (view as any)?.canvas;
      if (canvasObj && this.canvasPatchedRef === canvasObj && this.originalZoomToSelection) {
        (canvasObj as any).zoomToSelection = this.originalZoomToSelection;
      }
    } catch {}
    this.canvasPatchedRef = null;
    this.originalZoomToSelection = null;
    this.zoomingToSelection = false;
  }

  private isOnCanvasView(view: any): boolean {
    return !!view && view.getViewType && view.getViewType() === 'canvas';
  }

  private isCanvasInlineEditTarget(el: HTMLElement | null): boolean {
    try {
      if (!el) return false;
      // Exclude our side panel
      if (this.panelEl && this.panelEl.contains(el)) return false;
      // Must be within a Canvas card element
      const card = el.closest('.canvas-node, .canvas-card, [data-node-id], [data-id]') as HTMLElement | null;
      if (!card) return false;
      // Typical editable areas inside Canvas cards
      if (el.closest('[contenteditable="true"], textarea, input[type="text"], .cm-editor')) return true;
      // Some themes/plugins toggle editing classes on the card
      const cls = (card.className || '').toLowerCase();
      if (cls.includes('editing') || cls.includes('is-editing')) return true;
      return false;
    } catch {
      return false;
    }
  }

  

  // viewport/transform/coords helpers moved to utils/canvas

  

  // findNodeIdAtPoint moved to utils/canvas

  

  

  private ensurePanel(view: any) {
    if (this.panelEl) return;
    const container: HTMLElement = view.containerEl;
    // Ensure container is positioned so the absolute panel anchors correctly
    try {
      const pos = getComputedStyle(container).position;
      if (!pos || pos === 'static') {
        container.classList.add('cmside-container-patched');
        this.containerPosPatched = true;
      } else {
        this.containerPosPatched = false;
      }
      this.containerElRef = container;
    } catch {}
    // Build panel via PanelController and short-circuit old implementation
    if (!this.panelController) {
      this.panelController = new PanelController(
        container,
        () => this.settings,
        (s) => this.saveData(s),
        this.previewCollapsed,
      );
      const refs = this.panelController.create();
      this.panelEl = refs.panelEl;
      this.editorRootEl = refs.editorRootEl;
      this.previewRootEl = refs.previewRootEl;
      // Ensure preview helper is wired to the preview container
      if (!this.previewHelper) this.previewHelper = new PreviewHelper(this.app, this);
      this.previewHelper.setContainer(this.previewRootEl!);
      // Toggle wiring and icon
      const setToggleIcon = (collapsed: boolean) => {
        setIcon(refs.toggleBtn, collapsed ? 'cmside-two-cols' : 'cmside-one-col');
        refs.toggleBtn.setAttribute('aria-label', collapsed ? 'Show Preview' : 'Hide Preview');
        refs.toggleBtn.setAttribute('title', collapsed ? 'Show Preview' : 'Hide Preview');
      };
      setToggleIcon(this.previewCollapsed);
      this.panelController.setPreviewCollapsed(this.previewCollapsed);
      this.panelController.onToggle(() => {
        this.previewCollapsed = !this.previewCollapsed;
        this.panelController!.setPreviewCollapsed(this.previewCollapsed);
        setToggleIcon(this.previewCollapsed);
      });
      this.panelController.onClose(() => { try { this.saveAndClose(view); } catch {} });
      return; // use controller-built panel; skip legacy DOM building below
    }
  }

  // Public method for commands to toggle preview (delegates to the toolbar button)
  public togglePreview(): void {
    try {
      if (!this.panelEl) return;
      const btn = this.panelEl.querySelector('.cmside-toggle-preview-btn') as HTMLButtonElement | null;
      btn?.click();
    } catch {}
  }

  private async openEditorForNode(view: any, node: CanvasNode) {
    this.ensurePanel(view);
    if (!this.panelEl || !this.editorRootEl) return;
    this.currentNodeId = node.id;
    this.currentNode = node;
    const file: TFile | undefined = (view as any)?.file ?? view?.file;
    this.currentCanvasFile = file ?? null;
    this.currentSourcePath =
      node.type === 'file' && typeof node.file === 'string'
        ? node.file
        : this.currentCanvasFile?.path ?? '';
    this.previewHelper?.setSourcePath(this.currentSourcePath);

    // Load content
    let initial = '';
    if (node.type === 'text') {
      initial = node.text ?? '';
    } else if (node.type === 'file' && typeof node.file === 'string') {
      const mdFile = this.resolveVaultFile(node.file);
      if (mdFile) {
        initial = await this.app.vault.read(mdFile);
      }
    }

    // Create or update CM view
    if (!this.settings.readOnly) {
      if (this.cmView) {
        const tr = this.cmView.state.update({
          changes: { from: 0, to: this.cmView.state.doc.length, insert: initial },
        });
        this.cmView.dispatch(tr);
      } else {
        this.cmView = createEditor(
          this.editorRootEl!,
          initial,
          () => this.schedulePreviewRender(),
          (files, view) => { this.handlePasteImages(files, view).catch(() => {}); }
        );
        // Ensure parent carries Obsidian classes for styling
        this.editorRootEl!.classList.add('markdown-source-view', 'cm-s-obsidian', 'mod-cm6');
        // Sync scroll with preview
        this.cmScrollHandler = () => { this.syncPreviewScroll(); };
        const v = this.cmView as EditorView;
        v.scrollDOM.addEventListener('scroll', this.cmScrollHandler, { passive: true });
      }
      // Ensure clicking blank area focuses editor and places caret
      this.setupEditorBlankClickHandler();
    }

    // Initial render
    await this.renderPreview(initial);

    // Slide in
    this.panelEl.classList.add('open');
    // Re-render shortly after opening to account for layout/transition timing
    try {
      const textNow = this.cmView?.state.doc.toString() ?? initial;
      setTimeout(() => { this.renderPreview(textNow); }, 80);
    } catch {}
    // Focus editor for immediate typing (skip if read-only)
    if (!this.settings.readOnly) {
      try { this.cmView?.focus(); } catch {}
    }
  }

  private async saveCurrentEdits(view: any) {
    if (!this.cmView || !this.currentNodeId) return;
    const newText = this.cmView.state.doc.toString();
    await writeNodeContentUtil(this.app, view, this.currentNode, this.currentNodeId, newText);
  }

  private async saveAndClose(view: any) {
    await this.saveCurrentEdits(view);
    this.closePanel();
  }

  private closePanel() {
    if (this.panelEl) this.panelEl.classList.remove('open');
    this.currentNodeId = null;
  }

  private teardownPanel() {
    // Prefer controller cleanup if present
    if (this.panelController) {
      try { this.panelController.destroy(); } catch {}
      this.panelController = null;
    }
    if (this.cmView && this.cmScrollHandler) {
      try { (this.cmView as EditorView).scrollDOM.removeEventListener('scroll', this.cmScrollHandler as any); } catch {}
    }
    if (this.cmView) {
      this.cmView.destroy();
      this.cmView = null;
    }
    this.cmScrollHandler = null;
    // Detach editor blank-click handler if attached
    try {
      if (this.editorClickAttachedEl && this.editorClickHandler) {
        this.editorClickAttachedEl.removeEventListener('mousedown', this.editorClickHandler);
      }
    } catch {}
    this.editorClickAttachedEl = null;
    this.editorClickHandler = null;
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
    // Restore container position class if we patched it
    if (this.containerElRef && this.containerPosPatched) {
      try { this.containerElRef.classList.remove('cmside-container-patched'); } catch {}
    }
    this.containerElRef = null;
    this.containerPosPatched = false;
    this.editorRootEl = null;
    this.previewRootEl = null;
    this.onResizeHandler = null;
    if (this.previewTimer) {
      window.clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
    this.currentNodeId = null;
    this.currentCanvasFile = null;
    this.currentNode = null;
  }

  

  private schedulePreviewRender() {
    if (!this.cmView) return;
    this.previewHelper?.scheduleFromEditor(this.cmView, this.settings?.previewDebounceMs ?? 50);
  }

  private async renderPreview(text: string) {
    if (!this.previewHelper) return;
    await this.previewHelper.renderText(text);
    this.syncPreviewScroll();
  }

  private syncPreviewScroll() {
    if (!this.cmView) return;
    this.previewHelper?.syncScrollFromEditor(this.cmView);
  }

  // Removed syncPreviewPadding(): preview now uses CSS variables for padding

  private alignPreviewToCaret() {
    if (!this.cmView || !this.previewRootEl) return;
    try {
      const anchor = this.previewRootEl.querySelector('[data-cm-anchor]') as HTMLElement | null;
      if (!anchor) return this.syncPreviewScroll();
      const cm = this.cmView as EditorView;
      const pos = this.cmView.state.selection.main.head;
      const line = this.cmView.state.doc.lineAt(pos);
      const lineRect = this.cmView.coordsAtPos(line.from);
      if (!lineRect) return;
      const editorRect = cm.scrollDOM.getBoundingClientRect();
      const previewRect = this.previewRootEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const lineTopInEditor = lineRect.top - editorRect.top + cm.scrollDOM.scrollTop;
      const anchorTopInPreview = anchorRect.top - previewRect.top + this.previewRootEl.scrollTop;
      const desiredScrollTop = Math.max(0, Math.round(anchorTopInPreview - lineTopInEditor));
      this.previewRootEl.scrollTop = desiredScrollTop;
    } catch {
      // fallback to simple sync
      this.syncPreviewScroll();
    }
  }

  private setupEditorBlankClickHandler() {
    if (!this.editorRootEl || !this.cmView || this.settings.readOnly) return;
    const root = this.editorRootEl;
    // If handler already attached to another element, detach first
    if (this.editorClickAttachedEl && this.editorClickAttachedEl !== root && this.editorClickHandler) {
      try { this.editorClickAttachedEl.removeEventListener('mousedown', this.editorClickHandler); } catch {}
    }
    // Define handler if not exists
    if (!this.editorClickHandler) {
      this.editorClickHandler = (evt: MouseEvent) => {
        try {
          if (!this.cmView) return;
          if (evt.button !== 0) return; // left click only
          const t = evt.target as HTMLElement | null;
          // Let CodeMirror handle clicks within content/lines normally
          if (t && (t.closest('.cm-content') || t.closest('.cm-line'))) return;
          const pos = (this.cmView as EditorView).posAtCoords({ x: evt.clientX, y: evt.clientY } as any) as any;
          const at = (pos == null) ? (this.cmView as EditorView).state.doc.length : (pos as number);
          (this.cmView as EditorView).dispatch({ selection: { anchor: at } });
          (this.cmView as EditorView).focus();
          evt.preventDefault();
          evt.stopPropagation();
        } catch {}
      };
    }
    // Attach to current root if not already
    if (this.editorClickAttachedEl !== root) {
      root.addEventListener('mousedown', this.editorClickHandler!);
      this.editorClickAttachedEl = root;
    }
  }

  

}

export default CanvasMdSideEditorPlugin;

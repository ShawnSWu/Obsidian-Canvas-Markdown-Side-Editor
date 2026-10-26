// CanvasInteraction — everything about being attached to a Canvas view:
//   - wiring pointer/focus/keyboard listeners onto the canvas DOM
//   - single-click detection (vs. drag / long-press) to open cards
//   - patching Canvas's zoomToSelection so the panel saves & closes first
//   - closing the panel when Canvas's own inline editor takes focus
//
// Raw events are translated into four high-level callbacks on the delegate
// (EditorSession in practice): openNode / save / saveAndClose, plus a
// panelEl getter used to ignore events originating inside the side panel.
//
// Unlike the previous implementation, listeners are registered and removed
// by this class itself (not via the plugin's registerDomEvent), so repeated
// attach() calls on the same view no longer accumulate duplicate handlers.
import type { App } from 'obsidian';
import type { WorkspaceLeaf } from 'obsidian';
import type { CanvasNode, CanvasLikeView, CanvasLike } from '../types';
import { findNodeIdAtPoint, getSelectedCanvasNodeId, hitTestNodeAt, tryCanvasAPIsForHit } from './hit-test';
import { getCanvasNodeById } from './data';

const MOVE_TOLERANCE_PX = 6; // distance threshold to treat as drag
const LONG_PRESS_MS = 350;   // duration threshold to treat as long-press

// TEMP debug tracing for the blank-click-won't-close issue. Remove once fixed.
function dbg(...args: unknown[]): void {
  try { console.debug('[cmside]', ...args); } catch {}
}

export interface InteractionDelegate {
  getPanelEl(): HTMLElement | null;
  // Id of the node currently open in the side panel (null when closed).
  getOpenNodeId(): string | null;
  save(view: CanvasLikeView): Promise<void>;
  saveAndClose(view: CanvasLikeView): Promise<void>;
  openNode(view: CanvasLikeView, node: CanvasNode): Promise<void>;
}

// The workspace's currently active Canvas view, or null.
export function getActiveCanvasView(app: App): CanvasLikeView | null {
  const leaf: WorkspaceLeaf | null = app.workspace.activeLeaf ?? null;
  if (!leaf) return null;
  const vUnknown = leaf.view as unknown;
  const getType = (vUnknown as { getViewType?: () => string }).getViewType?.();
  if (getType === 'canvas') {
    return vUnknown as CanvasLikeView;
  }
  return null;
}

export function isCanvasView(view: unknown): boolean {
  const getType = (view as { getViewType?: () => string })?.getViewType?.();
  return getType === 'canvas';
}

export class CanvasInteraction {
  private app: App;
  private delegate: InteractionDelegate;

  private detachFns: Array<() => void> = [];

  // Zoom-to-selection integration
  private canvasPatchedRef: CanvasLike | null = null;
  private originalZoomToSelection: ((...args: unknown[]) => unknown) | null = null;
  private zoomingToSelection: boolean = false;

  // Single-click detection state
  private pointerDownTime: number = 0;
  private pointerDownX: number = 0;
  private pointerDownY: number = 0;
  private pointerDragging: boolean = false;
  private pendingNodeId: string | null = null;
  // Listeners sit on several nested elements (container / contentEl /
  // wrapper), so one physical event bubbles through multiple registrations.
  // Dedupe by event object identity so each gesture is handled once.
  private lastPointerDownEvent: PointerEvent | null = null;
  private lastPointerUpEvent: PointerEvent | null = null;
  // True when pendingNodeId came from the post-pointerdown selection
  // re-check rather than a direct DOM/geometric hit. Selection-sourced ids
  // can be stale (the previously open card may still be selected during a
  // background click), so pointerup must not trust them as a click target.
  private pendingNodeIdFromSelection: boolean = false;

  constructor(app: App, delegate: InteractionDelegate) {
    this.app = app;
    this.delegate = delegate;
  }

  private get panelEl(): HTMLElement | null {
    return this.delegate.getPanelEl();
  }

  attach(view: CanvasLikeView): void {
    this.detach();
    const container: HTMLElement | undefined = view?.containerEl;
    if (!container) return;
    const contentEl: HTMLElement | undefined = view?.contentEl;
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
    try {
      const canvasObj: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
      if (canvasObj) {
        // Patch zoomToSelection to close side editor and mark zooming state
        try {
          const z = canvasObj.zoomToSelection;
          if (typeof z === 'function' && this.canvasPatchedRef !== canvasObj) {
            this.originalZoomToSelection = z.bind(canvasObj);
            const self = this;
            canvasObj.zoomToSelection = async function(...args: unknown[]) {
              try { self.zoomingToSelection = true; } catch {}
              try {
                if (self.panelEl) await self.delegate.saveAndClose(view);
              } catch {}
              try {
                return await self.originalZoomToSelection?.(...args);
              } finally {
                // Keep the guard up for a trailing window: the awaited zoom
                // resolving doesn't mean the visual zoom has settled, and a
                // pointerup landing in that window must not open a card.
                try { setTimeout(() => { self.zoomingToSelection = false; }, 200); } catch {}
              }
            };
            this.canvasPatchedRef = canvasObj;
            // Ensure restore on detach
            this.detachFns.push(() => {
              try {
                if (this.canvasPatchedRef === canvasObj && this.originalZoomToSelection) {
                  canvasObj.zoomToSelection = this.originalZoomToSelection;
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

    // Use capture on pointerdown to catch background clicks before Canvas swallows them
    const onPointerDown = async (evt: PointerEvent) => {
      if (evt === this.lastPointerDownEvent) return;
      this.lastPointerDownEvent = evt;
      const target = evt.target as HTMLElement | null;
      if (!target) return;
      // Ignore clicks inside the panel
      const panel = this.panelEl;
      if (panel && panel.contains(target)) return;
      // record pointer down state for single-click detection
      this.pointerDownTime = Date.now();
      this.pointerDownX = evt.clientX;
      this.pointerDownY = evt.clientY;
      this.pointerDragging = false;
      const cardEl = target.closest(
        '.canvas-node, .canvas-card, [data-node-id], [data-id]'
      ) as HTMLElement | null;
      const domId = cardEl?.getAttribute('data-node-id') || cardEl?.getAttribute('data-id') || null;
      const idByPoint = findNodeIdAtPoint(evt.clientX, evt.clientY);
      let hitId: string | null = null;
      if (!domId && !idByPoint) {
        try { hitId = await hitTestNodeAt(this.app, view, evt.clientX, evt.clientY); } catch {}
      }
      this.pendingNodeId = (domId ?? idByPoint ?? hitId) ?? null;
      this.pendingNodeIdFromSelection = false;
      // Also re-check selection shortly after pointerdown
      setTimeout(async () => {
        const selId = await getSelectedCanvasNodeId(view);
        if (!this.pendingNodeId && selId) {
          this.pendingNodeId = selId;
          this.pendingNodeIdFromSelection = true;
        }
      }, 30);
      // Only save if panel is open
      if (this.panelEl) {
        // Clicking another card should also save current, but avoid saving if clicking the same card
        if (this.pendingNodeId) {
          if (this.currentOpenNodeId() && this.currentOpenNodeId() !== this.pendingNodeId) {
            await this.delegate.save(view);
          }
        } else {
          // Background pointerdown: pre-save edits
          await this.delegate.save(view);
        }
      }
      // Don't close here, allow click handler to reopen if it's a card
    };

    // Detect dragging by measuring movement beyond a tolerance
    const onPointerMove = (evt: PointerEvent) => {
      if (!this.pointerDownTime) return;
      const dx = Math.abs(evt.clientX - this.pointerDownX);
      const dy = Math.abs(evt.clientY - this.pointerDownY);
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
        this.pointerDragging = true;
      }
    };

    // Finalize on pointerup for better alignment with Canvas selection update timing
    const onPointerUp = async (evt: PointerEvent) => {
      try {
      if (evt === this.lastPointerUpEvent) return;
      this.lastPointerUpEvent = evt;
      if (!isCanvasView(view)) { dbg('pointerup: not canvas view'); return; }
      const target = evt.target as HTMLElement | null;
      if (!target) { dbg('pointerup: no target'); return; }
      const panel = this.panelEl;
      dbg('pointerup: enter', {
        target: `${target.tagName}.${String(target.className).slice(0, 60)}`,
        panelExists: !!panel,
        panelOpen: panel ? panel.classList.contains('open') : null,
        insidePanel: panel ? panel.contains(target) : null,
      });
      if (panel && panel.contains(target)) return;
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
      const moved = dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX;
      const isLongPress = dt >= LONG_PRESS_MS;

      const qualifiesSingleClick = isPrimaryButton && !this.pointerDragging && !moved && !isLongPress;
      dbg('pointerup: qualify', { isPrimaryButton, dt, moved, dragging: this.pointerDragging, isLongPress, qualifiesSingleClick });

      if (qualifiesSingleClick) {
        // Resolve the clicked node id from physical hit tests only. The
        // Canvas *selection* is deliberately not consulted here: during a
        // background click the previously open card can still be selected
        // for a short window, and trusting it would reopen that card
        // instead of closing the panel.
        let clickId: string | null = findNodeIdAtPoint(evt.clientX, evt.clientY);
        dbg('pointerup: findNodeIdAtPoint ->', clickId);
        if (!clickId) clickId = await tryCanvasAPIsForHit(view, evt.clientX, evt.clientY);
        dbg('pointerup: tryCanvasAPIsForHit ->', clickId);
        if (!clickId) {
          try { clickId = await hitTestNodeAt(this.app, view, evt.clientX, evt.clientY); } catch (e) { dbg('pointerup: hitTestNodeAt threw', e); }
        }
        dbg('pointerup: hitTestNodeAt ->', clickId);
        // pendingNodeId is only trustworthy when pointerdown hit a node
        // directly, not when it was filled from the selection re-check.
        if (!clickId && !this.pendingNodeIdFromSelection) clickId = this.pendingNodeId ?? null;
        dbg('pointerup: final clickId ->', clickId, { pendingFromSelection: this.pendingNodeIdFromSelection });

        if (clickId) {
          const node = await getCanvasNodeById(this.app, view, clickId);
          if (node) {
            const isMd = node.type === 'text' || (node.type === 'file' && typeof node.file === 'string' && node.file.toLowerCase().endsWith('.md'));
            if (isMd) {
              dbg('pointerup: OPENING node', clickId);
              if (this.panelEl && this.currentOpenNodeId() && this.currentOpenNodeId() !== clickId) {
                await this.delegate.save(view);
              }
              await this.delegate.openNode(view, node);
              this.pendingNodeId = null;
              // reset pointer tracking and return
              this.pointerDownTime = 0; this.pointerDragging = false;
              return;
            }
          }
        }
        // Background case: if editor open, save & close
        dbg('pointerup: BACKGROUND branch, panelEl?', !!this.panelEl);
        if (this.panelEl) await this.delegate.saveAndClose(view);
        dbg('pointerup: saveAndClose done, open?', this.panelEl?.classList.contains('open'));
      }
      // clear states on non-qualifying interactions without acting
      this.pendingNodeId = null;
      this.pointerDownTime = 0; this.pointerDragging = false;
      } catch (e) { dbg('pointerup: EXCEPTION', e); }
    };

    // Suppress Canvas default double-click zoom when our panel is active
    const onDblClick = (evt: MouseEvent) => {
      try {
        if (!isCanvasView(view)) return;
        const target = evt.target as HTMLElement | null;
        if (!target) return;
        // Allow dblclicks inside panel (e.g., selecting text within editor/preview)
        const panel = this.panelEl;
        if (panel && panel.contains(target)) return;
        // Only suppress when our editor panel is open/active
        const panelOpen = !!panel && panel.classList.contains('open');
        if (!panelOpen) return;
        // Only act on primary-button double clicks
        if (evt.button !== 0) return;
        // Prevent Canvas from handling zoom-to-selection or opening native editor
        evt.preventDefault();
        evt.stopImmediatePropagation();
        evt.stopPropagation();
      } catch {}
    };

    // Close side panel immediately when Canvas' own inline editor gets focus or typing begins
    const onFocusIn = async (evt: FocusEvent) => {
      try {
        const target = evt.target as HTMLElement | null;
        if (!target) return;
        // Ignore focus inside our side panel
        const panel = this.panelEl;
        if (panel && panel.contains(target)) return;
        if (this.isCanvasInlineEditTarget(target)) {
          if (this.panelEl) await this.delegate.saveAndClose(view);
        }
      } catch {}
    };

    const onKeyDown = async (evt: KeyboardEvent) => {
      try {
        // In case focusin didn't fire for some reason, detect typing within Canvas inline editor
        const target = evt.target as HTMLElement | null;
        if (!target) return;
        const panel = this.panelEl;
        if (panel && panel.contains(target)) return;
        if (this.isCanvasInlineEditTarget(target)) {
          if (this.panelEl) await this.delegate.saveAndClose(view);
        }
      } catch {}
    };

    // Use bubbling phase for click so Canvas can update selection first
    for (const t of targets) {
      // click listener removed to avoid false triggers from long-press/drag
      this.listen(t, 'pointerdown', onPointerDown, { capture: true });
      this.listen(t, 'pointermove', onPointerMove);
      this.listen(t, 'pointerup', onPointerUp);
      this.listen(t, 'dblclick', onDblClick, { capture: true });
      this.listen(t, 'focusin', onFocusIn, { capture: true });
      this.listen(t, 'keydown', onKeyDown, { capture: true });
    }
  }

  detach(): void {
    while (this.detachFns.length) {
      const off = this.detachFns.pop();
      try { off && off(); } catch {}
    }
    // Safety: if we were patched and not restored, restore now
    try {
      const view = getActiveCanvasView(this.app);
      const canvasObj: CanvasLike | undefined = view?.canvas as CanvasLike | undefined;
      if (canvasObj && this.canvasPatchedRef === canvasObj && this.originalZoomToSelection) {
        canvasObj.zoomToSelection = this.originalZoomToSelection;
      }
    } catch {}
    this.canvasPatchedRef = null;
    this.originalZoomToSelection = null;
    this.zoomingToSelection = false;
  }

  private listen<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    const listener = handler as unknown as EventListener;
    el.addEventListener(type, listener, options);
    this.detachFns.push(() => {
      try { el.removeEventListener(type, listener, options); } catch {}
    });
  }

  private currentOpenNodeId(): string | null {
    return this.delegate.getOpenNodeId();
  }

  private isCanvasInlineEditTarget(el: HTMLElement | null): boolean {
    try {
      if (!el) return false;
      // Exclude our side panel
      const panel = this.panelEl;
      if (panel && panel.contains(el)) return false;
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
}

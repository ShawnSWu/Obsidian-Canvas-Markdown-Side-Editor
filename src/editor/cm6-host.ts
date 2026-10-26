// Stateful host for the bare CodeMirror 6 editor. Owns the EditorView
// instance, the Obsidian-look classes on the mount element, editor→preview
// scroll sync, and the "click blank area to focus at end" UX helper.
import { EditorView } from '@codemirror/view';
import { createEditor } from './cm6-editor';
import type { EditorHost } from './editor-host';

export interface Cm6HostHooks {
  // Fired whenever the document changes (used to schedule preview renders).
  onDocChange?: () => void;
  // Fired when image files are pasted into the editor.
  onPasteImages?: (files: File[], view: EditorView) => void;
  // Fired on editor scroll (used to sync the preview pane).
  onScroll?: () => void;
  // Gate for the blank-click-to-focus helper (disabled in preview-only mode).
  enableBlankClickFocus?: () => boolean;
}

export class Cm6EditorHost implements EditorHost {
  readonly kind = 'cm6' as const;

  private cmView: EditorView | null = null;
  private scrollHandler: ((e: Event) => void) | null = null;
  private blankClickHandler: ((e: MouseEvent) => void) | null = null;
  private blankClickAttachedEl: HTMLElement | null = null;

  get view(): EditorView | null {
    return this.cmView;
  }

  isOpen(): boolean {
    return this.cmView != null;
  }

  // Mount (or, when already mounted, replace the content of) the editor.
  open(rootEl: HTMLElement, initial: string, hooks: Cm6HostHooks): void {
    if (this.cmView) {
      const tr = this.cmView.state.update({
        changes: { from: 0, to: this.cmView.state.doc.length, insert: initial },
      });
      this.cmView.dispatch(tr);
    } else {
      this.cmView = createEditor(
        rootEl,
        initial,
        hooks.onDocChange ? () => hooks.onDocChange?.() : undefined,
        hooks.onPasteImages,
      );
      rootEl.classList.add('markdown-source-view', 'cm-s-obsidian', 'mod-cm6');
      this.scrollHandler = () => { hooks.onScroll?.(); };
      this.cmView.scrollDOM.addEventListener('scroll', this.scrollHandler, { passive: true });
    }
    this.setupBlankClickHandler(rootEl, hooks);
  }

  getValue(): string | null {
    return this.cmView ? this.cmView.state.doc.toString() : null;
  }

  // CM6 holds no buffer of its own — the session writes the doc straight
  // back into the canvas JSON / linked file.
  async flush(): Promise<void> {}

  focus(): void {
    try { this.cmView?.focus(); } catch {}
  }

  async dispose(): Promise<void> {
    if (this.cmView && this.scrollHandler) {
      try { this.cmView.scrollDOM.removeEventListener('scroll', this.scrollHandler); } catch {}
    }
    if (this.cmView) {
      try { this.cmView.destroy(); } catch {}
      this.cmView = null;
    }
    this.scrollHandler = null;
    this.detachBlankClickHandler();
  }

  // Focus-and-place-cursor when the user clicks the blank area below the
  // last line (CodeMirror itself only handles clicks on actual content).
  private setupBlankClickHandler(rootEl: HTMLElement, hooks: Cm6HostHooks): void {
    if (!this.cmView || hooks.enableBlankClickFocus?.() === false) return;
    const root = rootEl;
    // If handler already attached to another element, detach first
    if (this.blankClickAttachedEl && this.blankClickAttachedEl !== root && this.blankClickHandler) {
      try { this.blankClickAttachedEl.removeEventListener('mousedown', this.blankClickHandler); } catch {}
    }
    // Define handler if not exists
    if (!this.blankClickHandler) {
      this.blankClickHandler = (evt: MouseEvent) => {
        try {
          if (!this.cmView) return;
          if (evt.button !== 0) return; // left click only
          const t = evt.target as HTMLElement | null;
          // Let CodeMirror handle clicks within content/lines normally
          if (t && (t.closest('.cm-content') || t.closest('.cm-line'))) return;
          const pos = this.cmView.posAtCoords({ x: evt.clientX, y: evt.clientY });
          const at = (pos == null) ? this.cmView.state.doc.length : pos;
          this.cmView.dispatch({ selection: { anchor: at } });
          this.cmView.focus();
          evt.preventDefault();
          evt.stopPropagation();
        } catch {}
      };
    }
    // Attach to current root if not already
    if (this.blankClickAttachedEl !== root) {
      root.addEventListener('mousedown', this.blankClickHandler);
      this.blankClickAttachedEl = root;
    }
  }

  private detachBlankClickHandler(): void {
    try {
      if (this.blankClickAttachedEl && this.blankClickHandler) {
        this.blankClickAttachedEl.removeEventListener('mousedown', this.blankClickHandler);
      }
    } catch {}
    this.blankClickAttachedEl = null;
    this.blankClickHandler = null;
  }
}

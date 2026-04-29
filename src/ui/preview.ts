import type { App, Plugin } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export class PreviewHelper {
  private app: App;
  private plugin: Plugin;
  private timer: number | null = null;
  private sourcePath: string = '';
  private container: HTMLElement | null = null;

  // Single-flight gate for renderText. Concurrent calls (rapid card
  // clicks) used to fire concurrent MarkdownRenderer.render runs against
  // the same container — and Obsidian's renderer doesn't always insert
  // DOM synchronously at the call site, so the order of final
  // insertions could disagree with the order callers wanted, leaving
  // stale content visible. Now: at most one render runs at a time, and
  // the latest text always wins (callers that arrive while a render is
  // in flight just stash their text into pendingText for the running
  // loop to pick up next pass).
  private renderInFlight: boolean = false;
  private pendingText: string | null = null;

  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
  }

  setContainer(container: HTMLElement | null) {
    this.container = container;
  }

  setSourcePath(path: string) {
    this.sourcePath = path || '';
  }

  clearTimer() {
    if (this.timer) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleFromEditor(cmView: EditorView | null, delayMs: number) {
    if (!cmView || !this.container) return;
    this.clearTimer();
    const delay = Math.max(16, delayMs ?? 50);
    this.timer = window.setTimeout(async () => {
      const text = cmView.state.doc.toString();
      await this.renderText(text);
    }, delay);
  }

  // Same debounced render but the source text is supplied by the caller
  // — used by the live-preview leaf path where we don't have a CM6 view
  // reference to read from.
  scheduleFromText(getText: () => string, delayMs: number) {
    if (!this.container) return;
    this.clearTimer();
    const delay = Math.max(16, delayMs ?? 50);
    this.timer = window.setTimeout(async () => {
      const text = getText();
      await this.renderText(text);
    }, delay);
  }

  async renderText(text: string) {
    if (!this.container) return;

    // Latest-text-wins: every caller's text replaces any text queued by
    // a still-pending caller, so only the most recently requested text
    // ever actually ships to MarkdownRenderer.
    this.pendingText = text;
    if (this.renderInFlight) return;

    this.renderInFlight = true;
    try {
      while (this.pendingText !== null) {
        const t = this.pendingText;
        this.pendingText = null;

        if (!this.container) return;
        this.container.empty?.();
        while (this.container.firstChild) this.container.removeChild(this.container.firstChild);

        try {
          await MarkdownRenderer.render(this.app, t, this.container, this.sourcePath, this.plugin);
        } catch (e) {
          try { console.error('CanvasMdSideEditor: renderPreview failed', e); } catch {}
        }
      }
    } finally {
      this.renderInFlight = false;
    }
  }

  syncScrollFromEditor(cmView: EditorView | null) {
    if (!cmView || !this.container) return;
    try {
      this.container.scrollTop = cmView.scrollDOM.scrollTop;
    } catch {}
  }
}

import type { App, Plugin } from 'obsidian';
import { MarkdownRenderer } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export class PreviewHelper {
  private app: App;
  private plugin: Plugin;
  private timer: number | null = null;
  private sourcePath: string = '';
  private container: HTMLElement | null = null;

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

  async renderText(text: string) {
    if (!this.container) return;
    // Clear
    this.container.empty?.();
    while (this.container.firstChild) this.container.removeChild(this.container.firstChild);
    try {
      await MarkdownRenderer.render(this.app, text, this.container, this.sourcePath, this.plugin);
    } catch (e) {
      try { console.error('CanvasMdSideEditor: renderPreview failed', e); } catch {}
    }
  }

  syncScrollFromEditor(cmView: EditorView | null) {
    if (!cmView || !this.container) return;
    try {
      this.container.scrollTop = cmView.scrollDOM.scrollTop;
    } catch {}
  }
}

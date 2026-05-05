import type { App, Plugin } from 'obsidian';

export interface AttachPreviewLinkInteropOptions {
  app: App;
  plugin: Plugin;
  container: HTMLElement;
  getSourcePath: () => string;
  hoverSource?: string;
}

const LINK_SELECTOR = 'a.internal-link, a.markdown-embed-link';

function getLinkText(a: HTMLAnchorElement): string {
  return a.getAttribute('data-href') ?? a.getAttribute('href') ?? '';
}

function paneModeFromEvent(e: MouseEvent): 'tab' | 'split' {
  return e.shiftKey ? 'split' : 'tab';
}

export function attachPreviewLinkInterop(opts: AttachPreviewLinkInteropOptions): void {
  const { app, plugin, container, getSourcePath, hoverSource } = opts;
  const source = hoverSource ?? 'canvas-markdown-side-editor';

  plugin.registerDomEvent(container, 'mouseover', (e: MouseEvent) => {
    try {
      const a = (e.target as Element | null)?.closest(LINK_SELECTOR) as HTMLAnchorElement | null;
      if (!a) return;
      const linktext = getLinkText(a);
      if (!linktext) return;
      app.workspace.trigger('hover-link', {
        event: e,
        source,
        hoverParent: plugin,
        targetEl: a,
        linktext,
        sourcePath: getSourcePath(),
      });
    } catch (err) {
      try { console.error('CanvasMdSideEditor: hover-link interop failed', err); } catch {}
    }
  });

  plugin.registerDomEvent(container, 'click', (e: MouseEvent) => {
    try {
      const a = (e.target as Element | null)?.closest(LINK_SELECTOR) as HTMLAnchorElement | null;
      if (!a) return;
      const linktext = getLinkText(a);
      if (!linktext) return;
      e.preventDefault();
      void app.workspace.openLinkText(linktext, getSourcePath(), paneModeFromEvent(e));
    } catch (err) {
      try { console.error('CanvasMdSideEditor: link click interop failed', err); } catch {}
    }
  });

  plugin.registerDomEvent(container, 'auxclick', (e: MouseEvent) => {
    try {
      if (e.button !== 1) return;
      const a = (e.target as Element | null)?.closest(LINK_SELECTOR) as HTMLAnchorElement | null;
      if (!a) return;
      const linktext = getLinkText(a);
      if (!linktext) return;
      e.preventDefault();
      void app.workspace.openLinkText(linktext, getSourcePath(), 'tab');
    } catch (err) {
      try { console.error('CanvasMdSideEditor: link auxclick interop failed', err); } catch {}
    }
  });
}

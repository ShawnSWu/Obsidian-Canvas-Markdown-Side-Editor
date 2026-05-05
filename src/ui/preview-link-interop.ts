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
}

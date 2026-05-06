// Integration test for issue #17 — verifies that the panel creation
// pipeline wires attachPreviewLinkInterop on the real previewRootEl,
// so hover events on rendered wikilinks fire 'hover-link'.

import { describe, it, expect, beforeEach } from 'vitest';
import { App } from 'obsidian';
import CanvasMdSideEditorPlugin from '../../src/main';
import type { CanvasNode, CanvasLikeView } from '../../src/types';

const originalGCS = window.getComputedStyle.bind(window);
window.getComputedStyle = ((el: Element) => {
  const real = originalGCS(el);
  return new Proxy(real, {
    get(target, prop, recv) {
      if (prop === 'position') return 'relative';
      if (prop === 'transform') return 'none';
      if (prop === 'fontSize') return '16px';
      return Reflect.get(target, prop, recv);
    },
  }) as CSSStyleDeclaration;
}) as typeof window.getComputedStyle;

function makeCanvasView(containerEl: HTMLElement): CanvasLikeView {
  return {
    containerEl,
    contentEl: containerEl,
    canvas: { getData: () => ({ nodes: [], edges: [] }), requestSave: () => {} },
    getViewType: () => 'canvas',
  } as unknown as CanvasLikeView;
}

async function makePlugin(app: App) {
  const plugin = new CanvasMdSideEditorPlugin(app, { id: 'canvas-markdown-side-editor', version: '0.0.0' } as any);
  await plugin.onload();
  plugin.settings.viewMode = 'preview'; // skip CodeMirror init
  return plugin;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('issue #17 — hover preview wiring', () => {
  it('mouseover on a rendered internal-link in the preview pane fires workspace.trigger("hover-link")', async () => {
    const app = new App();
    const plugin = await makePlugin(app);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = makeCanvasView(container);
    await (plugin as any).attachToCanvas(view);
    await (plugin as any).openEditorForNode(view, { id: 'n1', type: 'text', text: 'see [[Other]]' } as CanvasNode);

    const previewRoot = (plugin as any).previewRootEl as HTMLElement;
    expect(previewRoot).toBeTruthy();

    // Inject a wikilink directly into the preview container — we can't rely
    // on MarkdownRenderer (mocked) producing one, so we put one there to
    // exercise our delegated listener.
    const a = document.createElement('a');
    a.classList.add('internal-link');
    a.setAttribute('data-href', 'Other');
    a.textContent = 'Other';
    previewRoot.appendChild(a);

    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({
      linktext: 'Other',
      targetEl: a,
    }));
  });
});

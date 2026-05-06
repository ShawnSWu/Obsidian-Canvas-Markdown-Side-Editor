import { describe, it, expect, beforeEach, vi } from 'vitest';
import { App, Plugin } from 'obsidian';
import { attachPreviewLinkInterop } from '../../src/ui/preview-link-interop';

function makeContainer(html: string): HTMLElement {
  const c = document.createElement('div');
  c.innerHTML = html;
  document.body.appendChild(c);
  return c;
}

function makePlugin(app: App): Plugin {
  return new Plugin(app, { id: 'canvas-markdown-side-editor', version: '0.0.0' } as any);
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('attachPreviewLinkInterop — hover', () => {
  it('mouseover on a.internal-link triggers hover-link with linktext + sourcePath + targetEl', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="My Note">My Note</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => 'canvas.canvas' });

    const a = container.querySelector('a.internal-link') as HTMLAnchorElement;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).toHaveBeenCalledTimes(1);
    expect(app.workspace.trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({
      source: 'canvas-markdown-side-editor',
      hoverParent: plugin,
      targetEl: a,
      linktext: 'My Note',
      sourcePath: 'canvas.canvas',
    }));
  });

  it('mouseover on a.markdown-embed-link triggers hover-link', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="markdown-embed-link" data-href="Embedded">↗</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => 'canvas.canvas' });

    const a = container.querySelector('a.markdown-embed-link') as HTMLAnchorElement;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({
      linktext: 'Embedded',
    }));
  });

  it('mouseover on a.external-link does NOT trigger hover-link', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="external-link" href="https://example.com">ext</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    const a = container.querySelector('a.external-link') as HTMLAnchorElement;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).not.toHaveBeenCalled();
  });

  it('mouseover on a non-link descendant does NOT trigger', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<p>plain text</p>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    const p = container.querySelector('p') as HTMLElement;
    p.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).not.toHaveBeenCalled();
  });

  it('anchor with empty data-href and href does NOT trigger', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link"></a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    const a = container.querySelector('a.internal-link') as HTMLAnchorElement;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).not.toHaveBeenCalled();
  });

  it('uses custom hoverSource when provided', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="X">X</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '', hoverSource: 'my-source' });

    container.querySelector('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).toHaveBeenCalledWith('hover-link', expect.objectContaining({
      source: 'my-source',
    }));
  });

  it('reads sourcePath via getter at event time, not attach time', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="Y">Y</a>');
    let path = 'first.canvas';
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => path });

    const a = container.querySelector('a')!;
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    path = 'second.canvas';
    a.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    const calls = (app.workspace.trigger as any).mock.calls;
    expect(calls[0][1].sourcePath).toBe('first.canvas');
    expect(calls[1][1].sourcePath).toBe('second.canvas');
  });
});

describe('attachPreviewLinkInterop — click', () => {
  it('click on a.internal-link calls openLinkText with tab and preventDefault', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="Note">Note</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => 'canvas.canvas' });

    const a = container.querySelector('a')!;
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    a.dispatchEvent(ev);

    expect(app.workspace.openLinkText).toHaveBeenCalledTimes(1);
    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Note', 'canvas.canvas', 'tab');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('shift+click opens in split', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="N">N</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => 'src.canvas' });

    container.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));

    expect(app.workspace.openLinkText).toHaveBeenCalledWith('N', 'src.canvas', 'split');
  });

  it('ctrl+click opens in tab (modifier not consulted, default is already tab)', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="N">N</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => 'src.canvas' });

    container.querySelector('a')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));

    expect(app.workspace.openLinkText).toHaveBeenCalledWith('N', 'src.canvas', 'tab');
  });

  it('click on a.external-link does NOT call openLinkText and does NOT preventDefault', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="external-link" href="https://example.com">ext</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    container.querySelector('a')!.dispatchEvent(ev);

    expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('click on anchor with empty data-href and href does NOT call openLinkText', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link"></a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    container.querySelector('a')!.dispatchEvent(ev);

    expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('attachPreviewLinkInterop — auxclick (middle button)', () => {
  it('button=1 on a.internal-link calls openLinkText with tab and preventDefault', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="Mid">Mid</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => 'src.canvas' });

    const ev = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
    container.querySelector('a')!.dispatchEvent(ev);

    expect(app.workspace.openLinkText).toHaveBeenCalledWith('Mid', 'src.canvas', 'tab');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('button=2 (right-click) does NOT call openLinkText', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="X">X</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    const ev = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 });
    container.querySelector('a')!.dispatchEvent(ev);

    expect(app.workspace.openLinkText).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe('attachPreviewLinkInterop — idempotency', () => {
  it('calling attach twice on the same container only attaches one set of listeners', () => {
    const app = new App();
    const plugin = makePlugin(app);
    const container = makeContainer('<a class="internal-link" data-href="N">N</a>');
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });
    attachPreviewLinkInterop({ app, plugin, container, getSourcePath: () => '' });

    container.querySelector('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(app.workspace.trigger).toHaveBeenCalledTimes(1);
  });
});

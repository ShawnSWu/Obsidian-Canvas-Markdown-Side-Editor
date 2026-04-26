import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { App, MarkdownRenderer } from 'obsidian';
import { PreviewHelper } from '../../src/ui/preview';
import { createEditor } from '../../src/ui/editor';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.mocked(MarkdownRenderer.render).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PreviewHelper.renderText', () => {
  it('clears the container before rendering and forwards the source path', async () => {
    const app = new App();
    const plugin: any = { app };
    const helper = new PreviewHelper(app, plugin);
    const container = document.createElement('div');
    container.appendChild(document.createElement('span')); // pre-existing child
    document.body.appendChild(container);
    helper.setContainer(container);
    helper.setSourcePath('notes/foo.md');

    await helper.renderText('# hello');

    // Pre-existing children removed; mock renderer added a <p>
    expect(container.querySelector('span')).toBeFalsy();
    expect(container.querySelector('p')?.textContent).toBe('# hello');
    expect(MarkdownRenderer.render).toHaveBeenCalledTimes(1);
    const args = vi.mocked(MarkdownRenderer.render).mock.calls[0];
    expect(args[1]).toBe('# hello');
    expect(args[2]).toBe(container);
    expect(args[3]).toBe('notes/foo.md');
  });

  it('does nothing when no container has been set', async () => {
    const app = new App();
    const helper = new PreviewHelper(app, { app } as any);
    await helper.renderText('whatever');
    expect(MarkdownRenderer.render).not.toHaveBeenCalled();
  });
});

describe('PreviewHelper.scheduleFromEditor', () => {
  it('debounces editor updates and renders the latest text', async () => {
    vi.useFakeTimers();
    const app = new App();
    const helper = new PreviewHelper(app, { app } as any);
    const container = document.createElement('div');
    document.body.appendChild(container);
    helper.setContainer(container);

    const editorParent = document.createElement('div');
    document.body.appendChild(editorParent);
    const view = createEditor(editorParent, 'first');

    helper.scheduleFromEditor(view, 100);
    // schedule again before the timer fires — should reset
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'second' } });
    helper.scheduleFromEditor(view, 100);

    await vi.advanceTimersByTimeAsync(50);
    expect(MarkdownRenderer.render).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60);
    expect(MarkdownRenderer.render).toHaveBeenCalledTimes(1);
    expect(vi.mocked(MarkdownRenderer.render).mock.calls[0][1]).toBe('second');
  });

  it('clamps the delay to at least 16ms', async () => {
    vi.useFakeTimers();
    const app = new App();
    const helper = new PreviewHelper(app, { app } as any);
    const container = document.createElement('div');
    document.body.appendChild(container);
    helper.setContainer(container);

    const view = createEditor(document.createElement('div'), 'x');
    helper.scheduleFromEditor(view, 0);

    await vi.advanceTimersByTimeAsync(10);
    expect(MarkdownRenderer.render).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(MarkdownRenderer.render).toHaveBeenCalledTimes(1);
  });
});

describe('PreviewHelper.syncScrollFromEditor', () => {
  it('mirrors the editor scroll position onto the preview container', () => {
    const app = new App();
    const helper = new PreviewHelper(app, { app } as any);
    const container = document.createElement('div');
    document.body.appendChild(container);
    helper.setContainer(container);

    const fakeView = { scrollDOM: { scrollTop: 240 } } as any;
    helper.syncScrollFromEditor(fakeView);
    expect(container.scrollTop).toBe(240);
  });
});

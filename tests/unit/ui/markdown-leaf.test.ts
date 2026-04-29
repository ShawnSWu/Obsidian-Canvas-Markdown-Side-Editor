import { describe, it, expect, beforeEach, vi } from 'vitest';

// We need WorkspaceLeaf and MarkdownView to actually be runtime classes for
// the success-path tests. Augment the obsidian mock per-file rather than
// polluting the shared mock used by every other test.
vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');

  class FakeMarkdownView {
    containerEl: HTMLElement = document.createElement('div');
    contentEl: HTMLElement = document.createElement('div');
    editor = { focus: vi.fn() };
    private data = '';
    constructor() {
      this.containerEl.classList.add('view-container-fake');
      this.contentEl.classList.add('view-content-fake');
      this.containerEl.appendChild(this.contentEl);
    }
    getViewData(): string { return this.data; }
    setData(d: string) { this.data = d; }
    onResize(): void { /* no-op in tests */ }
  }

  class FakeWorkspaceLeaf {
    view: FakeMarkdownView | null = null;
    detach = vi.fn();
    async setViewState(state: { type: string; state?: { file?: string } }): Promise<void> {
      if (state.type === 'markdown') {
        const v = new FakeMarkdownView();
        const path = state.state?.file ?? '';
        v.setData(`<<live preview content for ${path}>>`);
        this.view = v;
      }
    }
  }

  return {
    ...actual,
    WorkspaceLeaf: FakeWorkspaceLeaf,
    MarkdownView: FakeMarkdownView,
  };
});

import { App, TFile } from 'obsidian';
import { MarkdownLeafHost } from '../../../src/ui/markdown-leaf';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  // Failure-path tests log via console.error; silence so the noise
  // doesn't drown out genuine failures in CI output.
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function makeFile(path = 'notes/foo.md'): TFile {
  const f = new TFile();
  (f as any).path = path;
  (f as any).basename = path.split('/').pop()!.replace(/\.md$/, '');
  (f as any).extension = 'md';
  return f;
}

describe('MarkdownLeafHost.open — success path', () => {
  it('creates a leaf, mounts the view content, and exposes getValue()', async () => {
    const host = new MarkdownLeafHost(new App());
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    const view = await host.open(makeFile('notes/foo.md'), mount);

    expect(view).not.toBeNull();
    expect(host.hasOpen()).toBe(true);
    expect(host.getValue()).toBe('<<live preview content for notes/foo.md>>');
    // The view's contentEl should now be a child of our mount point.
    expect(mount.querySelector('.view-content-fake')).not.toBeNull();
  });

  it('detach() removes the embedded DOM and frees state', async () => {
    const host = new MarkdownLeafHost(new App());
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    await host.open(makeFile('a.md'), mount);
    expect(host.hasOpen()).toBe(true);

    await host.detach();
    expect(host.hasOpen()).toBe(false);
    expect(mount.children.length).toBe(0);
    expect(host.getValue()).toBeNull();
  });

  it('open() called twice replaces the previous embedding', async () => {
    const host = new MarkdownLeafHost(new App());
    const mount = document.createElement('div');
    document.body.appendChild(mount);

    await host.open(makeFile('a.md'), mount);
    const firstView = host.getView();
    await host.open(makeFile('b.md'), mount);
    const secondView = host.getView();

    expect(secondView).not.toBe(firstView);
    expect(host.getValue()).toContain('b.md');
    // Only one view's DOM should be mounted.
    expect(mount.querySelectorAll('.view-content-fake').length).toBe(1);
  });
});

describe('MarkdownLeafHost.open — failure paths', () => {
  it('returns null when WorkspaceLeaf constructor throws', async () => {
    // Spy on the imported class and force its constructor to throw, then
    // restore at the end of the test via beforeEach's restoreAllMocks.
    const obsidian = await import('obsidian');
    const ThrowCtor = function ThrowCtor(this: unknown) { throw new Error('not constructable in this build'); } as unknown as typeof obsidian.WorkspaceLeaf;
    const spy = vi.spyOn(obsidian, 'WorkspaceLeaf', 'get').mockReturnValue(ThrowCtor);

    const host = new MarkdownLeafHost(new App());
    const mount = document.createElement('div');
    const view = await host.open(makeFile(), mount);

    expect(view).toBeNull();
    expect(host.hasOpen()).toBe(false);
    spy.mockRestore();
  });

  it('returns null and detaches when setViewState throws', async () => {
    const obsidian = await import('obsidian');
    class FailingLeaf {
      view: unknown = null;
      detach = vi.fn();
      async setViewState(): Promise<void> { throw new Error('boom'); }
    }
    const spy = vi.spyOn(obsidian, 'WorkspaceLeaf', 'get').mockReturnValue(FailingLeaf as unknown as typeof obsidian.WorkspaceLeaf);

    const host = new MarkdownLeafHost(new App());
    const mount = document.createElement('div');
    const view = await host.open(makeFile(), mount);

    expect(view).toBeNull();
    expect(host.hasOpen()).toBe(false);
    spy.mockRestore();
  });
});

describe('MarkdownLeafHost — idle state', () => {
  it('detach() on a fresh instance is a no-op', async () => {
    const host = new MarkdownLeafHost(new App());
    await expect(host.detach()).resolves.toBeUndefined();
    expect(host.hasOpen()).toBe(false);
    expect(host.getValue()).toBeNull();
  });
});

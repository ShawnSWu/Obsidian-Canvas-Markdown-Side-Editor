import { describe, it, expect, beforeEach, vi } from 'vitest';

// Per-file obsidian mock — we need WorkspaceLeaf to be a real runtime class.
// Tracks every leaf instance constructed so the test can assert on call
// counts and the resolved view-state shape.
const { leavesCreated } = vi.hoisted(() => ({
  leavesCreated: [] as Array<{
    setViewStateCalls: () => number;
    lastState?: Record<string, unknown>;
    detachCalls: () => number;
    loadIfDeferredCalls: () => number;
  }>,
}));

vi.mock('obsidian', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('obsidian');

  class FakeWorkspaceLeaf {
    view: unknown = null;
    isDeferred = true;
    private _setCalls = 0;
    private _detachCalls = 0;
    private _loadCalls = 0;
    lastState: Record<string, unknown> | undefined = undefined;
    constructor() {
      // Capture `this` so the `get lastState()` getter below reads the
      // FakeWorkspaceLeaf instance's lastState field rather than its own
      // (which would recurse). Arrow-function accessors on the same object
      // already capture lexical this, but a regular getter would not.
      const self = this;
      leavesCreated.push({
        setViewStateCalls: () => self._setCalls,
        get lastState() { return self.lastState; },
        detachCalls: () => self._detachCalls,
        loadIfDeferredCalls: () => self._loadCalls,
      } as unknown as (typeof leavesCreated)[number]);
    }
    async setViewState(state: { type: string; state?: Record<string, unknown> }): Promise<void> {
      this._setCalls += 1;
      this.lastState = state.state ?? {};
    }
    async loadIfDeferred(): Promise<void> {
      this._loadCalls += 1;
      this.isDeferred = false;
    }
    detach(): void {
      this._detachCalls += 1;
    }
  }

  return {
    ...actual,
    WorkspaceLeaf: FakeWorkspaceLeaf,
  };
});

import { App, TFile } from 'obsidian';
import { prewarmMarkdownLeaf } from '../../../src/ui/prewarm';

function makeApp(markdownFiles: TFile[]): App {
  const app = new App();
  // The shared Vault mock doesn't expose getMarkdownFiles, so we monkey-
  // patch one onto this instance for the test.
  (app.vault as unknown as { getMarkdownFiles: () => TFile[] }).getMarkdownFiles = () => markdownFiles;
  // onLayoutReady isn't on the shared Workspace mock either; pre-warm
  // doesn't call it (main.ts does), but the helper still needs the
  // workspace surface for typing.
  return app;
}

beforeEach(() => {
  leavesCreated.length = 0;
  vi.restoreAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('prewarmMarkdownLeaf', () => {
  it('warms a leaf against the first markdown file in the vault', async () => {
    const f = new TFile('notes/foo.md');
    const app = makeApp([f]);

    await prewarmMarkdownLeaf(app);

    expect(leavesCreated).toHaveLength(1);
    const fake = leavesCreated[0];
    expect(fake.setViewStateCalls()).toBe(1);
    expect(fake.lastState).toMatchObject({ file: 'notes/foo.md', mode: 'source', source: false });
    expect(fake.loadIfDeferredCalls()).toBe(1);
    expect(fake.detachCalls()).toBe(1);
  });

  it('returns early without constructing a leaf when the vault has no markdown files', async () => {
    const app = makeApp([]);
    await prewarmMarkdownLeaf(app);
    expect(leavesCreated).toHaveLength(0);
  });

  it('swallows errors during setViewState (best-effort, no rethrow)', async () => {
    const app = makeApp([new TFile('a.md')]);
    // Override setViewState on the next constructed leaf to throw.
    const obsidian = await import('obsidian');
    const ThrowingLeaf = class {
      view: unknown = null;
      isDeferred = false;
      async setViewState(): Promise<void> { throw new Error('boom'); }
      detach = vi.fn();
    };
    const spy = vi.spyOn(obsidian, 'WorkspaceLeaf', 'get').mockReturnValue(ThrowingLeaf as unknown as typeof obsidian.WorkspaceLeaf);

    await expect(prewarmMarkdownLeaf(app)).resolves.toBeUndefined();
    spy.mockRestore();
  });

  it('swallows errors when WorkspaceLeaf constructor throws', async () => {
    const app = makeApp([new TFile('a.md')]);
    const obsidian = await import('obsidian');
    const ThrowCtor = function ThrowCtor(this: unknown) { throw new Error('cannot construct'); } as unknown as typeof obsidian.WorkspaceLeaf;
    const spy = vi.spyOn(obsidian, 'WorkspaceLeaf', 'get').mockReturnValue(ThrowCtor);

    await expect(prewarmMarkdownLeaf(app)).resolves.toBeUndefined();
    spy.mockRestore();
  });
});

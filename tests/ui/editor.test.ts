import { describe, it, expect, beforeEach, vi } from 'vitest';
import { keymap } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { createEditor } from '../../src/ui/editor';

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeParent(): HTMLElement {
  const p = document.createElement('div');
  document.body.appendChild(p);
  return p;
}

describe('createEditor', () => {
  it('initialises with the provided document text', () => {
    const view = createEditor(makeParent(), 'hello world');
    expect(view.state.doc.toString()).toBe('hello world');
  });

  it('invokes onDocChange when the document content changes', () => {
    const onDocChange = vi.fn();
    const view = createEditor(makeParent(), '', onDocChange);
    view.dispatch({ changes: { from: 0, insert: 'a' } });
    expect(onDocChange).toHaveBeenCalledTimes(1);
    expect((onDocChange.mock.calls[0][0] as any).state.doc.toString()).toBe('a');
  });

  it('does not invoke onDocChange for selection-only updates', () => {
    const onDocChange = vi.fn();
    const view = createEditor(makeParent(), 'abc', onDocChange);
    view.dispatch({ selection: { anchor: 1 } });
    expect(onDocChange).not.toHaveBeenCalled();
  });
});

describe('createEditor — standard editing keymap', () => {
  function registeredKeys(view: ReturnType<typeof createEditor>): string[] {
    const bindings = view.state.facet(keymap).flat() as Array<{ key?: string; mac?: string }>;
    return bindings.map(b => b.key ?? '').filter(Boolean);
  }

  it('registers Mod-z for undo and Mod-y for redo via historyKeymap', () => {
    const view = createEditor(makeParent(), 'hello');
    const keys = registeredKeys(view);
    expect(keys).toContain('Mod-z');
    expect(keys).toContain('Mod-y');
  });

  it('reverts inserted text when the undo command runs', () => {
    // history() must be installed for `undo` to roll back a user transaction.
    // Use `userEvent: 'input.type'` so CM6 marks the change as undoable;
    // plain `view.dispatch({ changes })` is treated as a programmatic change
    // and is not pushed onto the history stack.
    const view = createEditor(makeParent(), '');
    view.dispatch({
      changes: { from: 0, insert: 'abc' },
      userEvent: 'input.type',
    });
    expect(view.state.doc.toString()).toBe('abc');
    const handled = undo(view);
    expect(handled).toBe(true);
    expect(view.state.doc.toString()).toBe('');
  });
});

describe('createEditor — paste image handling', () => {
  function makeImageItem(name = 'pic.png', type = 'image/png'): DataTransferItem {
    const file = new File(['x'], name, { type });
    return {
      kind: 'file',
      type,
      getAsFile: () => file,
    } as unknown as DataTransferItem;
  }

  function makeTextItem(): DataTransferItem {
    return {
      kind: 'string',
      type: 'text/plain',
      getAsFile: () => null,
    } as unknown as DataTransferItem;
  }

  function dispatchPaste(parent: HTMLElement, items: DataTransferItem[]): boolean {
    const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, 'clipboardData', {
      value: { items: items as unknown as DataTransferItemList },
    });
    try {
      // CodeMirror's downstream paste handler can crash on synthetic events
      // in happy-dom; we only care that our domEventHandlers.paste forwarded
      // the data, so swallow any errors from later handlers.
      return parent.querySelector('.cm-content')!.dispatchEvent(event);
    } catch {
      return false;
    }
  }

  it('forwards pasted image files to the handler', () => {
    const onPasteImages = vi.fn();
    const parent = makeParent();
    createEditor(parent, '', undefined, onPasteImages);
    const cancelled = !dispatchPaste(parent, [makeImageItem()]);
    expect(onPasteImages).toHaveBeenCalledTimes(1);
    const files = onPasteImages.mock.calls[0][0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe('image/png');
    // Default is prevented when we accept the paste
    expect(cancelled).toBe(true);
  });

  it('ignores pastes that contain no image items', () => {
    const onPasteImages = vi.fn();
    const parent = makeParent();
    createEditor(parent, '', undefined, onPasteImages);
    dispatchPaste(parent, [makeTextItem()]);
    expect(onPasteImages).not.toHaveBeenCalled();
  });

  it('filters non-image file items out of the forwarded list', () => {
    const onPasteImages = vi.fn();
    const parent = makeParent();
    createEditor(parent, '', undefined, onPasteImages);
    const pdfItem = {
      kind: 'file',
      type: 'application/pdf',
      getAsFile: () => new File([''], 'doc.pdf', { type: 'application/pdf' }),
    } as unknown as DataTransferItem;
    dispatchPaste(parent, [pdfItem, makeImageItem('shot.jpg', 'image/jpeg')]);
    expect(onPasteImages).toHaveBeenCalledTimes(1);
    const files = onPasteImages.mock.calls[0][0] as File[];
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe('image/jpeg');
  });
});

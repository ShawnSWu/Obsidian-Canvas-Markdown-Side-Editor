// Common interface for the two editor primitives the side panel can host:
//   - Cm6EditorHost    ('cm6')  — bare CodeMirror 6 markdown editor, used for
//                                 text cards (their content lives in the
//                                 canvas JSON, there is no file to bind to)
//   - MarkdownLeafHost  ('leaf') — a real Obsidian MarkdownView (Live Preview),
//                                 used for file cards in 'live' view mode
// The session code talks to this interface only; it never branches on
// concrete classes. (The one remaining kind-check is `EditorSession`'s
// save path, because CM6 content must be written back into canvas JSON
// while the leaf writes straight to its bound file.)
export interface EditorHost {
  readonly kind: 'cm6' | 'leaf';

  // Whether an editor is currently mounted.
  isOpen(): boolean;

  // Latest editor content, or null when nothing is open / readable.
  getValue(): string | null;

  // Persist any debounced in-memory buffer to disk. Only meaningful for the
  // leaf host (Obsidian's MarkdownView save is debounced ~2s); CM6 holds no
  // buffer of its own, so this is a no-op there.
  flush(): Promise<void>;

  focus(): void;

  // Tear down the editor and release its DOM/listeners.
  dispose(): Promise<void>;
}

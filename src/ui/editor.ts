import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';

export function createEditor(
  parent: HTMLElement,
  initialDoc: string,
  onDocChange?: (view: EditorView) => void,
  onPasteImages?: (files: File[], view: EditorView) => void,
): EditorView {
  const extensions: Extension[] = [markdown(), EditorView.lineWrapping];
  if (onDocChange) {
    extensions.push(
      EditorView.updateListener.of((vu) => {
        if (vu.docChanged) onDocChange(vu.view as EditorView);
      }),
    );
  }
  if (onPasteImages) {
    extensions.push(
      EditorView.domEventHandlers({
        paste: (evt, view) => {
          try {
            const items = (evt as ClipboardEvent).clipboardData?.items;
            if (!items || items.length === 0) return false;
            const files: File[] = [];
            for (let i = 0; i < items.length; i++) {
              const it = items[i];
              if (it.kind === 'file') {
                const f = it.getAsFile();
                if (f && f.type && f.type.startsWith('image/')) files.push(f);
              }
            }
            if (files.length) {
              (evt as ClipboardEvent).preventDefault();
              onPasteImages(files, view as EditorView);
              return true;
            }
          } catch {}
          return false;
        }
      })
    );
  }
  const state = EditorState.create({ doc: initialDoc, extensions });
  const view = new EditorView({ state, parent });
  return view;
}

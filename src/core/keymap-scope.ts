// Obsidian Scope that overrides Mod+X while the side panel is open.
// Canvas's "cut selected node" hotkey runs at a level that the plain CM6
// keymap (even with stopPropagation) cannot reach — pushing this scope
// makes Obsidian's keymap dispatcher check our Mod+X binding first.
import { App, Scope } from 'obsidian';
import type { EditorView } from '@codemirror/view';

export class SideEditorScope {
  private app: App;
  private getCmView: () => EditorView | null;
  private scope: Scope | null = null;

  constructor(app: App, getCmView: () => EditorView | null) {
    this.app = app;
    this.getCmView = getCmView;
  }

  // Push the scope onto Obsidian's keymap. The callback only acts when
  // focus is inside our CM6 editor — otherwise it returns true so Canvas's
  // own "cut selected node" hotkey can run unchanged.
  install(): void {
    if (this.scope) return;
    const scope = new Scope(this.app.scope);
    scope.register(['Mod'], 'x', () => {
      const cm = this.getCmView();
      const ae = document.activeElement;
      if (!cm || !ae || !cm.contentDOM.contains(ae)) return true;
      const sel = cm.state.selection.main;
      let from = sel.from;
      let to = sel.to;
      if (sel.empty) {
        const line = cm.state.doc.lineAt(sel.from);
        from = line.from;
        to = line.to === cm.state.doc.length ? line.to : line.to + 1;
      }
      if (from === to) return false;
      const text = cm.state.sliceDoc(from, to);
      try { void navigator.clipboard.writeText(text); } catch {}
      cm.dispatch({
        changes: { from, to, insert: '' },
        selection: { anchor: from },
        userEvent: 'delete.cut',
      });
      return false;
    });
    this.app.keymap.pushScope(scope);
    this.scope = scope;
  }

  uninstall(): void {
    if (!this.scope) return;
    try { this.app.keymap.popScope(this.scope); } catch {}
    this.scope = null;
  }
}

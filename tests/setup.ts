// Global test setup. happy-dom doesn't ship a few APIs that Obsidian/CodeMirror touch,
// so we polyfill the absolute minimum here.

if (typeof (HTMLElement.prototype as any).createDiv !== 'function') {
  // Obsidian augments HTMLElement with these helpers; mirror just enough.
  (HTMLElement.prototype as any).createDiv = function (
    this: HTMLElement,
    o?: { cls?: string; text?: string; title?: string },
  ): HTMLElement {
    const d = document.createElement('div');
    if (o?.cls) d.className = o.cls;
    if (o?.text) d.textContent = o.text;
    if (o?.title) d.setAttribute('title', o.title);
    this.appendChild(d);
    return d;
  };
  (HTMLElement.prototype as any).createEl = function (
    this: HTMLElement,
    tag: string,
    o?: { cls?: string; text?: string },
  ): HTMLElement {
    const el = document.createElement(tag);
    if (o?.cls) el.className = o.cls;
    if (o?.text) el.textContent = o.text;
    this.appendChild(el);
    return el;
  };
  (HTMLElement.prototype as any).empty = function (this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
  };
  (HTMLElement.prototype as any).setText = function (this: HTMLElement, text: string) {
    this.textContent = text;
  };
}

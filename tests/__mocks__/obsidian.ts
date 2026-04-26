// Minimal Obsidian API mock for unit/integration tests.
// Only the surface used by this plugin is implemented.

import { vi } from 'vitest';

export class TFile {
  path: string = '';
  name: string = '';
  basename: string = '';
  extension: string = '';
  constructor(path: string = '') {
    this.path = path;
    const idx = path.lastIndexOf('/');
    this.name = idx === -1 ? path : path.slice(idx + 1);
    const dot = this.name.lastIndexOf('.');
    this.basename = dot === -1 ? this.name : this.name.slice(0, dot);
    this.extension = dot === -1 ? '' : this.name.slice(dot + 1);
  }
}

export class TFolder {
  path: string = '';
  constructor(path: string = '') { this.path = path; }
}

export type EventRef = { id: number };

export class Vault {
  private files = new Map<string, string | ArrayBuffer>();
  read = vi.fn(async (file: TFile) => {
    const v = this.files.get(file.path);
    if (typeof v === 'string') return v;
    if (v instanceof ArrayBuffer) return new TextDecoder().decode(v);
    return '';
  });
  modify = vi.fn(async (file: TFile, content: string) => {
    this.files.set(file.path, content);
  });
  createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
    this.files.set(path, data);
    return new TFile(path);
  });
  createFolder = vi.fn(async (_path: string) => undefined);
  rename = vi.fn(async (file: TFile, newPath: string) => {
    const old = file.path;
    if (this.files.has(old)) {
      const content = this.files.get(old)!;
      this.files.delete(old);
      this.files.set(newPath, content);
    }
    file.path = newPath;
    const idx = newPath.lastIndexOf('/');
    file.name = idx === -1 ? newPath : newPath.slice(idx + 1);
    const dot = file.name.lastIndexOf('.');
    file.basename = dot === -1 ? file.name : file.name.slice(0, dot);
    file.extension = dot === -1 ? '' : file.name.slice(dot + 1);
  });
  getAbstractFileByPath = vi.fn((path: string) => {
    if (this.files.has(path)) return new TFile(path);
    return null;
  });
  getConfig = vi.fn((_k: string) => undefined);
  // Helper for tests
  __seed(path: string, content: string) {
    this.files.set(path, content);
  }
}

export class Workspace {
  activeLeaf: any = null;
  private listeners = new Map<string, Set<(...a: any[]) => void>>();
  on = vi.fn((event: string, cb: (...a: any[]) => void): EventRef => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return { id: Math.random() };
  });
  off = vi.fn();
  // Helper for tests
  __emit(event: string, ...args: any[]) {
    this.listeners.get(event)?.forEach((cb) => cb(...args));
  }
}

export class App {
  vault: Vault;
  workspace: Workspace;
  constructor() {
    this.vault = new Vault();
    this.workspace = new Workspace();
  }
}

export type WorkspaceLeaf = { view: unknown };

export class Plugin {
  app: App;
  manifest: { id: string; version: string };
  // tracked registrations for cleanup-style assertions
  __registered: { events: EventRef[]; dom: Array<{ el: EventTarget; type: string; handler: any }> } = { events: [], dom: [] };

  constructor(app: App, manifest: { id: string; version: string }) {
    this.app = app;
    this.manifest = manifest;
  }
  loadData = vi.fn(async () => null);
  saveData = vi.fn(async (_d: unknown) => undefined);
  registerEvent = vi.fn((ref: EventRef) => { this.__registered.events.push(ref); });
  registerDomEvent = vi.fn((el: EventTarget, type: string, handler: any, options?: any) => {
    el.addEventListener(type, handler, options);
    this.__registered.dom.push({ el, type, handler });
  });
  registerInterval = vi.fn();
  addCommand = vi.fn();
  addSettingTab = vi.fn();
  async onload(): Promise<void> {}
  async onunload(): Promise<void> {}
}

export class PluginSettingTab {
  app: App;
  plugin: Plugin;
  containerEl: HTMLElement;
  constructor(app: App, plugin: Plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement('div');
  }
  display(): void {}
  hide(): void {}
}

export class Setting {
  containerEl: HTMLElement;
  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
  setName(_n: string) { return this; }
  setDesc(_d: string) { return this; }
  addText(cb: (tb: any) => void) {
    const inputEl = document.createElement('input');
    const tb = {
      inputEl,
      setValue: (v: string) => { inputEl.value = v; return tb; },
      onChange: (handler: (v: string) => void) => { inputEl.addEventListener('input', () => handler(inputEl.value)); return tb; },
    };
    cb(tb);
    this.containerEl.appendChild(inputEl);
    return this;
  }
  addToggle(cb: (tg: any) => void) {
    const inputEl = document.createElement('input');
    inputEl.type = 'checkbox';
    const tg = {
      setValue: (v: boolean) => { inputEl.checked = !!v; return tg; },
      onChange: (handler: (v: boolean) => void) => { inputEl.addEventListener('change', () => handler(inputEl.checked)); return tg; },
    };
    cb(tg);
    this.containerEl.appendChild(inputEl);
    return this;
  }
  addDropdown(cb: (dd: any) => void) {
    const selectEl = document.createElement('select');
    const dd = {
      selectEl,
      addOption: (value: string, label: string) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = label;
        selectEl.appendChild(opt);
        return dd;
      },
      addOptions: (options: Record<string, string>) => {
        for (const [v, l] of Object.entries(options)) dd.addOption(v, l);
        return dd;
      },
      setValue: (v: string) => { selectEl.value = v; return dd; },
      onChange: (handler: (v: string) => void) => { selectEl.addEventListener('change', () => handler(selectEl.value)); return dd; },
    };
    cb(dd);
    this.containerEl.appendChild(selectEl);
    return this;
  }
}

export class MarkdownRenderer {
  static render = vi.fn(async (
    _app: App,
    text: string,
    container: HTMLElement,
    _sourcePath: string,
    _component: unknown,
  ) => {
    const p = document.createElement('p');
    p.textContent = text;
    container.appendChild(p);
  });
}

export const addIcon = vi.fn();
export const setIcon = vi.fn((el: HTMLElement, name: string) => {
  el.setAttribute('data-icon', name);
});

export const __notices: string[] = [];
export class Notice {
  message: string;
  constructor(message: string, _timeoutMs?: number) {
    this.message = message;
    __notices.push(message);
  }
}

// Re-export so `import type { TFile } from 'obsidian'` works
export type { TFile as TFileType } from './obsidian';

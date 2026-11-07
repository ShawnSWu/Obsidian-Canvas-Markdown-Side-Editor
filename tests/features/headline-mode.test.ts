import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyHeadlineMode,
  clampHeadlineSize,
  parseNoteTitle,
  removeHeadlineMode,
  selectHeadlineParts,
  syncSubtitleEllipsis,
} from '../../src/features/headline-mode';
import { DEFAULT_SETTINGS, HEADLINE_SIZE_LIMITS } from '../../src/settings';

const styles = readFileSync('styles.css', 'utf8');
const enable = () => applyHeadlineMode({ ...DEFAULT_SETTINGS, headlineMode: true });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function card(content: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'canvas-node';
  node.innerHTML = `<div class="markdown-preview-view markdown-rendered"><div class="markdown-preview-sizer">${content}</div></div>`;
  document.body.appendChild(node);
  return node;
}

const note = (id: string, title = 'Note', body = '<p>Readable <a href="#link">link</a></p>', type = 'note') =>
  `<div class="callout" data-callout="${type}" id="${id}"><div class="callout-title"><svg></svg><div class="callout-title-inner">${title}</div></div><div class="callout-content">${body}</div></div>`;

const display = (element: Element): string => getComputedStyle(element).display;

beforeEach(() => {
  document.body.innerHTML = '';
  const style = document.createElement('style');
  style.id = 'headline-test-styles';
  style.textContent = `.callout { background-color: rgb(12, 34, 56); } .callout-title { display: flex; } ${styles}`;
  document.head.appendChild(style);
});

afterEach(() => {
  vi.restoreAllMocks();
  removeHeadlineMode();
  document.getElementById('headline-test-styles')?.remove();
  document.body.innerHTML = '';
});

describe('parseNoteTitle', () => {
  it('splits identifier and category at the first pipe only', () => {
    expect(parseNoteTitle('P01 | 系統檢查')).toEqual({ identifier: 'P01', category: '系統檢查' });
    expect(parseNoteTitle('P01 | A | B')).toEqual({ identifier: 'P01', category: 'A | B' });
    expect(parseNoteTitle('  P02  |  Ops  ')).toEqual({ identifier: 'P02', category: 'Ops' });
  });

  it('treats a pipeless title as category only', () => {
    expect(parseNoteTitle('系統檢查')).toEqual({ identifier: '', category: '系統檢查' });
  });

  it('keeps empty sides empty', () => {
    expect(parseNoteTitle('P01 |')).toEqual({ identifier: 'P01', category: '' });
    expect(parseNoteTitle('| 系統檢查')).toEqual({ identifier: '', category: '系統檢查' });
  });

  it('treats empty and default callout titles as no title', () => {
    expect(parseNoteTitle('')).toEqual({ identifier: '', category: '' });
    expect(parseNoteTitle('   ')).toEqual({ identifier: '', category: '' });
    expect(parseNoteTitle('Note')).toEqual({ identifier: '', category: '' });
    expect(parseNoteTitle('note')).toEqual({ identifier: '', category: '' });
    expect(parseNoteTitle('Warning', 'warning')).toEqual({ identifier: '', category: '' });
    expect(parseNoteTitle('Notebook')).toEqual({ identifier: '', category: 'Notebook' });
  });
});

describe('selectHeadlineParts', () => {
  const root = (content: string): Element => {
    const el = document.createElement('div');
    el.innerHTML = content;
    return el;
  };

  it('selects the first H1 and the first Note below it', () => {
    const r = root(`<h1 id="t">T</h1>${note('n1', 'A')}${note('n2', 'B')}<h2>sub</h2>`);
    const { title, note: n } = selectHeadlineParts(r);
    expect(title?.textContent).toBe('T');
    expect(n?.id).toBe('n1');
  });

  it('ignores Notes before the first H1', () => {
    const r = root(`${note('early')}<h1 id="t">T</h1>`);
    expect(selectHeadlineParts(r).note).toBeNull();
    const withLater = root(`${note('early')}<h1>T</h1>${note('late')}`);
    expect(selectHeadlineParts(withLater).note?.id).toBe('late');
  });

  it('ignores Notes after the second H1', () => {
    const r = root(`<h1>First</h1><h1>Second</h1>${note('late')}`);
    const { title, note: n } = selectHeadlineParts(r);
    expect(title?.textContent).toBe('First');
    expect(n).toBeNull();
  });

  it('ignores H2 headings and Notes nested inside other callouts', () => {
    const nested = `<div class="callout" data-callout="warning"><div class="callout-content"><h1 id="nested-h1">Nested</h1>${note('nested')}</div></div>`;
    const r = root(`${nested}<h2 id="h2">Not it</h2><h1 id="t">T</h1>${note('n1')}`);
    const { title, note: n } = selectHeadlineParts(r);
    expect(title?.id).toBe('t');
    expect(n?.id).toBe('n1');
  });

  it('returns nulls without an H1', () => {
    const r = root(`${note('n1')}<p>text</p>`);
    expect(selectHeadlineParts(r)).toEqual({ title: null, note: null });
  });
});

describe('headline mode dashboard rendering', () => {
  it('applies the configured tier sizes and clamps invalid values', () => {
    applyHeadlineMode({
      ...DEFAULT_SETTINGS,
      headlineMode: true,
      headlineH1Size: 30,
      headlineBadgeSize: 28,
      headlineCategorySize: 14,
      headlineSubtitleSize: 20,
    });
    expect(document.body.style.getPropertyValue('--cmside-h1-size')).toBe('30');
    expect(document.body.style.getPropertyValue('--cmside-badge-size')).toBe('28');
    expect(document.body.style.getPropertyValue('--cmside-category-size')).toBe('14');
    expect(document.body.style.getPropertyValue('--cmside-subtitle-size')).toBe('20');
    expect(document.body.style.getPropertyValue('--cmside-note-size')).toBe('');
    expect(clampHeadlineSize(Number.NaN, 22, 5, 60)).toBe(22);
    expect(clampHeadlineSize(100, 22, 5, 60)).toBe(60);
  });

  it('falls back to default tier sizes when settings are missing', () => {
    enable();
    expect(document.body.style.getPropertyValue('--cmside-h1-size')).toBe('25');
    expect(document.body.style.getPropertyValue('--cmside-badge-size')).toBe('16');
    expect(document.body.style.getPropertyValue('--cmside-category-size')).toBe('18');
    expect(document.body.style.getPropertyValue('--cmside-subtitle-size')).toBe('11');
  });

  it('places each comfortable default at the middle of its slider', () => {
    for (const key of Object.keys(HEADLINE_SIZE_LIMITS) as Array<keyof typeof HEADLINE_SIZE_LIMITS>) {
      const { min, max } = HEADLINE_SIZE_LIMITS[key];
      expect((min + max) / 2).toBe(DEFAULT_SETTINGS[key]);
    }
  });

  it('renders badge, category, headline and subtitle from H1 + "P01 | 系統檢查" Note', () => {
    const node = card(`<div><h1>連線與服務檢查</h1>${note('n1', 'P01 | 系統檢查', '<p>確認資料庫連線狀態。</p><p>檢查 API 服務是否正常。</p>')}<p id="body">Hidden body</p></div>`);
    enable();
    const title = node.querySelector('h1')!;
    const meta = node.querySelector('.cmside-hl-meta')!;
    const badge = meta.querySelector('.cmside-hl-badge')!;
    const category = meta.querySelector('.cmside-hl-category')!;
    expect(badge.textContent).toBe('P01');
    expect(category.textContent).toBe('系統檢查');
    // Metadata row sits immediately above the headline.
    expect(title.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    expect(title.classList.contains('cmside-headline-title')).toBe(true);
    // Subtitle: the Note body renders, its callout title/syntax do not.
    const n1 = node.querySelector('#n1')!;
    expect(n1.classList.contains('cmside-headline-note')).toBe(true);
    expect(display(n1)).not.toBe('none');
    expect(display(n1.querySelector('.callout-title')!)).toBe('none');
    for (const p of Array.from(n1.querySelectorAll('.callout-content p'))) {
      expect(display(p)).not.toBe('none');
    }
    expect(display(node.querySelector('#body')!)).toBe('none');
    // Meta spans keep their text free of the callout title's raw syntax.
    expect(meta.textContent).not.toContain('[!note]');
  });

  it('renders category only when the Note title has no pipe', () => {
    const node = card(`<h1>Title</h1>${note('n1', '系統檢查')}`);
    enable();
    const badge = node.querySelector('.cmside-hl-badge') as HTMLElement;
    const category = node.querySelector('.cmside-hl-category')!;
    expect((badge as HTMLElement).style.display).toBe('none');
    expect(badge.textContent).toBe('');
    expect(category.textContent).toBe('系統檢查');
  });

  it('renders no metadata row when the Note has no title, but keeps the subtitle', () => {
    const node = card(`<h1>Title</h1>${note('n1', 'Note', '<p>確認所有必要依賴均已啟動。</p>')}`);
    enable();
    expect(node.querySelector('.cmside-hl-meta')).toBeNull();
    const n1 = node.querySelector('#n1')!;
    expect(n1.classList.contains('cmside-headline-note')).toBe(true);
    expect(display(n1.querySelector('.callout-content p')!)).not.toBe('none');
  });

  it('supports multiline Note bodies with paragraph separation', () => {
    const node = card(`<h1>Title</h1>${note('n1', 'P01 | Check', '<p>Line one.</p><p>Line two.</p><ul><li>Line three</li></ul>')}`);
    enable();
    const content = node.querySelector('#n1 .callout-content')!;
    expect(content.querySelectorAll('p')).toHaveLength(2);
    for (const el of Array.from(content.querySelectorAll('p, ul, li'))) {
      expect(display(el)).not.toBe('none');
    }
  });

  it('ignores a Note placed before the first H1', () => {
    const node = card(`<div>${note('early', 'P00 | Early')}</div><div><h1>Title</h1><p id="body">x</p></div>`);
    enable();
    expect(node.querySelector('.cmside-headline-note')).toBeNull();
    expect(node.querySelector('.cmside-hl-meta')).toBeNull();
    expect(display(node.querySelector('#early')!)).toBe('none');
  });

  it('uses only the first Note when several follow the H1', () => {
    const node = card(`<h1>Title</h1>${note('n1', 'P01 | First')}${note('n2', 'P02 | Second')}`);
    enable();
    expect(node.querySelectorAll('.cmside-headline-note')).toHaveLength(1);
    expect(node.querySelector('.cmside-headline-note')!.id).toBe('n1');
    expect(node.querySelector('.cmside-hl-badge')!.textContent).toBe('P01');
    expect(display(node.querySelector('#n2')!)).toBe('none');
  });

  it('ignores a Note placed after the second H1', () => {
    const node = card(`<div><h1>First</h1><p id="p1">x</p></div><div><h1 id="second-h1">Second</h1>${note('late', 'P09 | Late')}</div>`);
    enable();
    expect(node.querySelector('.cmside-headline-title')!.textContent).toBe('First');
    expect(node.querySelector('.cmside-headline-note')).toBeNull();
    expect(node.querySelector('.cmside-hl-meta')).toBeNull();
    expect(display(node.querySelector('#second-h1')!)).toBe('none');
    expect(display(node.querySelector('#late')!)).toBe('none');
  });

  it('uses the first of multiple H1 headings as the headline', () => {
    const node = card(`<div><h1>Alpha</h1>${note('n1', 'P01 | Check')}</div><div><h1 id="beta">Beta</h1></div>`);
    enable();
    expect(node.querySelectorAll('.cmside-headline-title')).toHaveLength(1);
    expect(node.querySelector('.cmside-headline-title')!.textContent).toBe('Alpha');
    expect(display(node.querySelector('#beta')!)).toBe('none');
  });

  it('renders only the headline when the Note is missing', () => {
    const node = card('<h1>Lonely title</h1><p id="body">Hidden</p>');
    enable();
    expect(node.querySelector('.cmside-headline-title')!.textContent).toBe('Lonely title');
    expect(node.querySelector('.cmside-headline-note')).toBeNull();
    expect(node.querySelector('.cmside-hl-meta')).toBeNull();
    const root = node.querySelector('.cmside-headline-root')!;
    expect(root.classList.contains('cmside-headline-has-note')).toBe(false);
    expect(root.classList.contains('cmside-headline-empty')).toBe(false);
    expect(display(node.querySelector('#body')!)).toBe('none');
  });

  it('renders metadata without a subtitle when the Note body is empty', () => {
    const node = card(`<h1>Title</h1>${note('n1', 'P01 | 系統檢查', '')}`);
    enable();
    expect(node.querySelector('.cmside-hl-badge')!.textContent).toBe('P01');
    expect(node.querySelector('#n1 .callout-content')!.textContent!.trim()).toBe('');
  });

  it('marks cards without an H1 with the empty-headline hook', () => {
    const node = card('<p id="body">No heading here</p>');
    enable();
    const root = node.querySelector('.cmside-headline-root')!;
    expect(root.classList.contains('cmside-headline-empty')).toBe(true);
    expect(node.querySelector('.cmside-headline-title')).toBeNull();
    expect(display(node.querySelector('#body')!)).toBe('none');
  });

  it.each(['is-editing', 'editing'])('leaves full content and native callout layout intact in %s mode', editingClass => {
    const node = card(`<h1>Title</h1><h2 id="sub">Subtitle</h2><p id="body">Body</p>${note('n1', 'P01 | Check')}${note('n2', 'P02 | Other')}`);
    enable();
    node.classList.add(editingClass);
    for (const element of Array.from(node.querySelectorAll('h2, p, .callout'))) {
      expect(display(element)).not.toBe('none');
    }
    expect(display(node.querySelector('#n1 .callout-title')!)).toBe('flex');
  });

  it('refreshes after reordering, callout type changes and title edits', async () => {
    enable();
    const node = card(`<h1>Title</h1>${note('n1', 'P01 | First')}${note('n2', 'P02 | Second')}`);
    await flush();
    const first = node.querySelector('#n1')!;
    const second = node.querySelector('#n2')!;
    expect(first.classList.contains('cmside-headline-note')).toBe(true);
    expect(node.querySelector('.cmside-hl-badge')!.textContent).toBe('P01');
    first.before(second);
    await flush();
    expect(second.classList.contains('cmside-headline-note')).toBe(true);
    expect(first.classList.contains('cmside-headline-note')).toBe(false);
    expect(node.querySelector('.cmside-hl-badge')!.textContent).toBe('P02');
    second.setAttribute('data-callout', 'warning');
    await flush();
    expect(first.classList.contains('cmside-headline-note')).toBe(true);
    expect(second.classList.contains('cmside-headline-note')).toBe(false);
    expect(node.querySelector('.cmside-hl-badge')!.textContent).toBe('P01');
    // Editing the Note title updates badge/category in place.
    first.querySelector('.callout-title-inner')!.textContent = 'P07 | Renamed';
    await flush();
    expect(node.querySelector('.cmside-hl-badge')!.textContent).toBe('P07');
    expect(node.querySelector('.cmside-hl-category')!.textContent).toBe('Renamed');
  });

  it('removes the metadata row when the Note title is removed', async () => {
    enable();
    const node = card(`<h1>Title</h1>${note('n1', 'P01 | First')}`);
    await flush();
    expect(node.querySelector('.cmside-hl-meta')).not.toBeNull();
    node.querySelector('#n1 .callout-title-inner')!.textContent = '';
    await flush();
    expect(node.querySelector('.cmside-hl-meta')).toBeNull();
    expect(node.querySelector('#n1')!.classList.contains('cmside-headline-note')).toBe(true);
  });

  it('leaves standalone image cards alone and cleans up fully on disable', async () => {
    const noNote = card('<h1>Title</h1><h2 id="sub">Hidden subtitle</h2>');
    const withNote = card(`<h1>Other title</h1>${note('n1', 'P01 | Check')}`);
    const imageCard = document.createElement('div');
    imageCard.className = 'canvas-node';
    imageCard.innerHTML = '<div class="canvas-node-content media-embed image-embed"><img src="image.png"></div>';
    document.body.appendChild(imageCard);
    enable();
    expect(noNote.querySelector('.cmside-headline-note')).toBeNull();
    expect(withNote.querySelectorAll('.cmside-headline-note')).toHaveLength(1);
    expect(display(imageCard.querySelector('img')!)).not.toBe('none');
    applyHeadlineMode({ ...DEFAULT_SETTINGS, headlineMode: false });
    expect(document.querySelector('[class*="cmside-headline-"]')).toBeNull();
    expect(document.querySelector('.cmside-hl-meta')).toBeNull();
    withNote.querySelector('#n1')!.remove();
    withNote.querySelector('.markdown-preview-sizer')!.insertAdjacentHTML('beforeend', note('new', 'P03 | New'));
    await flush();
    expect(document.querySelector('.cmside-headline-note')).toBeNull();
    expect(document.querySelector('.cmside-hl-meta')).toBeNull();
    expect(display(noNote.querySelector('#sub')!)).not.toBe('none');
  });
});

describe('subtitle ellipsis', () => {
  function box(element: HTMLElement, client: number, scroll: number): void {
    Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => client });
    Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => scroll });
  }

  it('clamps overflowing subtitle lines without changing the size sliders', () => {
    const node = card(`<h1>T</h1>${note('n1', 'P01 | Cat', '<p>one</p><p>two</p>')}`);
    enable();
    const subtitle = node.querySelector('#n1') as HTMLElement;
    box(subtitle, 40, 120);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ lineHeight: '20px' } as CSSStyleDeclaration);
    syncSubtitleEllipsis(subtitle);
    expect(subtitle.style.getPropertyValue('--cmside-subtitle-lines')).toBe('2');
    expect(subtitle.classList.contains('cmside-headline-subtitle-clipped')).toBe(false);
    expect(document.body.style.getPropertyValue('--cmside-subtitle-size')).toBe(String(DEFAULT_SETTINGS.headlineSubtitleSize));
  });

  it('leaves a subtitle that fits unclamped', () => {
    const node = card(`<h1>T</h1>${note('n1', 'P01 | Cat')}`);
    enable();
    const subtitle = node.querySelector('#n1') as HTMLElement;
    box(subtitle, 80, 40);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ lineHeight: '20px' } as CSSStyleDeclaration);
    syncSubtitleEllipsis(subtitle);
    expect(subtitle.style.getPropertyValue('--cmside-subtitle-lines')).toBe('');
    expect(subtitle.classList.contains('cmside-headline-subtitle-clipped')).toBe(false);
  });

  it('uses an overlay ellipsis when the card frame cuts the subtitle', () => {
    const node = card(`<h1>T</h1>${note('n1', 'P01 | Cat', '<p>long</p>')}`);
    enable();
    const subtitle = node.querySelector('#n1') as HTMLElement;
    const root = node.querySelector('.cmside-headline-root') as HTMLElement;
    box(subtitle, 80, 80);
    subtitle.getBoundingClientRect = () => ({ top: 0, bottom: 200, height: 200, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) });
    node.getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) });
    syncSubtitleEllipsis(subtitle);
    expect(root.classList.contains('cmside-headline-subtitle-clipped')).toBe(true);
    expect(subtitle.classList.contains('cmside-headline-subtitle-clipped')).toBe(false);
  });

  it('clears the ellipsis when headline mode is removed', () => {
    const node = card(`<h1>T</h1>${note('n1', 'P01 | Cat')}`);
    enable();
    const subtitle = node.querySelector('#n1') as HTMLElement;
    box(subtitle, 40, 120);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ lineHeight: '20px' } as CSSStyleDeclaration);
    syncSubtitleEllipsis(subtitle);
    removeHeadlineMode();
    expect(subtitle.style.getPropertyValue('--cmside-subtitle-lines')).toBe('');
    expect(document.querySelector('.cmside-headline-subtitle-clipped')).toBeNull();
  });
});

describe('headline mode styles', () => {
  it('ships the dashboard card styling scoped to headline mode', () => {
    // Every headline rule is scoped to body.cmside-headline-mode.
    const headlineRules = styles.split('}').filter(rule => rule.includes('cmside-headline') || rule.includes('cmside-hl-'));
    for (const rule of headlineRules) {
      expect(rule).toContain('body.cmside-headline-mode');
    }
    // Metadata row: blue rounded badge + muted category.
    expect(styles).toContain('.cmside-hl-badge');
    expect(styles).toMatch(/\.cmside-hl-badge \{[^}]*var\(--interactive-accent\)/);
    expect(styles).toMatch(/\.cmside-hl-badge \{[^}]*border-radius: 999px/);
    expect(styles).toMatch(/\.cmside-hl-category \{[^}]*var\(--text-muted\)/);
    // Headline: accent bar, bold, left aligned, clamped for long text.
    expect(styles).toMatch(/\.cmside-headline-title::before \{[^}]*var\(--interactive-accent\)/);
    expect(styles).toMatch(/\.cmside-headline-title \{[^}]*font-weight: 700/);
    expect(styles).toMatch(/\.cmside-headline-title \{[^}]*text-align: left/);
    expect(styles).toMatch(/\.cmside-headline-title \{[^}]*-webkit-line-clamp/);
    // Subtitle: muted, no callout chrome, multiline with a height cap.
    expect(styles).toMatch(/\.cmside-headline-note \{[^}]*background: transparent/);
    expect(styles).toMatch(/\.cmside-headline-note \{[^}]*color: var\(--text-muted\)/);
    expect(styles).toMatch(/\.cmside-headline-note \{[^}]*max-height: min\(40cqh/);
    // Long content is clipped inside the card instead of painting outside it.
    expect(styles).toMatch(/\.cmside-headline-root, [^{]*\{[^}]*overflow: hidden/);
    expect(styles).toMatch(/\.cmside-headline-note \{[^}]*overflow: hidden/);
    expect(styles).toContain('-webkit-line-clamp: var(--cmside-subtitle-lines, 99)');
    expect(styles).toMatch(/cmside-headline-subtitle-clipped::after \{[^}]*content: "…"/);
    expect(styles).toMatch(/\.cmside-hl-meta \{[^}]*gap: 1\.15em/);
    expect(styles).toMatch(/\.cmside-headline-note \{[^}]*margin: clamp\(4px, 1cqmin, 12px\) 0 0/);
    expect(styles).toMatch(/\.cmside-headline-root \{[^}]*padding: clamp\(8px, 1\.4cqmin, 14px\) 4\.5%/);
    expect(styles).toContain('.cmside-headline-note > .callout-title');
    // Card surface + zoom-safe sizing (container queries) are preserved.
    expect(styles).toMatch(/\.cmside-headline-root \{[^}]*var\(--background-secondary\)/);
    expect(styles).toContain('container-type: size');
    expect(styles).toContain('.canvas-node-placeholder');
    // Each tier reads its own independent size variable on a shared scale.
    expect(styles).toMatch(/\.cmside-headline-note \{[^}]*--cmside-subtitle-size[^}]*0\.6cqmin/);
    expect(styles).toMatch(/\.cmside-hl-badge \{[^}]*--cmside-badge-size[^}]*0\.6cqmin/);
    expect(styles).toMatch(/\.cmside-hl-category \{[^}]*--cmside-category-size[^}]*0\.6cqmin/);
    expect(styles).not.toContain('--cmside-note-size');
  });
});

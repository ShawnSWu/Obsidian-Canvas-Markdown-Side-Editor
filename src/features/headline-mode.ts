// Headline mode renders every Canvas text/file card as a compact dashboard
// card driven entirely by the rendered Markdown:
//   row 1: optional identifier badge + category (from the Note callout title)
//   row 2: the first H1 as the main headline with a blue accent bar
//   row 3: the Note callout body as a muted multiline subtitle
// The Markdown source is never modified. The feature marks Obsidian's own
// rendered DOM (its Markdown parser is the source of truth) and injects one
// metadata row per card; CSS handles visibility and the dashboard styling.
import { DEFAULT_SETTINGS, HEADLINE_SIZE_LIMITS, type CanvasMdSideEditorSettings } from '../settings';

const HEADLINE_BODY_CLASS = 'cmside-headline-mode';
const H1_SIZE_VAR = '--cmside-h1-size';
const BADGE_SIZE_VAR = '--cmside-badge-size';
const CATEGORY_SIZE_VAR = '--cmside-category-size';
const SUBTITLE_SIZE_VAR = '--cmside-subtitle-size';
const ROOT_CLASS = 'cmside-headline-root';
const TITLE_CLASS = 'cmside-headline-title';
const NOTE_CLASS = 'cmside-headline-note';
const PATH_CLASS = 'cmside-headline-path';
const HAS_NOTE_CLASS = 'cmside-headline-has-note';
const EMPTY_CLASS = 'cmside-headline-empty';
// Applied to the selected title/note and every descendant so the hide rule
// can spare whole subtrees with simple selectors (no `:not(.x *)`, which
// some CSS engines parse unreliably).
const KEEP_CLASS = 'cmside-headline-keep';
const META_CLASS = 'cmside-hl-meta';
const BADGE_CLASS = 'cmside-hl-badge';
const CATEGORY_CLASS = 'cmside-hl-category';
// Set on a subtitle (or its card) only while text is actually cut off, so the
// CSS ellipsis does not show on short notes.
const CLIPPED_CLASS = 'cmside-headline-subtitle-clipped';
const SUBTITLE_LINES_VAR = '--cmside-subtitle-lines';

let observer: MutationObserver | null = null;
let clipObserver: ResizeObserver | null = null;
let clipFrame = 0;
const markedElements = new Map<Element, Set<string>>();
// Metadata rows injected into the rendered DOM, keyed by the card's preview
// root. Kept out of markedElements so a routine refresh does not remove and
// re-add them (which would retrigger the MutationObserver forever).
const injectedMeta = new Map<Element, HTMLElement>();

function mark(element: Element, className: string): void {
  element.classList.add(className);
  const classes = markedElements.get(element) ?? new Set<string>();
  classes.add(className);
  markedElements.set(element, classes);
}

function clearMarkers(): void {
  for (const [element, classes] of markedElements) {
    element.classList.remove(...classes);
  }
  markedElements.clear();
}

function markSubtree(element: Element, className: string): void {
  mark(element, className);
  for (const child of Array.from(element.children)) markSubtree(child, className);
}

// Split a Note callout title into an optional identifier and category at the
// first pipe: "P01 | 系統檢查" → { identifier: "P01", category: "系統檢查" }.
// Obsidian renders a titleless callout with its type name as the title
// (e.g. "Note"), and the rendered DOM cannot distinguish that default from an
// explicit title of the same text; treat it as "no title".
export function parseNoteTitle(rawTitle: string, calloutType = 'note'): { identifier: string; category: string } {
  const text = rawTitle.trim();
  if (!text || text.toLowerCase() === calloutType.trim().toLowerCase()) {
    return { identifier: '', category: '' };
  }
  const pipe = text.indexOf('|');
  if (pipe === -1) return { identifier: '', category: text };
  return { identifier: text.slice(0, pipe).trim(), category: text.slice(pipe + 1).trim() };
}

function isNestedInCallout(element: Element): boolean {
  return !!element.parentElement?.closest('.callout');
}

// The headline is the first top-level H1. The Note is the first [!note]
// callout that follows that H1 and precedes the next H1; Notes before the
// first H1, after the second H1, or nested inside another callout never
// qualify. Iteration follows the rendered DOM (document order), so selection
// matches Obsidian's own Markdown parsing instead of a fragile regex.
export function selectHeadlineParts(root: Element): { title: Element | null; note: Element | null } {
  let title: Element | null = null;
  for (const element of Array.from(root.querySelectorAll('h1, .callout[data-callout="note"]'))) {
    if (isNestedInCallout(element)) continue;
    if (element.matches('h1')) {
      if (title) break; // next H1: the window for the qualifying Note closed
      title = element;
    } else if (title) {
      return { title, note: element };
    }
  }
  return { title, note: null };
}

function syncMetaRow(root: Element, title: Element | null, note: Element | null): void {
  let meta = injectedMeta.get(root) ?? null;
  if (meta && !meta.isConnected) {
    injectedMeta.delete(root);
    meta = null;
  }
  const { identifier, category } = note
    ? parseNoteTitle(note.querySelector('.callout-title-inner')?.textContent ?? '', note.getAttribute('data-callout') ?? 'note')
    : { identifier: '', category: '' };
  if (!title || (!identifier && !category)) {
    if (meta) {
      meta.remove();
      injectedMeta.delete(root);
    }
    return;
  }
  if (!meta) {
    meta = document.createElement('div');
    meta.className = `${META_CLASS} ${KEEP_CLASS}`;
    const badge = document.createElement('span');
    badge.className = `${BADGE_CLASS} ${KEEP_CLASS}`;
    const label = document.createElement('span');
    label.className = `${CATEGORY_CLASS} ${KEEP_CLASS}`;
    meta.append(badge, label);
    title.before(meta);
    injectedMeta.set(root, meta);
  }
  // Only touch the DOM when the desired content actually changed: the
  // MutationObserver refires on our own edits, and no-op refreshes must
  // terminate.
  const badge = meta.firstElementChild as HTMLElement;
  const label = meta.lastElementChild as HTMLElement;
  if (badge.textContent !== identifier) badge.textContent = identifier;
  const badgeDisplay = identifier ? '' : 'none';
  if (badge.style.display !== badgeDisplay) badge.style.display = badgeDisplay;
  if (label.textContent !== category) label.textContent = category;
  const labelDisplay = category ? '' : 'none';
  if (label.style.display !== labelDisplay) label.style.display = labelDisplay;
}

// Show an ellipsis only when the subtitle is cut off. Font sizes stay at the
// slider values — this never shrinks text to make it fit.
// The line count is applied only while the note box is already smaller than
// its content, so clamping cannot shrink the box and retrigger measurement.
export function syncSubtitleEllipsis(note: HTMLElement): void {
  const card = note.closest('.canvas-node');
  const root = note.closest(`.${ROOT_CLASS}`);
  const noteRect = note.getBoundingClientRect();
  const cardClipped = card instanceof HTMLElement && noteRect.height > 0
    && noteRect.bottom > card.getBoundingClientRect().bottom + 1;
  if (root instanceof HTMLElement && root.classList.contains(CLIPPED_CLASS) !== cardClipped) {
    root.classList.toggle(CLIPPED_CLASS, cardClipped);
  }

  const available = note.clientHeight;
  const lineHeight = Number.parseFloat(getComputedStyle(note).lineHeight);
  const overflowing = note.scrollHeight > available + 1;
  const currentLines = Number(note.style.getPropertyValue(SUBTITLE_LINES_VAR));
  const canClamp = available > 0 && Number.isFinite(lineHeight) && lineHeight > 0;
  // Line-clamp draws the ellipsis on the last visible line. Skip it when the
  // card itself is the clip edge — that ellipsis would sit below the frame.
  if (!cardClipped && overflowing && canClamp) {
    const lines = Math.max(1, Math.floor(available / lineHeight));
    if (currentLines !== lines) note.style.setProperty(SUBTITLE_LINES_VAR, String(lines));
  } else if (!overflowing && Number.isFinite(currentLines) && currentLines > 0 && canClamp) {
    // Release the clamp only after the box grew enough to show another line.
    if (Math.floor(available / lineHeight) > currentLines) note.style.removeProperty(SUBTITLE_LINES_VAR);
  }
  // Overlay fallback when line-clamp cannot run (or the card frame is the clip).
  const clamped = note.style.getPropertyValue(SUBTITLE_LINES_VAR) !== '';
  const showNoteEllipsis = !cardClipped && overflowing && !clamped;
  if (note.classList.contains(CLIPPED_CLASS) !== showNoteEllipsis) {
    note.classList.toggle(CLIPPED_CLASS, showNoteEllipsis);
  }
}

function syncAllSubtitleEllipsis(): void {
  for (const note of Array.from(document.querySelectorAll(`.${NOTE_CLASS}`))) {
    if (note instanceof HTMLElement) syncSubtitleEllipsis(note);
  }
  if (!clipObserver && typeof ResizeObserver !== 'undefined') {
    try {
      clipObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const target = entry.target;
          if (!(target instanceof Element)) continue;
          const note = target.classList.contains(NOTE_CLASS) ? target : target.querySelector(`.${NOTE_CLASS}`);
          if (note instanceof HTMLElement) syncSubtitleEllipsis(note);
        }
      });
    } catch {
      clipObserver = null;
    }
  }
  if (!clipObserver) return;
  clipObserver.disconnect();
  for (const card of Array.from(document.querySelectorAll('.canvas-node'))) {
    clipObserver.observe(card);
  }
}

function scheduleSubtitleEllipsis(): void {
  if (typeof requestAnimationFrame !== 'function') {
    syncAllSubtitleEllipsis();
    return;
  }
  if (clipFrame) cancelAnimationFrame(clipFrame);
  clipFrame = requestAnimationFrame(() => {
    clipFrame = 0;
    syncAllSubtitleEllipsis();
  });
}

function clearSubtitleEllipsis(): void {
  if (clipFrame) cancelAnimationFrame(clipFrame);
  clipFrame = 0;
  clipObserver?.disconnect();
  clipObserver = null;
  for (const element of Array.from(document.querySelectorAll(`.${NOTE_CLASS}, .${CLIPPED_CLASS}, .${ROOT_CLASS}`))) {
    element.classList.remove(CLIPPED_CLASS);
    if (element instanceof HTMLElement) element.style.removeProperty(SUBTITLE_LINES_VAR);
  }
}

function refreshCards(): void {
  clearMarkers();
  const roots = new Set<Element>();
  for (const card of Array.from(document.querySelectorAll('.canvas-node'))) {
    const root = card.querySelector('.markdown-preview-view, .markdown-rendered');
    if (!root) continue;
    roots.add(root);
    mark(root, ROOT_CLASS);
    const { title, note } = selectHeadlineParts(root);
    if (note) mark(root, HAS_NOTE_CLASS);
    if (!title) mark(root, EMPTY_CLASS);
    for (const [element, className] of [[title, TITLE_CLASS], [note, NOTE_CLASS]] as const) {
      if (!element) continue;
      markSubtree(element, KEEP_CLASS);
      mark(element, className);
      // Obsidian may wrap individual Markdown blocks in separate sections.
      // Keep only the ancestors needed to reach the selected rendered blocks.
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        mark(parent, PATH_CLASS);
      }
    }
    syncMetaRow(root, title, note);
  }
  // Drop metadata rows whose card was removed from the Canvas.
  for (const [root, meta] of injectedMeta) {
    if (!roots.has(root) || !meta.isConnected) {
      meta.remove();
      injectedMeta.delete(root);
    }
  }
  scheduleSubtitleEllipsis();
}

function affectsCanvas(record: MutationRecord): boolean {
  if (record.target instanceof Element && record.target.closest('.canvas-node')) return true;
  return [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some(node =>
    node instanceof Element && (node.matches('.canvas-node') || !!node.querySelector('.canvas-node'))
  );
}

export function applyHeadlineMode(settings: CanvasMdSideEditorSettings): void {
  if (!settings.headlineMode) {
    removeHeadlineMode();
  } else {
    document.body.classList.add(HEADLINE_BODY_CLASS);
    refreshCards();
    if (!observer) {
      observer = new MutationObserver(records => {
        if (records.some(affectsCanvas)) refreshCards();
      });
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-callout'],
      });
    }
  }
  const h1 = clampHeadlineSize(settings.headlineH1Size, DEFAULT_SETTINGS.headlineH1Size ?? 25, HEADLINE_SIZE_LIMITS.headlineH1Size.min, HEADLINE_SIZE_LIMITS.headlineH1Size.max);
  const badge = clampHeadlineSize(settings.headlineBadgeSize, DEFAULT_SETTINGS.headlineBadgeSize ?? 16, HEADLINE_SIZE_LIMITS.headlineBadgeSize.min, HEADLINE_SIZE_LIMITS.headlineBadgeSize.max);
  const category = clampHeadlineSize(settings.headlineCategorySize, DEFAULT_SETTINGS.headlineCategorySize ?? 18, HEADLINE_SIZE_LIMITS.headlineCategorySize.min, HEADLINE_SIZE_LIMITS.headlineCategorySize.max);
  const subtitle = clampHeadlineSize(settings.headlineSubtitleSize, DEFAULT_SETTINGS.headlineSubtitleSize ?? 11, HEADLINE_SIZE_LIMITS.headlineSubtitleSize.min, HEADLINE_SIZE_LIMITS.headlineSubtitleSize.max);
  document.body.style.setProperty(H1_SIZE_VAR, String(h1));
  document.body.style.setProperty(BADGE_SIZE_VAR, String(badge));
  document.body.style.setProperty(CATEGORY_SIZE_VAR, String(category));
  document.body.style.setProperty(SUBTITLE_SIZE_VAR, String(subtitle));
}

export function removeHeadlineMode(): void {
  observer?.disconnect();
  observer = null;
  clearSubtitleEllipsis();
  clearMarkers();
  for (const meta of injectedMeta.values()) meta.remove();
  injectedMeta.clear();
  document.body.classList.remove(HEADLINE_BODY_CLASS);
}

// Coerce a possibly-invalid stored size into a number inside [min, max],
// falling back to `fallback` for non-finite or missing values.
export function clampHeadlineSize(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

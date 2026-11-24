import React from 'react';

export interface MatchRange {
  start: number;
  end: number;
  isExactPhrase: boolean;
}

const CHAR_MAP: Record<string, string> = {
  'إ': 'ا',
  'أ': 'ا',
  'آ': 'ا',
  'ا': 'ا',
  'ي': 'ی',
  'ی': 'ی',
  'ى': 'ی',
  'ئ': 'ی',
  'ك': 'ک',
  'ک': 'ک',
  'ة': 'ه',
  'ه': 'ه',
  'ؤ': 'و',
  'و': 'و',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
};

function isDiacriticCode(code: number): boolean {
  // Arabic harakat U+064B..U+0652 and superscript alef U+0670
  return (code >= 0x064b && code <= 0x0652) || code === 0x0670;
}

function isSpaceOrZwnjCode(code: number): boolean {
  // ASCII whitespace (<= 0x20: space, tab, \n, \r), NBSP (0x00A0), ZWNJ/ZWJ/LRM/RLM (0x200B..0x200F)
  return code <= 0x20 || code === 0x00a0 || (code >= 0x200b && code <= 0x200f);
}

/**
 * Normalizes Persian, Arabic, digits, and whitespace for consistent keyword searching
 */
export function normalizePersianSearchText(text: string): string {
  if (!text) return '';
  let out = '';
  let lastWasSpace = true;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isDiacriticCode(code)) continue;
    if (isSpaceOrZwnjCode(code)) {
      if (!lastWasSpace) {
        out += ' ';
        lastWasSpace = true;
      }
      continue;
    }
    const ch = text[i];
    const mapped = CHAR_MAP[ch] ?? ch.toLowerCase();
    out += mapped;
    lastWasSpace = false;
  }

  return out.trim();
}

interface NormalizedSourceMap {
  norm: string;
  origStarts: number[];
  origEnds: number[];
}

function normalizeWithSourceMap(text: string): NormalizedSourceMap {
  let norm = '';
  const origStarts: number[] = [];
  const origEnds: number[] = [];
  let lastWasSpace = true;

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isDiacriticCode(code)) {
      if (origEnds.length > 0 && !lastWasSpace) {
        origEnds[origEnds.length - 1] = i + 1;
      }
      continue;
    }
    if (isSpaceOrZwnjCode(code)) {
      if (!lastWasSpace) {
        norm += ' ';
        origStarts.push(i);
        origEnds.push(i + 1);
        lastWasSpace = true;
      } else if (origEnds.length > 0 && norm.endsWith(' ')) {
        origEnds[origEnds.length - 1] = i + 1;
      }
      continue;
    }
    const ch = text[i];
    const mapped = CHAR_MAP[ch] ?? ch.toLowerCase();
    norm += mapped;
    origStarts.push(i);
    origEnds.push(i + 1);
    lastWasSpace = false;
  }

  if (norm.endsWith(' ')) {
    norm = norm.slice(0, -1);
    origStarts.pop();
    origEnds.pop();
  }

  return { norm, origStarts, origEnds };
}

function collectOccurrences(
  norm: string,
  needle: string,
  origStarts: number[],
  origEnds: number[],
  isExactPhrase: boolean,
  target: MatchRange[]
): number {
  if (!needle) return 0;
  let count = 0;
  let fromIndex = 0;
  const step = Math.max(1, needle.length);
  const limit = norm.length - needle.length;
  while (fromIndex <= limit) {
    const idx = norm.indexOf(needle, fromIndex);
    if (idx === -1) break;
    const endIdx = idx + needle.length - 1;
    const start = origStarts[idx];
    const end = origEnds[endIdx];
    if (start !== undefined && end !== undefined && end > start) {
      target.push({ start, end, isExactPhrase });
      count += 1;
    }
    fromIndex = idx + step;
  }
  return count;
}

function countNormalizedOccurrences(norm: string, needle: string): number {
  if (!norm || !needle || needle.length > norm.length) return 0;
  let count = 0;
  let fromIndex = 0;
  const step = Math.max(1, needle.length);
  const limit = norm.length - needle.length;
  while (fromIndex <= limit) {
    const idx = norm.indexOf(needle, fromIndex);
    if (idx === -1) break;
    count += 1;
    fromIndex = idx + step;
  }
  return count;
}

function countFieldHits(
  normText: string,
  normQuery: string,
  tokens: string[]
): { exactCount: number; totalCount: number } {
  if (!normText || !normQuery) return { exactCount: 0, totalCount: 0 };
  const exactCount = countNormalizedOccurrences(normText, normQuery);
  if (tokens.length <= 1) {
    return { exactCount, totalCount: exactCount };
  }
  let totalCount = exactCount;
  for (let i = 0; i < tokens.length; i++) {
    totalCount += countNormalizedOccurrences(normText, tokens[i]);
  }
  return { exactCount, totalCount };
}

function mergeMatchRanges(ranges: MatchRange[]): MatchRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: MatchRange[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const prev = merged[merged.length - 1];
    if (curr.start < prev.end) {
      prev.end = Math.max(prev.end, curr.end);
      prev.isExactPhrase = prev.isExactPhrase || curr.isExactPhrase;
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

export function findSearchMatchRanges(
  text: string,
  query: string
): { ranges: MatchRange[]; exactCount: number; totalCount: number } {
  if (!text || !query.trim()) {
    return { ranges: [], exactCount: 0, totalCount: 0 };
  }

  const normQuery = normalizePersianSearchText(query);
  if (!normQuery) {
    return { ranges: [], exactCount: 0, totalCount: 0 };
  }

  const tokens = Array.from(new Set(normQuery.split(' ').filter(Boolean)));
  const { norm, origStarts, origEnds } = normalizeWithSourceMap(text);
  if (!norm) {
    return { ranges: [], exactCount: 0, totalCount: 0 };
  }

  const rawRanges: MatchRange[] = [];
  const exactCount = collectOccurrences(
    norm,
    normQuery,
    origStarts,
    origEnds,
    true,
    rawRanges
  );

  if (tokens.length > 1) {
    for (const token of tokens) {
      collectOccurrences(norm, token, origStarts, origEnds, false, rawRanges);
    }
  }

  const merged = mergeMatchRanges(rawRanges);
  return {
    ranges: merged,
    exactCount,
    totalCount: merged.length,
  };
}

export interface SearchMatchAnalysis {
  matchedInTitle: boolean;
  matchedInContent: boolean;
  matchedInMeta: boolean;
  matchedInPage: boolean;
  isExactPhraseMatch: boolean;
  isMultiWord: boolean;
  titleMatchCount: number;
  contentMatchCount: number;
  relevanceScore: number;
  locations: string[];
}

export function analyzeSearchMatch(
  fields: {
    title: string;
    content: string;
    metaLabel?: string;
    pageLabel?: string;
  },
  query: string,
  preNormalized?: {
    title?: string;
    content?: string;
    meta?: string;
    page?: string;
  }
): SearchMatchAnalysis {
  const normQuery = normalizePersianSearchText(query);
  const tokens = normQuery ? Array.from(new Set(normQuery.split(' ').filter(Boolean))) : [];
  const isMultiWord = tokens.length > 1;

  const normTitle = preNormalized?.title ?? normalizePersianSearchText(fields.title || '');
  const normContent = preNormalized?.content ?? normalizePersianSearchText(fields.content || '');
  const normMeta = preNormalized?.meta ?? normalizePersianSearchText(fields.metaLabel || '');
  const normPage = preNormalized?.page ?? normalizePersianSearchText(fields.pageLabel || '');

  const titleRes = countFieldHits(normTitle, normQuery, tokens);
  const contentRes = countFieldHits(normContent, normQuery, tokens);
  const metaRes = normMeta ? countFieldHits(normMeta, normQuery, tokens) : { exactCount: 0, totalCount: 0 };
  const pageRes = normPage ? countFieldHits(normPage, normQuery, tokens) : { exactCount: 0, totalCount: 0 };

  const matchedInTitle = titleRes.totalCount > 0;
  const matchedInContent = contentRes.totalCount > 0;
  const matchedInMeta = metaRes.totalCount > 0;
  const matchedInPage = pageRes.totalCount > 0;

  const allTokensInTitle =
    tokens.length > 0 && tokens.every((t) => normTitle.includes(t));
  const exactInTitle = titleRes.exactCount > 0 || (tokens.length === 1 && matchedInTitle);
  const exactInContent = contentRes.exactCount > 0 || (tokens.length === 1 && matchedInContent);
  const exactInMeta = metaRes.exactCount > 0 || (tokens.length === 1 && matchedInMeta);
  const isExactPhraseMatch = exactInTitle || exactInContent || exactInMeta;

  let relevanceScore = 0;
  if (exactInTitle) relevanceScore += 1000;
  if (allTokensInTitle) relevanceScore += 500;
  else if (matchedInTitle) relevanceScore += 220;
  if (exactInContent) relevanceScore += 350;
  else if (matchedInContent) relevanceScore += 100;
  if (exactInMeta) relevanceScore += 150;
  else if (matchedInMeta) relevanceScore += 60;
  if (matchedInPage) relevanceScore += 40;
  relevanceScore += Math.min(titleRes.totalCount, 10) * 15;
  relevanceScore += Math.min(contentRes.totalCount, 25) * 6;
  if (normTitle === normQuery) relevanceScore += 600;
  if (normMeta === normQuery) relevanceScore += 200;

  const locations: string[] = [];
  if (matchedInTitle) locations.push('عنوان');
  if (matchedInContent) {
    locations.push(
      contentRes.totalCount > 1
        ? `متن (${contentRes.totalCount} مورد)`
        : 'متن'
    );
  }
  if (matchedInMeta) locations.push('نام فایل/پوشه');
  if (matchedInPage) locations.push('صفحه');

  return {
    matchedInTitle,
    matchedInContent,
    matchedInMeta,
    matchedInPage,
    isExactPhraseMatch,
    isMultiWord,
    titleMatchCount: titleRes.totalCount,
    contentMatchCount: contentRes.totalCount,
    relevanceScore,
    locations,
  };
}

/**
 * Extracts a focused snippet around the best search match when the match is buried deep in a long note
 */
export function buildSmartSearchSnippet(
  text: string,
  query: string,
  contextBefore = 48,
  contextAfter = 170
): string {
  if (!text) return '';
  if (!query.trim()) return text;

  const { ranges } = findSearchMatchRanges(text, query);
  if (ranges.length === 0) return text;

  // Prefer the first exact phrase match if one exists
  const bestRange = ranges.find((r) => r.isExactPhrase) || ranges[0];

  // If the best match is already near the start, keep natural beginning
  if (bestRange.start <= 75) {
    return text;
  }

  let start = Math.max(0, bestRange.start - contextBefore);
  // Snap backward to a clean word boundary if close
  if (start > 0) {
    const prevSpace = text.lastIndexOf(' ', start + 12);
    if (prevSpace !== -1 && prevSpace >= start - 16) {
      start = prevSpace + 1;
    }
  }

  const end = Math.min(text.length, bestRange.end + contextAfter);
  const snippet = text.slice(start, end).trimStart();
  return start > 0 ? `… ${snippet}` : snippet;
}

/**
 * Extracts all matching text passages/excerpts for text-only search view (no cards, no truncation of hits).
 */
export function extractMatchingExcerpts(
  text: string,
  query: string,
  options?: {
    maxFullTextLength?: number;
    contextBefore?: number;
    contextAfter?: number;
    maxExcerpts?: number;
  }
): { excerpts: string[]; totalMatches: number; hiddenExcerptCount: number } {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    return { excerpts: [], totalMatches: 0, hiddenExcerptCount: 0 };
  }

  const maxFullTextLength = options?.maxFullTextLength ?? 450;
  const contextBefore = options?.contextBefore ?? 75;
  const contextAfter = options?.contextAfter ?? 160;
  const maxExcerpts = options?.maxExcerpts ?? 8;

  if (!query.trim()) {
    return { excerpts: [cleanText], totalMatches: 0, hiddenExcerptCount: 0 };
  }

  const { ranges } = findSearchMatchRanges(cleanText, query);
  if (ranges.length === 0) {
    // Match occurred in title/metadata rather than content — return opening context
    if (cleanText.length <= 260) {
      return { excerpts: [cleanText], totalMatches: 0, hiddenExcerptCount: 0 };
    }
    const cutIdx = cleanText.lastIndexOf(' ', 250);
    const end = cutIdx > 120 ? cutIdx : 250;
    return {
      excerpts: [`${cleanText.slice(0, end).trimEnd()} …`],
      totalMatches: 0,
      hiddenExcerptCount: 0,
    };
  }

  // If the full note text is reasonably short, show all of it directly
  if (cleanText.length <= maxFullTextLength) {
    return {
      excerpts: [cleanText],
      totalMatches: ranges.length,
      hiddenExcerptCount: 0,
    };
  }

  // Build context windows around every match occurrence
  const windows: Array<{ start: number; end: number; hasExact: boolean }> = [];
  for (const r of ranges) {
    let start = Math.max(0, r.start - contextBefore);
    let end = Math.min(cleanText.length, r.end + contextAfter);

    // Snap start to nearby newline or word boundary
    if (start > 0) {
      const nlBefore = cleanText.lastIndexOf('\n', r.start);
      if (nlBefore !== -1 && nlBefore >= start - 45 && nlBefore < r.start) {
        start = nlBefore + 1;
      } else {
        const sp = cleanText.lastIndexOf(' ', start + 14);
        if (sp !== -1 && sp >= start - 20 && sp < r.start) {
          start = sp + 1;
        }
      }
    }

    // Snap end to nearby newline or word boundary
    if (end < cleanText.length) {
      const nlAfter = cleanText.indexOf('\n', r.end);
      if (nlAfter !== -1 && nlAfter <= end + 45 && nlAfter > r.end) {
        end = nlAfter;
      } else {
        const sp = cleanText.indexOf(' ', end - 14);
        if (sp !== -1 && sp <= end + 20) {
          end = sp;
        }
      }
    }

    windows.push({ start, end, hasExact: r.isExactPhrase });
  }

  // Merge overlapping or nearby windows
  const merged: Array<{ start: number; end: number; hasExact: boolean }> = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev && w.start <= prev.end + 45) {
      prev.end = Math.max(prev.end, w.end);
      prev.hasExact = prev.hasExact || w.hasExact;
    } else {
      merged.push({ ...w });
    }
  }

  // Prioritize exact phrase windows if we exceed maxExcerpts, preserving reading order
  let selected = merged;
  let hiddenExcerptCount = 0;
  if (merged.length > maxExcerpts) {
    const prioritized = [...merged]
      .map((w, index) => ({ w, index }))
      .sort((a, b) => Number(b.w.hasExact) - Number(a.w.hasExact) || a.index - b.index)
      .slice(0, maxExcerpts)
      .sort((a, b) => a.index - b.index)
      .map((item) => item.w);
    hiddenExcerptCount = merged.length - prioritized.length;
    selected = prioritized;
  }

  const excerpts = selected
    .map((w) => {
      const slice = cleanText.slice(w.start, w.end).trim();
      if (!slice) return '';
      const needsPrefix = w.start > 0 && cleanText[w.start - 1] !== '\n';
      const needsSuffix = w.end < cleanText.length && cleanText[w.end] !== '\n';
      return `${needsPrefix ? '… ' : ''}${slice}${needsSuffix ? ' …' : ''}`;
    })
    .filter(Boolean);

  return {
    excerpts,
    totalMatches: ranges.length,
    hiddenExcerptCount,
  };
}

interface HighlightedTextProps {
  text: string;
  query: string;
  exactClassName?: string;
  tokenClassName?: string;
}

export const HighlightedText: React.FC<HighlightedTextProps> = ({
  text,
  query,
  exactClassName = 'bg-amber-300/95 text-neutral-950 rounded-xs px-0.5 font-extrabold shadow-[0_0_0_1px_rgba(217,119,6,0.22)]',
  tokenClassName = 'bg-amber-200/85 text-neutral-950 rounded-xs px-0.5 font-semibold',
}) => {
  if (!text) return null;
  if (!query.trim()) return <>{text}</>;

  const { ranges } = findSearchMatchRanges(text, query);
  if (ranges.length === 0) return <>{text}</>;

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, idx) => {
    if (range.start > cursor) {
      parts.push(text.slice(cursor, range.start));
    }
    const matched = text.slice(range.start, range.end);
    parts.push(
      <mark
        key={`${range.start}-${idx}`}
        className={range.isExactPhrase ? exactClassName : tokenClassName}
      >
        {matched}
      </mark>
    );
    cursor = range.end;
  });

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <>{parts}</>;
};

/**
 * Safely highlights matched text inside rich HTML strings (only inside text nodes)
 */
export function highlightHtmlContent(html: string, query: string): string {
  if (!html || !query.trim() || typeof DOMParser === 'undefined') {
    return html;
  }

  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      const parentTag = current.parentElement?.tagName;
      if (
        parentTag !== 'SCRIPT' &&
        parentTag !== 'STYLE' &&
        parentTag !== 'MARK' &&
        current.nodeValue &&
        current.nodeValue.trim().length > 0
      ) {
        textNodes.push(current as Text);
      }
      current = walker.nextNode();
    }

    for (const node of textNodes) {
      const value = node.nodeValue || '';
      const { ranges } = findSearchMatchRanges(value, query);
      if (ranges.length === 0) continue;

      const frag = doc.createDocumentFragment();
      let cursor = 0;

      for (const range of ranges) {
        if (range.start > cursor) {
          frag.appendChild(doc.createTextNode(value.slice(cursor, range.start)));
        }
        const mark = doc.createElement('mark');
        mark.className = range.isExactPhrase
          ? 'bg-amber-300/95 text-neutral-950 rounded-xs px-0.5 font-extrabold'
          : 'bg-amber-200/85 text-neutral-950 rounded-xs px-0.5 font-semibold';
        mark.setAttribute('data-search-hit', 'true');
        mark.textContent = value.slice(range.start, range.end);
        frag.appendChild(mark);
        cursor = range.end;
      }

      if (cursor < value.length) {
        frag.appendChild(doc.createTextNode(value.slice(cursor)));
      }

      node.parentNode?.replaceChild(frag, node);
    }

    return doc.body.innerHTML;
  } catch {
    return html;
  }
}

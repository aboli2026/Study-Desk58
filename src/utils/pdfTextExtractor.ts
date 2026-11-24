import * as pdfjsLib from 'pdfjs-dist';

const RTL_CHAR_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN_CHAR_RE = /[A-Za-z]/g;
const PRESENTATION_FORM_RE = /[\uFB50-\uFDFF\uFE70-\uFEFF]/g;

export interface TextFragment {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  height: number;
  width: number;
  dir?: string;
}

/**
 * Normalizes Arabic/Persian presentation form glyphs (if emitted by older PDF generators)
 * while preserving ZWNJ (\u200C), Persian letters (ی, ک), and diacritics.
 */
export function normalizePdfTextCharacters(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(PRESENTATION_FORM_RE, (ch) => ch.normalize('NFKC'))
    .replace(/[\u200B\uFEFF]/g, '');
}

/**
 * Cleans up raw text obtained from PDF TextLayer selection or getTextContent
 * while preserving meaningful line breaks and Persian/English characters.
 */
export function normalizeExtractedPdfText(raw: string): string {
  if (!raw) return '';
  return normalizePdfTextCharacters(raw)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]{2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function countDirectionalChars(text: string): { rtl: number; ltr: number } {
  const rtlMatches = text.match(RTL_CHAR_RE);
  const ltrMatches = text.match(LATIN_CHAR_RE);
  return {
    rtl: rtlMatches ? rtlMatches.length : 0,
    ltr: ltrMatches ? ltrMatches.length : 0,
  };
}

function determineLineIsRtl<T extends { text: string; dir?: string }>(
  items: T[],
  docIsRtl: boolean
): boolean {
  let rtl = 0;
  let ltr = 0;
  for (const item of items) {
    const counts = countDirectionalChars(item.text);
    rtl += counts.rtl;
    ltr += counts.ltr;
  }
  if (rtl > 0 && rtl >= ltr) return true;
  if (ltr > 0 && rtl === 0) return false;
  if (ltr > rtl * 2) return false;
  return docIsRtl;
}

function isPureLatinToken(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const counts = countDirectionalChars(trimmed);
  return counts.ltr > 0 && counts.rtl === 0;
}

function isNeutralLtrConnector(text: string): boolean {
  const trimmed = text.trim();
  return /^[0-9.,:/@_\-+=&%#]+$/.test(trimmed);
}

function isPureRtlToken(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const counts = countDirectionalChars(trimmed);
  return counts.rtl > 0 && counts.ltr === 0;
}

interface VisualLine<T extends TextFragment> {
  items: T[];
  avgCenterY: number;
  avgHeight: number;
  minTop: number;
  maxBottom: number;
}

export function groupFragmentsIntoVisualLines<T extends TextFragment>(
  fragments: T[]
): VisualLine<T>[] {
  const valid = fragments.filter((f) => {
    const clean = normalizePdfTextCharacters(f.text).trim();
    return clean.length > 0;
  });

  if (valid.length === 0) return [];

  const sorted = [...valid].sort((a, b) => {
    const aY = (a.top + a.bottom) / 2;
    const bY = (b.top + b.bottom) / 2;
    return aY - bY;
  });

  const lines: VisualLine<T>[] = [];

  for (const frag of sorted) {
    const fragCenterY = (frag.top + frag.bottom) / 2;
    const fragHeight = Math.max(frag.height, frag.bottom - frag.top, 6);

    let matchedLine: VisualLine<T> | null = null;
    let bestYDiff = Infinity;

    for (const line of lines) {
      const refHeight = Math.max(fragHeight, line.avgHeight);
      const yDiff = Math.abs(fragCenterY - line.avgCenterY);
      const overlap =
        Math.min(frag.bottom, line.maxBottom) - Math.max(frag.top, line.minTop);
      const minH = Math.min(fragHeight, line.avgHeight);

      if (
        (yDiff <= refHeight * 0.55 || (minH > 0 && overlap > minH * 0.35)) &&
        yDiff < bestYDiff
      ) {
        bestYDiff = yDiff;
        matchedLine = line;
      }
    }

    if (matchedLine) {
      const n = matchedLine.items.length;
      matchedLine.items.push(frag);
      matchedLine.avgCenterY = (matchedLine.avgCenterY * n + fragCenterY) / (n + 1);
      matchedLine.avgHeight = (matchedLine.avgHeight * n + fragHeight) / (n + 1);
      matchedLine.minTop = Math.min(matchedLine.minTop, frag.top);
      matchedLine.maxBottom = Math.max(matchedLine.maxBottom, frag.bottom);
    } else {
      lines.push({
        items: [frag],
        avgCenterY: fragCenterY,
        avgHeight: fragHeight,
        minTop: frag.top,
        maxBottom: frag.bottom,
      });
    }
  }

  lines.sort((a, b) => a.avgCenterY - b.avgCenterY);
  return lines;
}

export function orderLineFragments<T extends TextFragment>(
  items: T[],
  isRtlLine: boolean
): T[] {
  if (items.length <= 1) return [...items];

  if (isRtlLine) {
    // Visual right-to-left sorting by center X (descending)
    const ordered = [...items].sort((a, b) => {
      const aCX = (a.left + a.right) / 2;
      const bCX = (b.left + b.right) / 2;
      if (Math.abs(bCX - aCX) > 0.5) return bCX - aCX;
      return b.right - a.right;
    });

    // Reverse contiguous embedded Latin runs so English phrases read left-to-right
    let i = 0;
    while (i < ordered.length) {
      if (isPureLatinToken(ordered[i].text)) {
        let j = i;
        let lastLatinIdx = i;
        while (
          j + 1 < ordered.length &&
          (isPureLatinToken(ordered[j + 1].text) ||
            isNeutralLtrConnector(ordered[j + 1].text))
        ) {
          j++;
          if (isPureLatinToken(ordered[j].text)) {
            lastLatinIdx = j;
          }
        }
        if (lastLatinIdx > i) {
          const slice = ordered.slice(i, lastLatinIdx + 1).reverse();
          ordered.splice(i, lastLatinIdx - i + 1, ...slice);
        }
        i = lastLatinIdx + 1;
      } else {
        i++;
      }
    }

    return ordered;
  } else {
    // Visual left-to-right sorting by center X (ascending)
    const ordered = [...items].sort((a, b) => {
      const aCX = (a.left + a.right) / 2;
      const bCX = (b.left + b.right) / 2;
      if (Math.abs(aCX - bCX) > 0.5) return aCX - bCX;
      return a.left - b.left;
    });

    // Reverse contiguous embedded RTL runs so Persian phrases inside English read right-to-left
    let i = 0;
    while (i < ordered.length) {
      if (isPureRtlToken(ordered[i].text)) {
        let j = i;
        while (j + 1 < ordered.length && isPureRtlToken(ordered[j + 1].text)) {
          j++;
        }
        if (j > i) {
          const slice = ordered.slice(i, j + 1).reverse();
          ordered.splice(i, j - i + 1, ...slice);
        }
        i = j + 1;
      } else {
        i++;
      }
    }

    return ordered;
  }
}

function shouldInsertSpaceBetween(
  prevFrag: TextFragment,
  currFrag: TextFragment,
  currentLineOut: string,
  currText: string
): boolean {
  if (!currentLineOut || !currText) return false;
  if (/\s$/.test(currentLineOut) || /^\s/.test(currText)) return false;

  const trimmedCurr = currText.trim();
  const trimmedPrev = prevFrag.text.trim();
  if (!trimmedCurr || !trimmedPrev) return false;

  // Never insert space before or around standalone combining diacritics or ZWNJ
  if (/^[\u064B-\u065F\u0670\u200C]+$/.test(trimmedCurr)) return false;
  if (currentLineOut.endsWith('\u200C')) return false;

  const refHeight = Math.max(prevFrag.height, currFrag.height, 8);
  // Universal horizontal gap between two horizontally non-overlapping fragments
  const gap = Math.max(prevFrag.left - currFrag.right, currFrag.left - prevFrag.right);

  // Closing/trailing punctuation sticks directly to preceding word unless clearly separated
  if (/^[،؛.:!?؟)\]}»]+$/.test(trimmedCurr)) {
    return gap > refHeight * 0.45;
  }

  // Opening bracket/guillemet sticks to following word unless clearly separated
  if (/^[(\[{«]+$/.test(trimmedPrev)) {
    return gap > refHeight * 0.35;
  }

  // After punctuation like colon/comma/period, even a modest gap represents a word space
  if (/[،؛.:!?؟»)\]]$/.test(trimmedPrev)) {
    return gap > refHeight * 0.08;
  }

  // Standard geometric word-gap detection (handles justified Persian PDFs without space chars)
  return gap > refHeight * 0.11;
}

export function reconstructTextFromFragments(fragments: TextFragment[]): string {
  const lines = groupFragmentsIntoVisualLines(fragments);
  if (lines.length === 0) return '';

  let totalRtl = 0;
  let totalLtr = 0;
  for (const f of fragments) {
    const c = countDirectionalChars(f.text);
    totalRtl += c.rtl;
    totalLtr += c.ltr;
  }
  const docIsRtl = totalRtl >= totalLtr && totalRtl > 0;

  const outputLines: string[] = [];

  for (const line of lines) {
    const isRtlLine = determineLineIsRtl(line.items, docIsRtl);
    const ordered = orderLineFragments(line.items, isRtlLine);

    let lineText = '';
    let prevFrag: TextFragment | null = null;

    for (const frag of ordered) {
      const cleanStr = normalizePdfTextCharacters(frag.text).replace(/[ \t]{2,}/g, ' ');
      if (!cleanStr.trim()) continue;

      const trimmedPart = cleanStr.replace(/^[ \t]+|[ \t]+$/g, '');
      const hasLeadingSpace = /^[ \t]/.test(cleanStr);
      const hasTrailingSpace = /[ \t]$/.test(cleanStr);

      if (prevFrag) {
        if (
          hasLeadingSpace ||
          shouldInsertSpaceBetween(prevFrag, frag, lineText, trimmedPart)
        ) {
          if (!/\s$/.test(lineText)) {
            lineText += ' ';
          }
        }
      }

      lineText += trimmedPart;
      if (hasTrailingSpace && !/\s$/.test(lineText)) {
        lineText += ' ';
      }

      prevFrag = frag;
    }

    const finalLine = lineText.trim();
    if (finalLine) {
      outputLines.push(finalLine);
    }
  }

  return normalizeExtractedPdfText(outputLines.join('\n'));
}

/**
 * Reorders PDF.js TextLayer <span> elements in DOM into visual reading order
 * (preserving exact CSS left/top coordinates) so drag-selection never jumps
 * out of order to unrelated headers/lines.
 */
export function reorderTextLayerDom(textLayerEl: HTMLElement): void {
  const rawSpans = Array.from(
    textLayerEl.querySelectorAll<HTMLSpanElement>('span[role="presentation"]')
  );
  if (rawSpans.length === 0) return;

  type SpanFragment = TextFragment & { el: HTMLSpanElement };
  const spanFragments: SpanFragment[] = [];

  for (const span of rawSpans) {
    const text = normalizePdfTextCharacters(span.textContent || '');
    if (!text.trim()) continue;

    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;

    spanFragments.push({
      el: span,
      text,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      dir: span.dir || undefined,
    });
  }

  const lines = groupFragmentsIntoVisualLines(spanFragments);
  if (lines.length === 0) return;

  let totalRtl = 0;
  let totalLtr = 0;
  for (const sf of spanFragments) {
    const c = countDirectionalChars(sf.text);
    totalRtl += c.rtl;
    totalLtr += c.ltr;
  }
  const docIsRtl = totalRtl >= totalLtr && totalRtl > 0;

  const frag = document.createDocumentFragment();

  lines.forEach((line) => {
    const isRtlLine = determineLineIsRtl(line.items, docIsRtl);
    const ordered = orderLineFragments(line.items, isRtlLine);
    for (const item of ordered) {
      frag.appendChild(item.el);
    }
  });

  textLayerEl.innerHTML = '';
  textLayerEl.appendChild(frag);
}

export interface CaretPoint {
  node: Text;
  offset: number;
}

function getCaretRangeAtPoint(x: number, y: number): CaretPoint | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (
      x: number,
      y: number
    ) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
      return { node: pos.offsetNode as Text, offset: pos.offset };
    }
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    const r = doc.caretRangeFromPoint(x, y);
    if (r && r.startContainer && r.startContainer.nodeType === Node.TEXT_NODE) {
      return { node: r.startContainer as Text, offset: r.startOffset };
    }
  }

  return null;
}

/**
 * Resolves screen coordinates (clientX, clientY) to the exact (Text, offset) inside
 * a PDF TextLayer without ever falling back to container offsets (0 / childNodes.length)
 * when crossing gaps between words or lines.
 */
export function resolveCaretPointInTextLayer(
  textLayerEl: HTMLElement,
  clientX: number,
  clientY: number,
  maxDistancePx: number = 36
): CaretPoint | null {
  // 1. Fast path: if browser caret hit-test lands directly inside a TextLayer span
  const direct = getCaretRangeAtPoint(clientX, clientY);
  if (direct && textLayerEl.contains(direct.node)) {
    const parentSpan = direct.node.parentElement;
    if (parentSpan && parentSpan.getAttribute('role') === 'presentation') {
      const r = parentSpan.getBoundingClientRect();
      if (
        clientX >= r.left - 4 &&
        clientX <= r.right + 4 &&
        clientY >= r.top - 4 &&
        clientY <= r.bottom + 4
      ) {
        const len = direct.node.textContent?.length ?? 0;
        return {
          node: direct.node,
          offset: Math.max(0, Math.min(len, direct.offset)),
        };
      }
    }
  }

  // 2. Geometric nearest-line + nearest-span resolution
  const spans = Array.from(
    textLayerEl.querySelectorAll<HTMLSpanElement>('span[role="presentation"]')
  );
  if (spans.length === 0) return null;

  interface Candidate {
    span: HTMLSpanElement;
    textNode: Text;
    rect: DOMRect;
    dy: number;
    dx: number;
  }

  const candidates: Candidate[] = [];
  let minDy = Infinity;

  for (const span of spans) {
    const first = span.firstChild;
    if (!first || first.nodeType !== Node.TEXT_NODE) continue;
    const text = first.textContent || '';
    if (!text.trim()) continue;

    const rect = span.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) continue;

    const dy =
      clientY < rect.top
        ? rect.top - clientY
        : clientY > rect.bottom
        ? clientY - rect.bottom
        : 0;

    if (dy > maxDistancePx) continue;

    const dx =
      clientX < rect.left
        ? rect.left - clientX
        : clientX > rect.right
        ? clientX - rect.right
        : 0;

    if (dy < minDy) minDy = dy;
    candidates.push({ span, textNode: first as Text, rect, dy, dx });
  }

  if (candidates.length === 0) return null;

  // Pick spans belonging to the closest visual line band, then minimize horizontal distance
  let best: Candidate | null = null;
  let bestScore = Infinity;

  for (const c of candidates) {
    const lineTolerance = Math.max(4, c.rect.height * 0.45);
    if (c.dy > minDy + lineTolerance) continue;
    const score = c.dx + c.dy * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }

  if (!best) return null;
  if (best.dx > maxDistancePx * 1.5 && best.dy > maxDistancePx) return null;

  const text = best.textNode.textContent || '';
  const { rect } = best;
  const counts = countDirectionalChars(text);
  const isRtlSpan = counts.rtl >= counts.ltr && counts.rtl > 0;

  if (clientX <= rect.left) {
    return { node: best.textNode, offset: isRtlSpan ? text.length : 0 };
  }
  if (clientX >= rect.right) {
    return { node: best.textNode, offset: isRtlSpan ? 0 : text.length };
  }

  // Pointer is horizontally within this span's bounds: probe character inside span
  const clampedX = Math.max(rect.left + 1, Math.min(rect.right - 1, clientX));
  const clampedY = (rect.top + rect.bottom) / 2;
  const probed = getCaretRangeAtPoint(clampedX, clampedY);
  if (probed && probed.node === best.textNode) {
    return {
      node: best.textNode,
      offset: Math.max(0, Math.min(text.length, probed.offset)),
    };
  }

  const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clampedX - rect.left) / rect.width)) : 0;
  const approxOffset = isRtlSpan
    ? Math.round((1 - ratio) * text.length)
    : Math.round(ratio * text.length);

  return {
    node: best.textNode,
    offset: Math.max(0, Math.min(text.length, approxOffset)),
  };
}

/**
 * Extracts geometrically reconstructed text from the user's current browser Selection
 * inside a PDF TextLayer element.
 */
export function extractSelectedTextFromTextLayer(
  textLayerEl: HTMLElement,
  selection: Selection
): string {
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return '';
  const range = selection.getRangeAt(0);

  const spans = Array.from(
    textLayerEl.querySelectorAll<HTMLSpanElement>('span[role="presentation"]')
  );
  const fragments: TextFragment[] = [];

  for (const span of spans) {
    let intersects = false;
    try {
      intersects = range.intersectsNode(span);
    } catch {
      intersects = false;
    }
    if (!intersects) continue;

    const textNode = span.firstChild;
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
      const fallbackText = normalizePdfTextCharacters(span.textContent || '');
      if (!fallbackText.trim()) continue;
      const r = span.getBoundingClientRect();
      fragments.push({
        text: fallbackText,
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
        dir: span.dir || undefined,
      });
      continue;
    }

    const fullText = textNode.textContent || '';
    if (!fullText) continue;

    let startOffset = 0;
    let endOffset = fullText.length;

    if (range.startContainer === textNode) {
      startOffset = Math.max(0, Math.min(fullText.length, range.startOffset));
    } else if (range.startContainer === span) {
      startOffset = range.startOffset > 0 ? fullText.length : 0;
    } else if (span.contains(range.startContainer)) {
      startOffset = 0;
    }

    if (range.endContainer === textNode) {
      endOffset = Math.max(0, Math.min(fullText.length, range.endOffset));
    } else if (range.endContainer === span) {
      endOffset = range.endOffset === 0 ? 0 : fullText.length;
    }

    if (endOffset <= startOffset) continue;

    const selectedSlice = normalizePdfTextCharacters(fullText.slice(startOffset, endOffset));
    if (!selectedSlice.trim()) continue;

    let rect: DOMRect;
    if (startOffset === 0 && endOffset === fullText.length) {
      rect = span.getBoundingClientRect();
    } else {
      const subRange = document.createRange();
      subRange.setStart(textNode, startOffset);
      subRange.setEnd(textNode, endOffset);
      const subRect = subRange.getBoundingClientRect();
      rect =
        subRect.width > 0 || subRect.height > 0
          ? subRect
          : span.getBoundingClientRect();
    }

    if (rect.width <= 0 && rect.height <= 0) continue;

    fragments.push({
      text: selectedSlice,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      dir: span.dir || undefined,
    });
  }

  if (fragments.length === 0) {
    return normalizeExtractedPdfText(selection.toString());
  }

  return reconstructTextFromFragments(fragments);
}

/**
 * Extracts readable text from a single PDF page using PDF.js getTextContent()
 * and geometric line/BiDi reconstruction.
 */
export async function extractTextFromPdfPage(
  pdfDoc: pdfjsLib.PDFDocumentProxy,
  pageNumber: number
): Promise<string> {
  const page = await pdfDoc.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();
  const fragments: TextFragment[] = [];

  for (const rawItem of textContent.items) {
    if (!('str' in rawItem)) continue;
    const item = rawItem as {
      str: string;
      width?: number;
      height?: number;
      dir?: string;
      transform?: number[];
    };
    const str = normalizePdfTextCharacters(item.str || '');
    if (!str.trim() || !Array.isArray(item.transform)) continue;

    // Convert PDF space coordinates to top-left viewport coordinates
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.max(Math.hypot(tx[2], tx[3]), item.height || 0, 8);
    const itemWidth = Math.max(item.width || 0, 1);
    const left = tx[4];
    const right = left + itemWidth;
    const bottom = tx[5];
    const top = bottom - fontHeight;

    fragments.push({
      text: str,
      left,
      right,
      top,
      bottom,
      width: itemWidth,
      height: fontHeight,
      dir: item.dir,
    });
  }

  return reconstructTextFromFragments(fragments);
}

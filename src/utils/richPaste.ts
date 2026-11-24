/**
 * Utilities for cleaning, converting, and sanitizing ChatGPT / Markdown / HTML
 * content (especially tables) for RTL Persian study notes and sticky notes.
 */

const KNOWN_HTML_TAG_REGEX =
  /<\/?(?:p|div|br|table|thead|tbody|tfoot|tr|th|td|ul|ol|li|strong|b|em|i|u|s|del|mark|h[1-6]|blockquote|pre|code|span|a|hr|img)\b[^>]*>/i;

const BLOCK_HTML_TAG_REGEX =
  /<(?:p|div|table|ul|ol|h[1-6]|blockquote|pre|hr)\b/i;

export function containsHtmlTags(text: string): boolean {
  if (!text) return false;
  return KNOWN_HTML_TAG_REGEX.test(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Splits a Markdown table row by unescaped `|` characters.
 */
function splitMarkdownTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  // Remove trailing unescaped pipe
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
    trimmed = trimmed.slice(0, -1);
  }

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Checks if a line is a valid GFM Markdown table separator row like:
 * | --- | --- |  or  |:---|:---:|---:|  or  ---|---
 */
function isTableSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('|')) return false;

  const hasOuterPipes = trimmed.startsWith('|') && trimmed.endsWith('|');
  const cells = splitMarkdownTableRow(trimmed);
  if (cells.length === 0) return false;
  if (cells.length === 1 && !hasOuterPipes) return false;

  const allValidCells = cells.every((cell) => /^:?-{1,}:?$/.test(cell.trim()));
  if (!allValidCells) return false;

  // At least one cell should have 2+ dashes or multiple cells with dashes
  return cells.some((cell) => /-{2,}/.test(cell)) || cells.length >= 2;
}

function getColumnAlignments(separatorLine: string): Array<'center' | undefined> {
  const cells = splitMarkdownTableRow(separatorLine);
  return cells.map((cell) => {
    const t = cell.trim();
    if (t.startsWith(':') && t.endsWith(':')) return 'center';
    return undefined;
  });
}

function isTableHeaderCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.includes('|')) return false;
  if (/^#{1,6}\s+/.test(trimmed)) return false;
  if (/^```/.test(trimmed)) return false;
  return !isTableSeparatorRow(trimmed);
}

/**
 * Detects whether a plain-text string contains at least one Markdown table.
 */
export function hasMarkdownTable(text: string): boolean {
  if (!text || !text.includes('|')) return false;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (isTableHeaderCandidate(lines[i]) && isTableSeparatorRow(lines[i + 1])) {
      return true;
    }
  }
  return false;
}

/**
 * Formats inline Markdown (bold, italic, code, strikethrough, links, <br> inside cells)
 * into clean, safe HTML.
 */
function formatInlineMarkdown(raw: string, allowBrTag = false): string {
  if (!raw) return '';

  const BR_TOKEN = '\u0000STUDY_BR\u0000';
  let working = raw;
  if (allowBrTag) {
    working = working.replace(/<br\s*\/?>/gi, BR_TOKEN);
  }

  // Extract inline code segments first so markdown symbols inside `...` aren't parsed
  const codeTokens: string[] = [];
  working = working.replace(/`([^`]+)`/g, (_, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000CODE_${idx}\u0000`;
  });

  // Escape remaining HTML characters
  working = escapeHtml(working);

  // Links: [text](https://...)
  working = working.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Markdown images: ![alt](url) -> alt
  working = working.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');

  // Bold + Italic: ***text*** or ___text___
  working = working.replace(/(\*\*\*|___)(?=\S)(.+?)(?<=\S)\1/g, '<strong><em>$2</em></strong>');

  // Bold: **text** or __text__
  working = working.replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, '<strong>$2</strong>');

  // Strikethrough: ~~text~~
  working = working.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>');

  // Italic: *text* (only when non-space borders to avoid matching math like 2 * 3)
  working = working.replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, '<em>$1</em>');

  // Restore inline code tokens
  working = working.replace(/\u0000CODE_(\d+)\u0000/g, (_, idx) => codeTokens[Number(idx)] || '');

  if (allowBrTag) {
    working = working.replace(/\u0000STUDY_BR\u0000/g, '<br>');
  }

  return working;
}

function isBlockStartLine(lines: string[], index: number): boolean {
  const line = lines[index];
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^```/.test(trimmed)) return true;
  if (/^#{1,6}\s+/.test(trimmed)) return true;
  if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) return true;
  if (/^>\s?/.test(trimmed)) return true;
  if (/^\s*[-*+•]\s+/.test(line)) return true;
  if (/^\s*(?:\d+|[۰-۹]+)[.)]\s+/.test(line)) return true;
  if (
    index + 1 < lines.length &&
    isTableHeaderCandidate(line) &&
    isTableSeparatorRow(lines[index + 1])
  ) {
    return true;
  }
  return false;
}

/**
 * Checks if lines starting at `index` form a clean Tab-Separated Values (TSV) table.
 */
function detectTsvTable(lines: string[], index: number): { rows: string[][]; endIndex: number } | null {
  const first = lines[index];
  if (!first || !first.includes('\t') || first.startsWith('\t')) return null;

  const firstCols = first.split('\t').map((c) => c.trim());
  if (firstCols.length < 2 || firstCols.length > 12) return null;

  const rows: string[][] = [firstCols];
  let j = index + 1;
  while (j < lines.length) {
    const next = lines[j];
    if (!next || !next.includes('\t') || next.startsWith('\t')) break;
    const cols = next.split('\t').map((c) => c.trim());
    if (cols.length !== firstCols.length) break;
    rows.push(cols);
    j++;
  }

  if (rows.length < 2) return null;
  return { rows, endIndex: j };
}

function buildHtmlTable(
  headerCells: string[],
  bodyRows: string[][],
  alignments: Array<'center' | undefined> = []
): string {
  const maxCols = Math.max(
    headerCells.length,
    ...bodyRows.map((r) => r.length),
    1
  );

  const thHtml = Array.from({ length: maxCols }, (_, colIdx) => {
    const cellText = headerCells[colIdx] ?? '';
    const alignAttr = alignments[colIdx] === 'center' ? ' style="text-align: center;"' : '';
    return `<th${alignAttr}>${formatInlineMarkdown(cellText, true) || '&nbsp;'}</th>`;
  }).join('');

  const tbodyHtml = bodyRows
    .map((row) => {
      const tds = Array.from({ length: maxCols }, (_, colIdx) => {
        const cellText = row[colIdx] ?? '';
        const alignAttr = alignments[colIdx] === 'center' ? ' style="text-align: center;"' : '';
        return `<td${alignAttr}>${formatInlineMarkdown(cellText, true) || ''}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  return `<div class="study-table-wrap" dir="rtl"><table class="study-table" dir="rtl"><thead><tr>${thHtml}</tr></thead>${
    tbodyHtml ? `<tbody>${tbodyHtml}</tbody>` : ''
  }</table></div>`;
}

/**
 * Converts Markdown or plain text (such as ChatGPT responses with tables) into clean,
 * structured, RTL-ready HTML.
 */
export function markdownToCleanHtml(
  text: string,
  options?: { inlineIfSingleLine?: boolean }
): string {
  if (!text) return '';
  const normalized = text.replace(/\r\n?/g, '\n');

  // If pasting a single line without block syntax, return inline HTML so it inserts smoothly mid-sentence
  if (options?.inlineIfSingleLine && !normalized.includes('\n')) {
    const trimmed = normalized.trim();
    const isSingleLineBlock =
      /^#{1,6}\s+/.test(trimmed) ||
      /^>\s?/.test(trimmed) ||
      /^\s*[-*+•]\s+/.test(normalized) ||
      /^\s*(?:\d+|[۰-۹]+)[.)]\s+/.test(normalized) ||
      /^(?:---|\*\*\*|___)\s*$/.test(trimmed);

    if (!isSingleLineBlock) {
      return formatInlineMarkdown(normalized, false);
    }
  }

  const lines = normalized.split('\n');
  const htmlBlocks: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip blank lines
    if (!trimmed) {
      i++;
      continue;
    }

    // 1. Fenced code block ```...```
    if (/^```/.test(trimmed)) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && /^```/.test(lines[i].trim())) {
        i++;
      }
      htmlBlocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 2. Markdown Table
    if (
      i + 1 < lines.length &&
      isTableHeaderCandidate(line) &&
      isTableSeparatorRow(lines[i + 1])
    ) {
      const headerCells = splitMarkdownTableRow(line);
      const alignments = getColumnAlignments(lines[i + 1]);
      i += 2;

      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        const rowTrimmed = rowLine.trim();
        if (!rowTrimmed || !rowTrimmed.includes('|')) break;
        if (/^```/.test(rowTrimmed) || /^#{1,6}\s+/.test(rowTrimmed)) break;
        if (isTableSeparatorRow(rowTrimmed)) {
          i++;
          continue;
        }
        bodyRows.push(splitMarkdownTableRow(rowLine));
        i++;
      }

      htmlBlocks.push(buildHtmlTable(headerCells, bodyRows, alignments));
      continue;
    }

    // 3. TSV Table fallback (tab-separated rows without HTML)
    const tsvMatch = detectTsvTable(lines, i);
    if (tsvMatch) {
      const [header, ...body] = tsvMatch.rows;
      htmlBlocks.push(buildHtmlTable(header, body));
      i = tsvMatch.endIndex;
      continue;
    }

    // 4. Headings (# to ######)
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 4);
      const tag = level <= 2 ? 'h2' : 'h3';
      htmlBlocks.push(`<${tag}>${formatInlineMarkdown(headingMatch[2])}</${tag}>`);
      i++;
      continue;
    }

    // 5. Horizontal rule
    if (/^(?:---|\*\*\*|___)\s*$/.test(trimmed)) {
      htmlBlocks.push('<hr>');
      i++;
      continue;
    }

    // 6. Blockquote
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      htmlBlocks.push(
        `<blockquote>${quoteLines.map((l) => formatInlineMarkdown(l)).join('<br>')}</blockquote>`
      );
      continue;
    }

    // 7. Unordered list (- , * , + , • )
    if (/^\s*[-*+•]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*[-*+•]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*+•]\s+/, '');
        listItems.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      htmlBlocks.push(`<ul>${listItems.join('')}</ul>`);
      continue;
    }

    // 8. Ordered list (1. , 2. , ۱. )
    if (/^\s*(?:\d+|[۰-۹]+)[.)]\s+/.test(line)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\s*(?:\d+|[۰-۹]+)[.)]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*(?:\d+|[۰-۹]+)[.)]\s+/, '');
        listItems.push(`<li>${formatInlineMarkdown(itemText)}</li>`);
        i++;
      }
      htmlBlocks.push(`<ol>${listItems.join('')}</ol>`);
      continue;
    }

    // 9. Standard paragraph (collect consecutive non-block lines)
    const paraLines: string[] = [];
    while (i < lines.length && !isBlockStartLine(lines, i)) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      htmlBlocks.push(`<p>${paraLines.map((l) => formatInlineMarkdown(l)).join('<br>')}</p>`);
    } else {
      i++;
    }
  }

  return htmlBlocks.join('');
}

/**
 * Sanitizes pasted HTML (e.g. from ChatGPT dark-mode selection Ctrl+C, Docs, web pages)
 * by stripping foreign styles, dark backgrounds, classes, and UI buttons while preserving
 * clean tables, headings, lists, and text emphasis.
 */
export function sanitizePastedHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  if (typeof DOMParser === 'undefined') return rawHtml;

  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  // Remove noise / UI / unsafe elements
  const removeSelectors = [
    'script',
    'style',
    'meta',
    'link',
    'noscript',
    'iframe',
    'object',
    'embed',
    'button',
    'svg',
    'colgroup',
    'col',
    'input',
    'textarea',
    'select',
  ];
  doc.body.querySelectorAll(removeSelectors.join(',')).forEach((el) => el.remove());

  const cleanNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return escapeHtml(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const childrenHtml = Array.from(el.childNodes).map(cleanNode).join('');

    switch (tag) {
      case 'br':
        return '<br>';
      case 'hr':
        return '<hr>';
      case 'strong':
      case 'b':
        return childrenHtml ? `<strong>${childrenHtml}</strong>` : '';
      case 'em':
      case 'i':
        return childrenHtml ? `<em>${childrenHtml}</em>` : '';
      case 'u':
        return childrenHtml ? `<u>${childrenHtml}</u>` : '';
      case 's':
      case 'del':
      case 'strike':
        return childrenHtml ? `<del>${childrenHtml}</del>` : '';
      case 'mark':
        return childrenHtml ? `<mark>${childrenHtml}</mark>` : '';
      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return childrenHtml;
        }
        return childrenHtml ? `<code>${childrenHtml}</code>` : '';
      }
      case 'pre':
        return childrenHtml.trim() ? `<pre><code>${childrenHtml}</code></pre>` : '';
      case 'h1':
      case 'h2':
        return childrenHtml.trim() ? `<h2>${childrenHtml}</h2>` : '';
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return childrenHtml.trim() ? `<h3>${childrenHtml}</h3>` : '';
      case 'p': {
        const trimmed = childrenHtml.replace(/<br\s*\/?>/gi, '').trim();
        return trimmed ? `<p>${childrenHtml}</p>` : '';
      }
      case 'blockquote':
        return childrenHtml.trim() ? `<blockquote>${childrenHtml}</blockquote>` : '';
      case 'ul':
        return childrenHtml.trim() ? `<ul>${childrenHtml}</ul>` : '';
      case 'ol':
        return childrenHtml.trim() ? `<ol>${childrenHtml}</ol>` : '';
      case 'li':
        return childrenHtml.trim() ? `<li>${childrenHtml}</li>` : '';
      case 'a': {
        const href = el.getAttribute('href') || '';
        const isSafe = /^(https?:\/\/|mailto:)/i.test(href);
        if (!isSafe) return childrenHtml;
        return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${childrenHtml}</a>`;
      }
      case 'img': {
        const src = el.getAttribute('src') || '';
        const isSafe = /^(https?:\/\/|data:image\/)/i.test(src);
        if (!isSafe) return '';
        const alt = escapeHtml(el.getAttribute('alt') || 'تصویر');
        return `<img src="${escapeHtml(src)}" alt="${alt}" />`;
      }
      case 'table': {
        if (!childrenHtml.trim()) return '';
        return `<div class="study-table-wrap" dir="rtl"><table class="study-table" dir="rtl">${childrenHtml}</table></div>`;
      }
      case 'thead':
        return childrenHtml.trim() ? `<thead>${childrenHtml}</thead>` : '';
      case 'tbody':
        return childrenHtml.trim() ? `<tbody>${childrenHtml}</tbody>` : '';
      case 'tfoot':
        return childrenHtml.trim() ? `<tfoot>${childrenHtml}</tfoot>` : '';
      case 'tr':
        return childrenHtml.trim() ? `<tr>${childrenHtml}</tr>` : '';
      case 'th':
      case 'td': {
        const colspan = el.getAttribute('colspan');
        const rowspan = el.getAttribute('rowspan');
        let attrs = '';
        if (colspan && /^\d+$/.test(colspan) && Number(colspan) > 1) {
          attrs += ` colspan="${colspan}"`;
        }
        if (rowspan && /^\d+$/.test(rowspan) && Number(rowspan) > 1) {
          attrs += ` rowspan="${rowspan}"`;
        }
        // Unwrap single redundant <p> inside table cells for tighter cell spacing
        let cellInner = childrenHtml.trim();
        const singlePMatch = cellInner.match(/^<p>([\s\S]*)<\/p>$/i);
        if (singlePMatch && !/<p>/i.test(singlePMatch[1])) {
          cellInner = singlePMatch[1];
        }
        return `<${tag}${attrs}>${cellInner}</${tag}>`;
      }
      case 'div':
      case 'section':
      case 'article': {
        if (!childrenHtml.trim()) return '';
        // If this div only wraps block elements (like ChatGPT's _tableContainer or _tableWrapper), unwrap it
        const hasBlockChild = Array.from(el.children).some((child) =>
          /^(div|p|table|ul|ol|h[1-6]|blockquote|pre|section|article)$/i.test(child.tagName)
        );
        if (hasBlockChild) {
          return childrenHtml;
        }
        return `<p>${childrenHtml}</p>`;
      }
      case 'span':
      default:
        return childrenHtml;
    }
  };

  return Array.from(doc.body.childNodes).map(cleanNode).join('');
}

/**
 * Extracts clean, table-preserving HTML from clipboard paste event data.
 * Handles both ChatGPT "Copy" button (Markdown in text/plain) and browser
 * selection Ctrl+C (HTML tables in text/html).
 */
export function extractCleanHtmlFromClipboard(
  clipboardData: DataTransfer | null | undefined
): { html: string; isInline: boolean } | null {
  if (!clipboardData) return null;

  const plainText = clipboardData.getData('text/plain') || '';
  const htmlData = clipboardData.getData('text/html') || '';

  const htmlHasTable = /<table\b/i.test(htmlData);
  const plainHasMarkdownTable = hasMarkdownTable(plainText);

  // If plain text contains a Markdown table and HTML doesn't have an actual <table>
  // (e.g., copying Markdown from ChatGPT Copy button or a code/text viewer), parse Markdown!
  if (plainHasMarkdownTable && !htmlHasTable) {
    const html = markdownToCleanHtml(plainText, { inlineIfSingleLine: true });
    return { html, isInline: !BLOCK_HTML_TAG_REGEX.test(html) };
  }

  // If HTML has rich structure (tables, lists, headings, bold, etc.)
  if (htmlData && /<(?:table|ul|ol|h[1-6]|strong|b|em|i|blockquote|pre|p|div)\b/i.test(htmlData)) {
    // Check if HTML is just a plain wrapper around Markdown syntax (e.g., <span>**bold**</span> or <pre>| a | b |</pre>)
    const sanitized = sanitizePastedHtml(htmlData);
    const stripped = htmlToCleanPlainText(sanitized);

    // If sanitized HTML has no real formatting tags/tables and plainText looks like Markdown, use Markdown parser
    const hasMeaningfulHtmlStructure = /<(?:table|ul|ol|h[1-6]|strong|em|blockquote)\b/i.test(sanitized);
    if (!hasMeaningfulHtmlStructure && plainText && hasMarkdownSyntax(plainText)) {
      const mdHtml = markdownToCleanHtml(plainText, { inlineIfSingleLine: true });
      return { html: mdHtml, isInline: !BLOCK_HTML_TAG_REGEX.test(mdHtml) };
    }

    if (sanitized.trim()) {
      return {
        html: sanitized,
        isInline: !BLOCK_HTML_TAG_REGEX.test(sanitized),
      };
    }

    if (stripped) {
      const mdHtml = markdownToCleanHtml(stripped, { inlineIfSingleLine: true });
      return { html: mdHtml, isInline: !BLOCK_HTML_TAG_REGEX.test(mdHtml) };
    }
  }

  if (plainText) {
    const html = markdownToCleanHtml(plainText, { inlineIfSingleLine: true });
    return { html, isInline: !BLOCK_HTML_TAG_REGEX.test(html) };
  }

  return null;
}

function hasMarkdownSyntax(text: string): boolean {
  if (!text) return false;
  return (
    hasMarkdownTable(text) ||
    /^#{1,6}\s+/m.test(text) ||
    /\*\*[^*]+\*\*/.test(text) ||
    /```[\s\S]*?```/.test(text) ||
    /^\s*[-*+]\s+/m.test(text) ||
    /^>\s+/m.test(text)
  );
}

/**
 * Normalizes stored sticky-note content (whether legacy plain text, raw Markdown table,
 * or saved HTML) into clean HTML for rendering & editing.
 */
export function normalizeStickyContentToHtml(content: string): string {
  if (!content) return '';

  if (containsHtmlTags(content)) {
    // Ensure any <table> inside existing HTML is wrapped in .study-table-wrap if not already
    if (/<table\b/i.test(content) && !content.includes('study-table-wrap')) {
      return sanitizePastedHtml(content);
    }
    return content;
  }

  // Legacy plain text or pasted Markdown (including broken Markdown tables!)
  return markdownToCleanHtml(content, { inlineIfSingleLine: false });
}

const PLAIN_TEXT_CACHE = new Map<string, string>();
const CLEAN_TITLE_CACHE = new Map<string, string>();
const MAX_TEXT_CACHE_SIZE = 2500;

function decodeBasicHtmlEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&zwnj;/gi, '\u200c')
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = parseInt(hex, 16);
      return Number.isFinite(n) ? String.fromCodePoint(n) : _;
    });
}

function fastNonTableHtmlToPlainText(content: string): string {
  const withStructure = content
    .replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(?:p|div|li|tr|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<\/(?:ul|ol)>/gi, '\n')
    .replace(/<\/(?:td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, '');

  return decodeBasicHtmlEntities(withStructure)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Converts HTML (including tables) or Markdown into clean, readable plain text
 * for card previews, search indexing, clipboard copy, and PDF annotations.
 */
export function htmlToCleanPlainText(content: string): string {
  if (!content) return '';

  const cached = PLAIN_TEXT_CACHE.get(content);
  if (cached !== undefined) return cached;

  const storeCache = (val: string): string => {
    if (PLAIN_TEXT_CACHE.size >= MAX_TEXT_CACHE_SIZE) {
      PLAIN_TEXT_CACHE.clear();
    }
    PLAIN_TEXT_CACHE.set(content, val);
    return val;
  };

  // If it's plain text with a Markdown table (no HTML tags), render cleanly without |---|---| divider clutter
  if (!containsHtmlTags(content)) {
    if (hasMarkdownTable(content)) {
      const lines = content.replace(/\r\n?/g, '\n').split('\n');
      return storeCache(
        lines
          .filter((line) => !isTableSeparatorRow(line))
          .map((line) => {
            if (line.trim().includes('|') && (line.trim().startsWith('|') || line.trim().endsWith('|'))) {
              return splitMarkdownTableRow(line).join(' | ');
            }
            return line;
          })
          .join('\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
      );
    }
    return storeCache(content.trim());
  }

  // Fast pure-string pass when there is no <table> (avoids hundreds of expensive DOMParser allocations)
  if (!/<table\b/i.test(content) || typeof DOMParser === 'undefined') {
    return storeCache(fastNonTableHtmlToPlainText(content));
  }

  const doc = new DOMParser().parseFromString(content, 'text/html');

  const extractBlock = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') return '\n';
    if (tag === 'hr') return '\n---\n';

    if (tag === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      const rowTexts = rows
        .map((tr) => {
          const cells = Array.from(tr.querySelectorAll('th, td')).map((cell) =>
            (cell.textContent || '').replace(/\s+/g, ' ').trim()
          );
          return cells.filter(Boolean).join('  |  ');
        })
        .filter(Boolean);
      return `\n${rowTexts.join('\n')}\n`;
    }

    const inner = Array.from(el.childNodes).map(extractBlock).join('');

    if (tag === 'li') {
      return `• ${inner.trim()}\n`;
    }
    if (/^(p|div|h[1-6]|blockquote|pre)$/.test(tag)) {
      return `${inner.trim()}\n`;
    }
    if (tag === 'ul' || tag === 'ol') {
      return `\n${inner}`;
    }

    return inner;
  };

  return storeCache(
    Array.from(doc.body.childNodes)
      .map(extractBlock)
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}

/**
 * Inserts clean HTML at the current caret/selection inside a contentEditable element,
 * ensuring the caret is never trapped inside a newly pasted table.
 */
export function insertCleanHtmlAtCursor(
  editor: HTMLElement,
  rawCleanHtml: string,
  isInline = false
): void {
  editor.focus();

  let htmlToInsert = rawCleanHtml;
  const endsWithTable = /<\/table>\s*<\/div>\s*$/i.test(htmlToInsert) || /<\/table>\s*$/i.test(htmlToInsert);
  if (!isInline && endsWithTable) {
    htmlToInsert += '<p><br></p>';
  }

  let inserted = false;
  try {
    inserted = document.execCommand('insertHTML', false, htmlToInsert);
  } catch {
    inserted = false;
  }

  if (!inserted) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const temp = document.createElement('div');
      temp.innerHTML = htmlToInsert;
      const frag = document.createDocumentFragment();
      let lastNode: Node | null = null;
      while (temp.firstChild) {
        lastNode = frag.appendChild(temp.firstChild);
      }
      range.insertNode(frag);
      if (lastNode) {
        const nextRange = document.createRange();
        nextRange.setStartAfter(lastNode);
        nextRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(nextRange);
      }
    } else {
      editor.innerHTML += htmlToInsert;
    }
  }
}

/**
 * Cleans Markdown artifacts from single-line titles.
 */
export function cleanPlainTitleText(text: string): string {
  if (!text) return '';
  const cached = CLEAN_TITLE_CACHE.get(text);
  if (cached !== undefined) return cached;

  const cleaned = text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, ''))
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (CLEAN_TITLE_CACHE.size >= MAX_TEXT_CACHE_SIZE) {
    CLEAN_TITLE_CACHE.clear();
  }
  CLEAN_TITLE_CACHE.set(text, cleaned);
  return cleaned;
}

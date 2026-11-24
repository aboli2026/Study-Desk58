import { ToolShortcuts } from '../types';

export const SHORTCUT_STORAGE_KEY = 'study_capsule_shortcuts';

export const DEFAULT_SHORTCUTS: Required<ToolShortcuts> = {
  hand: '1',
  select: '2',
  pen: '3',
  highlighter: '4',
  ruler: '5',
  eraser: '6',
  stickyNote: '7',
  quickNotes: '8',
};

export const TOOL_SHORTCUT_LABELS: Record<keyof ToolShortcuts, string> = {
  hand: 'ابزار دست',
  select: 'ابزار انتخاب',
  pen: 'قلم',
  highlighter: 'هایلایتر',
  ruler: 'خط‌کش',
  eraser: 'پاک‌کن',
  stickyNote: 'یادداشت چسبان',
  quickNotes: 'دفترچه یادداشت',
};

// Bidirectional QWERTY English <-> Persian keyboard mapping
export const EN_TO_FA_KEY_MAP: Record<string, string> = {
  q: 'ض',
  w: 'ص',
  e: 'ث',
  r: 'ق',
  t: 'ف',
  y: 'غ',
  u: 'ع',
  i: 'ه',
  o: 'خ',
  p: 'ح',
  '[': 'ج',
  ']': 'چ',
  a: 'ش',
  s: 'س',
  d: 'ی',
  f: 'ب',
  g: 'ل',
  h: 'ا',
  j: 'ت',
  k: 'ن',
  l: 'م',
  ';': 'ک',
  "'": 'گ',
  z: 'ظ',
  x: 'ط',
  c: 'ز',
  v: 'ر',
  b: 'ذ',
  n: 'د',
  m: 'پ',
  ',': 'و',
  '1': '۱',
  '2': '۲',
  '3': '۳',
  '4': '۴',
  '5': '۵',
  '6': '۶',
  '7': '۷',
  '8': '۸',
  '9': '۹',
  '0': '۰',
};

export const FA_TO_EN_KEY_MAP: Record<string, string> = Object.entries(EN_TO_FA_KEY_MAP).reduce(
  (acc, [en, fa]) => {
    acc[fa] = en;
    return acc;
  },
  {} as Record<string, string>
);

// Additional common Persian / Arabic variants & Arabic-Indic digits
FA_TO_EN_KEY_MAP['ي'] = 'd';
FA_TO_EN_KEY_MAP['ك'] = ';';
FA_TO_EN_KEY_MAP['آ'] = 'h';
FA_TO_EN_KEY_MAP['أ'] = 'h';
FA_TO_EN_KEY_MAP['إ'] = 'h';
FA_TO_EN_KEY_MAP['ژ'] = 'c';
FA_TO_EN_KEY_MAP['ؤ'] = 'r';
FA_TO_EN_KEY_MAP['ء'] = 'm';
FA_TO_EN_KEY_MAP['٠'] = '0';
FA_TO_EN_KEY_MAP['١'] = '1';
FA_TO_EN_KEY_MAP['٢'] = '2';
FA_TO_EN_KEY_MAP['٣'] = '3';
FA_TO_EN_KEY_MAP['٤'] = '4';
FA_TO_EN_KEY_MAP['٥'] = '5';
FA_TO_EN_KEY_MAP['٦'] = '6';
FA_TO_EN_KEY_MAP['٧'] = '7';
FA_TO_EN_KEY_MAP['٨'] = '8';
FA_TO_EN_KEY_MAP['٩'] = '9';

const CODE_SYMBOL_MAP: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Backquote: '`',
  Space: 'space',
};

const MODIFIER_OR_NON_ASSIGNABLE_KEYS = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'CapsLock',
  'Tab',
  'NumLock',
  'ScrollLock',
  'Escape',
  'Enter',
  'Backspace',
  'Delete',
  'ContextMenu',
  'Insert',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Dead',
]);

/**
 * Normalizes a stored shortcut string to canonical English lowercase / ASCII digit form
 */
export const normalizeShortcutValue = (raw?: string): string => {
  if (!raw) return '';
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return '';
  if (trimmed === ' ') return 'space';
  return FA_TO_EN_KEY_MAP[trimmed] || trimmed;
};

/**
 * Standardizes a keyboard event to a canonical Latin letter, ASCII digit, or function key
 */
export const normalizeShortcutKey = (
  e: Pick<KeyboardEvent, 'key' | 'code'>
): string => {
  if (e.code) {
    if (e.code.startsWith('Key') && e.code.length === 4) {
      return e.code.slice(3).toLowerCase();
    }
    if (e.code.startsWith('Digit') && e.code.length === 6) {
      return e.code.slice(5);
    }
    if (e.code.startsWith('Numpad') && /^Numpad\d$/.test(e.code)) {
      return e.code.slice(6);
    }
    if (/^F([1-9]|1[0-2])$/.test(e.code)) {
      return e.code.toLowerCase();
    }
    if (CODE_SYMBOL_MAP[e.code]) {
      return CODE_SYMBOL_MAP[e.code];
    }
  }
  return normalizeShortcutValue(e.key);
};

/**
 * Returns true if the pressed key event can be assigned as a tool shortcut
 */
export const isAssignableShortcutEvent = (
  e: Pick<KeyboardEvent, 'key' | 'code'>
): boolean => {
  if (MODIFIER_OR_NON_ASSIGNABLE_KEYS.has(e.key)) {
    return false;
  }
  const normalized = normalizeShortcutKey(e);
  if (!normalized) return false;
  if (/^f([1-9]|1[0-2])$/.test(normalized)) return true;
  if (normalized === 'space') return true;
  return normalized.length === 1;
};

/**
 * Matches a keyboard event against the configured shortcut across English, Persian & Numpad layouts
 */
export const isShortcutMatch = (
  e: Pick<KeyboardEvent, 'key' | 'code'>,
  targetKey?: string
): boolean => {
  if (!targetKey) return false;
  const target = normalizeShortcutValue(targetKey);
  if (!target) return false;

  const pressedKey = (e.key || '').toLowerCase();
  const pressedCode = (e.code || '').toLowerCase();
  const normEvent = normalizeShortcutKey(e);

  if (normEvent === target) return true;
  if (pressedKey === target) return true;
  if (pressedCode === `key${target}`) return true;
  if (pressedCode === `digit${target}` || pressedCode === `numpad${target}`) return true;

  const faEquiv = EN_TO_FA_KEY_MAP[target];
  if (faEquiv && pressedKey === faEquiv) return true;

  return false;
};

/**
 * Formats a shortcut key for user display (e.g. 'P (ح)', '1', 'F2')
 */
export const formatShortcutLabel = (key?: string): string => {
  if (!key) return '';
  const clean = normalizeShortcutValue(key);
  if (clean === 'space') return 'SPACE';
  const fa = EN_TO_FA_KEY_MAP[clean];
  if (fa && /^[a-z]$/.test(clean)) {
    return `${clean.toUpperCase()} (${fa})`;
  }
  return clean.toUpperCase();
};

/**
 * Sanitizes and merges shortcuts loaded from storage or backup
 */
export const sanitizeShortcuts = (
  raw?: Partial<ToolShortcuts> | null
): ToolShortcuts => {
  const merged: ToolShortcuts = {
    ...DEFAULT_SHORTCUTS,
    ...(raw || {}),
  };

  (Object.keys(DEFAULT_SHORTCUTS) as (keyof ToolShortcuts)[]).forEach((tool) => {
    const normalized = normalizeShortcutValue(merged[tool]);
    merged[tool] = normalized || DEFAULT_SHORTCUTS[tool];
  });

  return merged;
};

export interface DuplicateShortcutsInfo {
  byTool: Partial<Record<keyof ToolShortcuts, (keyof ToolShortcuts)[]>>;
  duplicates: {
    key: string;
    tools: (keyof ToolShortcuts)[];
  }[];
  hasDuplicates: boolean;
}

/**
 * Computes duplicate shortcut assignments across all configured tools
 */
export const getDuplicateShortcutsInfo = (
  shortcuts: ToolShortcuts
): DuplicateShortcutsInfo => {
  const toolKeys = Object.keys(DEFAULT_SHORTCUTS) as (keyof ToolShortcuts)[];
  const groups = new Map<string, (keyof ToolShortcuts)[]>();

  for (const tool of toolKeys) {
    const val = normalizeShortcutValue(shortcuts[tool] || DEFAULT_SHORTCUTS[tool]);
    if (!val) continue;
    const list = groups.get(val) || [];
    list.push(tool);
    groups.set(val, list);
  }

  const byTool: Partial<Record<keyof ToolShortcuts, (keyof ToolShortcuts)[]>> = {};
  const duplicates: { key: string; tools: (keyof ToolShortcuts)[] }[] = [];

  for (const [key, tools] of groups.entries()) {
    if (tools.length > 1) {
      duplicates.push({ key, tools });
      for (const tool of tools) {
        byTool[tool] = tools.filter((other) => other !== tool);
      }
    }
  }

  return {
    byTool,
    duplicates,
    hasDuplicates: duplicates.length > 0,
  };
};

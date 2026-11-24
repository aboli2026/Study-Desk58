import { StudyFile, extractTimestampFromAny } from '../types';

const PROGRESS_HISTORY_KEY = 'study_file_page_progress_v1';

export interface DayPageSnapshot {
  startPage: number;
  maxPage: number;
  lastPage: number;
  pageCount?: number;
}

export interface FileProgressHistoryRecord {
  fileId?: string;
  fileNameKey: string;
  pageCount?: number;
  lastSessionStartPage?: number;
  lastSessionEndPage?: number;
  latestSessionDayKey?: string;
  activeOpenId?: string;
  sessionPriorMaxPage?: number;
  days: Record<string, DayPageSnapshot>;
}

export interface FileReadingDelta {
  basePercent: number;
  deltaPercent: number;
  totalPercent: number;
  pagesAdvanced: number;
}

type HistoryStore = Record<string, FileProgressHistoryRecord>;

function toLocalDayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeFileNameKey(fileName?: string): string {
  return (fileName || '').trim().toLowerCase();
}

function readHistoryStore(): HistoryStore {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as HistoryStore) : {};
  } catch {
    return {};
  }
}

function writeHistoryStore(store: HistoryStore): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PROGRESS_HISTORY_KEY, JSON.stringify(store));
  } catch {
    // Ignore localStorage quota errors
  }
}

function findRecordKey(
  store: HistoryStore,
  fileId?: string,
  fileName?: string
): string | null {
  if (fileId && store[fileId]) return fileId;
  const nameKey = normalizeFileNameKey(fileName);
  if (nameKey) {
    for (const [k, rec] of Object.entries(store)) {
      if (rec?.fileNameKey === nameKey) return k;
    }
    if (store[`name::${nameKey}`]) return `name::${nameKey}`;
  }
  return null;
}

function getMaxRecordedPage(rec?: FileProgressHistoryRecord): number {
  if (!rec) return 0;
  let maxP = rec.lastSessionEndPage || 0;
  for (const snap of Object.values(rec.days || {})) {
    if (snap && snap.maxPage > maxP) maxP = snap.maxPage;
  }
  return maxP;
}

function getLatestPriorMaxPage(
  days: Record<string, DayPageSnapshot>,
  beforeDayKey: string
): number {
  let maxPrior = 0;
  for (const [dayKey, snap] of Object.entries(days)) {
    if (dayKey < beforeDayKey && snap && snap.maxPage > maxPrior) {
      maxPrior = snap.maxPage;
    }
  }
  return maxPrior;
}

function parseTimestampDayKey(dateStr?: string): string | null {
  if (!dateStr) return null;
  const ts = Date.parse(dateStr) || extractTimestampFromAny(undefined, dateStr);
  if (!ts || !Number.isFinite(ts) || ts <= 0) return null;
  return toLocalDayKey(new Date(ts));
}

/**
 * Records page progress for a file.
 * When `openSessionId` is provided (from active reading in OpenFileView),
 * advancing beyond the previous furthest page updates `lastSessionStartPage -> lastSessionEndPage`
 * so ONLY the latest study session's new pages are highlighted in green.
 */
export function recordFilePageProgress(params: {
  fileId?: string;
  fileName?: string;
  currentPage?: number;
  pageCount?: number;
  openSessionId?: string;
  baselinePage?: number;
  date?: Date;
}): void {
  const {
    fileId,
    fileName,
    currentPage,
    pageCount,
    openSessionId,
    baselinePage,
    date = new Date(),
  } = params;
  if (!currentPage || !Number.isFinite(currentPage) || currentPage < 1) return;
  if (!fileId && !fileName) return;

  const store = readHistoryStore();
  const existingKey = findRecordKey(store, fileId, fileName);
  const nameKey = normalizeFileNameKey(fileName);
  const targetKey = existingKey || fileId || `name::${nameKey}`;
  const dayKey = toLocalDayKey(date);

  const rec: FileProgressHistoryRecord = store[targetKey] || {
    fileId,
    fileNameKey: nameKey,
    pageCount: pageCount && pageCount > 0 ? pageCount : undefined,
    days: {},
  };

  if (fileId) rec.fileId = fileId;
  if (nameKey) rec.fileNameKey = nameKey;
  if (pageCount && pageCount > 0) rec.pageCount = pageCount;

  const prevFurthest =
    baselinePage && Number.isFinite(baselinePage) && baselinePage >= 1
      ? baselinePage
      : Math.max(1, getMaxRecordedPage(rec));

  // Update session-level latest study tracking (reversible if user scrolls back or discards peek)
  if (openSessionId) {
    if (rec.activeOpenId !== openSessionId) {
      rec.activeOpenId = openSessionId;
      rec.sessionPriorMaxPage = prevFurthest;
    }
    const sessionBase = Math.max(1, rec.sessionPriorMaxPage ?? prevFurthest);
    if (currentPage > sessionBase) {
      rec.lastSessionStartPage = sessionBase;
      rec.lastSessionEndPage = currentPage;
      rec.latestSessionDayKey = dayKey;
    } else {
      rec.lastSessionStartPage = sessionBase;
      rec.lastSessionEndPage = sessionBase;
    }
  } else {
    // Background / storage sync without active openSessionId: keep baseline aligned without inventing green delta
    if (rec.lastSessionEndPage === undefined || currentPage > rec.lastSessionEndPage) {
      rec.lastSessionStartPage = currentPage;
      rec.lastSessionEndPage = currentPage;
    }
  }

  // Also keep per-day history for WeeklyBarChart historical day inspection
  const existingDay = rec.days[dayKey];
  if (!existingDay) {
    const priorMax = getLatestPriorMaxPage(rec.days, dayKey);
    const dayStart = openSessionId
      ? priorMax > 0
        ? priorMax
        : Math.max(1, rec.sessionPriorMaxPage ?? prevFurthest)
      : currentPage;
    rec.days[dayKey] = {
      startPage: dayStart,
      maxPage: openSessionId
        ? Math.max(dayStart, rec.sessionPriorMaxPage ?? prevFurthest, currentPage)
        : currentPage,
      lastPage: currentPage,
      pageCount: pageCount && pageCount > 0 ? pageCount : rec.pageCount,
    };
  } else {
    if (openSessionId && rec.activeOpenId === openSessionId) {
      const sessionBase = Math.max(1, rec.sessionPriorMaxPage ?? existingDay.startPage);
      existingDay.maxPage = Math.max(existingDay.startPage, sessionBase, currentPage);
    } else {
      existingDay.maxPage = Math.max(existingDay.maxPage, currentPage);
    }
    existingDay.lastPage = currentPage;
    if (pageCount && pageCount > 0) existingDay.pageCount = pageCount;
  }

  store[targetKey] = rec;
  writeHistoryStore(store);
  if (openSessionId && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new Event('study_file_progress_updated'));
    } catch {}
  }
}

/**
 * Seeds a file's baseline when loaded in OpenFileView or hydrated in AnalyticsView
 * so pre-existing page progress is always treated as black base progress (0 green delta).
 */
export function seedFileBaselineIfNeeded(params: {
  fileId?: string;
  fileName?: string;
  savedPage?: number;
  pageCount?: number;
  lastModified?: string;
  uploadDate?: string;
  now?: Date;
}): void {
  const {
    fileId,
    fileName,
    savedPage,
    pageCount,
    lastModified,
    uploadDate,
    now = new Date(),
  } = params;

  if (!savedPage || !Number.isFinite(savedPage) || savedPage <= 1) return;
  if (!fileId && !fileName) return;

  const store = readHistoryStore();
  const existingKey = findRecordKey(store, fileId, fileName);
  const existingRec = existingKey ? store[existingKey] : undefined;

  if (
    existingRec &&
    existingRec.lastSessionEndPage !== undefined &&
    existingRec.lastSessionEndPage >= savedPage
  ) {
    return;
  }

  const todayKey = toLocalDayKey(now);
  const modDayKey = parseTimestampDayKey(lastModified);
  const uploadDayKey = parseTimestampDayKey(uploadDate);
  const priorDayKey =
    modDayKey && modDayKey < todayKey
      ? modDayKey
      : uploadDayKey && uploadDayKey < todayKey
      ? uploadDayKey
      : null;

  const nameKey = normalizeFileNameKey(fileName);
  const targetKey = existingKey || fileId || `name::${nameKey}`;
  const rec: FileProgressHistoryRecord = existingRec || {
    fileId,
    fileNameKey: nameKey,
    pageCount: pageCount && pageCount > 0 ? pageCount : undefined,
    days: {},
  };

  if (fileId) rec.fileId = fileId;
  if (nameKey) rec.fileNameKey = nameKey;
  if (pageCount && pageCount > 0) rec.pageCount = pageCount;

  // Baseline for existing progress: start === end === savedPage -> 0 green delta (black bar)
  rec.lastSessionStartPage = savedPage;
  rec.lastSessionEndPage = savedPage;

  if (Object.keys(rec.days).length === 0) {
    if (priorDayKey) {
      rec.days[priorDayKey] = {
        startPage: 1,
        maxPage: savedPage,
        lastPage: savedPage,
        pageCount: rec.pageCount,
      };
    } else {
      rec.days[todayKey] = {
        startPage: savedPage,
        maxPage: savedPage,
        lastPage: savedPage,
        pageCount: rec.pageCount,
      };
    }
  }

  store[targetKey] = rec;
  writeHistoryStore(store);
}

export function seedExistingFilesHistory(files: StudyFile[], now: Date = new Date()): void {
  if (!Array.isArray(files) || files.length === 0) return;
  for (const f of files) {
    if (f && f.currentPage && f.currentPage > 1) {
      seedFileBaselineIfNeeded({
        fileId: f.id,
        fileName: f.name,
        savedPage: f.currentPage,
        pageCount: f.pageCount,
        lastModified: f.lastModified,
        uploadDate: f.uploadDate,
        now,
      });
    }
  }
}

export function getFileReadingProgressDelta(params: {
  fileId?: string;
  fileName?: string;
  currentPage?: number;
  pageCount?: number;
  periodStartDayKey: string;
  periodEndDayKey: string;
  now?: Date;
}): FileReadingDelta | null {
  const {
    fileId,
    fileName,
    currentPage,
    pageCount,
    periodStartDayKey,
    periodEndDayKey,
    now = new Date(),
  } = params;

  if (!pageCount || pageCount <= 0) return null;

  const store = readHistoryStore();
  const key = findRecordKey(store, fileId, fileName);
  const rec = key ? store[key] : undefined;
  const fallbackPage = currentPage && currentPage > 0 ? currentPage : 1;
  const totalPercent = Math.min(100, Math.round((fallbackPage / pageCount) * 100));

  if (!rec) {
    return {
      basePercent: totalPercent,
      deltaPercent: 0,
      totalPercent,
      pagesAdvanced: 0,
    };
  }

  // Only highlight the latest study session's progress if it occurred inside this period
  const latestDay = rec.latestSessionDayKey;
  const startPage = rec.lastSessionStartPage ?? fallbackPage;
  const endPage = rec.lastSessionEndPage ?? fallbackPage;

  const isSingleDayInspection = periodStartDayKey === periodEndDayKey;
  const todayKey = toLocalDayKey(now);

  // If inspecting a specific historical day (not today) in WeeklyBarChart, inspect that day's snapshot only
  if (isSingleDayInspection && periodEndDayKey < todayKey) {
    const snap = rec.days[periodEndDayKey];
    if (!snap || snap.maxPage <= snap.startPage) {
      return {
        basePercent: totalPercent,
        deltaPercent: 0,
        totalPercent,
        pagesAdvanced: 0,
      };
    }
    const dayPages = snap.maxPage - snap.startPage;
    const dayEndPct = Math.min(100, Math.round((snap.maxPage / pageCount) * 100));
    const dayStartPct =
      snap.startPage <= 1 ? 0 : Math.min(dayEndPct, Math.round((snap.startPage / pageCount) * 100));
    const dayDelta = Math.max(0, dayEndPct - dayStartPct);
    return {
      basePercent: Math.max(0, dayEndPct - dayDelta),
      deltaPercent: dayDelta,
      totalPercent: dayEndPct,
      pagesAdvanced: dayPages,
    };
  }

  const latestInPeriod =
    Boolean(latestDay) &&
    latestDay! >= periodStartDayKey &&
    latestDay! <= periodEndDayKey;

  // Always anchor current progress to the file's real currentPage (same as LibraryView)
  // so peeking ahead at later pages never inflates totalPercent above actual Library progress.
  const effectiveEnd = Math.min(pageCount, fallbackPage);

  if (!latestInPeriod || effectiveEnd <= startPage || endPage <= startPage) {
    return {
      basePercent: totalPercent,
      deltaPercent: 0,
      totalPercent,
      pagesAdvanced: 0,
    };
  }

  const computedTotal = Math.min(100, Math.round((effectiveEnd / pageCount) * 100));
  const pagesAdvanced = Math.max(0, effectiveEnd - startPage);
  const rawBasePercent =
    startPage <= 1
      ? 0
      : Math.min(computedTotal, Math.round((startPage / pageCount) * 100));
  const deltaPercent = Math.max(0, computedTotal - rawBasePercent);
  const basePercent = Math.max(0, computedTotal - deltaPercent);

  return {
    basePercent,
    deltaPercent,
    totalPercent: computedTotal,
    pagesAdvanced,
  };
}

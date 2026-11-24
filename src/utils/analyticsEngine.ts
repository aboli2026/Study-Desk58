import {
  PomodoroSession,
  StudyFile,
  StudyTask,
  FileCategory,
  NoteItem,
  NoteFolder,
  extractTimestampFromAny,
  gregorianToJalali,
  jalaliToGregorian,
} from '../types';
import {
  getFileReadingProgressDelta,
  seedExistingFilesHistory,
} from './fileProgressHistory';

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

export interface NormalizedStudySession {
  id: string;
  type: string;
  durationMinutes: number;
  timestampMs: number;
  dayKey: string;
  fileName?: string;
  source?: 'pomodoro' | 'file' | 'app';
}

export interface PeriodComparison {
  hasEnoughData: boolean;
  previousMinutes: number;
  currentMinutes: number;
  diffMinutes: number;
  percentChange: number; // positive = increase, negative = decrease, 0 = same
  direction: 'up' | 'down' | 'same' | 'insufficient';
  label: string;
}

export interface GoalsSummary {
  completed: number;
  remaining: number;
  total: number;
  percent: number;
}

export interface SubjectProgressItem {
  key: string;
  title: string;
  categoryName?: string;
  categoryColor?: string;
  studyMinutes: number;
  sessionCount: number;
  sharePercent: number;
  currentPage?: number;
  pageCount?: number;
  readingPercent: number | null;
  readingBasePercent?: number;
  readingDeltaPercent?: number;
  pagesAdvanced?: number;
  notesCount: number;
  kind: 'file' | 'category' | 'general';
}

export interface DaySummaryRecord {
  dayKey: string;
  dateLabel: string;
  weekdayLabel: string;
  totalMinutes: number;
  sessionCount: number;
}

export interface AllTimeRecords {
  bestDay: DaySummaryRecord | null;
  longestSession: {
    durationMinutes: number;
    title: string;
    dateLabel: string;
  } | null;
  longestStreakDays: number;
  currentStreakDays: number;
}

export interface StudyTimeGoalSummary {
  achievedMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  percent: number;
  targetLabel: string;
}

export interface WeeklyDayBreakdown {
  dayKey: string;
  weekdayLabel: string;
  shortDateLabel: string;
  totalMinutes: number;
  sessionCount: number;
  goalPercent: number;
  completedTasks: number;
  totalTasks: number;
  remainingTasks: number;
  isToday: boolean;
  isFuture: boolean;
  subjects: SubjectProgressItem[];
}

export interface AnalyticsSnapshot {
  period: AnalyticsPeriod;
  periodLabel: string;
  dateRangeLabel: string;
  totalMinutes: number;
  sessionCount: number;
  averageDailyMinutes: number;
  elapsedDaysInPeriod: number;
  activeDaysCount: number;
  goals: GoalsSummary;
  timeGoal: StudyTimeGoalSummary;
  comparison: PeriodComparison;
  bestDay: DaySummaryRecord | null;
  subjects: SubjectProgressItem[];
  records: AllTimeRecords;
}

const SHAMSI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

const PERSIAN_WEEKDAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنج‌شنبه',
  'جمعه',
  'شنبه',
];

export function formatDigits(input: string | number): string {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function formatDurationFa(totalMinutes: number): string {
  const safeMinutes = Math.max(0, Math.round(totalMinutes));
  if (safeMinutes === 0) return '0 دقیقه';
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  if (hours === 0) return `${mins} دقیقه`;
  if (mins === 0) return `${hours} ساعت`;
  return `${hours} ساعت و ${mins} دقیقه`;
}

export function formatNumberEn(num: number): string {
  return Math.round(num).toLocaleString('en-US');
}

export function toLocalDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function formatShamsiDateShort(date: Date): string {
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const monthName = SHAMSI_MONTH_NAMES[jm - 1] || '';
  return `${jd} ${monthName} ${jy}`;
}

export function formatWeekdayAndShamsi(date: Date): { weekday: string; shamsi: string } {
  const weekday = PERSIAN_WEEKDAYS[date.getDay()] || '';
  const [jy, jm, jd] = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  const monthName = SHAMSI_MONTH_NAMES[jm - 1] || '';
  return {
    weekday,
    shamsi: `${jd} ${monthName}`,
  };
}

function parseDayKeyToDate(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

function getShamsiMonthBounds(jy: number, jm: number): { startMs: number; endMs: number } {
  const [gyStart, gmStart, gdStart] = jalaliToGregorian(jy, jm, 1);
  const startDate = new Date(gyStart, gmStart - 1, gdStart, 0, 0, 0, 0);

  const nextJy = jm === 12 ? jy + 1 : jy;
  const nextJm = jm === 12 ? 1 : jm + 1;
  const [gyNext, gmNext, gdNext] = jalaliToGregorian(nextJy, nextJm, 1);
  const nextStartDate = new Date(gyNext, gmNext - 1, gdNext, 0, 0, 0, 0);

  return {
    startMs: startDate.getTime(),
    endMs: nextStartDate.getTime() - 1,
  };
}

export interface PeriodBoundaries {
  currentStartMs: number;
  currentEndMs: number;
  previousStartMs: number;
  previousEndMs: number;
  elapsedDays: number;
  dateRangeLabel: string;
  comparisonBaseLabel: string;
}

export function getPeriodBoundaries(period: AnalyticsPeriod, now: Date = new Date()): PeriodBoundaries {
  const todayStart = startOfLocalDay(now);
  const todayEnd = endOfLocalDay(now);

  if (period === 'daily') {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    return {
      currentStartMs: todayStart.getTime(),
      currentEndMs: todayEnd.getTime(),
      previousStartMs: startOfLocalDay(yesterday).getTime(),
      previousEndMs: endOfLocalDay(yesterday).getTime(),
      elapsedDays: 1,
      dateRangeLabel: `${PERSIAN_WEEKDAYS[now.getDay()]}، ${formatShamsiDateShort(now)}`,
      comparisonBaseLabel: 'روز قبل',
    };
  }

  if (period === 'weekly') {
    // Persian week: Saturday (index 0) -> Friday (index 6)
    const daysSinceSaturday = (now.getDay() + 1) % 7;
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - daysSinceSaturday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(weekStart.getTime() - 1);

    const startShamsi = formatWeekdayAndShamsi(weekStart);
    const endShamsi = formatWeekdayAndShamsi(weekEnd);

    return {
      currentStartMs: weekStart.getTime(),
      currentEndMs: endOfLocalDay(weekEnd).getTime(),
      previousStartMs: prevWeekStart.getTime(),
      previousEndMs: prevWeekEnd.getTime(),
      elapsedDays: daysSinceSaturday + 1,
      dateRangeLabel: `${startShamsi.shamsi} تا ${endShamsi.shamsi}`,
      comparisonBaseLabel: 'هفته قبل',
    };
  }

  if (period === 'monthly') {
    const [jy, jm, jd] = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const currentBounds = getShamsiMonthBounds(jy, jm);
    const prevJy = jm === 1 ? jy - 1 : jy;
    const prevJm = jm === 1 ? 12 : jm - 1;
    const prevBounds = getShamsiMonthBounds(prevJy, prevJm);
    const monthName = SHAMSI_MONTH_NAMES[jm - 1] || '';

    return {
      currentStartMs: currentBounds.startMs,
      currentEndMs: currentBounds.endMs,
      previousStartMs: prevBounds.startMs,
      previousEndMs: prevBounds.endMs,
      elapsedDays: Math.max(1, jd),
      dateRangeLabel: `${monthName} ${jy}`,
      comparisonBaseLabel: 'ماه قبل',
    };
  }

  // 'all' -> meaningful comparison uses rolling 30-day trend (last 30 days vs prior 30 days)
  const last30Start = new Date(todayStart);
  last30Start.setDate(last30Start.getDate() - 29);
  const prev30Start = new Date(last30Start);
  prev30Start.setDate(prev30Start.getDate() - 30);
  const prev30End = new Date(last30Start.getTime() - 1);

  return {
    currentStartMs: 0,
    currentEndMs: Number.MAX_SAFE_INTEGER,
    previousStartMs: prev30Start.getTime(),
    previousEndMs: prev30End.getTime(),
    elapsedDays: 1,
    dateRangeLabel: 'از ابتدای استفاده تا امروز',
    comparisonBaseLabel: '30 روز قبل',
  };
}

export function isStudySessionType(type: string): boolean {
  return type !== 'short-break' && type !== 'long-break';
}

export function normalizeStudySessions(sessions: PomodoroSession[]): NormalizedStudySession[] {
  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const dedupedById = new Map<string, NormalizedStudySession>();

  for (const s of sessions) {
    if (!s || !isStudySessionType(s.type)) continue;
    const mins = Number(s.durationMinutes);
    if (!Number.isFinite(mins) || mins <= 0) continue;

    let ts = typeof s.createdAt === 'number' && Number.isFinite(s.createdAt) && s.createdAt > 0
      ? s.createdAt
      : extractTimestampFromAny(s.id, s.timestamp || s.date);

    if (!ts || !Number.isFinite(ts) || ts <= 0) continue;

    const dateObj = new Date(ts);
    if (isNaN(dateObj.getTime())) continue;

    const id = s.id || `${ts}-${s.type}-${mins}`;
    const existing = dedupedById.get(id);
    if (existing) {
      // Keep the richer duration without double-counting
      if (mins > existing.durationMinutes) {
        dedupedById.set(id, {
          ...existing,
          durationMinutes: mins,
          fileName: s.fileName || existing.fileName,
        });
      }
      continue;
    }

    dedupedById.set(id, {
      id,
      type: s.type,
      durationMinutes: mins,
      timestampMs: ts,
      dayKey: toLocalDayKey(dateObj),
      fileName: s.fileName,
      source: s.source,
    });
  }

  return Array.from(dedupedById.values()).sort((a, b) => b.timestampMs - a.timestampMs);
}

function parseTaskTargetTimestamp(task: StudyTask, now: Date): number {
  const due = task.dueDate?.trim();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);

  if (due) {
    if (due === 'امروز') {
      return todayMid.getTime();
    }
    if (due === 'فردا') {
      const tomorrow = new Date(todayMid);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.getTime();
    }
    if (due === 'این هفته') {
      return todayMid.getTime();
    }
    const parsedDue = extractTimestampFromAny(undefined, due);
    if (parsedDue > 0) return parsedDue;
  }

  const createdTs = extractTimestampFromAny(task.id, task.createdAt);
  return createdTs > 0 ? createdTs : todayMid.getTime();
}

function parseTaskCompletionTimestamp(task: StudyTask, now: Date): number {
  if (task.completedTimestamp) {
    const parsed = Date.parse(task.completedTimestamp);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (task.completedAt) {
    // Only if completedAt looks like an ISO/full date string rather than clock-only string
    if (task.completedAt.includes('-') || task.completedAt.includes('T') || task.completedAt.includes('/')) {
      const parsed = extractTimestampFromAny(undefined, task.completedAt);
      if (parsed > 0) return parsed;
    }
  }
  return parseTaskTargetTimestamp(task, now);
}

function isTaskInPeriod(
  task: StudyTask,
  period: AnalyticsPeriod,
  bounds: PeriodBoundaries,
  now: Date
): boolean {
  if (period === 'all') return true;

  const due = task.dueDate?.trim();

  if (task.completed) {
    const compTs = parseTaskCompletionTimestamp(task, now);
    return compTs >= bounds.currentStartMs && compTs <= bounds.currentEndMs;
  }

  // Remaining (incomplete) tasks
  if (due === 'امروز') {
    return true; // Today falls inside daily, weekly, and monthly
  }
  if (due === 'فردا') {
    if (period === 'daily') return false;
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0).getTime();
    return tomorrow >= bounds.currentStartMs && tomorrow <= bounds.currentEndMs;
  }
  if (due === 'این هفته') {
    if (period === 'daily') return false;
    return true;
  }

  const targetTs = parseTaskTargetTimestamp(task, now);
  return targetTs >= bounds.currentStartMs && targetTs <= bounds.currentEndMs;
}

export function computeGoalsForPeriod(
  tasks: StudyTask[],
  period: AnalyticsPeriod,
  bounds: PeriodBoundaries,
  now: Date = new Date()
): GoalsSummary {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return { completed: 0, remaining: 0, total: 0, percent: 0 };
  }

  const deduped = new Map<string, StudyTask>();
  for (const t of tasks) {
    if (t && t.id && !deduped.has(t.id)) {
      deduped.set(t.id, t);
    }
  }

  let completed = 0;
  let remaining = 0;

  for (const task of deduped.values()) {
    if (!isTaskInPeriod(task, period, bounds, now)) continue;
    if (task.completed) {
      completed += 1;
    } else {
      remaining += 1;
    }
  }

  const total = completed + remaining;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, remaining, total, percent };
}

export function computeComparison(
  currentMinutes: number,
  previousMinutes: number,
  comparisonBaseLabel: string
): PeriodComparison {
  if (previousMinutes <= 0) {
    return {
      hasEnoughData: false,
      previousMinutes: 0,
      currentMinutes,
      diffMinutes: 0,
      percentChange: 0,
      direction: 'insufficient',
      label: 'اطلاعات کافی برای مقایسه وجود ندارد',
    };
  }

  const diffMinutes = currentMinutes - previousMinutes;
  const percentChange = Math.round(((currentMinutes - previousMinutes) / previousMinutes) * 100);

  if (percentChange > 0) {
    return {
      hasEnoughData: true,
      previousMinutes,
      currentMinutes,
      diffMinutes,
      percentChange,
      direction: 'up',
      label: `${percentChange}% افزایش نسبت به ${comparisonBaseLabel}`,
    };
  }

  if (percentChange < 0) {
    return {
      hasEnoughData: true,
      previousMinutes,
      currentMinutes,
      diffMinutes,
      percentChange: Math.abs(percentChange),
      direction: 'down',
      label: `${Math.abs(percentChange)}% کاهش نسبت به ${comparisonBaseLabel}`,
    };
  }

  return {
    hasEnoughData: true,
    previousMinutes,
    currentMinutes,
    diffMinutes: 0,
    percentChange: 0,
    direction: 'same',
    label: `برابر با ${comparisonBaseLabel}`,
  };
}

function buildDaySummaries(sessions: NormalizedStudySession[]): DaySummaryRecord[] {
  const byDay = new Map<string, { totalMinutes: number; sessionCount: number }>();

  for (const s of sessions) {
    const prev = byDay.get(s.dayKey) || { totalMinutes: 0, sessionCount: 0 };
    byDay.set(s.dayKey, {
      totalMinutes: prev.totalMinutes + s.durationMinutes,
      sessionCount: prev.sessionCount + 1,
    });
  }

  const summaries: DaySummaryRecord[] = [];
  for (const [dayKey, data] of byDay.entries()) {
    const d = parseDayKeyToDate(dayKey);
    const { weekday, shamsi } = formatWeekdayAndShamsi(d);
    summaries.push({
      dayKey,
      dateLabel: shamsi,
      weekdayLabel: weekday,
      totalMinutes: data.totalMinutes,
      sessionCount: data.sessionCount,
    });
  }

  return summaries;
}

function pickBestDay(daySummaries: DaySummaryRecord[]): DaySummaryRecord | null {
  if (daySummaries.length === 0) return null;
  return daySummaries.reduce((best, cur) => {
    if (cur.totalMinutes > best.totalMinutes) return cur;
    if (cur.totalMinutes === best.totalMinutes && cur.dayKey > best.dayKey) return cur;
    return best;
  });
}

function computeStreaks(dayKeys: string[], todayKey: string, yesterdayKey: string): { longest: number; current: number } {
  if (dayKeys.length === 0) return { longest: 0, current: 0 };

  const uniqueSorted = Array.from(new Set(dayKeys)).sort(); // ascending YYYY-MM-DD
  let longest = 1;
  let run = 1;

  for (let i = 1; i < uniqueSorted.length; i++) {
    const prevDate = parseDayKeyToDate(uniqueSorted[i - 1]);
    const curDate = parseDayKeyToDate(uniqueSorted[i]);
    const diffDays = Math.round((curDate.getTime() - prevDate.getTime()) / (24 * 60 * 60 * 1000));
    if (diffDays === 1) {
      run += 1;
      if (run > longest) longest = run;
    } else if (diffDays > 1) {
      run = 1;
    }
  }

  // Current streak must end on todayKey or yesterdayKey
  const keySet = new Set(uniqueSorted);
  let anchorKey: string | null = null;
  if (keySet.has(todayKey)) anchorKey = todayKey;
  else if (keySet.has(yesterdayKey)) anchorKey = yesterdayKey;

  let current = 0;
  if (anchorKey) {
    let cursor = parseDayKeyToDate(anchorKey);
    while (keySet.has(toLocalDayKey(cursor))) {
      current += 1;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1, 12, 0, 0, 0);
    }
  }

  return { longest, current };
}

function getSessionTitle(s: NormalizedStudySession): string {
  if (s.fileName && s.fileName.trim()) return s.fileName.trim();
  if (s.type === 'focus') return 'مطالعه متمرکز (پومودورو)';
  if (s.type === 'app-usage') return 'مطالعه عمومی در میز کار';
  return 'جلسه مطالعه';
}

export function computeSubjectProgress(
  periodSessions: NormalizedStudySession[],
  allFiles: StudyFile[],
  categories: FileCategory[],
  notes: NoteItem[],
  noteFolders: NoteFolder[],
  period: AnalyticsPeriod,
  periodStartDayKey?: string,
  periodEndDayKey?: string,
  now: Date = new Date()
): SubjectProgressItem[] {
  seedExistingFilesHistory(allFiles, now);

  const categoryMap = new Map<string, FileCategory>();
  for (const c of categories) {
    if (c?.id) categoryMap.set(c.id, c);
  }

  const fileByNormalizedName = new Map<string, StudyFile>();
  for (const f of allFiles) {
    if (f?.name) {
      fileByNormalizedName.set(f.name.trim().toLowerCase(), f);
    }
  }

  const notesCountByFile = new Map<string, number>();
  for (const n of notes) {
    if (n?.attachedFileName) {
      const key = n.attachedFileName.trim().toLowerCase();
      notesCountByFile.set(key, (notesCountByFile.get(key) || 0) + 1);
    }
  }

  const totalPeriodMinutes = periodSessions.reduce((acc, s) => acc + s.durationMinutes, 0);

  const grouped = new Map<string, SubjectProgressItem>();

  const computeFileReadingStats = (matchedFile?: StudyFile) => {
    const pageCount =
      matchedFile?.pageCount && matchedFile.pageCount > 0 ? matchedFile.pageCount : undefined;
    const currentPage =
      matchedFile?.currentPage && matchedFile.currentPage > 0 ? matchedFile.currentPage : undefined;

    if (!pageCount) {
      return {
        currentPage,
        pageCount,
        readingPercent: null as number | null,
        readingBasePercent: undefined as number | undefined,
        readingDeltaPercent: undefined as number | undefined,
        pagesAdvanced: undefined as number | undefined,
      };
    }

    if (period !== 'all' && periodStartDayKey && periodEndDayKey) {
      const delta = getFileReadingProgressDelta({
        fileId: matchedFile?.id,
        fileName: matchedFile?.name,
        currentPage,
        pageCount,
        periodStartDayKey,
        periodEndDayKey,
        now,
      });
      if (delta) {
        return {
          currentPage,
          pageCount,
          readingPercent: delta.totalPercent,
          readingBasePercent: delta.basePercent,
          readingDeltaPercent: delta.deltaPercent,
          pagesAdvanced: delta.pagesAdvanced,
        };
      }
    }

    const total = Math.min(100, Math.round(((currentPage || 1) / pageCount) * 100));
    return {
      currentPage,
      pageCount,
      readingPercent: total,
      readingBasePercent: total,
      readingDeltaPercent: 0,
      pagesAdvanced: 0,
    };
  };

  for (const s of periodSessions) {
    const rawTitle = getSessionTitle(s);
    const normKey = s.fileName?.trim()
      ? `file::${s.fileName.trim().toLowerCase()}`
      : `general::${rawTitle}`;

    const matchedFile = s.fileName?.trim()
      ? fileByNormalizedName.get(s.fileName.trim().toLowerCase())
      : undefined;
    const matchedCat = matchedFile?.category ? categoryMap.get(matchedFile.category) : undefined;
    const readingStats = computeFileReadingStats(matchedFile);

    const existing = grouped.get(normKey);
    if (existing) {
      existing.studyMinutes += s.durationMinutes;
      existing.sessionCount += 1;
    } else {
      grouped.set(normKey, {
        key: normKey,
        title: rawTitle.replace(/\.pdf$/i, ''),
        categoryName: matchedCat?.name,
        categoryColor: matchedCat?.color,
        studyMinutes: s.durationMinutes,
        sessionCount: 1,
        sharePercent: 0,
        ...readingStats,
        notesCount: s.fileName?.trim() ? notesCountByFile.get(s.fileName.trim().toLowerCase()) || 0 : 0,
        kind: matchedFile ? 'file' : s.fileName ? 'file' : 'general',
      });
    }
  }

  // In non-all periods, also surface files where new pages were read during this period even without a timed session
  if (period !== 'all' && periodStartDayKey && periodEndDayKey) {
    for (const f of allFiles) {
      if (!f?.name) continue;
      const normKey = `file::${f.name.trim().toLowerCase()}`;
      if (grouped.has(normKey)) continue;

      const readingStats = computeFileReadingStats(f);
      if (!readingStats.pagesAdvanced || readingStats.pagesAdvanced <= 0) continue;

      const matchedCat = f.category ? categoryMap.get(f.category) : undefined;
      const fileNotesCount = notesCountByFile.get(f.name.trim().toLowerCase()) || 0;
      grouped.set(normKey, {
        key: normKey,
        title: f.name.trim().replace(/\.pdf$/i, ''),
        categoryName: matchedCat?.name,
        categoryColor: matchedCat?.color,
        studyMinutes: 0,
        sessionCount: 0,
        sharePercent: 0,
        ...readingStats,
        notesCount: fileNotesCount + (f.stickyNotes?.length || 0),
        kind: 'file',
      });
    }
  }

  // In All-Time tab, also surface library files that have genuine reading progress even without a timed session
  if (period === 'all') {
    for (const f of allFiles) {
      if (!f?.name) continue;
      const normKey = `file::${f.name.trim().toLowerCase()}`;
      if (grouped.has(normKey)) continue;

      const pageCount = f.pageCount && f.pageCount > 0 ? f.pageCount : undefined;
      const currentPage = f.currentPage && f.currentPage > 0 ? f.currentPage : undefined;
      const hasProgress = Boolean(pageCount && currentPage && currentPage > 1);
      const hasStickyNotes = (f.stickyNotes?.length || 0) > 0;
      const fileNotesCount = notesCountByFile.get(f.name.trim().toLowerCase()) || 0;

      if (!hasProgress && !hasStickyNotes && fileNotesCount === 0) continue;

      const matchedCat = f.category ? categoryMap.get(f.category) : undefined;
      const total = pageCount ? Math.min(100, Math.round(((currentPage || 1) / pageCount) * 100)) : null;
      grouped.set(normKey, {
        key: normKey,
        title: f.name.trim().replace(/\.pdf$/i, ''),
        categoryName: matchedCat?.name,
        categoryColor: matchedCat?.color,
        studyMinutes: 0,
        sessionCount: 0,
        sharePercent: 0,
        currentPage,
        pageCount,
        readingPercent: total,
        readingBasePercent: total ?? undefined,
        readingDeltaPercent: 0,
        pagesAdvanced: 0,
        notesCount: fileNotesCount + (f.stickyNotes?.length || 0),
        kind: 'file',
      });
    }

    // If still empty and user has categorized notes, reflect note categories without inventing time
    if (grouped.size === 0 && notes.length > 0) {
      const folderMap = new Map<string, NoteFolder>();
      for (const nf of noteFolders) {
        if (nf?.id) folderMap.set(nf.id, nf);
      }

      const byCategory = new Map<string, { title: string; count: number }>();
      for (const n of notes) {
        const folderName = n.folderId ? folderMap.get(n.folderId)?.name : undefined;
        const label = folderName || n.category?.trim();
        if (!label) continue;
        const key = `cat::${label.toLowerCase()}`;
        const prev = byCategory.get(key) || { title: label, count: 0 };
        byCategory.set(key, { title: label, count: prev.count + 1 });
      }

      for (const [k, info] of byCategory.entries()) {
        grouped.set(k, {
          key: k,
          title: info.title,
          studyMinutes: 0,
          sessionCount: 0,
          sharePercent: 0,
          readingPercent: null,
          notesCount: info.count,
          kind: 'category',
        });
      }
    }
  }

  const items = Array.from(grouped.values()).map((item) => ({
    ...item,
    sharePercent: totalPeriodMinutes > 0 ? Math.round((item.studyMinutes / totalPeriodMinutes) * 100) : 0,
  }));

  return items.sort((a, b) => {
    if (b.studyMinutes !== a.studyMinutes) return b.studyMinutes - a.studyMinutes;
    if ((b.readingPercent ?? -1) !== (a.readingPercent ?? -1)) {
      return (b.readingPercent ?? -1) - (a.readingPercent ?? -1);
    }
    return b.notesCount - a.notesCount;
  });
}

export function computeAnalyticsSnapshot(
  period: AnalyticsPeriod,
  rawSessions: PomodoroSession[],
  tasks: StudyTask[],
  files: StudyFile[],
  categories: FileCategory[],
  notes: NoteItem[],
  noteFolders: NoteFolder[],
  now: Date = new Date(),
  dailyGoalMinutes: number = 120
): AnalyticsSnapshot {
  const bounds = getPeriodBoundaries(period, now);
  const allSessions = normalizeStudySessions(rawSessions);

  const periodSessions =
    period === 'all'
      ? allSessions
      : allSessions.filter(
          (s) => s.timestampMs >= bounds.currentStartMs && s.timestampMs <= bounds.currentEndMs
        );

  const totalMinutes = periodSessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const sessionCount = periodSessions.length;

  let comparison: PeriodComparison;
  if (period === 'all') {
    const recent30Start = startOfLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29)).getTime();
    const recent30End = endOfLocalDay(now).getTime();
    const recent30Minutes = allSessions
      .filter((s) => s.timestampMs >= recent30Start && s.timestampMs <= recent30End)
      .reduce((acc, s) => acc + s.durationMinutes, 0);
    const prev30Minutes = allSessions
      .filter((s) => s.timestampMs >= bounds.previousStartMs && s.timestampMs <= bounds.previousEndMs)
      .reduce((acc, s) => acc + s.durationMinutes, 0);
    comparison = computeComparison(recent30Minutes, prev30Minutes, bounds.comparisonBaseLabel);
  } else {
    const previousMinutes = allSessions
      .filter((s) => s.timestampMs >= bounds.previousStartMs && s.timestampMs <= bounds.previousEndMs)
      .reduce((acc, s) => acc + s.durationMinutes, 0);
    comparison = computeComparison(totalMinutes, previousMinutes, bounds.comparisonBaseLabel);
  }

  const periodDaySummaries = buildDaySummaries(periodSessions);
  const activeDaysCount = periodDaySummaries.length;
  const bestDay = pickBestDay(periodDaySummaries);

  const averageDailyMinutes =
    period === 'daily'
      ? totalMinutes
      : period === 'all'
      ? activeDaysCount > 0
        ? Math.round(totalMinutes / activeDaysCount)
        : 0
      : Math.round(totalMinutes / Math.max(1, bounds.elapsedDays));

  const goals = computeGoalsForPeriod(tasks, period, bounds, now);
  const periodStartKey = period === 'all' ? undefined : toLocalDayKey(new Date(bounds.currentStartMs));
  const periodEndKey = period === 'all' ? undefined : toLocalDayKey(new Date(bounds.currentEndMs));
  const subjects = computeSubjectProgress(
    periodSessions,
    files,
    categories,
    notes,
    noteFolders,
    period,
    periodStartKey,
    periodEndKey,
    now
  );

  // All-time records
  const allDaySummaries = buildDaySummaries(allSessions);
  const allBestDay = pickBestDay(allDaySummaries);

  let longestSession: AllTimeRecords['longestSession'] = null;
  if (allSessions.length > 0) {
    const maxS = allSessions.reduce((best, cur) =>
      cur.durationMinutes > best.durationMinutes ? cur : best
    );
    const { shamsi } = formatWeekdayAndShamsi(new Date(maxS.timestampMs));
    longestSession = {
      durationMinutes: maxS.durationMinutes,
      title: getSessionTitle(maxS).replace(/\.pdf$/i, ''),
      dateLabel: shamsi,
    };
  }

  const todayKey = toLocalDayKey(now);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const yesterdayKey = toLocalDayKey(yesterday);
  const streaks = computeStreaks(
    allDaySummaries.map((d) => d.dayKey),
    todayKey,
    yesterdayKey
  );

  const periodLabels: Record<AnalyticsPeriod, string> = {
    daily: 'روزانه',
    weekly: 'هفتگی',
    monthly: 'ماهانه',
    all: 'کل',
  };

  const safeDailyGoal = Math.max(15, Math.round(dailyGoalMinutes || 120));
  let timeGoal: StudyTimeGoalSummary;

  if (period === 'daily') {
    const remainingMinutes = Math.max(0, safeDailyGoal - totalMinutes);
    const percent = Math.round((totalMinutes / safeDailyGoal) * 100);
    timeGoal = {
      achievedMinutes: totalMinutes,
      targetMinutes: safeDailyGoal,
      remainingMinutes,
      percent,
      targetLabel: `هدف روزانه: ${formatDurationFa(safeDailyGoal)}`,
    };
  } else if (period === 'weekly') {
    const targetMinutes = safeDailyGoal * 7;
    const remainingMinutes = Math.max(0, targetMinutes - totalMinutes);
    const percent = Math.round((totalMinutes / targetMinutes) * 100);
    timeGoal = {
      achievedMinutes: totalMinutes,
      targetMinutes,
      remainingMinutes,
      percent,
      targetLabel: `هدف هفتگی: ${formatDurationFa(targetMinutes)}`,
    };
  } else if (period === 'monthly') {
    const daysInMonth = Math.max(
      29,
      Math.round((bounds.currentEndMs - bounds.currentStartMs + 1) / (24 * 60 * 60 * 1000))
    );
    const targetMinutes = safeDailyGoal * daysInMonth;
    const remainingMinutes = Math.max(0, targetMinutes - totalMinutes);
    const percent = Math.round((totalMinutes / targetMinutes) * 100);
    timeGoal = {
      achievedMinutes: totalMinutes,
      targetMinutes,
      remainingMinutes,
      percent,
      targetLabel: `هدف ماهانه: ${formatDurationFa(targetMinutes)}`,
    };
  } else {
    const achievedAvg = activeDaysCount > 0 ? averageDailyMinutes : 0;
    const remainingMinutes = Math.max(0, safeDailyGoal - achievedAvg);
    const percent = Math.round((achievedAvg / safeDailyGoal) * 100);
    timeGoal = {
      achievedMinutes: achievedAvg,
      targetMinutes: safeDailyGoal,
      remainingMinutes,
      percent,
      targetLabel: `میانگین روز فعال از هدف ${formatDurationFa(safeDailyGoal)}`,
    };
  }

  return {
    period,
    periodLabel: periodLabels[period],
    dateRangeLabel: bounds.dateRangeLabel,
    totalMinutes,
    sessionCount,
    averageDailyMinutes,
    elapsedDaysInPeriod: period === 'all' ? activeDaysCount : bounds.elapsedDays,
    activeDaysCount,
    goals,
    timeGoal,
    comparison,
    bestDay,
    subjects,
    records: {
      bestDay: allBestDay,
      longestSession,
      longestStreakDays: streaks.longest,
      currentStreakDays: streaks.current,
    },
  };
}

export function computeWeeklyBreakdown(
  rawSessions: PomodoroSession[],
  tasks: StudyTask[],
  files: StudyFile[],
  categories: FileCategory[],
  notes: NoteItem[],
  noteFolders: NoteFolder[],
  now: Date = new Date(),
  dailyGoalMinutes: number = 120
): WeeklyDayBreakdown[] {
  const todayStart = startOfLocalDay(now);
  const todayKey = toLocalDayKey(now);
  const tomorrowDate = new Date(todayStart);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = toLocalDayKey(tomorrowDate);

  const daysSinceSaturday = (now.getDay() + 1) % 7;
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - daysSinceSaturday);

  const dayEntries: { date: Date; dayKey: string }[] = [];
  const weekKeySet = new Set<string>();
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + offset);
    const key = toLocalDayKey(d);
    dayEntries.push({ date: d, dayKey: key });
    weekKeySet.add(key);
  }

  const allSessions = normalizeStudySessions(rawSessions);
  const sessionsByDay = new Map<string, NormalizedStudySession[]>();
  for (const s of allSessions) {
    if (!weekKeySet.has(s.dayKey)) continue;
    const list = sessionsByDay.get(s.dayKey);
    if (list) list.push(s);
    else sessionsByDay.set(s.dayKey, [s]);
  }

  const taskCountsByDay = new Map<string, { completed: number; remaining: number }>();
  if (Array.isArray(tasks) && tasks.length > 0) {
    const deduped = new Map<string, StudyTask>();
    for (const t of tasks) {
      if (t && t.id && !deduped.has(t.id)) {
        deduped.set(t.id, t);
      }
    }

    for (const task of deduped.values()) {
      let targetKey: string | null = null;
      if (task.completed) {
        const compTs = parseTaskCompletionTimestamp(task, now);
        targetKey = toLocalDayKey(new Date(compTs));
      } else {
        const due = task.dueDate?.trim();
        if (due === 'امروز') {
          targetKey = todayKey;
        } else if (due === 'فردا') {
          targetKey = tomorrowKey;
        } else if (due !== 'این هفته') {
          const targetTs = parseTaskTargetTimestamp(task, now);
          targetKey = toLocalDayKey(new Date(targetTs));
        }
      }

      if (!targetKey || !weekKeySet.has(targetKey)) continue;
      const cur = taskCountsByDay.get(targetKey) || { completed: 0, remaining: 0 };
      if (task.completed) cur.completed += 1;
      else cur.remaining += 1;
      taskCountsByDay.set(targetKey, cur);
    }
  }

  const safeDailyGoal = Math.max(15, Math.round(dailyGoalMinutes || 120));

  return dayEntries.map(({ date, dayKey }) => {
    const { weekday, shamsi } = formatWeekdayAndShamsi(date);
    const daySessions = sessionsByDay.get(dayKey) || [];
    const totalMinutes = daySessions.reduce((acc, s) => acc + s.durationMinutes, 0);
    const sessionCount = daySessions.length;
    const goalPercent = Math.round((totalMinutes / safeDailyGoal) * 100);
    const tCounts = taskCountsByDay.get(dayKey) || { completed: 0, remaining: 0 };
    const totalTasks = tCounts.completed + tCounts.remaining;

    return {
      dayKey,
      weekdayLabel: weekday,
      shortDateLabel: shamsi,
      totalMinutes,
      sessionCount,
      goalPercent,
      completedTasks: tCounts.completed,
      totalTasks,
      remainingTasks: tCounts.remaining,
      isToday: dayKey === todayKey,
      isFuture: startOfLocalDay(date).getTime() > todayStart.getTime(),
      subjects: computeSubjectProgress(
        daySessions,
        files,
        categories,
        notes,
        noteFolders,
        'daily',
        dayKey,
        dayKey,
        now
      ),
    };
  });
}

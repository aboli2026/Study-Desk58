import React, { useState, useMemo, useEffect } from 'react';
import {
  Clock,
  Calendar,
  CalendarRange,
  CalendarDays,
  Layers,
  CheckCircle2,
  Circle,
  TrendingUp,
  TrendingDown,
  Minus,
  Award,
  BookOpen,
  Flame,
  Timer,
  Activity,
  FileText,
} from 'lucide-react';
import {
  PomodoroSession,
  NoteItem,
  StudyFile,
  StudyTask,
  FileCategory,
  NoteFolder,
} from '../types';
import { getAllStudyFiles, getAllTasksFromStorage } from '../utils/fileStorage';
import {
  AnalyticsPeriod,
  PeriodComparison,
  SubjectProgressItem,
  computeAnalyticsSnapshot,
  computeWeeklyBreakdown,
  formatDurationFa,
  formatNumberEn,
} from '../utils/analyticsEngine';
import { GoalDonutChart } from './GoalDonutChart';
import { WeeklyBarChart } from './WeeklyBarChart';

interface AnalyticsViewProps {
  sessions: PomodoroSession[];
  notes: NoteItem[];
  files?: StudyFile[];
  onClearHistory?: () => void;
  onLoadSampleData?: () => void;
}

interface TabConfig {
  id: AnalyticsPeriod;
  label: string;
  icon: React.FC<{ className?: string }>;
}

const ANALYTICS_TABS: TabConfig[] = [
  { id: 'daily', label: 'روزانه', icon: Calendar },
  { id: 'weekly', label: 'هفتگی', icon: CalendarRange },
  { id: 'monthly', label: 'ماهانه', icon: CalendarDays },
  { id: 'all', label: 'کل', icon: Layers },
];

const CATEGORY_DOT_COLORS: Record<string, string> = {
  blue: 'bg-blue-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  violet: 'bg-purple-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
  orange: 'bg-orange-500',
  neutral: 'bg-neutral-500',
};

function loadCategoriesFromStorage(): FileCategory[] {
  try {
    const raw = localStorage.getItem('study_file_categories');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadNoteFoldersFromStorage(): NoteFolder[] {
  try {
    const raw = localStorage.getItem('study_workspace_note_folders');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const DAILY_GOAL_STORAGE_KEY = 'study_daily_goal_minutes';

function clampDailyGoalMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 120;
  return Math.min(720, Math.max(30, Math.round(minutes)));
}

function loadDailyGoalMinutesFromStorage(): number {
  try {
    const raw = localStorage.getItem(DAILY_GOAL_STORAGE_KEY);
    if (!raw) return 120;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return 120;
    return clampDailyGoalMinutes(parsed);
  } catch {
    return 120;
  }
}

const ComparisonText: React.FC<{ comparison: PeriodComparison }> = ({ comparison }) => {
  if (!comparison.hasEnoughData || comparison.direction === 'insufficient') {
    return (
      <span
        className="block text-[11px] text-neutral-400 whitespace-nowrap truncate"
        title={comparison.label}
      >
        {comparison.label}
      </span>
    );
  }

  if (comparison.direction === 'up') {
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 tabular-nums whitespace-nowrap truncate"
        title={comparison.label}
      >
        <TrendingUp className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{comparison.label}</span>
      </span>
    );
  }

  if (comparison.direction === 'down') {
    return (
      <span
        className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 tabular-nums whitespace-nowrap truncate"
        title={comparison.label}
      >
        <TrendingDown className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{comparison.label}</span>
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1 text-[11px] font-medium text-neutral-600 whitespace-nowrap truncate"
      title={comparison.label}
    >
      <Minus className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{comparison.label}</span>
    </span>
  );
};

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: React.ReactNode;
  icon: React.FC<{ className?: string }>;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, icon: Icon }) => (
  <div className="bg-white rounded-2xl shadow-[0_10px_26px_-4px_rgba(0,0,0,0.12),0_4px_10px_-2px_rgba(0,0,0,0.08)] p-4 sm:p-5 flex flex-col justify-between gap-3 h-full min-w-0">
    <div className="flex items-center justify-between gap-2 min-w-0">
      <span className="text-xs font-semibold text-neutral-600 whitespace-nowrap truncate">
        {title}
      </span>
      <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
    </div>
    <div className="min-w-0">
      <div
        className="text-base sm:text-lg font-extrabold text-neutral-900 tabular-nums tracking-tight whitespace-nowrap truncate"
        title={value}
      >
        {value}
      </div>
      {subtitle && (
        <div className="mt-1.5 min-w-0 whitespace-nowrap truncate">
          {subtitle}
        </div>
      )}
    </div>
  </div>
);

const SubjectProgressPanel: React.FC<{
  subjects: SubjectProgressItem[];
  periodLabel: string;
}> = ({ subjects, periodLabel }) => {
  return (
    <section
      aria-label="پیشرفت در درس‌ها و موضوعات"
      className="bg-white rounded-3xl shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-5 sm:p-6 flex flex-col h-full max-h-[468px]"
    >
      <div className="flex items-center justify-between gap-2 pb-3.5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
            <BookOpen className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-neutral-900 whitespace-nowrap truncate">
              وضعیت پیشرفت در درس‌ها و موضوعات
            </h2>
            <p className="text-[11px] text-neutral-600 mt-0.5 whitespace-nowrap truncate">
              تفکیک زمان مطالعه و پیشرفت واقعی منابع در بازه {periodLabel}
            </p>
          </div>
        </div>
        {subjects.length > 0 && (
          <span className="text-xs font-semibold text-neutral-600 tabular-nums whitespace-nowrap shrink-0">
            {formatNumberEn(subjects.length)} مورد
          </span>
        )}
      </div>

      {subjects.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4">
          <div className="w-11 h-11 rounded-2xl bg-neutral-100 text-neutral-500 flex items-center justify-center mb-3">
            <FileText className="w-5 h-5" />
          </div>
          <p className="text-xs font-semibold text-neutral-700">
            اطلاعاتی برای درس‌ها در بازه {periodLabel} ثبت نشده است
          </p>
          <p className="text-[11px] text-neutral-500 mt-1.5 max-w-sm leading-relaxed">
            با مطالعه فایل‌ها یا ثبت نشست‌های تمرکز در این بازه، سهم هر درس و درصد پیشرفت مطالعه آن در اینجا نمایش داده می‌شود.
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto custom-column-scroll pe-2 space-y-2.5 pt-0.5">
          {subjects.map((item) => {
            const deltaPercent =
              item.readingDeltaPercent && item.readingDeltaPercent > 0
                ? item.readingDeltaPercent
                : 0;
            const hasNewReadingProgress =
              deltaPercent > 0 || (item.pagesAdvanced ?? 0) > 0;
            const totalReadingPercent = item.readingPercent ?? 0;
            const baseReadingPercent =
              item.readingPercent !== null
                ? Math.max(0, totalReadingPercent - deltaPercent)
                : 0;
            const barPercent =
              item.readingPercent !== null ? item.readingPercent : item.sharePercent;
            const dotClass =
              (item.categoryColor && CATEGORY_DOT_COLORS[item.categoryColor]) ||
              'bg-neutral-400';

            return (
              <div key={item.key} className="p-3.5 rounded-2xl bg-neutral-100/75 space-y-2">
                <div className="flex items-center justify-between gap-3 min-w-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                      <span className="text-xs sm:text-sm font-bold text-neutral-900 whitespace-nowrap truncate">
                        {item.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-x-2 text-[11px] text-neutral-500 mt-1 pr-4 whitespace-nowrap truncate">
                      {item.categoryName && (
                        <>
                          <span className="truncate">{item.categoryName}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      {item.sessionCount > 0 && (
                        <>
                          <span className="tabular-nums">
                            {formatNumberEn(item.sessionCount)} جلسه
                          </span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      {item.pageCount && item.currentPage ? (
                        <span className="tabular-nums">
                          صفحه {formatNumberEn(item.currentPage)} از {formatNumberEn(item.pageCount)}
                        </span>
                      ) : item.notesCount > 0 ? (
                        <span className="tabular-nums">
                          {formatNumberEn(item.notesCount)} یادداشت مرتبط
                        </span>
                      ) : (
                        <span className="tabular-nums">
                          {item.sharePercent}% از زمان بازه
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div className="text-xs font-bold text-neutral-900 tabular-nums whitespace-nowrap flex items-center justify-end gap-1.5">
                      {item.studyMinutes > 0 ? (
                        <span>{formatDurationFa(item.studyMinutes)}</span>
                      ) : item.readingPercent !== null ? (
                        <>
                          <span>{item.readingPercent}% خوانده‌شده</span>
                          {hasNewReadingProgress && (
                            <span dir="ltr" className="text-[11px] font-bold text-emerald-600">
                              {deltaPercent > 0 ? `+${deltaPercent}%` : `+${item.pagesAdvanced}p`}
                            </span>
                          )}
                        </>
                      ) : (
                        <span>{formatNumberEn(item.notesCount)} یادداشت</span>
                      )}
                    </div>
                    {item.studyMinutes > 0 && item.readingPercent !== null && (
                      <div className="text-[11px] text-neutral-500 tabular-nums whitespace-nowrap mt-0.5 flex items-center justify-end gap-1.5">
                        <span>{item.readingPercent}% پیشرفت صفحه</span>
                        {hasNewReadingProgress && (
                          <span dir="ltr" className="font-bold text-emerald-600">
                            {deltaPercent > 0 ? `+${deltaPercent}%` : `+${item.pagesAdvanced}p`}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Minimal Progress Indicator (Black base + Green new increment) */}
                <div className="w-full h-1.5 bg-neutral-200/80 rounded-full overflow-hidden flex">
                  {item.readingPercent !== null ? (
                    <>
                      {baseReadingPercent > 0 && (
                        <div
                          className="h-full bg-neutral-900 transition-all duration-300"
                          style={{
                            width: `${Math.min(100, baseReadingPercent)}%`,
                          }}
                        />
                      )}
                      {hasNewReadingProgress && (
                        <div
                          className="h-full bg-emerald-500 transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              100 - Math.min(100, baseReadingPercent),
                              Math.max(2, deltaPercent)
                            )}%`,
                          }}
                        />
                      )}
                    </>
                  ) : (
                    <div
                      className="h-full rounded-full transition-all duration-300 bg-neutral-600"
                      style={{
                        width: `${Math.min(100, Math.max(barPercent > 0 ? 4 : 0, barPercent))}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  sessions,
  notes,
  files: filesProp,
}) => {
  const [activeTab, setActiveTab] = useState<AnalyticsPeriod>('daily');
  const [tasks, setTasks] = useState<StudyTask[]>(() => getAllTasksFromStorage());
  const [internalFiles, setInternalFiles] = useState<StudyFile[]>([]);
  const [categories, setCategories] = useState<FileCategory[]>(() => loadCategoriesFromStorage());
  const [noteFolders, setNoteFolders] = useState<NoteFolder[]>(() => loadNoteFoldersFromStorage());
  const [dailyGoalMinutes, setDailyGoalMinutes] = useState<number>(() =>
    loadDailyGoalMinutesFromStorage()
  );
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(!filesProp);
  const [progressRevision, setProgressRevision] = useState<number>(0);

  const handleChangeDailyGoalMinutes = (minutes: number) => {
    const clamped = clampDailyGoalMinutes(minutes);
    setDailyGoalMinutes(clamped);
    try {
      localStorage.setItem(DAILY_GOAL_STORAGE_KEY, String(clamped));
    } catch {
      // Ignore storage write errors
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (filesProp) {
      setIsLoadingFiles(false);
      return;
    }

    setIsLoadingFiles(true);
    getAllStudyFiles()
      .then((loaded) => {
        if (!cancelled) {
          setInternalFiles(loaded);
          setIsLoadingFiles(false);
        }
      })
      .catch(() => {
        if (!cancelled) setIsLoadingFiles(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filesProp]);

  useEffect(() => {
    const syncWorkspaceMetadata = () => {
      setTasks(getAllTasksFromStorage());
      setCategories(loadCategoriesFromStorage());
      setNoteFolders(loadNoteFoldersFromStorage());
      setDailyGoalMinutes(loadDailyGoalMinutesFromStorage());
      setProgressRevision((r) => r + 1);
      if (!filesProp) {
        getAllStudyFiles()
          .then((loaded) => setInternalFiles(loaded))
          .catch(() => {});
      }
    };

    window.addEventListener('study_tasks_updated', syncWorkspaceMetadata);
    window.addEventListener('study_files_updated', syncWorkspaceMetadata);
    window.addEventListener('study_file_progress_updated', syncWorkspaceMetadata);
    window.addEventListener('study_workspace_data_restored', syncWorkspaceMetadata);
    window.addEventListener('storage', syncWorkspaceMetadata);

    return () => {
      window.removeEventListener('study_tasks_updated', syncWorkspaceMetadata);
      window.removeEventListener('study_files_updated', syncWorkspaceMetadata);
      window.removeEventListener('study_file_progress_updated', syncWorkspaceMetadata);
      window.removeEventListener('study_workspace_data_restored', syncWorkspaceMetadata);
      window.removeEventListener('storage', syncWorkspaceMetadata);
    };
  }, [filesProp]);

  const effectiveFiles = filesProp ?? internalFiles;

  const snapshot = useMemo(() => {
    return computeAnalyticsSnapshot(
      activeTab,
      sessions,
      tasks,
      effectiveFiles,
      categories,
      notes,
      noteFolders,
      new Date(),
      dailyGoalMinutes
    );
  }, [activeTab, sessions, tasks, effectiveFiles, categories, notes, noteFolders, dailyGoalMinutes, progressRevision]);

  const weeklyBreakdown = useMemo(() => {
    return computeWeeklyBreakdown(
      sessions,
      tasks,
      effectiveFiles,
      categories,
      notes,
      noteFolders,
      new Date(),
      dailyGoalMinutes
    );
  }, [sessions, tasks, effectiveFiles, categories, notes, noteFolders, dailyGoalMinutes, progressRevision]);

  const isEmptyOverall =
    snapshot.sessionCount === 0 &&
    snapshot.goals.total === 0 &&
    snapshot.subjects.length === 0;

  return (
    <div
      className="flex-1 flex flex-col h-full bg-neutral-100/80 overflow-hidden select-none font-sans"
      dir="rtl"
    >
      {/* Top Header & 4 Period Tabs */}
      <header className="bg-white shadow-[0_6px_22px_-4px_rgba(0,0,0,0.10),0_2px_8px_-2px_rgba(0,0,0,0.06)] relative z-10 px-4 sm:px-8 py-4 shrink-0">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold text-neutral-900 tracking-tight whitespace-nowrap">
              تحلیل عملکرد
            </h1>
            <p className="text-xs text-neutral-500 mt-0.5 whitespace-nowrap truncate">
              {snapshot.dateRangeLabel}
            </p>
          </div>

          <div
            role="tablist"
            aria-label="بازه‌های زمانی تحلیل عملکرد"
            className="flex items-center gap-1.5 p-1 bg-neutral-100/90 rounded-2xl w-full md:w-auto"
          >
            {ANALYTICS_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all duration-150 ${
                    isActive
                      ? 'bg-white text-neutral-900 shadow-sm'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-neutral-900' : 'text-neutral-400'
                    }`}
                  />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Dashboard Viewport */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-column-scroll">
        <div
          role="tabpanel"
          aria-label={`داشبورد ${snapshot.periodLabel}`}
          className="max-w-6xl mx-auto space-y-5"
        >
          {isLoadingFiles && effectiveFiles.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 animate-pulse">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl shadow-[0_10px_26px_-4px_rgba(0,0,0,0.12),0_4px_10px_-2px_rgba(0,0,0,0.08)] p-5 h-28"
                />
              ))}
            </div>
          ) : null}

          {/* ===============================================================
              TAB 1: DAILY DASHBOARD (روزانه)
              =============================================================== */}
          {activeTab === 'daily' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  title="زمان مطالعه امروز"
                  value={formatDurationFa(snapshot.totalMinutes)}
                  subtitle={<ComparisonText comparison={snapshot.comparison} />}
                  icon={Clock}
                />
                <StatCard
                  title="جلسات مطالعه"
                  value={`${formatNumberEn(snapshot.sessionCount)} جلسه`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 whitespace-nowrap truncate">
                      جلسات تمرکز و مطالعه فایل
                    </span>
                  }
                  icon={Activity}
                />
                <StatCard
                  title="اهداف انجام‌شده"
                  value={`${formatNumberEn(snapshot.goals.completed)} هدف`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-500 tabular-nums whitespace-nowrap truncate">
                      {snapshot.goals.total > 0
                        ? `${snapshot.goals.percent}% تحقق اهداف روزانه`
                        : 'هدفی ثبت نشده است'}
                    </span>
                  }
                  icon={CheckCircle2}
                />
                <StatCard
                  title="اهداف باقیمانده"
                  value={`${formatNumberEn(snapshot.goals.remaining)} هدف`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 tabular-nums whitespace-nowrap truncate">
                      {snapshot.goals.total > 0
                        ? `از مجموع ${formatNumberEn(snapshot.goals.total)} هدف امروز`
                        : 'بدون هدف باقیمانده'}
                    </span>
                  }
                  icon={Circle}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div className="lg:col-span-5">
                  <GoalDonutChart
                    goals={snapshot.goals}
                    timeGoal={snapshot.timeGoal}
                    periodLabel="روزانه"
                    dailyGoalMinutes={dailyGoalMinutes}
                    onChangeDailyGoalMinutes={handleChangeDailyGoalMinutes}
                  />
                </div>
                <div className="lg:col-span-7">
                  <SubjectProgressPanel subjects={snapshot.subjects} periodLabel="امروز" />
                </div>
              </div>
            </>
          )}

          {/* ===============================================================
              TAB 2: WEEKLY DASHBOARD (هفتگی)
              =============================================================== */}
          {activeTab === 'weekly' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  title="زمان مطالعه هفته"
                  value={formatDurationFa(snapshot.totalMinutes)}
                  subtitle={<ComparisonText comparison={snapshot.comparison} />}
                  icon={Clock}
                />
                <StatCard
                  title="میانگین مطالعه روزانه"
                  value={formatDurationFa(snapshot.averageDailyMinutes)}
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 tabular-nums whitespace-nowrap truncate">
                      در {snapshot.elapsedDaysInPeriod} روز گذشته هفته
                    </span>
                  }
                  icon={Timer}
                />
                <StatCard
                  title="بهترین روز هفته"
                  value={snapshot.bestDay ? snapshot.bestDay.weekdayLabel : 'ثبت نشده'}
                  subtitle={
                    <span className="block text-[11px] text-neutral-500 tabular-nums whitespace-nowrap truncate">
                      {snapshot.bestDay
                        ? `${formatDurationFa(snapshot.bestDay.totalMinutes)} · ${snapshot.bestDay.dateLabel}`
                        : 'هنوز مطالعه‌ای ثبت نشده است'}
                    </span>
                  }
                  icon={Award}
                />
                <StatCard
                  title="جلسات و اهداف هفته"
                  value={`${formatNumberEn(snapshot.sessionCount)} جلسه`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-500 tabular-nums whitespace-nowrap truncate">
                      {snapshot.goals.total > 0
                        ? `${formatNumberEn(snapshot.goals.completed)} هدف تکمیل‌شده · ${snapshot.goals.percent}% تحقق`
                        : 'هدفی برای هفته ثبت نشده است'}
                    </span>
                  }
                  icon={CheckCircle2}
                />
              </div>

              <WeeklyBarChart
                days={weeklyBreakdown}
                dailyGoalMinutes={dailyGoalMinutes}
              />

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div className="lg:col-span-5">
                  <GoalDonutChart
                    goals={snapshot.goals}
                    timeGoal={snapshot.timeGoal}
                    periodLabel="هفتگی"
                    dailyGoalMinutes={dailyGoalMinutes}
                    onChangeDailyGoalMinutes={handleChangeDailyGoalMinutes}
                  />
                </div>
                <div className="lg:col-span-7">
                  <SubjectProgressPanel subjects={snapshot.subjects} periodLabel="این هفته" />
                </div>
              </div>
            </>
          )}

          {/* ===============================================================
              TAB 3: MONTHLY DASHBOARD (ماهانه - بدون نقشه حرارتی گیت‌هاب)
              =============================================================== */}
          {activeTab === 'monthly' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  title="زمان مطالعه ماه"
                  value={formatDurationFa(snapshot.totalMinutes)}
                  subtitle={<ComparisonText comparison={snapshot.comparison} />}
                  icon={Clock}
                />
                <StatCard
                  title="میانگین مطالعه روزانه"
                  value={formatDurationFa(snapshot.averageDailyMinutes)}
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 tabular-nums whitespace-nowrap truncate">
                      در {snapshot.elapsedDaysInPeriod} روز از ابتدای ماه
                    </span>
                  }
                  icon={Timer}
                />
                <StatCard
                  title="بهترین عملکرد ماه"
                  value={
                    snapshot.bestDay
                      ? formatDurationFa(snapshot.bestDay.totalMinutes)
                      : 'ثبت نشده'
                  }
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 tabular-nums whitespace-nowrap truncate">
                      {snapshot.bestDay
                        ? `${snapshot.bestDay.weekdayLabel} · ${snapshot.bestDay.dateLabel}`
                        : 'رکوردی در این ماه ثبت نشده است'}
                    </span>
                  }
                  icon={Award}
                />
                <StatCard
                  title="جلسات و اهداف ماه"
                  value={`${formatNumberEn(snapshot.sessionCount)} جلسه`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-500 tabular-nums whitespace-nowrap truncate">
                      {snapshot.goals.total > 0
                        ? `${formatNumberEn(snapshot.goals.completed)} هدف تکمیل‌شده · ${snapshot.goals.percent}% تحقق`
                        : 'هدفی برای ماه ثبت نشده است'}
                    </span>
                  }
                  icon={CheckCircle2}
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div className="lg:col-span-5">
                  <GoalDonutChart
                    goals={snapshot.goals}
                    timeGoal={snapshot.timeGoal}
                    periodLabel="ماهانه"
                    dailyGoalMinutes={dailyGoalMinutes}
                    onChangeDailyGoalMinutes={handleChangeDailyGoalMinutes}
                  />
                </div>
                <div className="lg:col-span-7">
                  <SubjectProgressPanel subjects={snapshot.subjects} periodLabel="این ماه" />
                </div>
              </div>
            </>
          )}

          {/* ===============================================================
              TAB 4: ALL-TIME DASHBOARD (کل)
              =============================================================== */}
          {activeTab === 'all' && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  title="مجموع کل مطالعه"
                  value={formatDurationFa(snapshot.totalMinutes)}
                  subtitle={<ComparisonText comparison={snapshot.comparison} />}
                  icon={Clock}
                />
                <StatCard
                  title="مجموع جلسات مطالعه"
                  value={`${formatNumberEn(snapshot.sessionCount)} جلسه`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 tabular-nums whitespace-nowrap truncate">
                      {snapshot.activeDaysCount > 0
                        ? `میانگین روز فعال: ${formatDurationFa(snapshot.averageDailyMinutes)}`
                        : 'هنوز جلسه‌ای ثبت نشده است'}
                    </span>
                  }
                  icon={Activity}
                />
                <StatCard
                  title="اهداف تکمیل‌شده"
                  value={`${formatNumberEn(snapshot.goals.completed)} هدف`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-500 tabular-nums whitespace-nowrap truncate">
                      {snapshot.goals.total > 0
                        ? `${snapshot.goals.percent}% از کل ${formatNumberEn(snapshot.goals.total)} هدف`
                        : 'هدفی ثبت نشده است'}
                    </span>
                  }
                  icon={CheckCircle2}
                />
                <StatCard
                  title="روزهای فعال مطالعه"
                  value={`${formatNumberEn(snapshot.activeDaysCount)} روز`}
                  subtitle={
                    <span className="block text-[11px] text-neutral-400 tabular-nums whitespace-nowrap truncate">
                      {snapshot.records.currentStreakDays > 0
                        ? `زنجیره فعلی: ${snapshot.records.currentStreakDays} روز متوالی`
                        : 'روزهای دارای نشست مطالعه'}
                    </span>
                  }
                  icon={Flame}
                />
              </div>

              {/* User Records Strip (رکوردهای ثبت‌شده کاربر) */}
              <section
                aria-label="رکوردهای ثبت‌شده کاربر"
                className="bg-white rounded-3xl shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-5 sm:p-6"
              >
                <div className="flex items-center justify-between gap-2 pb-4">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
                      <Award className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-neutral-900 whitespace-nowrap truncate">
                        رکوردهای ثبت‌شده و روند کلی
                      </h2>
                      <p className="text-[11px] text-neutral-500 mt-0.5 whitespace-nowrap truncate">
                        برترین دستاوردهای واقعی ثبت‌شده از ابتدای استفاده
                      </p>
                    </div>
                  </div>
                </div>

                {snapshot.sessionCount === 0 ? (
                  <div className="py-6 text-center text-xs text-neutral-400">
                    پس از ثبت اولین جلسات مطالعه، رکوردهای روزانه و بیشترین تداوم شما در اینجا محاسبه و نمایش داده می‌شود.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                    <div className="p-4 rounded-2xl bg-neutral-100/75 min-w-0">
                      <div className="text-[11px] text-neutral-500 whitespace-nowrap truncate">
                        بیشترین مطالعه در یک روز
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums mt-1 whitespace-nowrap truncate">
                        {snapshot.records.bestDay
                          ? formatDurationFa(snapshot.records.bestDay.totalMinutes)
                          : 'ثبت نشده'}
                      </div>
                      {snapshot.records.bestDay && (
                        <div className="text-[11px] text-neutral-400 tabular-nums mt-1 whitespace-nowrap truncate">
                          {snapshot.records.bestDay.weekdayLabel} · {snapshot.records.bestDay.dateLabel}
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-neutral-100/75 min-w-0">
                      <div className="text-[11px] text-neutral-500 whitespace-nowrap truncate">
                        طولانی‌ترین جلسه مطالعه
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums mt-1 whitespace-nowrap truncate">
                        {snapshot.records.longestSession
                          ? formatDurationFa(snapshot.records.longestSession.durationMinutes)
                          : 'ثبت نشده'}
                      </div>
                      {snapshot.records.longestSession && (
                        <div
                          className="text-[11px] text-neutral-400 tabular-nums mt-1 whitespace-nowrap truncate"
                          title={`${snapshot.records.longestSession.title} · ${snapshot.records.longestSession.dateLabel}`}
                        >
                          {snapshot.records.longestSession.title} · {snapshot.records.longestSession.dateLabel}
                        </div>
                      )}
                    </div>

                    <div className="p-4 rounded-2xl bg-neutral-100/75 min-w-0">
                      <div className="text-[11px] text-neutral-500 whitespace-nowrap truncate">
                        بیشترین تداوم مطالعه
                      </div>
                      <div className="text-sm sm:text-base font-extrabold text-neutral-900 tabular-nums mt-1 whitespace-nowrap truncate">
                        {snapshot.records.longestStreakDays} روز متوالی
                      </div>
                      <div className="text-[11px] text-neutral-400 tabular-nums mt-1 whitespace-nowrap truncate">
                        {snapshot.records.currentStreakDays > 0
                          ? `زنجیره فعال امروز: ${snapshot.records.currentStreakDays} روز`
                          : 'امروز هنوز جلسه‌ای ثبت نشده است'}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                <div className="lg:col-span-5">
                  <GoalDonutChart
                    goals={snapshot.goals}
                    timeGoal={snapshot.timeGoal}
                    periodLabel="کل"
                    dailyGoalMinutes={dailyGoalMinutes}
                    onChangeDailyGoalMinutes={handleChangeDailyGoalMinutes}
                  />
                </div>
                <div className="lg:col-span-7">
                  <SubjectProgressPanel subjects={snapshot.subjects} periodLabel="کل تاریخچه" />
                </div>
              </div>
            </>
          )}

          {/* Honest Workspace Empty Hint when zero sessions & goals exist in the current period */}
          {isEmptyOverall && (
            <div className="bg-white rounded-3xl shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-5 text-center">
              <p className="text-xs font-semibold text-neutral-700">
                در بازه «{snapshot.periodLabel}» هنوز داده‌ای ثبت نشده است.
              </p>
              <p className="text-[11px] text-neutral-400 mt-1">
                مطالعه فایل‌ها، استفاده از تایمر پومودورو و تکمیل تسک‌ها به‌صورت خودکار در این داشبورد ثبت و تحلیل می‌شوند.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

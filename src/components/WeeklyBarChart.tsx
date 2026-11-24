import React, { useState, useEffect, useMemo } from 'react';
import { BarChart3 } from 'lucide-react';
import {
  WeeklyDayBreakdown,
  formatDurationFa,
  formatNumberEn,
} from '../utils/analyticsEngine';

interface WeeklyBarChartProps {
  days: WeeklyDayBreakdown[];
  dailyGoalMinutes: number;
}

function formatCompactMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  if (safe === 0) return '—';
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}د`;
  if (m === 0) return `${h}س`;
  return `${h}س ${m}د`;
}

export const WeeklyBarChart: React.FC<WeeklyBarChartProps> = ({
  days,
  dailyGoalMinutes,
}) => {
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  useEffect(() => {
    if (selectedDayKey && !days.some((d) => d.dayKey === selectedDayKey)) {
      setSelectedDayKey(null);
    }
  }, [days, selectedDayKey]);

  const maxStudyMinutes = useMemo(() => {
    const peak = days.reduce((m, d) => Math.max(m, d.totalMinutes), 0);
    return Math.max(dailyGoalMinutes * 1.25, peak * 1.25, 60);
  }, [days, dailyGoalMinutes]);

  const maxCompletedTasks = useMemo(() => {
    return days.reduce((m, d) => Math.max(m, d.completedTasks), 0);
  }, [days]);

  const goalLineBottomPercent = Math.min(
    86,
    Math.max(8, (dailyGoalMinutes / maxStudyMinutes) * 100)
  );

  return (
    <section
      aria-label="نمودار میله‌ای عملکرد هفتگی از شنبه تا جمعه"
      className="bg-white rounded-3xl shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-5 sm:p-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-neutral-100">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-neutral-900 whitespace-nowrap truncate">
              نمودار عملکرد هفتگی (شنبه تا جمعه)
            </h2>
            <p className="text-[11px] text-neutral-500 mt-0.5 whitespace-nowrap truncate">
              برای مشاهده جزئیات هر روز روی ستون آن کلیک کنید
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-3 text-[11px] text-neutral-600 shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-neutral-900 shrink-0" />
            <span>تایم مطالعه</span>
          </div>
          {maxCompletedTasks > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-600 shrink-0" />
              <span>تسک‌های تکمیل‌شده</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-neutral-500">
            <span className="w-4 border-t border-dashed border-neutral-400 shrink-0" />
            <span className="tabular-nums">هدف روزانه: {formatDurationFa(dailyGoalMinutes)}</span>
          </div>
        </div>
      </div>

      {/* Full-Width 7-Day Bar Chart (Saturday -> Friday) */}
      <div className="pt-5">
        <div className="relative h-60 sm:h-64 flex flex-col justify-end">
          {/* Background Gridlines + Daily Goal Reference Line */}
          <div className="absolute inset-x-0 top-6 bottom-12 pointer-events-none">
            <div
              className="absolute inset-x-0 border-t border-dashed border-neutral-300/90 transition-all duration-300"
              style={{ bottom: `${goalLineBottomPercent}%` }}
            >
              <span className="absolute left-0 -top-4 text-[10px] font-medium text-neutral-400 bg-white/90 px-1 rounded tabular-nums">
                هدف
              </span>
            </div>
            <div className="absolute inset-x-0 bottom-0 border-t border-neutral-200/80" />
          </div>

          {/* Bars Grid */}
          <div className="relative z-10 grid grid-cols-7 gap-1.5 sm:gap-3 h-full">
            {days.map((day, idx) => {
              const isSelected = selectedDayKey === day.dayKey;
              const studyBarPercent =
                day.totalMinutes > 0
                  ? Math.min(82, Math.max(8, (day.totalMinutes / maxStudyMinutes) * 100))
                  : 0;
              const taskBarPercent =
                maxCompletedTasks > 0 && day.completedTasks > 0
                  ? Math.min(18, Math.max(6, (day.completedTasks / maxCompletedTasks) * 16))
                  : 0;
              const hasAnyBar = studyBarPercent > 0 || taskBarPercent > 0;

              // Edge-safe popover alignment for rightmost (شنبه = 0) and leftmost (جمعه = 6) columns in RTL
              const popoverAlignClass =
                idx === 0
                  ? 'right-0'
                  : idx === 6
                  ? 'left-0'
                  : 'left-1/2 -translate-x-1/2';

              return (
                <div key={day.dayKey} className="relative h-full">
                  {isSelected && (
                    <div
                      role="status"
                      className={`absolute -top-2 ${popoverAlignClass} z-30 bg-neutral-900 text-white rounded-xl px-3 py-2 shadow-[0_10px_24px_-4px_rgba(0,0,0,0.35)] text-[11px] whitespace-nowrap pointer-events-none`}
                    >
                      <div className="font-bold flex items-center gap-1.5">
                        <span>{day.weekdayLabel}</span>
                        <span className="text-neutral-400">·</span>
                        <span className="text-neutral-300 font-medium">{day.shortDateLabel}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-neutral-200 tabular-nums">
                        <span>{formatDurationFa(day.totalMinutes)}</span>
                        <span className="text-neutral-500">·</span>
                        <span>{formatNumberEn(day.sessionCount)} جلسه</span>
                        {day.totalTasks > 0 && (
                          <>
                            <span className="text-neutral-500">·</span>
                            <span className="text-blue-400 font-semibold">
                              {formatNumberEn(day.completedTasks)}/{formatNumberEn(day.totalTasks)} تسک
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDayKey((prev) => (prev === day.dayKey ? null : day.dayKey))
                    }
                    aria-pressed={isSelected}
                    aria-label={`${day.weekdayLabel} ${day.shortDateLabel}، مطالعه: ${formatDurationFa(day.totalMinutes)}`}
                    className={`group w-full flex flex-col items-center h-full rounded-2xl px-1 py-1.5 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/25 ${
                      isSelected
                        ? 'bg-neutral-100/95 ring-1 ring-neutral-900/15'
                        : 'hover:bg-neutral-100/60'
                    }`}
                  >
                    {/* Value Label Above Bar */}
                    <span
                      className={`text-[10px] font-bold tabular-nums whitespace-nowrap leading-none mb-1.5 h-3.5 flex items-center ${
                        day.totalMinutes === 0
                          ? 'text-neutral-300'
                          : isSelected
                          ? 'text-neutral-900'
                          : 'text-neutral-600 group-hover:text-neutral-900'
                      }`}
                    >
                      {formatCompactMinutes(day.totalMinutes)}
                    </span>

                    {/* Unified Single Stacked Bar Slot */}
                    <div className="flex-1 w-full flex items-end justify-center pb-1 min-h-0">
                      {hasAnyBar ? (
                        <div
                          className={`w-6 sm:w-8 rounded-t-lg rounded-b-sm overflow-hidden flex flex-col justify-end transition-all duration-300 ${
                            isSelected ? 'shadow-[0_4px_12px_-2px_rgba(0,0,0,0.28)]' : ''
                          }`}
                          style={{ height: `${Math.min(100, studyBarPercent + taskBarPercent)}%` }}
                        >
                          {taskBarPercent > 0 && (
                            <div
                              className={`w-full transition-colors duration-200 ${
                                studyBarPercent > 0 ? 'border-b border-white/80' : ''
                              } ${
                                isSelected
                                  ? 'bg-blue-600'
                                  : 'bg-blue-500/80 group-hover:bg-blue-600'
                              }`}
                              style={{
                                height: `${(taskBarPercent / (studyBarPercent + taskBarPercent)) * 100}%`,
                              }}
                            />
                          )}
                          {studyBarPercent > 0 && (
                            <div
                              className={`w-full transition-colors duration-200 ${
                                isSelected
                                  ? 'bg-neutral-900'
                                  : 'bg-neutral-700/85 group-hover:bg-neutral-900'
                              }`}
                              style={{
                                height: `${(studyBarPercent / (studyBarPercent + taskBarPercent)) * 100}%`,
                              }}
                            />
                          )}
                        </div>
                      ) : (
                        <div
                          className={`w-6 sm:w-8 h-1.5 rounded-full transition-colors ${
                            isSelected
                              ? 'bg-neutral-400/70'
                              : day.isFuture
                              ? 'bg-neutral-200/50'
                              : 'bg-neutral-200/90'
                          }`}
                        />
                      )}
                    </div>

                    {/* Weekday & Date Footer */}
                    <div className="pt-1.5 flex flex-col items-center min-w-0 w-full">
                      <span
                        className={`text-[10px] sm:text-[11px] font-bold whitespace-nowrap truncate max-w-full ${
                          isSelected
                            ? 'text-neutral-900'
                            : day.isToday
                            ? 'text-neutral-800'
                            : day.isFuture
                            ? 'text-neutral-400'
                            : 'text-neutral-600'
                        }`}
                      >
                        {day.weekdayLabel}
                      </span>
                      <span
                        className={`text-[9px] sm:text-[10px] tabular-nums whitespace-nowrap mt-0.5 ${
                          day.isToday
                            ? 'text-neutral-900 font-bold'
                            : 'text-neutral-400 font-medium'
                        }`}
                      >
                        {day.isToday ? 'امروز' : day.shortDateLabel}
                      </span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

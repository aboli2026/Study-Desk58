import React from 'react';
import { Target, Plus, Minus, Clock, CheckCircle2 } from 'lucide-react';
import {
  GoalsSummary,
  StudyTimeGoalSummary,
  formatDurationFa,
  formatNumberEn,
} from '../utils/analyticsEngine';

interface GoalDonutChartProps {
  goals: GoalsSummary;
  timeGoal: StudyTimeGoalSummary;
  periodLabel: string;
  dailyGoalMinutes: number;
  onChangeDailyGoalMinutes: (minutes: number) => void;
}

interface SingleProgressRingProps {
  percent: number;
  displayValue: string;
  subLabel: string;
  strokeColor: string;
  ariaLabel: string;
  muted?: boolean;
}

const SingleProgressRing: React.FC<SingleProgressRingProps> = ({
  percent,
  displayValue,
  subLabel,
  strokeColor,
  ariaLabel,
  muted = false,
}) => {
  const size = 96;
  const center = size / 2;
  const radius = 39;
  const strokeWidth = 8.5;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  const dashOffset = circumference - (clampedPercent / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center shrink-0 w-24 h-24">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={ariaLabel}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#e5e5e5"
          strokeWidth={strokeWidth}
        />
        {clampedPercent > 0 && !muted && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
          />
        )}
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
        <span
          dir="ltr"
          className={`text-lg font-extrabold tabular-nums leading-none ${
            muted ? 'text-neutral-400' : 'text-neutral-900'
          }`}
        >
          {displayValue}
        </span>
        <span className="text-[10px] font-medium text-neutral-500 mt-1 whitespace-nowrap">
          {subLabel}
        </span>
      </div>
    </div>
  );
};

export const GoalDonutChart: React.FC<GoalDonutChartProps> = ({
  goals,
  timeGoal,
  periodLabel,
  dailyGoalMinutes,
  onChangeDailyGoalMinutes,
}) => {
  const { completed, remaining, total, percent: goalsPercent } = goals;

  const isTimeCompleted =
    timeGoal.remainingMinutes === 0 && timeGoal.achievedMinutes > 0;
  const isGoalsCompleted = total > 0 && remaining === 0;

  const stepMinutes = 30;
  const canDecrease = dailyGoalMinutes > 30;
  const canIncrease = dailyGoalMinutes < 720;

  return (
    <section
      aria-label={`نمودار تحقق اهداف و زمان مطالعه ${periodLabel}`}
      className="bg-white rounded-3xl shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-5 sm:p-6 flex flex-col justify-between h-full"
    >
      {/* Card Header + Daily Time Goal Adjuster */}
      <div className="flex items-center justify-between gap-2 pb-4 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shrink-0">
            <Target className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-neutral-900 whitespace-nowrap truncate">
              تحقق زمان و اهداف {periodLabel}
            </h2>
            <p className="text-[11px] text-neutral-500 mt-0.5 whitespace-nowrap truncate">
              {timeGoal.targetLabel}
            </p>
          </div>
        </div>

        {/* Compact Daily Study Goal Stepper */}
        <div
          className="flex items-center gap-1 bg-neutral-100/80 rounded-xl p-1 shrink-0"
          title="تنظیم هدف مطالعه روزانه"
        >
          <button
            type="button"
            disabled={!canDecrease}
            onClick={() =>
              onChangeDailyGoalMinutes(Math.max(30, dailyGoalMinutes - stepMinutes))
            }
            className="w-6 h-6 rounded-lg bg-white text-neutral-700 hover:text-neutral-900 disabled:opacity-40 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20"
            aria-label="کاهش هدف روزانه به میزان 30 دقیقه"
            title="کاهش 30 دقیقه"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-[11px] font-bold text-neutral-800 px-1.5 tabular-nums whitespace-nowrap">
            {formatDurationFa(dailyGoalMinutes)}
          </span>
          <button
            type="button"
            disabled={!canIncrease}
            onClick={() =>
              onChangeDailyGoalMinutes(Math.min(720, dailyGoalMinutes + stepMinutes))
            }
            className="w-6 h-6 rounded-lg bg-white text-neutral-700 hover:text-neutral-900 disabled:opacity-40 flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900/20"
            aria-label="افزایش هدف روزانه به میزان 30 دقیقه"
            title="افزایش 30 دقیقه"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Two Dedicated, Separate Progress Tracks (1 Ring = 1 Metric) */}
      <div className="flex-1 flex flex-col justify-center gap-3.5 min-w-0">
        {/* Track 1: Study Time Goal */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-neutral-100/75 flex items-center gap-4 min-w-0">
          <SingleProgressRing
            percent={timeGoal.percent}
            displayValue={`${formatNumberEn(timeGoal.percent)}%`}
            subLabel={isTimeCompleted ? 'تکمیل شد' : 'از هدف'}
            strokeColor={isTimeCompleted ? '#059669' : '#171717'}
            ariaLabel={`درصد تحقق زمان مطالعه ${periodLabel}: ${timeGoal.percent} درصد`}
          />

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <Clock className="w-3.5 h-3.5 text-neutral-700 shrink-0" />
                <h3 className="text-xs sm:text-[13px] font-bold text-neutral-900 whitespace-nowrap truncate">
                  زمان مطالعه
                </h3>
              </div>
              <span className="text-[11px] font-medium text-neutral-500 tabular-nums whitespace-nowrap shrink-0">
                هدف: {formatDurationFa(timeGoal.targetMinutes)}
              </span>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-neutral-200/80">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-600 whitespace-nowrap">مطالعه‌شده</span>
                <span className="font-bold text-neutral-900 tabular-nums whitespace-nowrap">
                  {formatDurationFa(timeGoal.achievedMinutes)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-600 whitespace-nowrap">باقیمانده تا هدف</span>
                <span
                  className={`font-bold tabular-nums whitespace-nowrap ${
                    isTimeCompleted ? 'text-emerald-700' : 'text-neutral-700'
                  }`}
                >
                  {isTimeCompleted
                    ? 'تکمیل شد'
                    : formatDurationFa(timeGoal.remainingMinutes)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Track 2: Tasks & Goals Completion */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-neutral-100/75 flex items-center gap-4 min-w-0">
          <SingleProgressRing
            percent={goalsPercent}
            displayValue={total > 0 ? `${formatNumberEn(goalsPercent)}%` : '—'}
            subLabel={
              total === 0
                ? 'بدون تسک'
                : isGoalsCompleted
                  ? 'تکمیل شد'
                  : 'تکمیل‌شده'
            }
            strokeColor={isGoalsCompleted ? '#059669' : '#2563eb'}
            ariaLabel={`درصد تحقق اهداف و تسک‌ها ${periodLabel}: ${
              total > 0 ? `${goalsPercent} درصد` : 'بدون تسک'
            }`}
            muted={total === 0}
          />

          <div className="flex-1 min-w-0 space-y-2.5">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <CheckCircle2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    total === 0 ? 'text-neutral-400' : 'text-blue-600'
                  }`}
                />
                <h3 className="text-xs sm:text-[13px] font-bold text-neutral-900 whitespace-nowrap truncate">
                  اهداف و تسک‌ها
                </h3>
              </div>
              <span className="text-[11px] font-medium text-neutral-500 tabular-nums whitespace-nowrap shrink-0">
                {total > 0 ? `${formatNumberEn(total)} هدف` : 'ثبت نشده'}
              </span>
            </div>

            <div className="space-y-1.5 pt-1 border-t border-neutral-200/80">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-600 whitespace-nowrap">تکمیل‌شده</span>
                <span className="font-bold text-neutral-900 tabular-nums whitespace-nowrap">
                  {total > 0
                    ? `${formatNumberEn(completed)} از ${formatNumberEn(total)} هدف`
                    : 'ثبت نشده'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-neutral-600 whitespace-nowrap">باقیمانده</span>
                <span
                  className={`font-bold tabular-nums whitespace-nowrap ${
                    isGoalsCompleted ? 'text-emerald-700' : 'text-neutral-700'
                  }`}
                >
                  {total === 0
                    ? '0 هدف'
                    : isGoalsCompleted
                      ? 'همه انجام شد'
                      : `${formatNumberEn(remaining)} هدف`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

import React from 'react';
import {
  FileUp,
  Edit3,
  Timer,
  BarChart2,
  BookOpen,
  ChevronLeft,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import { ActiveTab, StudyFile } from '../types';
import { useDisplayRefreshRate } from '../utils/performanceEngine';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  currentFile: StudyFile | null;
  onOpenFilePicker?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  currentFile,
  onOpenFilePicker,
}) => {
  const perfStats = useDisplayRefreshRate();
  const navItems: {
    id: ActiveTab;
    label: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'open-file',
      label: 'باز کردن فایل',
      icon: FileUp,
    },
    {
      id: 'library',
      label: 'کتابخانه',
      icon: BookOpen,
    },
    {
      id: 'notes',
      label: 'یادداشت',
      icon: Edit3,
    },
    {
      id: 'pomodoro',
      label: 'پومودورو',
      icon: Timer,
    },
    {
      id: 'analytics',
      label: 'تحلیل عملکرد',
      icon: BarChart2,
    },
    {
      id: 'settings',
      label: 'تنظیمات',
      icon: SlidersHorizontal,
    },
  ];

  return (
    <>
      {/* =========================================================================
          1. Desktop & Tablet Horizontal Sidebar (نمایشگرهای افقی و دسکتاپ)
          ========================================================================= */}
      <div className="hidden md:flex w-64 lg:w-72 h-full bg-neutral-100/90 rounded-3xl shadow-[0_14px_34px_-4px_rgba(0,0,0,0.14),0_4px_12px_-2px_rgba(0,0,0,0.09)] flex-col shrink-0 select-none overflow-hidden">
        {/* Brand Header */}
        <div className="mx-3.5 px-0.5 pt-4 pb-3 border-b border-neutral-200 flex items-center gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-md">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-neutral-900">میز مطالعه</h1>
          </div>
        </div>

        {/* Navigation Items List */}
        <div className="flex-1 p-3.5 space-y-2.5 overflow-y-auto custom-column-scroll">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;

            return (
              <div
                key={item.id}
                onClick={() => {
                  onTabChange(item.id);
                  if (item.id === 'open-file' && onOpenFilePicker) {
                    onOpenFilePicker();
                  }
                }}
                className={`p-3.5 rounded-2xl cursor-pointer flex items-center justify-between group ios-spring-card ${
                  isActive
                    ? 'bg-neutral-900 text-white shadow-[0_12px_28px_-4px_rgba(0,0,0,0.32),0_4px_10px_-2px_rgba(0,0,0,0.18)]'
                    : 'bg-white text-neutral-700 shadow-[0_8px_22px_-4px_rgba(0,0,0,0.12),0_3px_8px_-2px_rgba(0,0,0,0.07)] hover:shadow-[0_14px_30px_-4px_rgba(0,0,0,0.17),0_4px_12px_-2px_rgba(0,0,0,0.10)] hover:-translate-y-0.5'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                      isActive
                        ? 'bg-neutral-800 text-white'
                        : 'bg-neutral-100 text-neutral-700 group-hover:bg-neutral-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-xs md:text-sm font-bold truncate ${
                        isActive ? 'text-white' : 'text-neutral-900'
                      }`}
                    >
                      {item.label}
                    </div>
                  </div>
                </div>

                <ChevronLeft
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isActive
                      ? 'text-neutral-300 -translate-x-0.5'
                      : 'text-neutral-400 group-hover:text-neutral-700'
                  }`}
                />
              </div>
            );
          })}
        </div>

        {/* Current File Card Indicator (if open) */}
        {currentFile && (
          <div className="px-3.5 pb-2.5 shrink-0">
            <div className="p-3 rounded-2xl bg-white shadow-[0_8px_22px_-4px_rgba(0,0,0,0.12),0_3px_8px_-2px_rgba(0,0,0,0.07)]">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="text-[11px] font-semibold text-neutral-600">فایل در حال مطالعه:</span>
              </div>
              <div className="text-xs font-bold text-neutral-900 truncate" title={currentFile.name}>
                {currentFile.name}
              </div>
            </div>
          </div>
        )}

        {/* Real-Time Display Refresh Rate Status Bar */}
        <div className="mx-3.5 mb-3.5 px-0.5 pt-2.5 border-t border-neutral-200 text-[11px] select-none shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  perfStats.isSynced ? 'bg-emerald-500 ring-2 ring-emerald-200 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="text-neutral-600 font-medium truncate text-[10px] sm:text-[11px]">
                {perfStats.refreshRate >= 120
                  ? 'نمایشگر ۱۲۰ هرتز'
                  : `نمایشگر ${perfStats.refreshRate} هرتز`}
              </span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span className="font-mono font-semibold text-[10px] sm:text-[11px] text-neutral-600">
                {perfStats.fps} FPS
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. Mobile & Portrait Bottom Navigation Bar (نمایشگرهای عمودی و موبایل)
          کاملاً سازگار با لمس انگشت، دسترسی آسان با شست و بدون اشغال عرض صفحه
          ========================================================================= */}
      <div className="flex md:hidden w-full order-last md:order-none bg-white rounded-2xl shadow-[0_10px_28px_-4px_rgba(0,0,0,0.16),0_4px_12px_-2px_rgba(0,0,0,0.10)] shrink-0 px-1 py-1.5 justify-around items-center z-40 select-none">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              onClick={() => {
                onTabChange(item.id);
                if (item.id === 'open-file' && onOpenFilePicker) {
                  onOpenFilePicker();
                }
              }}
              className={`flex-1 py-1.5 px-1 flex flex-col items-center justify-center rounded-xl cursor-pointer transition-all ${
                isActive
                  ? 'bg-neutral-900 text-white font-bold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              }`}
            >
              <Icon className="w-4 h-4 mb-0.5 shrink-0" />
              <span className="text-[10px] leading-tight truncate max-w-[56px]">
                {item.id === 'open-file'
                  ? 'فایل'
                  : item.id === 'analytics'
                  ? 'آمار'
                  : item.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
};

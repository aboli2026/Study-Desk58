import React, { useState, useMemo, useRef, useEffect, useDeferredValue, useCallback, startTransition, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  StickyNote,
  FileText,
  Search,
  Plus,
  BookOpen,
  Pin,
  Trash2,
  Edit2,
  Copy,
  Check,
  X,
  FolderOpen,
  FolderPlus,
  Folder,
  Upload,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  ExternalLink,
  Image as ImageIcon,
  Type,
  Eye,
  Sparkles,
  CheckSquare,
  Clock,
  RotateCcw,
  CheckCircle2,
  ZoomIn,
  ArrowUpDown,
  Calendar,
  ArrowDownAZ,
  ArrowUpAZ,
  Edit3,
} from 'lucide-react';
import { NoteItem, NoteFolder, StudyFile, StickyNoteItem, StudyTask, extractTimestampFromAny, formatDisplayDate } from '../types';

export type NoteSortOption = 'newest' | 'oldest';

export const NOTE_SORT_OPTIONS: Record<
  NoteSortOption,
  { label: string; shortLabel: string; icon: React.FC<{ className?: string }> }
> = {
  newest: { label: 'جدیدترین یادداشت‌ها', shortLabel: 'جدیدترین', icon: Clock },
  oldest: { label: 'قدیمی‌ترین یادداشت‌ها', shortLabel: 'قدیمی‌ترین', icon: Calendar },
};

export const NOTES_SORT_STORAGE_KEY = 'study_notes_sort_by';

export function getNoteTimestamp(note: NoteItem, field?: 'createdAt' | 'updatedAt'): number {
  if (field === 'createdAt') {
    return extractTimestampFromAny(note.id, note.createdAt);
  }
  if (field === 'updatedAt') {
    return extractTimestampFromAny(note.id, note.updatedAt || note.createdAt);
  }
  const tCreated = extractTimestampFromAny(note.id, note.createdAt);
  const tUpdated = extractTimestampFromAny(note.id, note.updatedAt);
  return Math.max(tCreated, tUpdated);
}
import { getAllTasksFromStorage, saveAllTasksToStorage } from '../utils/fileStorage';
import { playTaskCompleteSound, playTaskUndoSound } from '../utils/pomodoroAudio';
import {
  cleanPlainTitleText,
  htmlToCleanPlainText,
  normalizeStickyContentToHtml,
} from '../utils/richPaste';
import { ImageZoomLightbox } from './ImageZoomLightbox';
import { StickyNoteDrawer } from './StickyNoteDrawer';
import {
  normalizePersianSearchText,
  analyzeSearchMatch,
  extractMatchingExcerpts,
  HighlightedText,
  highlightHtmlContent,
  SearchMatchAnalysis,
} from '../utils/searchHighlight';

export interface FileStickyNoteEntry {
  fileId: string;
  fileName: string;
  file: StudyFile;
  note: StickyNoteItem;
}

interface NotesOverviewProps {
  notes: NoteItem[];
  folders: NoteFolder[];
  studyFiles?: StudyFile[];
  onSelectNoteToEdit: (noteId: string) => void;
  onStartNewNote: () => void;
  onTogglePinNote: (noteId: string, currentPin?: boolean) => void;
  onDeleteNote: (noteId: string) => void;
  onOpenFileAtPage?: (file: StudyFile, pageNumber: number) => void;
  onUpdateStickyNote?: (fileId: string, updatedNote: StickyNoteItem) => void;
  onDeleteStickyNote?: (fileId: string, stickyNoteId: string) => void;
  onSwitchToEditor: () => void;
  onAddFolder?: (folder: Omit<NoteFolder, 'id' | 'createdAt'>) => void;
  onUpdateFolder?: (folderId: string, name: string, color?: string, parentId?: string | null) => void;
  onDeleteFolder?: (folderId: string) => void;
  onTriggerNewFile?: () => void;
}

const PRESET_COLORS = [
  { bg: '#fef08a', text: '#713f12', name: 'زرد کلاسیک' },
  { bg: '#bbf7d0', text: '#14532d', name: 'سبز نعنایی' },
  { bg: '#fed7aa', text: '#7c2d12', name: 'هلویی' },
  { bg: '#bae6fd', text: '#0c4a6e', name: 'آبی آسمانی' },
  { bg: '#e9d5ff', text: '#581c87', name: 'بنفش اسطوخودوس' },
  { bg: '#fecdd3', text: '#881337', name: 'صورتی ملایم' },
  { bg: '#f3f4f6', text: '#1f2937', name: 'خاکستری مینیمال' },
];

const FOLDER_COLOR_PALETTE = [
  { name: 'آبی', value: '#2563eb', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  { name: 'زمردی', value: '#059669', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  { name: 'کهربایی', value: '#d97706', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  { name: 'بنفش', value: '#7c3aed', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  { name: 'رز', value: '#e11d48', bg: 'bg-rose-50', text: 'text-rose-700', dot: 'bg-rose-500' },
  { name: 'فیروزه‌ای', value: '#0891b2', bg: 'bg-cyan-50', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  { name: 'نارنجی', value: '#ea580c', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  { name: 'دودی', value: '#4b5563', bg: 'bg-neutral-100', text: 'text-neutral-700', dot: 'bg-neutral-500' },
];

/**
 * Converts HTML content to clean readable plain text while strictly preserving
 * paragraph and line breaks so preview cards and text viewers match how the user wrote them.
 */
function htmlToPreviewText(html: string): string {
  return htmlToCleanPlainText(html);
}

/**
 * Strips HTML tags and collapses spaces for search queries
 */
function stripHtml(html: string): string {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

/**
 * Helper to get all descendant folder IDs for a given folder ID
 */
function getFolderAndDescendantIds(folderId: string, allFolders: NoteFolder[]): string[] {
  const result: string[] = [folderId];
  const queue: string[] = [folderId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    const children = allFolders.filter((f) => f.parentId === curr);
    children.forEach((c) => {
      result.push(c.id);
      queue.push(c.id);
    });
  }
  return result;
}

function extractImagesFromHtml(html: string): string[] {
  if (!html || !html.includes('<img')) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return Array.from(doc.querySelectorAll('img'))
      .map((img) => img.getAttribute('src') || '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

interface ActiveViewerItem {
  type: 'sticky' | 'note';
  id: string;
  title: string;
  content: string;
  rawHtml?: string;
  sourceLabel: string;
  pageNumber?: number;
  color?: string;
  textColor?: string;
  date?: string;
  originalEntry?: FileStickyNoteEntry;
  originalNote?: NoteItem;
  isBold?: boolean;
  imageUrl?: string;
  images?: string[];
}

const CARD_BATCH_SIZE = 24;

interface StickyNoteGridCardProps {
  entry: FileStickyNoteEntry;
  rawContent: string;
  displayTitle: string;
  onOpenViewer: (entry: FileStickyNoteEntry) => void;
  onOpenFileAtPage?: (file: StudyFile, pageNumber: number) => void;
  onCopyText: (text: string, label: string) => void;
  onOpenEdit: (entry: FileStickyNoteEntry, e?: React.MouseEvent) => void;
  onRequestDelete: (entry: FileStickyNoteEntry) => void;
  onOpenLightbox: (state: { images: string[]; index: number; title?: string }) => void;
}

const StickyNoteGridCard = memo<StickyNoteGridCardProps>(
  ({
    entry,
    rawContent,
    displayTitle,
    onOpenViewer,
    onOpenFileAtPage,
    onCopyText,
    onOpenEdit,
    onRequestDelete,
    onOpenLightbox,
  }) => {
    const noteBg = entry.note.color || '#fef08a';
    const hasImages = Boolean((entry.note.images && entry.note.images.length > 0) || entry.note.imageUrl);
    const formattedDate = formatDisplayDate(entry.note.createdAt) || 'ثبت شده';

    return (
      <article
        onClick={() => onOpenViewer(entry)}
        className={`sticky-card-contain rounded-3xl bg-white shadow-[0_12px_30px_-4px_rgba(0,0,0,0.13),0_4px_10px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_44px_-4px_rgba(0,0,0,0.19),0_8px_20px_-2px_rgba(0,0,0,0.11)] transition-[transform,box-shadow] duration-200 flex flex-col ${
          hasImages ? 'h-[248px] sm:h-[260px]' : 'h-[196px] sm:h-[208px]'
        } group cursor-pointer overflow-hidden relative select-none`}
        title="برای باز کردن و مطالعه کامل کلیک کنید"
      >
        <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: noteBg }} />
        <div className="p-4 sm:p-5 pb-2 flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <BookOpen className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
              <span className="text-[11px] sm:text-xs font-bold text-neutral-700 truncate max-w-[170px]" title={entry.fileName}>
                {entry.fileName}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="px-2 py-0.5 rounded-lg text-[10.5px] font-black font-mono shadow-2xs text-black"
                style={{
                  backgroundColor: noteBg,
                  color: '#000000',
                }}
              >
                صفحه {entry.note.pageNumber}
              </span>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col justify-start px-0.5 w-full text-right"
            dir="rtl"
          >
            <h3
              className="text-sm font-extrabold text-neutral-950 group-hover:text-black whitespace-normal break-words leading-snug mb-1.5 tracking-tight shrink-0 text-right w-full"
              dir="rtl"
            >
              {displayTitle}
            </h3>

            {hasImages && (
              <div
                className="mb-2 shrink-0 w-full flex justify-start"
                dir="rtl"
                onClick={(e) => {
                  e.stopPropagation();
                  const allImgs =
                    entry.note.images && entry.note.images.length > 0
                      ? entry.note.images
                      : [entry.note.imageUrl!];
                  onOpenLightbox({
                    images: allImgs,
                    index: 0,
                    title: displayTitle,
                  });
                }}
                title="برای نمایش تمام‌صفحه با قابلیت زوم کلیک کنید"
              >
                {!entry.note.images || entry.note.images.length <= 1 ? (
                  <div className="rounded-2xl overflow-hidden h-14 w-24 bg-neutral-100 flex items-center justify-center relative group/cardimg shadow-2xs">
                    <img
                      src={entry.note.images?.[0] || entry.note.imageUrl}
                      alt="پیوست استیکی‌نوت"
                      className="w-full h-full object-cover transition-transform group-hover/cardimg:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/cardimg:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <ZoomIn className="w-4 h-4 drop-shadow-xs" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 w-full max-w-[160px]">
                    {entry.note.images.slice(0, 2).map((img, idx) => (
                      <div key={idx} className="relative rounded-xl overflow-hidden h-14 bg-neutral-100 shadow-2xs group/cardimg">
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover/cardimg:scale-105"
                          loading="lazy"
                          decoding="async"
                        />
                        {idx === 1 && entry.note.images!.length > 2 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[11px] font-bold font-mono">
                            +{entry.note.images!.length - 2}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/cardimg:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <ZoomIn className="w-4 h-4 drop-shadow-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className={`text-xs sm:text-[13px] text-neutral-950 font-medium leading-[1.65] select-text font-sans flex-1 min-h-0 overflow-hidden text-right w-full ${
                entry.note.isBold ? 'font-bold' : 'font-normal'
              } ${hasImages ? 'line-clamp-3' : 'line-clamp-4'}`}
              dir="rtl"
              style={{ color: '#000000' }}
            >
              {rawContent ? (
                rawContent
              ) : (
                <span className="text-neutral-500 italic font-normal text-[11px]">بدون متن...</span>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-5 py-2 bg-neutral-100/65 flex items-center justify-between gap-2 shrink-0 mt-auto">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-neutral-400 font-mono truncate">{formattedDate}</span>

            {onOpenFileAtPage && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFileAtPage(entry.file, entry.note.pageNumber);
                }}
                className="px-2 py-1 text-[11px] font-bold text-neutral-700 hover:text-neutral-900 bg-white hover:bg-neutral-100 rounded-lg cursor-pointer flex items-center gap-1 shadow-2xs"
                title="رفتن به این صفحه در کتاب"
              >
                <ExternalLink className="w-3 h-3 text-neutral-500" />
                <span className="hidden sm:inline">مشاهده در فایل</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopyText(rawContent || htmlToCleanPlainText(entry.note.content), 'متن یادداشت');
              }}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg cursor-pointer"
              title="کپی متن"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => onOpenEdit(entry, e)}
              className="p-1.5 text-neutral-500 hover:text-sky-600 hover:bg-sky-50 rounded-lg cursor-pointer"
              title="ویرایش سریع"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(entry);
              }}
              className="p-1.5 text-neutral-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
              title="حذف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </article>
    );
  }
);

interface StandaloneNoteGridCardProps {
  note: NoteItem;
  noteFolder?: NoteFolder;
  preview: string;
  cardImages: string[];
  onOpenViewer: (note: NoteItem) => void;
  onTogglePinNote: (noteId: string, currentPin?: boolean) => void;
  onCopyText: (text: string, label: string) => void;
  onSelectNoteToEdit: (noteId: string) => void;
  onRequestDelete: (note: NoteItem) => void;
  onOpenLightbox: (state: { images: string[]; index: number; title?: string }) => void;
}

const StandaloneNoteGridCard = memo<StandaloneNoteGridCardProps>(
  ({
    note,
    noteFolder,
    preview,
    cardImages,
    onOpenViewer,
    onTogglePinNote,
    onCopyText,
    onSelectNoteToEdit,
    onRequestDelete,
    onOpenLightbox,
  }) => {
    const noteTitle = note.title || 'بدون عنوان';
    const displayDate = note.updatedAt
      ? `ویرایش ${formatDisplayDate(note.updatedAt)}`
      : formatDisplayDate(note.createdAt);

    return (
      <article
        onClick={() => onOpenViewer(note)}
        className={`sticky-card-contain rounded-3xl p-4 sm:p-5 bg-white ios-spring-card flex flex-col h-[196px] sm:h-[208px] group cursor-pointer overflow-hidden relative select-none ${
          note.isPinned
            ? 'ring-2 ring-amber-400/70 bg-gradient-to-b from-amber-50/25 to-white shadow-[0_14px_34px_-4px_rgba(245,158,11,0.18),0_4px_12px_-2px_rgba(0,0,0,0.08)]'
            : 'shadow-[0_12px_30px_-4px_rgba(0,0,0,0.13),0_4px_10px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_20px_44px_-4px_rgba(0,0,0,0.19),0_8px_20px_-2px_rgba(0,0,0,0.11)]'
        }`}
        title="برای مشاهده متن کامل کلیک کنید"
      >
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2.5 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center shrink-0 transition-colors shadow-2xs">
                <FileText className="w-4 h-4" />
              </div>

              {noteFolder ? (
                <div className="flex items-center gap-1.5 min-w-0 text-xs text-neutral-500 font-medium">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: noteFolder.color || '#2563eb' }}
                  />
                  <span className="truncate max-w-[120px]">{noteFolder.name}</span>
                </div>
              ) : note.category ? (
                <div className="flex items-center gap-1.5 min-w-0 text-xs text-neutral-500 font-medium">
                  <span className="w-2 h-2 rounded-full shrink-0 bg-blue-600" />
                  <span className="truncate max-w-[120px]">{note.category}</span>
                </div>
              ) : (
                <span className="text-xs text-neutral-400">عمومی</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-[11px] text-neutral-400 font-mono tabular-nums">
                {formatDisplayDate(note.createdAt)}
              </span>
              {note.isPinned && (
                <span className="p-1 text-amber-500" title="سنجاق‌شده">
                  <Pin className="w-3.5 h-3.5 fill-amber-500" />
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col">
            <h3
              className="text-sm font-bold text-neutral-900 group-hover:text-black whitespace-normal break-words leading-snug mb-1.5 shrink-0 text-right w-full"
              dir="rtl"
            >
              {noteTitle}
            </h3>

            {cardImages.length > 0 && (
              <div
                className="mb-2 shrink-0 w-full flex justify-start"
                dir="rtl"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLightbox({
                    images: cardImages,
                    index: 0,
                    title: note.title || 'تصویر یادداشت',
                  });
                }}
                title="برای نمایش تمام‌صفحه با قابلیت زوم کلیک کنید"
              >
                {cardImages.length === 1 ? (
                  <div className="rounded-2xl overflow-hidden h-14 w-24 bg-neutral-100 flex items-center justify-center relative group/cardimg shadow-2xs">
                    <img
                      src={cardImages[0]}
                      alt="تصویر یادداشت"
                      className="w-full h-full object-cover transition-transform group-hover/cardimg:scale-105"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/cardimg:opacity-100 transition-opacity flex items-center justify-center text-white">
                      <ZoomIn className="w-4 h-4 drop-shadow-xs" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 w-full max-w-[160px]">
                    {cardImages.slice(0, 2).map((img, idx) => (
                      <div
                        key={idx}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenLightbox({
                            images: cardImages,
                            index: idx,
                            title: note.title || 'تصویر یادداشت',
                          });
                        }}
                        className="relative rounded-xl overflow-hidden h-14 bg-neutral-100 shadow-2xs group/cardimg"
                      >
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-cover transition-transform group-hover/cardimg:scale-105"
                          loading="lazy"
                          decoding="async"
                        />
                        {idx === 1 && cardImages.length > 2 && (
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[11px] font-bold font-mono">
                            +{cardImages.length - 2}
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/cardimg:opacity-100 transition-opacity flex items-center justify-center text-white">
                          <ZoomIn className="w-4 h-4 drop-shadow-xs" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <p
              className={`text-xs sm:text-[13px] text-neutral-600 flex-1 min-h-0 ${
                cardImages.length > 0 ? 'line-clamp-2' : 'line-clamp-3'
              } leading-[1.65] overflow-hidden whitespace-pre-line font-sans select-text text-right`}
              dir="rtl"
            >
              {preview ? preview : cardImages.length > 0 ? '' : 'بدون متن'}
            </p>
          </div>
        </div>

        <div className="mt-auto pt-2.5 flex items-center justify-between shrink-0">
          <span className="text-[11px] text-neutral-400 font-mono">{displayDate}</span>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTogglePinNote(note.id, note.isPinned);
              }}
              className={`p-1.5 rounded-xl cursor-pointer ios-spring-tool ${
                note.isPinned
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
              }`}
              title={note.isPinned ? 'برداشتن سنجاق' : 'سنجاق کردن'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'fill-amber-500' : ''}`} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCopyText(preview || htmlToPreviewText(note.content), 'متن یادداشت');
              }}
              className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-xl cursor-pointer ios-spring-tool"
              title="کپی متن"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelectNoteToEdit(note.id);
              }}
              className="p-1.5 text-neutral-400 hover:text-sky-600 hover:bg-sky-50 rounded-xl cursor-pointer ios-spring-tool"
              title="ویرایش در ویرایشگر پیشرفته"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestDelete(note);
              }}
              className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer ios-spring-tool"
              title="حذف"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </article>
    );
  }
);

export const NotesOverview: React.FC<NotesOverviewProps> = ({
  notes,
  folders,
  studyFiles = [],
  onSelectNoteToEdit,
  onStartNewNote,
  onTogglePinNote,
  onDeleteNote,
  onOpenFileAtPage,
  onUpdateStickyNote,
  onDeleteStickyNote,
  onSwitchToEditor,
  onAddFolder,
  onUpdateFolder,
  onDeleteFolder,
  onTriggerNewFile,
}) => {
  // Main Tab State: 'notes' (یادداشت‌ها) | 'tasks' (تسک‌ها) | 'sticky-notes' (استیکی‌نوت‌ها)
  const [activeTab, setActiveTab] = useState<'notes' | 'tasks' | 'sticky-notes'>('notes');
  const renderedTab = useDeferredValue(activeTab);

  // Sticky Notes Filter (by file)
  const [selectedFileId, setSelectedFileId] = useState<string>('all');

  // Standalone Notes Filter (by folder)
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');

  // Search input (immediate input state + deferred heavy filtering/highlighting)
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResultLimit, setSearchResultLimit] = useState(50);

  // Incremental card rendering limits so switching tabs with hundreds of sticky notes/notes stays 60fps
  const [stickyCardLimit, setStickyCardLimit] = useState(CARD_BATCH_SIZE);
  const [noteCardLimit, setNoteCardLimit] = useState(CARD_BATCH_SIZE);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const stickyLoadMoreRef = useRef<HTMLDivElement | null>(null);
  const noteLoadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSearchResultLimit(50);
  }, [deferredSearchQuery, activeTab, selectedFileId, selectedFolderId]);

  useEffect(() => {
    setStickyCardLimit(CARD_BATCH_SIZE);
  }, [activeTab, selectedFileId]);

  useEffect(() => {
    setNoteCardLimit(CARD_BATCH_SIZE);
  }, [activeTab, selectedFolderId]);

  // Sort State persisted in localStorage (مرتب‌سازی بر اساس جدیدترین، آخرین ویرایش، قدیمی‌ترین و الفبا)
  const [sortBy, setSortBy] = useState<NoteSortOption>(() => {
    try {
      const saved = localStorage.getItem(NOTES_SORT_STORAGE_KEY);
      if (saved && saved in NOTE_SORT_OPTIONS) return saved as NoteSortOption;
    } catch {}
    return 'newest';
  });
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(NOTES_SORT_STORAGE_KEY, sortBy);
    } catch {}
  }, [sortBy]);

  // Category Submenu Dropdown Popover Anchor (زیرمجموعه کشویی دسته‌بندی‌ها دقیقاً مانند کتابخانه)
  const [isCategorySubmenuOpen, setIsCategorySubmenuOpen] = useState(false);
  const categorySubmenuRef = useRef<HTMLDivElement | null>(null);

  // File Submenu Dropdown Popover Anchor for Sticky Notes (زیرمجموعه کشویی فیلتر فایل‌ها)
  const [isFileSubmenuOpen, setIsFileSubmenuOpen] = useState(false);
  const fileSubmenuRef = useRef<HTMLDivElement | null>(null);

  // Close category, file & sort submenus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (categorySubmenuRef.current && !categorySubmenuRef.current.contains(e.target as Node)) {
        setIsCategorySubmenuOpen(false);
      }
      if (fileSubmenuRef.current && !fileSubmenuRef.current.contains(e.target as Node)) {
        setIsFileSubmenuOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setIsSortDropdownOpen(false);
      }
    };
    if (isCategorySubmenuOpen || isFileSubmenuOpen || isSortDropdownOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      return () => document.removeEventListener('mousedown', handleOutsideClick);
    }
  }, [isCategorySubmenuOpen, isFileSubmenuOpen, isSortDropdownOpen]);

  // Clean Reader Window Modal State (پنجره تمیز، شارپ و خلوت برای مرور و خواندن کامل)
  const [viewingItem, setViewingItem] = useState<ActiveViewerItem | null>(null);
  const [readerFontSize, setReaderFontSize] = useState<'normal' | 'large' | 'huge'>('large');
  const viewerBodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!viewingItem || !searchQuery.trim()) return;
    const timer = setTimeout(() => {
      const hit = viewerBodyRef.current?.querySelector('mark');
      if (hit) {
        hit.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [viewingItem, searchQuery]);

  // Fullscreen Zoom Lightbox State
  const [lightboxState, setLightboxState] = useState<{
    images: string[];
    index: number;
    title?: string;
  } | null>(null);

  // Inline expanded sticky note cards (امکان مطالعه کامل یادداشت مستقیماً در کارت بدون نیاز به پاپ‌آپ)
  const [expandedStickyIds, setExpandedStickyIds] = useState<Record<string, boolean>>({});

  const toggleExpandSticky = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedStickyIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Sticky Note Edit Drawer
  const [editingStickyNote, setEditingStickyNote] = useState<FileStickyNoteEntry | null>(null);

  // Folder Management Modal State (ایجاد و ویرایش پوشه‌ها هماهنگ با دیزاین سراسری)
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<NoteFolder | null>(null);
  const [parentFolderIdInput, setParentFolderIdInput] = useState<string | null>(null);
  const [folderNameInput, setFolderNameInput] = useState('');
  const [folderColorInput, setFolderColorInput] = useState('#2563eb');
  const [folderToDelete, setFolderToDelete] = useState<NoteFolder | null>(null);

  // Delete Confirmations
  const [deletingStickyNote, setDeletingStickyNote] = useState<FileStickyNoteEntry | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteItem | null>(null);

  // Copy toast notification
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  const showCopyToast = (msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => {
      setCopiedToast(null);
    }, 2200);
  };

  // Tasks State & Operations (تسک‌های مطالعه با محیط خلوت، تمیز و امکان ثبت آسان)
  const [tasks, setTasks] = useState<StudyTask[]>(() => getAllTasksFromStorage());
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<StudyTask | null>(null);
  const [taskTitleInput, setTaskTitleInput] = useState('');
  const [taskDescInput, setTaskDescInput] = useState('');
  const [taskPriorityInput, setTaskPriorityInput] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskDueDateInput, setTaskDueDateInput] = useState('');
  const [animatingTaskIds, setAnimatingTaskIds] = useState<Record<string, boolean>>({});

  // Handle Escape key to close any active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxState) {
          setLightboxState(null);
          return;
        }
        if (isCategorySubmenuOpen) {
          setIsCategorySubmenuOpen(false);
          return;
        }
        if (isSortDropdownOpen) {
          setIsSortDropdownOpen(false);
          return;
        }
        if (isTaskModalOpen) setIsTaskModalOpen(false);
        if (viewingItem) setViewingItem(null);
        if (isFolderModalOpen) setIsFolderModalOpen(false);
        if (editingStickyNote) setEditingStickyNote(null);
        if (folderToDelete) setFolderToDelete(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxState, isCategorySubmenuOpen, isSortDropdownOpen, isTaskModalOpen, viewingItem, isFolderModalOpen, editingStickyNote, folderToDelete]);

  // Persist tasks whenever changed (skip redundant initial mount write)
  const didMountTasksRef = useRef(false);
  useEffect(() => {
    if (!didMountTasksRef.current) {
      didMountTasksRef.current = true;
      return;
    }
    saveAllTasksToStorage(tasks);
  }, [tasks]);

  const activeTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.completed)
      .sort((a, b) => {
        const priorityWeights: Record<string, number> = { high: 3, medium: 2, low: 1 };
        const weightA = priorityWeights[a.priority || 'medium'] || 2;
        const weightB = priorityWeights[b.priority || 'medium'] || 2;
        if (weightA !== weightB) return weightB - weightA;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [tasks]);

  const completedTasks = useMemo(() => {
    return tasks
      .filter((t) => t.completed)
      .sort((a, b) => {
        const timeA = a.completedAt || a.createdAt;
        const timeB = b.completedAt || b.createdAt;
        return new Date(timeB).getTime() - new Date(timeA).getTime();
      });
  }, [tasks]);

  const activeTasksCount = activeTasks.length;
  const completedTasksCount = completedTasks.length;

  const handleToggleTask = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    if (!task.completed) {
      // پخش صدای دیرینگ مینیمال و آرام‌بخش با وب آودیو
      playTaskCompleteSound(0.6);

      // فعال‌سازی انیمیشن اسلایدی و مشکی شدن کارت قبل از انتقال
      setAnimatingTaskIds((prev) => ({ ...prev, [taskId]: true }));
      setTimeout(() => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  completed: true,
                  completedAt: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
                  completedTimestamp: new Date().toISOString(),
                }
              : t
          )
        );
        setAnimatingTaskIds((prev) => {
          const next = { ...prev };
          delete next[taskId];
          return next;
        });
        showCopyToast('تسک تکمیل شد و به ستون چپ منتقل گردید');
      }, 480);
    } else {
      // پخش صدای ملایم برای بازگردانی تسک
      playTaskUndoSound(0.35);

      // بازگردانی از ستون انجام‌شده‌ها به لیست فعال
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                completed: false,
                completedAt: undefined,
                completedTimestamp: undefined,
              }
            : t
        )
      );
      showCopyToast('تسک مجدداً به لیست کارهای فعال اضافه شد');
    }
  };

  const handleDeleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    showCopyToast('تسک حذف شد');
  };

  const handleOpenAddTaskModal = () => {
    setEditingTask(null);
    setTaskTitleInput('');
    setTaskDescInput('');
    setTaskPriorityInput('medium');
    setTaskDueDateInput('');
    setIsTaskModalOpen(true);
  };

  const handleOpenEditTaskModal = (task: StudyTask) => {
    setEditingTask(task);
    setTaskTitleInput(task.title);
    setTaskDescInput(task.description || '');
    setTaskPriorityInput(task.priority || 'medium');
    setTaskDueDateInput(task.dueDate || '');
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = taskTitleInput.trim();
    if (!trimmed) return;

    if (editingTask) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === editingTask.id
            ? {
                ...t,
                title: trimmed,
                description: taskDescInput.trim() || undefined,
                priority: taskPriorityInput,
                dueDate: taskDueDateInput.trim() || undefined,
              }
            : t
        )
      );
      showCopyToast('تسک بروزرسانی شد');
    } else {
      const newTask: StudyTask = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: trimmed,
        description: taskDescInput.trim() || undefined,
        completed: false,
        priority: taskPriorityInput,
        dueDate: taskDueDateInput.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      setTasks((prev) => [newTask, ...prev]);
      showCopyToast('تسک جدید اضافه شد');
    }

    setIsTaskModalOpen(false);
  };

  const handleClearCompletedTasks = () => {
    setTasks((prev) => prev.filter((t) => !t.completed));
    showCopyToast('تسک‌های انجام‌شده پاکسازی شدند');
  };

  // Organize root folders and subcategories map
  const rootFolders = useMemo(() => {
    return folders.filter((f) => !f.parentId || !folders.some((p) => p.id === f.parentId));
  }, [folders]);

  const subfoldersMap = useMemo(() => {
    const map: Record<string, NoteFolder[]> = {};
    folders.forEach((f) => {
      if (f.parentId) {
        if (!map[f.parentId]) map[f.parentId] = [];
        map[f.parentId].push(f);
      }
    });
    return map;
  }, [folders]);

  // Flatten all sticky notes from files using O(N) Schwartzian transform (avoids O(N log N) date parsing)
  const allStickyNotes: FileStickyNoteEntry[] = useMemo(() => {
    const items: {
      entry: FileStickyNoteEntry;
      time: number;
      numId: number;
    }[] = [];

    (studyFiles || []).forEach((file) => {
      (file.stickyNotes || []).forEach((note) => {
        const idStr = String(note.id);
        const idMatch = idStr.match(/(\d{10,14})/);
        items.push({
          entry: {
            fileId: file.id,
            fileName: file.name,
            file,
            note,
          },
          time: extractTimestampFromAny(idStr, note.createdAt),
          numId: idMatch ? Number(idMatch[1]) : 0,
        });
      });
    });

    items.sort((a, b) => {
      if (sortBy === 'newest') {
        if (a.time !== b.time) return b.time - a.time;
        if (a.numId !== b.numId) return b.numId - a.numId;
        const idComp = String(b.entry.note.id).localeCompare(String(a.entry.note.id), undefined, { numeric: true });
        if (idComp !== 0) return idComp;
        return (b.entry.note.pageNumber || 1) - (a.entry.note.pageNumber || 1);
      } else if (sortBy === 'oldest') {
        if (a.time !== b.time) return a.time - b.time;
        if (a.numId !== b.numId) return a.numId - b.numId;
        const idComp = String(a.entry.note.id).localeCompare(String(b.entry.note.id), undefined, { numeric: true });
        if (idComp !== 0) return idComp;
        return (a.entry.note.pageNumber || 1) - (b.entry.note.pageNumber || 1);
      }

      if (a.entry.fileName !== b.entry.fileName) {
        return a.entry.fileName.localeCompare(b.entry.fileName, 'fa');
      }
      return (a.entry.note.pageNumber || 1) - (b.entry.note.pageNumber || 1);
    });

    return items.map((item) => item.entry);
  }, [studyFiles, sortBy]);

  // Unique files that have sticky notes
  const filesWithStickyNotes = useMemo(() => {
    const fileMap = new Map<string, { id: string; name: string; count: number }>();
    allStickyNotes.forEach((entry) => {
      const existing = fileMap.get(entry.fileId);
      if (existing) {
        existing.count += 1;
      } else {
        fileMap.set(entry.fileId, {
          id: entry.fileId,
          name: entry.fileName,
          count: 1,
        });
      }
    });
    return Array.from(fileMap.values());
  }, [allStickyNotes]);

  // Active selected file info for sticky notes filter button label
  const activeSelectedFile = useMemo(() => {
    if (selectedFileId === 'all') return null;
    return filesWithStickyNotes.find((f) => f.id === selectedFileId) || null;
  }, [selectedFileId, filesWithStickyNotes]);

  // Count notes per folder with hierarchy rollup
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: notes.length,
      uncategorized: notes.filter((n) => !n.folderId && !n.category).length,
    };
    folders.forEach((f) => {
      const familyIds = getFolderAndDescendantIds(f.id, folders);
      const folderNameLower = f.name?.trim().toLowerCase();
      counts[f.id] = notes.filter((n) => {
        if (n.folderId && familyIds.includes(n.folderId)) return true;
        if (n.category && folderNameLower && n.category.trim().toLowerCase() === folderNameLower) return true;
        return false;
      }).length;
      counts[`${f.id}_direct`] = notes.filter((n) => {
        if (n.folderId === f.id) return true;
        if (!n.folderId && n.category && folderNameLower && n.category.trim().toLowerCase() === folderNameLower) return true;
        return false;
      }).length;
    });
    return counts;
  }, [notes, folders]);

  // Active selected folder info for breadcrumb display
  const activeSelectedFolder = useMemo(() => {
    if (selectedFolderId === 'all') return null;
    if (selectedFolderId === 'uncategorized') {
      return {
        id: 'uncategorized',
        name: 'عمومی (بدون پوشه)',
        color: '#737373',
        breadcrumb: 'عمومی و بدون پوشه',
        parent: null,
      };
    }
    const curr = folders.find((f) => f.id === selectedFolderId);
    if (!curr) return null;
    const parent = curr.parentId ? folders.find((f) => f.id === curr.parentId) : null;
    return {
      id: curr.id,
      folder: curr,
      parent,
      name: curr.name,
      breadcrumb: parent ? `${parent.name} › ${curr.name}` : curr.name,
      color: curr.color || '#2563eb',
    };
  }, [selectedFolderId, folders]);

  // Precompute lightweight display preview & embedded images (without eager search normalization)
  const notePreviewMap = useMemo(() => {
    const map = new Map<
      string,
      {
        preview: string;
        images: string[];
        folder?: NoteFolder;
      }
    >();
    const folderById = new Map<string, NoteFolder>();
    const folderByName = new Map<string, NoteFolder>();
    for (const f of folders) {
      folderById.set(f.id, f);
      folderByName.set(f.name.trim().toLowerCase(), f);
    }

    for (const note of notes) {
      const html = note.content || '';
      const preview = htmlToPreviewText(html);
      const folder =
        (note.folderId ? folderById.get(note.folderId) : undefined) ||
        (note.category ? folderByName.get(note.category.trim().toLowerCase()) : undefined);
      const images = extractImagesFromHtml(html);
      map.set(note.id, {
        preview,
        images,
        folder,
      });
    }
    return map;
  }, [notes, folders]);

  // Precompute lightweight sticky display title & plain text (without eager Persian search normalization)
  const stickyPreviewMap = useMemo(() => {
    const map = new Map<
      string,
      {
        rawContent: string;
        displayTitle: string;
      }
    >();
    for (const entry of allStickyNotes) {
      const key = `${entry.fileId}-${entry.note.id}`;
      const rawContent = htmlToCleanPlainText(entry.note.content || '');
      const displayTitle = cleanPlainTitleText(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`);
      map.set(key, {
        rawContent,
        displayTitle,
      });
    }
    return map;
  }, [allStickyNotes]);

  const hasDeferredSearch = Boolean(deferredSearchQuery.trim());

  // Lazy search normalization indexes: ONLY built when the user actually types a search query
  const stickySearchIndexMap = useMemo(() => {
    const map = new Map<
      string,
      {
        normTitle: string;
        normContent: string;
        normFileName: string;
        normPage: string;
        searchableText: string;
      }
    >();
    if (!hasDeferredSearch) return map;

    for (const entry of allStickyNotes) {
      const key = `${entry.fileId}-${entry.note.id}`;
      const display = stickyPreviewMap.get(key);
      const rawContent = display ? display.rawContent : htmlToCleanPlainText(entry.note.content || '');
      const displayTitle = display ? display.displayTitle : cleanPlainTitleText(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`);
      const normTitle = normalizePersianSearchText(displayTitle);
      const normContent = normalizePersianSearchText(rawContent);
      const normFileName = normalizePersianSearchText(entry.fileName || '');
      const normPage = normalizePersianSearchText(String(entry.note.pageNumber || ''));
      map.set(key, {
        normTitle,
        normContent,
        normFileName,
        normPage,
        searchableText: `${normTitle} ${normContent} ${normFileName} صفحه ${normPage} ص ${normPage} ${normPage}`,
      });
    }
    return map;
  }, [allStickyNotes, stickyPreviewMap, hasDeferredSearch]);

  const noteSearchIndexMap = useMemo(() => {
    const map = new Map<
      string,
      {
        searchContent: string;
        normTitle: string;
        normFolder: string;
        searchableText: string;
      }
    >();
    if (!hasDeferredSearch) return map;

    for (const note of notes) {
      const display = notePreviewMap.get(note.id);
      const preview = display ? display.preview : htmlToPreviewText(note.content || '');
      const searchContent = normalizePersianSearchText(preview);
      const normTitle = normalizePersianSearchText(note.title || '');
      const normFolder = normalizePersianSearchText(display?.folder?.name || note.category || '');
      map.set(note.id, {
        searchContent,
        normTitle,
        normFolder,
        searchableText: `${normTitle} ${searchContent} ${normFolder}`,
      });
    }
    return map;
  }, [notes, notePreviewMap, hasDeferredSearch]);

  // Filtered Sticky Notes (سریع و بدون تاخیر با تکیه بر کش نرمال‌شده و رتبه‌بندی تک‌گذره)
  const { filteredStickyNotes, stickySearchMetaMap } = useMemo(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    const normalizedQuery = trimmedQuery ? normalizePersianSearchText(trimmedQuery) : '';
    const queryTokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
    const metaMap = new Map<
      string,
      {
        matchAnalysis: SearchMatchAnalysis;
        excerpts: string[];
        hiddenExcerptCount: number;
      }
    >();

    const matched = allStickyNotes.filter((entry) => {
      if (selectedFileId !== 'all' && entry.fileId !== selectedFileId) {
        return false;
      }
      if (queryTokens.length > 0) {
        const key = `${entry.fileId}-${entry.note.id}`;
        const searchIdx = stickySearchIndexMap.get(key);
        const searchableText = searchIdx
          ? searchIdx.searchableText
          : normalizePersianSearchText(
              `${entry.note.title || ''} ${htmlToCleanPlainText(entry.note.content || '')} ${entry.fileName || ''} ص ${entry.note.pageNumber || ''}`
            );
        for (let i = 0; i < queryTokens.length; i++) {
          if (!searchableText.includes(queryTokens[i])) return false;
        }
      }
      return true;
    });

    if (queryTokens.length === 0) {
      return { filteredStickyNotes: matched, stickySearchMetaMap: metaMap };
    }

    const scored = matched.map((entry) => {
      const key = `${entry.fileId}-${entry.note.id}`;
      const cached = stickyPreviewMap.get(key);
      const searchIdx = stickySearchIndexMap.get(key);
      const rawContent = cached ? cached.rawContent : htmlToCleanPlainText(entry.note.content || '');
      const displayTitle = cached
        ? cached.displayTitle
        : cleanPlainTitleText(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`);
      const matchAnalysis = analyzeSearchMatch(
        {
          title: displayTitle,
          content: rawContent,
          metaLabel: entry.fileName,
          pageLabel: String(entry.note.pageNumber || ''),
        },
        trimmedQuery,
        searchIdx
          ? {
              title: searchIdx.normTitle,
              content: searchIdx.normContent,
              meta: searchIdx.normFileName,
              page: searchIdx.normPage,
            }
          : undefined
      );
      metaMap.set(key, {
        matchAnalysis,
        excerpts: [],
        hiddenExcerptCount: 0,
      });
      return { entry, score: matchAnalysis.relevanceScore };
    });

    scored.sort((a, b) => b.score - a.score);
    const sortedEntries = scored.map((s) => s.entry);

    // Extract highlighted excerpts only for visible items up to current limit (keeps typing instantaneous)
    const excerptLimit = Math.min(sortedEntries.length, searchResultLimit);
    for (let i = 0; i < excerptLimit; i++) {
      const entry = sortedEntries[i];
      const key = `${entry.fileId}-${entry.note.id}`;
      const cached = stickyPreviewMap.get(key);
      const rawContent = cached ? cached.rawContent : htmlToCleanPlainText(entry.note.content || '');
      const meta = metaMap.get(key);
      if (meta) {
        const res = extractMatchingExcerpts(rawContent, trimmedQuery, {
          maxFullTextLength: 200,
          contextBefore: 40,
          contextAfter: 80,
          maxExcerpts: 4,
        });
        meta.excerpts = res.excerpts;
        meta.hiddenExcerptCount = res.hiddenExcerptCount;
      }
    }

    return { filteredStickyNotes: sortedEntries, stickySearchMetaMap: metaMap };
  }, [allStickyNotes, stickyPreviewMap, stickySearchIndexMap, selectedFileId, deferredSearchQuery, searchResultLimit]);

  // Filtered Standalone Notes (سریع و بدون تاخیر با تکیه بر کش نرمال‌شده و رتبه‌بندی تک‌گذره)
  const { filteredNotes, noteSearchMetaMap } = useMemo(() => {
    const trimmedQuery = deferredSearchQuery.trim();
    const normalizedQuery = trimmedQuery ? normalizePersianSearchText(trimmedQuery) : '';
    const queryTokens = normalizedQuery ? normalizedQuery.split(' ').filter(Boolean) : [];
    const metaMap = new Map<
      string,
      {
        matchAnalysis: SearchMatchAnalysis;
        excerpts: string[];
        hiddenExcerptCount: number;
      }
    >();

    const allowedFolderIds =
      selectedFolderId !== 'all' && selectedFolderId !== 'uncategorized'
        ? getFolderAndDescendantIds(selectedFolderId, folders)
        : null;
    const targetFolder =
      selectedFolderId !== 'all' && selectedFolderId !== 'uncategorized'
        ? folders.find((f) => f.id === selectedFolderId)
        : undefined;
    const targetNameLower = targetFolder?.name?.trim().toLowerCase();

    const matched = notes.filter((note) => {
      if (selectedFolderId !== 'all') {
        if (selectedFolderId === 'uncategorized') {
          if (note.folderId || note.category) return false;
        } else {
          const matchesCategoryName =
            targetNameLower &&
            note.category &&
            note.category.trim().toLowerCase() === targetNameLower;
          const matchesFolderId = note.folderId && allowedFolderIds?.includes(note.folderId);
          if (!matchesFolderId && !matchesCategoryName) {
            return false;
          }
        }
      }
      if (queryTokens.length > 0) {
        const searchIdx = noteSearchIndexMap.get(note.id);
        const searchableText = searchIdx
          ? searchIdx.searchableText
          : normalizePersianSearchText(`${note.title || ''} ${htmlToCleanPlainText(note.content || '')} ${note.category || ''}`);
        for (let i = 0; i < queryTokens.length; i++) {
          if (!searchableText.includes(queryTokens[i])) return false;
        }
      }
      return true;
    });

    if (queryTokens.length > 0) {
      const scored = matched.map((note) => {
        const cached = notePreviewMap.get(note.id);
        const searchIdx = noteSearchIndexMap.get(note.id);
        const preview = cached ? cached.preview : htmlToPreviewText(note.content || '');
        const matchAnalysis = analyzeSearchMatch(
          {
            title: note.title || '',
            content: preview,
            metaLabel: note.category || '',
          },
          trimmedQuery,
          searchIdx
            ? {
                title: searchIdx.normTitle,
                content: searchIdx.searchContent,
                meta: searchIdx.normFolder,
              }
            : undefined
        );
        metaMap.set(note.id, {
          matchAnalysis,
          excerpts: [],
          hiddenExcerptCount: 0,
        });
        return {
          note,
          score: matchAnalysis.relevanceScore,
          time: getNoteTimestamp(note),
        };
      });

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.note.isPinned && !b.note.isPinned) return -1;
        if (!a.note.isPinned && b.note.isPinned) return 1;
        return b.time - a.time;
      });

      const sortedNotes = scored.map((s) => s.note);
      const excerptLimit = Math.min(sortedNotes.length, searchResultLimit);
      for (let i = 0; i < excerptLimit; i++) {
        const note = sortedNotes[i];
        const cached = notePreviewMap.get(note.id);
        const preview = cached ? cached.preview : htmlToPreviewText(note.content || '');
        const meta = metaMap.get(note.id);
        if (meta) {
          const res = extractMatchingExcerpts(preview, trimmedQuery, {
            maxFullTextLength: 200,
            contextBefore: 40,
            contextAfter: 80,
            maxExcerpts: 4,
          });
          meta.excerpts = res.excerpts;
          meta.hiddenExcerptCount = res.hiddenExcerptCount;
        }
      }
      return { filteredNotes: sortedNotes, noteSearchMetaMap: metaMap };
    }

    const withTimes = matched.map((note) => {
      const idStr = String(note.id);
      const idMatch = idStr.match(/(\d{10,14})/);
      return {
        note,
        time: getNoteTimestamp(note),
        numId: idMatch ? Number(idMatch[1]) : 0,
      };
    });

    withTimes.sort((a, b) => {
      if (a.note.isPinned && !b.note.isPinned) return -1;
      if (!a.note.isPinned && b.note.isPinned) return 1;

      if (sortBy === 'newest') {
        if (a.time !== b.time) return b.time - a.time;
        if (a.numId !== b.numId) return b.numId - a.numId;
        return String(b.note.id).localeCompare(String(a.note.id), undefined, { numeric: true });
      } else if (sortBy === 'oldest') {
        if (a.time !== b.time) return a.time - b.time;
        if (a.numId !== b.numId) return a.numId - b.numId;
        return String(a.note.id).localeCompare(String(b.note.id), undefined, { numeric: true });
      }
      return 0;
    });

    return { filteredNotes: withTimes.map((item) => item.note), noteSearchMetaMap: metaMap };
  }, [notes, notePreviewMap, noteSearchIndexMap, selectedFolderId, deferredSearchQuery, folders, sortBy, searchResultLimit]);

  // Automatic incremental batch loading as user scrolls (keeps sticky-notes & notes tab switching < 10ms)
  useEffect(() => {
    if (renderedTab !== 'sticky-notes' || hasDeferredSearch) return;
    if (stickyCardLimit >= filteredStickyNotes.length) return;
    const sentinel = stickyLoadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          startTransition(() => {
            setStickyCardLimit((prev) => Math.min(prev + CARD_BATCH_SIZE, filteredStickyNotes.length));
          });
        }
      },
      {
        root: mainScrollRef.current,
        rootMargin: '450px 0px',
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [renderedTab, hasDeferredSearch, stickyCardLimit, filteredStickyNotes.length]);

  useEffect(() => {
    if (renderedTab !== 'notes' || hasDeferredSearch) return;
    if (noteCardLimit >= filteredNotes.length) return;
    const sentinel = noteLoadMoreRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          startTransition(() => {
            setNoteCardLimit((prev) => Math.min(prev + CARD_BATCH_SIZE, filteredNotes.length));
          });
        }
      },
      {
        root: mainScrollRef.current,
        rootMargin: '450px 0px',
      }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [renderedTab, hasDeferredSearch, noteCardLimit, filteredNotes.length]);

  // Open Clean Viewer for a Sticky Note
  const handleOpenStickyViewer = useCallback((entry: FileStickyNoteEntry) => {
    setViewingItem({
      type: 'sticky',
      id: entry.note.id,
      title: cleanPlainTitleText(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`),
      content: htmlToCleanPlainText(entry.note.content || ''),
      rawHtml: normalizeStickyContentToHtml(entry.note.content || ''),
      sourceLabel: entry.fileName,
      pageNumber: entry.note.pageNumber,
      color: entry.note.color,
      textColor: '#000000',
      date: entry.note.createdAt,
      originalEntry: entry,
      isBold: entry.note.isBold,
      imageUrl: entry.note.imageUrl,
      images: entry.note.images && entry.note.images.length > 0 ? entry.note.images : (entry.note.imageUrl ? [entry.note.imageUrl] : []),
    });
  }, []);

  // Open Clean Viewer for a Standalone Note
  const handleOpenNoteViewer = useCallback((note: NoteItem) => {
    const folder = folders.find((f) => f.id === note.folderId);
    setViewingItem({
      type: 'note',
      id: note.id,
      title: note.title || 'بدون عنوان',
      content: htmlToPreviewText(note.content || ''),
      rawHtml: note.content || '',
      sourceLabel: folder ? folder.name : 'عمومی',
      date: note.updatedAt || note.createdAt,
      originalNote: note,
    });
  }, [folders]);

  // Open Edit Drawer for Sticky Note
  const handleOpenEditStickyNote = useCallback((entry: FileStickyNoteEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingStickyNote(entry);
  }, []);

  // Confirm delete sticky note
  const handleConfirmDeleteStickyNote = () => {
    if (!deletingStickyNote || !onDeleteStickyNote) return;
    onDeleteStickyNote(deletingStickyNote.fileId, deletingStickyNote.note.id);
    if (viewingItem?.id === deletingStickyNote.note.id) {
      setViewingItem(null);
    }
    setDeletingStickyNote(null);
    showCopyToast('استیکی‌نوت حذف شد');
  };

  // Confirm delete standalone note
  const handleConfirmDeleteNote = () => {
    if (!deletingNote) return;
    onDeleteNote(deletingNote.id);
    if (viewingItem?.id === deletingNote.id) {
      setViewingItem(null);
    }
    setDeletingNote(null);
    showCopyToast('یادداشت حذف شد');
  };

  // Copy to clipboard helper
  const handleCopyText = useCallback((text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedToast(`${label} کپی شد`);
    setTimeout(() => {
      setCopiedToast(null);
    }, 2200);
  }, []);

  // Folder management handlers
  const handleOpenAddFolder = (initialParentId: string | null = null) => {
    setEditingFolder(null);
    setParentFolderIdInput(initialParentId);
    setFolderNameInput('');
    setFolderColorInput('#2563eb');
    setIsFolderModalOpen(true);
  };

  const handleOpenEditFolder = (f: NoteFolder, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolder(f);
    setParentFolderIdInput(f.parentId || null);
    setFolderNameInput(f.name);
    setFolderColorInput(f.color || '#2563eb');
    setIsFolderModalOpen(true);
  };

  const handleSaveFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const name = folderNameInput.trim();
    if (!name) return;

    if (editingFolder) {
      if (onUpdateFolder) {
        onUpdateFolder(editingFolder.id, name, folderColorInput, parentFolderIdInput);
      }
    } else {
      if (onAddFolder) {
        onAddFolder({
          name,
          color: folderColorInput,
          parentId: parentFolderIdInput,
        });
      }
    }
    setIsFolderModalOpen(false);
  };

  const handleConfirmDeleteFolder = () => {
    if (!folderToDelete) return;
    if (onDeleteFolder) {
      onDeleteFolder(folderToDelete.id);
    }
    if (selectedFolderId === folderToDelete.id) {
      setSelectedFolderId('all');
    }
    setFolderToDelete(null);
    showCopyToast('پوشه حذف شد');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-neutral-100/80 overflow-hidden relative select-none font-sans" dir="rtl">
      {/* 1. Top Header with Tabs & Prominent Actions */}
      <header
        className={`bg-white px-4 sm:px-8 pt-5 shrink-0 relative z-10 select-none ${
          activeTab === 'tasks'
            ? 'pb-4 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08),0_2px_8px_-2px_rgba(0,0,0,0.05)]'
            : 'pb-3'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Three Tabs with iOS Spring Physics */}
          <div className="flex items-center gap-2 p-1 bg-neutral-100/90 rounded-2xl w-full sm:w-auto">
            {/* Tab 1: یادداشت‌ها */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('notes');
                setIsCategorySubmenuOpen(false);
                setIsFileSubmenuOpen(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ios-spring-btn ${
                activeTab === 'notes'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50'
              }`}
            >
              <FileText className={`w-4 h-4 ${activeTab === 'notes' ? 'text-sky-600' : 'text-neutral-400'}`} />
              <span>یادداشت‌ها</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeTab === 'notes'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-200/80 text-neutral-600'
                }`}
              >
                {notes.length}
              </span>
            </button>

            {/* Tab 2: تسک‌ها (سربرگ جدید بین یادداشت و استیکی نوت) */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('tasks');
                setIsCategorySubmenuOpen(false);
                setIsFileSubmenuOpen(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ios-spring-btn ${
                activeTab === 'tasks'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50'
              }`}
            >
              <CheckSquare className={`w-4 h-4 ${activeTab === 'tasks' ? 'text-emerald-600' : 'text-neutral-400'}`} />
              <span>تسک‌ها</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeTab === 'tasks'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-200/80 text-neutral-600'
                }`}
              >
                {activeTasksCount}
              </span>
            </button>

            {/* Tab 3: استیکی‌نوت‌ها */}
            <button
              type="button"
              onClick={() => {
                setActiveTab('sticky-notes');
                setIsCategorySubmenuOpen(false);
                setIsFileSubmenuOpen(false);
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold cursor-pointer ios-spring-btn ${
                activeTab === 'sticky-notes'
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/50'
              }`}
            >
              <StickyNote className={`w-4 h-4 ${activeTab === 'sticky-notes' ? 'text-amber-500' : 'text-neutral-400'}`} />
              <span>استیکی‌نوت‌ها</span>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeTab === 'sticky-notes'
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-200/80 text-neutral-600'
                }`}
              >
                {allStickyNotes.length}
              </span>
            </button>
          </div>

          {/* Header Action: New Note Button */}
          {activeTab === 'notes' && (
            <div className="flex items-center gap-2 self-start sm:self-center">
              <button
                type="button"
                onClick={onStartNewNote}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-bold rounded-xl cursor-pointer ios-spring-btn shadow-md"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>یادداشت جدید</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* 2. Unified Search, Folders & File Filters Toolbar (هماهنگ با دیزاین سراسری اپلیکیشن) */}
      {activeTab !== 'tasks' && (
        <div
          className={`bg-white px-4 sm:px-8 pt-1 pb-3.5 shrink-0 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.08),0_2px_8px_-2px_rgba(0,0,0,0.05)] relative select-none ${
            isCategorySubmenuOpen || isFileSubmenuOpen || isSortDropdownOpen ? 'z-40' : 'z-20'
          }`}
        >
        <div className="max-w-6xl mx-auto space-y-2.5">
          {/* Upper Row: Search input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-neutral-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={
                  activeTab === 'notes'
                    ? 'جستجو در عنوان، متن یا پوشه یادداشت‌ها...'
                    : 'جستجو در استیکی‌نوت‌ها و فایل‌ها...'
                }
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pr-9 pl-8 py-2 bg-neutral-100/80 hover:bg-neutral-100 focus:bg-white focus:ring-2 focus:ring-neutral-900/15 rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-200 cursor-pointer transition-colors"
                  title="پاک کردن جستجو"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Sort Dropdown Button & Popover (مرتب‌سازی بر اساس جدیدترین، آخرین ویرایش، قدیمی‌ترین و الفبا) */}
            <div className="relative shrink-0" ref={sortDropdownRef}>
              <button
                type="button"
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
                className={`px-2.5 sm:px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                  sortBy !== 'newest'
                    ? 'bg-neutral-900 text-white shadow-sm'
                    : 'bg-neutral-100/80 hover:bg-neutral-200/75 text-neutral-700'
                }`}
                title="مرتب‌سازی و ترتیب یادداشت‌ها"
              >
                <ArrowUpDown className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">
                  ترتیب: {NOTE_SORT_OPTIONS[sortBy]?.shortLabel || 'جدیدترین'}
                </span>
                <span className="inline sm:hidden">
                  {NOTE_SORT_OPTIONS[sortBy]?.shortLabel || 'ترتیب'}
                </span>
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-200 opacity-60 ${
                    isSortDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Sort Dropdown Popover with iOS jelly animation */}
              {isSortDropdownOpen && (
                <div
                  className="absolute left-0 top-full mt-1.5 w-60 bg-white rounded-2xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-2 z-50 animate-ios-jelly origin-top-left select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-2.5 py-1.5 text-[11px] font-bold text-neutral-400 mb-1 flex items-center justify-between">
                    <span>مرتب‌سازی یادداشت‌ها</span>
                    <ArrowUpDown className="w-3 h-3 text-neutral-400" />
                  </div>

                  <div className="space-y-0.5">
                    {(Object.keys(NOTE_SORT_OPTIONS) as NoteSortOption[]).map((key) => {
                      const opt = NOTE_SORT_OPTIONS[key];
                      const Icon = opt.icon;
                      const isCurrent = sortBy === key;

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            setSortBy(key);
                            setIsSortDropdownOpen(false);
                          }}
                          className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            isCurrent
                              ? 'bg-neutral-900 text-white font-bold shadow-xs'
                              : 'text-neutral-700 hover:bg-neutral-100'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isCurrent ? 'text-white' : 'text-neutral-400'
                              }`}
                            />
                            <span>{opt.label}</span>
                          </div>
                          {isCurrent && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Lower Row: Category Pills & Submenu Filter (دقیقاً مشابه بخش کتابخانه) */}
          {activeTab === 'notes' ? (
            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1">
                {/* 1. All Notes (همه یادداشت‌ها) */}
                <button
                  type="button"
                  onClick={() => setSelectedFolderId('all')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                    selectedFolderId === 'all'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>همه یادداشت‌ها</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      selectedFolderId === 'all'
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {notes.length}
                  </span>
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-neutral-200 shrink-0 hidden sm:block" />

                {/* 2. Category Submenu Dropdown (زیرمجموعه کشویی دسته‌بندی‌ها دقیقاً مثل کتابخانه) */}
                <div className={`relative shrink-0 ${isCategorySubmenuOpen ? 'z-50' : ''}`} ref={categorySubmenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsCategorySubmenuOpen(!isCategorySubmenuOpen)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                      activeSelectedFolder && activeSelectedFolder.id !== 'uncategorized'
                        ? 'bg-neutral-900 text-white shadow-sm'
                        : selectedFolderId === 'uncategorized'
                        ? 'bg-neutral-900 text-white shadow-sm'
                        : isCategorySubmenuOpen
                        ? 'bg-neutral-200/80 text-neutral-900'
                        : 'bg-neutral-100/80 hover:bg-neutral-200/75 text-neutral-700'
                    }`}
                  >
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                    {activeSelectedFolder && activeSelectedFolder.id !== 'uncategorized' ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: activeSelectedFolder.color || '#2563eb' }}
                        />
                        <span>دسته: {activeSelectedFolder.name}</span>
                      </span>
                    ) : selectedFolderId === 'uncategorized' ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-neutral-400 shrink-0" />
                        <span>عمومی (بدون پوشه)</span>
                      </span>
                    ) : (
                      <span>دسته‌بندی‌ها</span>
                    )}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 opacity-60 ${
                        isCategorySubmenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Submenu Dropdown Popover with global iOS jelly animation */}
                  {isCategorySubmenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-2.5 z-50 animate-ios-jelly origin-top-right select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 px-2 mb-1">
                        <span className="text-[11px] font-bold text-neutral-500">
                          انتخاب دسته‌بندی
                        </span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                        {/* Option to clear category filter */}
                        {selectedFolderId !== 'all' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderId('all');
                              setIsCategorySubmenuOpen(false);
                            }}
                            className="w-full text-right px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50/80 hover:bg-rose-100/80 rounded-xl flex items-center justify-between transition-colors cursor-pointer mb-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>حذف فیلتر دسته‌بندی (نمایش همه)</span>
                            </div>
                            <X className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}

                        {/* All Categories Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFolderId('all');
                            setIsCategorySubmenuOpen(false);
                          }}
                          className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors ${
                            selectedFolderId === 'all'
                              ? 'font-bold bg-neutral-100 text-neutral-900'
                              : 'text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-3.5 h-3.5 text-neutral-400" />
                            <span>همه یادداشت‌ها</span>
                          </div>
                          {selectedFolderId === 'all' && (
                            <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0" />
                          )}
                        </button>

                        {/* Categories List (با ساختار درختی و زیرمجموعه‌بندی تمیز) */}
                        {rootFolders.map((f) => {
                          const isCurrent = selectedFolderId === f.id;
                          const count = folderCounts[f.id] || 0;
                          const children = subfoldersMap[f.id] || [];

                          return (
                            <React.Fragment key={f.id}>
                              <div
                                className={`group flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors ${
                                  isCurrent ? 'bg-neutral-100' : 'hover:bg-neutral-50'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedFolderId(f.id);
                                    setIsCategorySubmenuOpen(false);
                                  }}
                                  className="flex items-center gap-2 min-w-0 flex-1 text-right text-xs cursor-pointer py-0.5"
                                >
                                  <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: f.color || '#2563eb' }}
                                  />
                                  <span
                                    className={`truncate ${
                                      isCurrent ? 'font-bold text-neutral-900' : 'text-neutral-700'
                                    }`}
                                  >
                                    {f.name}
                                  </span>
                                  {children.length > 0 && (
                                    <span className="text-[10px] text-neutral-400 font-normal">
                                      ({children.length} زیردسته)
                                    </span>
                                  )}
                                </button>

                                <div className="flex items-center gap-1 shrink-0">
                                  <span
                                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                      isCurrent
                                        ? 'bg-neutral-900 text-white'
                                        : 'bg-neutral-100 text-neutral-600'
                                    }`}
                                  >
                                    {count}
                                  </span>

                                  {/* Quick Add Subcategory */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenAddFolder(f.id);
                                      setIsCategorySubmenuOpen(false);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-800 rounded cursor-pointer transition-opacity"
                                    title="افزودن زیرمجموعه جدید به این دسته"
                                  >
                                    <Plus className="w-3 h-3" />
                                  </button>

                                  {/* Edit Trigger */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      handleOpenEditFolder(f, e);
                                      setIsCategorySubmenuOpen(false);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer transition-opacity"
                                    title="ویرایش دسته‌بندی"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>

                                  {/* Delete Trigger */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setFolderToDelete(f);
                                      setIsCategorySubmenuOpen(false);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-rose-600 rounded cursor-pointer transition-opacity"
                                    title="حذف دسته‌بندی"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>

                                  {isCurrent && (
                                    <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0 mr-1" />
                                  )}
                                </div>
                              </div>

                              {/* Children / Subcategories */}
                              {children.map((child) => {
                                const isChildCurrent = selectedFolderId === child.id;
                                const childCount = folderCounts[child.id] || 0;
                                return (
                                  <div
                                    key={child.id}
                                    className={`group flex items-center justify-between rounded-xl pr-6 pl-2.5 py-1 transition-colors ${
                                      isChildCurrent ? 'bg-neutral-100' : 'hover:bg-neutral-50/80'
                                    }`}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setSelectedFolderId(child.id);
                                        setIsCategorySubmenuOpen(false);
                                      }}
                                      className="flex items-center gap-1.5 min-w-0 flex-1 text-right text-xs cursor-pointer py-0.5"
                                    >
                                      <span className="text-neutral-300 text-xs select-none">↳</span>
                                      <span
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: child.color || '#2563eb' }}
                                      />
                                      <span
                                        className={`truncate ${
                                          isChildCurrent
                                            ? 'font-bold text-neutral-900'
                                            : 'text-neutral-600 text-[11px]'
                                        }`}
                                      >
                                        {child.name}
                                      </span>
                                    </button>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <span
                                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                          isChildCurrent
                                            ? 'bg-neutral-900 text-white'
                                            : 'bg-neutral-100 text-neutral-500'
                                        }`}
                                      >
                                        {childCount}
                                      </span>

                                      {/* Edit Child */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          handleOpenEditFolder(child, e);
                                          setIsCategorySubmenuOpen(false);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer transition-opacity"
                                        title="ویرایش زیرمجموعه"
                                      >
                                        <Edit2 className="w-2.5 h-2.5" />
                                      </button>

                                      {/* Delete Child */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setFolderToDelete(child);
                                          setIsCategorySubmenuOpen(false);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 text-neutral-400 hover:text-rose-600 rounded cursor-pointer transition-opacity"
                                        title="حذف زیرمجموعه"
                                      >
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </button>

                                      {isChildCurrent && (
                                        <Check className="w-3 h-3 text-neutral-800 shrink-0 mr-1" />
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}

                        {/* Uncategorized Option */}
                        <div
                          className={`group flex items-center justify-between rounded-xl px-2.5 py-1.5 transition-colors mt-1 pt-1.5 ${
                            selectedFolderId === 'uncategorized'
                              ? 'bg-neutral-100'
                              : 'hover:bg-neutral-50'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFolderId('uncategorized');
                              setIsCategorySubmenuOpen(false);
                            }}
                            className="flex items-center gap-2 min-w-0 flex-1 text-right text-xs cursor-pointer py-0.5"
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-neutral-400 shrink-0" />
                            <span
                              className={`truncate ${
                                selectedFolderId === 'uncategorized'
                                  ? 'font-bold text-neutral-900'
                                  : 'text-neutral-700'
                              }`}
                            >
                              عمومی (بدون پوشه)
                            </span>
                          </button>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold bg-neutral-100 text-neutral-600">
                              {folderCounts.uncategorized || 0}
                            </span>
                            {selectedFolderId === 'uncategorized' && (
                              <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0 mr-1" />
                            )}
                          </div>
                        </div>

                      </div>

                      {onAddFolder && (
                        <div className="pt-1.5 mt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setIsCategorySubmenuOpen(false);
                              handleOpenAddFolder(null);
                            }}
                            className="w-full py-1.5 px-2.5 rounded-xl text-xs font-bold text-neutral-800 hover:text-white bg-neutral-100 hover:bg-neutral-900 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                            title="ساخت دسته‌بندی جدید"
                          >
                            <FolderPlus className="w-3.5 h-3.5" />
                            <span>ساخت دسته‌بندی جدید</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Reset Button */}
              {(selectedFolderId !== 'all' || searchQuery || sortBy !== 'newest') && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFolderId('all');
                    setSearchQuery('');
                    setSortBy('newest');
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title="پاک کردن فیلترها"
                >
                  <X className="w-3 h-3" />
                  <span>پاکسازی فیلتر</span>
                </button>
              )}
            </div>
          ) : (
            /* Sticky Notes File Filter Row (دقیقاً هماهنگ با بخش یادداشت‌ها و کتابخانه با زیرمجموعه کشویی تمیز) */
            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-1">
                {/* 1. All Files (همه فایل‌ها) */}
                <button
                  type="button"
                  onClick={() => setSelectedFileId('all')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                    selectedFileId === 'all'
                      ? 'bg-neutral-900 text-white shadow-xs'
                      : 'text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5 shrink-0" />
                  <span>همه فایل‌ها</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      selectedFileId === 'all'
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {allStickyNotes.length}
                  </span>
                </button>

                {/* Divider */}
                <div className="w-px h-4 bg-neutral-200 shrink-0 hidden sm:block" />

                {/* 2. File Submenu Dropdown (زیرمجموعه کشویی منابع و فایل‌ها دقیقاً مشابه کتابخانه و یادداشت‌ها) */}
                <div className={`relative shrink-0 ${isFileSubmenuOpen ? 'z-50' : ''}`} ref={fileSubmenuRef}>
                  <button
                    type="button"
                    onClick={() => setIsFileSubmenuOpen(!isFileSubmenuOpen)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn shrink-0 ${
                      activeSelectedFile
                        ? 'bg-neutral-900 text-white shadow-sm'
                        : isFileSubmenuOpen
                        ? 'bg-neutral-200/80 text-neutral-900'
                        : 'bg-neutral-100/80 hover:bg-neutral-200/75 text-neutral-700'
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    {activeSelectedFile ? (
                      <span className="flex items-center gap-1.5 max-w-[180px] sm:max-w-[220px]">
                        <span className="truncate">فایل: {activeSelectedFile.name}</span>
                      </span>
                    ) : (
                      <span>فایل‌ها و منابع</span>
                    )}
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 opacity-60 ${
                        isFileSubmenuOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {/* Submenu Dropdown Popover with global iOS jelly animation */}
                  {isFileSubmenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-2.5 z-50 animate-ios-jelly origin-top-right select-none"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-2 px-2 mb-1">
                        <span className="text-[11px] font-bold text-neutral-500">
                          انتخاب منبع و فایل
                        </span>
                        <span className="text-[10px] text-neutral-400 font-mono">
                          {filesWithStickyNotes.length} منبع
                        </span>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-1 py-1">
                        {/* Option to clear file filter */}
                        {selectedFileId !== 'all' && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedFileId('all');
                              setIsFileSubmenuOpen(false);
                            }}
                            className="w-full text-right px-2.5 py-1.5 text-xs font-bold text-rose-600 bg-rose-50/80 hover:bg-rose-100/80 rounded-xl flex items-center justify-between transition-colors cursor-pointer mb-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                              <span>حذف فیلتر (نمایش همه فایل‌ها)</span>
                            </div>
                            <X className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}

                        {/* All Files Option */}
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedFileId('all');
                            setIsFileSubmenuOpen(false);
                          }}
                          className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors ${
                            selectedFileId === 'all'
                              ? 'font-bold bg-neutral-100 text-neutral-900'
                              : 'text-neutral-700'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-neutral-400" />
                            <span>همه فایل‌ها و استیکی‌نوت‌ها</span>
                          </div>
                          {selectedFileId === 'all' && (
                            <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0" />
                          )}
                        </button>

                        {/* Files List */}
                        {filesWithStickyNotes.map((f) => {
                          const isCurrent = selectedFileId === f.id;
                          return (
                            <button
                              key={f.id}
                              type="button"
                              onClick={() => {
                                setSelectedFileId(f.id);
                                setIsFileSubmenuOpen(false);
                              }}
                              className={`w-full text-right px-2.5 py-2 rounded-xl text-xs flex items-center justify-between hover:bg-neutral-100 cursor-pointer transition-colors group ${
                                isCurrent
                                  ? 'font-bold bg-neutral-100 text-neutral-900'
                                  : 'text-neutral-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <FileText className="w-3.5 h-3.5 text-neutral-400 group-hover:text-neutral-700 shrink-0" />
                                <span className="truncate">{f.name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 mr-1.5">
                                <span
                                  className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                                    isCurrent
                                      ? 'bg-neutral-900 text-white'
                                      : 'bg-neutral-100 text-neutral-600'
                                  }`}
                                >
                                  {f.count}
                                </span>
                                {isCurrent && (
                                  <Check className="w-3.5 h-3.5 text-neutral-800 shrink-0 mr-1" />
                                )}
                              </div>
                            </button>
                          );
                        })}

                        {filesWithStickyNotes.length === 0 && (
                          <div className="p-3 text-center text-xs text-neutral-400">
                            هنوز استیکی‌نوتی در هیچ فایلی ثبت نشده است.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Filter Reset Button */}
              {(selectedFileId !== 'all' || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFileId('all');
                    setSearchQuery('');
                  }}
                  className="px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                  title="پاک کردن فیلترها"
                >
                  <X className="w-3 h-3" />
                  <span>پاکسازی فیلتر</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 3. Main List: کلیک روی هر کارت پنجره تمیز و خلوت را با فیزیک ژله‌ای باز می‌کند */}
      <main
        ref={mainScrollRef}
        className={`flex-1 ${renderedTab === 'tasks' ? 'overflow-hidden flex flex-col px-4 sm:px-8 py-3 sm:py-4 min-h-0 bg-neutral-100/80' : 'overflow-y-auto px-4 sm:px-8 py-6'} relative z-0`}
      >
        <div className={`w-full ${renderedTab === 'tasks' ? 'max-w-7xl mx-auto flex-1 flex flex-col min-h-0 h-full' : 'max-w-6xl mx-auto'}`}>
          {renderedTab === 'tasks' ? (
            /* =========================================================
               TAB: ظاهر تمیز و خلوت تسک‌ها با دکمه افزودن تسک و ستون‌های متقارن با اسکرول بار داخلی
               ========================================================= */
            <div className="w-full flex-1 flex flex-col min-h-0 h-full">
              {/* Header: Title + THE ONE AND ONLY "افزودن تسک" Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3.5 pb-1 shrink-0">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-neutral-900 flex items-center gap-2.5">
                    <span>مدیریت و فهرست تسک‌ها</span>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono bg-neutral-900 text-white font-bold shadow-2xs">
                      {activeTasksCount} در حال انجام
                    </span>
                    {completedTasksCount > 0 && (
                      <span className="text-[11px] px-2.5 py-0.5 rounded-full font-mono bg-emerald-100 text-emerald-800 font-bold shadow-2xs">
                        {completedTasksCount} تکمیل‌شده
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    تسک‌های فعال در ستون راست و تسک‌های انجام‌شده در صفحه سمت چپ به صورت لیست نمایش داده می‌شوند
                  </p>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                  {/* Add Task Button */}
                  <button
                    type="button"
                    onClick={handleOpenAddTaskModal}
                    className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs sm:text-sm font-bold rounded-xl cursor-pointer ios-spring-btn shadow-md hover:shadow-lg shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    <span>افزودن تسک</span>
                  </button>
                </div>
              </div>

              {/* Symmetrical Dual Columns: Right = Active Tasks | Left = Completed Tasks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6 items-stretch flex-1 min-h-0 h-full pb-1">
                {/* 1. ستون راست (مستطیل عمودی متقارن: کارهای در حال انجام) */}
                <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] flex flex-col h-full min-h-0 overflow-hidden">
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                      <h3 className="text-xs sm:text-sm font-bold text-neutral-900">
                        کارهای در حال انجام
                      </h3>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-bold shadow-2xs">
                        {activeTasksCount}
                      </span>
                    </div>
                  </div>

                  {/* Scrollable Active Tasks List with recessed track for strong card contrast */}
                  <div className="flex-1 overflow-y-auto space-y-3 p-2.5 sm:p-3 bg-neutral-100/75 rounded-2xl min-h-0 custom-column-scroll">
                    {activeTasks.length === 0 ? (
                      <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center space-y-2.5 p-6 text-neutral-400">
                        <div className="w-12 h-12 rounded-2xl bg-white text-neutral-400 flex items-center justify-center shadow-xs">
                          <CheckSquare className="w-6 h-6 stroke-[1.5]" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-800">
                          {tasks.length === 0 ? 'هیچ تسکی ثبت نشده است' : 'تمامی تسک‌های فعال تکمیل شده‌اند!'}
                        </h4>
                        <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
                          {tasks.length === 0
                            ? 'برای شروع برنامه‌ریزی، روی دکمه «افزودن تسک» در بالای صفحه کلیک کنید.'
                            : 'همه وظایف فعلی انجام شده‌اند. می‌توانید تسک‌های جدید اضافه کنید.'}
                        </p>
                      </div>
                    ) : (
                      activeTasks.map((task) => {
                        const isAnimating = Boolean(animatingTaskIds[task.id]);
                        const priority = task.priority || 'medium';

                        return (
                          <div
                            key={task.id}
                            onClick={() => handleToggleTask(task.id)}
                            className={`task-card-contain relative overflow-hidden group rounded-2xl transition-[transform,box-shadow,background-color] duration-200 h-[74px] px-3.5 sm:px-4 flex items-center cursor-pointer select-none hover:-translate-y-0.5 ${
                              isAnimating
                                ? 'bg-neutral-900 text-white shadow-xl scale-[0.99]'
                                : 'bg-white shadow-[0_8px_22px_-4px_rgba(0,0,0,0.10),0_3px_8px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_14px_30px_-4px_rgba(0,0,0,0.15),0_4px_12px_-2px_rgba(0,0,0,0.09)]'
                            }`}
                          >
                            {/* Sliding Black Overlay Animation */}
                            <div
                              className={`absolute inset-0 bg-neutral-900 transition-transform duration-500 ease-out pointer-events-none z-0 ${
                                isAnimating ? 'translate-x-0' : 'translate-x-full'
                              }`}
                            />

                            <div className="relative z-10 flex items-center justify-between gap-3 w-full min-w-0">
                              {/* Big Tick Button & Single-Row Title */}
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                {/* Big Tick Button with iOS spring physics */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleToggleTask(task.id);
                                  }}
                                  className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 cursor-pointer ios-spring-btn ${
                                    isAnimating
                                      ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30 scale-105'
                                      : 'bg-emerald-50 hover:bg-emerald-500 text-emerald-600 hover:text-white shadow-xs hover:shadow-md'
                                  }`}
                                  title="تیک زدن و تکمیل تسک"
                                >
                                  <Check
                                    className={`w-5 h-5 stroke-[3] transition-all duration-300 ${
                                      isAnimating
                                        ? 'text-white scale-110'
                                        : 'text-emerald-600 group-hover:scale-105'
                                    }`}
                                  />
                                </button>

                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <span
                                    title={task.title}
                                    className={`text-sm font-bold whitespace-nowrap truncate min-w-0 transition-colors duration-300 ${
                                      isAnimating ? 'text-white line-through opacity-90' : 'text-neutral-900'
                                    }`}
                                  >
                                    {task.title}
                                  </span>

                                  {/* Priority badge */}
                                  {!isAnimating && priority === 'high' && (
                                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-rose-100 text-rose-700 shadow-2xs shrink-0 whitespace-nowrap">
                                      فوری
                                    </span>
                                  )}
                                  {!isAnimating && priority === 'medium' && (
                                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-amber-100 text-amber-800 shadow-2xs shrink-0 whitespace-nowrap">
                                      مهم
                                    </span>
                                  )}
                                  {!isAnimating && priority === 'low' && (
                                    <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-neutral-200/80 text-neutral-700 shadow-2xs shrink-0 whitespace-nowrap">
                                      عادی
                                    </span>
                                  )}

                                  {/* Due date badge */}
                                  {task.dueDate && (
                                    <span
                                      className={`hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-lg shrink-0 whitespace-nowrap transition-colors duration-300 ${
                                        isAnimating ? 'text-neutral-400 bg-neutral-800' : 'text-neutral-600 bg-neutral-100'
                                      }`}
                                    >
                                      <Clock className="w-3 h-3 shrink-0" />
                                      <span>{task.dueDate}</span>
                                    </span>
                                  )}

                                  {/* Subtle description indicator (keeps card height fixed to title) */}
                                  {!isAnimating && task.description && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenEditTaskModal(task);
                                      }}
                                      title={task.description}
                                      className="p-1 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 shrink-0 cursor-pointer transition-colors"
                                      aria-label="مشاهده توضیحات تسک"
                                    >
                                      <FileText className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Action Buttons */}
                              {!isAnimating && (
                                <div
                                  className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTaskModal(task)}
                                    className="p-1.5 text-neutral-400 hover:text-neutral-800 hover:bg-neutral-100 rounded-lg cursor-pointer transition-colors ios-spring-btn"
                                    title="ویرایش"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteTask(task.id)}
                                    className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors ios-spring-btn"
                                    title="حذف"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 2. ستون چپ (مستطیل عمودی متقارن: تسک‌های انجام‌شده) */}
                <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)] flex flex-col h-full min-h-0 overflow-hidden">
                  {/* Column Header */}
                  <div className="flex items-center justify-between pb-2 mb-2 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold shadow-2xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <h3 className="text-xs sm:text-sm font-bold text-neutral-900">
                        تسک‌های انجام‌شده
                      </h3>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-700 font-bold shadow-2xs">
                        {completedTasksCount}
                      </span>
                    </div>

                    {completedTasksCount > 0 && (
                      <button
                        type="button"
                        onClick={handleClearCompletedTasks}
                        className="text-[11px] font-medium text-neutral-400 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer ios-spring-btn"
                      >
                        پاک‌سازی همه
                      </button>
                    )}
                  </div>

                  {/* Scrollable Completed Tasks List with its OWN scrollbar inside this rectangle */}
                  <div className="flex-1 overflow-y-auto space-y-3 p-2.5 sm:p-3 bg-neutral-100/75 rounded-2xl min-h-0 custom-column-scroll">
                    {completedTasks.length === 0 ? (
                      <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center space-y-2.5 p-6 text-neutral-400">
                        <div className="w-12 h-12 rounded-2xl bg-white text-neutral-400 flex items-center justify-center shadow-xs">
                          <CheckCircle2 className="w-6 h-6 stroke-[1.5]" />
                        </div>
                        <h4 className="text-xs sm:text-sm font-bold text-neutral-800">
                          هنوز تسکی تکمیل نشده است
                        </h4>
                        <p className="text-[11px] text-neutral-400 max-w-xs leading-relaxed">
                          با زدن دکمه تیک روی هر تسک فعال، کارت آن مشکی شده و به این ستون منتقل می‌شود.
                        </p>
                      </div>
                    ) : (
                      completedTasks.map((task) => {
                        const priority = task.priority || 'medium';

                        return (
                          <div
                            key={task.id}
                            className="task-card-contain group relative bg-neutral-900 text-white rounded-2xl shadow-[0_10px_26px_-4px_rgba(0,0,0,0.24),0_4px_10px_-2px_rgba(0,0,0,0.14)] hover:shadow-[0_14px_32px_-4px_rgba(0,0,0,0.34)] h-[74px] px-3.5 sm:px-4 flex items-center justify-between gap-3 select-none transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5"
                          >
                            {/* Big Completed Check Icon & Single-Row Title */}
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {/* Big Tick Button */}
                              <button
                                type="button"
                                onClick={() => handleToggleTask(task.id)}
                                className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shrink-0 cursor-pointer shadow-md shadow-emerald-500/30 hover:bg-emerald-600 ios-spring-btn"
                                title="کلیک برای بازگردانی به لیست کارهای در حال انجام"
                              >
                                <Check className="w-5 h-5 stroke-[3]" />
                              </button>

                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span
                                  title={task.title}
                                  className="text-sm font-bold text-neutral-200 line-through opacity-90 whitespace-nowrap truncate min-w-0"
                                >
                                  {task.title}
                                </span>

                                {/* Priority badge (subtle dark style) */}
                                {priority === 'high' && (
                                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-rose-950/80 text-rose-300 shadow-2xs shrink-0 whitespace-nowrap">
                                    فوری
                                  </span>
                                )}
                                {priority === 'medium' && (
                                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-amber-950/80 text-amber-300 shadow-2xs shrink-0 whitespace-nowrap">
                                    مهم
                                  </span>
                                )}
                                {priority === 'low' && (
                                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-lg bg-neutral-800 text-neutral-300 shadow-2xs shrink-0 whitespace-nowrap">
                                    عادی
                                  </span>
                                )}

                                {/* Due date badge */}
                                {task.dueDate && (
                                  <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-lg bg-neutral-800 text-neutral-400 shrink-0 whitespace-nowrap">
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>{task.dueDate}</span>
                                  </span>
                                )}

                                {/* Completed timestamp badge */}
                                {task.completedAt && (
                                  <span className="hidden lg:inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-950/70 px-2 py-0.5 rounded-md shadow-2xs shrink-0 whitespace-nowrap">
                                    <span>انجام شد در {task.completedAt}</span>
                                  </span>
                                )}

                                {/* Subtle description indicator (keeps card height fixed to title) */}
                                {task.description && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenEditTaskModal(task);
                                    }}
                                    title={task.description}
                                    className="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 shrink-0 cursor-pointer transition-colors"
                                    aria-label="مشاهده توضیحات تسک"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Actions: Undo & Delete */}
                            <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleTask(task.id)}
                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg cursor-pointer transition-colors ios-spring-btn"
                                title="بازگردانی به لیست کارهای فعال"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1.5 text-neutral-400 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors ios-spring-btn"
                                title="حذف تسک"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : renderedTab === 'sticky-notes' ? (
            /* =========================================================
               TAB: لیست استیکی‌نوت‌ها با انیمیشن فنری کارت‌ها
               ========================================================= */
            <div>
              {filteredStickyNotes.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)]">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center shadow-2xs">
                    <StickyNote className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-800">
                    {deferredSearchQuery || selectedFileId !== 'all'
                      ? 'هیچ استیکی‌نوتی با این فیلتر یافت نشد'
                      : 'هنوز هیچ استیکی‌نوتی در فایل‌ها ثبت نشده است'}
                  </h3>
                  <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                    هنگام مطالعه کتاب‌ها و جزوه‌ها، از ابزار یادداشت چسبان روی صفحات استفاده کنید یا فایل دلخواه خود را اضافه فرمایید.
                  </p>
                  {onTriggerNewFile && (
                    <button
                      type="button"
                      onClick={onTriggerNewFile}
                      className="mt-2 px-4 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs cursor-pointer ios-spring-btn flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>افزودن فایل دلخواه</span>
                    </button>
                  )}
                </div>
              ) : deferredSearchQuery.trim() ? (
                <div className="space-y-1.5" dir="rtl">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-neutral-200/80 text-[11.5px] text-neutral-500">
                    <span>
                      <strong className="text-neutral-900">{filteredStickyNotes.length}</strong> نتیجه متنی برای «{deferredSearchQuery.trim()}»
                    </span>
                    <span className="text-[10.5px] text-neutral-500">
                      نمایش مستقیم متن استیکی‌نوت‌ها (برای باز کردن کامل روی عنوان کلیک کنید)
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredStickyNotes.slice(0, searchResultLimit).map((entry) => {
                      const key = `${entry.fileId}-${entry.note.id}`;
                      const cachedSticky = stickyPreviewMap.get(key);
                      const rawContent = cachedSticky ? cachedSticky.rawContent : htmlToCleanPlainText(entry.note.content || '');
                      const displayTitle = cachedSticky ? cachedSticky.displayTitle : cleanPlainTitleText(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`);
                      const noteBg = entry.note.color || '#fef08a';
                      const meta = stickySearchMetaMap.get(key);
                      const matchAnalysis = meta?.matchAnalysis;
                      const excerpts = meta?.excerpts ?? [];
                      const hiddenExcerptCount = meta?.hiddenExcerptCount ?? 0;

                      return (
                        <div
                          key={key}
                          className={`bg-white rounded-lg border border-neutral-200/90 border-r-[3px] px-2.5 sm:px-3 py-1.5 shadow-[0_1px_5px_-2px_rgba(0,0,0,0.06)] hover:border-neutral-300 hover:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.09)] transition-all group ${
                            matchAnalysis?.isExactPhraseMatch && matchAnalysis?.isMultiWord
                              ? 'ring-1 ring-emerald-400/70'
                              : ''
                          }`}
                          style={{ borderRightColor: noteBg }}
                        >
                          <div className="flex items-center justify-between gap-1.5 flex-wrap pb-1 mb-1 border-b border-neutral-100">
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 min-w-0">
                              <span
                                className="w-2 h-2 rounded-full shrink-0 ring-1 ring-black/15"
                                style={{ backgroundColor: noteBg }}
                              />
                              <button
                                type="button"
                                onClick={() => handleOpenStickyViewer(entry)}
                                className="text-xs sm:text-[13px] font-bold text-neutral-900 hover:text-sky-700 hover:underline text-right cursor-pointer leading-tight"
                              >
                                <HighlightedText text={displayTitle} query={deferredSearchQuery} />
                              </button>
                              <span className="text-[10px] text-neutral-300">|</span>
                              <span className="text-[10.5px] font-medium text-neutral-600 inline-flex items-center gap-1">
                                <BookOpen className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                                <HighlightedText text={entry.fileName} query={deferredSearchQuery} />
                              </span>
                              <span
                                className="px-1.5 py-0 rounded text-[9.5px] font-mono font-black text-black shadow-2xs"
                                style={{ backgroundColor: noteBg }}
                              >
                                ص <HighlightedText text={String(entry.note.pageNumber)} query={deferredSearchQuery} />
                              </span>
                              {matchAnalysis?.isMultiWord && (
                                <span
                                  className={`px-1 py-0 rounded text-[9.5px] font-bold ${
                                    matchAnalysis.isExactPhraseMatch
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {matchAnalysis.isExactPhraseMatch ? 'تطابق دقیق' : 'شامل کلمات'}
                                </span>
                              )}
                              {matchAnalysis && matchAnalysis.locations.length > 0 && (
                                <span className="text-[10px] text-neutral-500 font-medium">
                                  ({matchAnalysis.locations.join(' • ')})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0 text-[10.5px]">
                              {onOpenFileAtPage && (
                                <button
                                  type="button"
                                  onClick={() => onOpenFileAtPage(entry.file, entry.note.pageNumber)}
                                  className="px-1.5 py-0.5 text-neutral-700 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200/80 rounded cursor-pointer flex items-center gap-1 font-medium"
                                  title="رفتن به این صفحه در فایل"
                                >
                                  <ExternalLink className="w-2.5 h-2.5" />
                                  <span>در فایل</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleOpenStickyViewer(entry)}
                                className="px-1.5 py-0.5 text-neutral-700 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200/80 rounded cursor-pointer flex items-center gap-1 font-medium"
                                title="مشاهده متن کامل"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                <span>متن کامل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyText(rawContent, 'متن استیکی‌نوت')}
                                className="p-0.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer"
                                title="کپی متن"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleOpenEditStickyNote(entry, e)}
                                className="p-0.5 text-neutral-500 hover:text-sky-600 hover:bg-sky-50 rounded cursor-pointer"
                                title="ویرایش سریع"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div
                            onClick={() => {
                              if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
                              handleOpenStickyViewer(entry);
                            }}
                            className="space-y-0.5 cursor-pointer"
                          >
                            {excerpts.length > 0 ? (
                              excerpts.map((excerpt, idx) => (
                                <p
                                  key={idx}
                                  className={`text-[11.5px] sm:text-xs text-neutral-900 leading-[1.5] whitespace-pre-line select-text text-right ${
                                    entry.note.isBold ? 'font-bold' : 'font-normal'
                                  }`}
                                >
                                  <HighlightedText text={excerpt} query={deferredSearchQuery} />
                                </p>
                              ))
                            ) : (
                              <p className="text-[11px] text-neutral-400 italic">بدون متن...</p>
                            )}
                            {hiddenExcerptCount > 0 && (
                              <p className="text-[10.5px] text-sky-600 font-semibold">
                                + {hiddenExcerptCount} بخش دیگر در این یادداشت (برای مشاهده کامل کلیک کنید)
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filteredStickyNotes.length > searchResultLimit && (
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setSearchResultLimit((prev) => prev + 50)}
                        className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl shadow-2xs cursor-pointer"
                      >
                        نمایش نتایج بیشتر ({filteredStickyNotes.length - searchResultLimit} مورد باقی‌مانده)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
                    {filteredStickyNotes.slice(0, stickyCardLimit).map((entry) => {
                      const key = `${entry.fileId}-${entry.note.id}`;
                      const cachedSticky = stickyPreviewMap.get(key);
                      const rawContent = cachedSticky ? cachedSticky.rawContent : htmlToCleanPlainText(entry.note.content || '');
                      const displayTitle = cachedSticky
                        ? cachedSticky.displayTitle
                        : cleanPlainTitleText(entry.note.title || `یادداشت صفحه ${entry.note.pageNumber}`);

                      return (
                        <StickyNoteGridCard
                          key={key}
                          entry={entry}
                          rawContent={rawContent}
                          displayTitle={displayTitle}
                          onOpenViewer={handleOpenStickyViewer}
                          onOpenFileAtPage={onOpenFileAtPage}
                          onCopyText={handleCopyText}
                          onOpenEdit={handleOpenEditStickyNote}
                          onRequestDelete={setDeletingStickyNote}
                          onOpenLightbox={setLightboxState}
                        />
                      );
                    })}
                  </div>
                  {stickyCardLimit < filteredStickyNotes.length && (
                    <div ref={stickyLoadMoreRef} className="pt-5 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(() => {
                            setStickyCardLimit((prev) => Math.min(prev + CARD_BATCH_SIZE, filteredStickyNotes.length));
                          })
                        }
                        className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl shadow-2xs cursor-pointer"
                      >
                        نمایش استیکی‌نوت‌های بیشتر ({filteredStickyNotes.length - stickyCardLimit} مورد باقی‌مانده)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            /* =========================================================
               TAB: لیست یادداشت‌های اختصاصی با انیمیشن فنری کارت‌ها
               ========================================================= */
            <div>
              {filteredNotes.length === 0 ? (
                <div className="bg-white rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-3 shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)]">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center shadow-2xs">
                    <FileText className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-neutral-800">
                    {deferredSearchQuery || selectedFolderId !== 'all'
                      ? 'هیچ یادداشتی با این فیلتر یافت نشد'
                      : 'هنوز یادداشتی ثبت نشده است'}
                  </h3>
                  <p className="text-xs text-neutral-400 max-w-sm leading-relaxed">
                    می‌توانید برای یادداشت‌برداری و خلاصه‌نویسی نکات درسی، یک یادداشت جدید ایجاد کرده یا فایلی را بارگذاری کنید.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={onStartNewNote}
                      className="px-4 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl shadow-xs cursor-pointer ios-spring-btn flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>ایجاد یادداشت جدید</span>
                    </button>
                    {onTriggerNewFile && (
                      <button
                        type="button"
                        onClick={onTriggerNewFile}
                        className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn flex items-center gap-1.5"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>افزودن فایل دلخواه</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : deferredSearchQuery.trim() ? (
                <div className="space-y-1.5" dir="rtl">
                  <div className="flex items-center justify-between gap-2 pb-1 border-b border-neutral-200/80 text-[11.5px] text-neutral-500">
                    <span>
                      <strong className="text-neutral-900">{filteredNotes.length}</strong> نتیجه متنی برای «{deferredSearchQuery.trim()}»
                    </span>
                    <span className="text-[10.5px] text-neutral-500">
                      نمایش مستقیم متن یادداشت‌ها (برای مشاهده کامل روی عنوان کلیک کنید)
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {filteredNotes.slice(0, searchResultLimit).map((note) => {
                      const noteFolder =
                        folders.find((f) => f.id === note.folderId) ||
                        (note.category
                          ? folders.find((f) => f.name.trim().toLowerCase() === note.category?.trim().toLowerCase())
                          : undefined);
                      const cachedNote = notePreviewMap.get(note.id);
                      const preview = cachedNote ? cachedNote.preview : htmlToPreviewText(note.content || '');
                      const noteTitle = note.title || 'بدون عنوان';
                      const accentColor = noteFolder?.color || (note.isPinned ? '#f59e0b' : '#0ea5e9');
                      const meta = noteSearchMetaMap.get(note.id);
                      const matchAnalysis = meta?.matchAnalysis;
                      const excerpts = meta?.excerpts ?? [];
                      const hiddenExcerptCount = meta?.hiddenExcerptCount ?? 0;

                      return (
                        <div
                          key={note.id}
                          className={`bg-white rounded-lg border border-neutral-200/90 border-r-[3px] px-2.5 sm:px-3 py-1.5 shadow-[0_1px_5px_-2px_rgba(0,0,0,0.06)] hover:border-neutral-300 hover:shadow-[0_4px_12px_-3px_rgba(0,0,0,0.09)] transition-all group ${
                            matchAnalysis?.isExactPhraseMatch && matchAnalysis?.isMultiWord
                              ? 'ring-1 ring-emerald-400/70'
                              : ''
                          }`}
                          style={{ borderRightColor: accentColor }}
                        >
                          <div className="flex items-center justify-between gap-1.5 flex-wrap pb-1 mb-1 border-b border-neutral-100">
                            <div className="flex items-center flex-wrap gap-x-1.5 gap-y-0.5 min-w-0">
                              <FileText className="w-3 h-3 text-neutral-400 shrink-0" />
                              <button
                                type="button"
                                onClick={() => handleOpenNoteViewer(note)}
                                className="text-xs sm:text-[13px] font-bold text-neutral-900 hover:text-sky-700 hover:underline text-right cursor-pointer leading-tight"
                              >
                                <HighlightedText text={noteTitle} query={deferredSearchQuery} />
                              </button>
                              {(noteFolder || note.category) && (
                                <>
                                  <span className="text-[10px] text-neutral-300">|</span>
                                  <span className="px-1.5 py-0 rounded bg-neutral-100 text-[10px] font-medium text-neutral-700 inline-flex items-center gap-1">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: noteFolder?.color || '#2563eb' }}
                                    />
                                    <HighlightedText text={noteFolder?.name || note.category || ''} query={deferredSearchQuery} />
                                  </span>
                                </>
                              )}
                              {matchAnalysis?.isMultiWord && (
                                <span
                                  className={`px-1 py-0 rounded text-[9.5px] font-bold ${
                                    matchAnalysis.isExactPhraseMatch
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {matchAnalysis.isExactPhraseMatch ? 'تطابق دقیق' : 'شامل کلمات'}
                                </span>
                              )}
                              {matchAnalysis && matchAnalysis.locations.length > 0 && (
                                <span className="text-[10px] text-neutral-500 font-medium">
                                  ({matchAnalysis.locations.join(' • ')})
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5 shrink-0 text-[10.5px]">
                              <span className="text-[10px] text-neutral-400 font-mono pl-1">
                                {note.updatedAt ? formatDisplayDate(note.updatedAt) : formatDisplayDate(note.createdAt)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenNoteViewer(note)}
                                className="px-1.5 py-0.5 text-neutral-700 hover:text-neutral-950 bg-neutral-100 hover:bg-neutral-200/80 rounded cursor-pointer flex items-center gap-1 font-medium"
                                title="مشاهده متن کامل"
                              >
                                <Eye className="w-2.5 h-2.5" />
                                <span>متن کامل</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCopyText(preview, 'متن یادداشت')}
                                className="p-0.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer"
                                title="کپی متن"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelectNoteToEdit(note.id)}
                                className="p-0.5 text-neutral-500 hover:text-sky-600 hover:bg-sky-50 rounded cursor-pointer"
                                title="ویرایش در ویرایشگر پیشرفته"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          <div
                            onClick={() => {
                              if (typeof window !== 'undefined' && window.getSelection()?.toString()) return;
                              handleOpenNoteViewer(note);
                            }}
                            className="space-y-0.5 cursor-pointer"
                          >
                            {excerpts.length > 0 ? (
                              excerpts.map((excerpt, idx) => (
                                <p
                                  key={idx}
                                  className="text-[11.5px] sm:text-xs text-neutral-800 leading-[1.5] whitespace-pre-line select-text text-right"
                                >
                                  <HighlightedText text={excerpt} query={deferredSearchQuery} />
                                </p>
                              ))
                            ) : (
                              <p className="text-[11px] text-neutral-400 italic">بدون متن</p>
                            )}
                            {hiddenExcerptCount > 0 && (
                              <p className="text-[10.5px] text-sky-600 font-semibold">
                                + {hiddenExcerptCount} بخش دیگر در این یادداشت (برای مشاهده کامل کلیک کنید)
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {filteredNotes.length > searchResultLimit && (
                    <div className="pt-2 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setSearchResultLimit((prev) => prev + 50)}
                        className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl shadow-2xs cursor-pointer"
                      >
                        نمایش نتایج بیشتر ({filteredNotes.length - searchResultLimit} مورد باقی‌مانده)
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
                    {filteredNotes.slice(0, noteCardLimit).map((note) => {
                      const cachedNote = notePreviewMap.get(note.id);
                      const noteFolder =
                        cachedNote?.folder ||
                        folders.find((f) => f.id === note.folderId) ||
                        (note.category
                          ? folders.find((f) => f.name.trim().toLowerCase() === note.category?.trim().toLowerCase())
                          : undefined);
                      const preview = cachedNote ? cachedNote.preview : htmlToPreviewText(note.content || '');
                      const cardImages = cachedNote ? cachedNote.images : extractImagesFromHtml(note.content || '');

                      return (
                        <StandaloneNoteGridCard
                          key={note.id}
                          note={note}
                          noteFolder={noteFolder}
                          preview={preview}
                          cardImages={cardImages}
                          onOpenViewer={handleOpenNoteViewer}
                          onTogglePinNote={onTogglePinNote}
                          onCopyText={handleCopyText}
                          onSelectNoteToEdit={onSelectNoteToEdit}
                          onRequestDelete={setDeletingNote}
                          onOpenLightbox={setLightboxState}
                        />
                      );
                    })}
                  </div>
                  {noteCardLimit < filteredNotes.length && (
                    <div ref={noteLoadMoreRef} className="pt-5 flex justify-center">
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(() => {
                            setNoteCardLimit((prev) => Math.min(prev + CARD_BATCH_SIZE, filteredNotes.length));
                          })
                        }
                        className="px-4 py-1.5 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200 hover:border-neutral-300 rounded-xl shadow-2xs cursor-pointer"
                      >
                        نمایش یادداشت‌های بیشتر ({filteredNotes.length - noteCardLimit} مورد باقی‌مانده)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ========================================================
          POPUP MODALS & DIALOGS
          ======================================================== */}

      {/* Clean Reader Modal (پنجره خلوت، کاملاً شارپ و با وضوح بالا برای خواندن استیکی‌نوت یا یادداشت) */}
      {viewingItem && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => setViewingItem(null)}
          dir="rtl"
        >
          <div
            className="bg-white rounded-3xl max-w-xl w-full p-4 sm:p-5 shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] flex flex-col max-h-[min(82vh,680px)] overflow-hidden my-auto shrink-0 animate-ios-modal select-none"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 shrink-0 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: viewingItem.color || '#2563eb' }}
                />
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-xs sm:text-sm font-bold text-neutral-800 truncate">
                    {viewingItem.sourceLabel}
                  </span>
                  {viewingItem.pageNumber && (
                    <span
                      className="px-2 py-0.5 rounded-md text-[11px] font-black font-mono shrink-0 shadow-2xs text-black"
                      style={{
                        backgroundColor: viewingItem.color || '#fef08a',
                        color: '#000000',
                      }}
                    >
                      صفحه {viewingItem.pageNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Font Size Adjusters & Close */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-0.5 bg-neutral-100 p-1 rounded-xl text-xs font-bold text-neutral-600">
                  <button
                    type="button"
                    onClick={() => setReaderFontSize('normal')}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-xs ${
                      readerFontSize === 'normal'
                        ? 'bg-white text-neutral-900 shadow-2xs font-extrabold'
                        : 'hover:text-neutral-900'
                    }`}
                    title="اندازه فونت استاندارد"
                  >
                    A
                  </button>
                  <button
                    type="button"
                    onClick={() => setReaderFontSize('large')}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-[13px] ${
                      readerFontSize === 'large'
                        ? 'bg-white text-neutral-900 shadow-2xs font-extrabold'
                        : 'hover:text-neutral-900'
                    }`}
                    title="اندازه فونت بزرگ (پیشنهادی)"
                  >
                    A+
                  </button>
                  <button
                    type="button"
                    onClick={() => setReaderFontSize('huge')}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer text-[14px] ${
                      readerFontSize === 'huge'
                        ? 'bg-white text-neutral-900 shadow-2xs font-extrabold'
                        : 'hover:text-neutral-900'
                    }`}
                    title="اندازه فونت بسیار بزرگ"
                  >
                    A++
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center cursor-pointer shadow-lg shadow-rose-500/30 transition-transform shrink-0 ios-spring-btn"
                  title="خروج و بستن پنجره (Esc)"
                  aria-label="خروج و بستن پنجره"
                >
                  <X className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Modal Title & Content Body (Scrollable with min-h-0 so it NEVER overflows!) */}
            <div ref={viewerBodyRef} className="overflow-y-auto flex-1 min-h-0 space-y-3 pl-1 pr-0.5 custom-column-scroll select-text mt-3" dir="rtl">
              <h2 className="text-base sm:text-lg font-black text-neutral-950 leading-snug tracking-tight text-right w-full">
                <HighlightedText text={viewingItem.title} query={searchQuery} />
              </h2>

              {viewingItem.type === 'sticky' ? (
                /* Styled Sticky Note Card Box with authentic paper look & high contrast */
                <div
                  className="px-4 py-3.5 sm:px-5 sm:py-4 rounded-2xl select-text transition-all shadow-[0_8px_22px_-4px_rgba(0,0,0,0.10)] flex flex-col justify-start items-start text-right w-full mx-auto"
                  style={{
                    backgroundColor: viewingItem.color || '#fef08a',
                    color: '#000000',
                  }}
                  dir="rtl"
                >
                  {viewingItem.rawHtml ? (
                    <div
                      dangerouslySetInnerHTML={{
                        __html: searchQuery.trim()
                          ? highlightHtmlContent(viewingItem.rawHtml, searchQuery)
                          : viewingItem.rawHtml,
                      }}
                      className={`study-rich-content font-sans text-right w-full break-words text-neutral-950 ${
                        viewingItem.isBold ? 'font-bold' : 'font-medium'
                      } ${
                        readerFontSize === 'normal'
                          ? 'text-[14px] sm:text-[15px] leading-[1.8]'
                          : readerFontSize === 'large'
                          ? 'text-[16px] sm:text-[17px] leading-[2.0]'
                          : 'text-[18px] sm:text-[20px] leading-[2.2]'
                      }`}
                      dir="rtl"
                      style={{ color: '#000000' }}
                    />
                  ) : (
                    <div
                      className={`whitespace-pre-wrap font-sans text-right w-full break-words text-neutral-950 ${
                        viewingItem.isBold ? 'font-bold' : 'font-medium'
                      } ${
                        readerFontSize === 'normal'
                          ? 'text-[14px] sm:text-[15px] leading-[1.8]'
                          : readerFontSize === 'large'
                          ? 'text-[16px] sm:text-[17px] leading-[2.0]'
                          : 'text-[18px] sm:text-[20px] leading-[2.2]'
                      }`}
                      dir="rtl"
                      style={{ color: '#000000' }}
                    >
                      {viewingItem.content ? (
                        <HighlightedText text={viewingItem.content} query={searchQuery} />
                      ) : (
                        <span className="text-neutral-500 italic">بدون متن</span>
                      )}
                    </div>
                  )}

                  {((viewingItem.images && viewingItem.images.length > 0) || viewingItem.imageUrl) && (
                    <div className="mt-4 pt-3.5 border-t border-black/10 w-full">
                      <div className="text-xs font-bold mb-2 opacity-80 flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ImageIcon className="w-3.5 h-3.5" />
                          <span>تصاویر ضمیمه ({viewingItem.images?.length || 1}):</span>
                          <span className="text-[10px] font-normal opacity-70">
                            (برای نمایش تمام‌صفحه با قابلیت زوم کلیک کنید)
                          </span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 overflow-x-auto pb-1.5 custom-column-scroll">
                        {(viewingItem.images && viewingItem.images.length > 0
                          ? viewingItem.images
                          : [viewingItem.imageUrl!]
                        ).map((img, idx) => (
                          <div
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              const allImgs =
                                viewingItem.images && viewingItem.images.length > 0
                                  ? viewingItem.images
                                  : [viewingItem.imageUrl!];
                              setLightboxState({
                                images: allImgs,
                                index: idx,
                                title: viewingItem.title,
                              });
                            }}
                            className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-white/80 group shadow-xs shrink-0 cursor-pointer hover:ring-2 hover:ring-black/40 transition-all select-none"
                            title="کلیک برای نمایش تمام‌صفحه و زوم"
                          >
                            <img
                              src={img}
                              alt={`تصویر ${idx + 1}`}
                              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105 pointer-events-none"
                              loading="lazy"
                            />
                            <div className="absolute top-1 right-1 px-1.5 py-0.2 rounded-md bg-black/70 text-white text-[9px] font-mono font-bold backdrop-blur-xs">
                              {idx + 1}
                            </div>
                            <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                              <ZoomIn className="w-4 h-4 drop-shadow-xs" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Regular Note Clean Reader with rich formatting or preserved paragraphs */
                viewingItem.rawHtml && /<[a-z][\s\S]*>/i.test(viewingItem.rawHtml) ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: searchQuery.trim()
                        ? highlightHtmlContent(viewingItem.rawHtml, searchQuery)
                        : viewingItem.rawHtml,
                    }}
                    dir="rtl"
                    onClick={(e) => {
                      const target = e.target as HTMLElement | null;
                      if (target && target.tagName === 'IMG') {
                        e.preventDefault();
                        e.stopPropagation();
                        const imgEl = target as HTMLImageElement;
                        const imgs = Array.from(e.currentTarget.querySelectorAll('img'));
                        const srcs = imgs.map((el) => el.src).filter(Boolean);
                        const idx = Math.max(0, imgs.indexOf(imgEl));
                        if (srcs.length > 0) {
                          setLightboxState({
                            images: srcs,
                            index: idx,
                            title: viewingItem.title,
                          });
                        }
                      }
                    }}
                    className={`study-rich-content study-rich-content-light text-neutral-950 leading-relaxed font-sans select-text prose max-w-none text-right prose-p:my-2.5 prose-p:leading-[2.0] prose-headings:my-3 prose-headings:text-right prose-ul:my-2 prose-li:my-1 prose-img:rounded-xl prose-img:shadow-sm prose-img:cursor-zoom-in prose-img:transition-transform hover:prose-img:scale-[1.01] ${
                      readerFontSize === 'normal'
                        ? 'text-[14px] sm:text-[15px] prose-p:text-[14px] sm:prose-p:text-[15px]'
                        : readerFontSize === 'large'
                        ? 'text-[16px] sm:text-[17px] prose-p:text-[16px] sm:prose-p:text-[17px]'
                        : 'text-[18px] sm:text-[20px] prose-p:text-[18px] sm:prose-p:text-[20px]'
                    }`}
                  />
                ) : (
                  <div
                    dir="rtl"
                    className={`text-neutral-950 leading-relaxed whitespace-pre-wrap font-sans select-text text-right w-full ${
                      readerFontSize === 'normal'
                        ? 'text-[14px] sm:text-[15px] leading-[2.0]'
                        : readerFontSize === 'large'
                        ? 'text-[16px] sm:text-[17px] leading-[2.2]'
                        : 'text-[18px] sm:text-[20px] leading-[2.4]'
                    }`}
                  >
                    {viewingItem.content ? (
                      <HighlightedText text={viewingItem.content} query={searchQuery} />
                    ) : (
                      <span className="text-neutral-400 italic">بدون متن</span>
                    )}
                  </div>
                )
              )}
            </div>

            {/* Modal Footer Actions - Always Pinned & Perfectly Visible */}
            <div className="pt-3 flex items-center justify-between shrink-0 gap-2 mt-3">
              <span className="text-[11px] text-neutral-400 font-mono">
                {viewingItem.date || ''}
              </span>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                {/* Direct Jump to PDF page button if reading a sticky note */}
                {viewingItem.type === 'sticky' && viewingItem.originalEntry && onOpenFileAtPage && (
                  <button
                    type="button"
                    onClick={() => {
                      const entry = viewingItem.originalEntry!;
                      setViewingItem(null);
                      onOpenFileAtPage(entry.file, entry.note.pageNumber);
                    }}
                    className="px-3 py-1.5 text-xs font-bold text-neutral-800 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer flex items-center gap-1.5 ios-spring-btn"
                    title="رفتن به این صفحه در کتاب"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-neutral-600" />
                    <span>مشاهده در کتاب</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopyText(htmlToPreviewText(viewingItem.rawHtml || viewingItem.content), 'متن')}
                  className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer flex items-center gap-1.5 ios-spring-btn"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>کپی</span>
                </button>

                {viewingItem.type === 'sticky' && viewingItem.originalEntry && (
                  <button
                    type="button"
                    onClick={() => {
                      const entry = viewingItem.originalEntry!;
                      setViewingItem(null);
                      setEditingStickyNote(entry);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-xl cursor-pointer flex items-center gap-1.5 ios-spring-btn"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش</span>
                  </button>
                )}

                {viewingItem.type === 'note' && viewingItem.originalNote && (
                  <button
                    type="button"
                    onClick={() => {
                      const noteId = viewingItem.originalNote!.id;
                      setViewingItem(null);
                      onSelectNoteToEdit(noteId);
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer flex items-center gap-1.5 ios-spring-btn"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewingItem(null)}
                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl cursor-pointer shadow-xs ios-spring-btn"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Folder Creation / Edit Modal (هماهنگ با سبک دیزاین سراسری) */}
      {isFolderModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setIsFolderModalOpen(false)}
          dir="rtl"
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] space-y-4 animate-ios-modal max-h-[min(88vh,600px)] overflow-y-auto my-auto shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
                  <FolderPlus className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">
                  {editingFolder ? 'ویرایش پوشه' : 'ایجاد پوشه جدید'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsFolderModalOpen(false)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center cursor-pointer shadow-lg shadow-rose-500/30 shrink-0 transition-transform ios-spring-btn"
                title="خروج و بستن پنجره (Esc)"
                aria-label="خروج و بستن پنجره"
              >
                <X className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={handleSaveFolder} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  نام دسته‌بندی:
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="مثلاً: نکات کنکور، فیزیک پایه، خلاصه‌ها..."
                  value={folderNameInput}
                  onChange={(e) => setFolderNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-neutral-100/80 rounded-xl text-xs sm:text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-1.5">
                  دسته‌بندی والد (اختیاری - برای زیرمجموعه‌سازی):
                </label>
                <select
                  value={parentFolderIdInput || ''}
                  onChange={(e) => setParentFolderIdInput(e.target.value ? e.target.value : null)}
                  className="w-full px-3.5 py-2.5 bg-neutral-100/80 rounded-xl text-xs sm:text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 focus:bg-white cursor-pointer transition-all"
                >
                  <option value="">بدون والد (دسته‌بندی اصلی)</option>
                  {folders
                    .filter((f) => !f.parentId && (!editingFolder || f.id !== editingFolder.id))
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-neutral-400 mt-1">
                  با انتخاب والد، این دسته‌بندی در زیرمجموعه قرار می‌گیرد تا نوار اصلی همیشه خلوت و مرتب بماند.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700 block mb-2">
                  رنگ برچسب:
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {FOLDER_COLOR_PALETTE.map((pal) => {
                    const isSelected = folderColorInput === pal.value;
                    return (
                      <button
                        key={pal.value}
                        type="button"
                        onClick={() => setFolderColorInput(pal.value)}
                        className={`py-2 px-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer ios-spring-tool transition-all ${
                          pal.bg
                        } ${pal.text} ${
                          isSelected
                            ? 'ring-2 ring-neutral-900 shadow-xs'
                            : 'hover:opacity-85'
                        }`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full ${pal.dot}`} />
                        <span className="text-[11px] truncate">{pal.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFolderModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-semibold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl cursor-pointer shadow-xs ios-spring-btn"
                >
                  {editingFolder ? 'ذخیره تغییرات' : 'ایجاد پوشه'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Folder Confirmation Dialog */}
      {folderToDelete && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setFolderToDelete(null)}
          dir="rtl"
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] space-y-4 animate-ios-modal text-center my-auto shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Folder className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                حذف پوشه «{folderToDelete.name}»
              </h3>
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                با حذف این پوشه، یادداشت‌های داخل آن حذف نخواهند شد و به وضعیت «عمومی و بدون پوشه» منتقل می‌شوند.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setFolderToDelete(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteFolder}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer ios-spring-btn"
              >
                حذف پوشه
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Sticky Note Edit Drawer (پنجره کامل و یکپارچه ویرایش یادداشت همانند محیط مطالعه فایل) */}
      <StickyNoteDrawer
        note={editingStickyNote ? editingStickyNote.note : null}
        isOpen={Boolean(editingStickyNote)}
        fileName={editingStickyNote?.fileName}
        onClose={() => setEditingStickyNote(null)}
        onUpdate={(updatedNote) => {
          if (!editingStickyNote || !onUpdateStickyNote) return;
          onUpdateStickyNote(editingStickyNote.fileId, updatedNote);
          if (viewingItem && viewingItem.id === updatedNote.id) {
            setViewingItem({
              ...viewingItem,
              title: cleanPlainTitleText(updatedNote.title || `یادداشت صفحه ${updatedNote.pageNumber}`),
              content: htmlToCleanPlainText(updatedNote.content || ''),
              rawHtml: normalizeStickyContentToHtml(updatedNote.content || ''),
              color: updatedNote.color,
              textColor: '#000000',
              isBold: updatedNote.isBold,
              imageUrl: updatedNote.imageUrl,
              images: updatedNote.images && updatedNote.images.length > 0 ? updatedNote.images : (updatedNote.imageUrl ? [updatedNote.imageUrl] : []),
            });
          }
          showCopyToast('تغییرات ذخیره شد');
        }}
        onDelete={(noteId) => {
          if (!editingStickyNote || !onDeleteStickyNote) return;
          onDeleteStickyNote(editingStickyNote.fileId, noteId);
          if (viewingItem?.id === noteId) {
            setViewingItem(null);
          }
          setEditingStickyNote(null);
          showCopyToast('استیکی‌نوت حذف شد');
        }}
        allNotes={
          editingStickyNote
            ? allStickyNotes
                .filter((e) => e.fileId === editingStickyNote.fileId)
                .map((e) => e.note)
            : undefined
        }
        onSelectNote={(note) => {
          const entry = allStickyNotes.find((e) => e.note.id === note.id);
          if (entry) {
            setEditingStickyNote(entry);
          }
        }}
        onNavigateToPage={
          onOpenFileAtPage && editingStickyNote
            ? (pageNum) => onOpenFileAtPage(editingStickyNote.file, pageNum)
            : undefined
        }
      />

      {/* Delete Sticky Note Dialog */}
      {deletingStickyNote && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setDeletingStickyNote(null)}
          dir="rtl"
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] space-y-4 animate-ios-modal text-center my-auto shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                حذف استیکی‌نوت
              </h3>
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                آیا از حذف این یادداشت چسبان اطمینان دارید؟
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingStickyNote(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteStickyNote}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer ios-spring-btn"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Standalone Note Dialog */}
      {deletingNote && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setDeletingNote(null)}
          dir="rtl"
        >
          <div
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] space-y-4 animate-ios-modal text-center my-auto shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto shadow-xs">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-neutral-900">
                حذف یادداشت
              </h3>
              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                آیا از حذف یادداشت «{deletingNote.title || 'بدون عنوان'}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setDeletingNote(null)}
                className="flex-1 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl cursor-pointer ios-spring-btn"
              >
                انصراف
              </button>
              <button
                onClick={handleConfirmDeleteNote}
                className="flex-1 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-md cursor-pointer ios-spring-btn"
              >
                بله، حذف شود
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Task Add/Edit Modal */}
      {isTaskModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
          onClick={() => setIsTaskModalOpen(false)}
          dir="rtl"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl p-5 sm:p-6 md:p-7 max-w-md w-full shadow-[0_25px_60px_-15px_rgba(0,0,0,0.25)] space-y-4 animate-ios-modal max-h-[min(88vh,640px)] overflow-y-auto my-auto shrink-0"
          >
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center shadow-2xs">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-neutral-900">
                  {editingTask ? 'ویرایش تسک' : 'افزودن تسک جدید'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTaskModalOpen(false)}
                className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center cursor-pointer shadow-lg shadow-rose-500/30 shrink-0 transition-transform ios-spring-btn"
                title="خروج و بستن پنجره (Esc)"
                aria-label="خروج و بستن پنجره"
              >
                <X className="w-5 h-5 sm:w-5.5 sm:h-5.5 stroke-[2.5]" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  عنوان تسک <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={taskTitleInput}
                  onChange={(e) => setTaskTitleInput(e.target.value)}
                  placeholder="مثال: مطالعه فصل ۳ یا حل تمرین‌ها"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-100/80 focus:bg-white focus:ring-2 focus:ring-neutral-900/10 focus:outline-none text-xs sm:text-sm text-neutral-900 shadow-2xs transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">
                  توضیحات تکمیلی (اختیاری)
                </label>
                <textarea
                  rows={3}
                  value={taskDescInput}
                  onChange={(e) => setTaskDescInput(e.target.value)}
                  placeholder="نکات مهم، منابع یا توضیحات تسک..."
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-100/80 focus:bg-white focus:ring-2 focus:ring-neutral-900/10 focus:outline-none text-xs text-neutral-900 resize-none shadow-2xs transition-all"
                />
              </div>

              {/* Priority Selector */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">اولویت</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'low', label: 'عادی', color: 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200/70', active: 'bg-neutral-900 text-white shadow-sm' },
                    { id: 'medium', label: 'مهم', color: 'bg-amber-100/70 text-amber-800 hover:bg-amber-100', active: 'bg-amber-600 text-white shadow-sm' },
                    { id: 'high', label: 'فوری', color: 'bg-rose-100/70 text-rose-800 hover:bg-rose-100', active: 'bg-rose-600 text-white shadow-sm' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTaskPriorityInput(p.id as 'low' | 'medium' | 'high')}
                      className={`py-2 text-xs font-bold rounded-xl cursor-pointer transition-all shadow-2xs ios-spring-btn ${
                        taskPriorityInput === p.id ? p.active : p.color
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date / Tag */}
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1.5">مهلت یا زمان‌بندی (اختیاری)</label>
                <div className="flex items-center gap-1.5 flex-wrap mb-2">
                  {['امروز', 'فردا', 'این هفته'].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setTaskDueDateInput(chip)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg cursor-pointer transition-all ios-spring-btn ${
                        taskDueDateInput === chip
                          ? 'bg-neutral-900 text-white font-bold shadow-xs'
                          : 'bg-neutral-100 hover:bg-neutral-200/80 text-neutral-600'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={taskDueDateInput}
                  onChange={(e) => setTaskDueDateInput(e.target.value)}
                  placeholder="مثال: امروز، فردا یا تاریخ دلخواه..."
                  className="w-full px-3.5 py-2 rounded-xl bg-neutral-100/80 focus:bg-white focus:ring-2 focus:ring-neutral-900/10 focus:outline-none text-xs text-neutral-900 shadow-2xs transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-xl cursor-pointer ios-spring-btn"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 rounded-xl cursor-pointer shadow-sm hover:shadow ios-spring-btn"
                >
                  {editingTask ? 'ذخیره تغییرات' : 'افزودن تسک'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* 4. Copied Toast Notification with Jelly Physics */}
      {copiedToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-4 py-2.5 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-ios-jelly">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{copiedToast}</span>
        </div>
      )}

      {/* 5. Fullscreen Interactive Lightbox Modal with Zoom & Pan */}
      {lightboxState && (
        <ImageZoomLightbox
          images={lightboxState.images}
          initialIndex={lightboxState.index}
          isOpen={Boolean(lightboxState)}
          onClose={() => setLightboxState(null)}
          title={lightboxState.title}
        />
      )}
    </div>
  );
};

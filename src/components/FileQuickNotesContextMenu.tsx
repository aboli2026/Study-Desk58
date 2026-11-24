import React, { useState, useMemo, useEffect, useRef, useDeferredValue } from 'react';
import {
  Search,
  X,
  StickyNote,
  FileText,
  ArrowLeft,
  Copy,
  Check,
  BookOpen,
  Calendar,
  Sparkles,
  ChevronDown,
  Plus,
  Edit3,
  Image as ImageIcon,
} from 'lucide-react';
import { StudyFile, StickyNoteItem, NoteItem } from '../types';
import {
  normalizePersianSearchText,
  analyzeSearchMatch,
  extractMatchingExcerpts,
  HighlightedText,
  SearchMatchAnalysis,
} from '../utils/searchHighlight';

export interface FileQuickNotesContextMenuProps {
  file: StudyFile;
  position?: { x: number; y: number } | null;
  onClose: () => void;
  notes: NoteItem[];
  onOpenFile: (file: StudyFile) => void;
  onOpenFileAtPage?: (file: StudyFile, pageNumber: number) => void;
  onSwitchToNotes?: (noteId?: string) => void;
  initialTab?: 'sticky' | 'notebook' | 'all';
  onAddNote?: (note: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  currentPage?: number;
}

export const FileQuickNotesContextMenu: React.FC<FileQuickNotesContextMenuProps> = ({
  file,
  onClose,
  notes,
  onOpenFile,
  onOpenFileAtPage,
  onSwitchToNotes,
  initialTab = 'sticky',
  onAddNote,
  currentPage,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [filterType, setFilterType] = useState<'sticky' | 'notebook' | 'all'>(initialTab);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialTab) {
      setFilterType(initialTab);
    }
  }, [initialTab]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Auto-focus search on open for instant finding
  useEffect(() => {
    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Keyboard navigation & Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Clean file title
  const cleanFileName = (name?: string): string => {
    if (!name) return 'فایل مطالعه';
    return name.replace(/\.pdf$/i, '').trim() || name;
  };

  // Sticky notes of this file
  const stickyNotes = useMemo(() => {
    const list = [...(file.stickyNotes || [])];
    // Sort by page number
    return list.sort((a, b) => (a.pageNumber || 1) - (b.pageNumber || 1));
  }, [file.stickyNotes]);

  // Attached notebook notes of this file
  const attachedNotes = useMemo(() => {
    const fileNameClean = (file.name || '').trim().toLowerCase();
    return notes.filter((n) => {
      if (n.attachedFileId && n.attachedFileId === file.id) return true;
      if (n.attachedFileName && n.attachedFileName.trim().toLowerCase() === fileNameClean) return true;
      return false;
    });
  }, [notes, file.id, file.name]);

  // Unified items list with precomputed normalized search fields
  interface UnifiedNoteItem {
    id: string;
    type: 'sticky' | 'notebook';
    title: string;
    content: string;
    pageNumber?: number;
    color?: string;
    textColor?: string;
    date?: string;
    rawSticky?: StickyNoteItem;
    rawNote?: NoteItem;
    isAttached?: boolean;
    imageUrl?: string;
    images?: string[];
    normTitle: string;
    normContent: string;
    normPage: string;
    searchableText: string;
  }

  const allNotesList: UnifiedNoteItem[] = useMemo(() => {
    const items: UnifiedNoteItem[] = [];

    stickyNotes.forEach((s) => {
      const title = s.title || `استیکی‌نوت صفحه ${s.pageNumber}`;
      const content = s.content || '';
      const normTitle = normalizePersianSearchText(title);
      const normContent = normalizePersianSearchText(content);
      const normPage = normalizePersianSearchText(String(s.pageNumber || ''));
      items.push({
        id: s.id,
        type: 'sticky',
        title,
        content,
        pageNumber: s.pageNumber,
        color: s.color || '#fef08a',
        textColor: s.textColor || '#713f12',
        date: s.createdAt,
        rawSticky: s,
        imageUrl: s.imageUrl,
        images: s.images && s.images.length > 0 ? s.images : (s.imageUrl ? [s.imageUrl] : []),
        normTitle,
        normContent,
        normPage,
        searchableText: `${normTitle} ${normContent} صفحه ${normPage} ص ${normPage} ${normPage}`,
      });
    });

    const fileNameClean = (file.name || '').trim().toLowerCase();
    const sortedNotes = [...notes].sort((a, b) => {
      const aAttached = (a.attachedFileId && a.attachedFileId === file.id) || (a.attachedFileName && a.attachedFileName.trim().toLowerCase() === fileNameClean);
      const bAttached = (b.attachedFileId && b.attachedFileId === file.id) || (b.attachedFileName && b.attachedFileName.trim().toLowerCase() === fileNameClean);
      if (aAttached && !bAttached) return -1;
      if (!aAttached && bAttached) return 1;
      return 0;
    });

    sortedNotes.forEach((n) => {
      const isAttached = Boolean(
        (n.attachedFileId && n.attachedFileId === file.id) ||
        (n.attachedFileName && n.attachedFileName.trim().toLowerCase() === fileNameClean)
      );
      const plainText = (n.content || '').replace(/<[^>]*>?/gm, '').trim();
      const title = n.title || 'یادداشت بدون عنوان';
      const normTitle = normalizePersianSearchText(title);
      const normContent = normalizePersianSearchText(plainText);
      items.push({
        id: n.id,
        type: 'notebook',
        title,
        content: plainText,
        date: n.updatedAt || n.createdAt,
        rawNote: n,
        isAttached,
        normTitle,
        normContent,
        normPage: '',
        searchableText: `${normTitle} ${normContent}`,
      });
    });

    return items;
  }, [stickyNotes, notes, file.id, file.name]);

  // Filtered by search and category (with single-pass relevance ranking & cached excerpts)
  const { filteredNotes, searchMetaMap } = useMemo(() => {
    const trimmed = deferredSearchQuery.trim();
    const normQuery = trimmed ? normalizePersianSearchText(trimmed) : '';
    const queryTokens = normQuery ? normQuery.split(' ').filter(Boolean) : [];
    const metaMap = new Map<
      string,
      { matchAnalysis: SearchMatchAnalysis; excerpts: string[]; hiddenExcerptCount: number }
    >();

    const matched = allNotesList.filter((item) => {
      if (filterType === 'sticky' && item.type !== 'sticky') return false;
      if (filterType === 'notebook' && item.type !== 'notebook') return false;

      if (queryTokens.length === 0) return true;
      for (let i = 0; i < queryTokens.length; i++) {
        if (!item.searchableText.includes(queryTokens[i])) return false;
      }
      return true;
    });

    if (queryTokens.length === 0) {
      return { filteredNotes: matched, searchMetaMap: metaMap };
    }

    const scored = matched.map((item) => {
      const matchAnalysis = analyzeSearchMatch(
        {
          title: item.title,
          content: item.content,
          pageLabel: item.pageNumber ? String(item.pageNumber) : '',
        },
        trimmed,
        {
          title: item.normTitle,
          content: item.normContent,
          page: item.normPage,
        }
      );
      const { excerpts, hiddenExcerptCount } = extractMatchingExcerpts(item.content, trimmed, {
        maxFullTextLength: 180,
        contextBefore: 35,
        contextAfter: 75,
        maxExcerpts: 4,
      });
      metaMap.set(item.id, { matchAnalysis, excerpts, hiddenExcerptCount });
      return { item, score: matchAnalysis.relevanceScore };
    });

    scored.sort((a, b) => b.score - a.score);
    return { filteredNotes: scored.map((s) => s.item), searchMetaMap: metaMap };
  }, [allNotesList, deferredSearchQuery, filterType]);

  const handleCopy = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const handleJumpToPage = (pageNum: number) => {
    onClose();
    if (onOpenFileAtPage) {
      onOpenFileAtPage(file, pageNum);
    } else {
      onOpenFile(file);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto transition-opacity duration-150"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
        className="w-full max-w-2xl max-h-[min(82vh,680px)] bg-white rounded-3xl shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] flex flex-col overflow-hidden text-neutral-800 my-auto animate-ios-modal"
      >
        {/* Header - Spacious & Clean */}
        <div className="p-5 sm:p-6 bg-white shadow-[0_6px_20px_-4px_rgba(0,0,0,0.08)] relative z-10 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-semibold">
                  <StickyNote className="w-3.5 h-3.5 text-amber-700" />
                  <span>دسترسی سریع به یادداشت‌ها</span>
                </span>
                <span className="text-xs text-neutral-400 font-mono">
                  {allNotesList.length} مورد یافت شد
                </span>
              </div>
              <h2
                className="text-lg sm:text-xl font-bold text-neutral-900 truncate tracking-tight pt-0.5"
                title={file.name}
              >
                {cleanFileName(file.name)}
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-lg shadow-rose-500/30 cursor-pointer shrink-0 transition-transform ios-spring-btn"
              title="خروج و بستن پنجره (Esc)"
              aria-label="خروج و بستن"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5]" />
            </button>
          </div>

          {/* Quick Search Box - Instant Real-Time Filter */}
          <div className="relative w-full">
            <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
              <Search className="w-4 h-4" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجو در متن یادداشت‌ها، عنوان، یا شماره صفحه..."
              className="w-full pr-10 pl-10 py-3 bg-neutral-100/80 focus:bg-white rounded-2xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 p-0.5 cursor-pointer ios-spring-tool"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Clean Filter Tabs + Add Note Action Button */}
          <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterType('sticky')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn ${
                  filterType === 'sticky'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-neutral-100/80 text-neutral-600 hover:bg-amber-50 hover:text-amber-800'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5" />
                <span>استیکی‌نوت‌ها ({stickyNotes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterType('notebook')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ios-spring-btn ${
                  filterType === 'notebook'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-neutral-100/80 text-neutral-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>یادداشت‌های اصلی ({notes.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ios-spring-btn ${
                  filterType === 'all'
                    ? 'bg-neutral-900 text-white shadow-xs'
                    : 'bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/75'
                }`}
              >
                همه ({allNotesList.length})
              </button>
            </div>

            {/* دکمه باز کردن در دفترچه کامل (فقط در بخش یادداشت‌ها) */}
            {onSwitchToNotes && filterType !== 'sticky' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSwitchToNotes();
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ios-spring-btn shrink-0"
                title="باز کردن در دفترچه یادداشت کامل"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>باز کردن در دفترچه کامل</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Area - Spacious, Uncluttered, Readable */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 bg-neutral-100/80">
          {filteredNotes.length === 0 ? (
            <div className="py-16 px-4 text-center flex flex-col items-center justify-center bg-white rounded-3xl shadow-[0_12px_30px_-4px_rgba(0,0,0,0.10),0_4px_10px_-2px_rgba(0,0,0,0.06)]">
              <div className="w-14 h-14 rounded-2xl bg-neutral-100 text-neutral-400 flex items-center justify-center mb-3">
                <StickyNote className="w-6 h-6 stroke-1" />
              </div>
              <h3 className="text-base font-bold text-neutral-800">
                {deferredSearchQuery ? 'یادداشتی با این عبارت پیدا نشد' : 'هیچ یادداشتی در این فایل ثبت نشده'}
              </h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm leading-relaxed">
                {deferredSearchQuery
                  ? 'عبارت دیگری را جستجو کنید یا فیلتر را تغییر دهید.'
                  : 'در حین مطالعه فایل می‌توانید با ابزار استیکی‌نوت نکات مهم را روی صفحات ثبت کنید یا به دفترچه کامل بروید.'}
              </p>
              {onSwitchToNotes && !deferredSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onSwitchToNotes();
                  }}
                  className="mt-4 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-xs ios-spring-btn"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>باز کردن در دفترچه کامل</span>
                </button>
              )}
            </div>
          ) : deferredSearchQuery.trim() ? (
            <div className="space-y-1.5">
              {filteredNotes.map((item) => {
                const isSticky = item.type === 'sticky';
                const meta = searchMetaMap.get(item.id);
                const matchAnalysis = meta?.matchAnalysis;
                const excerpts = meta?.excerpts ?? [];
                const hiddenExcerptCount = meta?.hiddenExcerptCount ?? 0;
                const accentColor = isSticky ? item.color || '#fef08a' : '#2563eb';

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-lg border border-neutral-200/90 border-r-[3px] px-2.5 py-1.5 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.05)] space-y-1 text-right ${
                      matchAnalysis?.isExactPhraseMatch && matchAnalysis?.isMultiWord
                        ? 'ring-1 ring-emerald-400/70'
                        : ''
                    }`}
                    style={{ borderRightColor: accentColor }}
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap pb-1 border-b border-neutral-100">
                      <div className="flex items-center flex-wrap gap-1 min-w-0">
                        {isSticky ? (
                          <span
                            style={{
                              backgroundColor: item.color || '#fef08a',
                              color: '#000000',
                            }}
                            className="px-1.5 py-0 rounded text-[9.5px] font-bold font-mono shrink-0 shadow-2xs"
                          >
                            ص <HighlightedText text={String(item.pageNumber || '')} query={deferredSearchQuery} />
                          </span>
                        ) : (
                          <span className="px-1.5 py-0 rounded bg-blue-50 text-[9.5px] font-semibold text-blue-700 shrink-0">
                            {item.isAttached ? 'متصل به فایل' : 'یادداشت'}
                          </span>
                        )}
                        <span className="text-xs font-bold text-neutral-900 leading-tight">
                          <HighlightedText text={item.title} query={deferredSearchQuery} />
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
                          <span className="text-[10px] text-neutral-500">
                            ({matchAnalysis.locations.join(' • ')})
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0">
                        {isSticky && item.pageNumber && (
                          <button
                            type="button"
                            onClick={() => handleJumpToPage(item.pageNumber!)}
                            className="px-1.5 py-0.5 text-[10.5px] font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded cursor-pointer flex items-center gap-1"
                          >
                            <span>صفحه {item.pageNumber}</span>
                            <ArrowLeft className="w-2.5 h-2.5" />
                          </button>
                        )}
                        {!isSticky && onSwitchToNotes && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose();
                              onSwitchToNotes(item.id);
                            }}
                            className="px-1.5 py-0.5 text-[10.5px] font-semibold text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200/80 rounded cursor-pointer flex items-center gap-1"
                          >
                            <span>باز کردن</span>
                            <ArrowLeft className="w-2.5 h-2.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCopy(item.content, item.id)}
                          className="p-0.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded cursor-pointer"
                          title="کپی متن"
                        >
                          {copiedId === item.id ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-0.5 select-text">
                      {excerpts.length > 0 ? (
                        excerpts.map((excerpt, idx) => (
                          <p key={idx} className="text-[11.5px] text-neutral-800 leading-[1.45] whitespace-pre-line">
                            <HighlightedText text={excerpt} query={deferredSearchQuery} />
                          </p>
                        ))
                      ) : (
                        <p className="text-[11px] text-neutral-400 italic">بدون محتوای متنی</p>
                      )}
                      {hiddenExcerptCount > 0 && (
                        <p className="text-[10.5px] text-sky-600 font-medium">
                          + {hiddenExcerptCount} بخش دیگر در این یادداشت
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((item) => {
                const isSticky = item.type === 'sticky';
                const isExpanded = expandedId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl transition-all duration-200 overflow-hidden bg-white ${
                      isExpanded
                        ? isSticky
                          ? 'ring-2 ring-amber-400/80 shadow-[0_14px_34px_-4px_rgba(0,0,0,0.14),0_4px_12px_-2px_rgba(0,0,0,0.08)]'
                          : 'ring-2 ring-blue-500/75 shadow-[0_14px_34px_-4px_rgba(0,0,0,0.14),0_4px_12px_-2px_rgba(0,0,0,0.08)]'
                        : 'shadow-[0_8px_22px_-4px_rgba(0,0,0,0.10),0_3px_8px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_14px_30px_-4px_rgba(0,0,0,0.15),0_4px_12px_-2px_rgba(0,0,0,0.08)] hover:-translate-y-0.5'
                    }`}
                  >
                    {/* Header Row - Compact, List-style & Clickable to Expand with tactile spring */}
                    <div
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="p-3.5 sm:p-4 flex items-center justify-between gap-3 cursor-pointer select-none transition-colors"
                    >
                      {/* Right: Badge + Title + Truncated preview */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {isSticky ? (
                          <span
                            style={{
                              backgroundColor: item.color || '#fef08a',
                              color: '#000000',
                            }}
                            className="px-2 py-0.5 rounded-lg text-[10px] font-bold font-mono shrink-0 shadow-2xs ios-spring-tool"
                          >
                            ص {String(item.pageNumber || '')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-blue-50 text-blue-700 shrink-0 ios-spring-tool">
                            {item.isAttached ? 'متصل به فایل' : 'یادداشت'}
                          </span>
                        )}

                        <div className="min-w-0 flex-1">
                          <h4 className="text-xs sm:text-sm font-bold text-neutral-900 whitespace-normal break-words leading-snug">
                            {item.title}
                          </h4>
                          {!isExpanded && item.content && (
                            <p className="text-xs text-neutral-500 truncate mt-0.5">
                              {item.content}
                            </p>
                          )}
                        </div>

                        {item.imageUrl && (
                          <span className="p-0.5 rounded-md bg-blue-50 text-blue-600 shrink-0" title="دارای تصویر پیوست">
                            <ImageIcon className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>

                      {/* Left: Date + Chevron Toggle */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.date && (
                          <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">
                            {item.date}
                          </span>
                        )}
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 ios-spring-tool ${
                            isExpanded
                              ? 'bg-neutral-900 text-white rotate-180'
                              : 'bg-neutral-100 text-neutral-500'
                          }`}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>

                    {/* Extended Section (نمایش کامل متن، عکس و اکشن‌ها هنگام کلیک با انیمیشن روان و سبک) */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-3 bg-neutral-100/65 space-y-3 animate-ios-card-expand">
                        {/* Attached Images if present */}
                        {((item.images && item.images.length > 0) || item.imageUrl) && (
                          <div
                            className={`grid gap-2 ${
                              (item.images?.length || 1) === 1 ? 'grid-cols-1' : 'grid-cols-2'
                            }`}
                          >
                            {(item.images && item.images.length > 0 ? item.images : [item.imageUrl!]).map(
                              (img, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-xl overflow-hidden bg-white max-h-56 flex items-center justify-center shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                                >
                                  <img
                                    src={img}
                                    alt="تصویر یادداشت چسبان"
                                    className="w-full h-auto max-h-56 object-contain rounded-xl"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        )}

                        {/* Text body - Symmetrical left/right spacing, right aligned */}
                        <div className="p-4 sm:p-5 rounded-xl bg-white select-text shadow-[0_4px_14px_-2px_rgba(0,0,0,0.06)] text-right w-full flex flex-col justify-center" dir="rtl">
                          <p className="text-xs sm:text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap font-normal text-right px-1">
                            {item.content ? item.content : 'بدون محتوای متنی'}
                          </p>
                        </div>

                        {/* Action buttons inside extended card */}
                        <div className="flex items-center justify-between gap-2 pt-0.5">
                          <div className="flex items-center gap-2">
                            {isSticky && item.pageNumber && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleJumpToPage(item.pageNumber!);
                                }}
                                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ios-spring-btn"
                              >
                                <span>مشاهده در صفحه {item.pageNumber}</span>
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}

                            {!isSticky && onSwitchToNotes && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClose();
                                  onSwitchToNotes(item.id);
                                }}
                                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ios-spring-btn"
                              >
                                <span>ویرایش در دفترچه اصلی</span>
                                <ArrowLeft className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopy(item.content, item.id);
                              }}
                              className="px-2.5 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer ios-spring-btn"
                              title="کپی متن"
                            >
                              {copiedId === item.id ? (
                                <>
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-emerald-600 font-bold">کپی شد</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>کپی متن</span>
                                </>
                              )}
                            </button>
                          </div>

                          {item.date && (
                            <span className="text-[11px] font-mono text-neutral-400">
                              {item.date}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - Subtle Action Bar */}
        <div className="p-4 px-6 bg-white shadow-[0_-6px_20px_-4px_rgba(0,0,0,0.07)] relative z-10 flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-2">
            <span>کلید Esc برای بستن</span>
            <span>·</span>
            <span>کلیک روی «مشاهده در صفحه» برای رفتن به متن پی‌دی‌اف</span>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFile(file);
            }}
            className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs ios-spring-btn"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>مطالعه فایل</span>
          </button>
        </div>
      </div>
    </div>
  );
};

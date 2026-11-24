import React, { useRef, useState, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Expand,
  Loader2,
  Plus,
  Trash2,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  MousePointer2,
  TextSelect,
  Pencil,
  Highlighter,
  StickyNote,
  Eraser,
  CircleDot,
  MousePointerClick,
  Crosshair,
  Ruler,
  Bold,
  Keyboard,
  RotateCcw,
  Check,
  Search,
  Copy,
  Clock,
  Settings,
  Palette,
  Sun,
  Moon,
  Eye,
  Sliders,
  SlidersHorizontal,
  Save,
  HardDrive,
  Download,
  Edit3,
  Calendar,
  ArrowUpRight,
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { StudyFile, DrawingStroke, StickyNoteItem, PomodoroMode, PomodoroSettings, EyeComfortSettings, EyeComfortMode, ToolShortcuts, NoteItem, CapsulePosition, isCapsuleVertical } from '../types';
import { PdfPage } from './PdfPage';
import { StickyNoteDrawer } from './StickyNoteDrawer';
import { SettingsView } from './SettingsView';
import { NotesView } from './NotesView';
import { FlatHandIcon } from './FlatHandIcon';
import { AppleCapsuleSlider } from './AppleCapsuleSlider';
import {
  getAllStudyFiles,
  saveStudyFileToStorage,
  deleteStudyFileFromStorage,
  saveFileEditsToStorage,
  getFileEditsFromStorage,
  registerFileHandle,
  getFileHandle,
  mergeStickyNotes,
  mergePageStrokes,
  updateFilePageCountInStorage,
  normalizeFileName,
} from '../utils/fileStorage';
import { exportAnnotatedPdf, extractWorkspaceDataFromPdf } from '../utils/exportPdf';
import { inspectBackupFile, restoreFullWorkspaceBackup } from '../utils/backupService';
import { seedFileBaselineIfNeeded, recordFilePageProgress } from '../utils/fileProgressHistory';
import { extractTextFromPdfPage, normalizeExtractedPdfText } from '../utils/pdfTextExtractor';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_STORAGE_KEY,
  TOOL_SHORTCUT_LABELS,
  EN_TO_FA_KEY_MAP,
  FA_TO_EN_KEY_MAP,
  normalizeShortcutKey,
  isAssignableShortcutEvent,
  isShortcutMatch,
  formatShortcutLabel,
  sanitizeShortcuts,
  getDuplicateShortcutsInfo,
} from '../utils/shortcuts';

// Helper to resolve asset URLs consistently across web, subpaths, and desktop/Electron file:// environments
const resolvePdfAssetUrl = (relativePath: string): string => {
  if (typeof window === 'undefined') return `/${relativePath}`;
  try {
    if (window.location.protocol === 'file:') {
      return new URL(`./${relativePath}`, window.location.href).href;
    }
    const origin = window.location.origin && window.location.origin !== 'null' ? window.location.origin : '';
    return `${origin}/${relativePath}`;
  } catch {
    return `/${relativePath}`;
  }
};

// Configure PDF worker from Vite bundle (automatically resolved and bundled as asset)
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || resolvePdfAssetUrl('pdf.worker.min.mjs');
}

// Standard, beautifully proportioned 2D flat palm (open) and fist (grabbing) vector cursors (compact 20px)
const CURSOR_HAND_OPEN = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 512 512">
    <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 272c0 1.5 0 3.1 .1 4.6L67.6 283c-16-15.2-41.3-14.6-56.6 1.4s-14.6 41.3 1.4 56.6L124.8 448c43.1 41.1 100.4 64 160 64l19.2 0c97.2 0 176-78.8 176-176l0-208c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 176c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208z" fill="rgba(0,0,0,0.25)" transform="translate(10, 14)" />
    <path d="M288 32c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 208c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 272c0 1.5 0 3.1 .1 4.6L67.6 283c-16-15.2-41.3-14.6-56.6 1.4s-14.6 41.3 1.4 56.6L124.8 448c43.1 41.1 100.4 64 160 64l19.2 0c97.2 0 176-78.8 176-176l0-208c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 112c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-176c0-17.7-14.3-32-32-32s-32 14.3-32 32l0 176c0 8.8-7.2 16-16 16s-16-7.2-16-16l0-208z" fill="#FFFFFF" stroke="#18181B" stroke-width="34" stroke-linejoin="round" stroke-linecap="round" />
  </svg>`
)}`;

const CURSOR_HAND_CLOSED = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 512 512">
    <path d="M192 0c17.7 0 32 14.3 32 32l0 112-64 0 0-112c0-17.7 14.3-32 32-32zM64 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 80-64 0 0-80zm192 0c0-17.7 14.3-32 32-32s32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96zm96 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64zm-96 88l0-.6c9.4 5.4 20.3 8.6 32 8.6c13.2 0 25.4-4 35.6-10.8c8.7 24.9 32.5 42.8 60.4 42.8c11.7 0 22.6-3.1 32-8.6l0 8.6c0 52.3-25.1 98.8-64 128l0 96c0 17.7-14.3 32-32 32l-160 0c-17.7 0-32-14.3-32-32l0-78.4c-17.3-7.9-33.2-18.8-46.9-32.5L69.5 357.5C45.5 333.5 32 300.9 32 267l0-27c0-35.3 28.7-64 64-64l88 0c22.1 0 40 17.9 40 40s-17.9 40-40 40l-56 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l56 0c39.8 0 72-32.2 72-72z" fill="rgba(0,0,0,0.25)" transform="translate(42, 14)" />
    <g transform="translate(32, 0)">
      <path d="M192 0c17.7 0 32 14.3 32 32l0 112-64 0 0-112c0-17.7 14.3-32 32-32zM64 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 80-64 0 0-80zm192 0c0-17.7 14.3-32 32-32s32 14.3 32 32l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96zm96 64c0-17.7 14.3-32 32-32s32 14.3 32 32l0 64c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-64zm-96 88l0-.6c9.4 5.4 20.3 8.6 32 8.6c13.2 0 25.4-4 35.6-10.8c8.7 24.9 32.5 42.8 60.4 42.8c11.7 0 22.6-3.1 32-8.6l0 8.6c0 52.3-25.1 98.8-64 128l0 96c0 17.7-14.3 32-32 32l-160 0c-17.7 0-32-14.3-32-32l0-78.4c-17.3-7.9-33.2-18.8-46.9-32.5L69.5 357.5C45.5 333.5 32 300.9 32 267l0-27c0-35.3 28.7-64 64-64l88 0c22.1 0 40 17.9 40 40s-17.9 40-40 40l-56 0c-8.8 0-16 7.2-16 16s7.2 16 16 16l56 0c39.8 0 72-32.2 72-72z" fill="#FFFFFF" stroke="#18181B" stroke-width="34" stroke-linejoin="round" stroke-linecap="round" />
    </g>
  </svg>`
)}`;

const EMPTY_STROKES: DrawingStroke[] = [];
const EMPTY_STICKY_NOTES: StickyNoteItem[] = [];

export {
  DEFAULT_SHORTCUTS,
  EN_TO_FA_KEY_MAP,
  FA_TO_EN_KEY_MAP,
  normalizeShortcutKey,
  isShortcutMatch,
  formatShortcutLabel,
};

interface OpenFileViewProps {
  currentFile: StudyFile | null;
  onFileSelect: (file: StudyFile | null) => void;
  onTriggerPicker?: () => void;
  notes?: NoteItem[];
  onAddNote?: (note: Omit<NoteItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateNote?: (id: string, title: string, content: string, extra?: Partial<NoteItem>) => void;
  onDeleteNote?: (id: string) => void;
  onSwitchToNotes?: () => void;
  pomodoroState?: {
    isRunning: boolean;
    timeLeft: number;
    mode: PomodoroMode;
    sessionElapsedSeconds?: number;
    onTogglePlay: () => void;
  };
  pomodoroSettings?: PomodoroSettings;
  onUpdatePomodoroSettings?: (newSettings: PomodoroSettings) => void;
  shortcuts?: ToolShortcuts;
  onUpdateShortcuts?: (newShortcuts: ToolShortcuts) => void;
  onResetShortcuts?: () => void;
}

export const OpenFileView: React.FC<OpenFileViewProps> = ({
  currentFile,
  onFileSelect,
  onTriggerPicker,
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onSwitchToNotes,
  pomodoroState,
  pomodoroSettings,
  onUpdatePomodoroSettings,
  shortcuts: shortcutsProp,
  onUpdateShortcuts,
  onResetShortcuts,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentStackRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<{ scrollTop: number; scrollLeft: number } | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // File list state
  const [savedFiles, setSavedFiles] = useState<StudyFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(true);

  // Load saved files from IndexedDB
  const loadSavedFiles = useCallback(async () => {
    try {
      setIsLoadingFiles(true);
      const files = await getAllStudyFiles();
      setSavedFiles(files);
    } catch (e) {
      console.error('Failed to load files:', e);
    } finally {
      setIsLoadingFiles(false);
    }
  }, []);

  useEffect(() => {
    loadSavedFiles();
    const handleFilesUpdated = (e: Event) => {
      loadSavedFiles();
      const customEvent = e as CustomEvent<{
        fileId?: string;
        stickyNotes?: StickyNoteItem[];
        pageStrokes?: Record<number, DrawingStroke[]>;
      }>;
      const detail = customEvent?.detail;
      if (detail?.fileId && detail.fileId === loadedFileIdRef.current) {
        if (Array.isArray(detail.stickyNotes)) {
          const mergedNotes = mergeStickyNotes(stickyNotesRef.current, detail.stickyNotes);
          stickyNotesRef.current = mergedNotes;
          setStickyNotes(mergedNotes);
        }
        if (detail.pageStrokes) {
          const mergedStrokes = mergePageStrokes(pageStrokesRef.current, detail.pageStrokes);
          pageStrokesRef.current = mergedStrokes;
          setPageStrokes(mergedStrokes);
        }
      }
    };
    window.addEventListener('study_files_updated', handleFilesUpdated);
    return () => {
      window.removeEventListener('study_files_updated', handleFilesUpdated);
    };
  }, [loadSavedFiles]);

  // Deduplicated list of files for gallery (ensures no duplicate file records are rendered)
  const uniqueSavedFiles = useMemo(() => {
    const seen = new Set<string>();
    return savedFiles.filter((file) => {
      const key = (file.name || '').trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [savedFiles]);

  // PDF Document State
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const totalPagesRef = useRef<number>(0);
  const [visiblePage, setVisiblePage] = useState<number>(1);
  const [inputPage, setInputPage] = useState<string>('1');
  const [scale, setScale] = useState<number>(1.2);
  const [isFitMode, setIsFitMode] = useState<boolean>(true);
  const isFitModeRef = useRef<boolean>(true);
  const fitScaleRef = useRef<number>(1.0);
  const isFitWidthLocked = isFitMode || scale <= (fitScaleRef.current + 0.02);

  // Synchronously pin container scroll offset before paint so focal zooming never shifts or displaces
  useLayoutEffect(() => {
    if (pendingScrollRef.current && scrollContainerRef.current) {
      const { scrollTop, scrollLeft } = pendingScrollRef.current;
      scrollContainerRef.current.scrollTop = scrollTop;
      scrollContainerRef.current.scrollLeft = scrollLeft;
      pendingScrollRef.current = null;
    }
  }, [scale]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  // Tool State
  const [activeTool, setActiveTool] = useState<'hand' | 'select' | 'pen' | 'highlighter' | 'ruler' | 'eraser' | 'sticky-note'>('hand');
  const [selectedItem, setSelectedItem] = useState<{
    type: 'note' | 'stroke';
    id: string;
    pageNumber: number;
  } | null>(null);
  // Hand and Select Settings State
  const [isHandSettingsOpen, setIsHandSettingsOpen] = useState<boolean>(false);
  const [isSelectSettingsOpen, setIsSelectSettingsOpen] = useState<boolean>(false);
  const [selectMode, setSelectMode] = useState<'object' | 'text'>(() => {
    try {
      const saved = localStorage.getItem('study_select_mode');
      if (saved === 'object' || saved === 'text') return saved;
    } catch {}
    return 'object';
  });
  const [extractedTextData, setExtractedTextData] = useState<{
    text: string;
    pageNumber: number;
    isFullPage?: boolean;
  } | null>(null);
  const [isExtractedTextExpanded, setIsExtractedTextExpanded] = useState<boolean>(false);
  const [isExtractingPageText, setIsExtractingPageText] = useState<boolean>(false);
  const [copiedExtractedText, setCopiedExtractedText] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('study_select_mode', selectMode);
    } catch {}
  }, [selectMode]);

  useEffect(() => {
    if (selectMode === 'text') {
      setSelectedItem(null);
    } else {
      window.getSelection()?.removeAllRanges();
      setExtractedTextData(null);
      setIsExtractedTextExpanded(false);
    }
  }, [selectMode]);

  useEffect(() => {
    if (activeTool !== 'select') {
      window.getSelection()?.removeAllRanges();
      setExtractedTextData(null);
      setIsExtractedTextExpanded(false);
    }
  }, [activeTool]);

  // Pen Settings State
  const [penColor, setPenColor] = useState<string>('#ef4444');
  const [penWidth, setPenWidth] = useState<number>(2);
  const [isPenSettingsOpen, setIsPenSettingsOpen] = useState<boolean>(false);

  // Highlighter State
  const [highlighterColor, setHighlighterColor] = useState<string>('#ffea00');
  const [highlighterWidth, setHighlighterWidth] = useState<number>(18);
  const [autoStraighten, setAutoStraighten] = useState<boolean>(true);
  const [isHighlighterSettingsOpen, setIsHighlighterSettingsOpen] = useState<boolean>(false);

  // Ruler / Underline State (ابزار خط‌کش / آندرلاین)
  const [rulerColor, setRulerColor] = useState<string>('#2563eb');
  const [rulerWidth, setRulerWidth] = useState<number>(2.5);
  const [rulerLock90, setRulerLock90] = useState<boolean>(true); // قفل 90 درجه فعال به صورت پیشفرض
  const [isRulerSettingsOpen, setIsRulerSettingsOpen] = useState<boolean>(false);

  // Eraser Settings State
  const [eraserMode, setEraserMode] = useState<'area' | 'object'>(() => {
    try {
      const saved = localStorage.getItem('study_eraser_mode');
      if (saved === 'object' || saved === 'area') return saved;
    } catch {}
    return 'area';
  });
  const [eraserSize, setEraserSize] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('study_eraser_size');
      if (saved) return Number(saved);
    } catch {}
    return 28;
  });
  const [isEraserSettingsOpen, setIsEraserSettingsOpen] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem('study_eraser_mode', eraserMode);
    } catch {}
  }, [eraserMode]);

  useEffect(() => {
    try {
      localStorage.setItem('study_eraser_size', String(eraserSize));
    } catch {}
  }, [eraserSize]);

  // Sticky Note Tool Settings State
  const [isStickyNoteSettingsOpen, setIsStickyNoteSettingsOpen] = useState<boolean>(false);

  // Tool Shortcuts State (synchronized with App.tsx and localStorage)
  const [localShortcuts, setLocalShortcuts] = useState<ToolShortcuts>(() => {
    if (shortcutsProp) return sanitizeShortcuts(shortcutsProp);
    try {
      const saved = localStorage.getItem(SHORTCUT_STORAGE_KEY);
      if (saved) return sanitizeShortcuts(JSON.parse(saved));
    } catch {
      // fallback
    }
    return DEFAULT_SHORTCUTS;
  });
  const [listeningShortcutFor, setListeningShortcutFor] = useState<keyof ToolShortcuts | null>(null);

  useEffect(() => {
    if (shortcutsProp) {
      setLocalShortcuts(sanitizeShortcuts(shortcutsProp));
    }
  }, [shortcutsProp]);

  const shortcuts = useMemo(
    () => sanitizeShortcuts(shortcutsProp || localShortcuts),
    [shortcutsProp, localShortcuts]
  );

  const duplicateShortcutInfo = useMemo(
    () => getDuplicateShortcutsInfo(shortcuts),
    [shortcuts]
  );

  const setShortcuts = useCallback(
    (updater: ToolShortcuts | ((prev: ToolShortcuts) => ToolShortcuts)) => {
      const nextRaw = typeof updater === 'function' ? updater(shortcuts) : updater;
      const next = sanitizeShortcuts(nextRaw);
      setLocalShortcuts(next);
      try {
        localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage error
      }
      if (onUpdateShortcuts) {
        onUpdateShortcuts(next);
      }
    },
    [shortcuts, onUpdateShortcuts]
  );

  // Save Status Indicator & Exit Modal State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [isExitModalOpen, setIsExitModalOpen] = useState<boolean>(false);
  const [showSavedToast, setShowSavedToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerToast = useCallback((message: string, duration = 3500) => {
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    setShowSavedToast(message);
    toastTimeoutRef.current = setTimeout(() => {
      toastTimeoutRef.current = null;
      setShowSavedToast(null);
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
        copiedTimeoutRef.current = null;
      }
    };
  }, []);

  // Eye Comfort & Reading Settings State (تنظیمات راحتی چشم، نور صفحه، زرد کردن و طوسی تیره کردن فایل)
  const [eyeComfortSettings, setEyeComfortSettings] = useState<EyeComfortSettings>(() => {
    try {
      const saved = localStorage.getItem('study_eye_comfort_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          colorMode: parsed.colorMode === 'yellow' || parsed.colorMode === 'dark-gray' ? parsed.colorMode : 'normal',
          brightness: Math.min(100, Math.max(30, parsed.brightness ?? 100)),
        };
      }
    } catch (e) {
      console.error('Failed to parse eye comfort settings:', e);
    }
    return {
      brightness: 100,
      colorMode: 'normal',
      warmth: 50,
    };
  });
  const [isEyeComfortOpen, setIsEyeComfortOpen] = useState<boolean>(false);
  const [isNotesModalOpen, setIsNotesModalOpen] = useState<boolean>(false);

  // Right-click Quick Context Settings (تغییر تم و تنظیم روشنایی صفحه با کلیک راست)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);



  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }
    e.preventDefault();
    const menuWidth = 320;
    const menuHeight = 310;
    const padding = 16;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - padding);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - padding);
    setContextMenuPos({ x: Math.max(padding, x), y: Math.max(padding, y) });
  }, []);

  // Dismiss context menu on outside click or Escape key
  useEffect(() => {
    if (!contextMenuPos) return;
    const handleDismiss = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenuPos(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenuPos(null);
      }
    };
    window.addEventListener('mousedown', handleDismiss);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleDismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenuPos]);

  // Capsule Position State (موقعیت قرارگیری کپسول ابزار روی صفحه)
  const [capsulePosition, setCapsulePosition] = useState<CapsulePosition>(() => {
    try {
      const saved = localStorage.getItem('study_capsule_position');
      if (saved) return saved as CapsulePosition;
    } catch {}
    return 'bottom-center';
  });

  const isVerticalCapsule = isCapsuleVertical(capsulePosition);

  const getCapsulePositionClasses = (pos: CapsulePosition) => {
    switch (pos) {
      case 'top-center':
        return 'top-16 sm:top-20 left-1/2 -translate-x-1/2 flex-row capsule-top capsule-horizontal';
      case 'right-center':
        return 'top-1/2 -translate-y-1/2 right-2.5 sm:right-4 flex-col capsule-vertical capsule-vertical-right';
      case 'left-center':
        return 'top-1/2 -translate-y-1/2 left-2.5 sm:left-4 flex-col capsule-vertical capsule-vertical-left';
      case 'right-top':
      case 'top-right':
        return 'top-16 sm:top-20 right-2.5 sm:right-4 flex-col capsule-vertical capsule-vertical-right';
      case 'left-top':
      case 'top-left':
        return 'top-16 sm:top-20 left-2.5 sm:left-4 flex-col capsule-vertical capsule-vertical-left';
      case 'right-bottom':
      case 'bottom-right':
        return 'bottom-3 sm:bottom-6 right-2.5 sm:right-4 flex-col capsule-vertical capsule-vertical-right';
      case 'left-bottom':
      case 'bottom-left':
        return 'bottom-3 sm:bottom-6 left-2.5 sm:left-4 flex-col capsule-vertical capsule-vertical-left';
      case 'bottom-center':
      default:
        return 'bottom-3 sm:bottom-6 left-1/2 -translate-x-1/2 flex-row capsule-bottom capsule-horizontal';
    }
  };

  // Persist Eye Comfort Settings
  useEffect(() => {
    try {
      localStorage.setItem('study_eye_comfort_settings', JSON.stringify(eyeComfortSettings));
    } catch (e) {
      console.error('Failed to save eye comfort settings:', e);
    }
  }, [eyeComfortSettings]);

  // Global hotkeys (Alt+N to toggle Notes, Escape to close modals)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (listeningShortcutFor) {
        return;
      }

      // Global shortcut: Alt + N (or Alt + د on Persian layout) to toggle notebook modal
      if (e.altKey && (e.key.toLowerCase() === 'n' || e.key === 'د' || e.code === 'KeyN')) {
        e.preventDefault();
        setIsNotesModalOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape') {
        if (isNotesModalOpen) {
          setIsNotesModalOpen(false);
          return;
        }
        if (isEyeComfortOpen) {
          setIsEyeComfortOpen(false);
          return;
        }
        if (isFocusMode) {
          setIsFocusMode(false);
          try {
            if (document.fullscreenElement) {
              document.exitFullscreen?.().catch(() => {});
            }
          } catch {}
          return;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEyeComfortOpen, isFocusMode, isNotesModalOpen, listeningShortcutFor]);

  // Sticky Notes State
  const [stickyNotes, setStickyNotes] = useState<StickyNoteItem[]>([]);
  const [activeStickyNote, setActiveStickyNote] = useState<StickyNoteItem | null>(null);
  const [isStickyDrawerOpen, setIsStickyDrawerOpen] = useState<boolean>(false);

  const currentFileAttachedNotes = useMemo(() => {
    if (!currentFile || !notes) return [];
    const fileNameClean = (currentFile.name || '').trim().toLowerCase();
    return notes.filter(
      (n) =>
        (n.attachedFileId && n.attachedFileId === currentFile.id) ||
        (n.attachedFileName && n.attachedFileName.trim().toLowerCase() === fileNameClean)
    );
  }, [currentFile, notes]);

  const currentPageStickyNotes = useMemo(() => {
    return stickyNotes.filter((n) => n.pageNumber === visiblePage);
  }, [stickyNotes, visiblePage]);

  const otherPagesStickyNotes = useMemo(() => {
    return stickyNotes.filter((n) => n.pageNumber !== visiblePage);
  }, [stickyNotes, visiblePage]);


  const [pageStrokes, setPageStrokes] = useState<Record<number, DrawingStroke[]>>({});

  // Refs to guarantee immediate, race-condition-free access during saves and unmounts
  const pageStrokesRef = useRef<Record<number, DrawingStroke[]>>({});
  const stickyNotesRef = useRef<StickyNoteItem[]>([]);
  const visiblePageRef = useRef<number>(1);
  const scaleRef = useRef<number>(1.2);
  const loadedFileIdRef = useRef<string | null>(null);
  const isEditsLoadedRef = useRef<boolean>(false);
  const saveTimeoutRef = useRef<any>(null);
  const hasSessionEditsRef = useRef<boolean>(false);
  const loadedDocFileIdRef = useRef<string | null>(null);
  const loadedDocBufferRef = useRef<ArrayBuffer | null>(null);
  const activeOpenSessionIdRef = useRef<string>('');
  const sessionBaselinePageRef = useRef<number>(1);
  const [sessionBaselinePage, setSessionBaselinePage] = useState<number>(1);
  const sessionAccumulatedMsRef = useRef<number>(0);
  const sessionSegmentStartRef = useRef<number | null>(null);
  const isExitModalOpenRef = useRef<boolean>(false);
  const [exitSessionStudySeconds, setExitSessionStudySeconds] = useState<number>(0);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  useEffect(() => {
    isExitModalOpenRef.current = isExitModalOpen;
    if (!isExitModalOpen && currentFile?.id && typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (sessionSegmentStartRef.current === null) {
        sessionSegmentStartRef.current = Date.now();
      }
    }
  }, [isExitModalOpen, currentFile?.id]);

  // Track active reading duration for the currently open file without triggering per-second re-renders
  useEffect(() => {
    sessionAccumulatedMsRef.current = 0;
    if (!currentFile?.id) {
      sessionSegmentStartRef.current = null;
      setExitSessionStudySeconds(0);
      return;
    }

    sessionSegmentStartRef.current =
      typeof document !== 'undefined' && document.visibilityState === 'visible' ? Date.now() : null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (sessionSegmentStartRef.current !== null) {
          sessionAccumulatedMsRef.current += Math.max(0, Date.now() - sessionSegmentStartRef.current);
          sessionSegmentStartRef.current = null;
        }
      } else if (!isExitModalOpenRef.current && sessionSegmentStartRef.current === null) {
        sessionSegmentStartRef.current = Date.now();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      sessionSegmentStartRef.current = null;
    };
  }, [currentFile?.id]);

  // Sync refs with state
  useEffect(() => {
    visiblePageRef.current = visiblePage;
  }, [visiblePage]);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  // Load sticky notes and strokes when currentFile changes
  useEffect(() => {
    hasSessionEditsRef.current = false;
    if (!currentFile?.id) {
      loadedFileIdRef.current = null;
      isEditsLoadedRef.current = false;
      pageStrokesRef.current = {};
      stickyNotesRef.current = [];
      setStickyNotes([]);
      setPageStrokes({});
      return;
    }

    const fileId = currentFile.id;
    let isCancelled = false;

    // Reset loaded flag so auto-save never writes empty state during load!
    isEditsLoadedRef.current = false;
    loadedFileIdRef.current = null;

    const loadData = async () => {
      try {
        const edits = await getFileEditsFromStorage(fileId);
        if (isCancelled) return;

        let loadedNotes = edits?.stickyNotes && edits.stickyNotes.length > 0 ? edits.stickyNotes : (currentFile.stickyNotes || []);
        let loadedStrokes = edits?.pageStrokes && Object.keys(edits.pageStrokes).length > 0 ? edits.pageStrokes : (currentFile.pageStrokes || {});

        if ((!loadedNotes.length || Object.keys(loadedStrokes).length === 0) && (currentFile.originalData || currentFile.data)) {
          try {
            const embedded = await extractWorkspaceDataFromPdf(currentFile.originalData || currentFile.data);
            if (embedded) {
              if (!loadedNotes.length && embedded.stickyNotes?.length) {
                loadedNotes = embedded.stickyNotes;
              }
              if (Object.keys(loadedStrokes).length === 0 && embedded.pageStrokes && Object.keys(embedded.pageStrokes).length > 0) {
                loadedStrokes = embedded.pageStrokes;
              }
            }
          } catch {}
        }

        const savedPage = edits?.currentPage || currentFile.currentPage || 1;
        const savedScale = edits?.scale;
        sessionBaselinePageRef.current = savedPage;
        setSessionBaselinePage(savedPage);

        seedFileBaselineIfNeeded({
          fileId,
          fileName: currentFile.name,
          savedPage,
          pageCount: edits?.pageCount || currentFile.pageCount,
          lastModified: edits?.updatedAt || currentFile.lastModified,
          uploadDate: currentFile.uploadDate,
        });
        activeOpenSessionIdRef.current = `${fileId}-${Date.now()}`;

        pageStrokesRef.current = loadedStrokes;
        stickyNotesRef.current = loadedNotes;
        visiblePageRef.current = savedPage;

        setStickyNotes(loadedNotes);
        setPageStrokes(loadedStrokes);

        if (savedScale && savedScale >= 0.35 && savedScale <= 3.5) {
          setScale(savedScale);
          scaleRef.current = savedScale;
          setIsFitMode(false);
          isFitModeRef.current = false;
        }

        loadedFileIdRef.current = fileId;
        isEditsLoadedRef.current = true;
        setSaveStatus('saved');
      } catch (err) {
        console.error('Error loading edits:', err);
        if (!isCancelled) {
          loadedFileIdRef.current = fileId;
          isEditsLoadedRef.current = true;
        }
      }
    };

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [currentFile?.id]);

  // Debounced & immediate save trigger to IndexedDB and localStorage
  const triggerSave = useCallback((immediate: boolean = false) => {
    if (!currentFile?.id || !isEditsLoadedRef.current || loadedFileIdRef.current !== currentFile.id) {
      return;
    }

    const fileId = currentFile.id;
    const currentStrokes = pageStrokesRef.current;
    const currentNotes = stickyNotesRef.current;
    const currentPage = visiblePageRef.current;
    const currentScale = scaleRef.current;

    const doSave = async () => {
      setSaveStatus('saving');
      try {
        const resolvedPageCount = totalPagesRef.current || totalPages || currentFile.pageCount || undefined;
        await saveFileEditsToStorage(fileId, {
          fileId,
          pageStrokes: currentStrokes,
          stickyNotes: currentNotes,
          currentPage,
          pageCount: resolvedPageCount,
          scale: currentScale,
          updatedAt: new Date().toISOString(),
        });
        recordFilePageProgress({
          fileId,
          fileName: currentFile.name,
          currentPage,
          pageCount: resolvedPageCount,
          openSessionId: activeOpenSessionIdRef.current || undefined,
          baselinePage: sessionBaselinePageRef.current,
        });
        hasSessionEditsRef.current = false;
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save edits:', err);
        setSaveStatus('saved');
      }
    };

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    if (immediate) {
      doSave();
    } else {
      setSaveStatus('saving');
      saveTimeoutRef.current = setTimeout(doSave, 350);
    }
  }, [currentFile?.id]);

  const annotatedPagesCount = useMemo(() => {
    return Object.keys(pageStrokes).filter((p) => (pageStrokes[Number(p)] || []).length > 0).length;
  }, [pageStrokes]);

  // Manual save trigger (via button, Ctrl+S, or Exit modal)
  // Saves all vector annotations, sticky notes, current page, and scale interactively into persistent storage WITHOUT destructive rasterization!
  const handleManualSave = useCallback(async () => {
    if (!currentFile?.id || !isEditsLoadedRef.current || loadedFileIdRef.current !== currentFile.id) {
      return;
    }
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setSaveStatus('saving');
    try {
      const fileId = currentFile.id;
      const currentStrokes = pageStrokesRef.current;
      const currentNotes = stickyNotesRef.current;
      const currentPage = visiblePageRef.current;
      const currentScale = scaleRef.current;
      const totalP = totalPagesRef.current || totalPages || undefined;

      // 1. Save all interactive edits to IndexedDB and localStorage
      await saveFileEditsToStorage(fileId, {
        fileId,
        pageStrokes: currentStrokes,
        stickyNotes: currentNotes,
        currentPage,
        pageCount: totalP,
        scale: currentScale,
        updatedAt: new Date().toISOString(),
      });
      recordFilePageProgress({
        fileId,
        fileName: currentFile.name,
        currentPage,
        pageCount: totalP || currentFile.pageCount,
        openSessionId: activeOpenSessionIdRef.current || undefined,
        baselinePage: sessionBaselinePageRef.current,
      });

      // 2. Ensure base clean data is preserved (never flatten into bitmap pixels)
      const baseData = currentFile.originalData || currentFile.data;
      const updatedFileRecord: StudyFile = {
        ...currentFile,
        data: baseData,
        originalData: baseData,
        pageStrokes: currentStrokes,
        stickyNotes: currentNotes,
        currentPage,
        pageCount: totalP,
        scale: currentScale,
        lastModified: new Date().toISOString(),
      };

      await saveStudyFileToStorage(updatedFileRecord);

      // 3. Update currentFile in state
      onFileSelect(updatedFileRecord);

      hasSessionEditsRef.current = false;
      setSaveStatus('saved');

      triggerToast(
        `تغییرات فایل ${currentFile.name} ذخیره شد ✓ (تمام یادداشت‌ها و هایلایت‌ها به صورت تعاملی و قابل ویرایش هستند)`,
        3500
      );
      await loadSavedFiles();
    } catch (err) {
      console.error('Failed to save edits interactively:', err);
      setSaveStatus('saved');
      alert('خطا در ذخیره تغییرات روی فایل.');
    }
  }, [currentFile, loadSavedFiles, onFileSelect, totalPages, triggerToast]);


  // Ctrl+S / Cmd+S listener for quick manual save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleManualSave]);

  // Request Exit: Always open the Exit Modal providing the blue Save & Exit option
  const handleRequestExit = useCallback(() => {
    let totalMs = sessionAccumulatedMsRef.current;
    if (sessionSegmentStartRef.current !== null) {
      totalMs += Math.max(0, Date.now() - sessionSegmentStartRef.current);
      sessionAccumulatedMsRef.current = totalMs;
      sessionSegmentStartRef.current = null;
    }
    setExitSessionStudySeconds(Math.floor(totalMs / 1000));
    setIsExitModalOpen(true);
  }, []);

  // Confirm Save & Exit: guarantees baking and saving directly to file before closing
  const handleConfirmSaveAndExit = useCallback(async () => {
    await handleManualSave();
    document.body.classList.remove('hand-tool-active', 'hand-tool-panning');
    setIsExitModalOpen(false);
    setActiveTool('select');
    setIsPanning(false);
    await loadSavedFiles();
    onFileSelect(null);
  }, [handleManualSave, loadSavedFiles, onFileSelect]);

  // Confirm Discard & Exit: exits without saving latest unsaved edits and restores baseline reading page
  const handleConfirmDiscardAndExit = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (currentFile?.id && isEditsLoadedRef.current && loadedFileIdRef.current === currentFile.id) {
      const baselinePage = sessionBaselinePageRef.current || 1;
      const resolvedPageCount = totalPagesRef.current || totalPages || currentFile.pageCount || undefined;
      try {
        const existingEdits = await getFileEditsFromStorage(currentFile.id);
        await saveFileEditsToStorage(currentFile.id, {
          fileId: currentFile.id,
          pageStrokes: existingEdits?.pageStrokes || currentFile.pageStrokes || {},
          stickyNotes: existingEdits?.stickyNotes || currentFile.stickyNotes || [],
          currentPage: baselinePage,
          pageCount: resolvedPageCount,
          scale: existingEdits?.scale ?? scaleRef.current,
          updatedAt: existingEdits?.updatedAt || currentFile.lastModified || new Date().toISOString(),
        });
      } catch {}
      recordFilePageProgress({
        fileId: currentFile.id,
        fileName: currentFile.name,
        currentPage: baselinePage,
        pageCount: resolvedPageCount,
        openSessionId: activeOpenSessionIdRef.current || undefined,
        baselinePage,
      });
    }
    document.body.classList.remove('hand-tool-active', 'hand-tool-panning');
    setIsExitModalOpen(false);
    setActiveTool('select');
    setIsPanning(false);
    await loadSavedFiles();
    onFileSelect(null);
  }, [currentFile, loadSavedFiles, onFileSelect, totalPages]);

  // Download with latest edits baked into PDF (all strokes, highlighters, sticky notes burned in so Adobe Acrobat and external viewers show them)
  const handleDownloadWithEdits = useCallback(async () => {
    if (!currentFile) return;
    const rawBuffer = currentFile.originalData || currentFile.data;
    if (!rawBuffer) {
      alert('اطلاعات فایل برای ایجاد خروجی دانلود در دسترس نیست.');
      return;
    }

    setIsExportingPdf(true);
    try {
      // 1. Ensure latest session edits are saved to persistent storage
      await handleManualSave();

      // 2. Clone raw array buffer for PDFDocument
      const bufferCopy = rawBuffer.slice(0);
      const currentStrokes = pageStrokesRef.current || pageStrokes;
      const currentNotes = stickyNotesRef.current || stickyNotes;

      // 3. Bake highlighters, pens, ruler lines, and sticky notes directly into PDF pages
      await exportAnnotatedPdf({
        pdfData: bufferCopy,
        fileName: currentFile.name,
        pageStrokes: currentStrokes,
        stickyNotes: currentNotes,
        fileId: currentFile.id,
      });

      triggerToast(
        `فایل «${currentFile.name}» با تمام آخرین ادیت‌ها دانلود شد (قابل نمایش در کلیه برنامه‌ها مثل Adobe Acrobat) ✓`,
        4500
      );
    } catch (err) {
      console.error('Failed to export annotated PDF:', err);
      alert('خطا در اعمال ادیت‌ها و ایجاد خروجی PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [currentFile, handleManualSave, pageStrokes, stickyNotes, triggerToast]);

  // Download with latest edits and cleanly exit file
  const handleConfirmDownloadAndExit = useCallback(async () => {
    try {
      await handleDownloadWithEdits();
      document.body.classList.remove('hand-tool-active', 'hand-tool-panning');
      setIsExitModalOpen(false);
      setActiveTool('select');
      setIsPanning(false);
      await loadSavedFiles();
      onFileSelect(null);
    } catch (err) {
      console.error('Failed to download and exit:', err);
    }
  }, [handleDownloadWithEdits, loadSavedFiles, onFileSelect]);

  // Direct Exit File fallback
  const handleExitFile = handleRequestExit;

  // Safety net on page refresh / unload / visibility loss (power outage / sudden tab close)
  useEffect(() => {
    const flushSyncAndAsync = () => {
      if (currentFile?.id && isEditsLoadedRef.current && loadedFileIdRef.current === currentFile.id) {
        const payload = {
          fileId: currentFile.id,
          pageStrokes: pageStrokesRef.current,
          stickyNotes: stickyNotesRef.current,
          currentPage: visiblePageRef.current,
          pageCount: totalPagesRef.current || totalPages || undefined,
          scale: scaleRef.current,
          updatedAt: new Date().toISOString(),
        };
        try {
          localStorage.setItem(`study_edits_${currentFile.id}`, JSON.stringify(payload));
          localStorage.setItem(`study_notes_${currentFile.id}`, JSON.stringify(stickyNotesRef.current));
          localStorage.setItem(`study_strokes_${currentFile.id}`, JSON.stringify(pageStrokesRef.current));
        } catch {}
        recordFilePageProgress({
          fileId: currentFile.id,
          fileName: currentFile.name,
          currentPage: visiblePageRef.current,
          pageCount: totalPagesRef.current || totalPages || currentFile.pageCount,
          openSessionId: activeOpenSessionIdRef.current || undefined,
          baselinePage: sessionBaselinePageRef.current,
        });
        saveFileEditsToStorage(currentFile.id, payload).catch(() => {});
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushSyncAndAsync();
      }
    };

    window.addEventListener('beforeunload', flushSyncAndAsync);
    window.addEventListener('pagehide', flushSyncAndAsync);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', flushSyncAndAsync);
      window.removeEventListener('pagehide', flushSyncAndAsync);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushSyncAndAsync();
    };
  }, [currentFile?.id, totalPages]);

  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panLastPointRef = useRef<{ x: number; y: number } | null>(null);

  const handleAddStroke = useCallback((pageNum: number, stroke: DrawingStroke) => {
    hasSessionEditsRef.current = true;
    setPageStrokes((prev) => {
      const updated = {
        ...prev,
        [pageNum]: [...(prev[pageNum] || []), stroke],
      };
      pageStrokesRef.current = updated;
      return updated;
    });
    triggerSave(false);
  }, [triggerSave]);

  const handleUpdateStroke = useCallback((pageNum: number, strokeId: string, updatedStroke: DrawingStroke) => {
    hasSessionEditsRef.current = true;
    setPageStrokes((prev) => {
      const updated = {
        ...prev,
        [pageNum]: (prev[pageNum] || []).map((s) => (s.id === strokeId ? updatedStroke : s)),
      };
      pageStrokesRef.current = updated;
      return updated;
    });
    triggerSave(false);
  }, [triggerSave]);

  const handleDeleteStroke = useCallback((pageNum: number, strokeId: string) => {
    hasSessionEditsRef.current = true;
    setPageStrokes((prev) => {
      const updated = {
        ...prev,
        [pageNum]: (prev[pageNum] || []).filter((s) => s.id !== strokeId),
      };
      pageStrokesRef.current = updated;
      return updated;
    });
    setSelectedItem((prev) => (prev?.type === 'stroke' && prev.id === strokeId ? null : prev));
    triggerSave(false);
  }, [triggerSave]);

  const handleDeleteStrokes = useCallback((pageNum: number, strokeIds: string[]) => {
    if (!strokeIds || strokeIds.length === 0) return;
    hasSessionEditsRef.current = true;
    const idsSet = new Set(strokeIds);
    setPageStrokes((prev) => {
      const pageList = prev[pageNum];
      if (!pageList) return prev;
      const updatedList = pageList.filter((s) => !idsSet.has(s.id));
      if (updatedList.length === pageList.length) return prev;
      const updated = {
        ...prev,
        [pageNum]: updatedList,
      };
      pageStrokesRef.current = updated;
      return updated;
    });
    setSelectedItem((prev) => (prev?.type === 'stroke' && idsSet.has(prev.id) ? null : prev));
    triggerSave(false);
  }, [triggerSave]);

  const handleClearPageAnnotations = useCallback((pageNum: number) => {
    hasSessionEditsRef.current = true;
    setPageStrokes((prev) => {
      const updated = {
        ...prev,
        [pageNum]: [],
      };
      pageStrokesRef.current = updated;
      return updated;
    });
    setStickyNotes((prev) => {
      const updated = prev.filter((n) => n.pageNumber !== pageNum);
      stickyNotesRef.current = updated;
      return updated;
    });
    setSelectedItem(null);
    triggerSave(true);
  }, [triggerSave]);

  const handleMoveStickyNote = useCallback((noteId: string, pageNumber: number, newX: number, newY: number) => {
    hasSessionEditsRef.current = true;
    setStickyNotes((prev) => {
      const updated = prev.map((n) => (n.id === noteId ? { ...n, x: newX, y: newY, pageNumber } : n));
      stickyNotesRef.current = updated;
      return updated;
    });
    triggerSave(true);
  }, [triggerSave]);

  const handleAddStickyNote = useCallback(
    (
      pageNum: number,
      x: number,
      y: number,
      prefill?: { title?: string; content?: string }
    ) => {
      hasSessionEditsRef.current = true;
      const newNote: StickyNoteItem = {
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        pageNumber: pageNum,
        x,
        y,
        title: prefill?.title || 'یادداشت جدید',
        content: prefill?.content || '',
        color: '#fef08a',
        textColor: '#171717',
        isBold: false,
        createdAt: new Date().toISOString(),
      };
      setStickyNotes((prev) => {
        const updated = [...prev, newNote];
        stickyNotesRef.current = updated;
        return updated;
      });
      setActiveStickyNote(newNote);
      setIsStickyDrawerOpen(true);
      triggerSave(true);
    },
    [triggerSave]
  );

  const handleTextExtracted = useCallback(
    ({ text, pageNumber }: { text: string; pageNumber: number }) => {
      setExtractedTextData({ text, pageNumber, isFullPage: false });
      setCopiedExtractedText(false);
    },
    []
  );

  const handleExtractVisiblePageText = useCallback(async () => {
    if (!pdfDoc || isExtractingPageText) return;
    try {
      setIsExtractingPageText(true);
      const text = await extractTextFromPdfPage(pdfDoc, visiblePage);
      if (!text) {
        triggerToast('در این صفحه متن قابل استخراج یافت نشد (صفحه تصویری است)', 3500);
        return;
      }
      setExtractedTextData({ text, pageNumber: visiblePage, isFullPage: true });
      setIsExtractedTextExpanded(true);
      setCopiedExtractedText(false);
      setIsSelectSettingsOpen(false);
    } catch (err) {
      console.error('Failed to extract page text:', err);
    } finally {
      setIsExtractingPageText(false);
    }
  }, [pdfDoc, visiblePage, isExtractingPageText, triggerToast]);

  const handleCopyExtractedText = useCallback(async () => {
    if (!extractedTextData?.text) return;
    try {
      await navigator.clipboard.writeText(extractedTextData.text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = extractedTextData.text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch {}
      ta.remove();
    }
    setCopiedExtractedText(true);
    if (copiedTimeoutRef.current) {
      clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = setTimeout(() => {
      copiedTimeoutRef.current = null;
      setCopiedExtractedText(false);
    }, 2000);
  }, [extractedTextData]);

  const handleSaveExtractedAsStickyNote = useCallback(() => {
    if (!extractedTextData?.text) return;
    handleAddStickyNote(extractedTextData.pageNumber, 300, 140, {
      title: `متن استخراج‌شده (صفحه ${extractedTextData.pageNumber})`,
      content: extractedTextData.text,
    });
    setExtractedTextData(null);
    setIsExtractedTextExpanded(false);
    window.getSelection()?.removeAllRanges();
  }, [extractedTextData, handleAddStickyNote]);

  const handleSaveExtractedToNotebook = useCallback(() => {
    if (!extractedTextData?.text || !onAddNote) return;
    const baseName = currentFile?.name ? currentFile.name.replace(/\.pdf$/i, '') : 'جزوه';
    onAddNote({
      title: `گزیده ${baseName} — صفحه ${extractedTextData.pageNumber}`,
      content: extractedTextData.text,
      attachedFileId: currentFile?.id,
      attachedFileName: currentFile?.name,
    });
    triggerToast('متن استخراج‌شده به دفترچه یادداشت اضافه شد ✓', 3000);
    setExtractedTextData(null);
    setIsExtractedTextExpanded(false);
    window.getSelection()?.removeAllRanges();
  }, [extractedTextData, onAddNote, currentFile, triggerToast]);

  const handleOpenStickyNote = useCallback((note: StickyNoteItem) => {
    setActiveStickyNote(note);
    setIsStickyDrawerOpen(true);
  }, []);

  const handleUpdateStickyNote = useCallback((updated: StickyNoteItem) => {
    hasSessionEditsRef.current = true;
    setActiveStickyNote(updated);
    setStickyNotes((prev) => {
      const updatedList = prev.map((n) => (n.id === updated.id ? updated : n));
      stickyNotesRef.current = updatedList;
      return updatedList;
    });
    triggerSave(false);
  }, [triggerSave]);

  const handleDeleteStickyNote = useCallback((id: string) => {
    hasSessionEditsRef.current = true;
    setStickyNotes((prev) => {
      const updated = prev.filter((n) => n.id !== id);
      stickyNotesRef.current = updated;
      return updated;
    });
    setIsStickyDrawerOpen(false);
    setActiveStickyNote(null);
    setSelectedItem((prev) => (prev?.type === 'note' && prev.id === id ? null : prev));
    triggerSave(true);
  }, [triggerSave]);

  // Pre-group sticky notes by page number for optimal memoization
  const stickyNotesByPage = useMemo(() => {
    const map: Record<number, StickyNoteItem[]> = {};
    stickyNotes.forEach((n) => {
      if (!map[n.pageNumber]) map[n.pageNumber] = [];
      map[n.pageNumber].push(n);
    });
    return map;
  }, [stickyNotes]);

  // Clear selection when active tool changes away from select
  useEffect(() => {
    if (activeTool !== 'select') {
      setSelectedItem(null);
    }
  }, [activeTool]);

  // Capture keyboard (Shift+Arrow / Ctrl+A) and touch-handle selections inside PDF TextLayers via a single debounced listener
  useEffect(() => {
    if (!currentFile || activeTool !== 'select' || selectMode !== 'text' || isExtractedTextExpanded) {
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handleSelectionChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

        const range = selection.getRangeAt(0);
        const startNode = range.commonAncestorContainer;
        const anchorEl =
          startNode.nodeType === Node.ELEMENT_NODE
            ? (startNode as Element)
            : startNode.parentElement;

        const textLayerEl =
          anchorEl?.closest('[data-pdf-text-layer="true"]') ||
          anchorEl?.querySelector?.('[data-pdf-text-layer="true"]');
        if (!textLayerEl) return;

        const cleaned = normalizeExtractedPdfText(selection.toString());
        if (!cleaned) return;

        const pageEl = textLayerEl.closest('[id^="pdf-page-"]');
        const parsedPage = pageEl?.id ? Number.parseInt(pageEl.id.replace('pdf-page-', ''), 10) : NaN;
        const pageNumber = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : visiblePage;

        setExtractedTextData((prev) => {
          if (prev && prev.text === cleaned && prev.pageNumber === pageNumber && !prev.isFullPage) {
            return prev;
          }
          return { text: cleaned, pageNumber, isFullPage: false };
        });
        setCopiedExtractedText(false);
      }, 120);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [currentFile, activeTool, selectMode, isExtractedTextExpanded, visiblePage]);

  /**
   * Universal precision anchor zoom:
   * Keeps whatever was under the focal point (cursor or viewport center) at the exact same screen pixel coordinates.
   * Completely eliminates displacement and jumping during zoom in and zoom out.
   */
  const applyZoom = useCallback(
    (
      calculateNewScale: (currentScale: number) => number,
      focalClientPos?: { clientX: number; clientY: number }
    ) => {
      const container = scrollContainerRef.current;
      const contentStack = contentStackRef.current;
      if (!container) return;

      const oldScale = scaleRef.current;
      const targetNewScale = calculateNewScale(oldScale);
      const clampedScale = Math.max(0.35, Math.min(3.5, Number(targetNewScale.toFixed(2))));

      if (Math.abs(clampedScale - oldScale) < 0.005) return;

      const containerRect = container.getBoundingClientRect();
      const contentRect = contentStack ? contentStack.getBoundingClientRect() : containerRect;

      // 1. Determine focal point in viewport coordinates:
      // If mouse cursor or pinch point is provided, anchor to it.
      // Otherwise, anchor directly to the optical center of the visible container viewport!
      const focalX = focalClientPos ? focalClientPos.clientX : (containerRect.left + container.clientWidth / 2);
      const focalY = focalClientPos ? focalClientPos.clientY : (containerRect.top + container.clientHeight / 2);

      // 2. Relative position on the document content stack
      const relX = focalX - contentRect.left;
      const relY = focalY - contentRect.top;

      const scaleRatio = clampedScale / oldScale;

      // 3. Exact target scroll values to keep the focal point stationary on screen
      const targetScrollTop = Math.max(0, container.scrollTop + relY * (scaleRatio - 1));
      const targetScrollLeft = Math.max(0, container.scrollLeft + relX * (scaleRatio - 1));

      // Pin scroll offsets in ref for useLayoutEffect right before browser paint
      pendingScrollRef.current = {
        scrollTop: targetScrollTop,
        scrollLeft: targetScrollLeft,
      };

      // Any manual zoom is an intentional user choice and must disengage auto-fit mode
      setIsFitMode(false);
      isFitModeRef.current = false;

      scaleRef.current = clampedScale;
      setScale(clampedScale);
      triggerSave(false);

      // Re-verify in next animation frame to guarantee zero displacement across all browsers
      requestAnimationFrame(() => {
        if (container) {
          container.scrollTop = targetScrollTop;
          container.scrollLeft = targetScrollLeft;
        }
      });
    },
    [triggerSave]
  );

  const handleZoomIn = useCallback(() => {
    applyZoom((prev) => Math.min(Number((prev + 0.18).toFixed(2)), 3.5));
  }, [applyZoom]);

  const handleZoomOut = useCallback(() => {
    applyZoom((prev) => Math.max(Number((prev - 0.18).toFixed(2)), 0.35));
  }, [applyZoom]);

  // Smooth universal wheel listener for Ctrl+Wheel & trackpad pinch zooming around cursor
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const zoomFactor = e.deltaY < 0 ? 1.14 : 0.88;
        applyZoom(
          (cur) => Number((cur * zoomFactor).toFixed(2)),
          { clientX: e.clientX, clientY: e.clientY }
        );
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [applyZoom]);

  const closeAllSettings = useCallback(() => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
  }, []);

  // Close any open tool settings popover when clicking/tapping anywhere outside
  const isAnyToolSettingsOpen =
    isHandSettingsOpen ||
    isSelectSettingsOpen ||
    isPenSettingsOpen ||
    isHighlighterSettingsOpen ||
    isRulerSettingsOpen ||
    isEraserSettingsOpen ||
    isStickyNoteSettingsOpen;

  useEffect(() => {
    if (!isAnyToolSettingsOpen) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        closeAllSettings();
      }
    };
    document.addEventListener('pointerdown', handleOutsideClick);
    return () => document.removeEventListener('pointerdown', handleOutsideClick);
  }, [isAnyToolSettingsOpen, closeAllSettings]);

  const handleResetShortcut = useCallback(
    (tool: keyof ToolShortcuts, e?: React.MouseEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      setShortcuts((prev) => ({
        ...prev,
        [tool]: DEFAULT_SHORTCUTS[tool],
      }));
      setListeningShortcutFor(null);
    },
    [setShortcuts]
  );

  const handleResetAllShortcuts = useCallback(() => {
    setShortcuts(DEFAULT_SHORTCUTS);
    if (onResetShortcuts) {
      onResetShortcuts();
    }
    setListeningShortcutFor(null);
  }, [setShortcuts, onResetShortcuts]);

  const renderShortcutSettingRow = (tool: keyof ToolShortcuts, extraMarginTop = false) => {
    const conflicts = duplicateShortcutInfo.byTool[tool] || [];
    const isDuplicate = conflicts.length > 0;
    const isListening = listeningShortcutFor === tool;

    return (
      <div className={`pt-2.5 ${extraMarginTop ? 'mt-3' : 'mt-1'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Keyboard className={`w-3.5 h-3.5 ${isDuplicate && !isListening ? 'text-red-500' : 'text-neutral-500'}`} />
            <span className="text-[11px] font-semibold text-neutral-600">شورتکات کیبورد:</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              dir="ltr"
              onClick={() => setListeningShortcutFor(isListening ? null : tool)}
              className={`px-2.5 py-0.5 min-w-[36px] text-center text-xs font-mono font-bold rounded-lg cursor-pointer ios-spring-btn ${
                isListening
                  ? 'bg-amber-500 text-white ring-2 ring-amber-300 animate-pulse'
                  : isDuplicate
                  ? 'bg-red-100 hover:bg-red-200/80 text-red-700 border border-red-400 ring-2 ring-red-200'
                  : 'bg-neutral-100 hover:bg-neutral-200 text-neutral-800'
              }`}
              title="کلیک کنید و یک کلید کیبورد را فشار دهید (انگلیسی یا فارسی)"
            >
              {isListening ? 'فشار دهید...' : formatShortcutLabel(shortcuts[tool])}
            </button>
            {shortcuts[tool] !== DEFAULT_SHORTCUTS[tool] && (
              <button
                type="button"
                onClick={(e) => handleResetShortcut(tool, e)}
                className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded cursor-pointer ios-spring-tool"
                title="بازنشانی شورتکات به پیش‌فرض"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {isDuplicate && !isListening && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] font-medium text-red-600">
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>
              تکراری با: {conflicts.map((t) => TOOL_SHORTCUT_LABELS[t]).join('، ')}
            </span>
          </div>
        )}
      </div>
    );
  };

  // Keyboard shortcut listener:
  // 1. Shortcut assignment when listening (supports English & Persian keyboard layouts)
  // 2. Zoom in (+) and Zoom out (-)
  // 3. Tool switching via configurable shortcuts (seamless in English & Persian layouts)
  // 4. Delete selected notes/strokes
  // 5. Escape to close popovers/deselect
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. If actively recording a shortcut for a tool in toolbar popover
      if (listeningShortcutFor) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          setListeningShortcutFor(null);
          return;
        }
        if (!isAssignableShortcutEvent(e)) {
          return;
        }
        const assignedKey = normalizeShortcutKey(e);
        if (!assignedKey) return;
        setShortcuts((prev) => ({
          ...prev,
          [listeningShortcutFor]: assignedKey,
        }));
        setListeningShortcutFor(null);
        return;
      }

      // Skip viewer shortcuts while Settings modal is open
      if (isEyeComfortOpen) {
        return;
      }

      // Check if user is typing in an input, textarea, or contentEditable element
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.getAttribute('contenteditable') === 'true')
      ) {
        return;
      }

      // 2. Zoom shortcuts (+ and -)
      // Supports +, = (unshifted on standard US keyboards), and NumpadAdd
      if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
        e.preventDefault();
        handleZoomIn();
        return;
      }

      // Supports -, _ (shifted), and NumpadSubtract
      if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        handleZoomOut();
        return;
      }

      // 3. Delete selected items (Delete / Backspace)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItem) {
          e.preventDefault();
          if (selectedItem.type === 'note') {
            handleDeleteStickyNote(selectedItem.id);
          } else if (selectedItem.type === 'stroke') {
            handleDeleteStroke(selectedItem.pageNumber, selectedItem.id);
          }
          return;
        }
      }

      // 4. Escape to cancel selection or close popovers
      if (e.key === 'Escape') {
        if (selectedItem) {
          setSelectedItem(null);
        }
        if (extractedTextData) {
          setExtractedTextData(null);
          setIsExtractedTextExpanded(false);
          window.getSelection()?.removeAllRanges();
        }
        closeAllSettings();
        return;
      }

      // 5. Tool switching shortcuts (ignore when holding Ctrl / Cmd / Alt)
      if (e.ctrlKey || e.metaKey || e.altKey) {
        return;
      }

      if (isShortcutMatch(e, shortcuts.hand)) {
        e.preventDefault();
        setActiveTool('hand');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.select)) {
        e.preventDefault();
        setActiveTool('select');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.pen)) {
        e.preventDefault();
        setActiveTool('pen');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.highlighter)) {
        e.preventDefault();
        setActiveTool('highlighter');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.ruler)) {
        e.preventDefault();
        setActiveTool('ruler');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.eraser)) {
        e.preventDefault();
        setActiveTool('eraser');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.stickyNote)) {
        e.preventDefault();
        setActiveTool('sticky-note');
        closeAllSettings();
      } else if (isShortcutMatch(e, shortcuts.quickNotes || DEFAULT_SHORTCUTS.quickNotes)) {
        e.preventDefault();
        setIsNotesModalOpen((prev) => !prev);
        closeAllSettings();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    listeningShortcutFor,
    isEyeComfortOpen,
    selectedItem,
    extractedTextData,
    handleDeleteStickyNote,
    handleDeleteStroke,
    shortcuts,
    setShortcuts,
    handleZoomIn,
    handleZoomOut,
    closeAllSettings,
  ]);

  const handleHandClick = () => {
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'hand') {
      setActiveTool('hand');
    } else {
      setIsHandSettingsOpen((prev) => !prev);
    }
  };

  const handleHandDoubleClick = () => {
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('hand');
    setIsHandSettingsOpen(true);
  };

  const handleSelectClick = () => {
    setIsHandSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'select') {
      setActiveTool('select');
    } else {
      setIsSelectSettingsOpen((prev) => !prev);
    }
  };

  const handleSelectDoubleClick = () => {
    setIsHandSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('select');
    setIsSelectSettingsOpen(true);
  };

  const handlePenClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'pen') {
      setActiveTool('pen');
    } else {
      setIsPenSettingsOpen((prev) => !prev);
    }
  };

  const handlePenDoubleClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('pen');
    setIsPenSettingsOpen(true);
  };

  const handleHighlighterClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'highlighter') {
      setActiveTool('highlighter');
    } else {
      setIsHighlighterSettingsOpen((prev) => !prev);
    }
  };

  const handleHighlighterDoubleClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('highlighter');
    setIsHighlighterSettingsOpen(true);
  };

  const handleRulerClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'ruler') {
      setActiveTool('ruler');
    } else {
      setIsRulerSettingsOpen((prev) => !prev);
    }
  };

  const handleRulerDoubleClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('ruler');
    setIsRulerSettingsOpen(true);
  };

  const handleEraserClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'eraser') {
      setActiveTool('eraser');
    } else {
      setIsEraserSettingsOpen((prev) => !prev);
    }
  };

  const handleEraserDoubleClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsStickyNoteSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('eraser');
    setIsEraserSettingsOpen(true);
  };

  const handleStickyNoteClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setListeningShortcutFor(null);
    if (activeTool !== 'sticky-note') {
      setActiveTool('sticky-note');
    } else {
      setIsStickyNoteSettingsOpen((prev) => !prev);
    }
  };

  const handleStickyNoteDoubleClick = () => {
    setIsHandSettingsOpen(false);
    setIsSelectSettingsOpen(false);
    setIsPenSettingsOpen(false);
    setIsHighlighterSettingsOpen(false);
    setIsRulerSettingsOpen(false);
    setIsEraserSettingsOpen(false);
    setListeningShortcutFor(null);
    setActiveTool('sticky-note');
    setIsStickyNoteSettingsOpen(true);
  };

  // Smooth universal pointer listener for Hand tool drag & pan
  useEffect(() => {
    if (!isPanning) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (!panLastPointRef.current || !scrollContainerRef.current) return;
      const dx = e.clientX - panLastPointRef.current.x;
      const dy = e.clientY - panLastPointRef.current.y;
      panLastPointRef.current = { x: e.clientX, y: e.clientY };

      // Instant delta-based scrolling: perfectly handles RTL/LTR across Chrome, Safari, Firefox, and touchscreens!
      scrollContainerRef.current.scrollBy({
        left: -dx,
        top: -dy,
        behavior: 'instant' as ScrollBehavior,
      });
    };

    const handleWindowPointerUp = () => {
      setIsPanning(false);
      panLastPointRef.current = null;
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [isPanning]);

  // Sync cursor classes on document body so no child element ever switches cursor back to arrow
  // Crucial: Only active when a file is open (Boolean(currentFile)), never in the file picker / empty gallery
  useEffect(() => {
    if (Boolean(currentFile) && activeTool === 'hand') {
      document.body.classList.add('hand-tool-active');
      if (isPanning) {
        document.body.classList.add('hand-tool-panning');
      } else {
        document.body.classList.remove('hand-tool-panning');
      }
    } else {
      document.body.classList.remove('hand-tool-active');
      document.body.classList.remove('hand-tool-panning');
    }
    return () => {
      document.body.classList.remove('hand-tool-active');
      document.body.classList.remove('hand-tool-panning');
    };
  }, [currentFile, activeTool, isPanning]);

  // Ensure that whenever currentFile is null (file closed / picker gallery), cursor and tool revert cleanly
  useEffect(() => {
    if (!currentFile) {
      document.body.classList.remove('hand-tool-active', 'hand-tool-panning');
      setIsPanning(false);
      setActiveTool('select');
    }
  }, [currentFile]);

  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool === 'hand' && scrollContainerRef.current) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      setIsPanning(true);
      panLastPointRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
      try {
        scrollContainerRef.current.setPointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPanning || !panLastPointRef.current || !scrollContainerRef.current) return;
    const container = scrollContainerRef.current;
    const rawDx = e.clientX - panLastPointRef.current.x;
    const dy = e.clientY - panLastPointRef.current.y;
    panLastPointRef.current = { x: e.clientX, y: e.clientY };

    // Strictly lock horizontal panning if isFitWidthLocked is true or if content fits without overflow
    // When in Fit Mode, horizontal displacement is 100% blocked (dx = 0)
    const allowHorizontal = !isFitWidthLocked && (container.scrollWidth > container.clientWidth + 12);
    const dx = allowHorizontal ? rawDx : 0;

    container.scrollBy({
      left: -dx,
      top: -dy,
      behavior: 'instant' as ScrollBehavior,
    });
  };

  const handleContainerScroll = () => {
    if (isFitWidthLocked && scrollContainerRef.current) {
      if (scrollContainerRef.current.scrollLeft !== 0) {
        scrollContainerRef.current.scrollLeft = 0;
      }
    }
  };

  const handleContainerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPanning) {
      setIsPanning(false);
      panLastPointRef.current = null;
      try {
        scrollContainerRef.current?.releasePointerCapture(e.pointerId);
      } catch {}
    }
  };


  // Compute Fit Width automatically on load, resize, and manual toggle
  const computeFitWidth = useCallback(async (doc: pdfjsLib.PDFDocumentProxy) => {
    try {
      const container = scrollContainerRef.current;
      if (!container) return;

      // 1. Get current visible page (or page 1) to determine true document page dimensions
      const targetPageNum = visiblePageRef.current && visiblePageRef.current >= 1 ? visiblePageRef.current : 1;
      const curPage = await doc.getPage(Math.min(targetPageNum, doc.numPages));
      const baseViewport = curPage.getViewport({ scale: 1 });

      // 2. Measure actual available width in the scroll container
      const compStyle = window.getComputedStyle(container);
      const padLeft = parseFloat(compStyle.paddingLeft) || 0;
      const padRight = parseFloat(compStyle.paddingRight) || 0;

      // In modern browsers, container.clientWidth is the inner width minus vertical scrollbar (if present)
      const containerClientWidth = container.clientWidth > 0 ? container.clientWidth : (window.innerWidth || 600);

      // Available width inside container padding with 2px buffer for page borders
      const availableWidth = Math.max(containerClientWidth - padLeft - padRight - 2, 160);

      // Calculate precision scale factor (up to 3 decimal places for pixel-perfect fit)
      const exactScale = availableWidth / baseViewport.width;
      const clampedScale = Math.max(0.25, Math.min(3.5, Number(exactScale.toFixed(3))));

      fitScaleRef.current = clampedScale;
      scaleRef.current = clampedScale;
      setScale(clampedScale);
      setIsFitMode(true);
      isFitModeRef.current = true;

      // Lock horizontal scroll position strictly to 0
      container.scrollLeft = 0;
    } catch {
      setScale(1.0);
    }
  }, []);

  // Automatically re-compute fit width on window resize ONLY when Fit Mode is explicitly enabled
  useEffect(() => {
    const container = scrollContainerRef.current;
    let resizeTimeout: any;
    let lastWidth = container?.clientWidth || 0;

    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (!container || !pdfDoc) return;
        const currentWidth = container.clientWidth;
        // Ignore minor/spurious dimension fluctuations (e.g. from OCR tool overlays or blur/focus)
        if (Math.abs(currentWidth - lastWidth) < 6) {
          return;
        }
        lastWidth = currentWidth;
        // ONLY re-fit if the user is explicitly in Fit Width mode
        if (isFitModeRef.current) {
          computeFitWidth(pdfDoc);
        }
      }, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    let observer: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => {
        handleResize();
      });
      observer.observe(container);
    }

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (observer) {
        observer.disconnect();
      }
    };
  }, [pdfDoc, computeFitWidth]);

  const scrollToPage = useCallback((pageNum: number) => {
    if (pageNum < 1) return;
    const element = document.getElementById(`pdf-page-${pageNum}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handlePageVisible = useCallback((pageNum: number) => {
    setVisiblePage(pageNum);
    visiblePageRef.current = pageNum;
    triggerSave(false);
  }, [triggerSave]);

  // Load PDF when currentFile changes
  useEffect(() => {
    if (!currentFile || !currentFile.data) {
      loadedDocFileIdRef.current = null;
      loadedDocBufferRef.current = null;
      setPdfDoc(null);
      setTotalPages(0);
      setVisiblePage(1);
      setInputPage('1');
      return;
    }

    const rawBuffer = currentFile.originalData || currentFile.data;
    // Prevent redundant PDF re-parsing if the same file is already active in pdfDoc
    if (currentFile.id === loadedDocFileIdRef.current && pdfDoc) {
      return;
    }

    let isCancelled = false;
    setIsLoading(true);
    setErrorMsg(null);

    const loadDoc = async () => {
      try {
        const rawAny = rawBuffer as any;
        const rawArrayBuffer: ArrayBuffer =
          rawBuffer instanceof ArrayBuffer
            ? rawBuffer
            : rawAny?.buffer instanceof ArrayBuffer
            ? rawAny.buffer
            : (rawBuffer as ArrayBuffer);
        const bufferCopy = rawArrayBuffer.slice(0);
        const uint8Data = new Uint8Array(bufferCopy);
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl || resolvePdfAssetUrl('pdf.worker.min.mjs');

        const loadingTask = pdfjsLib.getDocument({
          data: uint8Data,
          cMapUrl: resolvePdfAssetUrl('cmaps/'),
          cMapPacked: true,
          standardFontDataUrl: resolvePdfAssetUrl('standard_fonts/'),
          enableXfa: true,
          disableFontFace: false,
          useSystemFonts: true,
        });

        const doc = await loadingTask.promise;

        if (isCancelled) return;
        loadedDocFileIdRef.current = currentFile.id;
        loadedDocBufferRef.current = rawBuffer;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        totalPagesRef.current = doc.numPages;

        // Restore saved page position if available
        const savedPage = visiblePageRef.current;
        const targetPage = savedPage && savedPage >= 1 && savedPage <= doc.numPages ? savedPage : 1;
        setVisiblePage(targetPage);
        setInputPage(String(targetPage));

        // Safely persist ONLY pageCount without overwriting stickyNotes or pageStrokes during parallel load
        if (currentFile?.id) {
          updateFilePageCountInStorage(currentFile.id, doc.numPages).catch(() => {});
        }

        setIsLoading(false);

        // Automatically open fitted to width with accurate DOM metrics after render ONLY if no custom scale is set
        setTimeout(() => {
          if (!isCancelled && doc && isFitModeRef.current) {
            // Only auto-fit if scale has not been customized or loaded from previous session
            if (!scaleRef.current || scaleRef.current === 1.2) {
              computeFitWidth(doc);
            }
          }
        }, 50);

        // Smoothly scroll to the last viewed/edited page
        if (targetPage > 1) {
          setTimeout(() => {
            scrollToPage(targetPage);
          }, 350);
        }
      } catch (err: unknown) {
        if (isCancelled) return;
        console.error('Error rendering PDF:', err);
        const detail = err instanceof Error ? err.message : String(err);
        setErrorMsg(`خطا در بارگذاری فایل PDF (${detail || 'ممکن است فایل آسیب دیده یا رمزگذاری شده باشد'}).`);
        setIsLoading(false);
      }
    };

    loadDoc();

    return () => {
      isCancelled = true;
    };
  }, [currentFile, computeFitWidth, scrollToPage, pdfDoc]);

  // Keep input page in sync with scroll
  useEffect(() => {
    setInputPage(String(visiblePage));
  }, [visiblePage]);

  // Handle file addition / upload (non-destructively merging sticky notes & strokes if same name exists)
  const processAndSaveFile = async (
    file: File,
    fileHandle?: any,
    options?: { skipOpen?: boolean }
  ): Promise<StudyFile | null> => {
    const isJsonBackupFile =
      file.type === 'application/json' ||
      file.name.toLowerCase().endsWith('.json') ||
      file.name.toLowerCase().endsWith('.studybackup');

    if (isJsonBackupFile) {
      try {
        const inspection = await inspectBackupFile(file);
        if (!inspection.isValid) {
          alert(inspection.errorMessage || 'ساختار فایل پشتیبان JSON معتبر نیست.');
          return null;
        }
        await restoreFullWorkspaceBackup(file, {
          mode: 'merge',
          restoreSettings: false,
        });
        await loadSavedFiles();
        window.dispatchEvent(new CustomEvent('study_files_updated'));
        const freshFiles = await getAllStudyFiles();
        if (!options?.skipOpen && freshFiles.length > 0 && inspection.filesPreview.length > 0) {
          const firstTargetName = normalizeFileName(inspection.filesPreview[0].name);
          const matched = freshFiles.find(
            (f) =>
              normalizeFileName(f.name) === firstTargetName &&
              ((f.data && f.data.byteLength > 0) || (f.originalData && f.originalData.byteLength > 0))
          );
          if (matched) {
            onFileSelect(matched);
            return matched;
          }
        }
        triggerToast('فایل پشتیبان JSON با موفقیت بازیابی و ادغام شد ✓', 4000);
        return null;
      } catch (err) {
        console.error('Failed restoring JSON backup in OpenFileView:', err);
        alert('خطا در خواندن یا بازیابی فایل پشتیبان JSON.');
        return null;
      }
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert('لطفاً یک فایل با پسوند PDF یا فایل پشتیبان JSON انتخاب کنید.');
      return null;
    }

    try {
      const buffer = await file.arrayBuffer();
      const targetName = normalizeFileName(file.name);

      // Extract embedded workspace data (sticky notes, drawing strokes) if previously exported
      const extracted = await extractWorkspaceDataFromPdf(buffer);

      // Always query fresh files from IndexedDB so consecutive/batch imports see previous imports
      const freshFiles = await getAllStudyFiles();
      const existing = freshFiles.find(
        (f) => normalizeFileName(f.name) === targetName
      );

      let targetFile: StudyFile;
      if (existing) {
        const cleanBuffer =
          existing.originalData && existing.originalData.byteLength > 0
            ? existing.originalData
            : existing.data && existing.data.byteLength > 0
            ? existing.data
            : buffer;
        const existingEdits = await getFileEditsFromStorage(existing.id);

        const baseNotes = mergeStickyNotes(
          existing.stickyNotes || [],
          existingEdits?.stickyNotes || []
        );
        const mergedNotes = mergeStickyNotes(baseNotes, extracted?.stickyNotes || []);

        const baseStrokes = mergePageStrokes(
          existing.pageStrokes || {},
          existingEdits?.pageStrokes || {}
        );
        const mergedStrokes = mergePageStrokes(baseStrokes, extracted?.pageStrokes || {});

        targetFile = {
          ...existing,
          size: existing.size || file.size,
          data: cleanBuffer,
          originalData: cleanBuffer.slice(0),
          fileHandle: fileHandle || existing.fileHandle || getFileHandle(existing.id) || getFileHandle(targetName),
          lastModified: new Date().toISOString(),
          stickyNotes: mergedNotes,
          pageStrokes: mergedStrokes,
        };
      } else {
        targetFile = {
          id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: file.name,
          size: file.size,
          data: buffer,
          originalData: buffer.slice(0),
          fileHandle: fileHandle,
          uploadDate: new Date().toISOString(),
          lastModified: new Date().toISOString(),
          stickyNotes: extracted?.stickyNotes || [],
          pageStrokes: extracted?.pageStrokes || {},
        };
      }

      if (fileHandle) {
        registerFileHandle(targetFile.id, fileHandle);
        registerFileHandle(targetName, fileHandle);
      }

      await saveStudyFileToStorage(targetFile);

      // Persist all merged notes and strokes into file_edits store
      if (
        (targetFile.stickyNotes && targetFile.stickyNotes.length > 0) ||
        (targetFile.pageStrokes && Object.keys(targetFile.pageStrokes).length > 0)
      ) {
        await saveFileEditsToStorage(targetFile.id, {
          fileId: targetFile.id,
          pageStrokes: targetFile.pageStrokes || {},
          stickyNotes: targetFile.stickyNotes || [],
          currentPage: targetFile.currentPage || 1,
          pageCount: targetFile.pageCount,
          scale: targetFile.scale,
          updatedAt: new Date().toISOString(),
        });
      }

      await loadSavedFiles();
      window.dispatchEvent(
        new CustomEvent('study_files_updated', {
          detail: {
            fileId: targetFile.id,
            stickyNotes: targetFile.stickyNotes || [],
            pageStrokes: targetFile.pageStrokes || {},
          },
        })
      );

      if (!options?.skipOpen) {
        onFileSelect(targetFile);
      }
      return targetFile;
    } catch {
      alert('خطا در خواندن و ذخیره فایل.');
      return null;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    try {
      let lastPdf: StudyFile | null = null;
      for (let i = 0; i < fileList.length; i++) {
        const isLast = i === fileList.length - 1;
        const res = await processAndSaveFile(fileList[i], undefined, { skipOpen: !isLast });
        if (res) lastPdf = res;
      }
      if (lastPdf) {
        onFileSelect(lastPdf);
      }
    } finally {
      e.target.value = '';
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const fileList = Array.from(e.dataTransfer.files || []);
    if (fileList.length === 0) return;
    let lastPdf: StudyFile | null = null;
    for (let i = 0; i < fileList.length; i++) {
      const isLast = i === fileList.length - 1;
      const res = await processAndSaveFile(fileList[i], undefined, { skipOpen: !isLast });
      if (res) lastPdf = res;
    }
    if (lastPdf) {
      onFileSelect(lastPdf);
    }
  };

  const handleDeleteFile = async (id: string, fileName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`آیا از حذف «${fileName}» از لیست اطمینان دارید؟`)) {
      await deleteStudyFileFromStorage(id, fileName);
      await loadSavedFiles();
      if (currentFile?.id === id || currentFile?.name === fileName) {
        onFileSelect(null);
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} بایت`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} کیلوبایت`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} مگابایت`;
  };

  const cleanFileName = (name?: string): string => {
    if (!name) return 'فایل بدون نام';
    return name.replace(/\.pdf$/i, '').trim() || name;
  };

  const handlePageInputSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(inputPage, 10);
    if (!isNaN(num) && num >= 1 && num <= totalPages) {
      scrollToPage(num);
    } else {
      setInputPage(String(visiblePage));
    }
  };

  const handleFitWidth = useCallback(() => {
    if (pdfDoc) {
      setIsFitMode(true);
      isFitModeRef.current = true;
      computeFitWidth(pdfDoc);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
      }
    }
  }, [pdfDoc, computeFitWidth]);

  const handleToggleFocusMode = () => {
    setIsFocusMode((prev) => {
      const nextState = !prev;
      if (nextState) {
        // Automatically request browser fullscreen if available
        try {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen?.().catch(() => {});
          }
        } catch {}
        // Fit file to full screen width only if user is in fit mode
        setTimeout(() => {
          if (pdfDoc && isFitModeRef.current) {
            handleFitWidth();
          }
        }, 150);
      } else {
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
          }
        } catch {}
      }
      return nextState;
    });
  };

  // Listen to browser fullscreen changes (e.g. Esc key pressed)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && isFocusMode) {
        setIsFocusMode(false);
        setTimeout(() => {
          if (pdfDoc && isFitModeRef.current) {
            handleFitWidth();
          }
        }, 150);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isFocusMode, pdfDoc, handleFitWidth]);

  const handleResetZoom = useCallback(() => {
    if (isFitMode) {
      applyZoom(() => 1.2);
    } else {
      handleFitWidth();
    }
  }, [isFitMode, applyZoom, handleFitWidth]);

  // VIEW 1: FILE GALLERY / SELECTION (When no file is open)
  if (!currentFile) {
    const handleTrigger = async () => {
      const isInIframe = typeof window !== 'undefined' && window.self !== window.top;
      if (!isInIframe && typeof window !== 'undefined' && 'showOpenFilePicker' in window) {
        try {
          // @ts-ignore
          const handles = await window.showOpenFilePicker({
            types: [
              {
                description: 'فایل‌های PDF و پشتیبان JSON',
                accept: {
                  'application/pdf': ['.pdf'],
                  'application/json': ['.json'],
                },
              },
            ],
            multiple: true,
          });
          let lastPdf: StudyFile | null = null;
          for (let i = 0; i < handles.length; i++) {
            const handle = handles[i];
            const diskFile = await handle.getFile();
            const isLast = i === handles.length - 1;
            const res = await processAndSaveFile(diskFile, handle, { skipOpen: !isLast });
            if (res) lastPdf = res;
          }
          if (lastPdf) {
            onFileSelect(lastPdf);
          }
          return;
        } catch (err: any) {
          if (err.name === 'AbortError') return;
        }
      }
      if (onTriggerPicker) {
        onTriggerPicker();
      } else {
        fileInputRef.current?.click();
      }
    };

    return (
      <div className="h-full flex flex-col p-4 sm:p-6 overflow-y-auto bg-neutral-100/80 cursor-default select-auto">
        <div className="max-w-4xl w-full mx-auto space-y-6">
          {/* Header & Upload Action */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white rounded-3xl p-4 sm:p-5 shadow-[0_10px_26px_-4px_rgba(0,0,0,0.12),0_4px_10px_-2px_rgba(0,0,0,0.08)]">
            <div>
              <h2 className="text-xl font-bold text-neutral-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                <span>فایل‌های مطالعه</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-1">
                یک فایل را برای مطالعه انتخاب کنید یا از دکمه زیر فایل جدیدی باز نمایید.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple
                accept=".pdf,application/pdf,.json,application/json,.studybackup"
                className="hidden"
              />
              <button
                onClick={handleTrigger}
                className="px-4 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>باز کردن فایل جدید از دستگاه</span>
              </button>
            </div>
          </div>

          {/* List / Cards of Saved Files */}
          <div>
            {isLoadingFiles ? (
              <div className="p-8 text-center text-xs text-neutral-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال بارگذاری فایل‌ها...</span>
              </div>
            ) : uniqueSavedFiles.length === 0 ? (
              <div className="p-12 bg-white rounded-3xl text-center flex flex-col items-center justify-center shadow-[0_14px_34px_-4px_rgba(0,0,0,0.13),0_4px_12px_-2px_rgba(0,0,0,0.08)]">
                <div className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4 text-neutral-800">
                  <Upload className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-neutral-900 mb-2">هنوز فایلی باز نشده است</h3>
                <p className="text-xs text-neutral-500 mb-6 max-w-sm">
                  برای باز کردن و مطالعه جزوه یا کتاب خود، روی دکمه زیر کلیک کنید تا پنجره انتخاب فایل باز شود.
                </p>
                <button
                  onClick={handleTrigger}
                  className="px-6 py-2.5 bg-neutral-900 hover:bg-neutral-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-2 shadow-sm"
                >
                  <Upload className="w-4 h-4" />
                  <span>انتخاب و باز کردن فایل PDF</span>
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="text-sm font-bold text-neutral-800">
                    لیست فایل‌های آماده برای مطالعه ({uniqueSavedFiles.length})
                  </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {uniqueSavedFiles.map((file) => (
                    <div
                      key={file.id}
                      onClick={() => onFileSelect(file)}
                      className="p-4 rounded-3xl bg-white shadow-[0_10px_26px_-4px_rgba(0,0,0,0.12),0_4px_10px_-2px_rgba(0,0,0,0.08)] hover:shadow-[0_16px_36px_-4px_rgba(0,0,0,0.17),0_6px_14px_-2px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all cursor-pointer flex items-center justify-between group ios-spring-card"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-neutral-100 group-hover:bg-neutral-900 group-hover:text-white text-neutral-600 flex items-center justify-center shrink-0 transition-colors">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4
                            className="text-xs md:text-sm font-bold text-neutral-800 group-hover:text-black truncate leading-snug"
                            title={file.name}
                          >
                            {cleanFileName(file.name)}
                          </h4>
                          <div className="flex items-center gap-2 text-[11px] text-neutral-400 mt-1 font-mono">
                            <span>{formatFileSize(file.size)}</span>
                            {file.currentPage && file.currentPage > 1 && (
                              <>
                                <span>·</span>
                                <span>صفحه {file.currentPage}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 mr-2">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteFile(file.id, file.name, e)}
                          className="p-1.5 text-neutral-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer ios-spring-tool"
                          title="حذف فایل از لیست"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-semibold px-3 py-1.5 bg-neutral-900 group-hover:bg-neutral-800 text-white rounded-xl transition-colors shadow-2xs ios-spring-btn">
                          مطالعه
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VIEW 2: FULL-SCREEN PDF READER (When a file is open)
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div
      onContextMenu={handleContextMenu}
      className={`w-full h-full flex flex-col bg-neutral-200/90 overflow-hidden ${
        isFocusMode ? 'fixed inset-0 z-50 bg-neutral-900' : 'relative'
      }`}
    >
      {/* Full-Screen File Header Bar & Navigation Controls */}
      <header
        className={`bg-white/95 backdrop-blur-md shrink-0 z-30 select-none transition-all duration-300 shadow-[0_6px_22px_-4px_rgba(0,0,0,0.10),0_2px_8px_-2px_rgba(0,0,0,0.06)] ${
          isFocusMode
            ? 'h-0 py-0 opacity-0 pointer-events-none overflow-hidden shadow-none'
            : 'h-13 opacity-100'
        }`}
      >
        <div className="h-full px-2 sm:px-4 flex items-center justify-between gap-1.5 sm:gap-4 max-w-full overflow-x-auto no-scrollbar">
          {/* Right Section: Exit Button & File Info */}
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 shrink-0">
            {/* Exit Button (Red style) */}
            <button
              onClick={handleExitFile}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 active:bg-rose-800 active:scale-95 rounded-xl shadow-xs shadow-rose-600/20 transition-all cursor-pointer shrink-0 group"
              title="خروج از فایل"
            >
              <ArrowRight className="w-3.5 h-3.5 text-white transition-transform group-hover:translate-x-0.5" />
              <span>خروج</span>
            </button>

            {/* Divider */}
            <div className="h-5 w-[1px] bg-neutral-200/80 shrink-0" />

            {/* File Info */}
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3
                    className="text-xs sm:text-sm font-bold text-neutral-800 truncate max-w-[100px] sm:max-w-[200px] md:max-w-xs"
                    title={currentFile.name}
                  >
                    {currentFile.name}
                  </h3>
                  {saveStatus === 'saving' ? (
                    <span className="flex items-center gap-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded-full shrink-0 font-medium">
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      <span className="hidden md:inline">در حال ذخیره...</span>
                    </span>
                  ) : (
                    <span
                      className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                      title="تمام تغییرات ذخیره است"
                    />
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 font-mono tabular-nums truncate hidden sm:block">
                  {formatFileSize(currentFile.size)} {totalPages > 0 ? `· ${totalPages} صفحه` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Center Section: Page Navigation & Zoom Controls */}
          <div className="flex items-center bg-neutral-100/85 p-1 rounded-2xl gap-0.5 shrink-0">
            {/* Page Step Prev */}
            <button
              onClick={() => scrollToPage(visiblePage - 1)}
              disabled={visiblePage <= 1 || isLoading}
              className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="صفحه قبلی"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>

            {/* Jump to Page Form */}
            <form onSubmit={handlePageInputSubmit} className="flex items-center text-xs px-0.5">
              <input
                type="text"
                value={inputPage}
                onChange={(e) => setInputPage(e.target.value)}
                onBlur={handlePageInputSubmit}
                className="w-8 sm:w-9 text-center font-mono font-bold tabular-nums text-neutral-900 bg-white shadow-xs rounded-md py-0.5 px-0.5 focus:outline-none focus:ring-2 focus:ring-neutral-900/15 text-xs"
              />
              <span className="text-neutral-400 mx-1 font-mono tabular-nums text-[11px]">
                / {totalPages || 1}
              </span>
            </form>

            {/* Page Step Next */}
            <button
              onClick={() => scrollToPage(visiblePage + 1)}
              disabled={visiblePage >= totalPages || isLoading}
              className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
              title="صفحه بعدی"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* Zoom Controls (collapses cleanly on very small screens) */}
            <div className="hidden sm:flex items-center">
              <div className="h-4 w-[1px] bg-neutral-200 mx-0.5" />

              {/* Zoom Out */}
              <button
                onClick={handleZoomOut}
                className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="کوچک‌نمایی (-)"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>

              {/* Zoom % */}
              <button
                onClick={handleResetZoom}
                className="px-1.5 py-0.5 text-[11px] font-mono font-semibold text-neutral-700 hover:text-neutral-900 hover:bg-white rounded-md tabular-nums transition-colors cursor-pointer"
                title="اندازه پیش‌فرض (۱۲۰٪)"
              >
                {Math.round(scale * 100)}%
              </button>

              {/* Zoom In */}
              <button
                onClick={handleZoomIn}
                className="p-1 text-neutral-500 hover:text-neutral-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title="بزرگ‌نمایی (+)"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>

              {/* Fit width */}
              <button
                onClick={handleFitWidth}
                className={`px-1.5 sm:px-2 py-0.5 rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 transition-all ${
                  isFitMode
                    ? 'bg-neutral-900 text-white shadow-2xs'
                    : 'text-neutral-600 hover:text-neutral-900 hover:bg-white'
                }`}
                title="فیت به عرض صفحه"
              >
                <Maximize2 className="w-3 h-3" />
                <span className="hidden md:inline text-[11px]">فیت</span>
              </button>
            </div>
          </div>

          {/* Left Section: Pomodoro, Notes, Settings, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Mini Pomodoro Capsule - Collapsed to clock icon when inactive, smoothly expands into capsule when active */}
            {pomodoroState && (
              <button
                onClick={pomodoroState.onTogglePlay}
                className={`flex items-center text-xs font-mono font-semibold rounded-xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer overflow-hidden ${
                  pomodoroState.isRunning
                    ? 'px-2.5 py-1.5 bg-amber-100/85 text-amber-900 shadow-xs'
                    : 'p-2 bg-neutral-100/85 hover:bg-neutral-200/80 text-neutral-700 hover:text-amber-600'
                }`}
                title={
                  pomodoroState.isRunning
                    ? `پومودورو فعال (${pomodoroState.mode === 'focus' ? 'تمرکز' : 'استراحت'}) - کلیک برای توقف`
                    : 'شروع تایمر پومودورو (کلیک برای فعال‌سازی)'
                }
              >
                <Clock
                  className={`w-3.5 h-3.5 shrink-0 transition-colors ${
                    pomodoroState.isRunning ? 'text-amber-500' : 'text-neutral-600'
                  }`}
                />
                <div
                  className={`flex items-center gap-1.5 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] whitespace-nowrap ${
                    pomodoroState.isRunning
                      ? 'max-w-[90px] opacity-100 mr-1.5'
                      : 'max-w-0 opacity-0 mr-0 pointer-events-none'
                  }`}
                >
                  <span className="tabular-nums text-xs font-bold font-mono">
                    {String(Math.floor(pomodoroState.timeLeft / 60)).padStart(2, '0')}:
                    {String(pomodoroState.timeLeft % 60).padStart(2, '0')}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                </div>
              </button>
            )}


            {/* Notes Drawer Button */}
            <button
              onClick={() => setIsNotesModalOpen(true)}
              className={`relative p-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                isNotesModalOpen
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : 'bg-neutral-100/85 hover:bg-neutral-200/80 text-neutral-700'
              }`}
              title="دفترچه یادداشت"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {notes && notes.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-blue-600 text-white text-[10px] font-mono font-bold flex items-center justify-center leading-none shadow-xs">
                  {notes.length}
                </span>
              )}
            </button>

            {/* Settings / Eye Comfort Button */}
            <button
              onClick={() => setIsEyeComfortOpen(true)}
              className={`relative p-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                isEyeComfortOpen
                  ? 'bg-neutral-900 text-white shadow-xs'
                  : eyeComfortSettings.colorMode !== 'normal' || eyeComfortSettings.brightness !== 100
                  ? 'bg-amber-100/85 text-amber-900 font-bold'
                  : 'bg-neutral-100/85 hover:bg-neutral-200/80 text-neutral-700'
              }`}
              title="تنظیمات راحتی چشم و نور صفحه"
            >
              <Settings className="w-3.5 h-3.5" />
              {(eyeComfortSettings.colorMode !== 'normal' || eyeComfortSettings.brightness !== 100) && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
              )}
            </button>


            {/* Fullscreen Button (Black style) */}
            <button
              onClick={handleToggleFocusMode}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
              title="حالت تمام صفحه"
            >
              <Expand className="w-3.5 h-3.5 text-white" />
              <span className="hidden sm:inline">تمام صفحه</span>
            </button>
          </div>
        </div>
      </header>

      {/* 100% Full Width & Height Continuous Scroll PDF Canvas */}
      <div
        ref={scrollContainerRef}
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
        onScroll={handleContainerScroll}
        style={{
          touchAction: activeTool === 'hand' ? 'none' : (isFitWidthLocked ? 'pan-y' : 'auto'),
          userSelect: 'none',
          WebkitUserSelect: 'none',
          overscrollBehaviorX: 'none',
          scrollbarGutter: 'stable',
          cursor:
            activeTool === 'hand'
              ? isPanning
                ? `url('${CURSOR_HAND_CLOSED}') 10 10, url('/cursors/closedhand.svg') 10 10, grabbing`
                : `url('${CURSOR_HAND_OPEN}') 10 10, url('/cursors/openhand.svg') 10 10, grab`
              : 'default',
        }}
        className={`flex-1 overflow-y-auto ${
          isFitWidthLocked ? 'overflow-x-hidden' : 'overflow-x-auto'
        } p-2 sm:p-4 md:p-6 w-full select-none transition-colors duration-300 ${
          activeTool === 'hand'
            ? isPanning
              ? 'hand-tool-container is-panning'
              : 'hand-tool-container'
            : ''
        } ${
          eyeComfortSettings.colorMode === 'dark-gray'
            ? 'bg-[#151518]'
            : eyeComfortSettings.colorMode === 'yellow'
            ? 'bg-[#f4efe4]'
            : isFocusMode
            ? 'bg-neutral-900'
            : 'bg-neutral-200/90'
        }`}
      >
        {isLoading && (
          <div className="my-auto flex flex-col items-center justify-center text-neutral-600 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-neutral-900" />
            <span className="text-xs">در حال بارگذاری و فیت کردن صفحات جزوه...</span>
          </div>
        )}

        {errorMsg && (
          <div className="my-auto flex flex-col items-center justify-center text-rose-600 gap-2">
            <AlertCircle className="w-8 h-8" />
            <span className="text-xs">{errorMsg}</span>
          </div>
        )}

        {/* Continuous Page Stack with Proper Centering and Overflow Expansion */}
        {!isLoading && pdfDoc && (
          <div
            ref={contentStackRef}
            className={`min-w-full flex flex-col items-center py-2 ${isFitWidthLocked ? 'w-full' : 'w-max'}`}
            style={{
              filter: `brightness(${eyeComfortSettings.brightness}%)`,
              willChange: 'filter',
            }}
          >
            {pageNumbers.map((num) => (
              <PdfPage
                key={num}
                pdfDoc={pdfDoc}
                pageNumber={num}
                scale={scale}
                isFitMode={isFitWidthLocked}
                eyeComfortSettings={eyeComfortSettings}
                onVisible={handlePageVisible}
                activeTool={activeTool}
                selectMode={selectMode}
                onTextExtracted={handleTextExtracted}
                eraserMode={eraserMode}
                eraserSize={eraserSize}
                penColor={penColor}
                penWidth={penWidth}
                highlighterColor={highlighterColor}
                highlighterWidth={highlighterWidth}
                autoStraighten={autoStraighten}
                rulerColor={rulerColor}
                rulerWidth={rulerWidth}
                rulerLock90={rulerLock90}
                strokes={pageStrokes[num] || EMPTY_STROKES}
                onAddStroke={handleAddStroke}
                onUpdateStroke={handleUpdateStroke}
                onDeleteStroke={handleDeleteStroke}
                onDeleteStrokes={handleDeleteStrokes}
                onClearPageAnnotations={handleClearPageAnnotations}
                stickyNotes={stickyNotesByPage[num] || EMPTY_STICKY_NOTES}
                onAddStickyNote={handleAddStickyNote}
                onMoveStickyNote={handleMoveStickyNote}
                onDeleteStickyNote={handleDeleteStickyNote}
                onOpenStickyNote={handleOpenStickyNote}
                selectedItem={selectedItem && selectedItem.pageNumber === num ? selectedItem : null}
                onSelectItem={setSelectedItem}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Tools Capsule (کپسول ابزار با موقعیت شناور و قابل جابه‌جایی) */}
      <div
        ref={toolbarRef}
        className={`absolute z-40 bg-white shadow-[0_16px_42px_-6px_rgba(0,0,0,0.18),0_4px_14px_-2px_rgba(0,0,0,0.10)] flex items-center select-none animate-ios-jelly overflow-visible transition-[top,bottom,left,right,transform] duration-200 transform-gpu max-w-[calc(100vw-16px)] sm:max-w-fit ${
          isVerticalCapsule
            ? 'px-1.5 sm:px-2 py-2 sm:py-2.5 rounded-2xl sm:rounded-3xl gap-1 sm:gap-1.5'
            : 'px-2 sm:px-3 py-1 sm:py-1.5 rounded-full gap-1 sm:gap-1.5'
        } ${getCapsulePositionClasses(capsulePosition)}`}
      >
        {/* Hand Tool (ابزار دست - جابه‌جایی) with Double-Click Settings Popover */}
        <div className="relative shrink-0">
          <button
            onClick={handleHandClick}
            onDoubleClick={handleHandDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'hand'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار دست (نشانگر و جابه‌جایی صفحه) [${formatShortcutLabel(shortcuts.hand)}]`}
          >
            <FlatHandIcon className="w-4 h-4 shrink-0" />
            {!isVerticalCapsule && (
              <span className={activeTool === 'hand' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>دست</span>
            )}
          </button>

          {/* Hand Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isHandSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  <FlatHandIcon className="w-4 h-4 text-neutral-800" />
                  <span className="text-xs font-bold text-neutral-900">تنظیمات ابزار دست</span>
                </div>
                <button
                  onClick={() => setIsHandSettingsOpen(false)}
                  className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                  title="بستن تنظیمات"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Description */}
              <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed whitespace-normal">
                با ابزار دست می‌توانید آزادانه در صفحات فایل PDF اسکرول کنید و صفحه را به هر جهت جابه‌جا نمایید.
              </p>

              {/* Shortcut Setting */}
              {renderShortcutSettingRow('hand')}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />

        {/* Select Tool (ابزار سلکت - انتخاب ادیت‌ها یا استخراج متن جزوه) with Double-Click Settings Popover */}
        <div className="relative shrink-0">
          <button
            onClick={handleSelectClick}
            onDoubleClick={handleSelectDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'select'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار سلکت (${
              selectMode === 'text' ? 'انتخاب و استخراج متن جزوه' : 'انتخاب و جابه‌جایی ادیت‌ها'
            }) [${formatShortcutLabel(shortcuts.select)}] (دوبار کلیک برای تنظیمات)`}
          >
            {selectMode === 'text' ? (
              <TextSelect className="w-4 h-4 shrink-0" />
            ) : (
              <MousePointer2 className="w-4 h-4 shrink-0" />
            )}
            {!isVerticalCapsule && (
              <span className={activeTool === 'select' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>
                {selectMode === 'text' ? 'سلکت متن' : 'سلکت'}
              </span>
            )}
          </button>

          {/* Select Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isSelectSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
              {/* Popover Header */}
              <div className="flex items-center justify-between pb-2 mb-3">
                <div className="flex items-center gap-1.5">
                  {selectMode === 'text' ? (
                    <TextSelect className="w-4 h-4 text-neutral-800" />
                  ) : (
                    <MousePointer2 className="w-4 h-4 text-neutral-800" />
                  )}
                  <span className="text-xs font-bold text-neutral-900">تنظیمات ابزار سلکت</span>
                </div>
                <button
                  onClick={() => setIsSelectSettingsOpen(false)}
                  className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                  title="بستن تنظیمات"
                >
                  <X className="w-4 h-4 stroke-[2.5]" />
                </button>
              </div>

              {/* Select Mode Switcher */}
              <div className="mb-3 space-y-2.5">
                <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                  نوع عملکرد ابزار سلکت:
                </label>

                {/* Option 1: Object Selection */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode('object');
                    setActiveTool('select');
                  }}
                  className={`w-full flex items-start gap-2.5 p-2.5 rounded-2xl text-right transition-all cursor-pointer ${
                    selectMode === 'object'
                      ? 'bg-neutral-100/90 ring-2 ring-neutral-900 shadow-[0_6px_18px_-3px_rgba(0,0,0,0.12)]'
                      : 'bg-neutral-100/75 hover:bg-neutral-100'
                  }`}
                >
                  <div
                    className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                      selectMode === 'object' ? 'bg-neutral-900 text-white shadow-xs' : 'bg-white text-neutral-600 shadow-xs'
                    }`}
                  >
                    <MousePointer2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-900">
                        انتخاب و جابه‌جایی ادیت‌ها
                      </span>
                      {selectMode === 'object' && (
                        <span className="text-[10px] bg-neutral-900 text-white px-1.5 py-0.2 rounded-full font-bold">
                          فعال
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                      انتخاب، جابه‌جایی یا حذف خطوط مداد، هایلایت‌ها و یادداشت‌های روی صفحه.
                    </p>
                  </div>
                </button>

                {/* Option 2: PDF Text Selection & Extraction */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectMode('text');
                    setActiveTool('select');
                  }}
                  className={`w-full flex items-start gap-2.5 p-2.5 rounded-2xl text-right transition-all cursor-pointer ${
                    selectMode === 'text'
                      ? 'bg-neutral-100/90 ring-2 ring-neutral-900 shadow-[0_6px_18px_-3px_rgba(0,0,0,0.12)]'
                      : 'bg-neutral-100/75 hover:bg-neutral-100'
                  }`}
                >
                  <div
                    className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                      selectMode === 'text' ? 'bg-neutral-900 text-white shadow-xs' : 'bg-white text-neutral-600 shadow-xs'
                    }`}
                  >
                    <TextSelect className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-neutral-900">
                        انتخاب و استخراج متن جزوه
                      </span>
                      {selectMode === 'text' && (
                        <span className="text-[10px] bg-neutral-900 text-white px-1.5 py-0.2 rounded-full font-bold">
                          فعال
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                      متن داخل صفحات PDF را مستقیماً سلکت و استخراج کنید؛ سپس کپی کرده یا به یادداشت اضافه نمایید.
                    </p>
                  </div>
                </button>
              </div>

              {/* Quick full-page text extraction when text mode is active */}
              {selectMode === 'text' && (
                <div className="mb-2.5">
                  <button
                    type="button"
                    disabled={isExtractingPageText || !pdfDoc}
                    onClick={handleExtractVisiblePageText}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-neutral-800 hover:text-white bg-neutral-100 hover:bg-neutral-900 rounded-xl cursor-pointer transition-colors disabled:opacity-50 ios-spring-btn"
                  >
                    {isExtractingPageText ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                    )}
                    <span>استخراج متن کامل صفحه {visiblePage}</span>
                  </button>
                </div>
              )}

              {/* Shortcut Setting */}
              {renderShortcutSettingRow('select')}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />

        {/* Pen Tool (ابزار مداد) with Double-Click Settings Popover */}
        <div className="relative shrink-0">
          <button
            onClick={handlePenClick}
            onDoubleClick={handlePenDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'pen'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار مداد [${formatShortcutLabel(shortcuts.pen)}] (دوبار کلیک برای تنظیمات)`}
          >
            <Pencil className="w-4 h-4 shrink-0" />
            {!isVerticalCapsule && (
              <span className={activeTool === 'pen' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>مداد</span>
            )}
            {/* Color Indicator Dot */}
            <span
              className={`rounded-full border border-white/60 shadow-2xs shrink-0 ${
                isVerticalCapsule ? 'absolute bottom-1 right-1 w-2 h-2' : 'w-2.5 h-2.5'
              }`}
              style={{ backgroundColor: penColor }}
            />
          </button>

          {/* Smooth Animated Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isPenSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 mb-3">
              <div className="flex items-center gap-1.5">
                <Pencil className="w-4 h-4 text-neutral-800" />
                <span className="text-xs font-bold text-neutral-900">تنظیمات مداد</span>
              </div>
              <button
                onClick={() => setIsPenSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                title="بستن تنظیمات"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Color Selection (انتخاب رنگ) */}
            <div className="mb-3.5">
              <span className="text-[11px] font-semibold text-neutral-500 block mb-2">انتخاب رنگ:</span>
              <div className="flex items-center justify-between gap-1.5">
                {[
                  { hex: '#ef4444', label: 'قرمز' },
                  { hex: '#2563eb', label: 'آبی' },
                  { hex: '#16a34a', label: 'سبز' },
                  { hex: '#171717', label: 'مشکی (تطبیقی با حالت تاریک)' },
                  { hex: '#ffffff', label: 'سفید' },
                  { hex: '#d97706', label: 'نارنجی' },
                  { hex: '#9333ea', label: 'بنفش' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setPenColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full cursor-pointer shadow-xs relative flex items-center justify-center ios-spring-tool ${
                      c.hex.toLowerCase() === '#ffffff' ? 'ring-1 ring-neutral-300' : ''
                    } ${
                      penColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-neutral-900 scale-110'
                        : ''
                    }`}
                    title={c.label}
                  />
                ))}

                {/* Custom Color Input */}
                <label
                  className="w-6 h-6 rounded-full shadow-xs flex items-center justify-center cursor-pointer relative overflow-hidden shrink-0 ios-spring-tool"
                  title="رنگ دلخواه"
                >
                  <div
                    className="w-full h-full"
                    style={{
                      background:
                        'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                    }}
                  />
                  <input
                    type="color"
                    value={penColor}
                    onChange={(e) => setPenColor(e.target.value)}
                    className="absolute opacity-0 inset-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Thickness Selection (ضخامت خط) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-neutral-500">ضخامت خط:</span>
                <span className="text-xs font-mono font-bold text-neutral-900 tabular-nums">
                  {penWidth} px
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="1"
                max="12"
                step="1"
                value={penWidth}
                onChange={(e) => setPenWidth(Number(e.target.value))}
                className="w-full accent-neutral-900 cursor-pointer h-1.5 bg-neutral-200 rounded-lg appearance-none"
              />

              {/* Live Line Preview */}
              <div className="mt-3 p-2 bg-neutral-100/80 rounded-xl flex items-center justify-center h-8">
                <div
                  style={{
                    height: `${penWidth}px`,
                    backgroundColor: penColor,
                    borderRadius: `${penWidth / 2}px`,
                  }}
                  className="w-4/5 transition-all"
                />
              </div>
            </div>

            {/* Shortcut Setting (شورتکات کیبورد) */}
            {renderShortcutSettingRow('pen', true)}
          </div>
        </div>
      </div>

        {/* Divider */}
        <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />

        {/* Highlighter Tool (ابزار هایلایتر) */}
        <div className="relative shrink-0">
          <button
            onClick={handleHighlighterClick}
            onDoubleClick={handleHighlighterDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'highlighter'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار هایلایتر [${formatShortcutLabel(shortcuts.highlighter)}] (دوبار کلیک برای تنظیمات)`}
          >
            <Highlighter className="w-4 h-4 shrink-0" />
            {!isVerticalCapsule && (
              <span className={activeTool === 'highlighter' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>هایلایت</span>
            )}
            {/* Color Indicator Dot */}
            <span
              className={`rounded-full border border-white/60 shadow-2xs shrink-0 ${
                isVerticalCapsule ? 'absolute bottom-1 right-1 w-2 h-2' : 'w-2.5 h-2.5'
              }`}
              style={{ backgroundColor: highlighterColor }}
            />
          </button>

          {/* Smooth Animated Highlighter Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isHighlighterSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 mb-3">
              <div className="flex items-center gap-1.5">
                <Highlighter className="w-4 h-4 text-neutral-800" />
                <span className="text-xs font-bold text-neutral-900">تنظیمات هایلایتر</span>
              </div>
              <button
                onClick={() => setIsHighlighterSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                title="بستن تنظیمات"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Auto-Straighten Option (صاف کردن خودکار) */}
            <div className="mb-3.5 p-2.5 bg-neutral-100/75 rounded-xl flex items-center justify-between gap-3 whitespace-normal">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-neutral-800">صاف کردن خودکار</span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      autoStraighten ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {autoStraighten ? 'روشن' : 'خاموش'}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-500 leading-tight mt-0.5 whitespace-normal">
                  تبدیل لرزش دست به خط صاف روی متن
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAutoStraighten((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ios-spring-tool ${
                  autoStraighten ? 'bg-neutral-900' : 'bg-neutral-300'
                }`}
                title={autoStraighten ? 'صاف کردن خودکار: روشن' : 'صاف کردن خودکار: خاموش'}
              >
                <span
                  style={{
                    left: autoStraighten ? '22px' : '2px',
                  }}
                  className="pointer-events-none absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200 ease-in-out"
                />
              </button>
            </div>

            {/* Color Selection (انتخاب رنگ هایلایتر) */}
            <div className="mb-3.5">
              <span className="text-[11px] font-semibold text-neutral-500 block mb-2">رنگ هایلایت:</span>
              <div className="flex items-center justify-between gap-1.5">
                {[
                  { hex: '#ffea00', label: 'زرد فسفری درخشان' },
                  { hex: '#00e676', label: 'سبز فسفری زنده' },
                  { hex: '#00e5ff', label: 'آبی فیروزه‌ای براق' },
                  { hex: '#ff2d87', label: 'صورتی نئونی پرانرژی' },
                  { hex: '#ff6d00', label: 'نارنجی فسفری تابان' },
                  { hex: '#b347ff', label: 'بنفش الکتریک درخشان' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setHighlighterColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full cursor-pointer shadow-xs relative flex items-center justify-center ios-spring-tool ${
                      highlighterColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-neutral-900 scale-110'
                        : ''
                    }`}
                    title={c.label}
                  />
                ))}

                {/* Custom Color Input */}
                <label
                  className="w-6 h-6 rounded-full shadow-xs flex items-center justify-center cursor-pointer relative overflow-hidden shrink-0 ios-spring-tool"
                  title="رنگ دلخواه"
                >
                  <div
                    className="w-full h-full"
                    style={{
                      background:
                        'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                    }}
                  />
                  <input
                    type="color"
                    value={highlighterColor}
                    onChange={(e) => setHighlighterColor(e.target.value)}
                    className="absolute opacity-0 inset-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Thickness Selection (ضخامت خط هایلایت) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-neutral-500">ضخامت هایلایت:</span>
                <span className="text-xs font-mono font-bold text-neutral-900 tabular-nums">
                  {highlighterWidth} px
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="8"
                max="36"
                step="2"
                value={highlighterWidth}
                onChange={(e) => setHighlighterWidth(Number(e.target.value))}
                className="w-full accent-neutral-900 cursor-pointer h-1.5 bg-neutral-200 rounded-lg appearance-none"
              />

              {/* Live Preview */}
              <div className="mt-3 p-2 bg-neutral-100/80 rounded-xl flex items-center justify-center h-10 overflow-hidden relative">
                <span className="text-xs text-neutral-800 font-bold z-10 select-none">متن نمونه جزوه</span>
                <div
                  style={{
                    height: `${Math.min(highlighterWidth, 24)}px`,
                    backgroundColor: highlighterColor,
                    opacity: 0.45,
                  }}
                  className="absolute w-4/5 rounded-xs"
                />
              </div>
            </div>

            {/* Shortcut Setting (شورتکات کیبورد) */}
            {renderShortcutSettingRow('highlighter', true)}
          </div>
        </div>
      </div>

        {/* Divider */}
        <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />

        {/* Ruler / Underline Tool (ابزار خط‌کش / آندرلاین) with 90-degree lock toggle & settings */}
        <div className="relative shrink-0">
          <button
            onClick={handleRulerClick}
            onDoubleClick={handleRulerDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'ruler'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار خط‌کش / آندرلاین [${formatShortcutLabel(shortcuts.ruler)}] (دوبار کلیک برای تنظیمات)`}
          >
            <Ruler className="w-4 h-4 shrink-0" />
            {!isVerticalCapsule && (
              <span className={activeTool === 'ruler' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>خط‌کش</span>
            )}
            {/* Color Indicator Dot */}
            <span
              className={`rounded-full border border-white/60 shadow-2xs shrink-0 ${
                isVerticalCapsule ? 'absolute bottom-1 right-1 w-2 h-2' : 'w-2.5 h-2.5'
              }`}
              style={{ backgroundColor: rulerColor }}
            />
          </button>

          {/* Ruler Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isRulerSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 mb-3">
              <div className="flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-neutral-800" />
                <span className="text-xs font-bold text-neutral-900">تنظیمات خط‌کش / آندرلاین</span>
              </div>
              <button
                onClick={() => setIsRulerSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                title="بستن تنظیمات"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* 90-Degree Lock Toggle (قفل ۹۰ درجه برای جلوگیری از خط شیب‌دار) */}
            <div className="flex items-center justify-between gap-3 p-2.5 mb-3 bg-neutral-100/75 rounded-xl whitespace-normal">
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-neutral-800">قفل ۹۰ درجه</span>
                  <span
                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      rulerLock90 ? 'bg-neutral-900 text-white' : 'bg-neutral-200 text-neutral-600'
                    }`}
                  >
                    {rulerLock90 ? 'روشن' : 'خاموش'}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-500 leading-tight mt-0.5 whitespace-normal">
                  کشیدن خط کاملاً افقی یا عمودی بدون شیب
                </span>
              </div>
              <button
                type="button"
                onClick={() => setRulerLock90((prev) => !prev)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full p-0.5 transition-colors duration-200 ease-in-out focus:outline-none ios-spring-tool ${
                  rulerLock90 ? 'bg-neutral-900' : 'bg-neutral-300'
                }`}
                title={rulerLock90 ? 'قفل ۹۰ درجه: روشن' : 'قفل ۹۰ درجه: خاموش'}
              >
                <span
                  style={{
                    left: rulerLock90 ? '22px' : '2px',
                  }}
                  className="pointer-events-none absolute top-0.5 block h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200 ease-in-out"
                />
              </button>
            </div>

            {/* Color Selection (انتخاب رنگ خط‌کش) */}
            <div className="mb-3.5">
              <span className="text-[11px] font-semibold text-neutral-500 block mb-2">رنگ خط:</span>
              <div className="flex items-center justify-between gap-1.5">
                {[
                  { hex: '#2563eb', label: 'آبی' },
                  { hex: '#ef4444', label: 'قرمز' },
                  { hex: '#16a34a', label: 'سبز' },
                  { hex: '#171717', label: 'مشکی (تطبیقی با حالت تاریک)' },
                  { hex: '#ffffff', label: 'سفید' },
                  { hex: '#d97706', label: 'نارنجی' },
                  { hex: '#9333ea', label: 'بنفش' },
                ].map((c) => (
                  <button
                    key={c.hex}
                    onClick={() => setRulerColor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full cursor-pointer shadow-xs relative flex items-center justify-center ios-spring-tool ${
                      c.hex.toLowerCase() === '#ffffff' ? 'ring-1 ring-neutral-300' : ''
                    } ${
                      rulerColor.toLowerCase() === c.hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-neutral-900 scale-110'
                        : ''
                    }`}
                    title={c.label}
                  />
                ))}

                {/* Custom Color Input */}
                <label
                  className="w-6 h-6 rounded-full shadow-xs flex items-center justify-center cursor-pointer relative overflow-hidden shrink-0 ios-spring-tool"
                  title="رنگ دلخواه"
                >
                  <div
                    className="w-full h-full"
                    style={{
                      background:
                        'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                    }}
                  />
                  <input
                    type="color"
                    value={rulerColor}
                    onChange={(e) => setRulerColor(e.target.value)}
                    className="absolute opacity-0 inset-0 cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Thickness Selection (ضخامت خط‌کش) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-semibold text-neutral-500">ضخامت خط:</span>
                <span className="text-xs font-mono font-bold text-neutral-900 tabular-nums">
                  {rulerWidth} px
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={rulerWidth}
                onChange={(e) => setRulerWidth(Number(e.target.value))}
                className="w-full accent-neutral-900 cursor-pointer h-1.5 bg-neutral-200 rounded-lg appearance-none"
              />

              {/* Live Preview */}
              <div className="mt-3 p-2 bg-neutral-100/80 rounded-xl flex items-center justify-center h-8">
                <div
                  style={{
                    height: `${rulerWidth}px`,
                    backgroundColor: rulerColor,
                    borderRadius: `${rulerWidth / 2}px`,
                  }}
                  className="w-4/5 transition-all"
                />
              </div>
            </div>

            {/* Shortcut Setting (شورتکات کیبورد) */}
            {renderShortcutSettingRow('ruler', true)}
          </div>
        </div>
      </div>

        {/* Divider */}
        <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />

        {/* Eraser Tool (ابزار پاک‌کن) with Popover Settings */}
        <div className="relative shrink-0">
          <button
            onClick={handleEraserClick}
            onDoubleClick={handleEraserDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1.5 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'eraser'
                ? eraserMode === 'object'
                  ? 'bg-amber-600 text-white ring-1 ring-amber-400 shadow-xs'
                  : 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار پاک‌کن (${eraserMode === 'object' ? 'حالت ادیت خاص' : 'حالت دایره‌ای'}) [${formatShortcutLabel(shortcuts.eraser)}] (دوبار کلیک برای تنظیمات)`}
          >
            {eraserMode === 'object' ? (
              <Crosshair className="w-4 h-4 shrink-0 text-amber-200" />
            ) : (
              <Eraser className="w-4 h-4 shrink-0" />
            )}
            {!isVerticalCapsule && (
              <span className={activeTool === 'eraser' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>
                پاک‌کن
              </span>
            )}
          </button>

          {/* Eraser Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isEraserSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 mb-3">
              <div className="flex items-center gap-1.5">
                <Eraser className="w-4 h-4 text-neutral-800" />
                <span className="text-xs font-bold text-neutral-900">تنظیمات پاک‌کن</span>
              </div>
              <button
                onClick={() => setIsEraserSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                title="بستن تنظیمات"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Eraser Mode Selection (دو آپشن پاک‌کن) */}
            <div className="mb-3 space-y-2.5">
              <label className="text-[11px] font-bold text-neutral-700 block mb-1">
                نوع عملکرد پاک‌کن:
              </label>

              {/* Option 1: Area / Circle Eraser */}
              <button
                type="button"
                onClick={() => setEraserMode('area')}
                className={`w-full flex items-start gap-2.5 p-2.5 rounded-2xl text-right transition-all cursor-pointer ${
                  eraserMode === 'area'
                    ? 'bg-rose-50/70 ring-2 ring-rose-500 shadow-[0_6px_18px_-3px_rgba(244,63,94,0.18)]'
                    : 'bg-neutral-100/75 hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                    eraserMode === 'area' ? 'bg-rose-500 text-white shadow-xs' : 'bg-white text-neutral-600 shadow-xs'
                  }`}
                >
                  <CircleDot className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">
                      پاک‌کردن داخل دایره (ناحیه‌ای)
                    </span>
                    {eraserMode === 'area' && (
                      <span className="text-[10px] bg-rose-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                        فعال
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                    هر خط، هایلایت یا نوشته‌ای که داخل محدوده دایره قرار بگیرد پاک می‌شود.
                  </p>
                </div>
              </button>

              {/* Option 2: Object / Specific Edit Eraser */}
              <button
                type="button"
                onClick={() => setEraserMode('object')}
                className={`w-full flex items-start gap-2.5 p-2.5 rounded-2xl text-right transition-all cursor-pointer ${
                  eraserMode === 'object'
                    ? 'bg-amber-50/70 ring-2 ring-amber-500 shadow-[0_6px_18px_-3px_rgba(245,158,11,0.18)]'
                    : 'bg-neutral-100/75 hover:bg-neutral-100'
                }`}
              >
                <div
                  className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${
                    eraserMode === 'object' ? 'bg-amber-500 text-white shadow-xs' : 'bg-white text-neutral-600 shadow-xs'
                  }`}
                >
                  <MousePointerClick className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-900">
                      پاک‌کردن یک ادیت خاص (انتخابی)
                    </span>
                    {eraserMode === 'object' && (
                      <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.2 rounded-full font-bold">
                        فعال
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5 leading-snug">
                    با کلیک روی یک خط یا یادداشت خاص، فقط همان ادیت انتخاب‌شده پاک می‌شود.
                  </p>
                </div>
              </button>
            </div>

            {/* Area Mode: Circle Size Controls */}
            {eraserMode === 'area' && (
              <div className="p-2.5 mb-3 bg-neutral-100/75 rounded-2xl">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-neutral-700">اندازه دایره پاک‌کن:</span>
                  <span className="text-[11px] font-mono font-semibold text-neutral-600">{eraserSize}px</span>
                </div>

                {/* Presets */}
                <div className="flex gap-1.5 mb-2.5">
                  {[
                    { label: 'ریز', size: 16 },
                    { label: 'متوسط', size: 28 },
                    { label: 'بزرگ', size: 48 },
                  ].map((preset) => (
                    <button
                      key={preset.size}
                      type="button"
                      onClick={() => setEraserSize(preset.size)}
                      className={`flex-1 py-1 text-[11px] font-semibold rounded-lg cursor-pointer transition-all ${
                        eraserSize === preset.size
                          ? 'bg-rose-500 text-white shadow-xs'
                          : 'bg-white text-neutral-700 hover:bg-neutral-50 shadow-xs'
                      }`}
                    >
                      {preset.label} ({preset.size})
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="12"
                    max="64"
                    step="2"
                    value={eraserSize}
                    onChange={(e) => setEraserSize(Number(e.target.value))}
                    className="flex-1 accent-rose-500 cursor-pointer"
                  />
                  {/* Visual Circle Preview */}
                  <div className="w-8 h-8 flex items-center justify-center shrink-0">
                    <div
                      style={{
                        width: `${Math.min(30, Math.max(8, eraserSize * 0.6))}px`,
                        height: `${Math.min(30, Math.max(8, eraserSize * 0.6))}px`,
                      }}
                      className="rounded-full border-2 border-rose-500 bg-rose-500/20"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Object Mode: Helpful Guidance */}
            {eraserMode === 'object' && (
              <div className="p-2.5 mb-3 bg-amber-50/85 rounded-2xl text-amber-900">
                <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-800 mb-1">
                  <Crosshair className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>راهنمای حالت ادیت خاص:</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  نشانگر را روی خط، هایلایت یا یادداشت موردنظر ببرید تا کادر هدف قرمز نمایان شود؛ با یک کلیک تنها همان ادیت حذف شده و بقیه ادیت‌ها دست‌نخورده باقی می‌مانند.
                </p>
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-2">
              <button
                onClick={() => {
                  handleClearPageAnnotations(visiblePage);
                  setIsEraserSettingsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 rounded-xl cursor-pointer whitespace-normal text-center leading-snug ios-spring-btn"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span>پاک کردن تمام یادداشت‌های این صفحه ({visiblePage})</span>
              </button>
            </div>

            {/* Shortcut Setting (شورتکات کیبورد) */}
            {renderShortcutSettingRow('eraser', true)}
          </div>
        </div>
      </div>

        {/* Divider */}
        <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />

        {/* Sticky Note Tool (ابزار یادداشت چسبان) with Double-Click Settings Popover */}
        <div className="relative shrink-0">
          <button
            onClick={handleStickyNoteClick}
            onDoubleClick={handleStickyNoteDoubleClick}
            className={`relative flex items-center justify-center rounded-full cursor-pointer shrink-0 ios-spring-tool ${
              isVerticalCapsule
                ? 'w-9 h-9 sm:w-10 sm:h-10 p-0'
                : 'gap-1 px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap'
            } ${
              activeTool === 'sticky-note'
                ? 'bg-neutral-900 text-white shadow-xs'
                : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
            }`}
            title={`ابزار یادداشت چسبان [${formatShortcutLabel(shortcuts.stickyNote)}] (دوبار کلیک برای تنظیمات)`}
          >
            <StickyNote className="w-4 h-4 shrink-0" />
            {!isVerticalCapsule && (
              <span className={activeTool === 'sticky-note' ? 'inline whitespace-nowrap text-xs font-semibold' : 'hidden xl:inline whitespace-nowrap text-xs'}>یادداشت</span>
            )}
          </button>

          {/* Sticky Note Settings Popover (اکستند شده ژله‌ای مستقیم از خود دکمه) */}
          <div className="ios-popover-anchor">
            <div
              className={`w-72 sm:w-80 bg-white rounded-3xl shadow-[0_20px_50px_-6px_rgba(0,0,0,0.22),0_4px_12px_-2px_rgba(0,0,0,0.08)] p-4 whitespace-normal ios-popover-bubble ${
                isStickyNoteSettingsOpen ? 'ios-popover-bubble-open' : 'ios-popover-bubble-closed pointer-events-none invisible opacity-0'
              }`}
            >
            {/* Popover Header */}
            <div className="flex items-center justify-between pb-2 mb-3">
              <div className="flex items-center gap-1.5">
                <StickyNote className="w-4 h-4 text-neutral-800" />
                <span className="text-xs font-bold text-neutral-900">تنظیمات یادداشت چسبان</span>
              </div>
              <button
                onClick={() => setIsStickyNoteSettingsOpen(false)}
                className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                title="بستن تنظیمات"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            {/* Description */}
            <p className="text-[11px] text-neutral-500 mb-3 leading-relaxed whitespace-normal">
              با انتخاب این ابزار و کلیک روی هر نقطه از صفحات فایل، یک برگه یادداشت چسبان برای نکته‌برداری ایجاد می‌شود.
            </p>

            {/* Shortcut Setting */}
            {renderShortcutSettingRow('stickyNote')}
          </div>
        </div>
      </div>

        {/* Full-Screen Exit inside Capsule (در حالت تمام صفحه برای دسترسی سریع و تمرکز کامل) */}
        {isFocusMode && (
          <>
            <div className={isVerticalCapsule ? "w-5 h-px bg-neutral-200 shrink-0 my-0.5" : "w-px h-4 bg-neutral-200 shrink-0"} />
            <button
              onClick={handleToggleFocusMode}
              className={`flex items-center justify-center rounded-full text-xs font-semibold text-neutral-800 hover:text-white hover:bg-neutral-900 cursor-pointer shrink-0 ios-spring-tool ${
                isVerticalCapsule ? 'w-9 h-9 sm:w-10 sm:h-10 p-0' : 'gap-1.5 px-3 py-1.5'
              }`}
              title="خروج از حالت تمام صفحه (یا کلید Esc)"
            >
              <Minimize2 className="w-4 h-4 shrink-0" />
              {!isVerticalCapsule && <span className="text-[11px] font-bold">خروج</span>}
            </button>
          </>
        )}
      </div>

      {/* Side Drawer Window for Sticky Note (پنجره باز شونده از کنار صفحه با قابلیت ادیت هر بخش انتخابی از متن) */}
      <StickyNoteDrawer
        note={activeStickyNote}
        isOpen={isStickyDrawerOpen}
        onClose={() => setIsStickyDrawerOpen(false)}
        onUpdate={handleUpdateStickyNote}
        onDelete={handleDeleteStickyNote}
        allNotes={stickyNotes}
        onSelectNote={(n) => setActiveStickyNote(n)}
        onNavigateToPage={(p) => scrollToPage(p)}
      />

      {/* Apple Settings Modal */}
      {isEyeComfortOpen && (
        <SettingsView
          isModal={true}
          eyeComfortSettings={eyeComfortSettings}
          onUpdateEyeComfortSettings={setEyeComfortSettings}
          pomodoroSettings={pomodoroSettings}
          onUpdatePomodoroSettings={onUpdatePomodoroSettings}
          shortcuts={shortcuts}
          onUpdateShortcuts={setShortcuts}
          onResetShortcuts={handleResetAllShortcuts}
          capsulePosition={capsulePosition}
          onUpdateCapsulePosition={setCapsulePosition}
          onClose={() => setIsEyeComfortOpen(false)}
          fileName={currentFile.name}
        />
      )}

      {/* Quick Notes Modal Dialog (پنجره شناور دفترچه یادداشت اصلی با انیمیشن کپسولی نرم) */}
      {isNotesModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-2xs flex items-center justify-center p-2 sm:p-3 md:p-4 overflow-y-auto transition-opacity duration-150">
          <div className="bg-white rounded-3xl shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] w-full max-w-5xl h-[86vh] max-h-[760px] flex flex-col overflow-hidden relative my-auto animate-ios-modal">
            {/* Modal Header */}
            <div className="p-3 sm:p-4 flex items-center justify-between bg-white shadow-[0_6px_20px_-4px_rgba(0,0,0,0.08)] relative z-10 shrink-0">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-neutral-900">دفترچه یادداشت (میز مطالعه)</h3>
                    {notes && notes.length > 0 && (
                      <span className="text-[10px] bg-neutral-200 text-neutral-700 font-bold px-2 py-0.5 rounded-full font-mono">
                        {notes.length} یادداشت
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    دسترسی سریع به یادداشت‌ها، پوشه‌ها و ثبت نکات بدون خروج از فایل مطالعه
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {onSwitchToNotes && (
                  <button
                    onClick={() => {
                      setIsNotesModalOpen(false);
                      onSwitchToNotes();
                    }}
                    className="px-2.5 py-1.5 text-xs text-neutral-700 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="مشاهده یادداشت‌ها در صفحه اصلی"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">مشاهده در صفحه اصلی</span>
                  </button>
                )}
                <button
                  onClick={() => setIsNotesModalOpen(false)}
                  className="w-10 h-10 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/30 transition-transform cursor-pointer ios-spring-btn shrink-0"
                  title="خروج و بستن پنجره (Esc یا Alt+N)"
                  aria-label="خروج و بستن"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Modal Body: NotesView */}
            <div className="flex-1 min-h-0 overflow-hidden">
              {notes && onAddNote && onUpdateNote && onDeleteNote ? (
                <NotesView
                  notes={notes}
                  onAddNote={onAddNote}
                  onUpdateNote={onUpdateNote}
                  onDeleteNote={onDeleteNote}
                  studyFiles={
                    uniqueSavedFiles && uniqueSavedFiles.length > 0
                      ? uniqueSavedFiles.map((f) => (f.id === currentFile?.id ? { ...f, stickyNotes } : f))
                      : currentFile
                      ? [{ ...currentFile, stickyNotes }]
                      : []
                  }
                  onOpenFileAtPage={(_file, p) => {
                    setIsNotesModalOpen(false);
                    scrollToPage(p);
                  }}
                  onUpdateStickyNote={(_fileId, updated) => handleUpdateStickyNote(updated)}
                  onDeleteStickyNote={(_fileId, noteId) => handleDeleteStickyNote(noteId)}
                />
              ) : (
                <div className="p-8 text-center text-xs text-neutral-400">یادداشتی یافت نشد.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Extracted PDF Text Action Pill & Expandable Panel */}
      {extractedTextData && !isExtractedTextExpanded && (
        <div
          dir="rtl"
          className={`fixed left-1/2 -translate-x-1/2 z-[45] bg-white/95 backdrop-blur-md border border-neutral-200/90 shadow-[0_20px_50px_-8px_rgba(0,0,0,0.22)] rounded-2xl px-3 py-2 flex items-center gap-2 max-w-[94vw] sm:max-w-xl animate-ios-popover-open ${
            capsulePosition.startsWith('top') ? 'bottom-4 sm:bottom-6' : 'top-16 sm:top-20'
          }`}
        >
          <span className="px-2 py-0.5 rounded-lg bg-neutral-100 text-neutral-800 text-[11px] font-bold shrink-0">
            صفحه {extractedTextData.pageNumber}
          </span>
          <span
            dir="auto"
            className="text-xs text-neutral-700 truncate min-w-0 max-w-[140px] sm:max-w-[210px] select-text"
            title={extractedTextData.text}
          >
            {extractedTextData.text}
          </span>
          <div className="w-px h-4 bg-neutral-200 shrink-0" />
          <button
            type="button"
            onClick={handleCopyExtractedText}
            className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
              copiedExtractedText
                ? 'bg-emerald-600 text-white'
                : 'bg-neutral-900 hover:bg-neutral-800 text-white'
            }`}
            title="کپی متن استخراج‌شده"
          >
            {copiedExtractedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedExtractedText ? 'کپی شد' : 'کپی'}</span>
          </button>
          <button
            type="button"
            onClick={handleSaveExtractedAsStickyNote}
            className="px-2 py-1 rounded-xl text-[11px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
            title="ساخت یادداشت چسبان با این متن"
          >
            <StickyNote className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">استیکی نوت</span>
          </button>
          {onAddNote && (
            <button
              type="button"
              onClick={handleSaveExtractedToNotebook}
              className="px-2 py-1 rounded-xl text-[11px] font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
              title="افزودن به دفترچه یادداشت"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">دفترچه</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsExtractedTextExpanded(true)}
            className="p-1.5 rounded-xl bg-neutral-100 hover:bg-neutral-200 text-neutral-700 shrink-0 cursor-pointer transition-colors"
            title="مشاهده و ویرایش متن کامل"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setExtractedTextData(null);
              setIsExtractedTextExpanded(false);
              window.getSelection()?.removeAllRanges();
            }}
            className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 shrink-0 cursor-pointer transition-colors"
            title="بستن"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {extractedTextData && isExtractedTextExpanded && (
        <div
          dir="rtl"
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-4"
          onClick={() => setIsExtractedTextExpanded(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-3xl shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] border border-neutral-200/80 w-full max-w-xl p-4 sm:p-5 space-y-3.5 animate-ios-modal text-right"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs shrink-0">
                  <TextSelect className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    متن استخراج‌شده از جزوه
                  </h3>
                  <p className="text-[11px] text-neutral-500">
                    صفحه {extractedTextData.pageNumber} •{' '}
                    {extractedTextData.text.trim() ? extractedTextData.text.trim().split(/\s+/).length : 0} کلمه •{' '}
                    {extractedTextData.text.length} کاراکتر
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setExtractedTextData(null);
                  setIsExtractedTextExpanded(false);
                  window.getSelection()?.removeAllRanges();
                }}
                className="w-8 h-8 rounded-full bg-rose-500 hover:bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-500/25 cursor-pointer shrink-0 ios-spring-btn"
                title="بستن"
              >
                <X className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>

            <textarea
              dir="auto"
              value={extractedTextData.text}
              onChange={(e) =>
                setExtractedTextData((prev) =>
                  prev ? { ...prev, text: e.target.value } : null
                )
              }
              rows={8}
              className="w-full rounded-2xl bg-neutral-100/80 border border-neutral-200/80 p-3 text-xs sm:text-sm text-neutral-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-neutral-900/20 select-text resize-y custom-column-scroll"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyExtractedText}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                    copiedExtractedText
                      ? 'bg-emerald-600 text-white'
                      : 'bg-neutral-900 hover:bg-neutral-800 text-white'
                  }`}
                >
                  {copiedExtractedText ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedExtractedText ? 'کپی شد ✓' : 'کپی متن'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleSaveExtractedAsStickyNote}
                  className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>ذخیره به عنوان استیکی نوت</span>
                </button>
                {onAddNote && (
                  <button
                    type="button"
                    onClick={handleSaveExtractedToNotebook}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-blue-50 hover:bg-blue-100 text-blue-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>افزودن به دفترچه</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsExtractedTextExpanded(false)}
                className="px-3 py-2 rounded-xl text-xs font-semibold text-neutral-600 hover:bg-neutral-100 cursor-pointer transition-colors"
              >
                کوچک‌نمایی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Save Toast Notification */}
      {showSavedToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/95 backdrop-blur-xs text-white px-4 py-2 rounded-2xl shadow-[0_20px_48px_-6px_rgba(0,0,0,0.35)] flex items-center gap-2 text-xs font-semibold animate-ios-popover-open pointer-events-none">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{showSavedToast}</span>
        </div>
      )}

      {/* Minimal Exit Modal Dialog */}
      {isExitModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className="bg-white rounded-3xl shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] max-w-[380px] w-full p-5 sm:p-6 space-y-4 select-none text-right"
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-black text-neutral-900 tracking-tight">
                  خروج از فایل
                </h3>
                <span
                  className="text-[11px] font-mono text-neutral-400 block truncate mt-0.5"
                  title={currentFile.name}
                >
                  {currentFile.name}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsExitModalOpen(false)}
                className="w-7 h-7 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                title="بستن"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Minimal 2-Column Metric Strip */}
            {(() => {
              const safeTotalPages = Math.max(1, totalPages || currentFile.pageCount || 1);
              const baselinePage = Math.max(1, Math.min(safeTotalPages, sessionBaselinePage));
              const currentPageClamped = Math.max(1, Math.min(safeTotalPages, visiblePage));
              const pagesDelta = currentPageClamped - baselinePage;
              const prevPctRaw = baselinePage <= 1 ? 0 : (baselinePage / safeTotalPages) * 100;
              const currPctRaw =
                currentPageClamped <= 1 && baselinePage <= 1
                  ? 0
                  : (currentPageClamped / safeTotalPages) * 100;
              const diffPctRaw = currPctRaw - prevPctRaw;
              const percentLabel =
                pagesDelta === 0
                  ? '0%'
                  : Math.abs(diffPctRaw) < 1
                    ? `${diffPctRaw > 0 ? '+' : ''}${Number(diffPctRaw.toFixed(1))}%`
                    : `${diffPctRaw > 0 ? '+' : ''}${Math.round(diffPctRaw)}%`;

              const s = Math.max(0, exitSessionStudySeconds);
              const hrs = Math.floor(s / 3600);
              const mins = Math.floor((s % 3600) / 60);
              const secs = s % 60;
              const durationLabel =
                hrs > 0
                  ? mins > 0
                    ? `${hrs} ساعت و ${mins} دقیقه`
                    : `${hrs} ساعت`
                  : mins > 0
                    ? `${mins} دقیقه`
                    : `${secs} ثانیه`;

              return (
                <div className="grid grid-cols-2 bg-neutral-100/80 rounded-2xl py-3 px-2 text-center divide-x divide-x-reverse divide-neutral-200/80">
                  <div className="px-2 flex flex-col items-center justify-center min-w-0">
                    <span className="text-[11px] text-neutral-500 font-medium whitespace-nowrap">
                      پیشرفت نسبت به قبل
                    </span>
                    <span
                      dir="ltr"
                      className={`text-base font-extrabold tabular-nums mt-1 leading-tight ${
                        pagesDelta > 0
                          ? 'text-emerald-600'
                          : pagesDelta < 0
                            ? 'text-amber-600'
                            : 'text-neutral-900'
                      }`}
                    >
                      {percentLabel}
                    </span>
                  </div>

                  <div className="px-2 flex flex-col items-center justify-center min-w-0">
                    <span className="text-[11px] text-neutral-500 font-medium whitespace-nowrap">
                      زمان مطالعه
                    </span>
                    <span className="text-base font-extrabold text-neutral-900 tabular-nums mt-1 leading-tight whitespace-nowrap">
                      {durationLabel}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Clean Single-Line Action Buttons */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleConfirmSaveAndExit}
                className="w-full px-3.5 py-2.5 bg-neutral-900 hover:bg-black active:bg-neutral-950 text-white rounded-2xl transition-all cursor-pointer flex items-center justify-between shadow-[0_8px_20px_-4px_rgba(0,0,0,0.2)] group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Save className="w-4 h-4 text-white/90 shrink-0" />
                  <span className="text-xs sm:text-[13px] font-bold text-white">ذخیره و خروج</span>
                </div>
                <ArrowLeft className="w-4 h-4 text-neutral-400 group-hover:text-white group-hover:-translate-x-0.5 transition-all shrink-0" />
              </button>

              <button
                type="button"
                onClick={handleConfirmDownloadAndExit}
                disabled={isExportingPdf}
                className="w-full px-3.5 py-2.5 bg-neutral-100/80 hover:bg-neutral-200/70 text-neutral-900 rounded-2xl transition-all cursor-pointer flex items-center justify-between group disabled:opacity-60 disabled:cursor-not-allowed"
                title="دانلود نسخه PDF ویرایش‌شده"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isExportingPdf ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-600 shrink-0" />
                  ) : (
                    <Download className="w-4 h-4 text-emerald-600 shrink-0" />
                  )}
                  <span className="text-xs sm:text-[13px] font-bold text-neutral-900">
                    {isExportingPdf ? 'در حال ساخت PDF...' : 'دانلود PDF و خروج'}
                  </span>
                </div>
                <ArrowLeft className="w-4 h-4 text-neutral-400 group-hover:text-neutral-700 group-hover:-translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>

            {/* Bottom Row */}
            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleConfirmDiscardAndExit}
                className="text-xs font-medium text-neutral-500 hover:text-rose-600 transition-colors py-1 px-1.5 cursor-pointer"
              >
                خروج بدون ذخیره
              </button>
              <button
                type="button"
                onClick={() => setIsExitModalOpen(false)}
                className="text-xs font-semibold text-neutral-600 hover:text-neutral-900 py-1 px-2.5 rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Right-Click Quick Context Menu (دسترسی سریع، باز و خلوت به یادداشت‌ها و استیکی‌نوت‌ها) */}
      {contextMenuPos && (
        <>
          {/* Subtle backdrop to close on outside click (سبک و بدون فشار بلور پردازشی) */}
          <div
            className="fixed inset-0 z-[9998] bg-black/25"
            onClick={() => setContextMenuPos(null)}
          />

          <div
            ref={contextMenuRef}
            style={{
              top: contextMenuPos.y,
              left: contextMenuPos.x,
              transformOrigin: 'top right',
            }}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            className="fixed z-[9999] w-[320px] max-w-[92vw] bg-white rounded-3xl shadow-[0_24px_60px_-8px_rgba(0,0,0,0.28)] p-4 sm:p-5 flex flex-col gap-4 animate-ios-jelly select-none overflow-hidden text-neutral-800 transform-gpu will-change-transform"
          >
            {/* Header: Title and Close button */}
            <div className="flex items-center justify-between pb-1 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-neutral-900 text-white flex items-center justify-center shadow-xs">
                  <Palette className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-neutral-900">
                    تنظیمات نمایش
                  </h4>
                  <p className="text-[10px] text-neutral-400">
                    تم و روشنایی صفحه مطالعه
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setContextMenuPos(null)}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-rose-500 hover:bg-rose-600 active:scale-90 text-white flex items-center justify-center shadow-md shadow-rose-500/30 cursor-pointer shrink-0 transition-transform ios-spring-btn"
                title="خروج و بستن (Esc)"
                aria-label="خروج و بستن"
              >
                <X className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>

            {/* بخش ۱: تغییر تم */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-neutral-500" />
                  <span>تغییر تم</span>
                </span>
                <span className="text-[11px] font-medium text-neutral-500">
                  {eyeComfortSettings.colorMode === 'normal'
                    ? 'عادی'
                    : eyeComfortSettings.colorMode === 'yellow'
                    ? 'کاغذ زرد'
                    : 'تاریک'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* تم عادی */}
                <button
                  type="button"
                  onClick={() =>
                    setEyeComfortSettings((prev) => ({ ...prev, colorMode: 'normal' }))
                  }
                  className={`py-2 px-1 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center gap-1.5 ios-spring-btn ${
                    eyeComfortSettings.colorMode === 'normal'
                      ? 'bg-neutral-900 text-white shadow-[0_8px_18px_-3px_rgba(0,0,0,0.28)] ring-2 ring-neutral-900/20'
                      : 'bg-neutral-100/80 hover:bg-neutral-100 text-neutral-700'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-white ring-1 ring-neutral-300 shadow-2xs flex items-center justify-center ios-spring-tool">
                    {eyeComfortSettings.colorMode === 'normal' && (
                      <Check className="w-3 h-3 text-neutral-900 stroke-[3]" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold">عادی</span>
                </button>

                {/* تم کاغذ زرد */}
                <button
                  type="button"
                  onClick={() =>
                    setEyeComfortSettings((prev) => ({ ...prev, colorMode: 'yellow' }))
                  }
                  className={`py-2 px-1 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center gap-1.5 ios-spring-btn ${
                    eyeComfortSettings.colorMode === 'yellow'
                      ? 'bg-amber-500 text-white shadow-[0_8px_18px_-3px_rgba(245,158,11,0.32)] ring-2 ring-amber-500/25'
                      : 'bg-amber-50/85 hover:bg-amber-100/80 text-amber-900'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-[#fbf0d9] ring-1 ring-amber-300/80 shadow-2xs flex items-center justify-center ios-spring-tool">
                    {eyeComfortSettings.colorMode === 'yellow' && (
                      <Check className="w-3 h-3 text-amber-950 stroke-[3]" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold">زرد</span>
                </button>

                {/* تم تاریک */}
                <button
                  type="button"
                  onClick={() =>
                    setEyeComfortSettings((prev) => ({ ...prev, colorMode: 'dark-gray' }))
                  }
                  className={`py-2 px-1 rounded-2xl text-center cursor-pointer transition-all flex flex-col items-center gap-1.5 ios-spring-btn ${
                    eyeComfortSettings.colorMode === 'dark-gray'
                      ? 'bg-neutral-900 text-white shadow-[0_8px_18px_-3px_rgba(0,0,0,0.35)] ring-2 ring-neutral-700'
                      : 'bg-neutral-800 hover:bg-neutral-700 text-neutral-100'
                  }`}
                >
                  <div className="w-5 h-5 rounded-full bg-[#18181b] ring-1 ring-neutral-600 shadow-2xs flex items-center justify-center ios-spring-tool">
                    {eyeComfortSettings.colorMode === 'dark-gray' && (
                      <Check className="w-3 h-3 text-white stroke-[3]" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold">تاریک</span>
                </button>
              </div>
            </div>

            {/* بخش ۲: تنظیم روشنایی صفحه (بدون پریست) */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                  <span>تنظیم روشنایی صفحه</span>
                </span>
                <span className="font-mono font-bold text-neutral-900 tabular-nums bg-neutral-100 px-2 py-0.5 rounded-lg text-[11px]">
                  {eyeComfortSettings.brightness}٪
                </span>
              </div>

              {/* اسلایدر بدون پریست */}
              <div className="pt-1">
                <AppleCapsuleSlider
                  value={Math.min(100, eyeComfortSettings.brightness)}
                  min={30}
                  max={100}
                  step={1}
                  onChange={(val) =>
                    setEyeComfortSettings((prev) => ({ ...prev, brightness: Math.min(100, val) }))
                  }
                  color={eyeComfortSettings.colorMode === 'yellow' ? 'amber' : 'neutral'}
                  leftIcon={<Sun className="w-3.5 h-3.5" />}
                  className="h-10"
                />
              </div>
            </div>

            {/* بخش ۳: یادداشت‌ها و نکات فایل */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-neutral-800 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                  <span>یادداشت‌ها و نکات</span>
                </span>
                <span className="text-[10px] text-neutral-400 font-mono">
                  {notes?.length || 0} یادداشت
                </span>
              </div>

              {/* دکمه باز کردن پنجره اصلی یادداشت‌ها */}
              <button
                type="button"
                onClick={() => {
                  setContextMenuPos(null);
                  setIsNotesModalOpen(true);
                }}
                className="w-full flex items-center justify-between py-2.5 px-3 rounded-2xl bg-white hover:bg-neutral-50 active:scale-98 text-neutral-900 shadow-[0_8px_22px_-4px_rgba(0,0,0,0.10),0_3px_8px_-2px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_28px_-4px_rgba(0,0,0,0.15)] transition-all cursor-pointer text-xs font-bold"
                title="باز کردن پنجره اصلی یادداشت‌ها"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>باز کردن پنجره اصلی یادداشت‌ها</span>
                </div>
                <span className="text-[10px] bg-neutral-100 text-neutral-700 px-2 py-0.5 rounded-full font-mono">
                  {notes?.length || 0}
                </span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

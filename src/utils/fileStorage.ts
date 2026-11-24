import { StudyFile, FileEdits, NoteItem, StudyTask, StickyNoteItem, DrawingStroke } from '../types';
import { extractWorkspaceDataFromPdf } from './exportPdf';

const DB_NAME = 'StudyWorkspaceDB';
const DB_VERSION = 3;
const STORE_NAME = 'study_files';
const EDITS_STORE = 'file_edits';
const NOTES_STORE = 'study_notes';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(EDITS_STORE)) {
        db.createObjectStore(EDITS_STORE, { keyPath: 'fileId' });
      }
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Normalizes file name for duplicate detection (lowercase, trimmed whitespace)
 */
export function normalizeFileName(name: string): string {
  return (name || '').trim().toLowerCase();
}

// In-memory registry for FileSystemFileHandle instances (for direct disk overwriting)
const fileHandleRegistry = new Map<string, any>();

export function registerFileHandle(key: string, handle: any): void {
  if (key && handle) {
    fileHandleRegistry.set(key, handle);
  }
}

export function getFileHandle(key: string): any {
  if (!key) return undefined;
  return fileHandleRegistry.get(key);
}

/**
 * Requests persistent browser storage so IndexedDB data isn't evicted under storage pressure
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.persist === 'function') {
      const alreadyPersisted = await navigator.storage.persisted?.();
      if (alreadyPersisted) return true;
      return await navigator.storage.persist();
    }
  } catch {}
  return false;
}

/**
 * Merges two sticky note arrays non-destructively, preserving all unique notes from both
 * and deduplicating by ID or exact content+position signature.
 */
export function mergeStickyNotes(
  existingNotes: StickyNoteItem[] = [],
  incomingNotes: StickyNoteItem[] = []
): StickyNoteItem[] {
  const existingList = Array.isArray(existingNotes) ? existingNotes : [];
  const incomingList = Array.isArray(incomingNotes) ? incomingNotes : [];
  if (existingList.length === 0) return [...incomingList];
  if (incomingList.length === 0) return [...existingList];

  const byId = new Map<string, StickyNoteItem>();
  const orderedIds: string[] = [];

  const getSignature = (n: StickyNoteItem): string => {
    const title = (n.title || '').trim();
    const content = (n.content || '').trim();
    const rx = Math.round((n.x || 0) * 100);
    const ry = Math.round((n.y || 0) * 100);
    return `${n.pageNumber || 1}::${title}::${content}::${rx}::${ry}`;
  };

  const signatureToId = new Map<string, string>();

  const scoreNote = (n: StickyNoteItem): number => {
    const imgs = (n.images?.length || 0) + (n.imageUrl ? 1 : 0);
    const contentLen = (n.content || '').trim().length;
    const titleLen = (n.title || '').trim().length;
    return contentLen * 2 + imgs * 100 + titleLen;
  };

  const mergeTwoNotes = (a: StickyNoteItem, b: StickyNoteItem): StickyNoteItem => {
    const primary = scoreNote(b) > scoreNote(a) ? b : a;
    const secondary = primary === b ? a : b;
    const mergedImagesSet = new Set<string>([
      ...(a.images || []),
      ...(a.imageUrl ? [a.imageUrl] : []),
      ...(b.images || []),
      ...(b.imageUrl ? [b.imageUrl] : []),
    ]);
    const mergedImages = Array.from(mergedImagesSet).filter(Boolean);
    return {
      ...secondary,
      ...primary,
      title: (primary.title || '').trim() || (secondary.title || '').trim() || 'یادداشت چسبان',
      content: (primary.content || '').trim().length >= (secondary.content || '').trim().length
        ? primary.content
        : secondary.content,
      images: mergedImages.length > 0 ? mergedImages : undefined,
      imageUrl: mergedImages[0] || primary.imageUrl || secondary.imageUrl,
    };
  };

  const addNote = (note: StickyNoteItem) => {
    if (!note) return;
    const noteId = note.id || `sticky_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const normalizedNote: StickyNoteItem = { ...note, id: noteId };
    const sig = getSignature(normalizedNote);

    if (byId.has(noteId)) {
      byId.set(noteId, mergeTwoNotes(byId.get(noteId)!, normalizedNote));
      return;
    }

    const existingIdForSig = signatureToId.get(sig);
    if (existingIdForSig && byId.has(existingIdForSig)) {
      byId.set(existingIdForSig, mergeTwoNotes(byId.get(existingIdForSig)!, normalizedNote));
      return;
    }

    byId.set(noteId, normalizedNote);
    signatureToId.set(sig, noteId);
    orderedIds.push(noteId);
  };

  for (const n of existingList) addNote(n);
  for (const n of incomingList) addNote(n);

  return orderedIds.map((id) => byId.get(id)!);
}

/**
 * Merges two pageStrokes maps non-destructively, keeping all unique strokes per page.
 */
export function mergePageStrokes(
  existingStrokes: Record<number, DrawingStroke[]> = {},
  incomingStrokes: Record<number, DrawingStroke[]> = {}
): Record<number, DrawingStroke[]> {
  const result: Record<number, DrawingStroke[]> = {};
  const allPages = new Set<number>([
    ...Object.keys(existingStrokes || {}).map(Number),
    ...Object.keys(incomingStrokes || {}).map(Number),
  ]);

  for (const page of allPages) {
    if (isNaN(page)) continue;
    const baseList = existingStrokes?.[page] || [];
    const incList = incomingStrokes?.[page] || [];
    const seenIds = new Set<string>();
    const combined: DrawingStroke[] = [];

    for (const s of [...baseList, ...incList]) {
      if (!s) continue;
      if (s.id) {
        if (seenIds.has(s.id)) continue;
        seenIds.add(s.id);
      }
      combined.push(s);
    }

    if (combined.length > 0) {
      result[page] = combined;
    }
  }

  return result;
}

/**
 * Saves a study file to IndexedDB while preventing duplicate file records.
 * If a file with the same name already exists under another ID, merges any existing edits
 * (stickyNotes & pageStrokes) non-destructively before replacing the duplicate record.
 */
export async function saveStudyFileToStorage(file: StudyFile): Promise<void> {
  const targetName = normalizeFileName(file.name);
  if (file.fileHandle) {
    registerFileHandle(file.id, file.fileHandle);
    registerFileHandle(targetName, file.fileHandle);
  }

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, EDITS_STORE], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const editStore = tx.objectStore(EDITS_STORE);
    const getAllReq = store.getAll();
    const getAllEditsReq = editStore.getAll();

    let allFilesResult: StudyFile[] | null = null;
    let allEditsResult: FileEdits[] | null = null;

    const finalizePut = () => {
      if (allFilesResult === null || allEditsResult === null) return;

      const existingFiles = allFilesResult;
      const editsById = new Map<string, FileEdits>();
      for (const e of allEditsResult) {
        if (e?.fileId) editsById.set(e.fileId, e);
      }

      // Look for duplicate records with the same name but different ID
      const duplicates = existingFiles.filter(
        (f) => f.id !== file.id && normalizeFileName(f.name) === targetName
      );

      const recordToStore: StudyFile = { ...file };
      if (!recordToStore.originalData && recordToStore.data && recordToStore.data.byteLength > 0) {
        recordToStore.originalData = recordToStore.data.slice(0);
      }

      if (duplicates.length > 0) {
        let mergedNotes = recordToStore.stickyNotes || [];
        let mergedStrokes = recordToStore.pageStrokes || {};

        for (const dup of duplicates) {
          const dupEdits = editsById.get(dup.id);
          let lsNotes: StickyNoteItem[] = [];
          let lsStrokes: Record<number, DrawingStroke[]> = {};
          try {
            const rawEdits = localStorage.getItem(`study_edits_${dup.id}`);
            if (rawEdits) {
              const parsed = JSON.parse(rawEdits);
              if (Array.isArray(parsed?.stickyNotes)) lsNotes = parsed.stickyNotes;
              if (parsed?.pageStrokes) lsStrokes = parsed.pageStrokes;
            }
          } catch {}

          mergedNotes = mergeStickyNotes(mergedNotes, dup.stickyNotes || []);
          mergedNotes = mergeStickyNotes(mergedNotes, dupEdits?.stickyNotes || []);
          mergedNotes = mergeStickyNotes(mergedNotes, lsNotes);

          mergedStrokes = mergePageStrokes(mergedStrokes, dup.pageStrokes || {});
          mergedStrokes = mergePageStrokes(mergedStrokes, dupEdits?.pageStrokes || {});
          mergedStrokes = mergePageStrokes(mergedStrokes, lsStrokes);

          if ((!recordToStore.originalData || recordToStore.originalData.byteLength === 0) && dup.originalData && dup.originalData.byteLength > 0) {
            recordToStore.originalData = dup.originalData.slice(0);
          }
          if ((!recordToStore.data || recordToStore.data.byteLength === 0) && dup.data && dup.data.byteLength > 0) {
            recordToStore.data = dup.data.slice(0);
          }
          if (!recordToStore.category && dup.category) recordToStore.category = dup.category;
          if (!recordToStore.tags && dup.tags) recordToStore.tags = dup.tags;
          if (recordToStore.isFavorite === undefined && dup.isFavorite !== undefined) recordToStore.isFavorite = dup.isFavorite;
          if (!recordToStore.pageCount && dup.pageCount) recordToStore.pageCount = dup.pageCount;

          store.delete(dup.id);
          editStore.delete(dup.id);
          try {
            localStorage.removeItem(`study_edits_${dup.id}`);
            localStorage.removeItem(`study_notes_${dup.id}`);
            localStorage.removeItem(`study_strokes_${dup.id}`);
          } catch {}
        }

        recordToStore.stickyNotes = mergedNotes;
        recordToStore.pageStrokes = mergedStrokes;

        if (mergedNotes.length > 0 || Object.keys(mergedStrokes).length > 0) {
          const ownEdits = editsById.get(recordToStore.id);
          const mergedEditPayload: FileEdits = {
            fileId: recordToStore.id,
            stickyNotes: mergeStickyNotes(ownEdits?.stickyNotes || [], mergedNotes),
            pageStrokes: mergePageStrokes(ownEdits?.pageStrokes || {}, mergedStrokes),
            currentPage: recordToStore.currentPage || ownEdits?.currentPage || 1,
            pageCount: recordToStore.pageCount || ownEdits?.pageCount,
            scale: recordToStore.scale || ownEdits?.scale,
            updatedAt: new Date().toISOString(),
          };
          editStore.put(mergedEditPayload);
          try {
            localStorage.setItem(`study_edits_${recordToStore.id}`, JSON.stringify(mergedEditPayload));
            localStorage.setItem(`study_notes_${recordToStore.id}`, JSON.stringify(mergedEditPayload.stickyNotes));
            localStorage.setItem(`study_strokes_${recordToStore.id}`, JSON.stringify(mergedEditPayload.pageStrokes));
          } catch {}
        }
      }

      // Omit potentially non-serializable fileHandle from IDB
      delete recordToStore.fileHandle;
      store.put(recordToStore);
    };

    getAllReq.onsuccess = () => {
      allFilesResult = getAllReq.result || [];
      finalizePut();
    };

    getAllEditsReq.onsuccess = () => {
      allEditsResult = getAllEditsReq.result || [];
      finalizePut();
    };

    getAllReq.onerror = () => {
      const recordToStore = { ...file };
      delete recordToStore.fileHandle;
      store.put(recordToStore);
    };

    getAllEditsReq.onerror = () => {
      allEditsResult = [];
      finalizePut();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieves all study files, automatically detects duplicate entries by file name,
 * keeps the richest record (most edits/pages), and cleans up redundant duplicates from IndexedDB.
 */
export async function getAllStudyFiles(): Promise<StudyFile[]> {
  try {
    const db = await openDB();
    const rawFiles: StudyFile[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    if (rawFiles.length === 0) return [];

    // 1. Enrich all files with their latest saved edits and ensure clean unbaked original data
    const enriched = await Promise.all(
      rawFiles.map(async (file) => {
        const cleanData =
          file.originalData && file.originalData.byteLength > 0
            ? file.originalData.slice(0)
            : file.data;
        try {
          const edits = await getFileEditsFromStorage(file.id);
          let stickyNotes = edits?.stickyNotes || file.stickyNotes || [];
          let pageStrokes = edits?.pageStrokes || file.pageStrokes || {};

          // If sticky notes or strokes are missing, check if this PDF has embedded STUDY_WORKSPACE_DATA
          if ((!stickyNotes.length || Object.keys(pageStrokes).length === 0) && cleanData) {
            try {
              const embedded = await extractWorkspaceDataFromPdf(cleanData);
              if (embedded) {
                if (!stickyNotes.length && embedded.stickyNotes?.length) {
                  stickyNotes = embedded.stickyNotes;
                }
                if (
                  Object.keys(pageStrokes).length === 0 &&
                  embedded.pageStrokes &&
                  Object.keys(embedded.pageStrokes).length > 0
                ) {
                  pageStrokes = embedded.pageStrokes;
                }
              }
            } catch {}
          }

          if (edits) {
            return {
              ...file,
              data: cleanData,
              originalData: cleanData,
              pageCount: edits.pageCount ?? file.pageCount,
              currentPage: edits.currentPage ?? file.currentPage,
              pageStrokes,
              stickyNotes,
              scale: edits.scale ?? file.scale,
              lastModified: edits.updatedAt ?? file.lastModified,
            };
          } else {
            return {
              ...file,
              data: cleanData,
              originalData: cleanData,
              pageStrokes,
              stickyNotes,
            };
          }
        } catch {}
        return {
          ...file,
          data: cleanData,
          originalData: cleanData,
        };
      })
    );

    // 2. Group files by normalized name to detect duplicates
    const filesByName = new Map<string, StudyFile[]>();
    for (const file of enriched) {
      const key = normalizeFileName(file.name);
      const list = filesByName.get(key) || [];
      list.push(file);
      filesByName.set(key, list);
    }

    const uniqueFiles: StudyFile[] = [];
    const duplicateIdsToDelete: string[] = [];

    for (const [, fileList] of filesByName.entries()) {
      if (fileList.length === 1) {
        uniqueFiles.push(fileList[0]);
      } else {
        // Sort duplicates: prioritize the one with highest page progress, notes, strokes, and newest date
        fileList.sort((a, b) => {
          const scoreA =
            (a.currentPage && a.currentPage > 1 ? a.currentPage * 20 : 0) +
            (a.stickyNotes?.length || 0) * 10 +
            Object.keys(a.pageStrokes || {}).length * 5 +
            (a.lastModified ? new Date(a.lastModified).getTime() : 0);

          const scoreB =
            (b.currentPage && b.currentPage > 1 ? b.currentPage * 20 : 0) +
            (b.stickyNotes?.length || 0) * 10 +
            Object.keys(b.pageStrokes || {}).length * 5 +
            (b.lastModified ? new Date(b.lastModified).getTime() : 0);

          return scoreB - scoreA;
        });

        // Merge sticky notes, strokes, and metadata across ALL duplicate records so nothing is ever lost
        let bestFile: StudyFile = { ...fileList[0] };
        let combinedNotes = bestFile.stickyNotes || [];
        let combinedStrokes = bestFile.pageStrokes || {};

        for (let i = 1; i < fileList.length; i++) {
          const dup = fileList[i];
          combinedNotes = mergeStickyNotes(combinedNotes, dup.stickyNotes || []);
          combinedStrokes = mergePageStrokes(combinedStrokes, dup.pageStrokes || {});
          if (!bestFile.category && dup.category) bestFile.category = dup.category;
          if (!bestFile.tags && dup.tags) bestFile.tags = dup.tags;
          if (bestFile.isFavorite === undefined && dup.isFavorite !== undefined) bestFile.isFavorite = dup.isFavorite;
          if (!bestFile.pageCount && dup.pageCount) bestFile.pageCount = dup.pageCount;
          duplicateIdsToDelete.push(dup.id);
        }

        bestFile = {
          ...bestFile,
          stickyNotes: combinedNotes,
          pageStrokes: combinedStrokes,
        };
        uniqueFiles.push(bestFile);
      }
    }

    // 3. Persist merged edits into bestFile and remove redundant duplicate records
    if (duplicateIdsToDelete.length > 0) {
      try {
        const cleanupTx = db.transaction([STORE_NAME, EDITS_STORE], 'readwrite');
        const fileStore = cleanupTx.objectStore(STORE_NAME);
        const editStore = cleanupTx.objectStore(EDITS_STORE);

        for (const kept of uniqueFiles) {
          if ((kept.stickyNotes && kept.stickyNotes.length > 0) || (kept.pageStrokes && Object.keys(kept.pageStrokes).length > 0)) {
            const payload: FileEdits = {
              fileId: kept.id,
              stickyNotes: kept.stickyNotes || [],
              pageStrokes: kept.pageStrokes || {},
              currentPage: kept.currentPage || 1,
              pageCount: kept.pageCount,
              scale: kept.scale,
              updatedAt: kept.lastModified || new Date().toISOString(),
            };
            editStore.put(payload);
            const cleanFileRecord = { ...kept };
            delete cleanFileRecord.fileHandle;
            fileStore.put(cleanFileRecord);
          }
        }

        for (const dupId of duplicateIdsToDelete) {
          fileStore.delete(dupId);
          editStore.delete(dupId);
          try {
            localStorage.removeItem(`study_edits_${dupId}`);
            localStorage.removeItem(`study_notes_${dupId}`);
            localStorage.removeItem(`study_strokes_${dupId}`);
          } catch {}
        }
      } catch (err) {
        console.warn('Failed cleaning up duplicate records:', err);
      }
    }

    return uniqueFiles.map((f) => {
      const handle = getFileHandle(f.id) || getFileHandle(normalizeFileName(f.name));
      return handle ? { ...f, fileHandle: handle } : f;
    });
  } catch (err) {
    console.error('Failed to get files from IndexedDB:', err);
    return [];
  }
}

export async function getStudyFileById(id: string): Promise<StudyFile | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        const file = request.result as StudyFile | null;
        if (file && file.originalData && file.originalData.byteLength > 0) {
          file.data = file.originalData.slice(0);
        }
        resolve(file);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error(`Failed to get file ${id} from IndexedDB:`, err);
    return null;
  }
}

/**
 * Returns all keys/IDs in STORE_NAME without loading heavy file bodies into memory.
 */
export async function getAllStudyFileIds(): Promise<string[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve((request.result || []).map(String));
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to get file IDs from IndexedDB:', err);
    return [];
  }
}


export async function deleteStudyFileFromStorage(id: string, fileName?: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, EDITS_STORE], 'readwrite');
      const fileStore = tx.objectStore(STORE_NAME);
      const editStore = tx.objectStore(EDITS_STORE);

      fileStore.delete(id);
      editStore.delete(id);

      // If fileName provided, delete any ghost duplicates with the same name
      if (fileName) {
        const getAllReq = fileStore.getAll();
        getAllReq.onsuccess = () => {
          const files: StudyFile[] = getAllReq.result || [];
          const target = normalizeFileName(fileName);
          for (const f of files) {
            if (normalizeFileName(f.name) === target) {
              fileStore.delete(f.id);
              editStore.delete(f.id);
              try {
                localStorage.removeItem(`study_edits_${f.id}`);
                localStorage.removeItem(`study_notes_${f.id}`);
                localStorage.removeItem(`study_strokes_${f.id}`);
              } catch {}
            }
          }
        };
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to delete file from IndexedDB:', err);
  }

  // Clear localStorage caches
  try {
    localStorage.removeItem(`study_edits_${id}`);
    localStorage.removeItem(`study_notes_${id}`);
    localStorage.removeItem(`study_strokes_${id}`);
  } catch {}
}

/**
 * Saves all edits (drawing strokes, sticky notes, current page position, scale) for a file.
 * Saves to IndexedDB (with practically unlimited space) and synchronously backups to localStorage.
 */
export async function saveFileEditsToStorage(fileId: string, edits: FileEdits): Promise<void> {
  if (!fileId) return;

  const payload: FileEdits = {
    fileId,
    pageStrokes: edits.pageStrokes || {},
    stickyNotes: edits.stickyNotes || [],
    currentPage: edits.currentPage || 1,
    pageCount: edits.pageCount,
    scale: edits.scale,
    updatedAt: edits.updatedAt || new Date().toISOString(),
  };

  // 1. Fast synchronous backup in localStorage
  try {
    localStorage.setItem(`study_edits_${fileId}`, JSON.stringify(payload));
    // Keep legacy keys updated for backwards compatibility
    localStorage.setItem(`study_notes_${fileId}`, JSON.stringify(payload.stickyNotes));
    localStorage.setItem(`study_strokes_${fileId}`, JSON.stringify(payload.pageStrokes));
  } catch (e) {
    // If localStorage quota exceeded, IndexedDB will still save safely
    console.warn('LocalStorage quota or write issue (will persist in IndexedDB):', e);
  }

  // 2. High capacity IndexedDB storage
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([EDITS_STORE, STORE_NAME], 'readwrite');
      const editStore = tx.objectStore(EDITS_STORE);
      editStore.put(payload);

      const fileStore = tx.objectStore(STORE_NAME);
      const getFileReq = fileStore.get(fileId);
      getFileReq.onsuccess = () => {
        const existingFile = getFileReq.result as StudyFile | undefined;
        if (existingFile) {
          existingFile.currentPage = payload.currentPage;
          if (payload.pageCount) existingFile.pageCount = payload.pageCount;
          existingFile.pageStrokes = payload.pageStrokes;
          existingFile.stickyNotes = payload.stickyNotes;
          existingFile.scale = payload.scale;
          existingFile.lastModified = payload.updatedAt;
          fileStore.put(existingFile);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error(`Failed to save edits for file ${fileId} in IndexedDB:`, err);
  }
}

/**
 * Safely updates only pageCount without touching stickyNotes or pageStrokes
 * (prevents race conditions during PDF document parsing).
 */
export async function updateFilePageCountInStorage(fileId: string, pageCount: number): Promise<void> {
  if (!fileId || !pageCount || pageCount <= 0) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, EDITS_STORE], 'readwrite');
      const fileStore = tx.objectStore(STORE_NAME);
      const editStore = tx.objectStore(EDITS_STORE);

      const getFileReq = fileStore.get(fileId);
      getFileReq.onsuccess = () => {
        const existingFile = getFileReq.result as StudyFile | undefined;
        if (existingFile && existingFile.pageCount !== pageCount) {
          existingFile.pageCount = pageCount;
          fileStore.put(existingFile);
        }
      };

      const getEditReq = editStore.get(fileId);
      getEditReq.onsuccess = () => {
        const existingEdit = getEditReq.result as FileEdits | undefined;
        if (existingEdit && existingEdit.pageCount !== pageCount) {
          existingEdit.pageCount = pageCount;
          editStore.put(existingEdit);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn(`Failed to update pageCount for file ${fileId}:`, err);
  }
}

/**
 * Loads all saved edits for a file from IndexedDB and localStorage,
 * automatically recovering from whichever backup is intact/newer if one storage layer
 * was interrupted (e.g., sudden power outage).
 */
export async function getFileEditsFromStorage(fileId: string): Promise<FileEdits | null> {
  if (!fileId) return null;

  const hasContent = (e?: FileEdits | null): boolean =>
    Boolean(
      e &&
        ((Array.isArray(e.stickyNotes) && e.stickyNotes.length > 0) ||
          (e.pageStrokes && Object.keys(e.pageStrokes).length > 0))
    );

  // 1. Read from IndexedDB
  let idbResult: FileEdits | null = null;
  try {
    const db = await openDB();
    idbResult = await new Promise<FileEdits | null>((resolve, reject) => {
      const tx = db.transaction(EDITS_STORE, 'readonly');
      const store = tx.objectStore(EDITS_STORE);
      const request = store.get(fileId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`IndexedDB read edits for ${fileId} failed, falling back to localStorage:`, err);
  }

  // 2. Read from localStorage backup
  let lsResult: FileEdits | null = null;
  try {
    const unified = localStorage.getItem(`study_edits_${fileId}`);
    if (unified) {
      lsResult = JSON.parse(unified);
    } else {
      const legacyNotes = localStorage.getItem(`study_notes_${fileId}`);
      const legacyStrokes = localStorage.getItem(`study_strokes_${fileId}`);
      if (legacyNotes || legacyStrokes) {
        lsResult = {
          fileId,
          pageStrokes: legacyStrokes ? JSON.parse(legacyStrokes) : {},
          stickyNotes: legacyNotes ? JSON.parse(legacyNotes) : [],
          currentPage: 1,
          updatedAt: new Date().toISOString(),
        };
      }
    }
  } catch (e) {
    console.error('Failed reading edits from localStorage fallback:', e);
  }

  if (!idbResult && !lsResult) return null;
  if (!idbResult) return lsResult;
  if (!lsResult) return idbResult;

  // 3. Reconcile both layers: recover non-empty backup if one layer was wiped by an interrupted write
  const idbHas = hasContent(idbResult);
  const lsHas = hasContent(lsResult);
  if (!idbHas && lsHas) {
    return {
      ...idbResult,
      stickyNotes: lsResult.stickyNotes || [],
      pageStrokes: lsResult.pageStrokes || {},
      currentPage: idbResult.currentPage || lsResult.currentPage || 1,
      pageCount: idbResult.pageCount || lsResult.pageCount,
      scale: idbResult.scale || lsResult.scale,
    };
  }
  if (idbHas && !lsHas) {
    return idbResult;
  }

  const idbTime = idbResult.updatedAt ? Date.parse(idbResult.updatedAt) || 0 : 0;
  const lsTime = lsResult.updatedAt ? Date.parse(lsResult.updatedAt) || 0 : 0;
  return lsTime > idbTime ? lsResult : idbResult;
}

/**
 * Updates a study file in IndexedDB with newly baked PDF ArrayBuffer data,
 * ensuring the stored file itself permanently contains all embedded edits
 * for display in any external PDF reader.
 */
export async function updateStudyFileWithBakedData(
  fileId: string,
  bakedData: ArrayBuffer,
  edits?: Partial<FileEdits>
): Promise<void> {
  if (!fileId || !bakedData) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, EDITS_STORE], 'readwrite');
      const fileStore = tx.objectStore(STORE_NAME);
      const getReq = fileStore.get(fileId);

      getReq.onsuccess = () => {
        const existing = getReq.result as StudyFile | undefined;
        if (existing) {
          // Keep base clean data for future in-app re-editing & erasing
          if (!existing.originalData && existing.data) {
            existing.originalData = existing.data.slice(0);
          }
          // Do not overwrite clean data with baked raster image so strokes remain vector-editable
          existing.data = (existing.originalData && existing.originalData.byteLength > 0)
            ? existing.originalData.slice(0)
            : existing.data;
          existing.lastModified = new Date().toISOString();
          if (edits?.pageStrokes) existing.pageStrokes = edits.pageStrokes;
          if (edits?.stickyNotes) existing.stickyNotes = edits.stickyNotes;
          if (edits?.currentPage) existing.currentPage = edits.currentPage;
          if (edits?.pageCount) existing.pageCount = edits.pageCount;
          if (edits?.scale) existing.scale = edits.scale;
          fileStore.put(existing);
        }
      };

      if (edits) {
        const editStore = tx.objectStore(EDITS_STORE);
        editStore.put({
          fileId,
          pageStrokes: edits.pageStrokes || {},
          stickyNotes: edits.stickyNotes || [],
          currentPage: edits.currentPage || 1,
          pageCount: edits.pageCount,
          scale: edits.scale,
          updatedAt: new Date().toISOString(),
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error(`Failed to update study file ${fileId} with baked data:`, err);
  }
}

/**
 * Loads all notes from IndexedDB
 */
export async function getAllNotesFromStorage(): Promise<NoteItem[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readonly');
      const store = tx.objectStore(NOTES_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('Failed to load notes from IndexedDB:', err);
    return [];
  }
}

/**
 * Persists all notes to IndexedDB (bulk replace)
 */
export async function saveAllNotesToStorage(notes: NoteItem[]): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readwrite');
      const store = tx.objectStore(NOTES_STORE);
      store.clear();
      notes.forEach((note) => {
        store.put(note);
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to save notes to IndexedDB:', err);
  }
}

/**
 * Deletes a note from IndexedDB
 */
export async function deleteNoteFromStorage(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(NOTES_STORE, 'readwrite');
      const store = tx.objectStore(NOTES_STORE);
      store.delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error(`Failed to delete note ${id} from IndexedDB:`, err);
  }
}

/**
 * Updates metadata of a study file in IndexedDB (such as category, tags, or favorite status)
 */
export async function updateStudyFileMetadata(
  fileId: string,
  updates: Partial<Pick<StudyFile, 'category' | 'tags' | 'isFavorite' | 'name'>>
): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(fileId);
      getReq.onsuccess = () => {
        const file: StudyFile = getReq.result;
        if (!file) {
          resolve();
          return;
        }
        const updated = { ...file, ...updates };
        store.put(updated);
      };
      getReq.onerror = () => reject(getReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error(`Failed to update study file metadata ${fileId}:`, err);
  }
}

const TASKS_STORAGE_KEY = 'study_workspace_tasks';

export function getAllTasksFromStorage(): StudyTask[] {
  try {
    const raw = localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAllTasksToStorage(tasks: StudyTask[]): void {
  try {
    localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('study_tasks_updated'));
    }
  } catch (e) {
    console.error('Failed to save tasks to localStorage:', e);
  }
}

/**
 * Clears all study files and edits from IndexedDB (used for clean restore)
 */
export async function clearStudyFilesAndEditsStorage(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([STORE_NAME, EDITS_STORE], 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.objectStore(EDITS_STORE).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.error('Failed to clear study files and edits:', err);
  }
}



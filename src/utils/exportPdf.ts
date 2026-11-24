import {
  PDFDocument,
  rgb,
  PDFName,
  PDFHexString,
  LineCapStyle,
  BlendMode,
} from 'pdf-lib';
import { DrawingStroke, StickyNoteItem } from '../types';
import { htmlToCleanPlainText } from './richPaste';

export interface ExportAnnotatedPdfOptions {
  pdfData: ArrayBuffer;
  fileName: string;
  pageStrokes: Record<number, DrawingStroke[]>;
  stickyNotes: StickyNoteItem[];
  fileId?: string;
}

/**
 * Parses color strings (hex, rgb, rgba, named) into normalized 0-1 values for pdf-lib rgb()
 */
function parseColorToRgb(colorStr: string) {
  if (!colorStr) return rgb(0.15, 0.15, 0.15);

  const clean = colorStr.trim().toLowerCase();

  // Hex colors #fff or #ffffff or with alpha #ffffffff
  if (clean.startsWith('#')) {
    let hex = clean.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      const r = parseInt(hex.substring(0, 2), 16) / 255;
      const g = parseInt(hex.substring(2, 4), 16) / 255;
      const b = parseInt(hex.substring(4, 6), 16) / 255;
      return rgb(
        isNaN(r) ? 0.1 : Math.max(0, Math.min(1, r)),
        isNaN(g) ? 0.1 : Math.max(0, Math.min(1, g)),
        isNaN(b) ? 0.1 : Math.max(0, Math.min(1, b))
      );
    }
  }

  // rgb/rgba string: rgba(250, 204, 21, 0.5)
  const rgbMatch = clean.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10) / 255;
    const g = parseInt(rgbMatch[2], 10) / 255;
    const b = parseInt(rgbMatch[3], 10) / 255;
    return rgb(
      isNaN(r) ? 0.1 : Math.max(0, Math.min(1, r)),
      isNaN(g) ? 0.1 : Math.max(0, Math.min(1, g)),
      isNaN(b) ? 0.1 : Math.max(0, Math.min(1, b))
    );
  }

  // Named color fallbacks
  if (clean.includes('yellow')) return rgb(0.98, 0.82, 0.08);
  if (clean.includes('green') || clean.includes('emerald')) return rgb(0.18, 0.8, 0.44);
  if (clean.includes('blue') || clean.includes('cyan')) return rgb(0.14, 0.54, 0.95);
  if (clean.includes('pink') || clean.includes('rose')) return rgb(0.96, 0.35, 0.62);
  if (clean.includes('orange') || clean.includes('amber')) return rgb(0.98, 0.55, 0.15);
  if (clean.includes('purple') || clean.includes('violet')) return rgb(0.66, 0.38, 0.96);
  if (clean.includes('red')) return rgb(0.92, 0.23, 0.23);

  return rgb(0.15, 0.15, 0.15);
}

/**
 * Maps screen coordinates (origin at top-left, Y going down) to raw PDF coordinates
 * taking into account page dimensions and page rotation (0, 90, 180, 270 deg).
 */
function transformPointToPdf(
  pt: { x: number; y: number },
  pageWidth: number,
  pageHeight: number,
  rotation: number
): { x: number; y: number } {
  const normAngle = ((rotation % 360) + 360) % 360;
  if (normAngle === 90) {
    // Screen width is pageHeight, screen height is pageWidth
    return {
      x: Math.max(0, Math.min(pageWidth, pt.y)),
      y: Math.max(0, Math.min(pageHeight, pt.x)),
    };
  } else if (normAngle === 180) {
    return {
      x: Math.max(0, Math.min(pageWidth, pageWidth - pt.x)),
      y: Math.max(0, Math.min(pageHeight, pt.y)),
    };
  } else if (normAngle === 270) {
    return {
      x: Math.max(0, Math.min(pageWidth, pageWidth - pt.y)),
      y: Math.max(0, Math.min(pageHeight, pageHeight - pt.x)),
    };
  }
  // normAngle === 0 (standard)
  return {
    x: Math.max(0, Math.min(pageWidth, pt.x)),
    y: Math.max(0, Math.min(pageHeight, pageHeight - pt.y)),
  };
}

/**
 * Extracts embedded study workspace data (strokes, sticky notes) from a PDF.
 */
export async function extractWorkspaceDataFromPdf(pdfBuffer: ArrayBuffer): Promise<{
  pageStrokes?: Record<number, DrawingStroke[]>;
  stickyNotes?: StickyNoteItem[];
  fileName?: string;
  fileId?: string;
} | null> {
  try {
    if (!pdfBuffer || pdfBuffer.byteLength < 100) return null;
    const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });

    let base64 = '';
    const subject = pdfDoc.getSubject() || '';
    if (subject.startsWith('STUDY_WORKSPACE_DATA:')) {
      base64 = subject.slice('STUDY_WORKSPACE_DATA:'.length).trim();
    } else {
      const keywordsRaw: any = pdfDoc.getKeywords();
      if (typeof keywordsRaw === 'string') {
        const found = keywordsRaw.split(';').map((s: string) => s.trim()).find((k: string) => k.startsWith('STUDY_DATA:'));
        if (found) base64 = found.slice('STUDY_DATA:'.length).trim();
      } else if (Array.isArray(keywordsRaw)) {
        const found = keywordsRaw.find((k: any) => typeof k === 'string' && k.startsWith('STUDY_DATA:'));
        if (found) base64 = found.slice('STUDY_DATA:'.length).trim();
      }
    }

    if (!base64) return null;

    const jsonStr = decodeURIComponent(escape(atob(base64)));
    const parsed = JSON.parse(jsonStr);

    return {
      pageStrokes: parsed.pageStrokes || {},
      stickyNotes: parsed.stickyNotes || [],
      fileName: parsed.fileName,
      fileId: parsed.fileId,
    };
  } catch (err) {
    console.warn('Could not extract workspace data from PDF:', err);
    return null;
  }
}

/**
 * Bakes canvas drawings (pens, highlighters, ruler lines) and sticky notes into a downloadable PDF.
 * - Highlighters use BlendMode.Multiply so text underneath remains 100% visible and crisp in all PDF readers.
 * - Single-pass SVG vector paths with (x: 0, y: height) accurately position strokes on the page without opacity overlap.
 * - Rotated pages (0, 90, 180, 270) are handled gracefully.
 * - Sticky notes are burned with both visible visual badges and native ISO 32000 PDF Text Annotations (UTF-16BE Persian comments).
 * - Metadata is preserved so the file remains interactive when reopened in Study Space.
 */
export async function exportAnnotatedPdf(options: ExportAnnotatedPdfOptions): Promise<void> {
  const { pdfData, fileName, pageStrokes, stickyNotes, fileId } = options;

  if (!pdfData || pdfData.byteLength === 0) {
    throw new Error('فایل PDF نامعتبر است یا داده‌ای وجود ندارد.');
  }

  // Load existing PDF
  const pdfDoc = await PDFDocument.load(pdfData, { ignoreEncryption: true });
  const pages = pdfDoc.getPages();

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const pageNumber = pageIdx + 1;
    const page = pages[pageIdx];
    const { width, height } = page.getSize();
    const rawRotation = page.getRotation().angle || 0;
    const rotation = ((rawRotation % 360) + 360) % 360;

    // 1. Draw strokes (Highlighter, Pen, Ruler)
    const strokes = pageStrokes[pageNumber] || [];
    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length === 0) continue;

      const isHighlighter = stroke.tool === 'highlighter';
      const strokeColor = parseColorToRgb(stroke.color);
      const thickness = stroke.width || (isHighlighter ? 18 : 2.5);

      // Highlighters default to 0.45 opacity with Multiply blend; pens default to 1.0 or custom opacity
      const strokeOpacity =
        stroke.opacity !== undefined
          ? stroke.opacity
          : isHighlighter
          ? 0.45
          : 1.0;

      const blendMode = isHighlighter ? BlendMode.Multiply : BlendMode.Normal;

      if (stroke.points.length === 1) {
        // Single dot
        const pt = transformPointToPdf(stroke.points[0], width, height, rotation);
        page.drawCircle({
          x: pt.x,
          y: pt.y,
          size: Math.max(1, thickness / 2),
          color: strokeColor,
          opacity: strokeOpacity,
          blendMode,
        });
      } else if (rotation === 0) {
        // Standard unrotated page: Use single-pass SVG path with x: 0, y: height.
        // In pdf-lib, drawSvgPath with (x: 0, y: height) translates to top-left and flips Y,
        // so SVG coordinates (px, py) directly map to (px, height - py) in PDF space!
        let pathData = `M ${stroke.points[0].x.toFixed(2)} ${stroke.points[0].y.toFixed(2)}`;
        for (let i = 1; i < stroke.points.length; i++) {
          const pt = stroke.points[i];
          pathData += ` L ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
        }

        try {
          page.drawSvgPath(pathData, {
            x: 0,
            y: height,
            borderColor: strokeColor,
            borderWidth: thickness,
            borderOpacity: strokeOpacity,
            borderLineCap: LineCapStyle.Round,
            blendMode,
          });
        } catch (svgErr) {
          // Fallback: draw line segments with explicit PDF coordinates
          for (let i = 0; i < stroke.points.length - 1; i++) {
            const p1 = stroke.points[i];
            const p2 = stroke.points[i + 1];
            page.drawLine({
              start: {
                x: Math.max(0, Math.min(width, p1.x)),
                y: Math.max(0, Math.min(height, height - p1.y)),
              },
              end: {
                x: Math.max(0, Math.min(width, p2.x)),
                y: Math.max(0, Math.min(height, height - p2.y)),
              },
              thickness,
              color: strokeColor,
              opacity: strokeOpacity,
              lineCap: LineCapStyle.Round,
              blendMode,
            });
          }
        }
      } else {
        // Rotated page (90, 180, 270): map points individually and draw continuous line segments
        for (let i = 0; i < stroke.points.length - 1; i++) {
          const pt1 = transformPointToPdf(stroke.points[i], width, height, rotation);
          const pt2 = transformPointToPdf(stroke.points[i + 1], width, height, rotation);
          page.drawLine({
            start: { x: pt1.x, y: pt1.y },
            end: { x: pt2.x, y: pt2.y },
            thickness,
            color: strokeColor,
            opacity: strokeOpacity,
            lineCap: LineCapStyle.Round,
            blendMode,
          });
        }
      }
    }

    // 2. Render Sticky Notes: Visual Badge + Native PDF Text Annotation (UTF-16BE Unicode)
    const notesForPage = (stickyNotes || []).filter((n) => n.pageNumber === pageNumber);
    for (const note of notesForPage) {
      const badgeSize = 24;
      // In app, note.x & note.y represent the center point of the note on screen
      const screenLeft = note.x - badgeSize / 2;
      const screenTop = note.y - badgeSize / 2;

      const pdfPt = transformPointToPdf(
        { x: screenLeft, y: screenTop },
        width,
        height,
        rotation
      );

      const badgeX = Math.max(4, Math.min(width - badgeSize - 4, pdfPt.x));
      const badgeY = Math.max(4, Math.min(height - badgeSize - 4, pdfPt.y - badgeSize));

      const noteBg = parseColorToRgb(note.color || '#fef08a');
      const noteBorder = rgb(
        Math.max(0, noteBg.red * 0.72),
        Math.max(0, noteBg.green * 0.72),
        Math.max(0, noteBg.blue * 0.72)
      );

      // A. Visible vector note card badge on page (displays even in basic viewers or when printed)
      page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeSize,
        height: badgeSize,
        color: noteBg,
        borderColor: noteBorder,
        borderWidth: 1.2,
        opacity: 0.95,
      });

      // Mini note paper lines
      page.drawLine({
        start: { x: badgeX + 4, y: badgeY + badgeSize - 6 },
        end: { x: badgeX + badgeSize - 4, y: badgeY + badgeSize - 6 },
        thickness: 1.2,
        color: noteBorder,
        opacity: 0.8,
      });
      page.drawLine({
        start: { x: badgeX + 4, y: badgeY + badgeSize - 11 },
        end: { x: badgeX + badgeSize - 6, y: badgeY + badgeSize - 11 },
        thickness: 1.2,
        color: noteBorder,
        opacity: 0.6,
      });
      page.drawLine({
        start: { x: badgeX + 4, y: badgeY + badgeSize - 16 },
        end: { x: badgeX + badgeSize - 8, y: badgeY + badgeSize - 16 },
        thickness: 1.2,
        color: noteBorder,
        opacity: 0.4,
      });

      // B. Standard native PDF Text Annotation (Universal comment in Adobe Acrobat, Foxit, Preview, Edge, Chrome)
      try {
        const plainBody = htmlToCleanPlainText(note.content || '');
        const fullContent = [note.title, plainBody].filter(Boolean).join('\n\n');
        const annot = pdfDoc.context.obj({
          Type: PDFName.of('Annot'),
          Subtype: PDFName.of('Text'),
          Rect: [badgeX, badgeY, badgeX + badgeSize, badgeY + badgeSize],
          Contents: PDFHexString.fromText(fullContent || 'یادداشت مطالعه'),
          T: PDFHexString.fromText(note.title || 'یادداشت مطالعه'),
          Name: PDFName.of('Comment'),
          F: 4, // Print flag
          C: [noteBg.red, noteBg.green, noteBg.blue],
        });
        const annotRef = pdfDoc.context.register(annot);
        const annotsKey = PDFName.of('Annots');
        const existingAnnots = page.node.get(annotsKey);
        if (existingAnnots) {
          (existingAnnots as any).push(annotRef);
        } else {
          page.node.set(annotsKey, pdfDoc.context.obj([annotRef]));
        }
      } catch (annotErr) {
        console.warn('Could not register native PDF annotation:', annotErr);
      }
    }
  }

  // 3. Embed structured workspace metadata inside PDF Subject & Keywords for Study Space
  try {
    const workspaceMeta = {
      version: 2,
      fileId: fileId || `study_${Date.now()}`,
      fileName,
      exportedAt: new Date().toISOString(),
      pageStrokes: pageStrokes || {},
      stickyNotes: stickyNotes || [],
    };
    const jsonStr = JSON.stringify(workspaceMeta);
    const base64Data = btoa(unescape(encodeURIComponent(jsonStr)));
    pdfDoc.setSubject(`STUDY_WORKSPACE_DATA:${base64Data}`);
    pdfDoc.setKeywords([`STUDY_DATA:${base64Data}`]);
  } catch (err) {
    console.warn('Failed to embed workspace metadata in PDF:', err);
  }

  // 4. Generate downloadable blob and trigger download
  const modifiedPdfBytes = await pdfDoc.save();
  const blob = new Blob([modifiedPdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const downloadUrl = URL.createObjectURL(blob);

  const cleanName = fileName?.toLowerCase().endsWith('.pdf')
    ? fileName
    : `${fileName || 'Study-Document'}.pdf`;

  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = cleanName;
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    if (document.body.contains(link)) {
      document.body.removeChild(link);
    }
    URL.revokeObjectURL(downloadUrl);
  }, 2000);
}

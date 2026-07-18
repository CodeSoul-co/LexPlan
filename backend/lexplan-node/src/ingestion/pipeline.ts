import type {
  LegalStudyChapter,
  LegalStudyContentSlice,
  LegalStudyLearningSnapshot,
  LegalStudyTextbook,
} from '../types';
import { OcrProvider } from './ocr';
import { DeterministicCardGenerationProvider } from './card-generation';
import type {
  LegalStudyCardGenerationProvider,
  LegalStudyIngestionInput,
  LegalStudyIngestionReport,
  LegalStudyOcrProvider,
  LegalStudyOcrResult,
} from './types';

export interface LegalStudyIngestionOptions {
  ocrProvider?: LegalStudyOcrProvider;
  cardGenerationProvider?: LegalStudyCardGenerationProvider;
}

export async function runTextbookIngestion(
  snapshot: LegalStudyLearningSnapshot,
  input: LegalStudyIngestionInput,
  options: LegalStudyIngestionOptions = {}
): Promise<{ snapshot: LegalStudyLearningSnapshot; report: LegalStudyIngestionReport }> {
  const now = input.now ?? new Date().toISOString();
  const ocrProvider = options.ocrProvider ?? new OcrProvider();
  const cardGenerationProvider =
    options.cardGenerationProvider ?? new DeterministicCardGenerationProvider();
  const textbook = upsertTextbook(snapshot, input, now);
  const ocr = await ocrProvider.recognize({
    textbookId: textbook.id,
    fileName: input.fileName,
    fileRef: input.fileRef,
    filePath: input.filePath,
    mimeType: input.mimeType,
    text: input.text,
    pages: input.pages,
  });

  if (ocr.status === 'failed') {
    return {
      snapshot: replaceTextbook(snapshot, { ...textbook, ocrStatus: 'failed', updatedAt: now }),
      report: {
        textbookId: textbook.id,
        ocrStatus: 'failed',
        chaptersDetected: 0,
        slicesCreated: 0,
        cardsGenerated: 0,
        cardsPendingConfirmation: 0,
        provider: { ocr: ocr.provider, cardGeneration: cardGenerationProvider.id },
        errors: [ocr.error ?? 'OCR failed.'],
      },
    };
  }

  const chapters = detectChapters(input.userId, textbook, ocr, now);
  const slices = createSlices(input.userId, chapters, ocr, now);
  const subject = snapshot.subjects.find((candidate) => candidate.id === input.subjectId);
  if (!subject) {
    throw new Error(`Subject not found: ${input.subjectId}`);
  }
  const cards = (
    await Promise.all(
      slices.map((slice) => {
        const chapter = chapters.find((candidate) => candidate.id === slice.chapterId);
        const sourceText = textForSlice(slice, ocr);
        if (!chapter) return [];
        return cardGenerationProvider.generateCards({
          userId: input.userId,
          subject,
          textbook,
          chapter,
          slice,
          sourceText,
          now,
        });
      })
    )
  ).flat();
  const normalizedCards = cards.map((card) => ({
    ...card,
    status: input.confirmCards ? ('confirmed' as const) : card.status,
  }));

  const nextSnapshot: LegalStudyLearningSnapshot = {
    ...snapshot,
    capturedAt: now,
    textbooks: upsertById(snapshot.textbooks, { ...textbook, ocrStatus: 'succeeded', updatedAt: now }),
    chapters: mergeNewById(snapshot.chapters, chapters),
    contentSlices: mergeNewById(snapshot.contentSlices ?? [], slices),
    cards: mergeNewById(snapshot.cards, normalizedCards),
  };

  return {
    snapshot: nextSnapshot,
    report: {
      textbookId: textbook.id,
      ocrStatus: 'succeeded',
      chaptersDetected: chapters.length,
      slicesCreated: slices.length,
      cardsGenerated: normalizedCards.length,
      cardsPendingConfirmation: normalizedCards.filter((card) => card.status === 'pending_confirmation').length,
      provider: { ocr: ocr.provider, cardGeneration: cardGenerationProvider.id },
      errors: [],
    },
  };
}

function upsertTextbook(
  snapshot: LegalStudyLearningSnapshot,
  input: LegalStudyIngestionInput,
  now: string
): LegalStudyTextbook {
  const existing = input.textbookId
    ? snapshot.textbooks.find((candidate) => candidate.id === input.textbookId)
    : undefined;
  if (existing) return { ...existing, title: input.textbookTitle, ocrStatus: 'running', updatedAt: now };
  return {
    id: input.textbookId ?? `textbook-${slug(input.textbookTitle)}`,
    userId: input.userId,
    subjectId: input.subjectId,
    title: input.textbookTitle,
    fileRef: input.fileName ? `upload://${input.fileName}` : undefined,
    ocrStatus: 'running',
    createdAt: now,
  };
}

function replaceTextbook(
  snapshot: LegalStudyLearningSnapshot,
  textbook: LegalStudyTextbook
): LegalStudyLearningSnapshot {
  return {
    ...snapshot,
    textbooks: upsertById(snapshot.textbooks, textbook),
  };
}

function detectChapters(
  userId: string,
  textbook: LegalStudyTextbook,
  ocr: LegalStudyOcrResult,
  now: string
): LegalStudyChapter[] {
  const raw = ocr.pages.map((page) => page.text).join('\n');
  const headingMatches = Array.from(raw.matchAll(/^第[一二三四五六七八九十百0-9]+[章节编]\s*([^\n]+)|^#{1,3}\s*([^\n]+)/gim));
  const titles = headingMatches.map((match) => (match[1] ?? match[2] ?? '').trim()).filter(Boolean);
  const fallbackTitles = titles.length ? titles : [textbook.title.replace(/考试分析|教材/g, '').trim() || '核心章节'];
  return fallbackTitles.slice(0, 8).map((title, index) => ({
    id: `chapter-${textbook.id}-${index + 1}-${slug(title)}`,
    userId,
    textbookId: textbook.id,
    title,
    order: index + 1,
    pageStart: Math.min(index + 1, Math.max(1, ocr.pages.length)),
    pageEnd: Math.min(index + 1, Math.max(1, ocr.pages.length)),
    createdAt: now,
  }));
}

function createSlices(
  userId: string,
  chapters: LegalStudyChapter[],
  ocr: LegalStudyOcrResult,
  now: string
): LegalStudyContentSlice[] {
  const fullText = ocr.pages.map((page) => page.text).join('\n\n');
  return chapters.map((chapter, index) => {
    const page = ocr.pages[index] ?? ocr.pages[0];
    const text = page?.text ?? fullText;
    return {
      id: `slice-${chapter.id}-1`,
      userId,
      chapterId: chapter.id,
      sourceTextRef: `ocr://${ocr.textbookId}/page/${page?.pageNumber ?? 1}`,
      pageStart: page?.pageNumber ?? chapter.pageStart,
      pageEnd: page?.pageNumber ?? chapter.pageEnd,
      textHash: stableHash(`${chapter.title}:${text}`),
      createdAt: now,
    };
  });
}

function textForSlice(slice: LegalStudyContentSlice, ocr: LegalStudyOcrResult): string {
  const pageNumber = slice.pageStart ?? 1;
  return ocr.pages.find((page) => page.pageNumber === pageNumber)?.text ?? ocr.pages[0]?.text ?? '';
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((candidate) => candidate.id === item.id);
  if (index < 0) return [...items, item];
  return items.map((candidate) => (candidate.id === item.id ? item : candidate));
}

function mergeNewById<T extends { id: string }>(items: T[], nextItems: T[]): T[] {
  let result = [...items];
  for (const item of nextItems) {
    result = upsertById(result, item);
  }
  return result;
}

function slug(value: string): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return ascii || 'item';
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `hash-${(hash >>> 0).toString(36)}`;
}

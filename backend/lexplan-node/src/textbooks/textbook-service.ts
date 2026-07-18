import {
  DeepSeekCardGenerationProvider,
  DeterministicCardGenerationProvider,
} from '../ingestion/card-generation';
import { runTextbookIngestion, type LegalStudyIngestionOptions } from '../ingestion/pipeline';
import { OcrProvider } from '../ingestion/ocr';
import type {
  LegalStudyIngestionInput,
  LegalStudyIngestionReport,
  LegalStudyOcrProvider,
  LegalStudyCardGenerationProvider,
} from '../ingestion/types';
import type {
  LegalStudyCard,
  LegalStudyCardStatus,
  LegalStudyChapter,
  LegalStudyContentSlice,
  LegalStudyTextbook,
} from '../types';
import type { LegalStudyRepository } from '../repositories/legal-study-repository';

export interface LegalStudyTextbookServiceOptions {
  ocrProvider?: LegalStudyOcrProvider;
  cardGenerationProvider?: LegalStudyCardGenerationProvider;
  deepSeek?: {
    apiKeyEnv?: string;
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
  };
}

export interface CreateLegalStudyTextbookInput {
  id?: string;
  userId: string;
  subjectId: string;
  title: string;
  fileRef?: string;
  now?: string;
}

export interface IngestLegalStudyTextbookInput extends LegalStudyIngestionInput {}

export interface IngestLegalStudyTextbookResult {
  report: LegalStudyIngestionReport;
  textbook: LegalStudyTextbook;
  chapters: LegalStudyChapter[];
  slices: LegalStudyContentSlice[];
  cards: LegalStudyCard[];
}

export interface LegalStudyCardFilter {
  textbookId?: string;
  chapterId?: string;
  status?: LegalStudyCardStatus;
}

export interface ConfirmLegalStudyCardBatchInput {
  cardIds: string[];
  now?: string;
}

export interface UpdateLegalStudyCardInput {
  front?: string;
  back?: string;
  status?: LegalStudyCardStatus;
  now?: string;
}

export class LegalStudyTextbookService {
  private readonly ingestionOptions: LegalStudyIngestionOptions;

  constructor(
    private readonly repository: LegalStudyRepository,
    options: LegalStudyTextbookServiceOptions = {}
  ) {
    this.ingestionOptions = {
      ocrProvider: options.ocrProvider ?? new OcrProvider(),
      cardGenerationProvider:
        options.cardGenerationProvider ??
        new DeepSeekCardGenerationProvider({
          apiKeyEnv: options.deepSeek?.apiKeyEnv,
          baseUrl: options.deepSeek?.baseUrl,
          model: options.deepSeek?.model,
          timeoutMs: options.deepSeek?.timeoutMs,
          fallback: new DeterministicCardGenerationProvider(),
        }),
    };
  }

  async listTextbooks(subjectId?: string): Promise<LegalStudyTextbook[]> {
    const textbooks = await this.repository.list(
      'textbooks',
      subjectId ? (textbook) => textbook.subjectId === subjectId : undefined
    );
    return textbooks.sort((left, right) => left.title.localeCompare(right.title));
  }

  async createTextbook(input: CreateLegalStudyTextbookInput): Promise<LegalStudyTextbook> {
    const now = input.now ?? new Date().toISOString();
    await this.repository.require('subjects', input.subjectId);
    const textbook: LegalStudyTextbook = {
      id:
        input.id ??
        makeUniqueId(
          'textbook',
          [input.subjectId, input.title],
          (await this.repository.list('textbooks')).map((candidate) => candidate.id)
        ),
      userId: input.userId,
      subjectId: input.subjectId,
      title: requireNonEmpty(input.title, 'title'),
      fileRef: input.fileRef,
      ocrStatus: 'queued',
      createdAt: now,
    };
    return this.repository.insert('textbooks', textbook, { now });
  }

  async ingestTextbook(input: IngestLegalStudyTextbookInput): Promise<IngestLegalStudyTextbookResult> {
    return this.repository.transaction(async (transaction) => {
      await transaction.require('subjects', input.subjectId);
      const before = await transaction.getSnapshot();
      const result = await runTextbookIngestion(before, input, this.ingestionOptions);
      await transaction.replaceSnapshot(result.snapshot);

      const textbook = await transaction.require('textbooks', result.report.textbookId);
      return {
        report: result.report,
        textbook,
        chapters: await this.listChaptersForRepository(transaction, textbook.id),
        slices: await this.listSlicesForTextbook(transaction, textbook.id),
        cards: await this.listCardsForRepository(transaction, { textbookId: textbook.id }),
      };
    });
  }

  async listChapters(textbookId: string): Promise<LegalStudyChapter[]> {
    return this.listChaptersForRepository(this.repository, textbookId);
  }

  async listSlices(chapterId: string): Promise<LegalStudyContentSlice[]> {
    const slices = await this.repository.list('contentSlices', (slice) => slice.chapterId === chapterId);
    return slices.sort((left, right) => (left.pageStart ?? 0) - (right.pageStart ?? 0) || left.id.localeCompare(right.id));
  }

  async listCards(filter: LegalStudyCardFilter = {}): Promise<LegalStudyCard[]> {
    return this.listCardsForRepository(this.repository, filter);
  }

  async confirmCardBatch(input: ConfirmLegalStudyCardBatchInput): Promise<LegalStudyCard[]> {
    const now = input.now ?? new Date().toISOString();
    const confirmed: LegalStudyCard[] = [];
    await this.repository.transaction(async (transaction) => {
      for (const cardId of input.cardIds) {
        confirmed.push(
          await transaction.update(
            'cards',
            cardId,
            {
              status: 'confirmed',
              editedByUser: true,
            },
            { now }
          )
        );
      }
    });
    return confirmed;
  }

  async updateCard(cardId: string, input: UpdateLegalStudyCardInput): Promise<LegalStudyCard> {
    const now = input.now ?? new Date().toISOString();
    const patch: Partial<LegalStudyCard> = {
      editedByUser: true,
    };
    if (input.front !== undefined) patch.front = requireNonEmpty(input.front, 'front');
    if (input.back !== undefined) patch.back = requireNonEmpty(input.back, 'back');
    if (input.status !== undefined) patch.status = input.status;
    return this.repository.update('cards', cardId, patch, { now });
  }

  private async listChaptersForRepository(
    repository: LegalStudyRepository,
    textbookId: string
  ): Promise<LegalStudyChapter[]> {
    const chapters = await repository.list('chapters', (chapter) => chapter.textbookId === textbookId);
    return chapters.sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  private async listSlicesForTextbook(
    repository: LegalStudyRepository,
    textbookId: string
  ): Promise<LegalStudyContentSlice[]> {
    const chapterIds = new Set((await this.listChaptersForRepository(repository, textbookId)).map((chapter) => chapter.id));
    const slices = await repository.list('contentSlices', (slice) => chapterIds.has(slice.chapterId));
    return slices.sort((left, right) => left.id.localeCompare(right.id));
  }

  private async listCardsForRepository(
    repository: LegalStudyRepository,
    filter: LegalStudyCardFilter
  ): Promise<LegalStudyCard[]> {
    const cards = await repository.list('cards', (card) => {
      if (filter.textbookId && card.textbookId !== filter.textbookId) return false;
      if (filter.chapterId && card.chapterId !== filter.chapterId) return false;
      if (filter.status && card.status !== filter.status) return false;
      return true;
    });
    return cards.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }
}

function makeUniqueId(prefix: string, seeds: string[], existingIds: string[]): string {
  const seed = seeds.map((part) => slug(part)).filter(Boolean).join('-');
  const base = seed ? `${prefix}-${seed}` : prefix;
  if (!existingIds.includes(base)) return base;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
  throw new Error(`Unable to generate unique id for ${prefix}`);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} cannot be empty`);
  }
  return trimmed;
}

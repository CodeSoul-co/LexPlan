import type {
  LegalStudyCard,
  LegalStudyChapter,
  LegalStudyContentSlice,
  LegalStudySubject,
  LegalStudyTextbook,
} from '../types';

export interface LegalStudyOcrPage {
  pageNumber: number;
  text: string;
  confidence?: number;
  blocks?: LegalStudyOcrBlock[];
}

export interface LegalStudyOcrBlock {
  type: 'title' | 'paragraph' | 'table' | 'footer' | 'unknown';
  text: string;
  confidence?: number;
  bbox?: [number, number, number, number];
}

export interface LegalStudyOcrResult {
  textbookId: string;
  status: 'succeeded' | 'failed';
  pages: LegalStudyOcrPage[];
  provider: string;
  error?: string;
}

export interface LegalStudyOcrProvider {
  readonly id: string;
  recognize(input: LegalStudyOcrInput): Promise<LegalStudyOcrResult>;
}

export interface LegalStudyOcrInput {
  textbookId: string;
  fileName?: string;
  fileRef?: string;
  filePath?: string;
  mimeType?: string;
  text?: string;
  pages?: LegalStudyOcrPage[];
}

export interface LegalStudyCardGenerationInput {
  userId: string;
  subject: LegalStudySubject;
  textbook: LegalStudyTextbook;
  chapter: LegalStudyChapter;
  slice: LegalStudyContentSlice;
  sourceText: string;
  now: string;
}

export interface LegalStudyCardGenerationProvider {
  readonly id: string;
  generateCards(input: LegalStudyCardGenerationInput): Promise<LegalStudyCard[]>;
}

export interface LegalStudyIngestionInput {
  userId: string;
  subjectId: string;
  textbookId?: string;
  textbookTitle: string;
  fileName?: string;
  fileRef?: string;
  filePath?: string;
  mimeType?: string;
  text?: string;
  pages?: LegalStudyOcrPage[];
  confirmCards?: boolean;
  now?: string;
}

export interface LegalStudyIngestionReport {
  textbookId: string;
  ocrStatus: 'succeeded' | 'failed';
  chaptersDetected: number;
  slicesCreated: number;
  cardsGenerated: number;
  cardsPendingConfirmation: number;
  provider: {
    ocr: string;
    cardGeneration: string;
  };
  errors: string[];
}

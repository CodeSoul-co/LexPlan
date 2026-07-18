import type { LegalStudyOcrInput, LegalStudyOcrPage, LegalStudyOcrProvider, LegalStudyOcrResult } from './types';
import type {
  OcrProvider as HyphaOcrProvider,
  OcrRequest,
  OcrResult,
  ToolCallContext,
} from '@hypha/tools';

export interface OcrProviderConfig {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export class OcrProvider implements LegalStudyOcrProvider {
  readonly id = 'ocr.paddle-http';
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: OcrProviderConfig = {}) {
    this.endpoint = (config.endpoint ?? process.env.OCR_SERVICE_URL ?? 'http://127.0.0.1:8765/ocr').replace(/\/$/, '');
    this.timeoutMs = config.timeoutMs ?? Number(process.env.OCR_SERVICE_TIMEOUT_MS ?? 120000);
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async recognize(input: LegalStudyOcrInput): Promise<LegalStudyOcrResult> {
    if (input.pages?.length) {
      return this.succeeded(input.textbookId, normalizePages(input.pages));
    }

    const text = input.text?.trim();
    if (text) {
      return this.succeeded(input.textbookId, textToPages(text));
    }

    if (!input.fileRef && !input.filePath && !input.fileName) {
      return this.failed(input.textbookId, 'OCR requires pages, text, fileRef, filePath, or fileName input.');
    }

    try {
      const response = await this.callOcrService(input);
      return this.succeeded(input.textbookId, normalizePages(response.pages));
    } catch (error) {
      return this.failed(input.textbookId, error instanceof Error ? error.message : String(error));
    }
  }

  private async callOcrService(input: LegalStudyOcrInput): Promise<{ pages: LegalStudyOcrPage[] }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          textbookId: input.textbookId,
          fileName: input.fileName,
          fileRef: input.fileRef,
          filePath: input.filePath,
          mimeType: input.mimeType,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`OCR service returned HTTP ${response.status}: ${await response.text()}`);
      }
      const data = (await response.json()) as unknown;
      return parseOcrServiceResponse(data);
    } finally {
      clearTimeout(timeout);
    }
  }

  private succeeded(textbookId: string, pages: LegalStudyOcrPage[]): LegalStudyOcrResult {
    if (!pages.length) {
      return this.failed(textbookId, 'OCR service returned no readable pages.');
    }
    return {
      textbookId,
      status: 'succeeded',
      pages,
      provider: this.id,
    };
  }

  private failed(textbookId: string, error: string): LegalStudyOcrResult {
    return {
      textbookId,
      status: 'failed',
      pages: [],
      provider: this.id,
      error,
    };
  }
}

export class LexPlanOcrMediaProviderAdapter implements HyphaOcrProvider {
  readonly id: string;

  constructor(private readonly provider: OcrProvider = new OcrProvider()) {
    this.id = provider.id;
  }

  async recognize(request: OcrRequest, _context?: ToolCallContext): Promise<OcrResult> {
    const textbookId =
      typeof request.metadata?.textbookId === 'string'
        ? request.metadata.textbookId
        : `ocr-${Date.now()}`;
    if (request.source.type === 'inline') {
      return {
        status: 'failed',
        provider: this.id,
        pages: [],
        error: {
          code: 'OCR_INLINE_SOURCE_UNSUPPORTED',
          message: 'The LexPlan OCR service adapter requires an artifact, URL, or text source.',
          retryable: false,
        },
      };
    }
    const result = await this.provider.recognize({
      textbookId,
      text: request.source.type === 'text' ? request.source.text : undefined,
      fileRef:
        request.source.type === 'artifact'
          ? request.source.artifactRef
          : request.source.type === 'url'
            ? request.source.url
            : undefined,
      fileName: request.source.fileName,
      mimeType: 'mimeType' in request.source ? request.source.mimeType : undefined,
    });
    return {
      status: result.status === 'succeeded' ? 'completed' : 'failed',
      provider: result.provider,
      text: result.pages.map((page) => page.text).join('\n\n') || undefined,
      pages: result.pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: page.text,
        confidence: page.confidence,
        blocks: page.blocks?.map((block) => ({
          type:
            block.type === 'paragraph'
              ? 'text'
              : block.type === 'footer'
                ? 'text'
                : block.type,
          text: block.text,
          confidence: block.confidence,
          boundingBox: block.bbox
            ? {
                x: block.bbox[0],
                y: block.bbox[1],
                width: block.bbox[2] - block.bbox[0],
                height: block.bbox[3] - block.bbox[1],
                unit: 'pixel',
              }
            : undefined,
        })),
      })),
      error: result.error
        ? { code: 'OCR_PROVIDER_FAILED', message: result.error, retryable: true }
        : undefined,
      metadata: { textbookId: result.textbookId },
    };
  }
}

function parseOcrServiceResponse(data: unknown): { pages: LegalStudyOcrPage[] } {
  if (!isRecord(data) || !Array.isArray(data.pages)) {
    throw new Error('OCR service response must include a pages array.');
  }
  return {
    pages: data.pages.map(normalizePage).filter((page) => page.text.trim().length > 0),
  };
}

function normalizePages(pages: LegalStudyOcrPage[]): LegalStudyOcrPage[] {
  return pages.map(normalizePage).filter((page) => page.text.trim().length > 0);
}

function normalizePage(page: unknown, index: number): LegalStudyOcrPage {
  if (!isRecord(page)) {
    throw new Error(`OCR page ${index + 1} must be an object.`);
  }
  const text = typeof page.text === 'string' ? page.text.trim() : '';
  const pageNumber = typeof page.pageNumber === 'number' && Number.isInteger(page.pageNumber) && page.pageNumber > 0
    ? page.pageNumber
    : index + 1;
  const confidence = typeof page.confidence === 'number' ? page.confidence : undefined;
  const blocks = Array.isArray(page.blocks)
    ? page.blocks.map(normalizeBlock).filter((block) => block.text.trim().length > 0)
    : undefined;
  return {
    pageNumber,
    text,
    confidence,
    blocks,
  };
}

function normalizeBlock(block: unknown): NonNullable<LegalStudyOcrPage['blocks']>[number] {
  if (!isRecord(block)) {
    return { type: 'unknown', text: '' };
  }
  const type = block.type === 'title' || block.type === 'paragraph' || block.type === 'table' || block.type === 'footer'
    ? block.type
    : 'unknown';
  return {
    type,
    text: typeof block.text === 'string' ? block.text.trim() : '',
    confidence: typeof block.confidence === 'number' ? block.confidence : undefined,
    bbox: normalizeBbox(block.bbox),
  };
}

function normalizeBbox(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 4 || value.some((item) => typeof item !== 'number')) {
    return undefined;
  }
  return [value[0], value[1], value[2], value[3]];
}

function textToPages(text: string): LegalStudyOcrPage[] {
  return splitTextIntoPages(text).map((pageText, index) => ({
    pageNumber: index + 1,
    text: pageText,
    confidence: 1,
    blocks: pageText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        type: /^第[一二三四五六七八九十百0-9]+[章节编]/.test(line) ? 'title' as const : 'paragraph' as const,
        text: line,
        confidence: 1,
      })),
  }));
}

function splitTextIntoPages(text: string): string[] {
  const explicitPages = text
    .split(/\n\s*---+\s*page\s*---+\s*\n/i)
    .map((page) => page.trim())
    .filter(Boolean);
  if (explicitPages.length > 1) return explicitPages;
  const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  if (paragraphs.length <= 3) return [text];
  const pages: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 3) {
    pages.push(paragraphs.slice(index, index + 3).join('\n\n'));
  }
  return pages;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

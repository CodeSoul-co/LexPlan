import { describe, expect, it } from 'vitest';
import { OcrProvider } from './ocr';

describe('OcrProvider', () => {
  it('normalizes OCR service pages and sends file metadata to the configured endpoint', async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const provider = new OcrProvider({
      endpoint: 'http://ocr.local/ocr',
      fetchImpl: (async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });
        return new Response(
          JSON.stringify({
            pages: [
              {
                pageNumber: 3,
                text: ' 第一章 合同成立 ',
                confidence: 0.96,
                blocks: [
                  { type: 'title', text: '第一章 合同成立', confidence: 0.98, bbox: [1, 2, 3, 4] },
                  { type: 'noise', text: '合同成立通常经过要约和承诺。' },
                ],
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch,
    });

    const result = await provider.recognize({
      textbookId: 'textbook-ocr-contract',
      fileName: 'civil.pdf',
      fileRef: 'upload://civil.pdf',
      filePath: 'D:/LexPlan-Agent/tmp/civil.pdf',
      mimeType: 'application/pdf',
    });

    expect(calls).toEqual([
      {
        url: 'http://ocr.local/ocr',
        body: {
          textbookId: 'textbook-ocr-contract',
          fileName: 'civil.pdf',
          fileRef: 'upload://civil.pdf',
          filePath: 'D:/LexPlan-Agent/tmp/civil.pdf',
          mimeType: 'application/pdf',
        },
      },
    ]);
    expect(result).toMatchObject({
      textbookId: 'textbook-ocr-contract',
      status: 'succeeded',
      provider: 'ocr.paddle-http',
      pages: [
        {
          pageNumber: 3,
          text: '第一章 合同成立',
          confidence: 0.96,
          blocks: [
            { type: 'title', text: '第一章 合同成立', confidence: 0.98, bbox: [1, 2, 3, 4] },
            { type: 'unknown', text: '合同成立通常经过要约和承诺。' },
          ],
        },
      ],
    });
  });

  it('returns structured failed OCR results when the service fails', async () => {
    const provider = new OcrProvider({
      endpoint: 'http://ocr.local/ocr',
      fetchImpl: (async () => new Response('boom', { status: 503 })) as typeof fetch,
    });

    const result = await provider.recognize({
      textbookId: 'textbook-ocr-failure',
      fileRef: 'upload://broken.pdf',
    });

    expect(result.status).toBe('failed');
    expect(result.provider).toBe('ocr.paddle-http');
    expect(result.error).toContain('HTTP 503');
    expect(result.pages).toEqual([]);
  });

  it('accepts pre-extracted text and pages for deterministic tests and migrations', async () => {
    const provider = new OcrProvider();
    const fromText = await provider.recognize({
      textbookId: 'textbook-text',
      text: '第一章 合同成立\n合同成立通常经过要约和承诺。',
    });
    expect(fromText.status).toBe('succeeded');
    expect(fromText.pages[0].blocks?.[0]).toMatchObject({ type: 'title' });

    const fromPages = await provider.recognize({
      textbookId: 'textbook-pages',
      pages: [{ pageNumber: 8, text: '第二章 合同效力', confidence: 0.9 }],
    });
    expect(fromPages.pages).toEqual([{ pageNumber: 8, text: '第二章 合同效力', confidence: 0.9 }]);
  });
});

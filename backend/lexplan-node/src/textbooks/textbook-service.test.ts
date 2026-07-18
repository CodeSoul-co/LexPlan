import { describe, expect, it } from 'vitest';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { DeterministicCardGenerationProvider } from '../ingestion/card-generation';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import { LegalStudyTextbookService } from './textbook-service';

describe('LegalStudyTextbookService', () => {
  it('ingests textbook text through OCR, chapter detection, slicing, and card generation', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyTextbookService(repository, {
      cardGenerationProvider: new DeterministicCardGenerationProvider(),
    });

    const result = await service.ingestTextbook({
      userId: 'seed-user-legal-study',
      subjectId: 'subject-civil',
      textbookTitle: '民法新增讲义',
      text: ['第一章 合同成立', '合同成立通常经过要约和承诺。', '', '第二章 合同效力', '效力判断应区分成立与生效。'].join(
        '\n'
      ),
      now: '2026-07-07T17:00:00.000Z',
    });

    expect(result.report).toMatchObject({
      ocrStatus: 'succeeded',
      chaptersDetected: 2,
      slicesCreated: 2,
      cardsGenerated: 4,
      cardsPendingConfirmation: 4,
    });
    expect(result.textbook.ocrStatus).toBe('succeeded');
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(['合同成立', '合同效力']);
    expect(result.slices).toHaveLength(2);
    expect(result.cards.every((card) => card.status === 'pending_confirmation')).toBe(true);
  });

  it('supports pending card review, batch confirmation, and user edits', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyTextbookService(repository, {
      cardGenerationProvider: new DeterministicCardGenerationProvider(),
    });
    const ingestion = await service.ingestTextbook({
      userId: 'seed-user-legal-study',
      subjectId: 'subject-civil',
      textbookTitle: '民法确认讲义',
      text: '第一章 代理制度\n代理人在代理权限内实施民事法律行为。',
      now: '2026-07-07T17:30:00.000Z',
    });

    const pendingCards = await service.listCards({
      textbookId: ingestion.textbook.id,
      status: 'pending_confirmation',
    });
    expect(pendingCards).toHaveLength(2);

    const confirmed = await service.confirmCardBatch({
      cardIds: pendingCards.map((card) => card.id),
      now: '2026-07-07T18:00:00.000Z',
    });
    expect(confirmed.every((card) => card.status === 'confirmed')).toBe(true);

    const edited = await service.updateCard(confirmed[0].id, {
      front: '代理行为的核心效果是什么？',
      back: '代理人在权限内实施的行为，法律后果归属于被代理人。',
      now: '2026-07-07T18:10:00.000Z',
    });
    expect(edited).toMatchObject({
      front: '代理行为的核心效果是什么？',
      editedByUser: true,
      status: 'confirmed',
    });
  });

  it('marks OCR failures on the textbook and keeps generated artifacts empty', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyTextbookService(repository, {
      cardGenerationProvider: new DeterministicCardGenerationProvider(),
    });

    const result = await service.ingestTextbook({
      userId: 'seed-user-legal-study',
      subjectId: 'subject-civil',
      textbookTitle: '空白讲义',
      text: '',
      now: '2026-07-07T18:30:00.000Z',
    });

    expect(result.report.ocrStatus).toBe('failed');
    expect(result.report.errors).toEqual(['OCR requires pages, text, fileRef, filePath, or fileName input.']);
    expect(result.textbook.ocrStatus).toBe('failed');
    expect(result.chapters).toEqual([]);
    expect(result.cards).toEqual([]);
  });
});

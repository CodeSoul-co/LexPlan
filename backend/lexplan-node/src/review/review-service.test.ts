import { describe, expect, it } from 'vitest';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import { completeEpisodeAndUnlockCards } from '../mapping/unlock';
import { LegalStudyReviewService } from './review-service';

describe('LegalStudyReviewService', () => {
  it('lists due learned cards with card and review state details', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyReviewService(repository);

    const queue = await service.getDueQueue({ date: '2026-07-07' });

    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      cardId: 'card-criminal-act-due',
      subjectId: 'subject-criminal',
      card: { front: '犯罪构成四要件通常包括什么？' },
      reviewState: { reps: 3 },
    });
  });

  it('learns an unlocked confirmed card and creates its initial review state', async () => {
    const unlocked = completeEpisodeAndUnlockCards(
      createLegalStudySeedSnapshot(),
      'episode-civil-contract-formation',
      '2026-07-08T08:00:00.000Z'
    ).snapshot;
    const repository = new InMemoryLegalStudyRepository(unlocked);
    const service = new LegalStudyReviewService(repository);

    const newCards = await service.listNewCards({ subjectId: 'subject-civil' });
    expect(newCards.map((card) => card.id).sort()).toEqual([
      'card-civil-acceptance-effective',
      'card-civil-offer-acceptance',
    ]);

    const result = await service.learnNewCard({
      cardId: 'card-civil-offer-acceptance',
      learnedAt: '2026-07-08T09:00:00.000Z',
    });

    expect(result.card.unlockStatus).toBe('learned');
    expect(result.after).toMatchObject({
      cardId: 'card-civil-offer-acceptance',
      dueAt: '2026-07-09T09:00:00.000Z',
      reps: 0,
      lapses: 0,
      scheduledDays: 1,
    });
    expect((await repository.require('cards', 'card-civil-offer-acceptance')).unlockStatus).toBe(
      'learned'
    );
  });

  it('submits review feedback and advances FSRS-lite state', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyReviewService(repository);

    const good = await service.submitReview({
      cardId: 'card-criminal-act-due',
      rating: 'good',
      reviewedAt: '2026-07-07T20:00:00.000Z',
    });

    expect(good.before.reps).toBe(3);
    expect(good.after).toMatchObject({
      reps: 4,
      lapses: 0,
      scheduledDays: 4,
      dueAt: '2026-07-11T20:00:00.000Z',
    });
    expect(good.after.stability).toBeGreaterThan(good.before.stability ?? 0);
    expect(good.after.difficulty).toBeLessThan(good.before.difficulty ?? 10);

    const afterQueue = await service.getDueQueue({ date: '2026-07-07' });
    expect(afterQueue).toEqual([]);
  });

  it('tracks lapses for again ratings and computes review pressure', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyReviewService(repository);

    const pressure = await service.computePressure('2026-07-07', 6);
    expect(pressure).toMatchObject({
      dueCount: 1,
      dueMinutes: 3,
      availableMinutes: 6,
      risk: 'high',
    });

    const again = await service.submitReview({
      cardId: 'card-criminal-act-due',
      rating: 'again',
      reviewedAt: '2026-07-07T21:00:00.000Z',
    });
    expect(again.after).toMatchObject({
      lapses: 1,
      scheduledDays: 1,
      dueAt: '2026-07-08T21:00:00.000Z',
    });
  });
});

import {
  computeReviewPressure,
  getDueReviewQueue,
  scheduleReview,
} from './fsrs-lite';
import type { LegalStudyRepository } from '../repositories/legal-study-repository';
import type {
  LegalStudyCard,
  LegalStudyReviewPressure,
  LegalStudyReviewQueueItem,
  LegalStudyReviewRating,
  LegalStudyReviewState,
} from '../types';

export interface LegalStudyReviewQueueFilter {
  date: string;
  subjectId?: string;
  limit?: number;
}

export interface LegalStudyNewCardFilter {
  subjectId?: string;
  limit?: number;
}

export interface LegalStudyReviewQueueEntry extends LegalStudyReviewQueueItem {
  card: LegalStudyCard;
  reviewState: LegalStudyReviewState;
}

export interface LearnLegalStudyCardInput {
  cardId: string;
  learnedAt?: string;
  firstReviewAfterDays?: number;
}

export interface SubmitLegalStudyReviewInput {
  cardId: string;
  rating: LegalStudyReviewRating;
  reviewedAt?: string;
}

export interface SubmitLegalStudyReviewResult {
  card: LegalStudyCard;
  before: LegalStudyReviewState;
  after: LegalStudyReviewState;
}

export class LegalStudyReviewService {
  constructor(private readonly repository: LegalStudyRepository) {}

  async listNewCards(filter: LegalStudyNewCardFilter = {}): Promise<LegalStudyCard[]> {
    const cards = await this.repository.list('cards', (card) => {
      if (filter.subjectId && card.subjectId !== filter.subjectId) return false;
      return card.status === 'confirmed' && card.unlockStatus === 'unlocked';
    });
    const sorted = cards.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    return filter.limit === undefined ? sorted : sorted.slice(0, filter.limit);
  }

  async getDueQueue(filter: LegalStudyReviewQueueFilter): Promise<LegalStudyReviewQueueEntry[]> {
    const snapshot = await this.repository.getSnapshot();
    const queue = getDueReviewQueue(snapshot, filter.date)
      .filter((item) => !filter.subjectId || item.subjectId === filter.subjectId)
      .slice(0, filter.limit);
    return queue.map((item) => {
      const card = snapshot.cards.find((candidate) => candidate.id === item.cardId);
      const reviewState = snapshot.reviewStates.find((state) => state.cardId === item.cardId);
      if (!card || !reviewState) {
        throw new Error(`Review queue item is inconsistent: ${item.cardId}`);
      }
      return {
        ...item,
        card,
        reviewState,
      };
    });
  }

  async computePressure(
    date: string,
    availableMinutes?: number
  ): Promise<LegalStudyReviewPressure> {
    const snapshot = await this.repository.getSnapshot();
    return computeReviewPressure(snapshot, date, availableMinutes ?? snapshot.availableMinutesToday);
  }

  async learnNewCard(input: LearnLegalStudyCardInput): Promise<SubmitLegalStudyReviewResult> {
    const learnedAt = input.learnedAt ?? new Date().toISOString();
    const firstReviewAfterDays = input.firstReviewAfterDays ?? 1;
    return this.repository.transaction(async (transaction) => {
      const card = await transaction.require('cards', input.cardId);
      if (card.status !== 'confirmed') {
        throw new Error(`Card ${card.id} must be confirmed before learning.`);
      }
      if (card.unlockStatus === 'locked') {
        throw new Error(`Card ${card.id} must be unlocked before learning.`);
      }
      const learnedCard = await transaction.update(
        'cards',
        card.id,
        { unlockStatus: 'learned' },
        { now: learnedAt }
      );
      const existing = (
        await transaction.list('reviewStates', (state) => state.cardId === card.id)
      )[0];
      const initialState: LegalStudyReviewState = existing ?? {
        id: `review-${card.id}`,
        userId: card.userId,
        cardId: card.id,
        dueAt: addDays(learnedAt, firstReviewAfterDays),
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: firstReviewAfterDays,
        reps: 0,
        lapses: 0,
        createdAt: learnedAt,
      };
      const after = existing
        ? await transaction.update(
            'reviewStates',
            existing.id,
            {
              dueAt: addDays(learnedAt, firstReviewAfterDays),
              scheduledDays: firstReviewAfterDays,
              elapsedDays: 0,
            },
            { now: learnedAt }
          )
        : await transaction.insert('reviewStates', initialState, { now: learnedAt });
      return {
        card: learnedCard,
        before: existing ?? initialState,
        after,
      };
    });
  }

  async submitReview(input: SubmitLegalStudyReviewInput): Promise<SubmitLegalStudyReviewResult> {
    const reviewedAt = input.reviewedAt ?? new Date().toISOString();
    return this.repository.transaction(async (transaction) => {
      const card = await transaction.require('cards', input.cardId);
      if (card.unlockStatus !== 'learned') {
        throw new Error(`Card ${card.id} must be learned before review.`);
      }
      const before = (
        await transaction.list('reviewStates', (state) => state.cardId === card.id)
      )[0];
      if (!before) {
        throw new Error(`Review state not found for card: ${card.id}`);
      }
      const scheduled = scheduleReview(before, input.rating, reviewedAt);
      const after = await transaction.update('reviewStates', before.id, scheduled, {
        now: reviewedAt,
        preserveUpdatedAt: true,
      });
      return {
        card,
        before,
        after,
      };
    });
  }
}

function addDays(value: string, days: number): string {
  return new Date(Date.parse(value) + days * 86400000).toISOString();
}

import type {
  LegalStudyCard,
  LegalStudyCourseEpisode,
  LegalStudyLearningSnapshot,
  LegalStudyUnlockReport,
} from '../types';

export function completeEpisodeAndUnlockCards(
  snapshot: LegalStudyLearningSnapshot,
  episodeId: string,
  completedAt = new Date().toISOString()
): { snapshot: LegalStudyLearningSnapshot; report: LegalStudyUnlockReport } {
  const episode = snapshot.episodes.find((candidate) => candidate.id === episodeId);
  const violations: string[] = [];

  if (!episode) {
    return {
      snapshot,
      report: {
        episodeId,
        mappedChapterIds: [],
        unlockedCardIds: [],
        skippedCardIds: [],
        violations: [`Episode not found: ${episodeId}`],
      },
    };
  }

  const nextEpisodes = snapshot.episodes.map((candidate): LegalStudyCourseEpisode => {
    if (candidate.id !== episodeId) return candidate;
    return {
      ...candidate,
      status: 'completed',
      completedAt,
      updatedAt: completedAt,
    };
  });

  const mappedChapterIds = Array.from(
    new Set(
      snapshot.mappings
        .filter((mapping) => mapping.episodeId === episodeId)
        .map((mapping) => mapping.chapterId)
    )
  );

  if (mappedChapterIds.length === 0) {
    violations.push(`Episode ${episodeId} has no confirmed chapter mapping.`);
  }

  const unlockedCardIds: string[] = [];
  const skippedCardIds: string[] = [];
  const nextCards = snapshot.cards.map((card): LegalStudyCard => {
    if (!mappedChapterIds.includes(card.chapterId)) return card;
    if (card.status !== 'confirmed') {
      skippedCardIds.push(card.id);
      return card;
    }
    if (card.unlockStatus !== 'locked') {
      skippedCardIds.push(card.id);
      return card;
    }
    unlockedCardIds.push(card.id);
    return {
      ...card,
      unlockStatus: 'unlocked',
      updatedAt: completedAt,
    };
  });

  return {
    snapshot: {
      ...snapshot,
      capturedAt: completedAt,
      episodes: nextEpisodes,
      cards: nextCards,
    },
    report: {
      episodeId,
      completedEpisodeId: episode.id,
      mappedChapterIds,
      unlockedCardIds,
      skippedCardIds,
      violations,
    },
  };
}

export function computeUnlockCandidates(
  snapshot: LegalStudyLearningSnapshot,
  episodeId: string
): LegalStudyUnlockReport {
  const mappedChapterIds = Array.from(
    new Set(
      snapshot.mappings
        .filter((mapping) => mapping.episodeId === episodeId)
        .map((mapping) => mapping.chapterId)
    )
  );
  const episode = snapshot.episodes.find((candidate) => candidate.id === episodeId);
  const violations: string[] = [];
  if (!episode) violations.push(`Episode not found: ${episodeId}`);
  if (episode && episode.status !== 'completed') {
    violations.push(`Episode ${episodeId} is not completed.`);
  }
  if (mappedChapterIds.length === 0) {
    violations.push(`Episode ${episodeId} has no confirmed chapter mapping.`);
  }

  const unlockedCardIds = snapshot.cards
    .filter(
      (card) =>
        mappedChapterIds.includes(card.chapterId) &&
        card.status === 'confirmed' &&
        card.unlockStatus === 'locked'
    )
    .map((card) => card.id);

  const skippedCardIds = snapshot.cards
    .filter((card) => mappedChapterIds.includes(card.chapterId) && !unlockedCardIds.includes(card.id))
    .map((card) => card.id);

  return {
    episodeId,
    completedEpisodeId: episode?.status === 'completed' ? episode.id : undefined,
    mappedChapterIds,
    unlockedCardIds,
    skippedCardIds,
    violations,
  };
}

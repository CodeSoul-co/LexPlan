import type {
  LegalStudyLearningSnapshot,
  LegalStudyReviewPressure,
  LegalStudyReviewQueueItem,
  LegalStudyReviewRating,
  LegalStudyReviewState,
} from '../types';

const REVIEW_MINUTES_PER_CARD = 3;
const TARGET_RETENTION = 0.9;
const MIN_STABILITY = 0.5;
const MAX_STABILITY = 3650;
const MIN_DIFFICULTY = 1;
const MAX_DIFFICULTY = 10;

export function getDueReviewQueue(
  snapshot: LegalStudyLearningSnapshot,
  date: string,
  minutesPerCard = REVIEW_MINUTES_PER_CARD
): LegalStudyReviewQueueItem[] {
  const endOfDay = Date.parse(`${date}T23:59:59.999Z`);
  return snapshot.reviewStates
    .filter((state) => Date.parse(state.dueAt) <= endOfDay)
    .map((state) => {
      const card = snapshot.cards.find((candidate) => candidate.id === state.cardId);
      if (!card || card.unlockStatus !== 'learned') return null;
      return {
        cardId: card.id,
        subjectId: card.subjectId,
        dueAt: state.dueAt,
        estimatedMinutes: estimateReviewMinutes(state, minutesPerCard),
        overdueDays: Math.max(0, Math.floor((Date.parse(`${date}T00:00:00.000Z`) - Date.parse(state.dueAt)) / 86400000)),
      };
    })
    .filter((item): item is LegalStudyReviewQueueItem => Boolean(item))
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt));
}

export function computeReviewPressure(
  snapshot: LegalStudyLearningSnapshot,
  date: string,
  availableMinutes = snapshot.availableMinutesToday
): LegalStudyReviewPressure {
  const dueItems = getDueReviewQueue(snapshot, date);
  const dueMinutes = dueItems.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const pressureRatio = availableMinutes > 0 ? dueMinutes / availableMinutes : 1;
  return {
    dueCount: dueItems.length,
    dueMinutes,
    availableMinutes,
    pressureRatio,
    risk: riskFromRatio(pressureRatio),
    dueItems,
  };
}

export function scheduleReview(
  state: LegalStudyReviewState,
  rating: LegalStudyReviewRating,
  reviewedAt: string
): LegalStudyReviewState {
  const elapsedDays = Math.max(
    0,
    Math.floor((Date.parse(reviewedAt) - Date.parse(state.updatedAt ?? state.createdAt)) / 86400000)
  );
  const currentStability = clamp(state.stability ?? 1, MIN_STABILITY, MAX_STABILITY);
  const currentDifficulty = clamp(state.difficulty ?? 5, MIN_DIFFICULTY, MAX_DIFFICULTY);
  const retrievability = computeRetrievability(elapsedDays, currentStability);
  const difficulty = nextDifficulty(currentDifficulty, rating);
  const stability = nextStability({
    currentStability,
    currentDifficulty,
    rating,
    elapsedDays,
    retrievability,
  });
  const intervalDays = rating === 'again' ? 1 : intervalFromStability(stability, TARGET_RETENTION, rating);
  return {
    ...state,
    dueAt: new Date(Date.parse(reviewedAt) + intervalDays * 86400000).toISOString(),
    stability,
    difficulty,
    elapsedDays,
    reps: state.reps + 1,
    lapses: rating === 'again' ? state.lapses + 1 : state.lapses,
    scheduledDays: intervalDays,
    updatedAt: reviewedAt,
  };
}

function riskFromRatio(ratio: number): LegalStudyReviewPressure['risk'] {
  if (ratio >= 0.7) return 'critical';
  if (ratio >= 0.45) return 'high';
  if (ratio >= 0.25) return 'medium';
  return 'low';
}

function estimateReviewMinutes(state: LegalStudyReviewState, fallbackMinutes: number): number {
  const stability = state.stability ?? 1;
  if (state.lapses > 0 || stability < 1.5) return Math.max(fallbackMinutes, 4);
  if (stability >= 8 && state.reps >= 3) return Math.max(2, fallbackMinutes - 1);
  return fallbackMinutes;
}

function computeRetrievability(elapsedDays: number, stability: number): number {
  if (elapsedDays <= 0) return 1;
  return clamp(Math.pow(1 + elapsedDays / (9 * stability), -1), 0.01, 1);
}

function nextStability(input: {
  currentStability: number;
  currentDifficulty: number;
  rating: LegalStudyReviewRating;
  elapsedDays: number;
  retrievability: number;
}): number {
  const { currentStability, currentDifficulty, rating, elapsedDays, retrievability } = input;
  if (rating === 'again') {
    const difficultyPenalty = 1 - (currentDifficulty - MIN_DIFFICULTY) / 18;
    return round(clamp(currentStability * 0.45 * difficultyPenalty, MIN_STABILITY, MAX_STABILITY));
  }

  const gradeBonus = rating === 'hard' ? 1.2 : rating === 'good' ? 2.1 : 3.2;
  const difficultyFactor = 1 + (MAX_DIFFICULTY - currentDifficulty) / 12;
  const forgettingFactor = 1 + (1 - retrievability) * 1.8;
  const elapsedFactor = 1 + Math.min(elapsedDays, 30) / 60;
  const growth = 1 + (gradeBonus * difficultyFactor * forgettingFactor * elapsedFactor) / 10;
  const stability = rating === 'hard'
    ? Math.max(currentStability + 0.5, currentStability * Math.min(growth, 1.45))
    : currentStability * growth;
  return round(clamp(stability, MIN_STABILITY, MAX_STABILITY));
}

function nextDifficulty(current: number, rating: LegalStudyReviewRating): number {
  const delta = rating === 'again' ? 1.35 : rating === 'hard' ? 0.55 : rating === 'good' ? -0.15 : -0.55;
  const meanReversion = (5 - current) * 0.08;
  return round(clamp(current + delta + meanReversion, MIN_DIFFICULTY, MAX_DIFFICULTY));
}

function intervalFromStability(
  stability: number,
  desiredRetention: number,
  rating: LegalStudyReviewRating
): number {
  const days = Math.ceil(stability * 9 * (1 / desiredRetention - 1));
  const minimum = rating === 'hard' ? 1 : rating === 'good' ? 2 : 3;
  return Math.max(minimum, Math.min(3650, days));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

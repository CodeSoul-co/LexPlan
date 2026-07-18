import type {
  LegalStudyCoursePressure,
  LegalStudyDailyPlan,
  LegalStudyDailyPlanTask,
  LegalStudyLearningSnapshot,
  LegalStudyPlanChange,
  LegalStudyPlanProposal,
  LegalStudyReviewPressure,
} from '../types';
import { computeReviewPressure } from '../review/fsrs-lite';
import { computeCoursePressure } from '../scheduling/pressure';

export interface DraftPlanProposalInput {
  snapshot: LegalStudyLearningSnapshot;
  date: string;
  now?: string;
  windowDays?: number;
  availableMinutesByDate?: Record<string, number>;
  maxNewCardsPerDay?: number;
}

interface BuildRollingPlanContext {
  coursePressureByDate: Map<string, LegalStudyCoursePressure[]>;
  reviewPressureByDate: Map<string, LegalStudyReviewPressure>;
  maxNewCardsPerDay: number;
}

export function draftPlanProposal(input: DraftPlanProposalInput): LegalStudyPlanProposal {
  const now = input.now ?? new Date().toISOString();
  const windowDays = normalizeWindowDays(input.windowDays);
  const dates = dateRange(input.date, windowDays);
  const beforePlans = dates.map((date) => currentPlanForDate(
    input.snapshot,
    date,
    now,
    input.availableMinutesByDate?.[date]
  ));
  const coursePressureByDate = new Map(
    dates.map((date) => [date, computeCoursePressure(input.snapshot, date)])
  );
  const reviewPressureByDate = new Map(
    beforePlans.map((plan) => [
      plan.date,
      computeReviewPressure(input.snapshot, plan.date, plan.availableMinutes),
    ])
  );
  const context: BuildRollingPlanContext = {
    coursePressureByDate,
    reviewPressureByDate,
    maxNewCardsPerDay: input.maxNewCardsPerDay ?? 3,
  };
  const afterPlans = buildRollingAfterPlans(input.snapshot, beforePlans, context);
  const validation = validateRollingPlanProposal(input.snapshot, beforePlans, afterPlans);
  const changes = diffRollingPlans(beforePlans, afterPlans, reviewPressureByDate);
  const affectedSubjects = Array.from(
    new Set(afterPlans.flatMap((plan) => plan.tasks.map((task) => task.subjectId)))
  );
  const risks = collectRisks(coursePressureByDate, reviewPressureByDate);
  const drivers = explainDrivers(coursePressureByDate, reviewPressureByDate);
  const timeComparison = beforePlans.map((beforePlan) => {
    const afterPlan = afterPlans.find((plan) => plan.date === beforePlan.date) ?? beforePlan;
    return {
      date: beforePlan.date,
      beforeMinutes: sumMinutes(beforePlan.tasks),
      afterMinutes: sumMinutes(afterPlan.tasks),
      availableMinutes: afterPlan.availableMinutes,
    };
  });
  const beforePlan = beforePlans[0];
  const afterPlan = afterPlans[0];

  return {
    id: `proposal-${input.date}-${hashPlans(afterPlans)}`,
    userId: input.snapshot.userId,
    status: 'pending',
    snapshotRef: `${input.snapshot.userId}:${input.snapshot.capturedAt}`,
    generatedAt: now,
    summary: validation.valid
      ? `建议按 ${windowDays} 天滚动计划保留到期复习、锁定任务，并优先处理高风险课程。`
      : '当前滚动计划存在硬约束冲突，需要人工调整后再应用。',
    risks,
    changes,
    beforePlan,
    afterPlan,
    beforePlans,
    afterPlans,
    planningWindow: {
      startDate: input.date,
      days: windowDays,
      examDate: input.snapshot.examDate,
    },
    validation,
    explanation: {
      why: explainWhy(coursePressureByDate, reviewPressureByDate),
      affectedSubjects,
      impact: validation.valid
        ? `未来 ${windowDays} 天计划均未超过每日可用时间；首日预计 ${sumMinutes(afterPlan.tasks)} / ${afterPlan.availableMinutes} 分钟。`
        : `发现 ${validation.violations.length} 个硬约束冲突。`,
      userEditableFields: ['task order', 'course episode selection', 'new card batch size', 'available minutes'],
      drivers,
      taskChanges: changes,
      timeComparison,
    },
  };
}

export function validatePlanProposal(
  snapshot: LegalStudyLearningSnapshot,
  beforePlan: LegalStudyDailyPlan,
  afterPlan: LegalStudyDailyPlan,
  date: string
): LegalStudyPlanProposal['validation'] {
  return validateOneDayPlan(snapshot, beforePlan, { ...afterPlan, date }, date);
}

export function validateRollingPlanProposal(
  snapshot: LegalStudyLearningSnapshot,
  beforePlans: LegalStudyDailyPlan[],
  afterPlans: LegalStudyDailyPlan[]
): LegalStudyPlanProposal['validation'] {
  const violations: string[] = [];
  const warnings: string[] = [];
  for (const afterPlan of afterPlans) {
    const beforePlan = beforePlans.find((plan) => plan.date === afterPlan.date) ?? emptyPlan(snapshot, afterPlan.date, afterPlan.createdAt, afterPlan.availableMinutes);
    const result = validateOneDayPlan(snapshot, beforePlan, afterPlan, afterPlan.date);
    violations.push(...result.violations);
    warnings.push(...result.warnings);
  }
  if (snapshot.rejectedProposalFingerprints.includes(hashPlans(afterPlans))) {
    warnings.push('A similar rolling proposal was rejected before.');
  }
  return {
    valid: violations.length === 0,
    violations: Array.from(new Set(violations)),
    warnings: Array.from(new Set(warnings)),
  };
}

export function applyAcceptedProposal(
  snapshot: LegalStudyLearningSnapshot,
  proposal: LegalStudyPlanProposal,
  appliedAt = new Date().toISOString()
): LegalStudyLearningSnapshot {
  if (!proposal.validation.valid) {
    throw new Error('Cannot apply an invalid legal-study plan proposal.');
  }
  if (proposal.status !== 'accepted' && proposal.status !== 'pending') {
    throw new Error(`Cannot apply proposal with status ${proposal.status}.`);
  }
  const afterPlans = proposal.afterPlans ?? [proposal.afterPlan];
  const afterPlanIds = new Set(afterPlans.map((plan) => plan.id));
  const afterPlanDates = new Set(afterPlans.map((plan) => plan.date));
  return {
    ...snapshot,
    capturedAt: appliedAt,
    plans: [
      ...snapshot.plans.filter((plan) => !afterPlanIds.has(plan.id) && !afterPlanDates.has(plan.date)),
      ...afterPlans.map((plan) => ({ ...plan, updatedAt: appliedAt })),
    ],
  };
}

export function recordRejectedProposal(
  snapshot: LegalStudyLearningSnapshot,
  proposal: LegalStudyPlanProposal,
  rejectedAt = new Date().toISOString()
): LegalStudyLearningSnapshot {
  const fingerprint = hashPlans(proposal.afterPlans ?? [proposal.afterPlan]);
  return {
    ...snapshot,
    capturedAt: rejectedAt,
    rejectedProposalFingerprints: Array.from(
      new Set([...snapshot.rejectedProposalFingerprints, fingerprint])
    ),
  };
}

function buildRollingAfterPlans(
  snapshot: LegalStudyLearningSnapshot,
  beforePlans: LegalStudyDailyPlan[],
  context: BuildRollingPlanContext
): LegalStudyDailyPlan[] {
  const scheduledEpisodeIds = new Set<string>();
  const scheduledNewCardIds = new Set<string>();
  const plans: LegalStudyDailyPlan[] = [];

  for (const beforePlan of beforePlans) {
    const afterPlan = buildAfterPlan(
      snapshot,
      beforePlan,
      context.coursePressureByDate.get(beforePlan.date) ?? [],
      context.reviewPressureByDate.get(beforePlan.date) ?? computeReviewPressure(snapshot, beforePlan.date, beforePlan.availableMinutes),
      scheduledEpisodeIds,
      scheduledNewCardIds,
      context.maxNewCardsPerDay
    );
    plans.push(afterPlan);
  }
  return plans;
}

function currentPlanForDate(
  snapshot: LegalStudyLearningSnapshot,
  date: string,
  now: string,
  availableMinutes?: number
): LegalStudyDailyPlan {
  const existing = snapshot.plans.find((plan) => plan.date === date);
  if (existing) {
    return {
      ...existing,
      availableMinutes: availableMinutes ?? existing.availableMinutes,
    };
  }
  return emptyPlan(snapshot, date, now, availableMinutes ?? snapshot.availableMinutesToday);
}

function emptyPlan(
  snapshot: LegalStudyLearningSnapshot,
  date: string,
  now: string | undefined,
  availableMinutes: number
): LegalStudyDailyPlan {
  return {
    id: `plan-${date}`,
    userId: snapshot.userId,
    date,
    availableMinutes,
    tasks: [],
    createdAt: now ?? new Date().toISOString(),
  };
}

function buildAfterPlan(
  snapshot: LegalStudyLearningSnapshot,
  beforePlan: LegalStudyDailyPlan,
  coursePressure: LegalStudyCoursePressure[],
  reviewPressure: LegalStudyReviewPressure,
  scheduledEpisodeIds: Set<string>,
  scheduledNewCardIds: Set<string>,
  maxNewCardsPerDay: number
): LegalStudyDailyPlan {
  const tasks: LegalStudyDailyPlanTask[] = [];
  for (const task of beforePlan.tasks.filter((candidate) => candidate.lockedByUser)) {
    tasks.push(task);
    if (task.kind === 'course_episode') scheduledEpisodeIds.add(task.refId);
    if (task.kind === 'new_card') scheduledNewCardIds.add(task.refId);
  }

  for (const item of reviewPressure.dueItems) {
    if (tasks.some((task) => task.kind === 'due_review' && task.refId === item.cardId)) continue;
    tasks.push({
      id: `task-review-${item.cardId}-${beforePlan.date}`,
      kind: 'due_review',
      subjectId: item.subjectId,
      refId: item.cardId,
      estimatedMinutes: item.estimatedMinutes,
    });
  }

  let remainingMinutes = beforePlan.availableMinutes - sumMinutes(tasks);
  for (const pressure of coursePressure) {
    if (remainingMinutes <= 0) break;
    const episodes = snapshot.episodes
      .filter((candidate) =>
        candidate.courseId === pressure.courseId &&
        candidate.status !== 'completed' &&
        !candidate.lockedByUser &&
        !scheduledEpisodeIds.has(candidate.id) &&
        !tasks.some((task) => task.refId === candidate.id)
      )
      .sort((left, right) => left.order - right.order);
    for (const episode of episodes) {
      if (episode.durationMinutes > remainingMinutes) continue;
      tasks.push({
        id: `task-course-${episode.id}-${beforePlan.date}`,
        kind: 'course_episode',
        subjectId: pressure.subjectId,
        refId: episode.id,
        estimatedMinutes: episode.durationMinutes,
      });
      scheduledEpisodeIds.add(episode.id);
      remainingMinutes -= episode.durationMinutes;
      break;
    }
  }

  let newCardsAdded = 0;
  const unlockedCards = snapshot.cards.filter(
    (card) =>
      card.status === 'confirmed' &&
      card.unlockStatus === 'unlocked' &&
      !scheduledNewCardIds.has(card.id) &&
      !tasks.some((task) => task.refId === card.id)
  );
  for (const card of unlockedCards) {
    if (remainingMinutes < 4 || newCardsAdded >= maxNewCardsPerDay) break;
    tasks.push({
      id: `task-new-card-${card.id}-${beforePlan.date}`,
      kind: 'new_card',
      subjectId: card.subjectId,
      refId: card.id,
      estimatedMinutes: 4,
    });
    scheduledNewCardIds.add(card.id);
    newCardsAdded += 1;
    remainingMinutes -= 4;
  }

  return {
    ...beforePlan,
    tasks,
  };
}

function validateOneDayPlan(
  snapshot: LegalStudyLearningSnapshot,
  beforePlan: LegalStudyDailyPlan,
  afterPlan: LegalStudyDailyPlan,
  date: string
): LegalStudyPlanProposal['validation'] {
  const violations: string[] = [];
  const warnings: string[] = [];
  const totalMinutes = sumMinutes(afterPlan.tasks);
  if (totalMinutes > afterPlan.availableMinutes) {
    violations.push(
      `${date}: Daily plan uses ${totalMinutes} minutes but only ${afterPlan.availableMinutes} are available.`
    );
  }

  const afterTaskKeys = new Set(afterPlan.tasks.map(taskKey));
  for (const lockedTask of beforePlan.tasks.filter((task) => task.lockedByUser)) {
    if (!afterTaskKeys.has(taskKey(lockedTask))) {
      violations.push(`${date}: Locked task cannot be removed: ${lockedTask.id}.`);
    }
  }

  const dueReviewCardIds = computeReviewPressure(snapshot, date, afterPlan.availableMinutes).dueItems.map(
    (item) => item.cardId
  );
  const plannedDueReviewIds = new Set(
    afterPlan.tasks.filter((task) => task.kind === 'due_review').map((task) => task.refId)
  );
  for (const cardId of dueReviewCardIds) {
    if (!plannedDueReviewIds.has(cardId)) {
      violations.push(`${date}: Due review card cannot be omitted: ${cardId}.`);
    }
  }

  for (const task of afterPlan.tasks.filter((candidate) => candidate.kind === 'new_card')) {
    const card = snapshot.cards.find((candidate) => candidate.id === task.refId);
    if (!card) {
      violations.push(`${date}: New-card task references missing card: ${task.refId}.`);
      continue;
    }
    if (card.unlockStatus === 'locked') {
      violations.push(`${date}: Locked card cannot be scheduled early: ${card.id}.`);
    }
    if (card.status !== 'confirmed') {
      violations.push(`${date}: Unconfirmed card cannot enter the learning queue: ${card.id}.`);
    }
  }

  const newCardCount = afterPlan.tasks.filter((task) => task.kind === 'new_card').length;
  if (newCardCount > 3) {
    warnings.push(`${date}: New-card release pace is high (${newCardCount} cards).`);
  }

  return {
    valid: violations.length === 0,
    violations,
    warnings,
  };
}

function diffRollingPlans(
  beforePlans: LegalStudyDailyPlan[],
  afterPlans: LegalStudyDailyPlan[],
  reviewPressureByDate: Map<string, LegalStudyReviewPressure>
): LegalStudyPlanChange[] {
  const changes: LegalStudyPlanChange[] = [];
  for (const afterPlan of afterPlans) {
    const beforePlan = beforePlans.find((plan) => plan.date === afterPlan.date) ?? { ...afterPlan, tasks: [] };
    changes.push(...diffPlans(beforePlan, afterPlan, reviewPressureByDate.get(afterPlan.date)));
  }
  return changes;
}

function diffPlans(
  beforePlan: LegalStudyDailyPlan,
  afterPlan: LegalStudyDailyPlan,
  reviewPressure?: LegalStudyReviewPressure
): LegalStudyPlanChange[] {
  const beforeKeys = new Set(beforePlan.tasks.map(taskKey));
  const afterKeys = new Set(afterPlan.tasks.map(taskKey));
  const changes: LegalStudyPlanChange[] = [];
  for (const task of beforePlan.tasks) {
    if (!afterKeys.has(taskKey(task))) {
      changes.push({
        type: 'remove_task',
        reason: `${beforePlan.date}: 非锁定任务被移出滚动计划以释放容量。`,
        before: task,
      });
    }
  }
  for (const task of afterPlan.tasks) {
    if (!beforeKeys.has(taskKey(task))) {
      changes.push({
        type: task.kind === 'due_review' ? 'preserve_due_review' : 'add_task',
        reason:
          task.kind === 'due_review'
            ? `${afterPlan.date}: 到期旧卡必须保留在计划中。`
            : `${afterPlan.date}: 在剩余容量内补入高优先级学习任务。`,
        after: task,
      });
    }
  }
  if (reviewPressure && reviewPressure.dueCount > 0) {
    changes.push({
      type: 'preserve_due_review',
      reason: `${afterPlan.date}: 有 ${reviewPressure.dueCount} 张到期旧卡，预计 ${reviewPressure.dueMinutes} 分钟。`,
    });
  }
  return changes;
}

function collectRisks(
  coursePressureByDate: Map<string, LegalStudyCoursePressure[]>,
  reviewPressureByDate: Map<string, LegalStudyReviewPressure>
): string[] {
  const risks: string[] = [];
  for (const [date, pressures] of coursePressureByDate) {
    for (const pressure of pressures.filter((item) => item.risk === 'high' || item.risk === 'critical')) {
      risks.push(`${date}: Course ${pressure.courseId} risk is ${pressure.risk}.`);
    }
  }
  for (const [date, pressure] of reviewPressureByDate) {
    if (pressure.risk === 'high' || pressure.risk === 'critical') {
      risks.push(`${date}: Review pressure is ${pressure.risk}.`);
    }
  }
  return risks;
}

function explainDrivers(
  coursePressureByDate: Map<string, LegalStudyCoursePressure[]>,
  reviewPressureByDate: Map<string, LegalStudyReviewPressure>
): string[] {
  const drivers: string[] = [];
  const firstDate = Array.from(coursePressureByDate.keys())[0];
  const firstCourse = firstDate ? coursePressureByDate.get(firstDate)?.[0] : undefined;
  const firstReview = firstDate ? reviewPressureByDate.get(firstDate) : undefined;
  if (firstReview) {
    drivers.push(`复习压力：${firstDate} 有 ${firstReview.dueCount} 张到期旧卡，预计 ${firstReview.dueMinutes} 分钟。`);
  }
  if (firstCourse) {
    drivers.push(`课程风险：${firstCourse.courseId} 剩余 ${firstCourse.remainingMinutes} 分钟，deadline 前日均需要 ${firstCourse.requiredDailyMinutes} 分钟。`);
  }
  return drivers;
}

function explainWhy(
  coursePressureByDate: Map<string, LegalStudyCoursePressure[]>,
  reviewPressureByDate: Map<string, LegalStudyReviewPressure>
): string {
  const drivers = explainDrivers(coursePressureByDate, reviewPressureByDate);
  return drivers.length
    ? `${drivers.join(' ')} 因此先保留到期复习和锁定任务，再把剩余时间分配给高风险课程与少量新卡。`
    : '当前没有显著课程或复习压力，维持轻量滚动计划。';
}

function taskKey(task: LegalStudyDailyPlanTask): string {
  return `${task.kind}:${task.refId}`;
}

function sumMinutes(tasks: LegalStudyDailyPlanTask[]): number {
  return tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
}

function hashPlans(plans: LegalStudyDailyPlan[]): string {
  return plans
    .map((plan) => `${plan.date}[${hashPlan(plan)}]`)
    .join('||');
}

function hashPlan(plan: LegalStudyDailyPlan): string {
  return plan.tasks
    .map((task) => `${task.kind}:${task.refId}:${task.estimatedMinutes}:${task.lockedByUser ? 'locked' : 'open'}`)
    .join('|');
}

function normalizeWindowDays(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 3;
  return Math.min(7, Math.max(3, value));
}

function dateRange(startDate: string, days: number): string[] {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start + index * 86400000);
    return date.toISOString().slice(0, 10);
  });
}

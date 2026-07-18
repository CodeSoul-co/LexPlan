import { describe, expect, it } from 'vitest';
import { createLegalStudySeedSnapshot, LEGAL_STUDY_SEED_TODAY } from '../seed-data';
import { completeEpisodeAndUnlockCards } from '../mapping/unlock';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import { InMemoryLegalStudyProposalStore, LegalStudyAgentService } from './agent-service';

describe('LegalStudyAgentService', () => {
  it('builds a risk dashboard and drafts a valid proposal', async () => {
    const snapshot = completeEpisodeAndUnlockCards(
      createLegalStudySeedSnapshot(),
      'episode-civil-contract-formation',
      '2026-07-08T08:00:00.000Z'
    ).snapshot;
    const service = new LegalStudyAgentService(
      new InMemoryLegalStudyRepository(snapshot),
      new InMemoryLegalStudyProposalStore()
    );

    const dashboard = await service.getRiskDashboard(LEGAL_STUDY_SEED_TODAY);
    expect(dashboard.coursePressure.length).toBeGreaterThan(0);
    expect(dashboard.reviewPressure.dueCount).toBe(1);

    const proposal = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T09:00:00.000Z',
    });
    expect(proposal.validation.valid).toBe(true);
    expect(proposal.afterPlan.tasks.map((task) => task.kind)).toContain('due_review');
    expect(await service.listProposals({ status: 'pending' })).toHaveLength(1);
  });

  it('enriches proposal explanation with insight without changing the generated plan', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyAgentService(repository, new InMemoryLegalStudyProposalStore(), {
      insightProvider: {
        id: 'agent-insight.test',
        async generateInsight({ proposal, now }) {
          return {
            provider: 'agent-insight.test',
            generatedAt: now ?? '2026-07-08T09:00:00.000Z',
            personalization: '先保留旧卡，再用剩余时间推进高风险课程。',
            tradeoffs: ['牺牲少量新卡速度，换取复习和课程 deadline 的确定性。'],
            suggestedModifications: [
              {
                id: 'test-suggestion',
                title: '把可延后新卡移到明天',
                rationale: '当天接近满载时降低执行失败风险。',
                expectedImpact: '今日更稳，但新卡节奏略慢。',
                affectedTaskIds: proposal.afterPlan.tasks.slice(0, 1).map((task) => task.id),
                requiresHumanConfirmation: true,
              },
            ],
            caveats: ['不会自动写入计划。'],
          };
        },
      },
    });

    const proposal = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T09:00:00.000Z',
    });

    expect(proposal.explanation.llmInsight?.provider).toBe('agent-insight.test');
    expect(proposal.explanation.llmInsight?.suggestedModifications[0].requiresHumanConfirmation).toBe(true);
    expect(proposal.summary).toBe('先保留旧卡，再用剩余时间推进高风险课程。');
    expect((await repository.getSnapshot()).plans).toHaveLength(createLegalStudySeedSnapshot().plans.length);
  });
  it('accepts proposals and applies the after plan to the repository', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyAgentService(repository, new InMemoryLegalStudyProposalStore());
    const proposal = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T09:10:00.000Z',
    });

    const accepted = await service.decideProposal({
      proposalId: proposal.id,
      decision: 'accepted',
      decidedAt: '2026-07-08T09:20:00.000Z',
    });

    expect(accepted.status).toBe('accepted');
    expect((await repository.getSnapshot()).plans.find((plan) => plan.id === proposal.afterPlan.id)).toMatchObject({
      updatedAt: '2026-07-08T09:20:00.000Z',
      tasks: proposal.afterPlan.tasks,
    });
  });

  it('stores user modifications and applies them as modified decisions', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyAgentService(repository, new InMemoryLegalStudyProposalStore());
    const proposal = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T09:30:00.000Z',
    });
    const afterPlan = {
      ...proposal.afterPlan,
      tasks: [...proposal.afterPlan.tasks].reverse(),
    };

    const modified = await service.modifyProposal({
      proposalId: proposal.id,
      afterPlan,
      reason: '用户调整复习任务顺序。',
      now: '2026-07-08T09:40:00.000Z',
    });
    expect(modified.validation.valid).toBe(true);
    expect(modified.changes.at(-1)?.reason).toBe('用户调整复习任务顺序。');

    const decided = await service.decideProposal({
      proposalId: proposal.id,
      decision: 'modified',
      decidedAt: '2026-07-08T09:50:00.000Z',
    });
    expect(decided.status).toBe('modified');
    expect((await repository.getSnapshot()).plans.find((plan) => plan.id === afterPlan.id)?.tasks).toEqual(
      afterPlan.tasks
    );
  });

  it('records rejected fingerprints and can undo applied proposals', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyAgentService(repository, new InMemoryLegalStudyProposalStore());
    const rejected = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T10:00:00.000Z',
    });

    await service.decideProposal({
      proposalId: rejected.id,
      decision: 'rejected',
      decidedAt: '2026-07-08T10:05:00.000Z',
    });
    expect((await repository.getSnapshot()).rejectedProposalFingerprints.length).toBe(1);

    const accepted = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T10:10:00.000Z',
    });
    await service.decideProposal({
      proposalId: accepted.id,
      decision: 'accepted',
      decidedAt: '2026-07-08T10:15:00.000Z',
    });
    const undone = await service.decideProposal({
      proposalId: accepted.id,
      decision: 'undone',
      decidedAt: '2026-07-08T10:20:00.000Z',
    });

    expect(undone.status).toBe('undone');
    expect((await repository.getSnapshot()).plans.find((plan) => plan.id === accepted.beforePlan.id)?.tasks).toEqual(
      accepted.beforePlan.tasks
    );
  });
  it('builds a 3-7 day constrained rolling plan that reacts to course and review risk', async () => {
    const base = createLegalStudySeedSnapshot();
    const extraCards = Array.from({ length: 20 }, (_, index) => ({
      ...base.cards[3],
      id: `card-extra-due-${index}`,
      sliceId: `slice-extra-due-${index}`,
      front: `额外到期旧卡 ${index}`,
      createdAt: base.capturedAt,
    }));
    const extraReviews = extraCards.map((card, index) => ({
      ...base.reviewStates[0],
      id: `review-${card.id}`,
      cardId: card.id,
      dueAt: '2026-07-07T00:00:00.000Z',
      createdAt: base.capturedAt,
      reps: index + 1,
    }));
    const snapshot = {
      ...base,
      availableMinutesToday: 130,
      courses: [
        ...base.courses,
        {
          id: 'course-civil-risky',
          userId: base.userId,
          subjectId: 'subject-civil',
          title: '民法延期风险课',
          deadline: '2026-07-08',
          source: 'manual' as const,
          createdAt: base.capturedAt,
        },
      ],
      episodes: [
        ...base.episodes,
        {
          id: 'episode-civil-risky-1',
          userId: base.userId,
          courseId: 'course-civil-risky',
          title: '高风险课程第一讲',
          order: 1,
          durationMinutes: 60,
          status: 'pending' as const,
          createdAt: base.capturedAt,
        },
        {
          id: 'episode-civil-risky-2',
          userId: base.userId,
          courseId: 'course-civil-risky',
          title: '高风险课程第二讲',
          order: 2,
          durationMinutes: 60,
          status: 'pending' as const,
          createdAt: base.capturedAt,
        },
      ],
      cards: [...base.cards, ...extraCards],
      reviewStates: [...base.reviewStates, ...extraReviews],
      plans: [
        {
          ...base.plans[0],
          availableMinutes: 130,
        },
      ],
    };
    const repository = new InMemoryLegalStudyRepository(snapshot);
    const service = new LegalStudyAgentService(repository, new InMemoryLegalStudyProposalStore());

    const dashboard = await service.getRiskDashboard(LEGAL_STUDY_SEED_TODAY);
    expect(dashboard.coursePressure.some((pressure) => pressure.courseId === 'course-civil-risky' && pressure.risk === 'high')).toBe(true);
    expect(dashboard.reviewPressure.risk).toBe('high');

    const proposal = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T11:00:00.000Z',
      windowDays: 5,
    });

    expect(proposal.planningWindow).toMatchObject({ days: 5, examDate: snapshot.examDate });
    expect(proposal.afterPlans).toHaveLength(5);
    expect(proposal.validation.valid).toBe(true);
    for (const plan of proposal.afterPlans ?? []) {
      expect(plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBeLessThanOrEqual(plan.availableMinutes);
      expect(plan.tasks.some((task) => task.kind === 'new_card' && task.refId === 'card-civil-validity-pending')).toBe(false);
    }
    expect(proposal.afterPlan.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ refId: 'episode-criminal-act', lockedByUser: true }),
        expect.objectContaining({ kind: 'due_review', refId: 'card-criminal-act-due' }),
      ])
    );
    expect(proposal.explanation.drivers?.join(' ')).toContain('复习压力');
    expect(proposal.explanation.drivers?.join(' ')).toContain('课程风险');
    expect(proposal.explanation.timeComparison).toHaveLength(5);
  });

  it('applies and undoes rolling plans without losing the original plan window', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyAgentService(repository, new InMemoryLegalStudyProposalStore());
    const proposal = await service.draftProposal({
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-08T12:00:00.000Z',
      windowDays: 4,
    });

    await service.decideProposal({
      proposalId: proposal.id,
      decision: 'accepted',
      decidedAt: '2026-07-08T12:10:00.000Z',
    });
    const acceptedSnapshot = await repository.getSnapshot();
    for (const plan of proposal.afterPlans ?? []) {
      expect(acceptedSnapshot.plans.find((candidate) => candidate.date === plan.date)?.tasks).toEqual(plan.tasks);
    }

    const undone = await service.decideProposal({
      proposalId: proposal.id,
      decision: 'undone',
      decidedAt: '2026-07-08T12:20:00.000Z',
    });
    expect(undone.status).toBe('undone');
    const restoredSnapshot = await repository.getSnapshot();
    for (const plan of proposal.beforePlans ?? []) {
      expect(restoredSnapshot.plans.find((candidate) => candidate.date === plan.date)?.tasks).toEqual(plan.tasks);
    }
  });
});

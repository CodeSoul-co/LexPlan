import { describe, expect, it } from 'vitest';
import { InMemoryLegalStudyProposalStore, LegalStudyAgentService } from '../agent/agent-service';
import { MockBilibiliCourseImportProvider } from '../courses/bilibili-import';
import { LegalStudyCourseService } from '../courses/course-service';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { DeterministicCardGenerationProvider } from '../ingestion/card-generation';
import { LegalStudyMappingService } from '../mapping/mapping-service';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import { LegalStudyReviewService } from '../review/review-service';
import { LegalStudyTextbookService } from '../textbooks/textbook-service';
import { LEGAL_STUDY_TOOL_IDS } from '../tools';
import { LegalStudyRuntime } from '../runtime/legal-study-runtime';

describe('legal-study backend acceptance scenarios', () => {
  it('runs the four core links from course intake to Agent-controlled review planning', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const proposalStore = new InMemoryLegalStudyProposalStore();
    const userId = (await repository.getSnapshot()).userId;

    const courseService = new LegalStudyCourseService(repository, {
      bilibiliProvider: new MockBilibiliCourseImportProvider({
        now: '2026-07-07T08:00:00.000Z',
        title: '民法强化课验收样例',
      }),
    });
    const textbookService = new LegalStudyTextbookService(repository, {
      cardGenerationProvider: new DeterministicCardGenerationProvider(),
    });
    const mappingService = new LegalStudyMappingService(repository);
    const reviewService = new LegalStudyReviewService(repository);
    const agentService = new LegalStudyAgentService(repository, proposalStore);

    const imported = await courseService.importBilibiliCourse({
      userId,
      subjectId: 'subject-civil',
      url: 'https://www.bilibili.com/video/BV1law2026?p=1',
      deadline: '2026-08-30',
      now: '2026-07-07T08:00:00.000Z',
    });
    expect(imported.course.source).toBe('bilibili');
    expect(imported.episodes).toHaveLength(3);

    const overview = await courseService.getCourseOverview(imported.course.id);
    expect(overview.stats).toMatchObject({
      totalEpisodeCount: 3,
      completedEpisodeCount: 0,
      remainingEpisodeCount: 3,
    });
    expect(overview.stats.remainingMinutes).toBeGreaterThan(0);

    const ingested = await textbookService.ingestTextbook({
      userId,
      subjectId: 'subject-civil',
      textbookTitle: '民法验收讲义',
      text: [
        '第一章 合同成立',
        '合同成立通常经过要约和承诺。承诺生效时合同成立。',
        '',
        '第二章 合同效力',
        '合同效力需要在合同成立之后判断，重点关注效力瑕疵和补正。',
      ].join('\n'),
      confirmCards: false,
      now: '2026-07-07T08:10:00.000Z',
    });
    expect(ingested.report).toMatchObject({
      ocrStatus: 'succeeded',
      chaptersDetected: 2,
    });
    expect(ingested.cards.length).toBeGreaterThanOrEqual(4);
    expect(ingested.cards.every((card) => card.status === 'pending_confirmation')).toBe(true);

    const confirmedCards = await textbookService.confirmCardBatch({
      cardIds: ingested.cards.map((card) => card.id),
      now: '2026-07-07T08:20:00.000Z',
    });
    expect(confirmedCards.every((card) => card.status === 'confirmed')).toBe(true);

    const suggestions = await mappingService.suggestMappings({
      subjectId: 'subject-civil',
      minConfidence: 0.5,
    });
    expect(
      suggestions.some((suggestion) => suggestion.episode.id === 'episode-civil-contract-formation')
    ).toBe(true);

    const unlock = await mappingService.applyUnlocks(
      'episode-civil-contract-formation',
      '2026-07-07T09:00:00.000Z'
    );
    expect(unlock.report.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);

    const newCards = await reviewService.listNewCards({ subjectId: 'subject-civil' });
    expect(newCards.map((card) => card.id)).toContain('card-civil-offer-acceptance');

    const learned = await reviewService.learnNewCard({
      cardId: 'card-civil-offer-acceptance',
      learnedAt: '2026-07-07T09:10:00.000Z',
    });
    expect(learned.card.unlockStatus).toBe('learned');
    expect(learned.after).toMatchObject({
      cardId: 'card-civil-offer-acceptance',
      reps: 0,
      dueAt: '2026-07-08T09:10:00.000Z',
    });

    const risk = await agentService.getRiskDashboard('2026-07-07');
    expect(risk.reviewPressure.dueItems.map((item) => item.cardId)).toContain(
      'card-criminal-act-due'
    );

    const submitted = await reviewService.submitReview({
      cardId: 'card-criminal-act-due',
      rating: 'good',
      reviewedAt: '2026-07-07T10:00:00.000Z',
    });
    expect(submitted.after.reps).toBe(submitted.before.reps + 1);
    expect(submitted.after.dueAt).not.toBe(submitted.before.dueAt);

    const proposal = await agentService.draftProposal({
      date: '2026-07-07',
      now: '2026-07-07T10:20:00.000Z',
    });
    expect(proposal.validation.valid).toBe(true);
    expect(proposal.afterPlan.tasks.map((task) => task.kind)).toContain('new_card');

    const accepted = await agentService.decideProposal({
      proposalId: proposal.id,
      decision: 'accepted',
      decidedAt: '2026-07-07T10:30:00.000Z',
    });
    expect(accepted.status).toBe('accepted');

    const undone = await agentService.decideProposal({
      proposalId: proposal.id,
      decision: 'undone',
      decidedAt: '2026-07-07T10:40:00.000Z',
    });
    expect(undone.status).toBe('undone');
  });

  it('enforces tool policy while still allowing approved backend operations', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const proposalStore = new InMemoryLegalStudyProposalStore();
    const runtime = new LegalStudyRuntime(await repository.getSnapshot(), {
      repository,
      proposalStore,
    });

    const pressure = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.getAgentRiskDashboard,
      { date: '2026-07-07' },
      { runId: 'acceptance-tool', stepId: 'risk' }
    );
    expect(pressure.status).toBe('completed');

    const unlockInput = {
      episodeId: 'episode-civil-contract-formation',
      completedAt: '2026-07-07T11:00:00.000Z',
    };
    const blockedUnlock = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.applyUnlocks,
      unlockInput,
      {
        runId: 'acceptance-tool',
        stepId: 'unlock',
      }
    );
    expect(blockedUnlock.status).toBe('human_review_required');
    const approvedUnlock = await runtime.approveAndResumeTool(blockedUnlock.invocationId!, 'owner');
    expect(approvedUnlock.status).toBe('completed');

    const learnInput = {
      cardId: 'card-civil-offer-acceptance',
      learnedAt: '2026-07-07T11:05:00.000Z',
    };
    const blockedLearn = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.learnNewCard,
      learnInput,
      {
        runId: 'acceptance-tool',
        stepId: 'learn',
      }
    );
    expect(blockedLearn.status).toBe('human_review_required');
    const approvedLearn = await runtime.approveAndResumeTool(blockedLearn.invocationId!, 'owner');
    expect(approvedLearn.status).toBe('completed');

    const draft = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.draftAgentProposal,
      { date: '2026-07-07', now: '2026-07-07T11:10:00.000Z' },
      { runId: 'acceptance-tool', stepId: 'draft' }
    );
    expect(draft.status).toBe('completed');
    const proposalId = (draft.output as { id: string }).id;

    const decisionInput = {
      proposalId,
      decision: 'accepted',
      decidedAt: '2026-07-07T11:20:00.000Z',
    };
    const pendingDecision = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.decideAgentProposal,
      decisionInput,
      { runId: 'acceptance-tool', stepId: 'accept' }
    );
    expect(pendingDecision.status).toBe('human_review_required');
    const accepted = await runtime.approveAndResumeTool(pendingDecision.invocationId!, 'owner');
    expect(accepted.status).toBe('completed');
  });
});

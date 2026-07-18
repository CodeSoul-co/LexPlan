import { describe, expect, it } from 'vitest';
import { LegalStudyRuntime } from './runtime/legal-study-runtime';
import { LEGAL_STUDY_TOOL_IDS } from './tools';

describe('@lexplan/backend core workflow chain', () => {
  it('runs OCR ingestion, card generation, chapter unlock, review projection, and proposal drafting', async () => {
    const runtime = new LegalStudyRuntime();
    const report = await runtime.ingestTextbook({
      userId: runtime.getSnapshot().userId,
      subjectId: 'subject-civil',
      textbookTitle: '民法补充讲义',
      text: [
        '第一章 合同成立',
        '合同成立通常经过要约和承诺。承诺生效时合同成立。',
        '',
        '第二章 合同效力',
        '合同效力需要在合同成立之后判断。',
      ].join('\n'),
      confirmCards: true,
      now: '2026-07-07T08:30:00.000Z',
    });

    expect(report.ocrStatus).toBe('succeeded');
    expect(report.chaptersDetected).toBeGreaterThan(0);
    expect(report.cardsGenerated).toBeGreaterThan(0);
    expect(runtime.getSnapshot().contentSlices.length).toBeGreaterThan(0);

    const unlock = runtime.completeEpisode(
      'episode-civil-contract-formation',
      '2026-07-07T09:00:00.000Z'
    );
    expect(unlock.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);

    const proposal = runtime.createProposal('2026-07-07', '2026-07-07T10:00:00.000Z');
    expect(proposal.validation.valid).toBe(true);
    expect(proposal.afterPlan.tasks.map((task) => task.kind)).toContain('due_review');
    expect(proposal.afterPlan.tasks.map((task) => task.kind)).toContain('new_card');
  });

  it('runs write tools through approval, audit, and idempotent invocation recovery', async () => {
    const runtime = new LegalStudyRuntime();
    const input = {
      episodeId: 'episode-civil-contract-formation',
      completedAt: '2026-07-07T09:00:00.000Z',
      humanApproved: true,
    };
    const context = {
      runId: 'run-main-governed-tool',
      stepId: 'apply-unlocks',
      invocationId: 'invocation-main-apply-unlocks',
      userId: runtime.getSnapshot().userId,
    };

    const pending = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.applyUnlocks,
      input,
      context
    );
    expect(pending).toMatchObject({
      status: 'human_review_required',
      error: { code: 'TOOL_APPROVAL_REQUIRED' },
    });

    const completed = await runtime.approveAndResumeTool(context.invocationId, context.userId);
    const replayed = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.applyUnlocks,
      input,
      context
    );

    expect(completed.status).toBe('completed');
    expect(replayed).toEqual(completed);
    expect(
      runtime.getSnapshot().cards.find((card) => card.id === 'card-civil-offer-acceptance')
        ?.unlockStatus
    ).toBe('unlocked');
    expect(
      (await runtime.listToolEvents()).filter((event) => event.type === 'tool.call.completed')
    ).toHaveLength(1);
  });
  it('runs the one-shot core workflow smoke helper', async () => {
    const runtime = new LegalStudyRuntime();
    const state = await runtime.runCoreWorkflowSmoke('2026-07-07T10:00:00.000Z');

    expect(state.ingestionReports).toHaveLength(1);
    expect(state.unlockReports).toHaveLength(1);
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0].validation.valid).toBe(true);
  });
});

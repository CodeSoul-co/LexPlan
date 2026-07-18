import { describe, expect, it } from 'vitest';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import { LEGAL_STUDY_TOOL_IDS } from '../tools';
import { evaluateLegalStudyToolPolicy } from './tool-policy';
import { LegalStudyRuntime } from '../runtime/legal-study-runtime';

describe('legal-study tool runtime and policy', () => {
  it('allows read tools through policy and returns pressure output', async () => {
    const snapshot = createLegalStudySeedSnapshot();
    const runtime = new LegalStudyRuntime(snapshot, {
      repository: new InMemoryLegalStudyRepository(snapshot),
    });

    const result = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.computeReviewPressure,
      { date: '2026-07-07' },
      { runId: 'run-tool-read', stepId: 'step-1' }
    );

    expect(result).toMatchObject({
      status: 'completed',
      output: {
        dueCount: 1,
        dueMinutes: 3,
      },
    });
  });

  it('requires human review for write tools without explicit approval', async () => {
    const decision = evaluateLegalStudyToolPolicy({
      runId: 'run-policy',
      capabilityId: LEGAL_STUDY_TOOL_IDS.applyUnlocks,
      sideEffectLevel: 'write',
      input: {
        episodeId: 'episode-civil-contract-formation',
        humanApproved: true,
      },
    });

    expect(decision).toMatchObject({
      allowed: true,
      requiresHumanReview: true,
      policyId: 'policy.legal-study.human-reviewed-write',
    });
  });

  it('executes approved write tools and mutates the repository through governed dispatch', async () => {
    const snapshot = createLegalStudySeedSnapshot();
    const repository = new InMemoryLegalStudyRepository(snapshot);
    const runtime = new LegalStudyRuntime(snapshot, { repository });

    const input = {
      episodeId: 'episode-civil-contract-formation',
      completedAt: '2026-07-08T12:00:00.000Z',
      humanApproved: true,
    };
    const context = { runId: 'run-tool-write', stepId: 'apply-unlocks' };
    const blocked = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.applyUnlocks,
      input,
      context
    );
    expect(blocked).toMatchObject({
      status: 'human_review_required',
      error: { code: 'TOOL_APPROVAL_REQUIRED' },
    });

    const approved = await runtime.approveAndResumeTool(blocked.invocationId!, 'owner');

    expect(approved).toMatchObject({
      status: 'completed',
      output: {
        report: {
          unlockedCardIds: ['card-civil-offer-acceptance', 'card-civil-acceptance-effective'],
        },
      },
    });
    expect((await repository.require('cards', 'card-civil-offer-acceptance')).unlockStatus).toBe(
      'unlocked'
    );
  });

  it('exposes Agent proposal tools behind the same policy boundary', async () => {
    const snapshot = createLegalStudySeedSnapshot();
    const repository = new InMemoryLegalStudyRepository(snapshot);
    const runtime = new LegalStudyRuntime(snapshot, { repository });

    const draft = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.draftAgentProposal,
      { date: '2026-07-07' },
      { runId: 'run-agent-tool', stepId: 'draft' }
    );
    expect(draft.status).toBe('completed');
    const proposalId = (draft.output as { id: string }).id;

    const decisionInput = {
      proposalId,
      decision: 'accepted',
      decidedAt: '2026-07-08T13:00:00.000Z',
    };
    const pending = await runtime.runGovernedTool(
      LEGAL_STUDY_TOOL_IDS.decideAgentProposal,
      decisionInput,
      {
        runId: 'run-agent-tool',
        stepId: 'accept',
      }
    );
    expect(pending.status).toBe('human_review_required');
    const accepted = await runtime.approveAndResumeTool(pending.invocationId!, 'owner');

    expect(accepted).toMatchObject({
      status: 'completed',
      output: { status: 'accepted' },
    });
    expect((await runtime.listToolEvents()).map((event) => event.type)).toEqual(
      expect.arrayContaining([
        'tool.call.requested',
        'tool.policy.checked',
        'human.review.requested',
        'human.review.approved',
        'tool.call.completed',
      ])
    );
  });
});

import { describe, expect, it } from 'vitest';
import { draftPlanProposal, validatePlanProposal } from './agent/proposal';
import { createLegalStudySeedSnapshot, LEGAL_STUDY_SEED_TODAY } from './seed-data';
import { completeEpisodeAndUnlockCards, computeUnlockCandidates } from './mapping/unlock';
import { getDueReviewQueue } from './review/fsrs-lite';

describe('@lexplan/backend deterministic core loop', () => {
  it('does not unlock cards before an episode is completed', () => {
    const snapshot = createLegalStudySeedSnapshot();
    const report = computeUnlockCandidates(snapshot, 'episode-civil-contract-formation');

    expect(report.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);
    expect(report.violations).toContain('Episode episode-civil-contract-formation is not completed.');
    expect(snapshot.cards.find((card) => card.id === 'card-civil-offer-acceptance')?.unlockStatus).toBe(
      'locked'
    );
  });

  it('unlocks only confirmed cards from chapters mapped to the completed episode', () => {
    const snapshot = createLegalStudySeedSnapshot();
    const result = completeEpisodeAndUnlockCards(
      snapshot,
      'episode-civil-contract-formation',
      '2026-07-07T09:00:00.000Z'
    );

    expect(result.report.violations).toEqual([]);
    expect(result.report.mappedChapterIds).toEqual(['chapter-civil-contract-formation']);
    expect(result.report.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);
    expect(
      result.snapshot.cards.find((card) => card.id === 'card-civil-validity-pending')?.unlockStatus
    ).toBe('locked');
  });

  it('keeps unmapped episode completion from releasing cards', () => {
    const snapshot = createLegalStudySeedSnapshot();
    const result = completeEpisodeAndUnlockCards(
      snapshot,
      'episode-civil-contract-validity',
      '2026-07-07T09:00:00.000Z'
    );

    expect(result.report.unlockedCardIds).toEqual([]);
    expect(result.report.violations).toContain(
      'Episode episode-civil-contract-validity has no confirmed chapter mapping.'
    );
  });

  it('projects due FSRS reviews only for learned cards', () => {
    const snapshot = createLegalStudySeedSnapshot();
    const due = getDueReviewQueue(snapshot, LEGAL_STUDY_SEED_TODAY);

    expect(due.map((item) => item.cardId)).toEqual(['card-criminal-act-due']);
  });

  it('generates a valid proposal that preserves locked tasks and due reviews', () => {
    const unlocked = completeEpisodeAndUnlockCards(
      createLegalStudySeedSnapshot(),
      'episode-civil-contract-formation',
      '2026-07-07T09:00:00.000Z'
    ).snapshot;
    const proposal = draftPlanProposal({
      snapshot: unlocked,
      date: LEGAL_STUDY_SEED_TODAY,
      now: '2026-07-07T10:00:00.000Z',
    });

    expect(proposal.validation.valid).toBe(true);
    expect(proposal.afterPlan.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'course_episode',
          refId: 'episode-criminal-act',
          lockedByUser: true,
        }),
        expect.objectContaining({ kind: 'due_review', refId: 'card-criminal-act-due' }),
      ])
    );
    expect(
      proposal.afterPlan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)
    ).toBeLessThanOrEqual(proposal.afterPlan.availableMinutes);
  });

  it('rejects proposals that remove locked tasks or omit due reviews', () => {
    const snapshot = createLegalStudySeedSnapshot();
    const beforePlan = snapshot.plans[0];
    const afterPlan = {
      ...beforePlan,
      tasks: beforePlan.tasks.filter((task) => !task.lockedByUser),
    };

    const validation = validatePlanProposal(snapshot, beforePlan, afterPlan, LEGAL_STUDY_SEED_TODAY);

    expect(validation.valid).toBe(false);
    expect(validation.violations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Locked task cannot be removed'),
        expect.stringContaining('Due review card cannot be omitted'),
      ])
    );
  });
});

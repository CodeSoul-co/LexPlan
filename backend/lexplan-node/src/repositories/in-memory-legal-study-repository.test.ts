import { describe, expect, it } from 'vitest';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { InMemoryLegalStudyRepository } from './in-memory-legal-study-repository';
import { LegalStudyRepositoryError } from './legal-study-repository';

describe('InMemoryLegalStudyRepository', () => {
  it('returns cloned snapshots and entities so callers cannot mutate store state', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());

    const snapshot = await repository.getSnapshot();
    snapshot.subjects[0].name = '污染后的民法';

    const subject = await repository.require('subjects', 'subject-civil');
    subject.name = '再次污染';

    expect((await repository.require('subjects', 'subject-civil')).name).toBe('民法');
  });

  it('supports typed collection CRUD with duplicate and missing entity guards', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const now = '2026-07-07T12:00:00.000Z';

    await expect(
      repository.insert('subjects', {
        id: 'subject-civil',
        userId: 'seed-user-legal-study',
        code: 'custom',
        name: '重复科目',
        priority: 9,
        createdAt: now,
      })
    ).rejects.toMatchObject({ code: 'duplicate_entity' });

    const inserted = await repository.insert(
      'subjects',
      {
        id: 'subject-procedure',
        userId: 'seed-user-legal-study',
        code: 'custom',
        name: '诉讼法',
        priority: 3,
        createdAt: now,
      },
      { now }
    );
    expect(inserted.updatedAt).toBeUndefined();
    expect(await repository.require('subjects', 'subject-procedure')).toMatchObject({
      name: '诉讼法',
    });

    const updated = await repository.update(
      'subjects',
      'subject-procedure',
      { priority: 2 },
      { now: '2026-07-07T12:30:00.000Z' }
    );
    expect(updated.priority).toBe(2);
    expect(updated.updatedAt).toBe('2026-07-07T12:30:00.000Z');

    await expect(repository.require('subjects', 'missing-subject')).rejects.toBeInstanceOf(
      LegalStudyRepositoryError
    );
    expect(await repository.delete('subjects', 'subject-procedure')).toBe(true);
    expect(await repository.delete('subjects', 'subject-procedure')).toBe(false);
  });

  it('updates learning profile without exposing rejected proposal fingerprints by reference', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());

    const profile = await repository.updateProfile({
      availableMinutesToday: 210,
      rejectedProposalFingerprints: ['proposal-a'],
    });
    profile.rejectedProposalFingerprints.push('outside-mutation');

    expect(await repository.getProfile()).toMatchObject({
      availableMinutesToday: 210,
      rejectedProposalFingerprints: ['proposal-a'],
    });
  });

  it('commits successful transactions and rolls back failed transactions', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());

    await repository.transaction(async (transaction) => {
      await transaction.update('episodes', 'episode-civil-contract-formation', {
        status: 'in_progress',
      });
    });

    expect(
      (await repository.require('episodes', 'episode-civil-contract-formation')).status
    ).toBe('in_progress');

    await expect(
      repository.transaction(async (transaction) => {
        await transaction.update('episodes', 'episode-civil-contract-formation', {
          status: 'completed',
        });
        throw new Error('abort transaction');
      })
    ).rejects.toThrow('abort transaction');

    expect(
      (await repository.require('episodes', 'episode-civil-contract-formation')).status
    ).toBe('in_progress');
  });

  it('can replace collections while preserving single-user and unique-id invariants', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const subjects = await repository.list('subjects');

    await expect(repository.replaceCollection('subjects', [subjects[0], subjects[0]])).rejects
      .toMatchObject({
        code: 'duplicate_entity',
      });

    const replacement = [{ ...subjects[0], priority: 5 }];
    const updated = await repository.replaceCollection('subjects', replacement, {
      now: '2026-07-07T13:00:00.000Z',
    });

    expect(updated).toEqual(replacement);
    expect((await repository.getSnapshot()).capturedAt).toBe('2026-07-07T13:00:00.000Z');
  });
});

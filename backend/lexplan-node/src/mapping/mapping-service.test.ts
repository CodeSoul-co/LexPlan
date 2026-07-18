import { describe, expect, it } from 'vitest';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import { LegalStudyMappingService } from './mapping-service';

describe('LegalStudyMappingService', () => {
  it('suggests episode-to-chapter mappings by subject and title similarity', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyMappingService(repository);

    const suggestions = await service.suggestMappings({
      subjectId: 'subject-civil',
      minConfidence: 0.5,
    });

    expect(suggestions[0]).toMatchObject({
      episode: { id: 'episode-civil-contract-formation' },
      chapter: { id: 'chapter-civil-contract-formation' },
      textbook: { id: 'textbook-civil' },
    });
    expect(suggestions[0].confidence).toBeGreaterThanOrEqual(0.5);
    expect(suggestions[0].reason).toContain('标题关键词匹配');
  });

  it('confirms new mappings and lists them by episode', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyMappingService(repository);

    const mapping = await service.confirmMapping({
      episodeId: 'episode-civil-contract-validity',
      chapterId: 'chapter-civil-contract-validity',
      reason: '用户确认合同效力课程对应合同效力章节。',
      now: '2026-07-08T09:00:00.000Z',
    });

    expect(mapping).toMatchObject({
      episodeId: 'episode-civil-contract-validity',
      chapterId: 'chapter-civil-contract-validity',
      source: 'user_confirmed',
    });
    expect(await service.listMappings({ episodeId: 'episode-civil-contract-validity' })).toEqual([
      mapping,
    ]);
  });

  it('modifies mappings and rejects cross-subject chapter moves', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyMappingService(repository);

    const mapping = await service.confirmMapping({
      episodeId: 'episode-civil-contract-validity',
      chapterId: 'chapter-civil-contract-validity',
      now: '2026-07-08T09:10:00.000Z',
    });
    const modified = await service.modifyMapping(mapping.id, {
      reason: '改为人工复核后的映射。',
      now: '2026-07-08T09:20:00.000Z',
    });

    expect(modified).toMatchObject({
      source: 'user_modified',
      reason: '改为人工复核后的映射。',
    });
    await expect(
      service.modifyMapping(mapping.id, {
        chapterId: 'chapter-criminal-act',
      })
    ).rejects.toThrow('different subjects');
  });

  it('previews and applies unlocks for mapped confirmed cards', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyMappingService(repository);

    const preview = await service.getUnlockPreview('episode-civil-contract-formation');
    expect(preview.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);
    expect(preview.violations).toContain(
      'Episode episode-civil-contract-formation is not completed.'
    );

    const result = await service.applyUnlocks(
      'episode-civil-contract-formation',
      '2026-07-08T10:00:00.000Z'
    );
    expect(result.report.violations).toEqual([]);
    expect(result.report.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);
    expect((await repository.require('episodes', 'episode-civil-contract-formation')).status).toBe(
      'completed'
    );
    expect((await repository.require('cards', 'card-civil-offer-acceptance')).unlockStatus).toBe(
      'unlocked'
    );
  });
});

import { describe, expect, it } from 'vitest';
import { computeCoursePressure } from '../scheduling/pressure';
import { createLegalStudySeedSnapshot } from '../seed-data';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import {
  BilibiliCourseImportError,
  MockBilibiliCourseImportProvider,
  RealBilibiliCourseImportProvider,
  parseBilibiliCourseUrl,
} from './bilibili-import';
import { LegalStudyCourseService } from './course-service';

const bilibiliViewPayload = {
  code: 0,
  message: '0',
  data: {
    aid: 123456,
    bvid: 'BV1law2026X',
    cid: 1001,
    title: '法硕民法系统课',
    duration: 5400,
    pages: [
      { cid: 1001, page: 1, part: '导学与体系', duration: 1800 },
      { cid: 1002, page: 2, part: '民法概述', duration: 2700 },
      { cid: 1003, page: 3, part: '民事法律关系', duration: 3600 },
    ],
  },
};

function fakeBilibiliFetch(payload = bilibiliViewPayload): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
}

describe('LegalStudyCourseService', () => {
  it('creates manual courses and episodes with ordered course overview', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyCourseService(repository);
    const now = '2026-07-07T14:00:00.000Z';

    const course = await service.createCourse({
      userId: 'seed-user-legal-study',
      subjectId: 'subject-civil',
      title: '民法冲刺课',
      deadline: '2026-10-01',
      now,
    });
    await service.addEpisode({
      userId: 'seed-user-legal-study',
      courseId: course.id,
      title: '物权总论',
      order: 2,
      durationMinutes: 40,
      now,
    });
    await service.addEpisode({
      userId: 'seed-user-legal-study',
      courseId: course.id,
      title: '合同编串讲',
      order: 1,
      durationMinutes: 50,
      now,
    });

    const overview = await service.getCourseOverview(course.id);
    expect(overview.episodes.map((episode) => episode.title)).toEqual(['合同编串讲', '物权总论']);
    expect(overview.stats).toMatchObject({
      totalEpisodeCount: 2,
      completedEpisodeCount: 0,
      remainingMinutes: 90,
    });
  });

  it('imports a Bilibili course through the mock provider and persists source refs', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyCourseService(repository, {
      bilibiliProvider: new MockBilibiliCourseImportProvider({
        now: '2026-07-07T15:00:00.000Z',
        title: '民法 B站系统课',
      }),
    });

    const result = await service.importBilibiliCourse({
      userId: 'seed-user-legal-study',
      subjectId: 'subject-civil',
      url: 'https://www.bilibili.com/video/BV1law2026?p=2',
      deadline: '2026-09-01',
      now: '2026-07-07T15:00:00.000Z',
    });

    expect(result.course).toMatchObject({
      title: '民法 B站系统课',
      source: 'bilibili',
      sourceRef: 'https://www.bilibili.com/video/BV1law2026?p=2',
    });
    expect(result.source).toMatchObject({
      sourceId: 'BV1law2026-p2',
      sourceKind: 'playlist',
    });
    expect(result.episodes).toHaveLength(3);
    expect(result.episodes[0]).toMatchObject({
      order: 1,
      status: 'pending',
    });
    expect((await service.getCourseOverview(result.course.id)).stats.remainingMinutes).toBe(125);
  });

  it('previews a real Bilibili video payload without writing a course', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyCourseService(repository, {
      bilibiliProvider: new RealBilibiliCourseImportProvider({
        fetchImpl: fakeBilibiliFetch(),
        now: () => '2026-07-07T15:30:00.000Z',
      }),
    });

    const beforeCourses = (await repository.list('courses')).length;
    const preview = await service.previewBilibiliCourse({
      url: 'https://www.bilibili.com/video/BV1law2026X',
    });

    expect(preview).toMatchObject({
      title: '法硕民法系统课',
      sourceId: 'BV1law2026X',
      provider: 'bilibili.real-public-metadata',
      manualEntryRequired: false,
    });
    expect(preview.episodes.map((episode) => ({ title: episode.title, duration: episode.durationMinutes }))).toEqual([
      { title: '导学与体系', duration: 30 },
      { title: '民法概述', duration: 45 },
      { title: '民事法律关系', duration: 60 },
    ]);
    expect((await repository.list('courses')).length).toBe(beforeCourses);
  });

  it('confirms a corrected Bilibili preview and exposes remaining course pressure', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyCourseService(repository, {
      bilibiliProvider: new RealBilibiliCourseImportProvider({
        fetchImpl: fakeBilibiliFetch(),
        now: () => '2026-07-07T15:30:00.000Z',
      }),
    });
    const preview = await service.previewBilibiliCourse({
      url: 'https://www.bilibili.com/video/BV1law2026X?p=2',
    });

    const result = await service.confirmBilibiliCourseImport({
      userId: 'seed-user-legal-study',
      subjectId: 'subject-civil',
      deadline: '2026-08-01',
      preview,
      title: '民法系统课（人工校正）',
      episodes: [
        { ...preview.episodes[0], title: '民法概述精讲', durationMinutes: 50, order: 2 },
        { ...preview.episodes[0], title: '导学补充', durationMinutes: 20, order: 1 },
        { ...preview.episodes[0], title: '删除这一讲', selected: false, durationMinutes: 999, order: 3 },
      ],
      now: '2026-07-07T16:00:00.000Z',
    });

    expect(result.course.title).toBe('民法系统课（人工校正）');
    expect(result.episodes.map((episode) => ({ title: episode.title, minutes: episode.durationMinutes }))).toEqual([
      { title: '导学补充', minutes: 20 },
      { title: '民法概述精讲', minutes: 50 },
    ]);

    const overview = await service.getCourseOverview(result.course.id);
    expect(overview.stats.remainingMinutes).toBe(70);
    const pressure = computeCoursePressure(await repository.getSnapshot(), '2026-07-08').find(
      (item) => item.courseId === result.course.id
    );
    expect(pressure).toMatchObject({
      remainingEpisodeCount: 2,
      remainingMinutes: 70,
    });
  });

  it('completes an episode and triggers mapped chapter unlocks', async () => {
    const repository = new InMemoryLegalStudyRepository(createLegalStudySeedSnapshot());
    const service = new LegalStudyCourseService(repository);

    const result = await service.completeEpisode(
      'episode-civil-contract-formation',
      '2026-07-07T16:00:00.000Z'
    );

    expect(result.episode.status).toBe('completed');
    expect(result.unlockReport.unlockedCardIds).toEqual([
      'card-civil-offer-acceptance',
      'card-civil-acceptance-effective',
    ]);
    expect((await repository.require('cards', 'card-civil-offer-acceptance')).unlockStatus).toBe(
      'unlocked'
    );
  });

  it('parses Bilibili source ids and surfaces provider errors for manual entry fallback', async () => {
    expect(parseBilibiliCourseUrl('https://www.bilibili.com/video/BV1abcDEF12')).toMatchObject({
      sourceId: 'BV1abcDEF12',
      sourceKind: 'video',
      bvid: 'BV1abcDEF12',
    });
    expect(parseBilibiliCourseUrl('https://www.bilibili.com/video/av123456')).toMatchObject({
      sourceId: 'av123456',
      sourceKind: 'video',
      aid: 123456,
    });

    const realProvider = new RealBilibiliCourseImportProvider({
      fetchImpl: fakeBilibiliFetch({ code: -404, message: 'not found' }),
    });
    await expect(
      realProvider.previewCourse({ url: 'https://www.bilibili.com/video/BV1abcDEF12' })
    ).rejects.toMatchObject({ code: 'parse_failed' } satisfies Partial<BilibiliCourseImportError>);
  });
});

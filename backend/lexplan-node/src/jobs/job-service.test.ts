import { describe, expect, it } from 'vitest';
import { LegalStudyJobService } from './job-service';
import { InMemoryLegalStudyJobStore } from './job-store';
import { LegalStudyRuntime } from '../runtime/legal-study-runtime';

describe('legal-study async jobs', () => {
  it('queues and runs a textbook ingestion job through the legal-study runtime', async () => {
    const runtime = new LegalStudyRuntime();
    const userId = runtime.getSnapshot().userId;

    const queued = await runtime.enqueueTextbookIngestionJob({
      userId,
      subjectId: 'subject-civil',
      textbookTitle: '异步任务民法讲义',
      text: '第一章 合同成立\n合同成立通常经过要约和承诺。',
      confirmCards: true,
      now: '2026-07-07T08:30:00.000Z',
    });

    expect(queued).toMatchObject({
      type: 'textbook_ingestion',
      status: 'queued',
      retryCount: 0,
    });

    const completed = await runtime.runJob(queued.id);
    expect(completed.status).toBe('succeeded');
    expect(completed.progress.percent).toBe(100);
    expect(runtime.getState().ingestionReports).toHaveLength(1);
    const textbookId = runtime.getState().ingestionReports[0].textbookId;
    expect(runtime.getSnapshot().cards.some((card) => card.textbookId === textbookId)).toBe(true);
  });

  it('runs Bilibili import and Agent recompute jobs', async () => {
    const runtime = new LegalStudyRuntime();
    const userId = runtime.getSnapshot().userId;

    const bilibili = await runtime.enqueueBilibiliImportJob({
      userId,
      subjectId: 'subject-civil',
      url: 'https://www.bilibili.com/video/BV1law2026?p=1',
      deadline: '2026-08-30',
      now: '2026-07-07T09:00:00.000Z',
    });
    expect((await runtime.runJob(bilibili.id)).status).toBe('succeeded');
    expect(runtime.getSnapshot().courses.some((course) => course.source === 'bilibili')).toBe(true);

    const agent = await runtime.enqueueAgentProposalRecomputeJob({
      date: '2026-07-07',
      now: '2026-07-07T10:00:00.000Z',
    });
    expect((await runtime.runJob(agent.id)).status).toBe('succeeded');
    expect(runtime.getState().proposals).toHaveLength(1);
  });

  it('records failed jobs and increments retry count', async () => {
    const runtime = new LegalStudyRuntime();
    const userId = runtime.getSnapshot().userId;
    const job = await runtime.enqueueBilibiliImportJob({
      userId,
      subjectId: 'subject-civil',
      url: 'https://example.com/not-bilibili',
      deadline: '2026-08-30',
    });

    const failed = await runtime.runJob(job.id);
    expect(failed.status).toBe('failed');
    expect(failed.error?.message).toContain('Unsupported Bilibili host');

    const retried = await runtime.retryJob(job.id);
    expect(retried.status).toBe('failed');
    expect(retried.retryCount).toBe(1);
  });

  it('cancels queued jobs and reports missing handlers as needs_user_action', async () => {
    const store = new InMemoryLegalStudyJobStore();
    const service = new LegalStudyJobService({ store });
    const queued = await service.enqueue({
      userId: 'seed-user-legal-study',
      type: 'textbook_ingestion',
      input: { ok: true },
      now: '2026-07-07T08:00:00.000Z',
    });

    const cancelled = await service.cancelJob(queued.id, '2026-07-07T08:01:00.000Z');
    expect(cancelled.status).toBe('cancelled');
    expect((await service.runJob(queued.id)).status).toBe('cancelled');

    const noHandler = await service.enqueue({
      userId: 'seed-user-legal-study',
      type: 'agent_proposal_recompute',
      input: { date: '2026-07-07' },
    });
    const needsUserAction = await service.runJob(noHandler.id);
    expect(needsUserAction.status).toBe('needs_user_action');
  });
});

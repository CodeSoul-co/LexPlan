import type { LegalStudyJob, LegalStudyJobError, LegalStudyJobType } from '../types';
import type { LegalStudyJobCreateInput, LegalStudyJobFilter, LegalStudyJobStore } from './job-store';

export type LegalStudyJobHandler = (job: LegalStudyJob) => Promise<unknown>;

export interface LegalStudyJobServiceOptions {
  store: LegalStudyJobStore;
  handlers?: Partial<Record<LegalStudyJobType, LegalStudyJobHandler>>;
}

export class LegalStudyJobService {
  private readonly handlers = new Map<LegalStudyJobType, LegalStudyJobHandler>();

  constructor(private readonly options: LegalStudyJobServiceOptions) {
    for (const [type, handler] of Object.entries(options.handlers ?? {})) {
      if (handler) this.handlers.set(type as LegalStudyJobType, handler);
    }
  }

  registerHandler(type: LegalStudyJobType, handler: LegalStudyJobHandler): void {
    this.handlers.set(type, handler);
  }

  async enqueue(input: LegalStudyJobCreateInput): Promise<LegalStudyJob> {
    return this.options.store.create(input);
  }

  async listJobs(filter: LegalStudyJobFilter = {}): Promise<LegalStudyJob[]> {
    return this.options.store.list(filter);
  }

  async getJob(jobId: string): Promise<LegalStudyJob | undefined> {
    return this.options.store.get(jobId);
  }

  async requireJob(jobId: string): Promise<LegalStudyJob> {
    return this.options.store.require(jobId);
  }

  async runJob(jobId: string, now = new Date().toISOString()): Promise<LegalStudyJob> {
    const queued = await this.options.store.require(jobId);
    if (queued.status === 'cancelled' || queued.status === 'processing') {
      return queued;
    }
    const handler = this.handlers.get(queued.type);
    if (!handler) {
      return this.options.store.update(jobId, {
        status: 'needs_user_action',
        progress: { percent: queued.progress.percent, message: `No handler registered for ${queued.type}.` },
        error: { message: `No handler registered for legal-study job type: ${queued.type}` },
        finishedAt: now,
      });
    }

    const processing = await this.options.store.update(jobId, {
      status: 'processing',
      progress: { percent: 5, message: 'Processing.' },
      error: undefined,
      startedAt: now,
      finishedAt: undefined,
      cancelledAt: undefined,
    });

    try {
      const output = await handler(processing);
      return this.options.store.update(jobId, {
        status: 'succeeded',
        progress: { percent: 100, message: 'Succeeded.' },
        output,
        error: undefined,
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      return this.options.store.update(jobId, {
        status: 'failed',
        progress: { percent: processing.progress.percent, message: 'Failed.' },
        error: toJobError(error),
        finishedAt: new Date().toISOString(),
      });
    }
  }

  async retryJob(jobId: string, now = new Date().toISOString()): Promise<LegalStudyJob> {
    const job = await this.options.store.require(jobId);
    if (job.status !== 'failed' && job.status !== 'needs_user_action' && job.status !== 'cancelled') {
      throw new Error(`Only failed, cancelled, or needs_user_action jobs can be retried: ${jobId}`);
    }
    await this.options.store.update(jobId, {
      status: 'retrying',
      progress: { percent: 0, message: 'Retry queued.' },
      error: undefined,
      output: undefined,
      retryCount: job.retryCount + 1,
      startedAt: undefined,
      finishedAt: undefined,
      cancelledAt: undefined,
      updatedAt: now,
    });
    return this.runJob(jobId, now);
  }

  async cancelJob(jobId: string, now = new Date().toISOString()): Promise<LegalStudyJob> {
    const job = await this.options.store.require(jobId);
    if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
      return job;
    }
    return this.options.store.update(jobId, {
      status: 'cancelled',
      progress: { percent: job.progress.percent, message: 'Cancelled.' },
      cancelledAt: now,
      finishedAt: now,
    });
  }
}

function toJobError(error: unknown): LegalStudyJobError {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown }).code;
    return {
      message: error.message,
      name: error.name,
      code: typeof maybeCode === 'string' ? maybeCode : undefined,
    };
  }
  return { message: String(error) };
}

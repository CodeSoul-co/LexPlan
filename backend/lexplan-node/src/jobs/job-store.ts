import type { LegalStudyJob, LegalStudyJobStatus, LegalStudyJobType } from '../types';

export interface LegalStudyJobFilter {
  userId?: string;
  type?: LegalStudyJobType;
  status?: LegalStudyJobStatus;
}

export interface LegalStudyJobCreateInput {
  id?: string;
  userId: string;
  type: LegalStudyJobType;
  input: unknown;
  now?: string;
}

export interface LegalStudyJobStore {
  list(filter?: LegalStudyJobFilter): Promise<LegalStudyJob[]>;
  get(jobId: string): Promise<LegalStudyJob | undefined>;
  require(jobId: string): Promise<LegalStudyJob>;
  create(input: LegalStudyJobCreateInput): Promise<LegalStudyJob>;
  update(jobId: string, patch: Partial<Omit<LegalStudyJob, 'id' | 'userId' | 'createdAt'>>): Promise<LegalStudyJob>;
  replaceAll(jobs: LegalStudyJob[]): Promise<void>;
}

export class InMemoryLegalStudyJobStore implements LegalStudyJobStore {
  private jobs: LegalStudyJob[];

  constructor(jobs: LegalStudyJob[] = []) {
    this.jobs = clone(jobs);
  }

  async list(filter: LegalStudyJobFilter = {}): Promise<LegalStudyJob[]> {
    return clone(
      this.jobs
        .filter((job) => {
          if (filter.userId && job.userId !== filter.userId) return false;
          if (filter.type && job.type !== filter.type) return false;
          if (filter.status && job.status !== filter.status) return false;
          return true;
        })
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id))
    );
  }

  async get(jobId: string): Promise<LegalStudyJob | undefined> {
    const job = this.jobs.find((candidate) => candidate.id === jobId);
    return job ? clone(job) : undefined;
  }

  async require(jobId: string): Promise<LegalStudyJob> {
    const job = await this.get(jobId);
    if (!job) {
      throw new Error(`Legal-study job not found: ${jobId}`);
    }
    return job;
  }

  async create(input: LegalStudyJobCreateInput): Promise<LegalStudyJob> {
    const now = input.now ?? new Date().toISOString();
    const job: LegalStudyJob = {
      id: input.id ?? makeJobId(input.type, this.jobs.map((candidate) => candidate.id)),
      userId: input.userId,
      type: input.type,
      status: 'queued',
      progress: { percent: 0, message: 'Queued.' },
      input: clone(input.input),
      retryCount: 0,
      createdAt: now,
    };
    if (this.jobs.some((candidate) => candidate.id === job.id)) {
      throw new Error(`Duplicate legal-study job: ${job.id}`);
    }
    this.jobs.push(clone(job));
    return clone(job);
  }

  async update(
    jobId: string,
    patch: Partial<Omit<LegalStudyJob, 'id' | 'userId' | 'createdAt'>>
  ): Promise<LegalStudyJob> {
    const index = this.jobs.findIndex((candidate) => candidate.id === jobId);
    if (index === -1) {
      throw new Error(`Legal-study job not found: ${jobId}`);
    }
    const current = this.jobs[index];
    const updated: LegalStudyJob = {
      ...current,
      ...clone(patch),
      updatedAt: new Date().toISOString(),
    };
    this.jobs[index] = updated;
    return clone(updated);
  }

  async replaceAll(jobs: LegalStudyJob[]): Promise<void> {
    this.jobs = clone(jobs);
  }
}

function makeJobId(type: LegalStudyJobType, existingIds: string[]): string {
  const timestamp = Date.now();
  for (let index = 1; index < 10000; index += 1) {
    const candidate = `job-${type.replace(/_/g, '-')}-${timestamp}-${index}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
  throw new Error(`Unable to generate job id for ${type}`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

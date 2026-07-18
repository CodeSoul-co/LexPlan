import { completeEpisodeAndUnlockCards } from '../mapping/unlock';
import type {
  LegalStudyCourse,
  LegalStudyCourseEpisode,
  LegalStudySubject,
  LegalStudySubjectCode,
  LegalStudyTaskStatus,
  LegalStudyUnlockReport,
} from '../types';
import type { LegalStudyRepository } from '../repositories/legal-study-repository';
import {
  MockBilibiliCourseImportProvider,
  RealBilibiliCourseImportProvider,
  previewToImportedCourse,
  type BilibiliCourseImportProvider,
  type BilibiliImportedCourse,
  type BilibiliImportPreview,
  type ImportedEpisodeDraft,
} from './bilibili-import';

export interface LegalStudyCourseServiceOptions {
  bilibiliProvider?: BilibiliCourseImportProvider;
}

export interface CreateLegalStudySubjectInput {
  id?: string;
  userId: string;
  code: LegalStudySubjectCode;
  name: string;
  priority?: number;
  now?: string;
}

export interface CreateLegalStudyCourseInput {
  id?: string;
  userId: string;
  subjectId: string;
  title: string;
  deadline: string;
  source?: LegalStudyCourse['source'];
  sourceRef?: string;
  now?: string;
}

export interface CreateLegalStudyEpisodeInput {
  id?: string;
  userId: string;
  courseId: string;
  title: string;
  order?: number;
  durationMinutes: number;
  status?: LegalStudyTaskStatus;
  lockedByUser?: boolean;
  sourceRef?: string;
  now?: string;
}

export interface ImportBilibiliCourseInput {
  userId: string;
  subjectId: string;
  url: string;
  deadline: string;
  titleHint?: string;
  now?: string;
}

export interface PreviewBilibiliCourseInput {
  url: string;
  titleHint?: string;
}

export interface ConfirmBilibiliCourseImportInput {
  userId: string;
  subjectId: string;
  deadline: string;
  preview: BilibiliImportPreview;
  title?: string;
  episodes?: ImportedEpisodeDraft[];
  now?: string;
}

export interface ImportedLegalStudyCourseResult {
  source: BilibiliImportedCourse;
  course: LegalStudyCourse;
  episodes: LegalStudyCourseEpisode[];
}

export interface LegalStudyCourseOverview {
  course: LegalStudyCourse;
  subject: LegalStudySubject;
  episodes: LegalStudyCourseEpisode[];
  stats: {
    totalEpisodeCount: number;
    completedEpisodeCount: number;
    remainingEpisodeCount: number;
    totalMinutes: number;
    completedMinutes: number;
    remainingMinutes: number;
    progressRatio: number;
  };
}

export interface CompleteLegalStudyEpisodeResult {
  episode: LegalStudyCourseEpisode;
  unlockReport: LegalStudyUnlockReport;
}

export class LegalStudyCourseService {
  private readonly bilibiliProvider: BilibiliCourseImportProvider;

  constructor(
    private readonly repository: LegalStudyRepository,
    options: LegalStudyCourseServiceOptions = {}
  ) {
    this.bilibiliProvider = options.bilibiliProvider ?? createDefaultBilibiliProvider();
  }

  async listSubjects(): Promise<LegalStudySubject[]> {
    const subjects = await this.repository.list('subjects');
    return subjects.sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
  }

  async createSubject(input: CreateLegalStudySubjectInput): Promise<LegalStudySubject> {
    const now = input.now ?? new Date().toISOString();
    const subject: LegalStudySubject = {
      id:
        input.id ??
        makeUniqueId(
          'subject',
          [input.code, input.name],
          (await this.repository.list('subjects')).map((candidate) => candidate.id)
        ),
      userId: input.userId,
      code: input.code,
      name: requireNonEmpty(input.name, 'name'),
      priority: input.priority ?? (await this.repository.list('subjects')).length + 1,
      createdAt: now,
    };
    return this.repository.insert('subjects', subject, { now });
  }

  async listCourses(subjectId?: string): Promise<LegalStudyCourse[]> {
    const courses = await this.repository.list(
      'courses',
      subjectId ? (course) => course.subjectId === subjectId : undefined
    );
    return courses.sort((left, right) => left.deadline.localeCompare(right.deadline) || left.title.localeCompare(right.title));
  }

  async createCourse(input: CreateLegalStudyCourseInput): Promise<LegalStudyCourse> {
    const now = input.now ?? new Date().toISOString();
    await this.repository.require('subjects', input.subjectId);
    validateDate(input.deadline, 'deadline');
    const course: LegalStudyCourse = {
      id:
        input.id ??
        makeUniqueId(
          'course',
          [input.subjectId, input.sourceRef, input.title],
          (await this.repository.list('courses')).map((candidate) => candidate.id)
        ),
      userId: input.userId,
      subjectId: input.subjectId,
      title: requireNonEmpty(input.title, 'title'),
      deadline: input.deadline,
      source: input.source ?? 'manual',
      sourceRef: input.sourceRef,
      createdAt: now,
    };
    return this.repository.insert('courses', course, { now });
  }

  async listEpisodes(courseId: string): Promise<LegalStudyCourseEpisode[]> {
    const episodes = await this.repository.list('episodes', (episode) => episode.courseId === courseId);
    return episodes.sort((left, right) => left.order - right.order || left.title.localeCompare(right.title));
  }

  async addEpisode(input: CreateLegalStudyEpisodeInput): Promise<LegalStudyCourseEpisode> {
    const now = input.now ?? new Date().toISOString();
    await this.repository.require('courses', input.courseId);
    const existingEpisodes = await this.listEpisodes(input.courseId);
    const episode: LegalStudyCourseEpisode = {
      id:
        input.id ??
        makeUniqueId(
          'episode',
          [input.courseId, input.sourceRef, input.title],
          (await this.repository.list('episodes')).map((candidate) => candidate.id)
        ),
      userId: input.userId,
      courseId: input.courseId,
      title: requireNonEmpty(input.title, 'title'),
      order: input.order ?? nextEpisodeOrder(existingEpisodes),
      durationMinutes: validatePositiveInteger(input.durationMinutes, 'durationMinutes'),
      status: input.status ?? 'pending',
      lockedByUser: input.lockedByUser,
      sourceRef: input.sourceRef,
      createdAt: now,
    };
    return this.repository.insert('episodes', episode, { now });
  }

  async updateEpisodeStatus(
    episodeId: string,
    status: LegalStudyTaskStatus,
    now = new Date().toISOString()
  ): Promise<LegalStudyCourseEpisode> {
    return this.repository.update(
      'episodes',
      episodeId,
      {
        status,
        completedAt: status === 'completed' ? now : undefined,
      },
      { now }
    );
  }

  async completeEpisode(
    episodeId: string,
    completedAt = new Date().toISOString()
  ): Promise<CompleteLegalStudyEpisodeResult> {
    return this.repository.transaction(async (transaction) => {
      const snapshot = await transaction.getSnapshot();
      const result = completeEpisodeAndUnlockCards(snapshot, episodeId, completedAt);
      await transaction.replaceSnapshot(result.snapshot);
      const episode = await transaction.require('episodes', episodeId);
      return {
        episode,
        unlockReport: result.report,
      };
    });
  }

  async previewBilibiliCourse(input: PreviewBilibiliCourseInput): Promise<BilibiliImportPreview> {
    return this.bilibiliProvider.previewCourse({
      url: requireNonEmpty(input.url, 'url'),
      titleHint: input.titleHint,
    });
  }

  async confirmBilibiliCourseImport(
    input: ConfirmBilibiliCourseImportInput
  ): Promise<ImportedLegalStudyCourseResult> {
    const now = input.now ?? new Date().toISOString();
    const correctedPreview: BilibiliImportPreview = {
      ...input.preview,
      title: requireNonEmpty(input.title ?? input.preview.title, 'title'),
      episodes: normalizeEpisodeDrafts(input.episodes ?? input.preview.episodes),
      parsedAt: input.preview.parsedAt || now,
    };
    const source = previewToImportedCourse(correctedPreview);
    if (!source.episodes.length) {
      throw new Error('At least one Bilibili episode must be selected before confirming import.');
    }
    return this.persistBilibiliImportedCourse(input, source, now);
  }

  async importBilibiliCourse(input: ImportBilibiliCourseInput): Promise<ImportedLegalStudyCourseResult> {
    const preview = await this.previewBilibiliCourse({
      url: input.url,
      titleHint: input.titleHint,
    });
    return this.confirmBilibiliCourseImport({
      userId: input.userId,
      subjectId: input.subjectId,
      deadline: input.deadline,
      preview,
      now: input.now,
    });
  }

  async getCourseOverview(courseId: string): Promise<LegalStudyCourseOverview> {
    const course = await this.repository.require('courses', courseId);
    const subject = await this.repository.require('subjects', course.subjectId);
    const episodes = await this.listEpisodes(courseId);
    const completedEpisodes = episodes.filter((episode) => episode.status === 'completed');
    const totalMinutes = episodes.reduce((sum, episode) => sum + episode.durationMinutes, 0);
    const completedMinutes = completedEpisodes.reduce((sum, episode) => sum + episode.durationMinutes, 0);
    return {
      course,
      subject,
      episodes,
      stats: {
        totalEpisodeCount: episodes.length,
        completedEpisodeCount: completedEpisodes.length,
        remainingEpisodeCount: episodes.length - completedEpisodes.length,
        totalMinutes,
        completedMinutes,
        remainingMinutes: totalMinutes - completedMinutes,
        progressRatio: totalMinutes === 0 ? 0 : completedMinutes / totalMinutes,
      },
    };
  }

  private async persistBilibiliImportedCourse(
    input: Pick<ImportBilibiliCourseInput, 'userId' | 'subjectId' | 'deadline'>,
    source: BilibiliImportedCourse,
    now: string
  ): Promise<ImportedLegalStudyCourseResult> {
    return this.repository.transaction(async (transaction) => {
      const transactionalService = new LegalStudyCourseService(transaction, {
        bilibiliProvider: this.bilibiliProvider,
      });
      const course = await transactionalService.createCourse({
        userId: input.userId,
        subjectId: input.subjectId,
        title: source.title,
        deadline: input.deadline,
        source: 'bilibili',
        sourceRef: source.sourceUrl,
        now,
      });
      const episodes: LegalStudyCourseEpisode[] = [];
      for (const importedEpisode of source.episodes.sort((left, right) => left.order - right.order)) {
        episodes.push(
          await transactionalService.addEpisode({
            userId: input.userId,
            courseId: course.id,
            title: importedEpisode.title,
            order: importedEpisode.order,
            durationMinutes: importedEpisode.durationMinutes,
            sourceRef: importedEpisode.sourceUrl ?? importedEpisode.sourceEpisodeId,
            now,
          })
        );
      }
      return {
        source,
        course,
        episodes,
      };
    });
  }
}

function createDefaultBilibiliProvider(): BilibiliCourseImportProvider {
  return process.env.BILIBILI_PROVIDER === 'real'
    ? new RealBilibiliCourseImportProvider()
    : new MockBilibiliCourseImportProvider();
}

function nextEpisodeOrder(episodes: LegalStudyCourseEpisode[]): number {
  return episodes.reduce((max, episode) => Math.max(max, episode.order), 0) + 1;
}

function makeUniqueId(prefix: string, seeds: Array<string | undefined>, existingIds: string[]): string {
  const seed = seeds.map((part) => slug(part)).filter(Boolean).join('-');
  const base = seed ? `${prefix}-${seed}` : prefix;
  if (!existingIds.includes(base)) return base;
  for (let index = 2; index < 10000; index += 1) {
    const candidate = `${base}-${index}`;
    if (!existingIds.includes(candidate)) return candidate;
  }
  throw new Error(`Unable to generate unique id for ${prefix}`);
}

function normalizeEpisodeDrafts(episodes: ImportedEpisodeDraft[]): ImportedEpisodeDraft[] {
  const selectedEpisodes = episodes.filter((episode) => episode.selected !== false);
  return selectedEpisodes
    .map((episode, index) => ({
      ...episode,
      title: requireNonEmpty(episode.title, `episodes[${index}].title`),
      order: validatePositiveInteger(episode.order ?? index + 1, `episodes[${index}].order`),
      durationMinutes: validatePositiveInteger(episode.durationMinutes, `episodes[${index}].durationMinutes`),
      selected: true,
    }))
    .sort((left, right) => left.order - right.order)
    .map((episode, index) => ({ ...episode, order: index + 1 }));
}

function slug(value: string | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function requireNonEmpty(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} cannot be empty`);
  }
  return trimmed;
}

function validateDate(value: string, field: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${field} must use YYYY-MM-DD format`);
  }
}

function validatePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return value;
}

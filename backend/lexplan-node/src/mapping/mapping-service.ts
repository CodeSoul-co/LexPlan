import { completeEpisodeAndUnlockCards, computeUnlockCandidates } from './unlock';
import type { LegalStudyRepository } from '../repositories/legal-study-repository';
import type {
  LegalStudyChapter,
  LegalStudyChapterMapping,
  LegalStudyCourseEpisode,
  LegalStudyTextbook,
  LegalStudyUnlockReport,
} from '../types';

export interface LegalStudyMappingFilter {
  episodeId?: string;
  chapterId?: string;
}

export interface SuggestLegalStudyMappingsInput {
  courseId?: string;
  subjectId?: string;
  textbookId?: string;
  minConfidence?: number;
  now?: string;
}

export interface LegalStudyChapterMappingSuggestion {
  episode: LegalStudyCourseEpisode;
  chapter: LegalStudyChapter;
  textbook: LegalStudyTextbook;
  confidence: number;
  reason: string;
  existingMapping?: LegalStudyChapterMapping;
}

export interface ConfirmLegalStudyMappingInput {
  episodeId: string;
  chapterId: string;
  confidence?: number;
  reason?: string;
  now?: string;
}

export interface ModifyLegalStudyMappingInput {
  chapterId?: string;
  confidence?: number;
  reason?: string;
  now?: string;
}

export interface ApplyLegalStudyUnlockResult {
  report: LegalStudyUnlockReport;
}

export class LegalStudyMappingService {
  constructor(private readonly repository: LegalStudyRepository) {}

  async listMappings(filter: LegalStudyMappingFilter = {}): Promise<LegalStudyChapterMapping[]> {
    const mappings = await this.repository.list('mappings', (mapping) => {
      if (filter.episodeId && mapping.episodeId !== filter.episodeId) return false;
      if (filter.chapterId && mapping.chapterId !== filter.chapterId) return false;
      return true;
    });
    return mappings.sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
  }

  async suggestMappings(
    input: SuggestLegalStudyMappingsInput = {}
  ): Promise<LegalStudyChapterMappingSuggestion[]> {
    const snapshot = await this.repository.getSnapshot();
    const courses = input.subjectId
      ? snapshot.courses.filter((course) => course.subjectId === input.subjectId)
      : snapshot.courses;
    const courseIds = new Set(courses.map((course) => course.id));
    const candidateEpisodes = snapshot.episodes.filter((episode) => {
      if (input.courseId && episode.courseId !== input.courseId) return false;
      return courseIds.has(episode.courseId);
    });
    const textbooks = snapshot.textbooks.filter((textbook) => {
      if (input.textbookId && textbook.id !== input.textbookId) return false;
      if (input.subjectId && textbook.subjectId !== input.subjectId) return false;
      return true;
    });
    const textbookById = new Map(textbooks.map((textbook) => [textbook.id, textbook]));
    const chapters = snapshot.chapters.filter((chapter) => textbookById.has(chapter.textbookId));
    const existingMappings = new Map(
      snapshot.mappings.map((mapping) => [`${mapping.episodeId}:${mapping.chapterId}`, mapping])
    );
    const minConfidence = input.minConfidence ?? 0.45;
    const suggestions: LegalStudyChapterMappingSuggestion[] = [];

    for (const episode of candidateEpisodes) {
      for (const chapter of chapters) {
        const textbook = textbookById.get(chapter.textbookId);
        if (!textbook) continue;
        const score = scoreTitleSimilarity(episode.title, chapter.title);
        if (score.confidence < minConfidence) continue;
        suggestions.push({
          episode,
          chapter,
          textbook,
          confidence: score.confidence,
          reason: score.reason,
          existingMapping: existingMappings.get(`${episode.id}:${chapter.id}`),
        });
      }
    }

    return suggestions.sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.episode.order - right.episode.order ||
        left.chapter.order - right.chapter.order
    );
  }

  async confirmMapping(input: ConfirmLegalStudyMappingInput): Promise<LegalStudyChapterMapping> {
    const now = input.now ?? new Date().toISOString();
    const episode = await this.repository.require('episodes', input.episodeId);
    const chapter = await this.repository.require('chapters', input.chapterId);
    await this.ensureEpisodeAndChapterShareSubject(episode, chapter);
    const existing = (
      await this.repository.list(
        'mappings',
        (mapping) => mapping.episodeId === input.episodeId && mapping.chapterId === input.chapterId
      )
    )[0];
    const mapping: LegalStudyChapterMapping = {
      id: existing?.id ?? makeMappingId(input.episodeId, input.chapterId),
      userId: episode.userId,
      episodeId: input.episodeId,
      chapterId: input.chapterId,
      confidence: input.confidence ?? existing?.confidence ?? scoreTitleSimilarity(episode.title, chapter.title).confidence,
      reason: input.reason ?? existing?.reason ?? `用户确认：${episode.title} -> ${chapter.title}`,
      source: 'user_confirmed',
      createdAt: existing?.createdAt ?? now,
      updatedAt: existing ? now : undefined,
    };
    return existing
      ? this.repository.update('mappings', existing.id, mapping, { now, preserveUpdatedAt: true })
      : this.repository.insert('mappings', mapping, { now });
  }

  async modifyMapping(
    mappingId: string,
    input: ModifyLegalStudyMappingInput
  ): Promise<LegalStudyChapterMapping> {
    const now = input.now ?? new Date().toISOString();
    const current = await this.repository.require('mappings', mappingId);
    if (input.chapterId) {
      const episode = await this.repository.require('episodes', current.episodeId);
      const chapter = await this.repository.require('chapters', input.chapterId);
      await this.ensureEpisodeAndChapterShareSubject(episode, chapter);
    }
    return this.repository.update(
      'mappings',
      mappingId,
      {
        chapterId: input.chapterId ?? current.chapterId,
        confidence: input.confidence ?? current.confidence,
        reason: input.reason ?? current.reason,
        source: 'user_modified',
      },
      { now }
    );
  }

  async deleteMapping(mappingId: string): Promise<boolean> {
    return this.repository.delete('mappings', mappingId);
  }

  async getUnlockPreview(episodeId: string): Promise<LegalStudyUnlockReport> {
    return computeUnlockCandidates(await this.repository.getSnapshot(), episodeId);
  }

  async applyUnlocks(
    episodeId: string,
    completedAt = new Date().toISOString()
  ): Promise<ApplyLegalStudyUnlockResult> {
    return this.repository.transaction(async (transaction) => {
      const result = completeEpisodeAndUnlockCards(await transaction.getSnapshot(), episodeId, completedAt);
      await transaction.replaceSnapshot(result.snapshot);
      return {
        report: result.report,
      };
    });
  }

  private async ensureEpisodeAndChapterShareSubject(
    episode: LegalStudyCourseEpisode,
    chapter: LegalStudyChapter
  ): Promise<void> {
    const course = await this.repository.require('courses', episode.courseId);
    const textbook = await this.repository.require('textbooks', chapter.textbookId);
    if (course.subjectId !== textbook.subjectId) {
      throw new Error(
        `Episode ${episode.id} and chapter ${chapter.id} belong to different subjects.`
      );
    }
  }
}

function makeMappingId(episodeId: string, chapterId: string): string {
  return `mapping-${slug(episodeId)}-${slug(chapterId)}`;
}

function scoreTitleSimilarity(left: string, right: string): { confidence: number; reason: string } {
  const leftTokens = tokenizeTitle(left);
  const rightTokens = tokenizeTitle(right);
  if (!leftTokens.length || !rightTokens.length) {
    return { confidence: 0, reason: '标题缺少可匹配关键词。' };
  }
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => rightSet.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  const jaccard = intersection.length / union.size;
  const leftNormalized = normalizeTitle(left);
  const rightNormalized = normalizeTitle(right);
  const containment =
    leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized) ? 0.35 : 0;
  const confidence = Math.min(0.98, Number((0.35 + jaccard * 0.55 + containment).toFixed(2)));
  const reason = intersection.length
    ? `标题关键词匹配：${Array.from(new Set(intersection)).join('、')}。`
    : '标题结构相近，建议人工复核。';
  return { confidence, reason };
}

function tokenizeTitle(value: string): string[] {
  const normalized = normalizeTitle(value);
  const asciiWords = normalized.match(/[a-z0-9]+/g) ?? [];
  const chinese = normalized.replace(/[a-z0-9]/g, '');
  const grams: string[] = [];
  for (let index = 0; index < chinese.length; index += 1) {
    grams.push(chinese[index]);
    if (index + 1 < chinese.length) grams.push(chinese.slice(index, index + 2));
  }
  return [...asciiWords, ...grams].filter((token) => token.length > 0);
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/第[一二三四五六七八九十百0-9]+[章节编讲]/g, '')
    .replace(/精讲|导学|串讲|核心|考点|复习|框架|真题|应用|的|与|和|及/g, '')
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
    .trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

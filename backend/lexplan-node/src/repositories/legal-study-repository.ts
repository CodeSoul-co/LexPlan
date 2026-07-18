import type {
  LegalStudyCard,
  LegalStudyChapter,
  LegalStudyChapterMapping,
  LegalStudyContentSlice,
  LegalStudyCourse,
  LegalStudyCourseEpisode,
  LegalStudyDailyPlan,
  LegalStudyEntityBase,
  LegalStudyLearningSnapshot,
  LegalStudyReviewState,
  LegalStudySubject,
  LegalStudyTextbook,
} from '../types';

export interface LegalStudyEntityCollectionMap {
  subjects: LegalStudySubject;
  courses: LegalStudyCourse;
  episodes: LegalStudyCourseEpisode;
  textbooks: LegalStudyTextbook;
  chapters: LegalStudyChapter;
  contentSlices: LegalStudyContentSlice;
  mappings: LegalStudyChapterMapping;
  cards: LegalStudyCard;
  reviewStates: LegalStudyReviewState;
  plans: LegalStudyDailyPlan;
}

export type LegalStudyEntityCollectionName = keyof LegalStudyEntityCollectionMap;
export type LegalStudyEntityFor<K extends LegalStudyEntityCollectionName> =
  LegalStudyEntityCollectionMap[K];

export interface LegalStudyLearningProfile {
  userId: string;
  capturedAt: string;
  examDate: string;
  availableMinutesToday: number;
  rejectedProposalFingerprints: string[];
}

export interface LegalStudyRepositoryMutationOptions {
  now?: string;
  preserveUpdatedAt?: boolean;
}

export type LegalStudyEntityPatch<K extends LegalStudyEntityCollectionName> = Partial<
  Omit<LegalStudyEntityFor<K>, 'id' | 'userId' | 'createdAt'>
>;

export type LegalStudyEntityUpdater<K extends LegalStudyEntityCollectionName> = (
  entity: LegalStudyEntityFor<K>
) => LegalStudyEntityFor<K>;

export interface LegalStudyRepositoryReader {
  getProfile(): Promise<LegalStudyLearningProfile>;
  getSnapshot(): Promise<LegalStudyLearningSnapshot>;
  list<K extends LegalStudyEntityCollectionName>(
    collection: K,
    filter?: (entity: LegalStudyEntityFor<K>) => boolean
  ): Promise<Array<LegalStudyEntityFor<K>>>;
  get<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string
  ): Promise<LegalStudyEntityFor<K> | undefined>;
  require<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string
  ): Promise<LegalStudyEntityFor<K>>;
}

export interface LegalStudyRepository extends LegalStudyRepositoryReader {
  replaceSnapshot(snapshot: LegalStudyLearningSnapshot): Promise<void>;
  updateSnapshot(
    updater: (snapshot: LegalStudyLearningSnapshot) => LegalStudyLearningSnapshot | void,
    options?: LegalStudyRepositoryMutationOptions
  ): Promise<LegalStudyLearningSnapshot>;
  updateProfile(
    patch: Partial<Omit<LegalStudyLearningProfile, 'userId'>>,
    options?: LegalStudyRepositoryMutationOptions
  ): Promise<LegalStudyLearningProfile>;
  insert<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entity: LegalStudyEntityFor<K>,
    options?: LegalStudyRepositoryMutationOptions
  ): Promise<LegalStudyEntityFor<K>>;
  upsert<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entity: LegalStudyEntityFor<K>,
    options?: LegalStudyRepositoryMutationOptions
  ): Promise<LegalStudyEntityFor<K>>;
  update<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string,
    patchOrUpdater: LegalStudyEntityPatch<K> | LegalStudyEntityUpdater<K>,
    options?: LegalStudyRepositoryMutationOptions
  ): Promise<LegalStudyEntityFor<K>>;
  delete<K extends LegalStudyEntityCollectionName>(collection: K, id: string): Promise<boolean>;
  replaceCollection<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entities: Array<LegalStudyEntityFor<K>>,
    options?: LegalStudyRepositoryMutationOptions
  ): Promise<Array<LegalStudyEntityFor<K>>>;
  transaction<T>(work: (repository: LegalStudyRepository) => Promise<T>): Promise<T>;
}

export class LegalStudyRepositoryError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'duplicate_entity'
      | 'entity_not_found'
      | 'invalid_entity'
      | 'transaction_failed'
  ) {
    super(message);
    this.name = 'LegalStudyRepositoryError';
  }
}

export function toLegalStudyLearningProfile(
  snapshot: LegalStudyLearningSnapshot
): LegalStudyLearningProfile {
  return {
    userId: snapshot.userId,
    capturedAt: snapshot.capturedAt,
    examDate: snapshot.examDate,
    availableMinutesToday: snapshot.availableMinutesToday,
    rejectedProposalFingerprints: [...snapshot.rejectedProposalFingerprints],
  };
}

export function isLegalStudyEntity(value: unknown): value is LegalStudyEntityBase {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as LegalStudyEntityBase).id === 'string' &&
      typeof (value as LegalStudyEntityBase).userId === 'string' &&
      typeof (value as LegalStudyEntityBase).createdAt === 'string'
  );
}

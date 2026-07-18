import type { LegalStudyLearningSnapshot } from '../types';
import {
  isLegalStudyEntity,
  LegalStudyRepositoryError,
  toLegalStudyLearningProfile,
  type LegalStudyEntityCollectionName,
  type LegalStudyEntityFor,
  type LegalStudyEntityPatch,
  type LegalStudyEntityUpdater,
  type LegalStudyLearningProfile,
  type LegalStudyRepository,
  type LegalStudyRepositoryMutationOptions,
} from './legal-study-repository';

export const LEGAL_STUDY_ENTITY_COLLECTIONS = [
  'subjects',
  'courses',
  'episodes',
  'textbooks',
  'chapters',
  'contentSlices',
  'mappings',
  'cards',
  'reviewStates',
  'plans',
] as const satisfies readonly LegalStudyEntityCollectionName[];

export class InMemoryLegalStudyRepository implements LegalStudyRepository {
  private snapshot: LegalStudyLearningSnapshot;

  constructor(snapshot: LegalStudyLearningSnapshot) {
    this.snapshot = cloneSnapshot(snapshot);
    validateSnapshot(this.snapshot);
  }

  async getProfile(): Promise<LegalStudyLearningProfile> {
    return clone(toLegalStudyLearningProfile(this.snapshot));
  }

  async getSnapshot(): Promise<LegalStudyLearningSnapshot> {
    return cloneSnapshot(this.snapshot);
  }

  async replaceSnapshot(snapshot: LegalStudyLearningSnapshot): Promise<void> {
    const next = cloneSnapshot(snapshot);
    validateSnapshot(next);
    this.snapshot = next;
  }

  async updateSnapshot(
    updater: (snapshot: LegalStudyLearningSnapshot) => LegalStudyLearningSnapshot | void,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyLearningSnapshot> {
    const draft = cloneSnapshot(this.snapshot);
    const updated = updater(draft) ?? draft;
    const next = cloneSnapshot({
      ...updated,
      capturedAt: options.now ?? updated.capturedAt,
    });
    validateSnapshot(next);
    this.snapshot = next;
    return this.getSnapshot();
  }

  async updateProfile(
    patch: Partial<Omit<LegalStudyLearningProfile, 'userId'>>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyLearningProfile> {
    const rejectedProposalFingerprints =
      patch.rejectedProposalFingerprints === undefined
        ? this.snapshot.rejectedProposalFingerprints
        : [...patch.rejectedProposalFingerprints];
    this.snapshot = {
      ...this.snapshot,
      capturedAt: options.now ?? patch.capturedAt ?? this.snapshot.capturedAt,
      examDate: patch.examDate ?? this.snapshot.examDate,
      availableMinutesToday: patch.availableMinutesToday ?? this.snapshot.availableMinutesToday,
      rejectedProposalFingerprints,
    };
    validateSnapshot(this.snapshot);
    return this.getProfile();
  }

  async list<K extends LegalStudyEntityCollectionName>(
    collection: K,
    filter?: (entity: LegalStudyEntityFor<K>) => boolean
  ): Promise<Array<LegalStudyEntityFor<K>>> {
    const items = collectionRef(this.snapshot, collection);
    const filtered = filter ? items.filter(filter) : items;
    return clone(filtered);
  }

  async get<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string
  ): Promise<LegalStudyEntityFor<K> | undefined> {
    const entity = collectionRef(this.snapshot, collection).find((candidate) => candidate.id === id);
    return entity ? clone(entity) : undefined;
  }

  async require<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string
  ): Promise<LegalStudyEntityFor<K>> {
    const entity = await this.get(collection, id);
    if (!entity) {
      throw new LegalStudyRepositoryError(
        `Entity not found in ${collection}: ${id}`,
        'entity_not_found'
      );
    }
    return entity;
  }

  async insert<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entity: LegalStudyEntityFor<K>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyEntityFor<K>> {
    validateEntityForSnapshot(this.snapshot, collection, entity);
    const items = collectionRef(this.snapshot, collection);
    if (items.some((candidate) => candidate.id === entity.id)) {
      throw new LegalStudyRepositoryError(
        `Duplicate entity in ${collection}: ${entity.id}`,
        'duplicate_entity'
      );
    }
    const next = clone(entity);
    items.push(touch(next, options, 'insert'));
    touchSnapshot(this.snapshot, options);
    return clone(next);
  }

  async upsert<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entity: LegalStudyEntityFor<K>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyEntityFor<K>> {
    validateEntityForSnapshot(this.snapshot, collection, entity);
    const items = collectionRef(this.snapshot, collection);
    const index = items.findIndex((candidate) => candidate.id === entity.id);
    const next = clone(entity);
    if (index === -1) {
      items.push(touch(next, options, 'insert'));
    } else {
      items[index] = touch(next, options, 'update');
    }
    touchSnapshot(this.snapshot, options);
    return clone(next);
  }

  async update<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string,
    patchOrUpdater: LegalStudyEntityPatch<K> | LegalStudyEntityUpdater<K>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyEntityFor<K>> {
    const items = collectionRef(this.snapshot, collection);
    const index = items.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      throw new LegalStudyRepositoryError(
        `Entity not found in ${collection}: ${id}`,
        'entity_not_found'
      );
    }
    const current = items[index];
    const next =
      typeof patchOrUpdater === 'function'
        ? patchOrUpdater(clone(current))
        : ({ ...current, ...patchOrUpdater } as LegalStudyEntityFor<K>);
    validateEntityUpdate(collection, current, next);
    items[index] = touch(clone(next), options, 'update');
    touchSnapshot(this.snapshot, options);
    return clone(items[index]);
  }

  async delete<K extends LegalStudyEntityCollectionName>(collection: K, id: string): Promise<boolean> {
    const items = collectionRef(this.snapshot, collection);
    const index = items.findIndex((candidate) => candidate.id === id);
    if (index === -1) {
      return false;
    }
    items.splice(index, 1);
    touchSnapshot(this.snapshot);
    return true;
  }

  async replaceCollection<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entities: Array<LegalStudyEntityFor<K>>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<Array<LegalStudyEntityFor<K>>> {
    for (const entity of entities) {
      validateEntityForSnapshot(this.snapshot, collection, entity);
    }
    const ids = new Set<string>();
    for (const entity of entities) {
      if (ids.has(entity.id)) {
        throw new LegalStudyRepositoryError(
          `Duplicate entity in replacement ${collection}: ${entity.id}`,
          'duplicate_entity'
        );
      }
      ids.add(entity.id);
    }
    this.snapshot = {
      ...this.snapshot,
      [collection]: clone(entities),
    };
    touchSnapshot(this.snapshot, options);
    validateSnapshot(this.snapshot);
    return this.list(collection);
  }

  async transaction<T>(work: (repository: LegalStudyRepository) => Promise<T>): Promise<T> {
    const workingRepository = new InMemoryLegalStudyRepository(this.snapshot);
    try {
      const result = await work(workingRepository);
      this.snapshot = await workingRepository.getSnapshot();
      return result;
    } catch (error) {
      if (error instanceof LegalStudyRepositoryError) {
        throw error;
      }
      throw error;
    }
  }
}

function collectionRef<K extends LegalStudyEntityCollectionName>(
  snapshot: LegalStudyLearningSnapshot,
  collection: K
): Array<LegalStudyEntityFor<K>> {
  return snapshot[collection] as Array<LegalStudyEntityFor<K>>;
}

function touch<K extends LegalStudyEntityCollectionName>(
  entity: LegalStudyEntityFor<K>,
  options: LegalStudyRepositoryMutationOptions,
  operation: 'insert' | 'update'
): LegalStudyEntityFor<K> {
  if (options.preserveUpdatedAt || operation === 'insert') {
    return entity;
  }
  return {
    ...entity,
    updatedAt: options.now ?? new Date().toISOString(),
  };
}

function touchSnapshot(
  snapshot: LegalStudyLearningSnapshot,
  options: LegalStudyRepositoryMutationOptions = {}
): void {
  snapshot.capturedAt = options.now ?? new Date().toISOString();
}

function validateEntityForSnapshot<K extends LegalStudyEntityCollectionName>(
  snapshot: LegalStudyLearningSnapshot,
  collection: K,
  entity: LegalStudyEntityFor<K>
): void {
  if (!isLegalStudyEntity(entity)) {
    throw new LegalStudyRepositoryError(`Invalid entity for ${collection}`, 'invalid_entity');
  }
  if (entity.userId !== snapshot.userId) {
    throw new LegalStudyRepositoryError(
      `Entity ${entity.id} belongs to ${entity.userId}, expected ${snapshot.userId}`,
      'invalid_entity'
    );
  }
}

function validateEntityUpdate<K extends LegalStudyEntityCollectionName>(
  collection: K,
  current: LegalStudyEntityFor<K>,
  next: LegalStudyEntityFor<K>
): void {
  if (!isLegalStudyEntity(next)) {
    throw new LegalStudyRepositoryError(`Invalid updated entity for ${collection}`, 'invalid_entity');
  }
  if (current.id !== next.id || current.userId !== next.userId || current.createdAt !== next.createdAt) {
    throw new LegalStudyRepositoryError(
      `Updated entity cannot change identity fields in ${collection}: ${current.id}`,
      'invalid_entity'
    );
  }
}

function validateSnapshot(snapshot: LegalStudyLearningSnapshot): void {
  for (const collection of LEGAL_STUDY_ENTITY_COLLECTIONS) {
    const ids = new Set<string>();
    for (const entity of collectionRef(snapshot, collection)) {
      validateEntityForSnapshot(snapshot, collection, entity);
      if (ids.has(entity.id)) {
        throw new LegalStudyRepositoryError(
          `Duplicate entity in ${collection}: ${entity.id}`,
          'duplicate_entity'
        );
      }
      ids.add(entity.id);
    }
  }
}

function cloneSnapshot(snapshot: LegalStudyLearningSnapshot): LegalStudyLearningSnapshot {
  return clone(snapshot);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

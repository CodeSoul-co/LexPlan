import {
  LEGAL_STUDY_ENTITY_COLLECTIONS,
  LegalStudyRepositoryError,
  toLegalStudyLearningProfile,
  type LegalStudyEntityCollectionName,
  type LegalStudyEntityFor,
  type LegalStudyEntityPatch,
  type LegalStudyEntityUpdater,
  type LegalStudyJob,
  type LegalStudyJobCreateInput,
  type LegalStudyJobFilter,
  type LegalStudyJobStore,
  type LegalStudyLearningProfile,
  type LegalStudyLearningSnapshot,
  type LegalStudyPlanProposal,
  type LegalStudyProposalStore,
  type LegalStudyRepository,
  type LegalStudyRepositoryMutationOptions,
} from '../index';

type MongoDbLike = {
  collection<T = Record<string, unknown>>(name: string): MongoCollection<T>;
};

type MongoCollection<T> = {
  createIndex(index: Record<string, 1 | -1>, options?: Record<string, unknown>): Promise<unknown>;
  findOne(filter: Record<string, unknown>): Promise<(T & { _id?: string }) | null>;
  find(filter: Record<string, unknown>): { sort(sort: Record<string, 1 | -1>): { toArray(): Promise<Array<T & { _id?: string }>> } };
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<{ matchedCount: number; upsertedCount?: number }>;
  deleteMany(filter: Record<string, unknown>): Promise<unknown>;
  deleteOne(filter: Record<string, unknown>): Promise<{ deletedCount?: number }>;
  insertOne(doc: T & { _id: string }): Promise<unknown>;
  insertMany(docs: Array<T & { _id: string }>): Promise<unknown>;
};

type EntityDocument<K extends LegalStudyEntityCollectionName> = LegalStudyEntityFor<K> & { _id: string };
type ProfileDocument = LegalStudyLearningProfile & { _id: string; updatedAt?: string };
type ProposalDocument = LegalStudyPlanProposal & { _id: string };
type JobDocument = LegalStudyJob & { _id: string };

const ENTITY_COLLECTION_NAMES: Record<LegalStudyEntityCollectionName, string> = {
  subjects: 'legal_study_subjects',
  courses: 'legal_study_courses',
  episodes: 'legal_study_episodes',
  textbooks: 'legal_study_textbooks',
  chapters: 'legal_study_chapters',
  contentSlices: 'legal_study_content_slices',
  mappings: 'legal_study_mappings',
  cards: 'legal_study_cards',
  reviewStates: 'legal_study_review_states',
  plans: 'legal_study_plans',
};

const PROFILE_COLLECTION = 'legal_study_learning_profiles';
const PROPOSAL_COLLECTION = 'legal_study_plan_proposals';
const JOB_COLLECTION = 'legal_study_jobs';

export class MongoLegalStudyRepository implements LegalStudyRepository {
  constructor(
    private readonly db: MongoDbLike,
    private userId: string
  ) {}

  async ensureInitialized(snapshot: LegalStudyLearningSnapshot): Promise<void> {
    await this.ensureIndexes();
    const profile = await this.getProfileDocument();
    if (!profile) {
      await this.replaceSnapshot(snapshot);
    }
  }

  async switchUser(userId: string): Promise<void> {
    this.userId = userId;
  }

  async getProfile(): Promise<LegalStudyLearningProfile> {
    const profile = await this.getProfileDocument();
    if (!profile) {
      throw new LegalStudyRepositoryError(`Learning profile not found: ${this.userId}`, 'entity_not_found');
    }
    return stripMongoId(profile);
  }

  async getSnapshot(): Promise<LegalStudyLearningSnapshot> {
    const profile = await this.getProfile();
    return {
      userId: profile.userId,
      capturedAt: profile.capturedAt,
      examDate: profile.examDate,
      availableMinutesToday: profile.availableMinutesToday,
      subjects: await this.list('subjects'),
      courses: await this.list('courses'),
      episodes: await this.list('episodes'),
      textbooks: await this.list('textbooks'),
      chapters: await this.list('chapters'),
      contentSlices: await this.list('contentSlices'),
      mappings: await this.list('mappings'),
      cards: await this.list('cards'),
      reviewStates: await this.list('reviewStates'),
      plans: await this.list('plans'),
      rejectedProposalFingerprints: [...profile.rejectedProposalFingerprints],
    };
  }

  async replaceSnapshot(snapshot: LegalStudyLearningSnapshot): Promise<void> {
    await this.ensureIndexes();
    this.userId = snapshot.userId;
    await this.profileCollection().updateOne(
      { _id: snapshot.userId },
      {
        $set: {
          ...toLegalStudyLearningProfile(snapshot),
          _id: snapshot.userId,
          updatedAt: snapshot.capturedAt,
        },
      },
      { upsert: true }
    );
    for (const collection of LEGAL_STUDY_ENTITY_COLLECTIONS) {
      await this.replaceCollection(collection, snapshot[collection] as Array<LegalStudyEntityFor<typeof collection>>, {
        now: snapshot.capturedAt,
        preserveUpdatedAt: true,
      });
    }
  }

  async updateSnapshot(
    updater: (snapshot: LegalStudyLearningSnapshot) => LegalStudyLearningSnapshot | void,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyLearningSnapshot> {
    const draft = clone(await this.getSnapshot());
    const updated = updater(draft) ?? draft;
    const next = { ...updated, capturedAt: options.now ?? updated.capturedAt };
    await this.replaceSnapshot(next);
    return this.getSnapshot();
  }

  async updateProfile(
    patch: Partial<Omit<LegalStudyLearningProfile, 'userId'>>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyLearningProfile> {
    const current = await this.getProfile();
    const next: LegalStudyLearningProfile = {
      ...current,
      ...clone(patch),
      userId: current.userId,
      capturedAt: options.now ?? patch.capturedAt ?? current.capturedAt,
      rejectedProposalFingerprints:
        patch.rejectedProposalFingerprints === undefined
          ? current.rejectedProposalFingerprints
          : [...patch.rejectedProposalFingerprints],
    };
    await this.profileCollection().updateOne(
      { _id: this.userId },
      { $set: { ...next, _id: this.userId, updatedAt: options.now ?? new Date().toISOString() } },
      { upsert: true }
    );
    return this.getProfile();
  }

  async list<K extends LegalStudyEntityCollectionName>(
    collection: K,
    filter?: (entity: LegalStudyEntityFor<K>) => boolean
  ): Promise<Array<LegalStudyEntityFor<K>>> {
    const items = (await this.entityCollection(collection)
      .find({ userId: this.userId })
      .sort({ createdAt: 1, _id: 1 })
      .toArray()).map(stripMongoId) as Array<LegalStudyEntityFor<K>>;
    return filter ? clone(items.filter(filter)) : clone(items);
  }

  async get<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string
  ): Promise<LegalStudyEntityFor<K> | undefined> {
    const doc = await this.entityCollection(collection).findOne({ _id: id, userId: this.userId });
    return doc ? (clone(stripMongoId(doc)) as LegalStudyEntityFor<K>) : undefined;
  }

  async require<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string
  ): Promise<LegalStudyEntityFor<K>> {
    const entity = await this.get(collection, id);
    if (!entity) {
      throw new LegalStudyRepositoryError(`Entity not found in ${collection}: ${id}`, 'entity_not_found');
    }
    return entity;
  }

  async insert<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entity: LegalStudyEntityFor<K>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyEntityFor<K>> {
    this.validateEntity(entity);
    if (await this.get(collection, entity.id)) {
      throw new LegalStudyRepositoryError(`Duplicate entity in ${collection}: ${entity.id}`, 'duplicate_entity');
    }
    const next = touch(clone(entity), options, 'insert');
    await this.entityCollection(collection).insertOne(toMongoDoc(next));
    await this.touchProfile(options.now);
    return clone(next);
  }

  async upsert<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entity: LegalStudyEntityFor<K>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyEntityFor<K>> {
    this.validateEntity(entity);
    const existing = await this.get(collection, entity.id);
    const next = touch(clone(entity), options, existing ? 'update' : 'insert');
    await this.entityCollection(collection).updateOne(
      { _id: next.id, userId: this.userId },
      { $set: toMongoDoc(next) },
      { upsert: true }
    );
    await this.touchProfile(options.now);
    return clone(next);
  }

  async update<K extends LegalStudyEntityCollectionName>(
    collection: K,
    id: string,
    patchOrUpdater: LegalStudyEntityPatch<K> | LegalStudyEntityUpdater<K>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<LegalStudyEntityFor<K>> {
    const current = await this.require(collection, id);
    const next =
      typeof patchOrUpdater === 'function'
        ? patchOrUpdater(clone(current))
        : ({ ...current, ...clone(patchOrUpdater) } as LegalStudyEntityFor<K>);
    this.validateEntityUpdate(collection, current, next);
    const touched = touch(clone(next), options, 'update');
    await this.entityCollection(collection).updateOne(
      { _id: id, userId: this.userId },
      { $set: toMongoDoc(touched) }
    );
    await this.touchProfile(options.now);
    return clone(touched);
  }

  async delete<K extends LegalStudyEntityCollectionName>(collection: K, id: string): Promise<boolean> {
    const result = await this.entityCollection(collection).deleteOne({ _id: id, userId: this.userId });
    if (result.deletedCount) await this.touchProfile();
    return Boolean(result.deletedCount);
  }

  async replaceCollection<K extends LegalStudyEntityCollectionName>(
    collection: K,
    entities: Array<LegalStudyEntityFor<K>>,
    options: LegalStudyRepositoryMutationOptions = {}
  ): Promise<Array<LegalStudyEntityFor<K>>> {
    const seen = new Set<string>();
    for (const entity of entities) {
      this.validateEntity(entity);
      if (seen.has(entity.id)) {
        throw new LegalStudyRepositoryError(`Duplicate entity in replacement ${collection}: ${entity.id}`, 'duplicate_entity');
      }
      seen.add(entity.id);
    }
    const mongoCollection = this.entityCollection(collection);
    await mongoCollection.deleteMany({ userId: this.userId });
    if (entities.length > 0) {
      await mongoCollection.insertMany(entities.map((entity) => toMongoDoc(touch(clone(entity), options, 'insert'))));
    }
    await this.touchProfile(options.now);
    return this.list(collection);
  }

  async transaction<T>(work: (repository: LegalStudyRepository) => Promise<T>): Promise<T> {
    return work(this);
  }

  private async ensureIndexes(): Promise<void> {
    await this.profileCollection().createIndex({ userId: 1 }, { unique: true });
    for (const collection of LEGAL_STUDY_ENTITY_COLLECTIONS) {
      await this.entityCollection(collection).createIndex({ userId: 1, id: 1 }, { unique: true });
      await this.entityCollection(collection).createIndex({ userId: 1, createdAt: 1 });
    }
  }

  private async getProfileDocument(): Promise<ProfileDocument | null> {
    return this.profileCollection().findOne({ _id: this.userId });
  }

  private profileCollection(): MongoCollection<ProfileDocument> {
    return this.db.collection<ProfileDocument>(PROFILE_COLLECTION);
  }

  private entityCollection<K extends LegalStudyEntityCollectionName>(collection: K): MongoCollection<EntityDocument<K>> {
    return this.db.collection<EntityDocument<K>>(ENTITY_COLLECTION_NAMES[collection]);
  }

  private validateEntity(entity: { id: string; userId: string }): void {
    if (!entity.id || !entity.userId) {
      throw new LegalStudyRepositoryError('Invalid legal-study entity.', 'invalid_entity');
    }
    if (entity.userId !== this.userId) {
      throw new LegalStudyRepositoryError(
        `Entity ${entity.id} belongs to ${entity.userId}, expected ${this.userId}`,
        'invalid_entity'
      );
    }
  }

  private validateEntityUpdate<K extends LegalStudyEntityCollectionName>(
    collection: K,
    current: LegalStudyEntityFor<K>,
    next: LegalStudyEntityFor<K>
  ): void {
    this.validateEntity(next);
    if (current.id !== next.id || current.userId !== next.userId || current.createdAt !== next.createdAt) {
      throw new LegalStudyRepositoryError(
        `Updated entity cannot change identity fields in ${collection}: ${current.id}`,
        'invalid_entity'
      );
    }
  }

  private async touchProfile(now = new Date().toISOString()): Promise<void> {
    await this.profileCollection().updateOne(
      { _id: this.userId },
      { $set: { capturedAt: now, updatedAt: now } }
    );
  }
}

export class MongoLegalStudyProposalStore implements LegalStudyProposalStore {
  constructor(
    private readonly db: MongoDbLike,
    private userId: string
  ) {}

  async ensureIndexes(): Promise<void> {
    await this.collection().createIndex({ userId: 1, generatedAt: -1 });
  }

  async switchUser(userId: string): Promise<void> {
    this.userId = userId;
  }

  async list(): Promise<LegalStudyPlanProposal[]> {
    return (await this.collection()
      .find({ userId: this.userId })
      .sort({ generatedAt: -1, _id: -1 })
      .toArray()).map(stripMongoId);
  }

  async get(proposalId: string): Promise<LegalStudyPlanProposal | undefined> {
    const proposal = await this.collection().findOne({ _id: proposalId, userId: this.userId });
    return proposal ? stripMongoId(proposal) : undefined;
  }

  async upsert(proposal: LegalStudyPlanProposal): Promise<LegalStudyPlanProposal> {
    if (proposal.userId !== this.userId) await this.switchUser(proposal.userId);
    await this.collection().updateOne(
      { _id: proposal.id, userId: this.userId },
      { $set: toMongoDoc(proposal) },
      { upsert: true }
    );
    return clone(proposal);
  }

  async replaceAll(proposals: LegalStudyPlanProposal[]): Promise<void> {
    await this.collection().deleteMany({ userId: this.userId });
    if (proposals.length > 0) await this.collection().insertMany(proposals.map(toMongoDoc));
  }

  private collection(): MongoCollection<ProposalDocument> {
    return this.db.collection<ProposalDocument>(PROPOSAL_COLLECTION);
  }
}

export class MongoLegalStudyJobStore implements LegalStudyJobStore {
  constructor(
    private readonly db: MongoDbLike,
    private userId: string
  ) {}

  async ensureIndexes(): Promise<void> {
    await this.collection().createIndex({ userId: 1, status: 1, createdAt: -1 });
    await this.collection().createIndex({ userId: 1, type: 1, createdAt: -1 });
  }

  async switchUser(userId: string): Promise<void> {
    this.userId = userId;
  }

  async list(filter: LegalStudyJobFilter = {}): Promise<LegalStudyJob[]> {
    const query: Record<string, unknown> = { userId: filter.userId ?? this.userId };
    if (filter.type) query.type = filter.type;
    if (filter.status) query.status = filter.status;
    return (await this.collection().find(query).sort({ createdAt: -1, _id: -1 }).toArray()).map(stripMongoId);
  }

  async get(jobId: string): Promise<LegalStudyJob | undefined> {
    const job = await this.collection().findOne({ _id: jobId, userId: this.userId });
    return job ? stripMongoId(job) : undefined;
  }

  async require(jobId: string): Promise<LegalStudyJob> {
    const job = await this.get(jobId);
    if (!job) throw new Error(`Legal-study job not found: ${jobId}`);
    return job;
  }

  async create(input: LegalStudyJobCreateInput): Promise<LegalStudyJob> {
    if (input.userId !== this.userId) await this.switchUser(input.userId);
    const now = input.now ?? new Date().toISOString();
    const job: LegalStudyJob = {
      id: input.id ?? makeJobId(input.type),
      userId: input.userId,
      type: input.type,
      status: 'queued',
      progress: { percent: 0, message: 'Queued.' },
      input: clone(input.input),
      retryCount: 0,
      createdAt: now,
    };
    if (await this.get(job.id)) throw new Error(`Duplicate legal-study job: ${job.id}`);
    await this.collection().insertOne(toMongoDoc(job));
    return clone(job);
  }

  async update(
    jobId: string,
    patch: Partial<Omit<LegalStudyJob, 'id' | 'userId' | 'createdAt'>>
  ): Promise<LegalStudyJob> {
    const current = await this.require(jobId);
    const updated: LegalStudyJob = {
      ...current,
      ...clone(patch),
      updatedAt: new Date().toISOString(),
    };
    await this.collection().updateOne({ _id: jobId, userId: this.userId }, { $set: toMongoDoc(updated) });
    return clone(updated);
  }

  async replaceAll(jobs: LegalStudyJob[]): Promise<void> {
    await this.collection().deleteMany({ userId: this.userId });
    if (jobs.length > 0) await this.collection().insertMany(jobs.map(toMongoDoc));
  }

  private collection(): MongoCollection<JobDocument> {
    return this.db.collection<JobDocument>(JOB_COLLECTION);
  }
}

function toMongoDoc<T extends { id: string }>(entity: T): T & { _id: string } {
  return { ...clone(entity), _id: entity.id };
}

function stripMongoId<T>(document: T & { _id?: string }): T {
  const { _id: _ignored, ...entity } = document;
  return clone(entity as T);
}

function touch<K extends LegalStudyEntityCollectionName>(
  entity: LegalStudyEntityFor<K>,
  options: LegalStudyRepositoryMutationOptions,
  operation: 'insert' | 'update'
): LegalStudyEntityFor<K> {
  if (options.preserveUpdatedAt || operation === 'insert') return entity;
  return { ...entity, updatedAt: options.now ?? new Date().toISOString() };
}

function makeJobId(type: string): string {
  return `job-${type.replace(/_/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

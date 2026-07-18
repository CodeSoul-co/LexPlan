import path from 'node:path';
import {
  ArtifactStoreToolPort,
  FileArtifactStore,
  FileToolContractSnapshotStore,
  FileToolObservationStore,
  FileToolRuntimeStore,
  SQLiteEventStore,
} from '@hypha/adapters-local';
import { InMemoryTelemetryRecorder } from '@hypha/core';
import { InMemoryToolResultCache } from '@hypha/tools';
import { createLegalStudySeedSnapshot, LegalStudyRuntime } from '../index';
import { getMongoConnection } from './database';
import {
  MongoLegalStudyJobStore,
  MongoLegalStudyProposalStore,
  MongoLegalStudyRepository,
} from './LegalStudyMongoStores';
import { logger } from '../utils/logger';

const DEFAULT_USER_ID = process.env.LEGAL_STUDY_USER_ID || createLegalStudySeedSnapshot().userId;
const TOOL_RUNTIME_STORE_PATH =
  process.env.LEGAL_STUDY_TOOL_RUNTIME_STORE_PATH ||
  path.resolve(process.cwd(), 'data', 'tool-runtime.json');
const TOOL_EVENT_STORE_PATH =
  process.env.LEGAL_STUDY_TOOL_EVENT_STORE_PATH ||
  path.resolve(process.cwd(), 'data', 'tool-events.json');
const toolRuntimeStore = new FileToolRuntimeStore({ filename: TOOL_RUNTIME_STORE_PATH });
const toolTrace = new SQLiteEventStore({
  filename: TOOL_EVENT_STORE_PATH,
  mode: 'json',
  jsonFallbackFilename: TOOL_EVENT_STORE_PATH,
});
const toolSnapshotStore = new FileToolContractSnapshotStore(
  process.env.LEGAL_STUDY_TOOL_SNAPSHOT_ROOT ||
    path.resolve(process.cwd(), 'data', 'tool-contract-snapshots')
);
const toolArtifactPort = new ArtifactStoreToolPort(
  new FileArtifactStore({
    rootPath:
      process.env.LEGAL_STUDY_TOOL_ARTIFACT_ROOT ||
      path.resolve(process.cwd(), 'data', 'tool-artifacts'),
  })
);
const toolObservationPort = new FileToolObservationStore(
  process.env.LEGAL_STUDY_TOOL_OBSERVATION_ROOT ||
    path.resolve(process.cwd(), 'data', 'tool-observations')
);
const toolResultCache = new InMemoryToolResultCache();
const toolTelemetry = new InMemoryTelemetryRecorder();

let runtime = createRuntime(createLegalStudySeedSnapshot(DEFAULT_USER_ID));
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let storeMode: 'mongo-domain-repositories' | 'memory-fallback' = 'memory-fallback';
let repository: MongoLegalStudyRepository | null = null;
let proposalStore: MongoLegalStudyProposalStore | null = null;
let jobStore: MongoLegalStudyJobStore | null = null;

export function getLegalStudyRuntime(): LegalStudyRuntime {
  return runtime;
}

export async function hydrateLegalStudyRuntime(): Promise<void> {
  if (hydrated) return;
  if (!hydratePromise) {
    hydratePromise = hydrateRuntimeOnce().finally(() => {
      hydratePromise = null;
    });
  }
  await hydratePromise;
}

export async function persistLegalStudyRuntime(): Promise<void> {
  await hydrateLegalStudyRuntime();
  await runtime.hydrateFromStores();
}

export function getLegalStudyRuntimePersistenceStatus(): {
  store: 'mongo-domain-repositories' | 'memory-fallback';
  hydrated: boolean;
  collections: string[];
  userId: string;
} {
  return {
    store: storeMode,
    hydrated,
    collections:
      storeMode === 'mongo-domain-repositories'
        ? [
            'legal_study_learning_profiles',
            'legal_study_subjects',
            'legal_study_courses',
            'legal_study_episodes',
            'legal_study_textbooks',
            'legal_study_chapters',
            'legal_study_content_slices',
            'legal_study_mappings',
            'legal_study_cards',
            'legal_study_review_states',
            'legal_study_plans',
            'legal_study_plan_proposals',
            'legal_study_jobs',
          ]
        : [],
    userId: runtime.getSnapshot().userId,
  };
}

function createRuntime(
  snapshot: ReturnType<typeof createLegalStudySeedSnapshot>,
  options: ConstructorParameters<typeof LegalStudyRuntime>[1] = {}
): LegalStudyRuntime {
  return new LegalStudyRuntime(snapshot, {
    ...options,
    toolApprovalStore: toolRuntimeStore,
    toolInvocationStore: toolRuntimeStore,
    toolTrace,
    toolSnapshotStore,
    toolArtifactPort,
    toolObservationPort,
    toolResultCache,
    toolTelemetry,
  });
}
async function hydrateRuntimeOnce(): Promise<void> {
  const connection = getMongoConnection();
  const db = connection?.connection.db;
  if (!db) {
    storeMode = 'memory-fallback';
    hydrated = true;
    await runtime.recoverToolInvocations();
    return;
  }

  try {
    repository = new MongoLegalStudyRepository(db as never, DEFAULT_USER_ID);
    proposalStore = new MongoLegalStudyProposalStore(db as never, DEFAULT_USER_ID);
    jobStore = new MongoLegalStudyJobStore(db as never, DEFAULT_USER_ID);
    await repository.ensureInitialized(createLegalStudySeedSnapshot(DEFAULT_USER_ID));
    await proposalStore.ensureIndexes();
    await jobStore.ensureIndexes();
    runtime = createRuntime(await repository.getSnapshot(), {
      repository,
      proposalStore,
      jobStore,
    });
    await runtime.hydrateFromStores();
    storeMode = 'mongo-domain-repositories';
    logger.info('Legal study runtime hydrated from MongoDB domain repositories', {
      userId: runtime.getSnapshot().userId,
    });
  } catch (error) {
    storeMode = 'memory-fallback';
    runtime = createRuntime(createLegalStudySeedSnapshot(DEFAULT_USER_ID));
    logger.warn(
      'Legal study Mongo domain repositories are unavailable; using memory fallback.',
      error
    );
  } finally {
    hydrated = true;
  }
  await runtime.recoverToolInvocations();
}

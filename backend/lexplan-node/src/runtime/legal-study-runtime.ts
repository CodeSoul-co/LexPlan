import {
  InMemoryEventStore,
  type EventStore,
  type TelemetryRecorder,
  type TraceRecorder,
} from '@hypha/core';
import { createHash } from 'crypto';
import {
  GovernedToolRunner,
  hashToolContract,
  InMemoryToolApprovalStore,
  InMemoryToolInvocationStore,
  ToolRegistry,
  type ToolApprovalStore,
  type ToolCallContext,
  type ToolCallResult,
  type ToolInvocationStore,
  type ToolArtifactPort,
  type ToolContractSnapshot,
  type ToolContractSnapshotStore,
  type ToolObservationPort,
  type ToolResultCache,
} from '@hypha/tools';
import {
  draftPlanProposal,
  recordRejectedProposal,
  applyAcceptedProposal,
} from '../agent/proposal';
import {
  InMemoryLegalStudyProposalStore,
  LegalStudyAgentService,
  type DecideLegalStudyAgentProposalInput,
  type LegalStudyAgentProposalFilter,
  type ModifyLegalStudyAgentProposalInput,
  type LegalStudyProposalStore,
} from '../agent/agent-service';
import { createDefaultAgentInsightProvider } from '../agent/llm-insight';
import {
  InMemoryLegalStudyJobStore,
  type LegalStudyJobFilter,
  type LegalStudyJobStore,
} from '../jobs/job-store';
import { LegalStudyJobService } from '../jobs/job-service';
import {
  LegalStudyCourseService,
  type CompleteLegalStudyEpisodeResult,
  type CreateLegalStudyCourseInput,
  type CreateLegalStudyEpisodeInput,
  type CreateLegalStudySubjectInput,
  type ImportedLegalStudyCourseResult,
  type ImportBilibiliCourseInput,
  type PreviewBilibiliCourseInput,
  type ConfirmBilibiliCourseImportInput,
  type LegalStudyCourseOverview,
} from '../courses/course-service';
import type {
  BilibiliCourseImportProvider,
  BilibiliImportPreview,
} from '../courses/bilibili-import';
import { createLegalStudySeedSnapshot, LEGAL_STUDY_SEED_TODAY } from '../seed-data';
import type { LegalStudyIngestionInput, LegalStudyIngestionReport } from '../ingestion/types';
import {
  LegalStudyTextbookService,
  type CreateLegalStudyTextbookInput,
  type IngestLegalStudyTextbookResult,
  type LegalStudyCardFilter,
  type UpdateLegalStudyCardInput,
} from '../textbooks/textbook-service';
import {
  LegalStudyMappingService,
  type ConfirmLegalStudyMappingInput,
  type LegalStudyMappingFilter,
  type ModifyLegalStudyMappingInput,
  type SuggestLegalStudyMappingsInput,
} from '../mapping/mapping-service';
import { computeUnlockCandidates, completeEpisodeAndUnlockCards } from '../mapping/unlock';
import { computeReviewPressure, getDueReviewQueue } from '../review/fsrs-lite';
import {
  LegalStudyReviewService,
  type LegalStudyNewCardFilter,
  type LegalStudyReviewQueueFilter,
  type LearnLegalStudyCardInput,
  type SubmitLegalStudyReviewInput,
} from '../review/review-service';
import { InMemoryLegalStudyRepository } from '../repositories/in-memory-legal-study-repository';
import type { LegalStudyRepository } from '../repositories/legal-study-repository';
import { computeCoursePressure } from '../scheduling/pressure';
import type {
  LegalStudyJob,
  LegalStudyJobType,
  LegalStudyLearningSnapshot,
  LegalStudyPlanProposal,
  LegalStudyProposalDecision,
  LegalStudyUnlockReport,
} from '../types';
import { LEGAL_STUDY_TOOL_IDS } from '../tools';
import { createLegalStudyToolPolicyEngine } from '../tooling/tool-policy';
import { registerLegalStudyTools } from '../tooling/tool-runtime';

export interface LegalStudyRuntimeState {
  snapshot: LegalStudyLearningSnapshot;
  proposals: LegalStudyPlanProposal[];
  unlockReports: LegalStudyUnlockReport[];
  ingestionReports: LegalStudyIngestionReport[];
  jobs: LegalStudyJob[];
}

export interface LegalStudyRuntimeOptions {
  repository?: LegalStudyRepository;
  proposalStore?: LegalStudyProposalStore;
  jobStore?: LegalStudyJobStore;
  unlockReports?: LegalStudyUnlockReport[];
  ingestionReports?: LegalStudyIngestionReport[];
  toolApprovalStore?: ToolApprovalStore;
  toolInvocationStore?: ToolInvocationStore;
  toolTrace?: EventStore & TraceRecorder;
  toolArtifactPort?: ToolArtifactPort;
  toolSnapshotStore?: ToolContractSnapshotStore;
  toolObservationPort?: ToolObservationPort;
  toolResultCache?: ToolResultCache;
  toolTelemetry?: TelemetryRecorder;
  bilibiliProvider?: BilibiliCourseImportProvider;
}

function cloneRuntimeState(state: LegalStudyRuntimeState): LegalStudyRuntimeState {
  return {
    snapshot: cloneJson(state.snapshot),
    proposals: cloneJson(state.proposals),
    unlockReports: cloneJson(state.unlockReports),
    ingestionReports: cloneJson(state.ingestionReports),
    jobs: cloneJson(state.jobs),
  };
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export class LegalStudyRuntime {
  private state: LegalStudyRuntimeState;
  private readonly repository?: LegalStudyRepository;
  private readonly proposalStore?: LegalStudyProposalStore;
  private readonly jobStore?: LegalStudyJobStore;
  private readonly toolRegistry = new ToolRegistry();
  private readonly toolApprovalStore: ToolApprovalStore;
  private readonly toolInvocationStore: ToolInvocationStore;
  private readonly toolTrace: EventStore & TraceRecorder;
  private readonly toolRunner: GovernedToolRunner;
  private readonly toolSnapshotStore?: ToolContractSnapshotStore;
  private readonly runToolSnapshots = new Map<string, Promise<string>>();
  private readonly bilibiliProvider?: BilibiliCourseImportProvider;

  constructor(
    snapshot: LegalStudyLearningSnapshot = createLegalStudySeedSnapshot(),
    options: LegalStudyRuntimeOptions = {}
  ) {
    this.repository = options.repository;
    this.proposalStore = options.proposalStore;
    this.jobStore = options.jobStore;
    this.toolApprovalStore = options.toolApprovalStore ?? new InMemoryToolApprovalStore();
    this.toolInvocationStore = options.toolInvocationStore ?? new InMemoryToolInvocationStore();
    this.toolTrace = options.toolTrace ?? new InMemoryEventStore();
    this.toolSnapshotStore = options.toolSnapshotStore;
    this.bilibiliProvider = options.bilibiliProvider;
    this.state = {
      snapshot,
      proposals: [],
      unlockReports: options.unlockReports ?? [],
      ingestionReports: options.ingestionReports ?? [],
      jobs: [],
    };
    this.registerTools(this.toolRegistry);
    this.toolRunner = new GovernedToolRunner(
      this.toolRegistry,
      this.toolTrace,
      createLegalStudyToolPolicyEngine(),
      {
        approvalStore: this.toolApprovalStore,
        invocationStore: this.toolInvocationStore,
        artifactPort: options.toolArtifactPort,
        snapshotStore: options.toolSnapshotStore,
        observationPort: options.toolObservationPort,
        resultCache: options.toolResultCache,
        telemetry: options.toolTelemetry,
      }
    );
  }

  async hydrateFromStores(): Promise<LegalStudyRuntimeState> {
    if (this.repository) {
      this.state = { ...this.state, snapshot: await this.repository.getSnapshot() };
    }
    if (this.proposalStore) {
      this.state = { ...this.state, proposals: await this.proposalStore.list() };
    }
    if (this.jobStore) {
      this.state = { ...this.state, jobs: await this.jobStore.list() };
    }
    return this.getState();
  }

  async reset(userId?: string): Promise<LegalStudyRuntimeState> {
    this.state = {
      snapshot: createLegalStudySeedSnapshot(userId),
      proposals: [],
      unlockReports: [],
      ingestionReports: [],
      jobs: [],
    };
    if (this.repository) await this.repository.replaceSnapshot(this.state.snapshot);
    if (this.proposalStore) await this.proposalStore.replaceAll([]);
    if (this.jobStore) await this.jobStore.replaceAll([]);
    return this.hydrateFromStores();
  }

  getState(): LegalStudyRuntimeState {
    return {
      snapshot: this.state.snapshot,
      proposals: [...this.state.proposals],
      unlockReports: [...this.state.unlockReports],
      ingestionReports: [...this.state.ingestionReports],
      jobs: [...this.state.jobs],
    };
  }

  replaceState(state: LegalStudyRuntimeState): LegalStudyRuntimeState {
    this.state = cloneRuntimeState(state);
    return this.getState();
  }
  getSnapshot(): LegalStudyLearningSnapshot {
    return this.state.snapshot;
  }

  async listJobs(filter: LegalStudyJobFilter = {}): Promise<LegalStudyJob[]> {
    return this.runJobService((service) => service.listJobs(filter));
  }

  async getJob(jobId: string): Promise<LegalStudyJob | undefined> {
    return this.runJobService((service) => service.getJob(jobId));
  }

  async enqueueJob(
    type: LegalStudyJobType,
    input: unknown,
    options: { userId?: string; now?: string; start?: boolean } = {}
  ): Promise<LegalStudyJob> {
    const job = await this.runJobService((service) =>
      service.enqueue({
        userId: options.userId ?? this.state.snapshot.userId,
        type,
        input,
        now: options.now,
      })
    );
    if (options.start) this.startJob(job.id);
    return job;
  }

  async enqueueTextbookIngestionJob(
    input: LegalStudyIngestionInput,
    options: { start?: boolean; now?: string } = {}
  ): Promise<LegalStudyJob> {
    return this.enqueueJob('textbook_ingestion', input, {
      userId: input.userId,
      now: options.now ?? input.now,
      start: options.start,
    });
  }

  async enqueueBilibiliImportJob(
    input: ImportBilibiliCourseInput,
    options: { start?: boolean; now?: string } = {}
  ): Promise<LegalStudyJob> {
    return this.enqueueJob('bilibili_import', input, {
      userId: input.userId,
      now: options.now ?? input.now,
      start: options.start,
    });
  }

  async enqueueAgentProposalRecomputeJob(
    input: { date?: string; now?: string; userId?: string; windowDays?: number },
    options: { start?: boolean; now?: string } = {}
  ): Promise<LegalStudyJob> {
    return this.enqueueJob('agent_proposal_recompute', input, {
      userId: input.userId ?? this.state.snapshot.userId,
      now: options.now ?? input.now,
      start: options.start,
    });
  }

  startJob(jobId: string): void {
    void this.runJob(jobId).catch(() => undefined);
  }

  async runJob(jobId: string): Promise<LegalStudyJob> {
    return this.runJobService((service) => service.runJob(jobId));
  }

  async retryJob(jobId: string): Promise<LegalStudyJob> {
    return this.runJobService((service) => service.retryJob(jobId));
  }

  async cancelJob(jobId: string): Promise<LegalStudyJob> {
    return this.runJobService((service) => service.cancelJob(jobId));
  }

  async listSubjects() {
    return this.runCourseService((service) => service.listSubjects());
  }

  async listCourses(subjectId?: string) {
    return this.runCourseService((service) => service.listCourses(subjectId));
  }

  async listEpisodes(courseId: string) {
    return this.runCourseService((service) => service.listEpisodes(courseId));
  }

  async createSubject(input: CreateLegalStudySubjectInput) {
    return this.runCourseService((service) => service.createSubject(input));
  }

  async createCourse(input: CreateLegalStudyCourseInput) {
    return this.runCourseService((service) => service.createCourse(input));
  }

  async addEpisode(input: CreateLegalStudyEpisodeInput) {
    return this.runCourseService((service) => service.addEpisode(input));
  }

  async previewBilibiliCourse(input: PreviewBilibiliCourseInput): Promise<BilibiliImportPreview> {
    return this.runGovernedBilibiliTool(
      LEGAL_STUDY_TOOL_IDS.previewBilibiliSource,
      input
    ) as Promise<BilibiliImportPreview>;
  }

  async confirmBilibiliCourseImport(
    input: ConfirmBilibiliCourseImportInput
  ): Promise<ImportedLegalStudyCourseResult> {
    return this.runGovernedBilibiliTool(
      LEGAL_STUDY_TOOL_IDS.importBilibiliCourse,
      input
    ) as Promise<ImportedLegalStudyCourseResult>;
  }

  async importBilibiliCourse(
    input: ImportBilibiliCourseInput
  ): Promise<ImportedLegalStudyCourseResult> {
    return this.runGovernedBilibiliTool(
      LEGAL_STUDY_TOOL_IDS.importBilibiliCourse,
      input
    ) as Promise<ImportedLegalStudyCourseResult>;
  }

  async getCourseOverview(courseId: string): Promise<LegalStudyCourseOverview> {
    return this.runCourseService((service) => service.getCourseOverview(courseId));
  }

  async completeCourseEpisode(
    episodeId: string,
    completedAt = new Date().toISOString()
  ): Promise<CompleteLegalStudyEpisodeResult> {
    const result = await this.runCourseService((service) =>
      service.completeEpisode(episodeId, completedAt)
    );
    this.state = {
      ...this.state,
      unlockReports: [...this.state.unlockReports, result.unlockReport],
    };
    return result;
  }

  async listMappings(filter: LegalStudyMappingFilter = {}) {
    return this.runMappingService((service) => service.listMappings(filter));
  }

  async suggestMappings(input: SuggestLegalStudyMappingsInput = {}) {
    return this.runMappingService((service) => service.suggestMappings(input));
  }

  async confirmMapping(input: ConfirmLegalStudyMappingInput) {
    return this.runMappingService((service) => service.confirmMapping(input));
  }

  async modifyMapping(mappingId: string, input: ModifyLegalStudyMappingInput) {
    return this.runMappingService((service) => service.modifyMapping(mappingId, input));
  }

  async deleteMapping(mappingId: string) {
    return this.runMappingService((service) => service.deleteMapping(mappingId));
  }

  async getUnlockPreview(episodeId: string) {
    return this.runMappingService((service) => service.getUnlockPreview(episodeId));
  }

  async applyMappingUnlocks(episodeId: string, completedAt = new Date().toISOString()) {
    const result = await this.runMappingService((service) =>
      service.applyUnlocks(episodeId, completedAt)
    );
    this.state = {
      ...this.state,
      unlockReports: [...this.state.unlockReports, result.report],
    };
    return result;
  }
  async listNewCards(filter: LegalStudyNewCardFilter = {}) {
    return this.runReviewService((service) => service.listNewCards(filter));
  }

  async getDueReviewQueueDetailed(filter: LegalStudyReviewQueueFilter) {
    return this.runReviewService((service) => service.getDueQueue(filter));
  }

  async computeReviewPressureDetailed(date: string, availableMinutes?: number) {
    return this.runReviewService((service) => service.computePressure(date, availableMinutes));
  }

  async learnNewCard(input: LearnLegalStudyCardInput) {
    return this.runReviewService((service) => service.learnNewCard(input));
  }

  async submitReview(input: SubmitLegalStudyReviewInput) {
    return this.runReviewService((service) => service.submitReview(input));
  }

  completeEpisode(
    episodeId: string,
    completedAt = new Date().toISOString()
  ): LegalStudyUnlockReport {
    const result = completeEpisodeAndUnlockCards(this.state.snapshot, episodeId, completedAt);
    this.state = {
      ...this.state,
      snapshot: result.snapshot,
      unlockReports: [...this.state.unlockReports, result.report],
    };
    return result.report;
  }

  async createTextbook(input: CreateLegalStudyTextbookInput) {
    return this.runTextbookService((service) => service.createTextbook(input));
  }

  async listTextbooks(subjectId?: string) {
    return this.runTextbookService((service) => service.listTextbooks(subjectId));
  }

  async listTextbookChapters(textbookId: string) {
    return this.runTextbookService((service) => service.listChapters(textbookId));
  }

  async listChapterSlices(chapterId: string) {
    return this.runTextbookService((service) => service.listSlices(chapterId));
  }

  async listCards(filter: LegalStudyCardFilter = {}) {
    return this.runTextbookService((service) => service.listCards(filter));
  }

  async confirmCardBatch(cardIds: string[], now = new Date().toISOString()) {
    return this.runTextbookService((service) => service.confirmCardBatch({ cardIds, now }));
  }

  async updateCard(cardId: string, input: UpdateLegalStudyCardInput) {
    return this.runTextbookService((service) => service.updateCard(cardId, input));
  }

  async ingestTextbook(input: LegalStudyIngestionInput): Promise<LegalStudyIngestionReport> {
    const result = await this.ingestTextbookDetailed(input);
    return result.report;
  }

  async ingestTextbookDetailed(
    input: LegalStudyIngestionInput
  ): Promise<IngestLegalStudyTextbookResult> {
    const result = await this.runTextbookService((service) => service.ingestTextbook(input));
    this.state = {
      ...this.state,
      ingestionReports: [...this.state.ingestionReports, result.report],
    };
    return result;
  }

  async runCoreWorkflowSmoke(now = new Date().toISOString()): Promise<LegalStudyRuntimeState> {
    await this.ingestTextbook({
      userId: this.state.snapshot.userId,
      subjectId: 'subject-civil',
      textbookTitle: '民法补充讲义',
      text: [
        '第一章 合同成立',
        '合同成立通常经过要约和承诺。承诺生效时合同成立，但合同成立不等于合同有效。',
        '',
        '第二章 合同效力',
        '合同效力需要在合同成立之后判断，包括有效、无效、可撤销和效力待定等类型。',
      ].join('\n'),
      confirmCards: true,
      now,
    });
    await this.completeCourseEpisode('episode-civil-contract-formation', now);
    await this.draftAgentProposal(LEGAL_STUDY_SEED_TODAY, now);
    return this.getState();
  }

  async getAgentRiskDashboard(date = LEGAL_STUDY_SEED_TODAY) {
    return this.runAgentService((service) => service.getRiskDashboard(date));
  }

  async listAgentProposals(filter: LegalStudyAgentProposalFilter = {}) {
    return this.runAgentService((service) => service.listProposals(filter));
  }

  async draftAgentProposal(
    date = LEGAL_STUDY_SEED_TODAY,
    now = new Date().toISOString(),
    windowDays?: number
  ) {
    return this.runAgentService((service) => service.draftProposal({ date, now, windowDays }));
  }

  async modifyAgentProposal(input: ModifyLegalStudyAgentProposalInput) {
    return this.runAgentService((service) => service.modifyProposal(input));
  }

  async decideAgentProposal(input: DecideLegalStudyAgentProposalInput) {
    return this.runAgentService((service) => service.decideProposal(input));
  }

  createProposal(
    date = LEGAL_STUDY_SEED_TODAY,
    now = new Date().toISOString()
  ): LegalStudyPlanProposal {
    const proposal = draftPlanProposal({ snapshot: this.state.snapshot, date, now });
    this.state = {
      ...this.state,
      proposals: [...this.state.proposals, proposal],
    };
    return proposal;
  }

  decideProposal(
    proposalId: string,
    decision: Exclude<LegalStudyProposalDecision, 'pending'>,
    decidedAt = new Date().toISOString()
  ): LegalStudyPlanProposal {
    const proposal = this.state.proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    const decidedProposal: LegalStudyPlanProposal = {
      ...proposal,
      status: decision,
    };
    let snapshot = this.state.snapshot;
    if (decision === 'accepted') {
      snapshot = applyAcceptedProposal(snapshot, decidedProposal, decidedAt);
    }
    if (decision === 'rejected') {
      snapshot = recordRejectedProposal(snapshot, decidedProposal, decidedAt);
    }
    this.state = {
      ...this.state,
      snapshot,
      proposals: this.state.proposals.map((candidate) =>
        candidate.id === proposalId ? decidedProposal : candidate
      ),
    };
    return decidedProposal;
  }

  registerTools(registry: ToolRegistry): void {
    registerLegalStudyTools(registry, async (toolId, input) => this.handleTool(toolId, input));
  }

  async runGovernedTool(
    toolId: string,
    input: unknown,
    context: ToolCallContext
  ): Promise<ToolCallResult> {
    const invocationId = context.invocationId ?? [context.runId, context.stepId, toolId].join(':');
    const contractSnapshotRef =
      context.contractSnapshotRef ?? (await this.ensureRunToolSnapshot(context.runId));
    return this.toolRunner.run({
      toolId,
      input,
      context: {
        ...context,
        invocationId,
        contractSnapshotRef,
        idempotencyKey: context.idempotencyKey ?? invocationId,
        executionScope: context.executionScope ?? {
          allowedToolIds: [toolId],
          fsmState: context.fsmState,
        },
        principal: context.principal ?? {
          id: context.userId ?? this.state.snapshot.userId,
          type: 'user',
          permissionScopes: ['legal-study:read', 'legal-study:write'],
        },
      },
    });
  }

  approveAndResumeTool(
    invocationId: string,
    approvedBy: string,
    options?: { approvedAt?: string; expiresAt?: string }
  ) {
    return this.toolRunner.approveAndResume(invocationId, approvedBy, options);
  }

  rejectToolInvocation(invocationId: string) {
    return this.toolRunner.rejectInvocation(invocationId);
  }

  cancelToolInvocation(invocationId: string, reason?: string) {
    return this.toolRunner.cancelInvocation(invocationId, reason);
  }

  getToolInvocation(invocationId: string) {
    return this.toolRunner.getInvocation(invocationId);
  }

  recoverToolInvocations() {
    return this.toolRunner.recoverPendingInvocations();
  }

  listToolEvents() {
    return this.toolTrace.list();
  }

  private async ensureRunToolSnapshot(runId: string): Promise<string | undefined> {
    if (!this.toolSnapshotStore) return undefined;
    const active = this.runToolSnapshots.get(runId);
    if (active) return active;
    const creation = this.createRunToolSnapshot(runId).catch((error) => {
      this.runToolSnapshots.delete(runId);
      throw error;
    });
    this.runToolSnapshots.set(runId, creation);
    return creation;
  }

  private async createRunToolSnapshot(runId: string): Promise<string> {
    const snapshotId = `tool-snapshot:${runId}`;
    const existing = await this.toolSnapshotStore!.get(snapshotId);
    if (existing) return existing.id;
    const toolContracts = this.toolRegistry.list().map((spec) => ({
      toolId: spec.id,
      toolVersion: spec.version,
      toolRevision: spec.revision,
      inputSchemaHash: spec.input.schemaHash,
      outputSchemaHash: spec.output?.schemaHash,
      sourceCapabilityHash: spec.sourceRef?.capabilityHash,
      sideEffectLevel: spec.sideEffectLevel,
      adapterRef: spec.sourceRef?.adapterId ?? `${spec.source}:${spec.id}`,
    }));
    const createdAt = new Date().toISOString();
    const body = { runId, createdAt, toolContracts };
    const snapshot: ToolContractSnapshot = {
      id: snapshotId,
      ...body,
      snapshotHash: hashToolContract(body),
    };
    await this.toolSnapshotStore!.save(snapshot);
    return snapshot.id;
  }

  private async runJobService<T>(work: (service: LegalStudyJobService) => Promise<T>): Promise<T> {
    const store = this.createJobStore();
    const service = new LegalStudyJobService({
      store,
      handlers: {
        textbook_ingestion: async (job) =>
          this.ingestTextbookDetailed(job.input as LegalStudyIngestionInput),
        bilibili_import: async (job) =>
          this.importBilibiliCourse(job.input as ImportBilibiliCourseInput),
        agent_proposal_recompute: async (job) => {
          const input = isRecord(job.input) ? job.input : {};
          return this.draftAgentProposal(
            typeof input.date === 'string' ? input.date : LEGAL_STUDY_SEED_TODAY,
            typeof input.now === 'string' ? input.now : new Date().toISOString()
          );
        },
      },
    });
    const result = await work(service);
    this.state = {
      ...this.state,
      jobs: await store.list(),
    };
    return result;
  }
  private async runAgentService<T>(
    work: (service: LegalStudyAgentService) => Promise<T>
  ): Promise<T> {
    const repository = this.createRepository();
    const proposalStore = this.createProposalStore();
    const service = new LegalStudyAgentService(repository, proposalStore, {
      insightProvider: createDefaultAgentInsightProvider(),
    });
    const result = await work(service);
    this.state = {
      ...this.state,
      snapshot: await repository.getSnapshot(),
      proposals: await proposalStore.list(),
    };
    return result;
  }

  private async runReviewService<T>(
    work: (service: LegalStudyReviewService) => Promise<T>
  ): Promise<T> {
    const repository = this.createRepository();
    const service = new LegalStudyReviewService(repository);
    const result = await work(service);
    this.state = {
      ...this.state,
      snapshot: await repository.getSnapshot(),
    };
    return result;
  }

  private async runMappingService<T>(
    work: (service: LegalStudyMappingService) => Promise<T>
  ): Promise<T> {
    const repository = this.createRepository();
    const service = new LegalStudyMappingService(repository);
    const result = await work(service);
    this.state = {
      ...this.state,
      snapshot: await repository.getSnapshot(),
    };
    return result;
  }

  private async runTextbookService<T>(
    work: (service: LegalStudyTextbookService) => Promise<T>
  ): Promise<T> {
    const repository = this.createRepository();
    const service = new LegalStudyTextbookService(repository, {
      deepSeek: {
        baseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
        model: process.env.DEEPSEEK_CARD_MODEL ?? 'deepseek-chat',
      },
    });
    const result = await work(service);
    this.state = {
      ...this.state,
      snapshot: await repository.getSnapshot(),
    };
    return result;
  }

  private async runCourseService<T>(
    work: (service: LegalStudyCourseService) => Promise<T>
  ): Promise<T> {
    const repository = this.createRepository();
    const service = new LegalStudyCourseService(repository, {
      bilibiliProvider: this.bilibiliProvider,
    });
    const result = await work(service);
    this.state = {
      ...this.state,
      snapshot: await repository.getSnapshot(),
    };
    return result;
  }

  private async runGovernedBilibiliTool<T>(toolId: string, input: T): Promise<unknown> {
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const userId =
      isRecord(input) && typeof input.userId === 'string'
        ? input.userId
        : this.state.snapshot.userId;
    const result = await this.runGovernedTool(toolId, input, {
      runId: `bilibili:${digest}`,
      stepId: toolId,
      invocationId: `${toolId}:${digest}`,
      idempotencyKey: `${toolId}:${digest}`,
      userId,
      sessionId: `bilibili:${userId}`,
      metadata: { approvalMode: 'explicit_user_command' },
    });
    if (result.status !== 'completed') {
      throw new Error(
        typeof result.error === 'string'
          ? result.error
          : result.error?.message ?? `Bilibili Tool failed: ${toolId}`
      );
    }
    return result.output;
  }

  private createRepository(): LegalStudyRepository {
    return this.repository ?? new InMemoryLegalStudyRepository(this.state.snapshot);
  }

  private createProposalStore(): LegalStudyProposalStore {
    return this.proposalStore ?? new InMemoryLegalStudyProposalStore(this.state.proposals);
  }

  private createJobStore(): LegalStudyJobStore {
    return this.jobStore ?? new InMemoryLegalStudyJobStore(this.state.jobs);
  }

  private async handleTool(toolId: string, input: unknown): Promise<unknown> {
    const record = isRecord(input) ? input : {};
    const date = typeof record.date === 'string' ? record.date : LEGAL_STUDY_SEED_TODAY;
    switch (toolId) {
      case LEGAL_STUDY_TOOL_IDS.previewBilibiliSource:
        return this.runCourseService((service) =>
          service.previewBilibiliCourse(record as unknown as PreviewBilibiliCourseInput)
        );
      case LEGAL_STUDY_TOOL_IDS.importBilibiliCourse:
        return 'preview' in record
          ? this.runCourseService((service) =>
              service.confirmBilibiliCourseImport(
                record as unknown as ConfirmBilibiliCourseImportInput
              )
            )
          : this.runCourseService((service) =>
              service.importBilibiliCourse(record as unknown as ImportBilibiliCourseInput)
            );
      case LEGAL_STUDY_TOOL_IDS.readLearningSnapshot:
        return this.getSnapshot();
      case LEGAL_STUDY_TOOL_IDS.computeCoursePressure:
        return computeCoursePressure(this.state.snapshot, date);
      case LEGAL_STUDY_TOOL_IDS.computeReviewPressure:
        return computeReviewPressure(this.state.snapshot, date);
      case LEGAL_STUDY_TOOL_IDS.draftPlanAdjustment:
      case LEGAL_STUDY_TOOL_IDS.explainPlanDiff:
        return draftPlanProposal({ snapshot: this.state.snapshot, date });
      case LEGAL_STUDY_TOOL_IDS.validatePlanProposal:
        return draftPlanProposal({ snapshot: this.state.snapshot, date }).validation;
      case LEGAL_STUDY_TOOL_IDS.submitHumanReview:
      case LEGAL_STUDY_TOOL_IDS.recordProposalDecision:
      case LEGAL_STUDY_TOOL_IDS.decideAgentProposal:
        return this.decideAgentProposal({
          proposalId: stringField(record, 'proposalId'),
          decision: proposalDecisionField(record),
          reason: stringField(record, 'reason') || undefined,
          decidedAt: stringField(record, 'decidedAt') || stringField(record, 'now') || undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.applyAcceptedProposal:
        return this.decideAgentProposal({
          proposalId: stringField(record, 'proposalId'),
          decision: 'accepted',
          decidedAt: stringField(record, 'decidedAt') || stringField(record, 'now') || undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.queueOcrTask:
      case LEGAL_STUDY_TOOL_IDS.detectChapters:
      case LEGAL_STUDY_TOOL_IDS.sliceContent:
      case LEGAL_STUDY_TOOL_IDS.generateCards:
      case LEGAL_STUDY_TOOL_IDS.confirmCardBatch:
        return this.ingestTextbook({
          userId: this.state.snapshot.userId,
          subjectId: stringField(record, 'subjectId') || 'subject-civil',
          textbookId: stringField(record, 'textbookId') || undefined,
          textbookTitle: stringField(record, 'textbookTitle') || 'OCR Textbook',
          text: stringField(record, 'text') || '第一章 合同成立\n合同成立通常经过要约和承诺。',
          confirmCards: Boolean(record.confirmCards),
          now: typeof record.now === 'string' ? record.now : undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.resolveChapterMappings:
        return this.listMappings({
          episodeId: stringField(record, 'episodeId') || undefined,
          chapterId: stringField(record, 'chapterId') || undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.suggestChapterMappings:
        return this.suggestMappings({
          courseId: stringField(record, 'courseId') || undefined,
          subjectId: stringField(record, 'subjectId') || undefined,
          textbookId: stringField(record, 'textbookId') || undefined,
          minConfidence: numberField(record, 'minConfidence'),
          now: stringField(record, 'now') || undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.confirmChapterMapping:
        return this.confirmMapping({
          episodeId: stringField(record, 'episodeId'),
          chapterId: stringField(record, 'chapterId'),
          confidence: numberField(record, 'confidence'),
          reason: stringField(record, 'reason') || undefined,
          now: stringField(record, 'now') || undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.computeUnlockCandidates:
      case LEGAL_STUDY_TOOL_IDS.validateUnlockRules:
        return computeUnlockCandidates(this.state.snapshot, stringField(record, 'episodeId'));
      case LEGAL_STUDY_TOOL_IDS.projectReviewQueue:
      case LEGAL_STUDY_TOOL_IDS.getDueReviewQueue:
        return this.getDueReviewQueueDetailed({
          date,
          subjectId: stringField(record, 'subjectId') || undefined,
          limit: numberField(record, 'limit'),
        });
      case LEGAL_STUDY_TOOL_IDS.applyUnlocks:
        return this.applyMappingUnlocks(
          stringField(record, 'episodeId'),
          stringField(record, 'completedAt') || stringField(record, 'now') || undefined
        );
      case LEGAL_STUDY_TOOL_IDS.listNewCards:
        return this.listNewCards({
          subjectId: stringField(record, 'subjectId') || undefined,
          limit: numberField(record, 'limit'),
        });
      case LEGAL_STUDY_TOOL_IDS.learnNewCard:
        return this.learnNewCard({
          cardId: stringField(record, 'cardId'),
          learnedAt: stringField(record, 'learnedAt') || stringField(record, 'now') || undefined,
          firstReviewAfterDays: numberField(record, 'firstReviewAfterDays'),
        });
      case LEGAL_STUDY_TOOL_IDS.submitReview:
        return this.submitReview({
          cardId: stringField(record, 'cardId'),
          rating: reviewRatingField(record),
          reviewedAt: stringField(record, 'reviewedAt') || stringField(record, 'now') || undefined,
        });
      case LEGAL_STUDY_TOOL_IDS.getAgentRiskDashboard:
        return this.getAgentRiskDashboard(date);
      case LEGAL_STUDY_TOOL_IDS.listAgentProposals:
        return this.listAgentProposals({ status: proposalStatusField(record) });
      case LEGAL_STUDY_TOOL_IDS.draftAgentProposal:
        return this.draftAgentProposal(
          date,
          stringField(record, 'now') || undefined,
          numberField(record, 'windowDays')
        );
      case LEGAL_STUDY_TOOL_IDS.modifyAgentProposal:
        return this.modifyAgentProposal({
          proposalId: stringField(record, 'proposalId'),
          afterPlan: record.afterPlan as never,
          summary: stringField(record, 'summary') || undefined,
          reason: stringField(record, 'reason') || undefined,
          now: stringField(record, 'now') || undefined,
        });
      default:
        return { ok: true, toolId, input };
    }
  }
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
function numberField(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function reviewRatingField(record: Record<string, unknown>) {
  const rating = stringField(record, 'rating');
  if (rating === 'again' || rating === 'hard' || rating === 'good' || rating === 'easy')
    return rating;
  return 'good';
}

function proposalDecisionField(
  record: Record<string, unknown>
): Exclude<LegalStudyProposalDecision, 'pending'> {
  const decision = stringField(record, 'decision');
  if (
    decision === 'accepted' ||
    decision === 'modified' ||
    decision === 'rejected' ||
    decision === 'undone'
  )
    return decision;
  return 'rejected';
}

function proposalStatusField(
  record: Record<string, unknown>
): LegalStudyProposalDecision | undefined {
  const status = stringField(record, 'status');
  if (
    status === 'pending' ||
    status === 'accepted' ||
    status === 'modified' ||
    status === 'rejected' ||
    status === 'undone'
  )
    return status;
  return undefined;
}

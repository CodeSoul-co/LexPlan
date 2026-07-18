import type { DomainPackSpec, WorkflowSpec } from '@hypha/domain';
import { LEGAL_STUDY_TOOL_IDS, legalStudyToolSpecs } from './tools';

export const LEGAL_STUDY_DOMAIN_PACK_ID = 'domain.legal-study-planner';
export const LEGAL_STUDY_DOMAIN_PACK_VERSION = '0.1.0';

const planProposalOutputSchema = {
  type: 'object',
  required: ['proposalId', 'status', 'summary', 'changes', 'validation', 'requiresUserConfirmation'],
  properties: {
    proposalId: { type: 'string' },
    status: { enum: ['pending', 'accepted', 'modified', 'rejected', 'undone'] },
    summary: { type: 'string' },
    changes: { type: 'array', items: { type: 'object' } },
    validation: { type: 'object' },
    explanation: { type: 'object' },
    requiresUserConfirmation: { type: 'boolean' },
  },
  additionalProperties: true,
};

const ingestionReportOutputSchema = {
  type: 'object',
  required: ['textbookId', 'status', 'chaptersDetected', 'cardsGenerated', 'cardsPendingConfirmation'],
  properties: {
    textbookId: { type: 'string' },
    status: { type: 'string' },
    chaptersDetected: { type: 'integer' },
    cardsGenerated: { type: 'integer' },
    cardsPendingConfirmation: { type: 'integer' },
  },
  additionalProperties: true,
};

const unlockReviewOutputSchema = {
  type: 'object',
  required: ['episodeId', 'unlockedCardIds', 'dueReviewCardIds', 'violations'],
  properties: {
    episodeId: { type: 'string' },
    unlockedCardIds: { type: 'array', items: { type: 'string' } },
    dueReviewCardIds: { type: 'array', items: { type: 'string' } },
    violations: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

const dailyPlanAdjustmentWorkflow: WorkflowSpec = {
  id: 'workflow.legal-study.daily-plan-adjustment',
  version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
  name: 'Daily Plan Adjustment',
  description:
    'Generate, validate, explain, and route a legal-study plan adjustment proposal through user review.',
  initialState: 'ContextBuilt',
  terminalStates: ['Applied', 'Rejected', 'Failed'],
  states: [
    { id: 'ContextBuilt', goal: 'Build the current user-scoped context from request metadata.' },
    {
      id: 'LearningStateSnapshotted',
      goal: 'Read the current legal-study learning snapshot.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.readLearningSnapshot],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'CoursePressureComputed',
      goal: 'Compute course deadline and remaining workload pressure.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.computeCoursePressure],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'ReviewPressureComputed',
      goal: 'Compute due-card FSRS review pressure.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.computeReviewPressure],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'ProposalDrafted',
      goal: 'Draft a bounded plan adjustment proposal.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.draftPlanAdjustment],
      policyRefs: ['policy.legal-study.read-analysis'],
      evaluationRefs: ['eval.legal-study.output-contract'],
    },
    {
      id: 'ProposalValidated',
      goal: 'Validate the plan proposal against hard constraints.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.validatePlanProposal],
      policyRefs: ['policy.legal-study.read-analysis'],
      evaluationRefs: ['eval.legal-study.policy'],
    },
    {
      id: 'ExplanationGenerated',
      goal: 'Explain the validated before/after plan diff to the user.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.explainPlanDiff],
      allowedSkills: ['skill.legal-study.plan-explanation'],
      requiredSkills: ['skill.legal-study.plan-explanation'],
      reasoningProfileRef: 'reasoning.legal-study.structured',
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'HumanReview',
      goal: 'Wait for the user to accept, modify, reject, or undo the proposal.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.submitHumanReview],
      policyRefs: ['policy.legal-study.human-reviewed-write'],
      humanReviewPolicy: {
        required: true,
        reason: 'Important legal-study plan changes require explicit user confirmation.',
      },
    },
    {
      id: 'ProposalApplying',
      goal: 'Apply an accepted proposal through a governed write tool.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.applyAcceptedProposal],
      policyRefs: ['policy.legal-study.human-reviewed-write'],
    },
    {
      id: 'ProposalRejected',
      goal: 'Record a rejected, modified, or undone proposal decision.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.recordProposalDecision],
      policyRefs: ['policy.legal-study.human-reviewed-write'],
    },
    { id: 'Applied', goal: 'Return the applied proposal result.' },
    { id: 'Rejected', goal: 'Return the rejected or deferred proposal result.' },
    { id: 'Failed', goal: 'Record proposal failure and preserve original plan.' },
  ],
  transitions: [
    { from: 'ContextBuilt', to: 'LearningStateSnapshotted' },
    { from: 'LearningStateSnapshotted', to: 'CoursePressureComputed' },
    { from: 'CoursePressureComputed', to: 'ReviewPressureComputed' },
    { from: 'ReviewPressureComputed', to: 'ProposalDrafted' },
    { from: 'ProposalDrafted', to: 'ProposalValidated' },
    {
      from: 'ProposalValidated',
      to: 'ExplanationGenerated',
      guard: 'variables.proposalValid == true',
    },
    { from: 'ProposalValidated', to: 'Failed', guard: 'variables.proposalValid == false' },
    { from: 'ExplanationGenerated', to: 'HumanReview' },
    { from: 'HumanReview', to: 'ProposalApplying', guard: "variables.reviewDecision == 'accepted'" },
    { from: 'HumanReview', to: 'ProposalRejected', guard: "variables.reviewDecision == 'rejected'" },
    { from: 'HumanReview', to: 'ProposalDrafted', guard: "variables.reviewDecision == 'modified'" },
    { from: 'ProposalApplying', to: 'Applied' },
    { from: 'ProposalRejected', to: 'Rejected' },
  ],
};

const textbookCardIngestionWorkflow: WorkflowSpec = {
  id: 'workflow.legal-study.textbook-card-ingestion',
  version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
  name: 'Textbook Card Ingestion',
  description:
    'Track OCR, chapter detection, slicing, card generation, and user confirmation for uploaded textbooks.',
  initialState: 'Uploaded',
  terminalStates: ['UserConfirmed', 'Failed'],
  states: [
    { id: 'Uploaded', goal: 'Record an uploaded textbook file reference.' },
    {
      id: 'OcrQueued',
      goal: 'Queue OCR processing for the uploaded file.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.queueOcrTask],
      policyRefs: ['policy.legal-study.human-reviewed-write'],
    },
    {
      id: 'OcrCompleted',
      goal: 'Record a completed OCR artifact reference.',
      timeoutPolicy: { timeoutMs: 300000, onTimeout: 'retry' },
      retryPolicy: { maxAttempts: 2, backoffMs: 1000 },
    },
    {
      id: 'ChaptersDetected',
      goal: 'Detect and return a candidate chapter tree.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.detectChapters],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'ContentSliced',
      goal: 'Slice chapter text while preserving source page and text provenance.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.sliceContent],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'CardsGenerated',
      goal: 'Generate candidate cards with source evidence.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.generateCards],
      policyRefs: ['policy.legal-study.read-analysis'],
      evaluationRefs: ['eval.legal-study.output-contract'],
    },
    {
      id: 'UserConfirmed',
      goal: 'Persist only user-confirmed cards into formal learning queues.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.confirmCardBatch],
      policyRefs: ['policy.legal-study.human-reviewed-write'],
    },
    { id: 'Failed', goal: 'Record ingestion failure and retry hints.' },
  ],
  transitions: [
    { from: 'Uploaded', to: 'OcrQueued' },
    { from: 'OcrQueued', to: 'OcrCompleted', guard: "variables.ocrStatus == 'succeeded'" },
    { from: 'OcrQueued', to: 'Failed', guard: "variables.ocrStatus == 'failed'" },
    { from: 'OcrCompleted', to: 'ChaptersDetected' },
    { from: 'ChaptersDetected', to: 'ContentSliced' },
    { from: 'ContentSliced', to: 'CardsGenerated' },
    { from: 'CardsGenerated', to: 'UserConfirmed', guard: 'variables.userConfirmed == true' },
    { from: 'CardsGenerated', to: 'Failed', guard: 'variables.generationFailed == true' },
  ],
};

const chapterUnlockReviewWorkflow: WorkflowSpec = {
  id: 'workflow.legal-study.chapter-unlock-review',
  version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
  name: 'Chapter Unlock Review',
  description:
    'Resolve mappings after course completion, validate unlock candidates, and project the review queue.',
  initialState: 'EpisodeCompletionRecorded',
  terminalStates: ['UnlockApplied', 'Failed'],
  states: [
    { id: 'EpisodeCompletionRecorded', goal: 'Record that a course episode was completed.' },
    {
      id: 'ChapterMappingsResolved',
      goal: 'Resolve confirmed course-episode to chapter mappings.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.resolveChapterMappings],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'UnlockCandidatesComputed',
      goal: 'Compute cards that may become newly available.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.computeUnlockCandidates],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'UnlockRulesValidated',
      goal: 'Validate that only learned mapped chapters release confirmed cards.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.validateUnlockRules],
      policyRefs: ['policy.legal-study.read-analysis'],
      evaluationRefs: ['eval.legal-study.policy'],
    },
    {
      id: 'ReviewQueueProjected',
      goal: 'Project the post-unlock new-card and due-review queue.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.projectReviewQueue],
      policyRefs: ['policy.legal-study.read-analysis'],
    },
    {
      id: 'UnlockApplied',
      goal: 'Apply validated unlocks and append audit records.',
      allowedTools: [LEGAL_STUDY_TOOL_IDS.applyUnlocks],
      policyRefs: ['policy.legal-study.human-reviewed-write'],
    },
    { id: 'Failed', goal: 'Record unlock failure without exposing unlearned chapter cards.' },
  ],
  transitions: [
    { from: 'EpisodeCompletionRecorded', to: 'ChapterMappingsResolved' },
    { from: 'ChapterMappingsResolved', to: 'UnlockCandidatesComputed' },
    { from: 'UnlockCandidatesComputed', to: 'UnlockRulesValidated' },
    {
      from: 'UnlockRulesValidated',
      to: 'ReviewQueueProjected',
      guard: 'variables.unlockValid == true',
    },
    { from: 'UnlockRulesValidated', to: 'Failed', guard: 'variables.unlockValid == false' },
    { from: 'ReviewQueueProjected', to: 'UnlockApplied' },
  ],
};

export const legalStudyDomainPack: DomainPackSpec = {
  id: LEGAL_STUDY_DOMAIN_PACK_ID,
  version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
  name: 'Legal Study Planning Card Agent',
  description:
    'DomainPack for a law-master-exam planning card Agent MVP with deterministic planning, card unlock, FSRS pressure, and governed user-confirmed Agent proposals.',
  taskSchemas: [
    {
      id: 'task.legal-study.daily-plan-adjustment',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      taskType: 'legal-study.daily-plan-adjustment',
      inputSchema: {
        type: 'object',
        required: ['userId', 'date'],
        properties: {
          userId: { type: 'string' },
          date: { type: 'string' },
          intent: { type: 'string' },
        },
        additionalProperties: true,
      },
      outputContractRef: 'output.legal-study.plan-proposal',
      defaultWorkflowRef: dailyPlanAdjustmentWorkflow.id,
      riskProfile: {
        defaultRiskLevel: 'high',
        escalationPolicyRef: 'policy.legal-study.human-reviewed-write',
      },
    },
    {
      id: 'task.legal-study.textbook-card-ingestion',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      taskType: 'legal-study.textbook-card-ingestion',
      inputSchema: {
        type: 'object',
        required: ['userId', 'textbookId'],
        properties: {
          userId: { type: 'string' },
          textbookId: { type: 'string' },
        },
        additionalProperties: true,
      },
      outputContractRef: 'output.legal-study.ingestion-report',
      defaultWorkflowRef: textbookCardIngestionWorkflow.id,
      riskProfile: { defaultRiskLevel: 'medium' },
    },
    {
      id: 'task.legal-study.chapter-unlock-review',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      taskType: 'legal-study.chapter-unlock-review',
      inputSchema: {
        type: 'object',
        required: ['userId', 'episodeId'],
        properties: {
          userId: { type: 'string' },
          episodeId: { type: 'string' },
        },
        additionalProperties: true,
      },
      outputContractRef: 'output.legal-study.unlock-review-report',
      defaultWorkflowRef: chapterUnlockReviewWorkflow.id,
      riskProfile: { defaultRiskLevel: 'high' },
    },
  ],
  outputContracts: [
    {
      id: 'output.legal-study.plan-proposal',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      schema: planProposalOutputSchema,
    },
    {
      id: 'output.legal-study.ingestion-report',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      schema: ingestionReportOutputSchema,
    },
    {
      id: 'output.legal-study.unlock-review-report',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      schema: unlockReviewOutputSchema,
    },
  ],
  sessionProfiles: [
    {
      id: 'session.legal-study.local-mvp',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      defaultMetadata: {
        product: 'legal-study-planning-card-agent',
        mode: 'local-mvp',
      },
      defaultMemoryProfileRef: 'memory.legal-study.local',
      defaultContextProfileRef: 'context.legal-study.agent',
      defaultReasoningProfileRef: 'reasoning.legal-study.structured',
      defaultPolicyRefs: ['policy.legal-study.read-analysis'],
    },
  ],
  workflows: [
    dailyPlanAdjustmentWorkflow,
    textbookCardIngestionWorkflow,
    chapterUnlockReviewWorkflow,
  ],
  defaultWorkflow: dailyPlanAdjustmentWorkflow.id,
  allowedSkills: [
    { id: 'skill.legal-study.plan-explanation', version: LEGAL_STUDY_DOMAIN_PACK_VERSION },
  ],
  defaultSkills: [
    { id: 'skill.legal-study.plan-explanation', version: LEGAL_STUDY_DOMAIN_PACK_VERSION },
  ],
  skillPolicies: [
    {
      id: 'skill-policy.legal-study.plan-explanation',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      skillRef: {
        id: 'skill.legal-study.plan-explanation',
        version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      },
      policyRefs: ['policy.legal-study.read-analysis'],
      allowedTools: [
        LEGAL_STUDY_TOOL_IDS.readLearningSnapshot,
        LEGAL_STUDY_TOOL_IDS.computeCoursePressure,
        LEGAL_STUDY_TOOL_IDS.computeReviewPressure,
        LEGAL_STUDY_TOOL_IDS.validatePlanProposal,
        LEGAL_STUDY_TOOL_IDS.explainPlanDiff,
      ],
      trustLevel: 'reviewed',
    },
  ],
  tools: legalStudyToolSpecs,
  memoryProfiles: [
    {
      id: 'memory.legal-study.local',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      providers: [
        { id: 'structured', type: 'structured', providerRef: 'storage.sqlite.local' },
        { id: 'artifact', type: 'artifact', providerRef: 'storage.file-artifact.local' },
        { id: 'vector', type: 'vector', providerRef: 'vector.local' },
      ],
      memoryTypes: ['working', 'episodic', 'semantic', 'artifact', 'governance'],
      structuredStoreRef: 'storage.sqlite.local',
      vectorIndexRef: 'vector.local',
      artifactStoreRef: 'storage.file-artifact.local',
      provenancePolicy: 'required',
      retrievalPolicy: {
        defaultTopK: 8,
        requireScope: true,
        allowedTypes: ['working', 'episodic', 'semantic', 'artifact', 'governance'],
      },
      writePolicyConfig: {
        requireProvenance: true,
        allowLongTerm: true,
      },
    },
  ],
  contextProfiles: [
    {
      id: 'context.legal-study.agent',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      sources: [
        {
          id: 'context.legal-study.user-input',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          type: 'user_input',
        },
        {
          id: 'context.legal-study.memory',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          type: 'memory',
          provenanceRequired: true,
          trustLevel: 'reviewed',
        },
        {
          id: 'context.legal-study.domain',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          type: 'domain',
          provenanceRequired: true,
          trustLevel: 'trusted',
        },
        {
          id: 'context.legal-study.skill',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          type: 'skill',
          provenanceRequired: true,
          trustLevel: 'reviewed',
        },
      ],
      tokenBudget: 8000,
      provenancePolicy: 'required',
      instructionBoundaryPolicy: 'tagged',
    },
  ],
  reasoningProfiles: [
    {
      id: 'reasoning.legal-study.structured',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      thinkingMode: 'structured',
      agenticMode: 'fsm_react',
      maxSteps: 6,
      persist: 'summary_only',
      metadata: {
        principle:
          'Deterministic calculations are authoritative; the Agent explains and proposes only after validation.',
      },
    },
  ],
  defaultReasoningProfile: 'reasoning.legal-study.structured',
  businessRules: [
    {
      id: 'rule.legal-study.daily-time-cap',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      scope: 'output',
      effect: 'constraint',
      expression: 'afterPlan.totalEstimatedMinutes <= user.availableMinutes',
      severity: 'critical',
      policyRefs: ['policy.legal-study.read-analysis'],
      evaluationRefs: ['eval.legal-study.policy'],
    },
    {
      id: 'rule.legal-study.locked-task-immutable',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      scope: 'output',
      effect: 'constraint',
      expression: 'locked tasks cannot be removed, resized, or reordered without explicit user edit intent',
      severity: 'critical',
      policyRefs: ['policy.legal-study.human-reviewed-write'],
      evaluationRefs: ['eval.legal-study.policy'],
    },
    {
      id: 'rule.legal-study.no-unlearned-card-unlock',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      scope: 'workflow',
      effect: 'constraint',
      expression: 'new cards unlock only when mapped course episodes are completed and cards are confirmed',
      severity: 'critical',
      policyRefs: ['policy.legal-study.human-reviewed-write'],
      evaluationRefs: ['eval.legal-study.process'],
    },
    {
      id: 'rule.legal-study.due-review-preserved',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      scope: 'output',
      effect: 'constraint',
      expression: 'due reviews cannot be silently omitted from plan projections',
      severity: 'high',
      policyRefs: ['policy.legal-study.read-analysis'],
      evaluationRefs: ['eval.legal-study.policy'],
    },
    {
      id: 'rule.legal-study.card-provenance-required',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      scope: 'memory',
      effect: 'precondition',
      expression: 'cards require textbook, chapter, slice, page range, and evidence references',
      severity: 'critical',
      policyRefs: ['policy.legal-study.human-reviewed-write'],
      evaluationRefs: ['eval.legal-study.output-contract'],
    },
    {
      id: 'rule.legal-study-important-change-confirmed',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      scope: 'tool',
      effect: 'precondition',
      expression: 'important plan changes require human review before apply',
      severity: 'critical',
      policyRefs: ['policy.legal-study.human-reviewed-write'],
      evaluationRefs: ['eval.legal-study.policy'],
    },
  ],
  policies: [
    {
      id: 'policy.legal-study.read-analysis',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'policy.legal-study.allow-read',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          effect: 'allow',
          sideEffectLevels: ['none', 'read'],
        },
      ],
    },
    {
      id: 'policy.legal-study.human-reviewed-write',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      defaultEffect: 'deny',
      rules: [
        {
          id: 'policy.legal-study.allow-read-before-write',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          effect: 'allow',
          sideEffectLevels: ['none', 'read'],
        },
        {
          id: 'policy.legal-study.review-write',
          version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
          effect: 'require_human_review',
          sideEffectLevels: ['write'],
          scopes: ['legal-study:write'],
        },
      ],
    },
  ],
  evaluationProfiles: [
    {
      id: 'eval.legal-study.output-contract',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      type: 'output_contract',
      deterministic: true,
    },
    {
      id: 'eval.legal-study.policy',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      type: 'policy',
      deterministic: true,
    },
    {
      id: 'eval.legal-study.process',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      type: 'process',
      deterministic: true,
    },
  ],
  regressionCases: [
    {
      id: 'regression.legal-study.core-loop',
      version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
      fixtureRefs: [{ id: 'fixture.legal-study.seed-core-loop', version: LEGAL_STUDY_DOMAIN_PACK_VERSION }],
      requiredChecks: ['event_types', 'state_path', 'tool_calls', 'policy_decisions', 'output_contract'],
    },
  ],
  deploymentProfile: {
    id: 'deployment.legal-study.local-mvp',
    version: LEGAL_STUDY_DOMAIN_PACK_VERSION,
    mode: 'local',
    runtimeMode: 'single-user',
  },
  metadata: {
    productStage: 'mvp',
    appPrimarySurface: 'android',
    appSurface: 'web',
    architecture: 'deterministic-program-layer-plus-governed-agent-explanation',
  },
};

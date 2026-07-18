import { createVideoSourceToolSpec, type ToolSpec } from '@hypha/tools';

export const LEGAL_STUDY_TOOL_IDS = {
  readLearningSnapshot: 'tool.legal-study.read-learning-snapshot',
  computeCoursePressure: 'tool.legal-study.compute-course-pressure',
  computeReviewPressure: 'tool.legal-study.compute-review-pressure',
  draftPlanAdjustment: 'tool.legal-study.draft-plan-adjustment',
  validatePlanProposal: 'tool.legal-study.validate-plan-proposal',
  explainPlanDiff: 'tool.legal-study.explain-plan-diff',
  submitHumanReview: 'tool.legal-study.submit-human-review',
  applyAcceptedProposal: 'tool.legal-study.apply-accepted-proposal',
  recordProposalDecision: 'tool.legal-study.record-proposal-decision',
  queueOcrTask: 'tool.legal-study.queue-ocr-task',
  detectChapters: 'tool.legal-study.detect-chapters',
  sliceContent: 'tool.legal-study.slice-content',
  generateCards: 'tool.legal-study.generate-cards',
  confirmCardBatch: 'tool.legal-study.confirm-card-batch',
  resolveChapterMappings: 'tool.legal-study.resolve-chapter-mappings',
  computeUnlockCandidates: 'tool.legal-study.compute-unlock-candidates',
  validateUnlockRules: 'tool.legal-study.validate-unlock-rules',
  projectReviewQueue: 'tool.legal-study.project-review-queue',
  applyUnlocks: 'tool.legal-study.apply-unlocks',
  suggestChapterMappings: 'tool.legal-study.suggest-chapter-mappings',
  confirmChapterMapping: 'tool.legal-study.confirm-chapter-mapping',
  learnNewCard: 'tool.legal-study.learn-new-card',
  submitReview: 'tool.legal-study.submit-review',
  listNewCards: 'tool.legal-study.list-new-cards',
  getDueReviewQueue: 'tool.legal-study.get-due-review-queue',
  getAgentRiskDashboard: 'tool.legal-study.get-agent-risk-dashboard',
  listAgentProposals: 'tool.legal-study.list-agent-proposals',
  draftAgentProposal: 'tool.legal-study.draft-agent-proposal',
  modifyAgentProposal: 'tool.legal-study.modify-agent-proposal',
  decideAgentProposal: 'tool.legal-study.decide-agent-proposal',
  previewBilibiliSource: 'tool.legal-study.bilibili-preview',
  importBilibiliCourse: 'tool.legal-study.bilibili-import',
} as const;

const objectInput = {
  type: 'object',
  additionalProperties: true,
} as const;

const objectOutput = {
  type: 'object',
  additionalProperties: true,
} as const;

function readTool(id: string, description: string): ToolSpec {
  return {
    id,
    version: '0.1.0',
    description,
    inputSchema: objectInput,
    outputSchema: objectOutput,
    sideEffectLevel: 'read',
    permissionScope: ['legal-study:read'],
    timeoutPolicy: { timeoutMs: 10000, onTimeout: 'fail' },
    retryPolicy: { maxAttempts: 1 },
    auditPolicy: { enabled: true, includeInput: true, includeOutput: true },
    source: 'local',
  };
}

function writeTool(id: string, description: string, reason: string): ToolSpec {
  return {
    id,
    version: '0.1.0',
    description,
    inputSchema: objectInput,
    outputSchema: objectOutput,
    sideEffectLevel: 'write',
    permissionScope: ['legal-study:write'],
    timeoutPolicy: { timeoutMs: 10000, onTimeout: 'fail' },
    retryPolicy: { maxAttempts: 1 },
    idempotencyPolicy: { mode: 'required' },
    auditPolicy: { enabled: true, includeInput: true, includeOutput: true },
    humanApprovalPolicy: { required: true, reason },
    source: 'local',
  };
}

export const legalStudyToolSpecs: ToolSpec[] = [
  createVideoSourceToolSpec({
    id: LEGAL_STUDY_TOOL_IDS.previewBilibiliSource,
    name: 'bilibili_course_preview',
    description: 'Resolve Bilibili public course metadata and normalized episode drafts.',
    permissionScope: ['legal-study:read'],
    source: 'http',
    sourceRef: { adapterId: 'video-source.bilibili' },
    tags: ['legal-study', 'video', 'bilibili', 'metadata'],
  }),
  {
    id: LEGAL_STUDY_TOOL_IDS.importBilibiliCourse,
    version: '1.0.0',
    name: 'bilibili_course_import',
    description: 'Persist an explicitly confirmed Bilibili course and its selected episodes.',
    inputSchema: objectInput,
    outputSchema: objectOutput,
    sideEffectLevel: 'write',
    permissionScope: ['legal-study:write'],
    timeoutPolicy: { timeoutMs: 15000, onTimeout: 'fail' },
    retryPolicy: { maxAttempts: 1 },
    idempotencyPolicy: { mode: 'required' },
    auditPolicy: { enabled: true, includeInput: true, includeOutput: true },
    source: 'local',
    sourceRef: { adapterId: 'video-source.bilibili', handlerId: 'course.import' },
    tags: ['legal-study', 'video', 'bilibili', 'import'],
  },
  readTool(
    LEGAL_STUDY_TOOL_IDS.readLearningSnapshot,
    'Read a scoped legal-study learning snapshot for the current user.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.computeCoursePressure,
    'Compute deterministic course progress pressure from deadlines, remaining episodes, and daily capacity.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.computeReviewPressure,
    'Compute deterministic FSRS review pressure from due cards and estimated review time.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.draftPlanAdjustment,
    'Draft a bounded plan adjustment proposal from computed pressure reports.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.validatePlanProposal,
    'Validate a plan proposal against hard legal-study planning constraints.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.explainPlanDiff,
    'Generate a user-facing explanation from a validated before/after plan diff.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.submitHumanReview,
    'Record the user review decision for a legal-study Agent proposal.',
    'Plan decisions require explicit user confirmation.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.applyAcceptedProposal,
    'Apply an accepted legal-study plan proposal and create a rollback record.',
    'Accepted plan proposals modify scheduled tasks and must be reversible.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.recordProposalDecision,
    'Record proposal rejection, modification, or undo events for future Agent suppression.',
    'Proposal decisions affect future planning behavior and must be audited.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.queueOcrTask,
    'Queue OCR processing for an uploaded legal-study textbook file.',
    'Textbook processing is an asynchronous user-data operation.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.detectChapters,
    'Detect a candidate textbook chapter tree from OCR text.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.sliceContent,
    'Slice chapter text into card-generation units while preserving source provenance.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.generateCards,
    'Generate candidate cards from content slices with source evidence.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.confirmCardBatch,
    'Confirm or edit generated card candidates before they enter learning queues.',
    'Only user-confirmed cards can enter formal learning queues.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.resolveChapterMappings,
    'Resolve course-episode to textbook-chapter mappings from confirmed user mapping records.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.computeUnlockCandidates,
    'Compute candidate card unlocks after course episode completion.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.validateUnlockRules,
    'Validate that unlock candidates only include confirmed cards from learned mapped chapters.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.projectReviewQueue,
    'Project the new-card and due-review queue after candidate unlocks.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.applyUnlocks,
    'Apply validated card unlocks and append unlock audit records.',
    'Card unlock state changes affect user study queues and must be audited.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.suggestChapterMappings,
    'Suggest candidate course-episode to textbook-chapter mappings.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.confirmChapterMapping,
    'Confirm a course-episode to textbook-chapter mapping.',
    'Chapter mappings control unlock behavior and require user confirmation.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.listNewCards,
    'List newly unlocked confirmed cards that can enter first learning.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.getDueReviewQueue,
    'Read the detailed FSRS due-review queue for a date.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.learnNewCard,
    'Learn a newly unlocked confirmed card and create its initial FSRS review state.',
    'Learning a card changes the formal review queue and requires user confirmation.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.submitReview,
    'Submit FSRS review feedback and schedule the next review.',
    'Review feedback changes future due dates and must be intentional.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.getAgentRiskDashboard,
    'Read the Agent risk dashboard for course and review pressure.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.listAgentProposals,
    'List Agent plan proposals and their decision states.'
  ),
  readTool(
    LEGAL_STUDY_TOOL_IDS.draftAgentProposal,
    'Draft a governed Agent plan adjustment proposal.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.modifyAgentProposal,
    'Record a user-modified Agent plan proposal.',
    'User-modified plan proposals affect later scheduling decisions.'
  ),
  writeTool(
    LEGAL_STUDY_TOOL_IDS.decideAgentProposal,
    'Accept, reject, modify, or undo an Agent plan proposal.',
    'Agent proposal decisions change plans or future suppression behavior.'
  ),
];

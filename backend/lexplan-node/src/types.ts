export type LegalStudySubjectCode =
  | 'civil_law'
  | 'criminal_law'
  | 'jurisprudence'
  | 'constitutional_law'
  | 'legal_history'
  | 'comprehensive'
  | 'custom';

export type LegalStudyTaskStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'locked';
export type LegalStudyAsyncTaskStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'needs_user_action';
export type LegalStudyCardStatus = 'draft' | 'pending_confirmation' | 'confirmed' | 'archived';
export type LegalStudyUnlockStatus = 'locked' | 'unlocked' | 'learned';
export type LegalStudyProposalDecision = 'pending' | 'accepted' | 'modified' | 'rejected' | 'undone';
export type LegalStudyReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type LegalStudyJobStatus =
  | 'queued'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'retrying'
  | 'cancelled'
  | 'needs_user_action';
export type LegalStudyJobType =
  | 'textbook_ingestion'
  | 'bilibili_import'
  | 'agent_proposal_recompute';

export interface LegalStudyEntityBase {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LegalStudySubject extends LegalStudyEntityBase {
  code: LegalStudySubjectCode;
  name: string;
  priority: number;
}

export interface LegalStudyCourse extends LegalStudyEntityBase {
  subjectId: string;
  title: string;
  deadline: string;
  source?: 'manual' | 'bilibili' | 'imported';
  sourceRef?: string;
}

export interface LegalStudyCourseEpisode extends LegalStudyEntityBase {
  courseId: string;
  title: string;
  order: number;
  durationMinutes: number;
  status: LegalStudyTaskStatus;
  completedAt?: string;
  lockedByUser?: boolean;
  sourceRef?: string;
}

export interface LegalStudyTextbook extends LegalStudyEntityBase {
  subjectId: string;
  title: string;
  fileRef?: string;
  ocrStatus: LegalStudyAsyncTaskStatus;
}

export interface LegalStudyJobProgress {
  percent: number;
  message?: string;
  current?: number;
  total?: number;
}

export interface LegalStudyJobError {
  message: string;
  name?: string;
  code?: string;
}

export interface LegalStudyJob<TInput = unknown, TOutput = unknown> extends LegalStudyEntityBase {
  type: LegalStudyJobType;
  status: LegalStudyJobStatus;
  progress: LegalStudyJobProgress;
  input: TInput;
  output?: TOutput;
  error?: LegalStudyJobError;
  retryCount: number;
  startedAt?: string;
  finishedAt?: string;
  cancelledAt?: string;
}

export interface LegalStudyChapter extends LegalStudyEntityBase {
  textbookId: string;
  parentChapterId?: string;
  title: string;
  order: number;
  pageStart?: number;
  pageEnd?: number;
}

export interface LegalStudyContentSlice extends LegalStudyEntityBase {
  chapterId: string;
  sourceTextRef: string;
  pageStart?: number;
  pageEnd?: number;
  textHash: string;
}

export interface LegalStudyCard extends LegalStudyEntityBase {
  subjectId: string;
  textbookId: string;
  chapterId: string;
  sliceId: string;
  front: string;
  back: string;
  cardType: 'qa' | 'concept' | 'rule_understanding';
  status: LegalStudyCardStatus;
  unlockStatus: LegalStudyUnlockStatus;
  sourceEvidence: {
    pageStart?: number;
    pageEnd?: number;
    textHash: string;
    excerptRef: string;
  };
  editedByUser?: boolean;
}

export interface LegalStudyChapterMapping extends LegalStudyEntityBase {
  episodeId: string;
  chapterId: string;
  confidence?: number;
  reason?: string;
  source: 'system_recommended' | 'user_confirmed' | 'user_modified';
}

export interface LegalStudyReviewState extends LegalStudyEntityBase {
  cardId: string;
  dueAt: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps: number;
  lapses: number;
}

export interface LegalStudyReviewQueueItem {
  cardId: string;
  subjectId: string;
  dueAt: string;
  estimatedMinutes: number;
  overdueDays: number;
}

export interface LegalStudyDailyPlanTask {
  id: string;
  kind: 'course_episode' | 'new_card' | 'due_review';
  subjectId: string;
  refId: string;
  estimatedMinutes: number;
  lockedByUser?: boolean;
}

export interface LegalStudyDailyPlan extends LegalStudyEntityBase {
  date: string;
  availableMinutes: number;
  tasks: LegalStudyDailyPlanTask[];
}

export interface LegalStudyLearningSnapshot {
  userId: string;
  capturedAt: string;
  examDate: string;
  availableMinutesToday: number;
  subjects: LegalStudySubject[];
  courses: LegalStudyCourse[];
  episodes: LegalStudyCourseEpisode[];
  textbooks: LegalStudyTextbook[];
  chapters: LegalStudyChapter[];
  contentSlices: LegalStudyContentSlice[];
  mappings: LegalStudyChapterMapping[];
  cards: LegalStudyCard[];
  reviewStates: LegalStudyReviewState[];
  plans: LegalStudyDailyPlan[];
  rejectedProposalFingerprints: string[];
}

export interface LegalStudyUnlockReport {
  episodeId: string;
  completedEpisodeId?: string;
  mappedChapterIds: string[];
  unlockedCardIds: string[];
  skippedCardIds: string[];
  violations: string[];
}

export interface LegalStudyCoursePressure {
  courseId: string;
  subjectId: string;
  remainingEpisodeCount: number;
  remainingMinutes: number;
  daysUntilDeadline: number;
  requiredDailyMinutes: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
}

export interface LegalStudyReviewPressure {
  dueCount: number;
  dueMinutes: number;
  availableMinutes: number;
  pressureRatio: number;
  risk: 'low' | 'medium' | 'high' | 'critical';
  dueItems: LegalStudyReviewQueueItem[];
}
export interface LegalStudyPlanChange {
  type: 'add_task' | 'remove_task' | 'move_task' | 'resize_task' | 'split_new_cards' | 'preserve_due_review';
  reason: string;
  before?: unknown;
  after?: unknown;
}

export interface LegalStudyAgentPlanModificationSuggestion {
  id: string;
  title: string;
  rationale: string;
  expectedImpact: string;
  targetDate?: string;
  affectedTaskIds?: string[];
  requiresHumanConfirmation: true;
}

export interface LegalStudyAgentLLMInsight {
  provider: string;
  generatedAt: string;
  personalization: string;
  tradeoffs: string[];
  suggestedModifications: LegalStudyAgentPlanModificationSuggestion[];
  caveats: string[];
}
export interface LegalStudyPlanProposal {
  id: string;
  userId: string;
  status: LegalStudyProposalDecision;
  snapshotRef: string;
  generatedAt: string;
  summary: string;
  risks: string[];
  changes: LegalStudyPlanChange[];
  beforePlan: LegalStudyDailyPlan;
  afterPlan: LegalStudyDailyPlan;
  validation: {
    valid: boolean;
    violations: string[];
    warnings: string[];
  };
  beforePlans?: LegalStudyDailyPlan[];
  afterPlans?: LegalStudyDailyPlan[];
  planningWindow?: {
    startDate: string;
    days: number;
    examDate: string;
  };
  explanation: {
    why: string;
    affectedSubjects: string[];
    impact: string;
    userEditableFields: string[];
    drivers?: string[];
    taskChanges?: LegalStudyPlanChange[];
    timeComparison?: Array<{
      date: string;
      beforeMinutes: number;
      afterMinutes: number;
      availableMinutes: number;
    }>;
    llmInsight?: LegalStudyAgentLLMInsight;
  };
}

export interface LegalStudyProposalDecisionRecord {
  proposalId: string;
  decision: Exclude<LegalStudyProposalDecision, 'pending'>;
  decidedAt: string;
  reason?: string;
}

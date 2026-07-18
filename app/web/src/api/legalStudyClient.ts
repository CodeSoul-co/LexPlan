export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiEnvelope<T> {
  success?: boolean;
  ok?: boolean;
  data?: T;
  error?: { message?: string; code?: string };
}

export interface LegalStudyProviderStatus {
  configured?: boolean;
  enabled?: boolean;
  healthy?: boolean;
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKeyEnv?: string;
  warning?: string;
}

export interface LegalStudyCapabilities {
  counts?: Record<string, number>;
  features?: string[];
  providers?: Record<string, string>;
  providerHealth?: {
    deepseek?: LegalStudyProviderStatus;
    agentInsight?: LegalStudyProviderStatus;
    ocr?: LegalStudyProviderStatus;
    bilibili?: LegalStudyProviderStatus;
  } & Record<string, LegalStudyProviderStatus | undefined>;
  agentInsight?: { enabled: boolean; provider: string; model: string; healthy: boolean; warning?: string };
  deepseek?: {
    configured: boolean;
    baseUrl: string;
    model: string;
    apiKeyEnv: string;
    healthy?: boolean;
    warning?: string;
  };
}

export interface LegalStudyRuntimeState {
  snapshot: LegalStudySnapshot;
  proposals: LegalStudyProposal[];
  unlockReports: unknown[];
  ingestionReports: unknown[];
  jobs: LegalStudyJob[];
}

export interface LegalStudySnapshot {
  userId: string;
  capturedAt: string;
  examDate: string;
  availableMinutesToday: number;
  subjects: LegalStudySubject[];
  courses: LegalStudyCourse[];
  episodes: LegalStudyEpisode[];
  textbooks: LegalStudyTextbook[];
  chapters: LegalStudyChapter[];
  contentSlices: LegalStudyContentSlice[];
  mappings: LegalStudyMapping[];
  cards: LegalStudyCard[];
  reviewStates: LegalStudyReviewState[];
  plans: LegalStudyDailyPlan[];
  rejectedProposalFingerprints: string[];
}

export interface LegalStudySubject {
  id: string;
  userId: string;
  code: string;
  name: string;
  priority: number;
  createdAt: string;
}

export interface LegalStudyCourse {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  deadline: string;
  source?: 'manual' | 'bilibili' | 'imported';
  sourceRef?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LegalStudyEpisode {
  id: string;
  userId: string;
  courseId: string;
  title: string;
  order: number;
  durationMinutes: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'locked';
  completedAt?: string;
  lockedByUser?: boolean;
  sourceRef?: string;
  createdAt: string;
}

export interface LegalStudyTextbook {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  fileRef?: string;
  ocrStatus: string;
  createdAt: string;
  updatedAt?: string;
}

export interface LegalStudyChapter {
  id: string;
  userId: string;
  textbookId: string;
  parentChapterId?: string;
  title: string;
  order: number;
  pageStart?: number;
  pageEnd?: number;
  createdAt: string;
}

export interface LegalStudyContentSlice {
  id: string;
  userId: string;
  chapterId: string;
  sourceTextRef: string;
  pageStart?: number;
  pageEnd?: number;
  textHash: string;
  createdAt: string;
}

export interface LegalStudyCard {
  id: string;
  userId: string;
  subjectId: string;
  textbookId: string;
  chapterId: string;
  sliceId: string;
  front: string;
  back: string;
  cardType: 'qa' | 'concept' | 'rule_understanding';
  status: 'draft' | 'pending_confirmation' | 'confirmed' | 'archived';
  unlockStatus: 'locked' | 'unlocked' | 'learned';
  sourceEvidence: {
    pageStart?: number;
    pageEnd?: number;
    textHash: string;
    excerptRef: string;
  };
  editedByUser?: boolean;
  createdAt: string;
}

export interface LegalStudyMapping {
  id: string;
  userId: string;
  episodeId: string;
  chapterId: string;
  confidence?: number;
  reason?: string;
  source: 'system_recommended' | 'user_confirmed' | 'user_modified';
  createdAt: string;
}

export interface LegalStudyReviewState {
  id: string;
  userId: string;
  cardId: string;
  dueAt: string;
  stability?: number;
  difficulty?: number;
  elapsedDays?: number;
  scheduledDays?: number;
  reps: number;
  lapses: number;
  createdAt: string;
}

export interface LegalStudyDailyPlan {
  id: string;
  userId: string;
  date: string;
  availableMinutes: number;
  tasks: LegalStudyDailyPlanTask[];
  createdAt: string;
}

export interface LegalStudyDailyPlanTask {
  id: string;
  kind: 'course_episode' | 'new_card' | 'due_review';
  subjectId: string;
  refId: string;
  estimatedMinutes: number;
  lockedByUser?: boolean;
}

export interface LegalStudyProposal {
  id: string;
  userId: string;
  status: 'pending' | 'accepted' | 'modified' | 'rejected' | 'undone';
  generatedAt: string;
  summary: string;
  risks: string[];
  changes: unknown[];
  beforePlan: LegalStudyDailyPlan;
  afterPlan: LegalStudyDailyPlan;
  beforePlans?: LegalStudyDailyPlan[];
  afterPlans?: LegalStudyDailyPlan[];
  planningWindow?: { startDate: string; days: number; examDate: string };
  validation: { valid: boolean; violations: string[]; warnings: string[] };
  explanation: {
    why: string;
    affectedSubjects: string[];
    impact: string;
    userEditableFields: string[];
    drivers?: string[];
    timeComparison?: Array<{ date: string; beforeMinutes: number; afterMinutes: number; availableMinutes: number }>;
    llmInsight?: {
      provider: string;
      generatedAt: string;
      personalization: string;
      tradeoffs: string[];
      suggestedModifications: Array<{
        id: string;
        title: string;
        rationale: string;
        expectedImpact: string;
        targetDate?: string;
        affectedTaskIds?: string[];
        requiresHumanConfirmation: true;
      }>;
      caveats: string[];
    };
  };
}

export interface LegalStudyJob {
  id: string;
  userId: string;
  type: string;
  status: string;
  progress: { percent: number; message?: string };
  createdAt: string;
}

export interface BilibiliImportPreview {
  title: string;
  sourceUrl: string;
  sourceId?: string;
  sourceKind: 'video' | 'collection' | 'playlist' | 'unknown';
  provider: string;
  parsedAt: string;
  episodes: ImportedEpisodeDraft[];
  warnings: string[];
  manualEntryRequired: boolean;
}

export interface ImportedEpisodeDraft {
  title: string;
  order: number;
  durationMinutes: number;
  sourceEpisodeId?: string;
  sourceUrl?: string;
  selected?: boolean;
  page?: number;
}

export interface MappingSuggestion {
  episode: LegalStudyEpisode;
  chapter: LegalStudyChapter;
  confidence: number;
  reason: string;
}

export interface DueReviewEntry {
  cardId: string;
  subjectId: string;
  dueAt: string;
  estimatedMinutes: number;
  overdueDays: number;
  card: LegalStudyCard;
  reviewState: LegalStudyReviewState;
}

export interface IngestTextbookResult {
  report: {
    textbookId: string;
    ocrStatus: string;
    chaptersDetected: number;
    slicesCreated: number;
    cardsGenerated: number;
    cardsPendingConfirmation: number;
    provider: Record<string, string>;
    errors: string[];
  };
  textbook: LegalStudyTextbook;
  chapters: LegalStudyChapter[];
  slices: LegalStudyContentSlice[];
  cards: LegalStudyCard[];
  state: LegalStudyRuntimeState;
}

export interface BilibiliPreviewResult {
  preview: BilibiliImportPreview;
  manualCorrection: {
    editableFields: string[];
    acceptedFallbacks?: string[];
    episodeJsonShape?: unknown;
    deleteEpisodeBySettingSelectedFalse: boolean;
  };
}

export interface ImportedCourseResult {
  course: LegalStudyCourse;
  episodes: LegalStudyEpisode[];
  source: { title: string; sourceUrl: string; episodes: ImportedEpisodeDraft[] };
  state: LegalStudyRuntimeState;
}

export interface UploadedFileResult {
  fileName: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  fileRef: string;
  filePath: string;
  localPath: string;
}
export interface ProposalResult {
  proposal: LegalStudyProposal;
  state: LegalStudyRuntimeState;
}

const DEFAULT_BASE_URL = '/api/v1/legal-study';

export class LegalStudyClient {
  private readonly baseUrl: string;

  constructor(baseUrl = import.meta.env.VITE_LEGAL_STUDY_API_BASE || DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  capabilities() {
    return this.request<LegalStudyCapabilities>('/capabilities');
  }

  state() {
    return this.request<LegalStudyRuntimeState>('/state');
  }

  reset(userId?: string) {
    return this.request<LegalStudyRuntimeState>('/reset', { method: 'POST', body: { userId } });
  }

  previewBilibiliCourse(input: { url: string; titleHint?: string }) {
    return this.request<BilibiliPreviewResult>('/courses/bilibili-preview', { method: 'POST', body: input });
  }

  confirmBilibiliCourse(input: {
    userId?: string;
    subjectId: string;
    deadline: string;
    preview: BilibiliImportPreview;
    title?: string;
    episodes?: ImportedEpisodeDraft[];
    now?: string;
  }) {
    return this.request<ImportedCourseResult>('/courses/bilibili-confirm', { method: 'POST', body: input });
  }

  async uploadFile(file: File) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
    }
    return this.request<UploadedFileResult>('/files/upload', {
      method: 'POST',
      body: {
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64: btoa(binary),
      },
    });
  }

  listJobs(filter: { type?: string; status?: string } = {}) {
    const params = new URLSearchParams();
    if (filter.type) params.set('type', filter.type);
    if (filter.status) params.set('status', filter.status);
    const query = params.toString();
    return this.request<LegalStudyJob[]>(`/jobs${query ? `?${query}` : ''}`);
  }

  getJob(jobId: string) {
    return this.request<LegalStudyJob>(`/jobs/${encodeURIComponent(jobId)}`);
  }

  runJob(jobId: string) {
    return this.request<{ job: LegalStudyJob; state: LegalStudyRuntimeState }>(`/jobs/${encodeURIComponent(jobId)}/run`, { method: 'POST' });
  }

  retryJob(jobId: string) {
    return this.request<{ job: LegalStudyJob; state: LegalStudyRuntimeState }>(`/jobs/${encodeURIComponent(jobId)}/retry`, { method: 'POST' });
  }

  cancelJob(jobId: string) {
    return this.request<{ job: LegalStudyJob; state: LegalStudyRuntimeState }>(`/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  }
  ingestTextbook(input: {
    userId?: string;
    subjectId: string;
    textbookId?: string;
    textbookTitle: string;
    fileName?: string;
    fileRef?: string;
    filePath?: string;
    mimeType?: string;
    text?: string;
    confirmCards?: boolean;
    now?: string;
  }) {
    return this.request<IngestTextbookResult>('/textbooks/ingest', { method: 'POST', body: input });
  }

  enqueueTextbookIngestion(input: {
    userId?: string;
    subjectId: string;
    textbookId?: string;
    textbookTitle: string;
    fileName?: string;
    fileRef?: string;
    filePath?: string;
    mimeType?: string;
    text?: string;
    confirmCards?: boolean;
    start?: boolean;
    now?: string;
  }) {
    return this.request<{ job: LegalStudyJob; state: LegalStudyRuntimeState }>('/textbooks/ingest-async', {
      method: 'POST',
      body: input,
    });
  }
  confirmCards(cardIds: string[]) {
    return this.request<{ cards: LegalStudyCard[]; state: LegalStudyRuntimeState }>('/cards/confirm-batch', {
      method: 'POST',
      body: { cardIds },
    });
  }

  updateCard(cardId: string, input: { front?: string; back?: string; status?: LegalStudyCard['status']; now?: string }) {
    return this.request<{ card: LegalStudyCard; state: LegalStudyRuntimeState }>('/cards/' + encodeURIComponent(cardId), {
      method: 'PATCH',
      body: input,
    });
  }

  suggestMappings(input: { courseId?: string; subjectId?: string; textbookId?: string; minConfidence?: number; now?: string }) {
    return this.request<MappingSuggestion[]>('/mappings/suggest', { method: 'POST', body: input });
  }

  confirmMapping(input: { episodeId: string; chapterId: string; confidence?: number; reason?: string; now?: string }) {
    return this.request<{ mapping: LegalStudyMapping; state: LegalStudyRuntimeState }>('/mappings/confirm', { method: 'POST', body: input });
  }

  modifyMapping(mappingId: string, input: { chapterId?: string; confidence?: number; reason?: string; now?: string }) {
    return this.request<{ mapping: LegalStudyMapping; state: LegalStudyRuntimeState }>('/mappings/' + encodeURIComponent(mappingId), { method: 'PATCH', body: input });
  }

  deleteMapping(mappingId: string) {
    return this.request<{ deleted: boolean; state: LegalStudyRuntimeState }>('/mappings/' + encodeURIComponent(mappingId), { method: 'DELETE' });
  }

  unlockEpisode(episodeId: string, completedAt?: string) {
    return this.request<{ report: unknown; state: LegalStudyRuntimeState }>(`/episodes/${encodeURIComponent(episodeId)}/unlock`, {
      method: 'POST',
      body: { completedAt },
    });
  }

  listNewCards(subjectId?: string) {
    return this.request<LegalStudyCard[]>(`/reviews/new-cards${subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : ''}`);
  }

  listDueReviews(date: string, subjectId?: string) {
    const params = new URLSearchParams({ date });
    if (subjectId) params.set('subjectId', subjectId);
    return this.request<DueReviewEntry[]>(`/reviews/due?${params.toString()}`);
  }

  learnCard(cardId: string, learnedAt?: string) {
    return this.request<{ card: LegalStudyCard; state: LegalStudyRuntimeState }>('/reviews/learn', {
      method: 'POST',
      body: { cardId, learnedAt },
    });
  }

  submitReview(input: { cardId: string; rating: 'again' | 'hard' | 'good' | 'easy'; reviewedAt?: string }) {
    return this.request<{ card: LegalStudyCard; state: LegalStudyRuntimeState }>('/reviews/submit', {
      method: 'POST',
      body: input,
    });
  }

  draftAgentProposal(input: { date?: string; now?: string; windowDays?: number }) {
    return this.request<ProposalResult>('/agent/proposals', { method: 'POST', body: input });
  }

  modifyAgentProposal(proposalId: string, input: { afterPlan: LegalStudyDailyPlan; summary?: string; reason?: string; now?: string }) {
    return this.request<ProposalResult>(`/agent/proposals/${encodeURIComponent(proposalId)}`, {
      method: 'PATCH',
      body: input,
    });
  }

  decideAgentProposal(proposalId: string, input: { decision: 'accepted' | 'modified' | 'rejected' | 'undone'; reason?: string; decidedAt?: string }) {
    return this.request<ProposalResult>(`/agent/proposals/${encodeURIComponent(proposalId)}/decision`, {
      method: 'POST',
      body: input,
    });
  }

  private async request<T>(path: string, init: { method?: ApiMethod; body?: unknown } = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = isRecord(payload)
        ? stringFromUnknown(payload.message) || stringFromUnknown(payload.error) || stringFromUnknown(payload.error?.message)
        : String(payload);
      throw new Error(message || `Request failed with HTTP ${response.status}`);
    }
    if (isEnvelope<T>(payload)) {
      if (payload.error?.message) throw new Error(payload.error.message);
      if (payload.data !== undefined) return payload.data;
    }
    return payload as T;
  }
}

function isEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return isRecord(value) && ('data' in value || 'success' in value || 'ok' in value || 'error' in value);
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function stringFromUnknown(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export const legalStudyClient = new LegalStudyClient();

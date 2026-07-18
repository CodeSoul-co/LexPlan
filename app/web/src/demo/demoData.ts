import type {
  BilibiliImportPreview,
  DueReviewEntry,
  LegalStudyCapabilities,
  LegalStudyCard,
  LegalStudyProposal,
  LegalStudyRuntimeState,
  MappingSuggestion,
} from '../api/legalStudyClient';

export const DEMO_TODAY = '2026-07-17';
const USER_ID = 'lexplan-demo-user';
const NOW = `${DEMO_TODAY}T08:30:00.000Z`;

const cards: LegalStudyCard[] = [
  {
    id: 'card-civil-offer',
    userId: USER_ID,
    subjectId: 'subject-civil',
    textbookId: 'textbook-civil',
    chapterId: 'chapter-civil-contract',
    sliceId: 'slice-civil-contract-1',
    front: '要约应当具备哪些成立条件？',
    back: '内容具体确定，并表明经受要约人承诺，要约人即受该意思表示约束。',
    cardType: 'qa',
    status: 'confirmed',
    unlockStatus: 'unlocked',
    sourceEvidence: { pageStart: 102, pageEnd: 103, textHash: 'demo-civil-001', excerptRef: '《民法考试分析》P102–103' },
    createdAt: NOW,
  },
  {
    id: 'card-civil-acceptance',
    userId: USER_ID,
    subjectId: 'subject-civil',
    textbookId: 'textbook-civil',
    chapterId: 'chapter-civil-contract',
    sliceId: 'slice-civil-contract-2',
    front: '承诺生效时会产生什么法律效果？',
    back: '承诺生效时合同成立；合同是否有效仍需结合主体、意思表示和强制性规范另行判断。',
    cardType: 'rule_understanding',
    status: 'confirmed',
    unlockStatus: 'learned',
    sourceEvidence: { pageStart: 104, pageEnd: 105, textHash: 'demo-civil-002', excerptRef: '《民法考试分析》P104–105' },
    createdAt: NOW,
  },
  {
    id: 'card-civil-validity',
    userId: USER_ID,
    subjectId: 'subject-civil',
    textbookId: 'textbook-civil',
    chapterId: 'chapter-civil-validity',
    sliceId: 'slice-civil-validity-1',
    front: '民事法律行为有效的一般条件是什么？',
    back: '行为人具有相应行为能力、意思表示真实，且不违反法律行政法规的强制性规定和公序良俗。',
    cardType: 'concept',
    status: 'confirmed',
    unlockStatus: 'locked',
    sourceEvidence: { pageStart: 110, pageEnd: 112, textHash: 'demo-civil-003', excerptRef: '《民法考试分析》P110–112' },
    createdAt: NOW,
  },
  {
    id: 'card-criminal-elements',
    userId: USER_ID,
    subjectId: 'subject-criminal',
    textbookId: 'textbook-criminal',
    chapterId: 'chapter-criminal-elements',
    sliceId: 'slice-criminal-elements-1',
    front: '犯罪构成四要件通常包括什么？',
    back: '犯罪客体、犯罪客观方面、犯罪主体和犯罪主观方面。',
    cardType: 'qa',
    status: 'confirmed',
    unlockStatus: 'learned',
    sourceEvidence: { pageStart: 33, pageEnd: 35, textHash: 'demo-criminal-001', excerptRef: '《刑法考试分析》P33–35' },
    createdAt: NOW,
  },
  {
    id: 'card-criminal-causation',
    userId: USER_ID,
    subjectId: 'subject-criminal',
    textbookId: 'textbook-criminal',
    chapterId: 'chapter-criminal-elements',
    sliceId: 'slice-criminal-elements-2',
    front: '刑法因果关系的判断解决什么问题？',
    back: '判断危害行为与危害结果之间是否存在客观联系，是结果归责的基础。',
    cardType: 'rule_understanding',
    status: 'pending_confirmation',
    unlockStatus: 'locked',
    sourceEvidence: { pageStart: 39, pageEnd: 41, textHash: 'demo-criminal-002', excerptRef: '《刑法考试分析》P39–41' },
    createdAt: NOW,
  },
  {
    id: 'card-jurisprudence-rule',
    userId: USER_ID,
    subjectId: 'subject-jurisprudence',
    textbookId: 'textbook-jurisprudence',
    chapterId: 'chapter-jurisprudence-rule',
    sliceId: 'slice-jurisprudence-rule-1',
    front: '法律规则由哪些逻辑要素构成？',
    back: '假定条件、行为模式和法律后果。',
    cardType: 'concept',
    status: 'confirmed',
    unlockStatus: 'learned',
    sourceEvidence: { pageStart: 18, pageEnd: 19, textHash: 'demo-jurisprudence-001', excerptRef: '《法理学核心讲义》P18–19' },
    createdAt: NOW,
  },
];

export function createDemoRuntime(): LegalStudyRuntimeState {
  return {
    snapshot: {
      userId: USER_ID,
      capturedAt: NOW,
      examDate: '2026-12-20',
      availableMinutesToday: 150,
      subjects: [
        { id: 'subject-civil', userId: USER_ID, code: 'civil_law', name: '民法', priority: 1, createdAt: NOW },
        { id: 'subject-criminal', userId: USER_ID, code: 'criminal_law', name: '刑法', priority: 2, createdAt: NOW },
        { id: 'subject-jurisprudence', userId: USER_ID, code: 'jurisprudence', name: '法理学', priority: 3, createdAt: NOW },
      ],
      courses: [
        { id: 'course-civil', userId: USER_ID, subjectId: 'subject-civil', title: '民法基础精讲 · 2026', deadline: '2026-09-15', source: 'bilibili', sourceRef: 'https://www.bilibili.com/video/BV1DemoCivil', createdAt: NOW },
        { id: 'course-criminal', userId: USER_ID, subjectId: 'subject-criminal', title: '刑法总则系统课', deadline: '2026-08-31', source: 'imported', createdAt: NOW },
        { id: 'course-jurisprudence', userId: USER_ID, subjectId: 'subject-jurisprudence', title: '法理学核心考点', deadline: '2026-10-10', source: 'manual', createdAt: NOW },
      ],
      episodes: [
        { id: 'episode-civil-contract', userId: USER_ID, courseId: 'course-civil', title: '合同的成立：要约与承诺', order: 8, durationMinutes: 42, status: 'in_progress', createdAt: NOW },
        { id: 'episode-civil-validity', userId: USER_ID, courseId: 'course-civil', title: '民事法律行为的效力', order: 9, durationMinutes: 48, status: 'pending', createdAt: NOW },
        { id: 'episode-criminal-elements', userId: USER_ID, courseId: 'course-criminal', title: '犯罪构成与客观要件', order: 5, durationMinutes: 55, status: 'completed', completedAt: '2026-07-16T14:00:00.000Z', createdAt: NOW },
        { id: 'episode-criminal-intent', userId: USER_ID, courseId: 'course-criminal', title: '犯罪主观方面', order: 6, durationMinutes: 50, status: 'pending', createdAt: NOW },
        { id: 'episode-jurisprudence-rule', userId: USER_ID, courseId: 'course-jurisprudence', title: '法律规则与法律原则', order: 3, durationMinutes: 36, status: 'completed', completedAt: '2026-07-15T12:00:00.000Z', createdAt: NOW },
      ],
      textbooks: [
        { id: 'textbook-civil', userId: USER_ID, subjectId: 'subject-civil', title: '民法考试分析 2026', fileRef: 'demo://civil-analysis.pdf', ocrStatus: 'succeeded', createdAt: NOW },
        { id: 'textbook-criminal', userId: USER_ID, subjectId: 'subject-criminal', title: '刑法考试分析 2026', fileRef: 'demo://criminal-analysis.pdf', ocrStatus: 'succeeded', createdAt: NOW },
        { id: 'textbook-jurisprudence', userId: USER_ID, subjectId: 'subject-jurisprudence', title: '法理学核心讲义', fileRef: 'demo://jurisprudence.pdf', ocrStatus: 'succeeded', createdAt: NOW },
      ],
      chapters: [
        { id: 'chapter-civil-contract', userId: USER_ID, textbookId: 'textbook-civil', title: '合同的订立', order: 7, pageStart: 98, pageEnd: 108, createdAt: NOW },
        { id: 'chapter-civil-validity', userId: USER_ID, textbookId: 'textbook-civil', title: '民事法律行为的效力', order: 8, pageStart: 109, pageEnd: 122, createdAt: NOW },
        { id: 'chapter-criminal-elements', userId: USER_ID, textbookId: 'textbook-criminal', title: '犯罪构成', order: 4, pageStart: 31, pageEnd: 48, createdAt: NOW },
        { id: 'chapter-criminal-intent', userId: USER_ID, textbookId: 'textbook-criminal', title: '犯罪主观方面', order: 5, pageStart: 49, pageEnd: 63, createdAt: NOW },
        { id: 'chapter-jurisprudence-rule', userId: USER_ID, textbookId: 'textbook-jurisprudence', title: '法律规则', order: 2, pageStart: 16, pageEnd: 24, createdAt: NOW },
      ],
      contentSlices: [
        { id: 'slice-civil-contract-1', userId: USER_ID, chapterId: 'chapter-civil-contract', sourceTextRef: 'demo://civil/p102', pageStart: 102, pageEnd: 103, textHash: 'demo-civil-001', createdAt: NOW },
        { id: 'slice-civil-contract-2', userId: USER_ID, chapterId: 'chapter-civil-contract', sourceTextRef: 'demo://civil/p104', pageStart: 104, pageEnd: 105, textHash: 'demo-civil-002', createdAt: NOW },
        { id: 'slice-civil-validity-1', userId: USER_ID, chapterId: 'chapter-civil-validity', sourceTextRef: 'demo://civil/p110', pageStart: 110, pageEnd: 112, textHash: 'demo-civil-003', createdAt: NOW },
        { id: 'slice-criminal-elements-1', userId: USER_ID, chapterId: 'chapter-criminal-elements', sourceTextRef: 'demo://criminal/p33', pageStart: 33, pageEnd: 35, textHash: 'demo-criminal-001', createdAt: NOW },
        { id: 'slice-criminal-elements-2', userId: USER_ID, chapterId: 'chapter-criminal-elements', sourceTextRef: 'demo://criminal/p39', pageStart: 39, pageEnd: 41, textHash: 'demo-criminal-002', createdAt: NOW },
        { id: 'slice-jurisprudence-rule-1', userId: USER_ID, chapterId: 'chapter-jurisprudence-rule', sourceTextRef: 'demo://jurisprudence/p18', pageStart: 18, pageEnd: 19, textHash: 'demo-jurisprudence-001', createdAt: NOW },
      ],
      mappings: [
        { id: 'mapping-civil-contract', userId: USER_ID, episodeId: 'episode-civil-contract', chapterId: 'chapter-civil-contract', confidence: 0.96, reason: '课程与教材均围绕“合同订立、要约与承诺”。', source: 'user_confirmed', createdAt: NOW },
        { id: 'mapping-criminal-elements', userId: USER_ID, episodeId: 'episode-criminal-elements', chapterId: 'chapter-criminal-elements', confidence: 0.93, reason: '标题和知识点高度一致。', source: 'user_confirmed', createdAt: NOW },
        { id: 'mapping-jurisprudence-rule', userId: USER_ID, episodeId: 'episode-jurisprudence-rule', chapterId: 'chapter-jurisprudence-rule', confidence: 0.91, reason: '法律规则为课程主知识点。', source: 'user_confirmed', createdAt: NOW },
      ],
      cards: cards.map((card) => ({ ...card })),
      reviewStates: [
        { id: 'review-civil-acceptance', userId: USER_ID, cardId: 'card-civil-acceptance', dueAt: `${DEMO_TODAY}T09:00:00.000Z`, stability: 4.2, difficulty: 5.4, elapsedDays: 3, scheduledDays: 3, reps: 4, lapses: 0, createdAt: NOW },
        { id: 'review-criminal-elements', userId: USER_ID, cardId: 'card-criminal-elements', dueAt: `${DEMO_TODAY}T09:00:00.000Z`, stability: 2.8, difficulty: 6.1, elapsedDays: 2, scheduledDays: 2, reps: 3, lapses: 1, createdAt: NOW },
        { id: 'review-jurisprudence-rule', userId: USER_ID, cardId: 'card-jurisprudence-rule', dueAt: '2026-07-18T09:00:00.000Z', stability: 5.6, difficulty: 4.2, elapsedDays: 4, scheduledDays: 5, reps: 5, lapses: 0, createdAt: NOW },
      ],
      plans: [
        {
          id: 'plan-demo-today',
          userId: USER_ID,
          date: DEMO_TODAY,
          availableMinutes: 150,
          tasks: [
            { id: 'task-review-criminal', kind: 'due_review', subjectId: 'subject-criminal', refId: 'card-criminal-elements', estimatedMinutes: 8 },
            { id: 'task-civil-contract', kind: 'course_episode', subjectId: 'subject-civil', refId: 'episode-civil-contract', estimatedMinutes: 42 },
            { id: 'task-card-offer', kind: 'new_card', subjectId: 'subject-civil', refId: 'card-civil-offer', estimatedMinutes: 12 },
            { id: 'task-criminal-intent', kind: 'course_episode', subjectId: 'subject-criminal', refId: 'episode-criminal-intent', estimatedMinutes: 50 },
          ],
          createdAt: NOW,
        },
      ],
      rejectedProposalFingerprints: [],
    },
    proposals: [createDemoProposal()],
    unlockReports: [],
    ingestionReports: [],
    jobs: [
      { id: 'job-demo-civil', userId: USER_ID, type: '教材识别与成卡', status: 'succeeded', progress: { percent: 100, message: '民法教材已生成 3 张知识卡' }, createdAt: NOW },
      { id: 'job-demo-criminal', userId: USER_ID, type: '教材增量更新', status: 'running', progress: { percent: 68, message: '正在校对第 49–63 页章节结构' }, createdAt: NOW },
    ],
  };
}

export function createDemoDueReviews(): DueReviewEntry[] {
  const runtime = createDemoRuntime();
  return runtime.snapshot.reviewStates
    .filter((state) => state.dueAt.slice(0, 10) <= DEMO_TODAY)
    .map((reviewState) => {
      const card = runtime.snapshot.cards.find((item) => item.id === reviewState.cardId)!;
      return {
        cardId: card.id,
        subjectId: card.subjectId,
        dueAt: reviewState.dueAt,
        estimatedMinutes: card.id === 'card-criminal-elements' ? 8 : 6,
        overdueDays: card.id === 'card-criminal-elements' ? 1 : 0,
        card,
        reviewState,
      };
    });
}

export function createDemoProposal(): LegalStudyProposal {
  const basePlan = {
    id: 'plan-demo-before',
    userId: USER_ID,
    date: DEMO_TODAY,
    availableMinutes: 150,
    tasks: [
      { id: 'task-civil-contract', kind: 'course_episode' as const, subjectId: 'subject-civil', refId: 'episode-civil-contract', estimatedMinutes: 42 },
      { id: 'task-criminal-intent', kind: 'course_episode' as const, subjectId: 'subject-criminal', refId: 'episode-criminal-intent', estimatedMinutes: 50 },
      { id: 'task-review-criminal', kind: 'due_review' as const, subjectId: 'subject-criminal', refId: 'card-criminal-elements', estimatedMinutes: 8 },
    ],
    createdAt: NOW,
  };
  return {
    id: 'proposal-demo-weekly',
    userId: USER_ID,
    status: 'pending',
    generatedAt: NOW,
    summary: '优先完成到期复习，民法课程保留，刑法新课后移 1 天。',
    risks: ['刑法到期复习压力较昨日上升', '本周剩余学习时间减少 40 分钟'],
    changes: [],
    beforePlan: basePlan,
    afterPlan: {
      ...basePlan,
      id: 'plan-demo-after',
      tasks: [
        basePlan.tasks[2],
        basePlan.tasks[0],
        { id: 'task-card-offer', kind: 'new_card', subjectId: 'subject-civil', refId: 'card-civil-offer', estimatedMinutes: 12 },
      ],
    },
    planningWindow: { startDate: DEMO_TODAY, days: 5, examDate: '2026-12-20' },
    validation: { valid: true, violations: [], warnings: ['刑法第 6 讲将顺延至明日'] },
    explanation: {
      why: '到期旧卡具有更高遗忘风险，且今日可用时间不足以覆盖全部课程。',
      affectedSubjects: ['民法', '刑法'],
      impact: '预计今日节省 38 分钟，并保持到期复习全部完成。',
      userEditableFields: ['任务顺序', '每日可用时间', '课程锁定状态'],
      drivers: ['2 张旧卡今日到期', '民法课程截止时间更宽松', '刑法复习稳定性下降'],
      timeComparison: [
        { date: DEMO_TODAY, beforeMinutes: 162, afterMinutes: 112, availableMinutes: 150 },
        { date: '2026-07-18', beforeMinutes: 98, afterMinutes: 136, availableMinutes: 150 },
        { date: '2026-07-19', beforeMinutes: 120, afterMinutes: 120, availableMinutes: 150 },
      ],
      llmInsight: {
        provider: 'DeepSeek · 演示',
        generatedAt: NOW,
        personalization: '你最近在刑法复习中出现一次遗忘，先完成旧卡能降低后续重复学习成本。',
        tradeoffs: ['刑法新课推迟 1 天', '民法学习节奏不受影响'],
        suggestedModifications: [
          {
            id: 'suggestion-demo-1',
            title: '晚间增加 15 分钟轻复习',
            rationale: '利用碎片时间回顾犯罪构成卡片，不增加连续学习负担。',
            expectedImpact: '降低明日复习压力约 8 分钟',
            targetDate: DEMO_TODAY,
            requiresHumanConfirmation: true,
          },
        ],
        caveats: ['建议基于当前演示数据生成'],
      },
    },
  };
}

export function createDemoCapabilities(): LegalStudyCapabilities {
  return {
    features: ['课程解析', '教材 OCR', '智能成卡', '章节映射', 'FSRS 复习', 'Agent 动态计划'],
    providers: {
      ocr: 'PaddleOCR · 演示可用',
      bilibili: 'Bilibili Import · 演示可用',
      cardGeneration: 'LexPlan Card Engine',
      store: 'demo-isolated',
    },
    deepseek: {
      configured: true,
      baseUrl: 'demo://deepseek',
      model: 'deepseek-chat',
      apiKeyEnv: 'DEMO',
      healthy: true,
    },
    agentInsight: { enabled: true, provider: 'deepseek', model: 'deepseek-chat', healthy: true },
  };
}

export function createDemoCoursePreview(): BilibiliImportPreview {
  return {
    title: '民法基础精讲 · 合同编',
    sourceUrl: 'https://www.bilibili.com/video/BV1DemoCivil',
    sourceId: 'BV1DemoCivil',
    sourceKind: 'collection',
    provider: 'Bilibili · 演示解析',
    parsedAt: NOW,
    episodes: [
      { title: '合同的订立：要约与承诺', order: 1, durationMinutes: 42, selected: true },
      { title: '合同的效力与无效情形', order: 2, durationMinutes: 48, selected: true },
      { title: '合同履行中的抗辩权', order: 3, durationMinutes: 51, selected: true },
      { title: '合同解除与违约责任', order: 4, durationMinutes: 46, selected: true },
    ],
    warnings: [],
    manualEntryRequired: false,
  };
}

export function createDemoMappingSuggestions(runtime: LegalStudyRuntimeState): MappingSuggestion[] {
  const episode = runtime.snapshot.episodes.find((item) => item.id === 'episode-civil-validity');
  const chapter = runtime.snapshot.chapters.find((item) => item.id === 'chapter-civil-validity');
  const criminalEpisode = runtime.snapshot.episodes.find((item) => item.id === 'episode-criminal-intent');
  const criminalChapter = runtime.snapshot.chapters.find((item) => item.id === 'chapter-criminal-intent');
  return [
    ...(episode && chapter ? [{ episode, chapter, confidence: 0.94, reason: '标题、学科与核心术语高度一致。' }] : []),
    ...(criminalEpisode && criminalChapter ? [{ episode: criminalEpisode, chapter: criminalChapter, confidence: 0.91, reason: '课程知识点与章节目录完全对应。' }] : []),
  ];
}

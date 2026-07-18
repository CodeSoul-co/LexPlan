import {
  Bell,
  BookOpen,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Cloud,
  Database,
  ExternalLink,
  History,
  Home,
  Link2,
  Menu,
  PanelLeftClose,
  RefreshCw,
  RotateCcw,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Wifi,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  legalStudyClient,
  type DueReviewEntry,
  type LegalStudyCapabilities,
  type LegalStudyCard,
  type LegalStudyDailyPlan,
  type LegalStudyProposal,
  type LegalStudyRuntimeState,
  type MappingSuggestion,
} from './api/legalStudyClient';
import { ErrorRecovery, HistoryPanel, StatusPill, type HistoryEntry, type Tone } from './components/ui';
import {
  createDemoCapabilities,
  createDemoCoursePreview,
  createDemoDueReviews,
  createDemoMappingSuggestions,
  createDemoProposal,
  createDemoRuntime,
  DEMO_TODAY,
} from './demo/demoData';
import { CourseImportPage, type CourseDraftState } from './features/CourseImportPage';
import { LandingPage } from './features/LandingPage';
import { MappingPage, type MappingState } from './features/MappingPage';
import { OnboardingPage, type OnboardingProfile } from './features/OnboardingPage';
import { ReviewAgentPage } from './features/ReviewAgentPage';
import { TextbookPage, type TextbookDraftState } from './features/TextbookPage';
import { TodayPage } from './features/TodayPage';

export type ViewId = 'today' | 'courses' | 'textbooks' | 'mapping' | 'reviewAgent' | 'settings';
type WorkflowStatus = 'done' | 'active' | 'ready' | 'blocked';
type AppMode = 'live' | 'demo';
type RouteKind = 'landing' | 'onboarding' | 'workspace';

interface RouteState {
  kind: RouteKind;
  view: ViewId;
}

interface LoadState {
  capabilities?: LegalStudyCapabilities;
  runtime?: LegalStudyRuntimeState;
  proposal?: LegalStudyProposal;
  dueReviews: DueReviewEntry[];
  loading: boolean;
  message?: string;
  messageTone?: Tone;
  lastLoadedAt?: string;
}

export interface WorkflowStep {
  id: ViewId;
  label: string;
  shortLabel: string;
  status: WorkflowStatus;
  metric: string;
}

const TODAY = new Date().toISOString().slice(0, 10);
const DEFAULT_BILIBILI_URL = 'https://www.bilibili.com/video/BV1Z7yzBJERB';
const DEFAULT_PDF_PATH = '/data/uploads/civil-law-first-chapter.pdf';
const DEFAULT_PDF_NAME = 'civil-law-first-chapter.pdf';

const views: Array<{ id: ViewId; label: string; description: string; icon: typeof CalendarCheck; group: 'study' | 'library' | 'system' }> = [
  { id: 'today', label: '今天', description: '专注完成当日计划', icon: CalendarCheck, group: 'study' },
  { id: 'reviewAgent', label: '复习计划', description: '新卡、旧卡与动态调度', icon: BrainCircuit, group: 'study' },
  { id: 'courses', label: '课程', description: '导入课程与分P目录', icon: Link2, group: 'library' },
  { id: 'textbooks', label: '教材与卡片', description: '识别教材并校对知识卡', icon: BookOpen, group: 'library' },
  { id: 'mapping', label: '章节映射', description: '连接课程进度与教材章节', icon: ClipboardList, group: 'library' },
  { id: 'settings', label: '设置与状态', description: '数据模式与服务连接', icon: Settings, group: 'system' },
];

export function App() {
  const initialRoute = readRoute();
  const [route, setRoute] = useState<RouteState>(initialRoute);
  const [activeView, setActiveView] = useState<ViewId>(initialRoute.view);
  const [appMode, setAppMode] = useState<AppMode>(() => window.localStorage.getItem('lexplan-app-mode') === 'demo' ? 'demo' : 'live');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCompact, setSidebarCompact] = useState(false);
  const [state, setState] = useState<LoadState>({ loading: false, dueReviews: [] });
  const [courseDraft, setCourseDraft] = useState<CourseDraftState>({
    url: DEFAULT_BILIBILI_URL,
    title: '民法基础精讲 · 合同编',
    subjectId: 'subject-civil',
    deadline: '2026-09-15',
    episodes: [],
  });
  const [textbookDraft, setTextbookDraft] = useState<TextbookDraftState>({
    subjectId: 'subject-civil',
    title: '民法考试分析 2026',
    textbookId: 'textbook-civil',
    fileName: DEFAULT_PDF_NAME,
    filePath: DEFAULT_PDF_PATH,
    fileRef: `upload://${DEFAULT_PDF_NAME}`,
    confirmCards: true,
  });
  const [mappingState, setMappingState] = useState<MappingState>({ courseId: '', textbookId: '', suggestions: [] });
  const [agentWindowDays, setAgentWindowDays] = useState(5);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastRetry, setLastRetry] = useState<(() => Promise<void>) | undefined>();

  const load = useCallback(async () => {
    if (appMode === 'demo') {
      const runtime = createDemoRuntime();
      const proposal = createDemoProposal();
      setState({
        capabilities: createDemoCapabilities(),
        runtime,
        proposal,
        dueReviews: createDemoDueReviews(),
        loading: false,
        lastLoadedAt: new Date().toLocaleTimeString(),
      });
      syncDefaults(runtime);
      return;
    }
    setState((current) => ({ ...current, loading: true, message: undefined }));
    try {
      const [capabilities, runtime, dueReviews] = await Promise.all([
        legalStudyClient.capabilities(),
        legalStudyClient.state(),
        legalStudyClient.listDueReviews(TODAY),
      ]);
      setState({
        capabilities,
        runtime,
        proposal: runtime.proposals.at(-1),
        dueReviews,
        loading: false,
        lastLoadedAt: new Date().toLocaleTimeString(),
      });
      syncDefaults(runtime);
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        message: errorMessage(error),
        messageTone: 'danger',
      }));
    }
  }, [appMode]);

  useEffect(() => {
    if (route.kind === 'workspace') void load();
  }, [load, route.kind]);

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = readRoute();
      setRoute(nextRoute);
      setActiveView(nextRoute.view);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    document.title = route.kind === 'landing'
      ? 'LexPlan · 法律学习规划助手'
      : route.kind === 'onboarding'
        ? '建立学习空间 · LexPlan'
        : `${viewTitle(activeView)} · LexPlan`;
  }, [activeView, route.kind]);

  const snapshot = state.runtime?.snapshot;
  const subjects = snapshot?.subjects ?? [];
  const courses = snapshot?.courses ?? [];
  const episodes = snapshot?.episodes ?? [];
  const textbooks = snapshot?.textbooks ?? [];
  const chapters = snapshot?.chapters ?? [];
  const cards = snapshot?.cards ?? [];
  const mappings = snapshot?.mappings ?? [];
  const newCards = cards.filter((card) => card.status === 'confirmed' && card.unlockStatus === 'unlocked');
  const learnedCards = cards.filter((card) => card.unlockStatus === 'learned');
  const pendingCards = cards.filter((card) => card.status === 'pending_confirmation');
  const jobs = state.runtime?.jobs ?? [];
  const completedEpisodes = episodes.filter((episode) => episode.status === 'completed');

  const workflowSteps = useMemo<WorkflowStep[]>(() => {
    const courseReady = courses.length > 0 && episodes.length > 0;
    const textbookReady = textbooks.length > 0 && chapters.length > 0 && cards.length > 0;
    const mappingReady = mappings.length > 0;
    const unlockReady = completedEpisodes.length > 0 || newCards.length > 0 || learnedCards.length > 0;
    const proposalReady = Boolean(state.proposal) || (state.runtime?.proposals ?? []).length > 0;
    return [
      step('courses', '导入课程与分P', '课程', courseReady, 'ready', `${episodes.length} 个分P`),
      step('textbooks', '处理教材并成卡', '教材', textbookReady, courseReady ? 'ready' : 'blocked', `${cards.length} 张卡`),
      step('mapping', '映射章节并解锁', '映射', mappingReady && unlockReady, textbookReady ? 'ready' : 'blocked', `${mappings.length} 条映射`),
      step('reviewAgent', '复习反馈与计划', '复习', proposalReady, unlockReady ? 'ready' : 'blocked', `${state.dueReviews.length + newCards.length} 张待学`),
    ];
  }, [
    cards.length,
    chapters.length,
    completedEpisodes.length,
    courses.length,
    episodes.length,
    learnedCards.length,
    mappings.length,
    newCards.length,
    state.dueReviews.length,
    state.proposal,
    state.runtime?.proposals,
    textbooks.length,
  ]);

  const nextStep = workflowSteps.find((candidate) => candidate.status !== 'done') ?? workflowSteps.at(-1);
  const workflowDone = workflowSteps.filter((item) => item.status === 'done').length;

  function navigate(path: string, next: RouteState) {
    window.history.pushState({}, '', path);
    setRoute(next);
    setActiveView(next.view);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function navigateView(view: ViewId) {
    const slug = view === 'reviewAgent' ? 'review' : view;
    navigate(`/app/${slug}`, { kind: 'workspace', view });
  }

  function enterDemo() {
    const runtime = createDemoRuntime();
    window.localStorage.setItem('lexplan-app-mode', 'demo');
    setAppMode('demo');
    setState({
      capabilities: createDemoCapabilities(),
      runtime,
      proposal: createDemoProposal(),
      dueReviews: createDemoDueReviews(),
      loading: false,
      message: '已进入演示模式：所有内容均为模拟样例，可放心操作。',
      messageTone: 'success',
      lastLoadedAt: new Date().toLocaleTimeString(),
    });
    setCourseDraft((current) => ({ ...current, subjectId: 'subject-civil', title: '民法基础精讲 · 合同编', deadline: '2026-09-15' }));
    setTextbookDraft((current) => ({ ...current, subjectId: 'subject-civil', textbookId: 'textbook-civil', title: '民法考试分析 2026' }));
    setMappingState({ courseId: 'course-civil', textbookId: 'textbook-civil', suggestions: [] });
    setHistory([{ id: 'demo-start', time: new Date().toLocaleTimeString(), title: '已加载完整法硕演示项目', detail: '民法、刑法、法理学课程与教材已准备好。', tone: 'success' }]);
    navigate('/app/today', { kind: 'workspace', view: 'today' });
  }

  function completeOnboarding(profile: OnboardingProfile) {
    window.localStorage.setItem('lexplan-app-mode', 'live');
    setAppMode('live');
    setCourseDraft((current) => ({
      ...current,
      url: profile.courseUrl || current.url,
      subjectId: subjectIdFromName(profile.subject),
      deadline: profile.examDate,
    }));
    setTextbookDraft((current) => ({
      ...current,
      subjectId: subjectIdFromName(profile.subject),
      fileName: profile.textbookName || current.fileName,
    }));
    navigate('/app/today', { kind: 'workspace', view: 'today' });
  }

  function syncDefaults(runtime: LegalStudyRuntimeState) {
    const nextSubjectId = runtime.snapshot.subjects[0]?.id ?? 'subject-civil';
    const firstCourse = runtime.snapshot.courses[0];
    const firstTextbook = runtime.snapshot.textbooks[0];
    setCourseDraft((current) => ({ ...current, subjectId: current.subjectId || nextSubjectId }));
    setTextbookDraft((current) => ({
      ...current,
      subjectId: current.subjectId || nextSubjectId,
      textbookId: current.textbookId || firstTextbook?.id || '',
    }));
    setMappingState((current) => ({
      ...current,
      courseId: current.courseId || firstCourse?.id || '',
      textbookId: current.textbookId || firstTextbook?.id || '',
    }));
  }

  function recordHistory(title: string, tone: Tone = 'success', detail?: string) {
    const now = new Date().toLocaleTimeString();
    setHistory((current) => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, time: now, title, detail, tone },
      ...current,
    ].slice(0, 12));
  }

  function demoFeedback(message: string, tone: Tone = 'success') {
    setState((current) => ({
      ...current,
      loading: false,
      message,
      messageTone: tone,
      lastLoadedAt: new Date().toLocaleTimeString(),
    }));
    recordHistory(message, tone);
  }

  function updateDemoRuntime(transform: (runtime: LegalStudyRuntimeState) => LegalStudyRuntimeState, message: string, tone: Tone = 'success') {
    setState((current) => ({
      ...current,
      runtime: current.runtime ? transform(current.runtime) : current.runtime,
      loading: false,
      message,
      messageTone: tone,
      lastLoadedAt: new Date().toLocaleTimeString(),
    }));
    recordHistory(message, tone);
  }

  function updateRuntime(runtime: LegalStudyRuntimeState, message: string, tone: Tone = 'success') {
    setState((current) => ({ ...current, runtime, loading: false, message, messageTone: tone, lastLoadedAt: new Date().toLocaleTimeString() }));
    recordHistory(message, tone);
    void refreshDueReviews();
    syncDefaults(runtime);
  }

  async function refreshDueReviews() {
    if (appMode === 'demo') return;
    try {
      const dueReviews = await legalStudyClient.listDueReviews(TODAY);
      setState((current) => ({ ...current, dueReviews }));
    } catch {
      // Keep the current snapshot if the queue endpoint is temporarily unavailable.
    }
  }

  async function runAction(work: () => Promise<void>) {
    setLastRetry(() => work);
    setState((current) => ({ ...current, loading: true, message: undefined }));
    try {
      await work();
    } catch (error) {
      const message = errorMessage(error);
      recordHistory('操作失败', 'danger', message);
      setState((current) => ({ ...current, loading: false, message, messageTone: 'danger' }));
    }
  }

  async function resetWorkflowState() {
    await runAction(async () => {
      if (appMode === 'demo') {
        const runtime = createDemoRuntime();
        setCourseDraft((current) => ({ ...current, preview: undefined, episodes: [] }));
        setMappingState({ courseId: 'course-civil', textbookId: 'textbook-civil', suggestions: [] });
        setState({
          capabilities: createDemoCapabilities(),
          runtime,
          proposal: createDemoProposal(),
          dueReviews: createDemoDueReviews(),
          loading: false,
          message: '演示项目已恢复到初始状态。',
          messageTone: 'success',
          lastLoadedAt: new Date().toLocaleTimeString(),
        });
        recordHistory('演示项目已重置');
        navigateView('today');
        return;
      }
      const runtime = await legalStudyClient.reset('lexplan-local-user');
      const capabilities = await legalStudyClient.capabilities();
      const dueReviews = await legalStudyClient.listDueReviews(TODAY);
      setCourseDraft((current) => ({ ...current, preview: undefined, episodes: [] }));
      setMappingState((current) => ({ ...current, suggestions: [] }));
      setState({ capabilities, runtime, dueReviews, loading: false, message: '学习空间已重置。', messageTone: 'success', lastLoadedAt: new Date().toLocaleTimeString() });
      syncDefaults(runtime);
      navigateView('today');
    });
  }

  async function previewBilibili() {
    await runAction(async () => {
      if (appMode === 'demo') {
        const preview = createDemoCoursePreview();
        setCourseDraft((current) => ({ ...current, title: preview.title, preview, episodes: preview.episodes }));
        demoFeedback(`解析完成：识别到 ${preview.episodes.length} 个分P，可在导入前校正。`);
        return;
      }
      const result = await legalStudyClient.previewBilibiliCourse({ url: courseDraft.url, titleHint: courseDraft.title });
      setCourseDraft((current) => ({
        ...current,
        title: result.preview.title,
        preview: result.preview,
        episodes: result.preview.episodes.map((episode) => ({ ...episode, selected: episode.selected !== false })),
      }));
      demoFeedback(`解析完成：识别到 ${result.preview.episodes.length} 个分P，可在导入前校正。`);
    });
  }

  async function confirmBilibili() {
    await runAction(async () => {
      if (!courseDraft.preview) throw new Error('请先解析课程链接。');
      if (appMode === 'demo') {
        demoFeedback(`已模拟导入课程：${courseDraft.title}。`);
        navigateView('textbooks');
        return;
      }
      const result = await legalStudyClient.confirmBilibiliCourse({
        subjectId: courseDraft.subjectId,
        deadline: courseDraft.deadline,
        preview: courseDraft.preview,
        title: courseDraft.title,
        episodes: courseDraft.episodes,
        now: new Date().toISOString(),
      });
      setCourseDraft((current) => ({ ...current, preview: undefined, episodes: [] }));
      setMappingState((current) => ({ ...current, courseId: result.course.id }));
      updateRuntime(result.state, `已导入课程：${result.course.title}，共 ${result.episodes.length} 个分P。`);
      navigateView('textbooks');
    });
  }

  async function uploadTextbookFile(file: File) {
    await runAction(async () => {
      if (appMode === 'demo') {
        setTextbookDraft((current) => ({
          ...current,
          fileName: file.name,
          filePath: `demo://uploads/${file.name}`,
          fileRef: `demo://uploads/${file.name}`,
          title: current.title || file.name.replace(/\.[^.]+$/, ''),
        }));
        demoFeedback(`已载入演示文件：${file.name}。`);
        return;
      }
      const uploaded = await legalStudyClient.uploadFile(file);
      setTextbookDraft((current) => ({
        ...current,
        fileName: uploaded.fileName,
        filePath: uploaded.filePath,
        fileRef: uploaded.fileRef,
        title: current.title || uploaded.originalFileName.replace(/\.[^.]+$/, ''),
      }));
      demoFeedback(`已上传：${uploaded.originalFileName}，${Math.round(uploaded.sizeBytes / 1024)} KB。`);
    });
  }

  async function ingestTextbookAsync() {
    await runAction(async () => {
      if (appMode === 'demo') {
        demoFeedback('演示任务已创建：正在识别章节并生成知识卡。');
        return;
      }
      const result = await legalStudyClient.enqueueTextbookIngestion({
        subjectId: textbookDraft.subjectId,
        textbookId: textbookDraft.textbookId || undefined,
        textbookTitle: textbookDraft.title,
        fileName: textbookDraft.fileName,
        filePath: textbookDraft.filePath,
        fileRef: textbookDraft.fileRef,
        mimeType: 'application/pdf',
        confirmCards: textbookDraft.confirmCards,
        start: true,
        now: new Date().toISOString(),
      });
      updateRuntime(result.state, `后台处理任务已创建：${result.job.status}。`);
    });
  }

  async function runJob(jobId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({ ...runtime, jobs: runtime.jobs.map((job) => job.id === jobId ? { ...job, status: 'succeeded', progress: { percent: 100, message: '演示任务已完成' } } : job) }),
          '教材处理任务已完成。',
        );
        return;
      }
      const result = await legalStudyClient.runJob(jobId);
      updateRuntime(result.state, `任务已运行：${result.job.status}。`, result.job.status === 'failed' ? 'danger' : 'success');
      if (result.job.status === 'succeeded') navigateView('mapping');
    });
  }

  async function retryJob(jobId: string) {
    if (appMode === 'demo') return runJob(jobId);
    await runAction(async () => {
      const result = await legalStudyClient.retryJob(jobId);
      updateRuntime(result.state, `任务已重试：${result.job.status}。`, result.job.status === 'failed' ? 'danger' : 'success');
      if (result.job.status === 'succeeded') navigateView('mapping');
    });
  }

  async function cancelJob(jobId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({ ...runtime, jobs: runtime.jobs.map((job) => job.id === jobId ? { ...job, status: 'cancelled', progress: { ...job.progress, message: '已取消演示任务' } } : job) }),
          '任务已取消。',
          'warning',
        );
        return;
      }
      const result = await legalStudyClient.cancelJob(jobId);
      updateRuntime(result.state, `任务已取消：${result.job.status}。`, 'warning');
    });
  }

  async function ingestTextbook() {
    await runAction(async () => {
      if (appMode === 'demo') {
        demoFeedback('教材处理完成：识别 5 个章节，生成 6 张知识卡。');
        navigateView('mapping');
        return;
      }
      const result = await legalStudyClient.ingestTextbook({
        subjectId: textbookDraft.subjectId,
        textbookId: textbookDraft.textbookId || undefined,
        textbookTitle: textbookDraft.title,
        fileName: textbookDraft.fileName,
        filePath: textbookDraft.filePath,
        fileRef: textbookDraft.fileRef,
        mimeType: 'application/pdf',
        confirmCards: textbookDraft.confirmCards,
        now: new Date().toISOString(),
      });
      setTextbookDraft((current) => ({ ...current, textbookId: result.textbook.id }));
      setMappingState((current) => ({ ...current, textbookId: result.textbook.id }));
      updateRuntime(result.state, `教材处理完成：${result.chapters.length} 章、${result.cards.length} 张卡。`);
      navigateView('mapping');
    });
  }

  async function confirmPendingCards() {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({ ...runtime, snapshot: { ...runtime.snapshot, cards: runtime.snapshot.cards.map((card) => card.status === 'pending_confirmation' ? { ...card, status: 'confirmed' } : card) } }),
          `已确认 ${pendingCards.length} 张待审卡片。`,
        );
        return;
      }
      const result = await legalStudyClient.confirmCards(pendingCards.map((card) => card.id));
      updateRuntime(result.state, `已确认 ${result.cards.length} 张卡片。`);
    });
  }

  async function suggestMappings() {
    await runAction(async () => {
      if (appMode === 'demo' && state.runtime) {
        const suggestions = createDemoMappingSuggestions(state.runtime);
        setMappingState((current) => ({ ...current, suggestions }));
        demoFeedback(`已生成 ${suggestions.length} 条高置信度映射建议。`);
        return;
      }
      const suggestions = await legalStudyClient.suggestMappings({
        courseId: mappingState.courseId || undefined,
        textbookId: mappingState.textbookId || undefined,
        subjectId: courseDraft.subjectId,
        minConfidence: 0.2,
        now: new Date().toISOString(),
      });
      setMappingState((current) => ({ ...current, suggestions }));
      demoFeedback(`已生成 ${suggestions.length} 条映射建议。`);
    });
  }

  async function confirmSuggestion(suggestion: MappingSuggestion) {
    await runAction(async () => {
      if (appMode === 'demo') {
        addDemoMapping(suggestion.episode.id, suggestion.chapter.id, suggestion.reason, suggestion.confidence);
        return;
      }
      const result = await legalStudyClient.confirmMapping({
        episodeId: suggestion.episode.id,
        chapterId: suggestion.chapter.id,
        confidence: suggestion.confidence,
        reason: suggestion.reason,
        now: new Date().toISOString(),
      });
      updateRuntime(result.state, `已确认映射：${suggestion.episode.title} → ${suggestion.chapter.title}`);
    });
  }

  function addDemoMapping(episodeId: string, chapterId: string, reason = '人工确认的演示映射。', confidence = 1) {
    updateDemoRuntime((runtime) => {
      const exists = runtime.snapshot.mappings.some((item) => item.episodeId === episodeId);
      if (exists) return runtime;
      return {
        ...runtime,
        snapshot: {
          ...runtime.snapshot,
          mappings: [
            ...runtime.snapshot.mappings,
            { id: `mapping-demo-${Date.now()}`, userId: runtime.snapshot.userId, episodeId, chapterId, confidence, reason, source: 'user_confirmed', createdAt: new Date().toISOString() },
          ],
        },
      };
    }, '章节映射已确认。');
  }

  async function updateCard(cardId: string, input: { front: string; back: string; status: LegalStudyCard['status'] }) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({
            ...runtime,
            snapshot: {
              ...runtime.snapshot,
              cards: runtime.snapshot.cards.map((card) => card.id === cardId ? { ...card, ...input, editedByUser: true } : card),
            },
          }),
          `已保存卡片：${input.front}`,
        );
        return;
      }
      const result = await legalStudyClient.updateCard(cardId, { ...input, now: new Date().toISOString() });
      updateRuntime(result.state, `已保存卡片：${result.card.front}`);
    });
  }

  async function manualConfirmMapping(episodeId: string, chapterId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        addDemoMapping(episodeId, chapterId);
        return;
      }
      const result = await legalStudyClient.confirmMapping({ episodeId, chapterId, confidence: 1, reason: '人工映射确认。', now: new Date().toISOString() });
      updateRuntime(result.state, '已保存人工章节映射。');
    });
  }

  async function modifyMapping(mappingId: string, chapterId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({ ...runtime, snapshot: { ...runtime.snapshot, mappings: runtime.snapshot.mappings.map((item) => item.id === mappingId ? { ...item, chapterId, source: 'user_modified' } : item) } }),
          '映射关系已更新。',
        );
        return;
      }
      const result = await legalStudyClient.modifyMapping(mappingId, { chapterId, confidence: 1, reason: '人工修改章节映射。', now: new Date().toISOString() });
      updateRuntime(result.state, '映射关系已更新。');
    });
  }

  async function deleteMapping(mappingId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({ ...runtime, snapshot: { ...runtime.snapshot, mappings: runtime.snapshot.mappings.filter((item) => item.id !== mappingId) } }),
          '映射关系已删除。',
          'warning',
        );
        return;
      }
      const result = await legalStudyClient.deleteMapping(mappingId);
      updateRuntime(result.state, result.deleted ? '映射关系已删除。' : '映射已不存在。', result.deleted ? 'success' : 'warning');
    });
  }

  async function unlockEpisode(episodeId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime((runtime) => {
          const chapterIds = runtime.snapshot.mappings.filter((item) => item.episodeId === episodeId).map((item) => item.chapterId);
          return {
            ...runtime,
            snapshot: {
              ...runtime.snapshot,
              episodes: runtime.snapshot.episodes.map((item) => item.id === episodeId ? { ...item, status: 'completed', completedAt: new Date().toISOString() } : item),
              cards: runtime.snapshot.cards.map((card) => chapterIds.includes(card.chapterId) && card.status === 'confirmed' ? { ...card, unlockStatus: 'unlocked' } : card),
            },
          };
        }, '课程已完成，对应章节卡片已解锁。');
        navigateView('reviewAgent');
        return;
      }
      const result = await legalStudyClient.unlockEpisode(episodeId, new Date().toISOString());
      updateRuntime(result.state, '课程已完成，对应章节卡片已解锁。');
      navigateView('reviewAgent');
    });
  }

  async function learnCard(cardId: string) {
    await runAction(async () => {
      if (appMode === 'demo') {
        updateDemoRuntime(
          (runtime) => ({ ...runtime, snapshot: { ...runtime.snapshot, cards: runtime.snapshot.cards.map((card) => card.id === cardId ? { ...card, unlockStatus: 'learned' } : card) } }),
          '新卡学习完成，已加入复习队列。',
        );
        return;
      }
      const result = await legalStudyClient.learnCard(cardId, new Date().toISOString());
      updateRuntime(result.state, `已学习新卡：${result.card.front}`);
    });
  }

  async function submitReview(cardId: string, rating: 'again' | 'hard' | 'good' | 'easy') {
    await runAction(async () => {
      if (appMode === 'demo') {
        setState((current) => ({ ...current, dueReviews: current.dueReviews.filter((entry) => entry.cardId !== cardId), loading: false }));
        demoFeedback(`复习反馈已记录：${ratingLabel(rating)}。`);
        return;
      }
      const result = await legalStudyClient.submitReview({ cardId, rating, reviewedAt: new Date().toISOString() });
      updateRuntime(result.state, `复习反馈已记录：${ratingLabel(rating)}。`);
    });
  }

  async function draftAgent() {
    await runAction(async () => {
      if (appMode === 'demo') {
        const proposal = createDemoProposal();
        setState((current) => ({ ...current, proposal, loading: false, message: 'Agent 已结合复习压力生成 5 天计划建议。', messageTone: 'success', lastLoadedAt: new Date().toLocaleTimeString() }));
        recordHistory('Agent 已生成计划建议');
        return;
      }
      const result = await legalStudyClient.draftAgentProposal({ date: TODAY, now: new Date().toISOString(), windowDays: agentWindowDays });
      setState((current) => ({
        ...current,
        runtime: result.state,
        proposal: result.proposal,
        loading: false,
        message: result.proposal.validation.valid ? 'Agent 已生成有效计划。' : 'Agent 计划需要人工处理。',
        messageTone: result.proposal.validation.valid ? 'success' : 'warning',
        lastLoadedAt: new Date().toLocaleTimeString(),
      }));
    });
  }

  async function decideProposal(decision: 'accepted' | 'modified' | 'rejected' | 'undone') {
    await runAction(async () => {
      if (!state.proposal) throw new Error('请先生成 Agent 建议。');
      if (appMode === 'demo') {
        const proposal = { ...state.proposal, status: decision } as LegalStudyProposal;
        setState((current) => ({ ...current, proposal, loading: false, message: `Agent 建议已${decisionLabel(decision)}。`, messageTone: 'success', lastLoadedAt: new Date().toLocaleTimeString() }));
        recordHistory(`Agent 建议已${decisionLabel(decision)}`);
        if (decision === 'accepted') navigateView('today');
        return;
      }
      const result = decision === 'modified'
        ? await legalStudyClient.modifyAgentProposal(state.proposal.id, {
            afterPlan: resizePlan(state.proposal.afterPlan, -10),
            summary: `${state.proposal.summary}（人工微调）`,
            reason: '将第一个非锁定任务缩短 10 分钟。',
            now: new Date().toISOString(),
          })
        : await legalStudyClient.decideAgentProposal(state.proposal.id, {
            decision,
            reason: `web workflow ${decision}`,
            decidedAt: new Date().toISOString(),
          });
      setState((current) => ({
        ...current,
        runtime: result.state,
        proposal: result.proposal,
        loading: false,
        message: `Agent 建议已${decisionLabel(decision)}。`,
        messageTone: 'success',
        lastLoadedAt: new Date().toLocaleTimeString(),
      }));
      if (decision === 'accepted') navigateView('today');
    });
  }

  if (route.kind === 'landing') {
    return <LandingPage onStart={() => navigate('/onboarding', { kind: 'onboarding', view: 'today' })} onDemo={enterDemo} />;
  }

  if (route.kind === 'onboarding') {
    return (
      <OnboardingPage
        onBack={() => navigate('/', { kind: 'landing', view: 'today' })}
        onComplete={completeOnboarding}
        onDemo={enterDemo}
      />
    );
  }

  return (
    <div className={`app-shell ${sidebarCompact ? 'sidebar-compact' : ''}`}>
      <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
        <div className="sidebar-brand-row">
          <button className="brand app-brand" type="button" onClick={() => navigate('/', { kind: 'landing', view: 'today' })}>
            <span className="brand-mark"><ShieldCheck size={20} aria-hidden="true" /></span>
            <span className="brand-text"><strong>LexPlan</strong><small>法律学习规划助手</small></span>
          </button>
          <button className="sidebar-close mobile-only" type="button" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}><X size={19} /></button>
        </div>

        <button className="workspace-switcher" type="button" onClick={() => navigateView('settings')}>
          <span className="workspace-avatar">{appMode === 'demo' ? '演' : '我'}</span>
          <span className="workspace-copy"><strong>{appMode === 'demo' ? '法硕演示空间' : '我的学习空间'}</strong><small>{appMode === 'demo' ? '完整示例数据' : '本地学习数据'}</small></span>
          <ChevronDown size={15} />
        </button>

        <nav className="nav-list" aria-label="主导航">
          <NavGroup title="学习" items={views.filter((item) => item.group === 'study')} activeView={activeView} onSelect={navigateView} />
          <NavGroup title="资料库" items={views.filter((item) => item.group === 'library')} activeView={activeView} onSelect={navigateView} />
        </nav>

        <div className="sidebar-setup-card">
          <div className="setup-head"><span>学习闭环</span><strong>{workflowDone}/4</strong></div>
          <div className="setup-progress"><span style={{ width: `${(workflowDone / 4) * 100}%` }} /></div>
          <small>{workflowDone === 4 ? '课程、教材与复习已连接' : `下一步：${nextStep?.label ?? '完成设置'}`}</small>
        </div>

        <div className="sidebar-bottom">
          <button className={activeView === 'settings' ? 'nav-item active' : 'nav-item'} type="button" onClick={() => navigateView('settings')}>
            <Settings size={18} /><span>设置与状态</span>
          </button>
          <button className="sidebar-collapse desktop-only" type="button" onClick={() => setSidebarCompact((value) => !value)}>
            <PanelLeftClose size={17} /><span>{sidebarCompact ? '展开导航' : '收起导航'}</span>
          </button>
          <div className="sidebar-user">
            <span className="user-avatar">竹</span>
            <span><strong>学习者</strong><small>{appMode === 'demo' ? '正在浏览演示' : '本地账户'}</small></span>
            <span className="connection-dot" title="本地连接" />
          </div>
        </div>
      </aside>

      {sidebarOpen ? <button className="sidebar-backdrop" type="button" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} /> : null}

      <main className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button className="mobile-menu mobile-only" type="button" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
            <div><span className="breadcrumb">学习空间 / {viewTitle(activeView)}</span><h1>{viewTitle(activeView)}</h1></div>
          </div>
          <div className="topbar-actions">
            {appMode === 'demo' ? <span className="mode-badge"><Sparkles size={14} />演示模式</span> : null}
            <button className="icon-button" type="button" onClick={() => void load()} aria-label="刷新学习数据" title="刷新学习数据"><RefreshCw size={17} /></button>
            <button className="icon-button notification-button" type="button" aria-label="通知"><Bell size={17} /><span /></button>
          </div>
        </header>

        {state.message ? (
          <div className={`notice ${state.messageTone ?? 'success'}`}>
            <span>{state.message}</span>
            <button type="button" aria-label="关闭提示" onClick={() => setState((current) => ({ ...current, message: undefined }))}><X size={15} /></button>
          </div>
        ) : null}
        {state.messageTone === 'danger' && activeView !== 'settings' ? (
          <ErrorRecovery message={state.message} onRetry={() => { if (lastRetry) void runAction(lastRetry); else void load(); }} onReset={() => void resetWorkflowState()} />
        ) : null}

        <section className={`page-stage page-${activeView}`}>
          {activeView === 'today' ? (
            <TodayPage
              runtime={state.runtime}
              dueReviews={state.dueReviews}
              proposal={state.proposal}
              workflowSteps={workflowSteps}
              nextStep={nextStep}
              onNavigate={navigateView}
            />
          ) : null}
          {activeView === 'courses' ? (
            <CourseImportPage
              draft={courseDraft}
              subjects={subjects}
              setDraft={setCourseDraft}
              onPreview={() => void previewBilibili()}
              onConfirm={() => void confirmBilibili()}
            />
          ) : null}
          {activeView === 'textbooks' ? (
            <TextbookPage
              draft={textbookDraft}
              subjects={subjects}
              runtime={state.runtime}
              pendingCards={pendingCards}
              jobs={jobs}
              loading={state.loading}
              setDraft={setTextbookDraft}
              onUpload={(file) => void uploadTextbookFile(file)}
              onIngest={() => void ingestTextbook()}
              onIngestAsync={() => void ingestTextbookAsync()}
              onConfirmCards={() => void confirmPendingCards()}
              onUpdateCard={(cardId, input) => void updateCard(cardId, input)}
              onRunJob={(jobId) => void runJob(jobId)}
              onRetryJob={(jobId) => void retryJob(jobId)}
              onCancelJob={(jobId) => void cancelJob(jobId)}
            />
          ) : null}
          {activeView === 'mapping' ? (
            <MappingPage
              runtime={state.runtime}
              mappingState={mappingState}
              setMappingState={setMappingState}
              loading={state.loading}
              onSuggest={() => void suggestMappings()}
              onConfirm={(suggestion) => void confirmSuggestion(suggestion)}
              onManualConfirm={(episodeId, chapterId) => void manualConfirmMapping(episodeId, chapterId)}
              onModifyMapping={(mappingId, chapterId) => void modifyMapping(mappingId, chapterId)}
              onDeleteMapping={(mappingId) => void deleteMapping(mappingId)}
              onUnlock={(episodeId) => void unlockEpisode(episodeId)}
            />
          ) : null}
          {activeView === 'reviewAgent' ? (
            <ReviewAgentPage
              runtime={state.runtime}
              dueReviews={state.dueReviews}
              newCards={newCards}
              learnedCards={learnedCards}
              proposal={state.proposal}
              windowDays={agentWindowDays}
              setWindowDays={setAgentWindowDays}
              onLearn={(cardId) => void learnCard(cardId)}
              onReview={(cardId, rating) => void submitReview(cardId, rating)}
              onDraft={() => void draftAgent()}
              onDecision={(decision) => void decideProposal(decision)}
            />
          ) : null}
          {activeView === 'settings' ? (
            <SettingsPage
              mode={appMode}
              capabilities={state.capabilities}
              runtime={state.runtime}
              history={history}
              lastLoadedAt={state.lastLoadedAt}
              onDemo={enterDemo}
              onLive={() => {
                window.localStorage.setItem('lexplan-app-mode', 'live');
                setAppMode('live');
                setState({ loading: false, dueReviews: [], message: '已切换到真实数据模式。', messageTone: 'success' });
              }}
              onReset={() => void resetWorkflowState()}
            />
          ) : null}
        </section>
      </main>

      <nav className="mobile-tabbar mobile-only" aria-label="移动端导航">
        {views.filter((item) => ['today', 'courses', 'reviewAgent', 'settings'].includes(item.id)).map((item) => {
          const Icon = item.icon;
          return <button className={activeView === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => navigateView(item.id)}><Icon size={19} /><span>{item.label}</span></button>;
        })}
      </nav>
    </div>
  );
}

function NavGroup({
  title,
  items,
  activeView,
  onSelect,
}: {
  title: string;
  items: typeof views;
  activeView: ViewId;
  onSelect: (view: ViewId) => void;
}) {
  return (
    <div className="nav-group">
      <span className="nav-group-title">{title}</span>
      {items.map((view) => {
        const Icon = view.icon;
        return (
          <button key={view.id} className={activeView === view.id ? 'nav-item active' : 'nav-item'} type="button" onClick={() => onSelect(view.id)} title={view.description}>
            <Icon size={18} aria-hidden="true" /><span>{view.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function SettingsPage({
  mode,
  capabilities,
  runtime,
  history,
  lastLoadedAt,
  onDemo,
  onLive,
  onReset,
}: {
  mode: AppMode;
  capabilities?: LegalStudyCapabilities;
  runtime?: LegalStudyRuntimeState;
  history: HistoryEntry[];
  lastLoadedAt?: string;
  onDemo: () => void;
  onLive: () => void;
  onReset: () => void;
}) {
  const deepseek = capabilities?.deepseek ?? capabilities?.providerHealth?.deepseek;
  return (
    <>
      <div className="page-intro">
        <div><span className="page-kicker">学习空间设置</span><h2>设置与服务状态</h2><p>管理数据模式，查看处理能力和最近操作。</p></div>
      </div>

      <div className="settings-grid">
        <section className="settings-card data-mode-card">
          <div className="settings-title"><span className="settings-icon"><Database size={19} /></span><div><h3>数据模式</h3><p>演示数据与真实学习数据完全隔离。</p></div></div>
          <div className="mode-options">
            <button className={mode === 'demo' ? 'mode-option active' : 'mode-option'} type="button" onClick={onDemo}>
              <span><Sparkles size={18} /></span><div><strong>演示模式</strong><small>加载完整法硕示例，适合展示</small></div>{mode === 'demo' ? <CheckCircle2 size={18} /> : null}
            </button>
            <button className={mode === 'live' ? 'mode-option active' : 'mode-option'} type="button" onClick={onLive}>
              <span><Cloud size={18} /></span><div><strong>真实数据</strong><small>连接本地 LexPlan 服务</small></div>{mode === 'live' ? <CheckCircle2 size={18} /> : null}
            </button>
          </div>
          <button className="button danger-subtle" type="button" onClick={onReset}><RotateCcw size={16} />重置当前学习空间</button>
        </section>

        <section className="settings-card">
          <div className="settings-title"><span className="settings-icon"><Server size={19} /></span><div><h3>服务连接</h3><p>上次同步：{lastLoadedAt ?? '尚未同步'}</p></div></div>
          <div className="service-list">
            <ServiceRow icon={BrainCircuit} name="Agent 解释" value={deepseek?.configured || capabilities?.agentInsight?.enabled ? '可用' : '未配置'} healthy={Boolean(deepseek?.configured || capabilities?.agentInsight?.enabled)} />
            <ServiceRow icon={BookOpen} name="教材识别" value={capabilities?.providers?.ocr ?? '等待连接'} healthy={Boolean(capabilities?.providers?.ocr)} />
            <ServiceRow icon={Link2} name="课程解析" value={capabilities?.providers?.bilibili ?? '等待连接'} healthy={Boolean(capabilities?.providers?.bilibili)} />
            <ServiceRow icon={Database} name="数据存储" value={capabilities?.providers?.store ?? '本地内存'} healthy />
          </div>
        </section>

        <section className="settings-card learning-data-card">
          <div className="settings-title"><span className="settings-icon"><Wifi size={19} /></span><div><h3>学习数据概览</h3><p>当前空间的资料与进度。</p></div></div>
          <div className="settings-stats">
            <div><strong>{runtime?.snapshot.courses.length ?? 0}</strong><span>课程</span></div>
            <div><strong>{runtime?.snapshot.textbooks.length ?? 0}</strong><span>教材</span></div>
            <div><strong>{runtime?.snapshot.cards.length ?? 0}</strong><span>卡片</span></div>
            <div><strong>{runtime?.snapshot.mappings.length ?? 0}</strong><span>映射</span></div>
          </div>
          <button className="button soft" type="button"><ExternalLink size={16} />导出学习数据</button>
        </section>

        <section className="settings-card history-card">
          <div className="settings-title"><span className="settings-icon"><History size={19} /></span><div><h3>最近操作</h3><p>保留本次会话的关键操作。</p></div></div>
          <HistoryPanel entries={history} />
        </section>
      </div>
    </>
  );
}

function ServiceRow({ icon: Icon, name, value, healthy }: { icon: typeof BrainCircuit; name: string; value: string; healthy?: boolean }) {
  return (
    <div className="service-row">
      <span><Icon size={16} /></span>
      <div><strong>{name}</strong><small>{value}</small></div>
      <i className={healthy ? 'healthy' : ''} />
    </div>
  );
}

function step(id: ViewId, label: string, shortLabel: string, done: boolean, readyWhenNotDone: WorkflowStatus, metric: string): WorkflowStep {
  return { id, label, shortLabel, status: done ? 'done' : readyWhenNotDone, metric };
}

function viewTitle(view: ViewId): string {
  return views.find((candidate) => candidate.id === view)?.label ?? '今天';
}

function readRoute(): RouteState {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/onboarding') return { kind: 'onboarding', view: 'today' };
  if (path.startsWith('/app/')) {
    const slug = path.split('/').filter(Boolean).at(-1);
    const view: ViewId = slug === 'review'
      ? 'reviewAgent'
      : ['today', 'courses', 'textbooks', 'mapping', 'settings'].includes(slug ?? '')
        ? slug as ViewId
        : 'today';
    return { kind: 'workspace', view };
  }
  return { kind: 'landing', view: 'today' };
}

function subjectIdFromName(name: string): string {
  const map: Record<string, string> = { 民法: 'subject-civil', 刑法: 'subject-criminal', 法理学: 'subject-jurisprudence', 宪法学: 'subject-constitution' };
  return map[name] ?? 'subject-civil';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resizePlan(plan: LegalStudyDailyPlan, deltaMinutes: number): LegalStudyDailyPlan {
  let applied = false;
  return {
    ...plan,
    tasks: plan.tasks.map((task) => {
      if (applied || task.lockedByUser) return task;
      applied = true;
      return { ...task, estimatedMinutes: Math.max(1, task.estimatedMinutes + deltaMinutes) };
    }),
  };
}

function decisionLabel(decision: 'accepted' | 'modified' | 'rejected' | 'undone'): string {
  return { accepted: '接受', modified: '修改', rejected: '拒绝', undone: '撤销' }[decision];
}

function ratingLabel(rating: 'again' | 'hard' | 'good' | 'easy'): string {
  return { again: '重来', hard: '困难', good: '良好', easy: '简单' }[rating];
}

import type {
  LegalStudyAgentLLMInsight,
  LegalStudyDailyPlanTask,
  LegalStudyLearningSnapshot,
  LegalStudyPlanProposal,
} from '../types';

export interface LegalStudyAgentInsightInput {
  snapshot: LegalStudyLearningSnapshot;
  proposal: LegalStudyPlanProposal;
  intent: 'draft' | 'modify';
  userInstruction?: string;
  now?: string;
}

export interface LegalStudyAgentInsightProvider {
  readonly id: string;
  generateInsight(input: LegalStudyAgentInsightInput): Promise<LegalStudyAgentLLMInsight>;
}

export class DeterministicAgentInsightProvider implements LegalStudyAgentInsightProvider {
  readonly id = 'agent-insight.deterministic';

  async generateInsight(input: LegalStudyAgentInsightInput): Promise<LegalStudyAgentLLMInsight> {
    const proposal = input.proposal;
    const firstDate = proposal.planningWindow?.startDate ?? proposal.afterPlan.date;
    const overloadedDays = (proposal.explanation.timeComparison ?? []).filter(
      (item) => item.afterMinutes >= item.availableMinutes * 0.9
    );
    const tradeoffs = proposal.explanation.drivers?.length
      ? proposal.explanation.drivers.slice(0, 4)
      : ['当前计划主要由硬约束驱动：保留到期旧卡、锁定任务，并限制新卡释放速度。'];
    return {
      provider: this.id,
      generatedAt: input.now ?? new Date().toISOString(),
      personalization: proposal.validation.valid
        ? `建议先执行 ${firstDate} 的高确定性任务，再根据当天精力决定是否采纳可选调整。`
        : '当前计划存在硬约束冲突，建议先人工修正时间或任务选择，再确认写入。',
      tradeoffs,
      suggestedModifications: buildFallbackSuggestions(proposal, overloadedDays),
      caveats: [
        '这些建议不会自动写入正式计划，需要用户点击 accept/modify 后才会生效。',
        'DeepSeek 未启用时使用本地解释 fallback。',
      ],
    };
  }
}

export class DeepSeekAgentInsightProvider implements LegalStudyAgentInsightProvider {
  readonly id = 'agent-insight.deepseek';

  constructor(
    private readonly config: {
      apiKeyEnv?: string;
      baseUrl?: string;
      model?: string;
      timeoutMs?: number;
      fallback?: LegalStudyAgentInsightProvider;
    } = {}
  ) {}

  async generateInsight(input: LegalStudyAgentInsightInput): Promise<LegalStudyAgentLLMInsight> {
    const apiKey = process.env[this.config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'];
    if (!apiKey) return this.fallback(input);
    try {
      const content = await this.callDeepSeek(input, apiKey);
      const parsed = parseInsight(content, this.id, input.now ?? new Date().toISOString());
      if (!parsed) return this.fallback(input);
      return parsed;
    } catch {
      return this.fallback(input);
    }
  }

  private async callDeepSeek(input: LegalStudyAgentInsightInput, apiKey: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 45000);
    try {
      const baseUrl = (this.config.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model ?? process.env.DEEPSEEK_AGENT_MODEL ?? process.env.DEEPSEEK_CARD_MODEL ?? 'deepseek-chat',
          response_format: { type: 'json_object' },
          temperature: 0.25,
          messages: [
            {
              role: 'system',
              content: [
                '你是法硕学习计划解释器，不是自动写入计划的执行器。',
                '只输出 JSON：{"personalization":"...","tradeoffs":["..."],"suggestedModifications":[{"title":"...","rationale":"...","expectedImpact":"...","targetDate":"YYYY-MM-DD","affectedTaskIds":["..."]}],"caveats":["..."]}。',
                '必须尊重硬约束：不能删除锁定任务，不能漏到期旧卡，不能安排未解锁卡，不能超过每日可用时间。',
                '修改建议只能是供用户确认的建议，不能声称已经写入。',
              ].join('\n'),
            },
            {
              role: 'user',
              content: JSON.stringify(buildInsightPromptPayload(input)),
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`DeepSeek API returned HTTP ${response.status}`);
      const data = (await response.json()) as { choices?: Array<{ message?: { content?: string | null } }> };
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }

  private fallback(input: LegalStudyAgentInsightInput): Promise<LegalStudyAgentLLMInsight> {
    return (this.config.fallback ?? new DeterministicAgentInsightProvider()).generateInsight(input);
  }
}

export function createDefaultAgentInsightProvider(): LegalStudyAgentInsightProvider | undefined {
  const provider = process.env.LEGAL_STUDY_AGENT_INSIGHT_PROVIDER?.trim().toLowerCase();
  if (provider !== 'deepseek') return undefined;
  return new DeepSeekAgentInsightProvider({
    baseUrl: process.env.DEEPSEEK_BASE_URL,
    model: process.env.DEEPSEEK_AGENT_MODEL ?? process.env.DEEPSEEK_CARD_MODEL,
    timeoutMs: numberEnv('DEEPSEEK_AGENT_TIMEOUT_MS') ?? 45000,
    fallback: new DeterministicAgentInsightProvider(),
  });
}

function buildInsightPromptPayload(input: LegalStudyAgentInsightInput) {
  const proposal = input.proposal;
  const snapshot = input.snapshot;
  const taskLookup = new Map(proposal.afterPlans?.flatMap((plan) => plan.tasks.map((task) => [task.id, task])) ?? []);
  return {
    intent: input.intent,
    userInstruction: input.userInstruction,
    examDate: snapshot.examDate,
    availableMinutesToday: snapshot.availableMinutesToday,
    rejectedProposalFingerprints: snapshot.rejectedProposalFingerprints.slice(-5),
    proposal: {
      id: proposal.id,
      status: proposal.status,
      validation: proposal.validation,
      risks: proposal.risks.slice(0, 8),
      summary: proposal.summary,
      planningWindow: proposal.planningWindow,
      drivers: proposal.explanation.drivers,
      timeComparison: proposal.explanation.timeComparison,
      tasks: (proposal.afterPlans ?? [proposal.afterPlan]).map((plan) => ({
        date: plan.date,
        availableMinutes: plan.availableMinutes,
        tasks: plan.tasks.map((task) => describeTask(task, snapshot)),
      })),
      lockedTaskIds: Array.from(taskLookup.values()).filter((task) => task.lockedByUser).map((task) => task.id),
    },
    pressure: {
      dueReviewCount: snapshot.reviewStates.length,
      unlockedNewCards: snapshot.cards.filter((card) => card.unlockStatus === 'unlocked').length,
      remainingCourseMinutes: snapshot.episodes
        .filter((episode) => episode.status !== 'completed')
        .reduce((sum, episode) => sum + episode.durationMinutes, 0),
    },
  };
}

function describeTask(task: LegalStudyDailyPlanTask, snapshot: LegalStudyLearningSnapshot) {
  const subject = snapshot.subjects.find((item) => item.id === task.subjectId);
  const label =
    task.kind === 'course_episode'
      ? snapshot.episodes.find((episode) => episode.id === task.refId)?.title
      : task.kind === 'new_card' || task.kind === 'due_review'
        ? snapshot.cards.find((card) => card.id === task.refId)?.front
        : undefined;
  return {
    id: task.id,
    kind: task.kind,
    label: label ?? task.refId,
    subject: subject?.name ?? task.subjectId,
    estimatedMinutes: task.estimatedMinutes,
    lockedByUser: Boolean(task.lockedByUser),
  };
}

function parseInsight(content: string, provider: string, generatedAt: string): LegalStudyAgentLLMInsight | undefined {
  try {
    const parsed = JSON.parse(content) as {
      personalization?: unknown;
      tradeoffs?: unknown;
      suggestedModifications?: unknown;
      caveats?: unknown;
    };
    return {
      provider,
      generatedAt,
      personalization: stringValue(parsed.personalization, 'DeepSeek 已生成计划解释，但未返回个性化摘要。'),
      tradeoffs: stringArray(parsed.tradeoffs).slice(0, 6),
      suggestedModifications: parseSuggestions(parsed.suggestedModifications).slice(0, 5),
      caveats: stringArray(parsed.caveats).slice(0, 4),
    };
  } catch {
    return undefined;
  }
}

function parseSuggestions(value: unknown): LegalStudyAgentLLMInsight['suggestedModifications'] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)))
    .map((item, index) => ({
      id: `llm-suggestion-${index + 1}`,
      title: stringValue(item.title, `建议 ${index + 1}`),
      rationale: stringValue(item.rationale, 'DeepSeek 建议人工检查该调整。'),
      expectedImpact: stringValue(item.expectedImpact, '需要用户确认后才能写入计划。'),
      targetDate: typeof item.targetDate === 'string' ? item.targetDate : undefined,
      affectedTaskIds: Array.isArray(item.affectedTaskIds)
        ? item.affectedTaskIds.filter((id): id is string => typeof id === 'string')
        : undefined,
      requiresHumanConfirmation: true,
    }));
}

function buildFallbackSuggestions(
  proposal: LegalStudyPlanProposal,
  overloadedDays: Array<{ date: string; afterMinutes: number; availableMinutes: number }>
): LegalStudyAgentLLMInsight['suggestedModifications'] {
  const suggestions: LegalStudyAgentLLMInsight['suggestedModifications'] = [];
  if (overloadedDays.length > 0) {
    suggestions.push({
      id: 'fallback-reduce-load',
      title: '压低接近满载日期的新卡释放',
      rationale: `${overloadedDays[0].date} 已接近日容量上限，适合把可延后的新卡移到后一天。`,
      expectedImpact: '降低当日执行风险，但可能让后续新卡节奏略慢。',
      targetDate: overloadedDays[0].date,
      requiresHumanConfirmation: true,
    });
  }
  if (proposal.risks.length > 0) {
    suggestions.push({
      id: 'fallback-course-risk',
      title: '给高风险课程保留连续时间块',
      rationale: '课程 deadline 风险高时，碎片化安排容易造成后续积压。',
      expectedImpact: '提升课程推进确定性，但会挤占部分新卡学习时间。',
      requiresHumanConfirmation: true,
    });
  }
  return suggestions;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function numberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

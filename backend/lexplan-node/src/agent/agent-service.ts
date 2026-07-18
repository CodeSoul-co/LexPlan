import {
  applyAcceptedProposal,
  draftPlanProposal,
  recordRejectedProposal,
  validatePlanProposal,
  validateRollingPlanProposal,
} from './proposal';
import { computeReviewPressure } from '../review/fsrs-lite';
import { computeCoursePressure } from '../scheduling/pressure';
import type { LegalStudyRepository } from '../repositories/legal-study-repository';
import type { LegalStudyAgentInsightProvider } from './llm-insight';
import type {
  LegalStudyCoursePressure,
  LegalStudyDailyPlan,
  LegalStudyPlanProposal,
  LegalStudyProposalDecision,
  LegalStudyReviewPressure,
} from '../types';

export interface LegalStudyProposalStore {
  list(): Promise<LegalStudyPlanProposal[]>;
  get(proposalId: string): Promise<LegalStudyPlanProposal | undefined>;
  upsert(proposal: LegalStudyPlanProposal): Promise<LegalStudyPlanProposal>;
  replaceAll(proposals: LegalStudyPlanProposal[]): Promise<void>;
}

export interface LegalStudyAgentRiskDashboard {
  date: string;
  coursePressure: LegalStudyCoursePressure[];
  reviewPressure: LegalStudyReviewPressure;
  activeProposal?: LegalStudyPlanProposal;
}

export interface DraftLegalStudyAgentProposalInput {
  date: string;
  now?: string;
  windowDays?: number;
}

export interface ModifyLegalStudyAgentProposalInput {
  proposalId: string;
  afterPlan: LegalStudyDailyPlan;
  summary?: string;
  reason?: string;
  now?: string;
  windowDays?: number;
}

export interface DecideLegalStudyAgentProposalInput {
  proposalId: string;
  decision: Exclude<LegalStudyProposalDecision, 'pending'>;
  reason?: string;
  decidedAt?: string;
}

export interface LegalStudyAgentProposalFilter {
  status?: LegalStudyProposalDecision;
}

export class InMemoryLegalStudyProposalStore implements LegalStudyProposalStore {
  private proposals: LegalStudyPlanProposal[];

  constructor(proposals: LegalStudyPlanProposal[] = []) {
    this.proposals = clone(proposals);
  }

  async list(): Promise<LegalStudyPlanProposal[]> {
    return clone(this.proposals).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt));
  }

  async get(proposalId: string): Promise<LegalStudyPlanProposal | undefined> {
    const proposal = this.proposals.find((candidate) => candidate.id === proposalId);
    return proposal ? clone(proposal) : undefined;
  }

  async upsert(proposal: LegalStudyPlanProposal): Promise<LegalStudyPlanProposal> {
    const next = clone(proposal);
    const index = this.proposals.findIndex((candidate) => candidate.id === next.id);
    if (index === -1) {
      this.proposals.push(next);
    } else {
      this.proposals[index] = next;
    }
    return clone(next);
  }

  async replaceAll(proposals: LegalStudyPlanProposal[]): Promise<void> {
    this.proposals = clone(proposals);
  }
}

export interface LegalStudyAgentServiceOptions {
  insightProvider?: LegalStudyAgentInsightProvider;
}

export class LegalStudyAgentService {
  constructor(
    private readonly repository: LegalStudyRepository,
    private readonly proposalStore: LegalStudyProposalStore,
    private readonly options: LegalStudyAgentServiceOptions = {}
  ) {}

  async getRiskDashboard(date: string): Promise<LegalStudyAgentRiskDashboard> {
    const snapshot = await this.repository.getSnapshot();
    const proposals = await this.proposalStore.list();
    return {
      date,
      coursePressure: computeCoursePressure(snapshot, date),
      reviewPressure: computeReviewPressure(snapshot, date),
      activeProposal: proposals.find(
        (proposal) => proposal.beforePlan.date === date && proposal.status === 'pending'
      ),
    };
  }

  async listProposals(filter: LegalStudyAgentProposalFilter = {}): Promise<LegalStudyPlanProposal[]> {
    const proposals = await this.proposalStore.list();
    return filter.status ? proposals.filter((proposal) => proposal.status === filter.status) : proposals;
  }

  async draftProposal(input: DraftLegalStudyAgentProposalInput): Promise<LegalStudyPlanProposal> {
    const snapshot = await this.repository.getSnapshot();
    const proposal = draftPlanProposal({
      snapshot,
      date: input.date,
      now: input.now,
      windowDays: input.windowDays,
    });
    return this.proposalStore.upsert(await this.enrichProposal(snapshot, proposal, 'draft', undefined, input.now));
  }

  async modifyProposal(input: ModifyLegalStudyAgentProposalInput): Promise<LegalStudyPlanProposal> {
    const now = input.now ?? new Date().toISOString();
    const proposal = await this.requireProposal(input.proposalId);
    const snapshot = await this.repository.getSnapshot();
    const afterPlans = replacePlanByDate(proposal.afterPlans ?? [proposal.afterPlan], input.afterPlan);
    const beforePlans = proposal.beforePlans ?? [proposal.beforePlan];
    const validation = validateRollingPlanProposal(snapshot, beforePlans, afterPlans);
    const modified: LegalStudyPlanProposal = {
      ...proposal,
      status: 'pending',
      generatedAt: now,
      summary: input.summary ?? '用户已手动修改 Agent 计划提案，等待确认应用。',
      afterPlan: input.afterPlan,
      afterPlans,
      validation,
      changes: [
        ...proposal.changes,
        {
          type: 'move_task',
          reason: input.reason ?? '用户手动调整计划内容。',
          before: proposal.afterPlan,
          after: input.afterPlan,
        },
      ],
      explanation: {
        ...proposal.explanation,
        impact: validation.valid
          ? `用户修改后的计划预计用时 ${sumMinutes(input.afterPlan)} 分钟。`
          : `用户修改后的计划存在 ${validation.violations.length} 个硬约束冲突。`,
      },
    };
    return this.proposalStore.upsert(await this.enrichProposal(snapshot, modified, 'modify', input.reason, now));
  }

  async decideProposal(input: DecideLegalStudyAgentProposalInput): Promise<LegalStudyPlanProposal> {
    const decidedAt = input.decidedAt ?? new Date().toISOString();
    const proposal = await this.requireProposal(input.proposalId);
    let decidedProposal: LegalStudyPlanProposal = {
      ...proposal,
      status: input.decision,
    };

    if (input.decision === 'accepted') {
      await this.repository.updateSnapshot((snapshot) =>
        applyAcceptedProposal(snapshot, { ...proposal, status: 'pending' }, decidedAt)
      );
    }

    if (input.decision === 'modified') {
      if (!proposal.validation.valid) {
        throw new Error('Cannot apply an invalid modified legal-study plan proposal.');
      }
      await this.applyPlans(proposal.afterPlans ?? [proposal.afterPlan], decidedAt);
    }

    if (input.decision === 'rejected') {
      await this.repository.updateSnapshot((snapshot) =>
        recordRejectedProposal(snapshot, proposal, decidedAt)
      );
    }

    if (input.decision === 'undone') {
      await this.applyPlans(proposal.beforePlans ?? [proposal.beforePlan], decidedAt);
      decidedProposal = {
        ...decidedProposal,
        summary: input.reason ?? '已撤销该 Agent 调整，恢复到提案生成前的计划。',
      };
    }

    return this.proposalStore.upsert(decidedProposal);
  }

  private async enrichProposal(
    snapshot: Awaited<ReturnType<LegalStudyRepository['getSnapshot']>>,
    proposal: LegalStudyPlanProposal,
    intent: 'draft' | 'modify',
    userInstruction?: string,
    now?: string
  ): Promise<LegalStudyPlanProposal> {
    const provider = this.options.insightProvider;
    if (!provider) return proposal;
    const llmInsight = await provider.generateInsight({ snapshot, proposal, intent, userInstruction, now });
    return {
      ...proposal,
      summary: llmInsight.personalization || proposal.summary,
      explanation: {
        ...proposal.explanation,
        impact: llmInsight.personalization || proposal.explanation.impact,
        drivers: Array.from(new Set([...(proposal.explanation.drivers ?? []), ...llmInsight.tradeoffs])),
        llmInsight,
      },
    };
  }
  private async requireProposal(proposalId: string): Promise<LegalStudyPlanProposal> {
    const proposal = await this.proposalStore.get(proposalId);
    if (!proposal) {
      throw new Error(`Proposal not found: ${proposalId}`);
    }
    return proposal;
  }

  private async applyPlans(plans: LegalStudyDailyPlan[], appliedAt: string): Promise<void> {
    const planIds = new Set(plans.map((plan) => plan.id));
    const planDates = new Set(plans.map((plan) => plan.date));
    await this.repository.updateSnapshot((snapshot) => ({
      ...snapshot,
      capturedAt: appliedAt,
      plans: [
        ...snapshot.plans.filter((candidate) => !planIds.has(candidate.id) && !planDates.has(candidate.date)),
        ...plans.map((plan) => ({ ...plan, updatedAt: appliedAt })),
      ],
    }));
  }
}

function replacePlanByDate(plans: LegalStudyDailyPlan[], nextPlan: LegalStudyDailyPlan): LegalStudyDailyPlan[] {
  const replaced = plans.map((plan) => (plan.date === nextPlan.date ? nextPlan : plan));
  return replaced.some((plan) => plan.date === nextPlan.date) ? replaced : [...replaced, nextPlan];
}

function sumMinutes(plan: LegalStudyDailyPlan): number {
  return plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

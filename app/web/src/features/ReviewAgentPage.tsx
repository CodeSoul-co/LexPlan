import { BrainCircuit, CheckCircle2, Gauge, Sparkles } from 'lucide-react';
import type { DueReviewEntry, LegalStudyCard, LegalStudyProposal, LegalStudyRuntimeState } from '../api/legalStudyClient';
import { EmptyState, PanelHeader, StatusPill, SummaryTile } from '../components/ui';

export function ReviewAgentPage({
  runtime,
  dueReviews,
  newCards,
  learnedCards,
  proposal,
  windowDays,
  setWindowDays,
  onLearn,
  onReview,
  onDraft,
  onDecision,
}: {
  runtime?: LegalStudyRuntimeState;
  dueReviews: DueReviewEntry[];
  newCards: LegalStudyCard[];
  learnedCards: LegalStudyCard[];
  proposal?: LegalStudyProposal;
  windowDays: number;
  setWindowDays: (value: number) => void;
  onLearn: (cardId: string) => void;
  onReview: (cardId: string, rating: 'again' | 'hard' | 'good' | 'easy') => void;
  onDraft: () => void;
  onDecision: (decision: 'accepted' | 'modified' | 'rejected' | 'undone') => void;
}) {
  const dueMinutes = dueReviews.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const planCount = runtime?.snapshot.plans.length ?? 0;

  return (
    <>
      <PanelHeader icon={BrainCircuit} title="复习与 Agent" />
      <div className="hero-band agent-hero">
        <div>
          <span className="hero-kicker">记忆调度 · 动态学习计划</span>
          <h3>{proposal ? proposal.summary : '复习压力进入计划调控'}</h3>
          <p>{proposal ? proposal.explanation.impact : `当前到期复习约 ${dueMinutes} 分钟。Agent 会优先保护旧卡复习，并检查课程延期风险。`}</p>
        </div>
        <button className="text-button primary" type="button" onClick={onDraft}><Sparkles size={16} aria-hidden="true" />生成计划</button>
      </div>

      <div className="summary-strip compact-summary">
        <SummaryTile label="已解锁新卡" value={newCards.length} />
        <SummaryTile label="到期旧卡" value={dueReviews.length} />
        <SummaryTile label="复习分钟" value={dueMinutes} />
        <SummaryTile label="计划数" value={planCount} />
      </div>

      <div className="split nested review-workbench">
        <div><h3>新卡</h3><CardQueue cards={newCards.slice(0, 6)} onAction={onLearn} empty="暂无已解锁新卡" /></div>
        <div><h3>到期旧卡</h3><DueQueue entries={dueReviews.slice(0, 6)} onReview={onReview} /></div>
      </div>

      <div className="agent-console polished">
        <div className="form-row compact">
          <label htmlFor="window-days">滚动天数</label>
          <input id="window-days" type="number" min={3} max={7} value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} />
          <button className="text-button primary" type="button" onClick={onDraft}><Sparkles size={16} aria-hidden="true" />生成计划</button>
        </div>
        {proposal ? <ProposalCard proposal={proposal} onDecision={onDecision} /> : <EmptyState text="等待生成 Agent proposal。" />}
      </div>
    </>
  );
}


function AgentInsight({ insight }: { insight: NonNullable<LegalStudyProposal['explanation']['llmInsight']> }) {
  return (
    <div className="agent-insight-box">
      <div className="insight-title"><BrainCircuit size={16} aria-hidden="true" /><strong>DeepSeek 解释</strong><StatusPill tone={insight.provider.includes('deepseek') ? 'success' : 'warning'} label={insight.provider} /></div>
      <p>{insight.personalization}</p>
      {insight.tradeoffs.length ? <ul>{insight.tradeoffs.map((tradeoff) => <li key={tradeoff}>{tradeoff}</li>)}</ul> : null}
      {insight.suggestedModifications.length ? (
        <div className="suggestion-grid">
          {insight.suggestedModifications.map((item) => (
            <article className="suggestion-item" key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.rationale}</p>
              <small>{item.expectedImpact} ｜ 需人工确认</small>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
function CardQueue({ cards, onAction, empty }: { cards: LegalStudyCard[]; onAction: (cardId: string) => void; empty: string }) {
  if (!cards.length) return <EmptyState text={empty} />;
  return <div className="item-list compact-list">{cards.map((card) => <article className="list-item" key={card.id}><div><h3>{card.front}</h3><p>{cardTypeLabel(card.cardType)} ｜ {card.sourceEvidence.excerptRef}</p></div><button className="text-button" type="button" onClick={() => onAction(card.id)}>学习</button></article>)}</div>;
}

function DueQueue({ entries, onReview }: { entries: DueReviewEntry[]; onReview: (cardId: string, rating: 'again' | 'hard' | 'good' | 'easy') => void }) {
  if (!entries.length) return <EmptyState text="暂无到期旧卡" />;
  return <div className="item-list compact-list">{entries.map((entry) => <article className="list-item review-item" key={entry.cardId}><div><h3>{entry.card.front}</h3><p>到期：{entry.dueAt.slice(0, 10)} ｜ {entry.estimatedMinutes} 分钟 ｜ 稳定度 {entry.reviewState.stability ?? '-'}</p></div><div className="rating-row">{(['again', 'hard', 'good', 'easy'] as const).map((rating) => <button key={rating} className={`text-button small rating-${rating}`} type="button" onClick={() => onReview(entry.cardId, rating)}>{ratingLabel(rating)}</button>)}</div></article>)}</div>;
}

function ProposalCard({ proposal, onDecision }: { proposal: LegalStudyProposal; onDecision: (decision: 'accepted' | 'modified' | 'rejected' | 'undone') => void }) {
  return (
    <div className="proposal-box rich-proposal">
      <div className="proposal-title"><CheckCircle2 size={18} aria-hidden="true" /><strong>{proposal.validation.valid ? '计划有效' : '需要人工处理'}</strong><StatusPill tone={proposal.status === 'pending' ? 'warning' : 'success'} label={proposalStatusLabel(proposal.status)} /></div>
      <p>{proposal.summary}</p>
      <div className="time-grid">{(proposal.explanation.timeComparison ?? []).map((item) => <div key={item.date}><span>{item.date}</span><strong>{item.afterMinutes}/{item.availableMinutes}</strong><small>原 {item.beforeMinutes}</small></div>)}</div>
      {(proposal.explanation.drivers ?? []).length ? <ul>{proposal.explanation.drivers?.map((driver) => <li key={driver}>{driver}</li>)}</ul> : null}
      {proposal.explanation.llmInsight ? <AgentInsight insight={proposal.explanation.llmInsight} /> : null}
      {proposal.validation.violations.length ? <div className="validation-box danger"><Gauge size={16} aria-hidden="true" />{proposal.validation.violations.join('；')}</div> : null}
      {proposal.validation.warnings.length ? <div className="validation-box warning"><Gauge size={16} aria-hidden="true" />{proposal.validation.warnings.join('；')}</div> : null}
      <div className="action-row compact-actions">
        <button className="text-button primary" type="button" onClick={() => onDecision('accepted')}>接受建议</button>
        <button className="text-button" type="button" onClick={() => onDecision('modified')}>调整后采用</button>
        <button className="text-button" type="button" onClick={() => onDecision('rejected')}>暂不采用</button>
        <button className="text-button" type="button" onClick={() => onDecision('undone')}>撤销决定</button>
      </div>
    </div>
  );
}

function ratingLabel(rating: 'again' | 'hard' | 'good' | 'easy'): string {
  return { again: '重来', hard: '困难', good: '良好', easy: '简单' }[rating];
}

function cardTypeLabel(type: LegalStudyCard['cardType']): string {
  return { qa: '问答卡', concept: '概念卡', rule_understanding: '理解卡' }[type];
}

function proposalStatusLabel(status: LegalStudyProposal['status']): string {
  return { pending: '待确认', accepted: '已接受', modified: '已调整', rejected: '未采用', undone: '已撤销' }[status];
}

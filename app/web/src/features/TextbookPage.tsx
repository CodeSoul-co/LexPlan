import { BookOpen, CheckCircle2, Edit3, FileText, PlayCircle, Save, UploadCloud } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { LegalStudyCard, LegalStudyJob, LegalStudyRuntimeState } from '../api/legalStudyClient';
import { EmptyState, Field, MiniList, PanelHeader, Select, SkeletonPanel, StatusPill, SummaryTile } from '../components/ui';

export interface TextbookDraftState {
  subjectId: string;
  title: string;
  textbookId: string;
  fileName: string;
  filePath: string;
  fileRef: string;
  confirmCards: boolean;
}

export function TextbookPage({
  draft,
  subjects,
  runtime,
  pendingCards,
  jobs,
  loading,
  setDraft,
  onUpload,
  onIngest,
  onIngestAsync,
  onConfirmCards,
  onUpdateCard,
  onRunJob,
  onRetryJob,
  onCancelJob,
}: {
  draft: TextbookDraftState;
  subjects: Array<{ id: string; name: string }>;
  runtime?: LegalStudyRuntimeState;
  pendingCards: LegalStudyCard[];
  jobs: LegalStudyJob[];
  loading?: boolean;
  setDraft: Dispatch<SetStateAction<TextbookDraftState>>;
  onUpload: (file: File) => void;
  onIngest: () => void;
  onIngestAsync: () => void;
  onConfirmCards: () => void;
  onUpdateCard: (cardId: string, input: { front: string; back: string; status: LegalStudyCard['status'] }) => void;
  onRunJob: (jobId: string) => void;
  onRetryJob: (jobId: string) => void;
  onCancelJob: (jobId: string) => void;
}) {
  const snapshot = runtime?.snapshot;
  const latestTextbook = snapshot?.textbooks.find((textbook) => textbook.id === draft.textbookId) ?? snapshot?.textbooks.at(-1);
  const chapters = snapshot?.chapters.filter((chapter) => !latestTextbook || chapter.textbookId === latestTextbook.id) ?? [];
  const slices = snapshot?.contentSlices.filter((slice) => chapters.some((chapter) => chapter.id === slice.chapterId)) ?? [];
  const cards = snapshot?.cards.filter((card) => !latestTextbook || card.textbookId === latestTextbook.id) ?? [];
  const succeededJobs = jobs.filter((job) => job.status === 'succeeded').length;
  const [selectedCardId, setSelectedCardId] = useState<string>('');
  const selectedCard = cards.find((card) => card.id === selectedCardId) ?? cards[0];

  useEffect(() => {
    if (!selectedCardId && cards[0]) setSelectedCardId(cards[0].id);
  }, [cards, selectedCardId]);

  const cardItems = useMemo(
    () => cards.slice(0, 12).map((card) => ({
      ...card,
      chapterTitle: chapters.find((chapter) => chapter.id === card.chapterId)?.title ?? card.chapterId,
    })),
    [cards, chapters]
  );

  return (
    <>
      <PanelHeader icon={BookOpen} title="教材处理" />
      {loading && !runtime ? <SkeletonPanel rows={5} /> : null}
      <div className="hero-band textbook-hero">
        <div>
          <span className="hero-kicker">教材识别 · 章节与知识卡</span>
          <h3>{latestTextbook?.title ?? draft.title}</h3>
          <p>{cards.length ? `已识别 ${chapters.length} 个章节并生成 ${cards.length} 张卡，每张卡都保留教材页码。` : '上传教材后，LexPlan 会识别章节、提取知识点并生成待确认卡片。'}</p>
        </div>
        <div className="hero-actions">
          <button className="text-button primary" type="button" onClick={onIngest} disabled={loading}><PlayCircle size={16} aria-hidden="true" />立即识别</button>
          <button className="text-button" type="button" onClick={onIngestAsync} disabled={loading}><UploadCloud size={16} aria-hidden="true" />后台处理</button>
        </div>
      </div>

      <div className="pipeline-strip">
        <PipelineNode label="OCR" active={Boolean(latestTextbook)} done={latestTextbook?.ocrStatus === 'succeeded'} />
        <PipelineNode label="章节" active={Boolean(latestTextbook)} done={chapters.length > 0} />
        <PipelineNode label="切片" active={chapters.length > 0} done={slices.length > 0} />
        <PipelineNode label="成卡" active={slices.length > 0 || cards.length > 0} done={cards.length > 0} />
      </div>

      <div className="form-grid">
        <Field label="教材标题"><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field>
        <Field label="学科"><Select value={draft.subjectId} options={subjects} onChange={(value) => setDraft((current) => ({ ...current, subjectId: value }))} /></Field>
        <Field label="教材文件位置"><input value={draft.filePath} onChange={(event) => setDraft((current) => ({ ...current, filePath: event.target.value, fileName: event.target.value.split('/').at(-1) ?? current.fileName }))} /></Field>
        <Field label="上传教材"><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file); }} /></Field>
        <Field label="卡片确认方式"><label className="check-line"><input type="checkbox" checked={draft.confirmCards} onChange={(event) => setDraft((current) => ({ ...current, confirmCards: event.target.checked }))} /> 生成后自动确认</label></Field>
        <div className="file-badge"><FileText size={16} aria-hidden="true" /><span>{draft.fileName}</span></div>
      </div>

      <div className="action-row">
        <button className="text-button" type="button" onClick={onConfirmCards} disabled={!pendingCards.length}><CheckCircle2 size={16} aria-hidden="true" />确认全部待审卡片</button>
        <StatusPill tone={pendingCards.length ? 'warning' : 'success'} label={pendingCards.length ? `${pendingCards.length} 张待确认` : '卡片已确认'} />
      </div>

      <div className="summary-strip compact-summary">
        <SummaryTile label="章节" value={chapters.length} />
        <SummaryTile label="切片" value={slices.length} />
        <SummaryTile label="卡片" value={cards.length} />
        <SummaryTile label="成功任务" value={succeededJobs} />
      </div>

      <div className="split nested data-preview">
        <div><h3>章节结构</h3><MiniList items={chapters.map((chapter) => `${chapter.order}. ${chapter.title}`)} empty="暂无章节" /></div>
        <div>
          <h3>卡片列表</h3>
          {cardItems.length ? (
            <div className="card-list-editor">
              {cardItems.map((card) => (
                <button key={card.id} className={selectedCard?.id === card.id ? 'card-row active' : 'card-row'} type="button" onClick={() => setSelectedCardId(card.id)}>
                  <strong>{card.front}</strong>
                  <span>{card.chapterTitle} ｜ {cardStatusLabel(card.status)} ｜ {unlockStatusLabel(card.unlockStatus)}</span>
                </button>
              ))}
            </div>
          ) : <EmptyState text="暂无卡片" />}
        </div>
      </div>

      {selectedCard ? <CardDetailEditor card={selectedCard} onSave={onUpdateCard} /> : null}

      <h3 className="section-title">后台处理任务</h3>
      <div className="job-list">
        {jobs.map((job) => (
          <article className="job-item" key={job.id}>
            <div><strong>{job.type}</strong><p>{job.progress.message ?? job.id}</p><div className="progress"><span style={{ width: `${Math.min(100, Math.max(0, job.progress.percent))}%` }} /></div></div>
            <StatusPill tone={job.status === 'succeeded' ? 'success' : job.status === 'failed' || job.status === 'cancelled' ? 'danger' : 'warning'} label={`${jobStatusLabel(job.status)} ${job.progress.percent}%`} />
            <div className="row-actions"><button className="text-button small" type="button" onClick={() => onRunJob(job.id)}>运行</button><button className="text-button small" type="button" onClick={() => onRetryJob(job.id)}>重试</button><button className="text-button small" type="button" onClick={() => onCancelJob(job.id)}>取消</button></div>
          </article>
        ))}
        {!jobs.length ? <p className="muted">暂无异步任务。</p> : null}
      </div>
    </>
  );
}

function CardDetailEditor({ card, onSave }: { card: LegalStudyCard; onSave: (cardId: string, input: { front: string; back: string; status: LegalStudyCard['status'] }) => void }) {
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [status, setStatus] = useState<LegalStudyCard['status']>(card.status);

  useEffect(() => {
    setFront(card.front);
    setBack(card.back);
    setStatus(card.status);
  }, [card]);

  return (
    <section className="card-detail-editor">
      <div className="editor-title"><Edit3 size={17} aria-hidden="true" /><strong>卡片详情编辑</strong><span>{card.sourceEvidence.excerptRef}</span></div>
      <div className="form-grid two">
        <Field label="正面"><textarea value={front} onChange={(event) => setFront(event.target.value)} /></Field>
        <Field label="背面"><textarea value={back} onChange={(event) => setBack(event.target.value)} /></Field>
        <Field label="状态"><select value={status} onChange={(event) => setStatus(event.target.value as LegalStudyCard['status'])}><option value="draft">草稿</option><option value="pending_confirmation">待确认</option><option value="confirmed">已确认</option><option value="archived">已归档</option></select></Field>
        <div className="source-box"><strong>来源依据</strong><p>{card.sourceEvidence.textHash}</p><small>页码 {card.sourceEvidence.pageStart ?? '-'} - {card.sourceEvidence.pageEnd ?? '-'}</small></div>
      </div>
      <button className="text-button primary" type="button" onClick={() => onSave(card.id, { front, back, status })}><Save size={16} aria-hidden="true" />保存卡片</button>
    </section>
  );
}

function PipelineNode({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return <div className={`pipeline-node ${done ? 'done' : active ? 'active' : ''}`}><span>{done ? <CheckCircle2 size={16} aria-hidden="true" /> : null}</span><strong>{label}</strong></div>;
}

function cardStatusLabel(status: LegalStudyCard['status']): string {
  return { draft: '草稿', pending_confirmation: '待确认', confirmed: '已确认', archived: '已归档' }[status];
}

function unlockStatusLabel(status: LegalStudyCard['unlockStatus']): string {
  return { locked: '未解锁', unlocked: '待学习', learned: '已学习' }[status];
}

function jobStatusLabel(status: string): string {
  return { succeeded: '已完成', failed: '失败', cancelled: '已取消', running: '处理中', pending: '等待中', queued: '排队中' }[status] ?? status;
}

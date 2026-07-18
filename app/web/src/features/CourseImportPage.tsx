import { Activity, CheckCircle2, Clock3, GripVertical, Link2, Save, Trash2, UploadCloud } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import type { BilibiliImportPreview, ImportedEpisodeDraft } from '../api/legalStudyClient';
import { EmptyState, Field, PanelHeader, Select, StatusPill, SummaryTile } from '../components/ui';

export interface CourseDraftState {
  url: string;
  title: string;
  subjectId: string;
  deadline: string;
  preview?: BilibiliImportPreview;
  episodes: ImportedEpisodeDraft[];
  catalogJson?: string;
}

export function CourseImportPage({
  draft,
  subjects,
  setDraft,
  onPreview,
  onConfirm,
}: {
  draft: CourseDraftState;
  subjects: Array<{ id: string; name: string }>;
  setDraft: Dispatch<SetStateAction<CourseDraftState>>;
  onPreview: () => void;
  onConfirm: () => void;
}) {
  const selectedEpisodes = draft.episodes.filter((episode) => episode.selected !== false);
  const totalMinutes = selectedEpisodes.reduce((sum, episode) => sum + Number(episode.durationMinutes || 0), 0);
  const manualMode = Boolean(draft.preview?.manualEntryRequired);

  function loadCatalogJson(raw: string) {
    const parsed = parseCatalogJson(raw);
    const preview = createManualPreview({
      url: draft.url,
      title: parsed.title || draft.title || '手动录入课程',
      episodes: parsed.episodes,
      warning: '使用手动课程目录 JSON 导入。',
    });
    setDraft((current) => ({
      ...current,
      title: preview.title,
      preview,
      episodes: preview.episodes,
      catalogJson: raw,
    }));
  }

  async function uploadCatalog(file: File) {
    const raw = await file.text();
    loadCatalogJson(raw);
  }

  return (
    <>
      <PanelHeader icon={Link2} title="课程导入" />
      <div className="hero-band course-hero">
        <div>
          <span className="hero-kicker">课程目录解析</span>
          <h3>{draft.preview ? draft.preview.title : '从一条链接开始整理课程'}</h3>
          <p>{draft.preview ? `${selectedEpisodes.length} 个分P已准备好，总时长 ${totalMinutes} 分钟。确认前仍可修改。` : '粘贴 B 站课程链接，LexPlan 会先生成可编辑预览，不会直接写入。'}</p>
        </div>
        <div className="hero-actions">
          <button className="text-button primary" type="button" onClick={onPreview}><Activity size={16} aria-hidden="true" />解析课程</button>
          <button className="text-button" type="button" onClick={onConfirm} disabled={!draft.preview || !selectedEpisodes.length}><Save size={16} aria-hidden="true" />确认并导入</button>
        </div>
      </div>

      <div className="form-grid">
        <Field label="课程链接"><input placeholder="粘贴 B 站视频、合集或课程链接" value={draft.url} onChange={(event) => setDraft((current) => ({ ...current, url: event.target.value }))} /></Field>
        <Field label="课程标题"><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} /></Field>
        <Field label="学科"><Select value={draft.subjectId} options={subjects} onChange={(value) => setDraft((current) => ({ ...current, subjectId: value }))} /></Field>
        <Field label="计划完成日期"><input type="date" value={draft.deadline} onChange={(event) => setDraft((current) => ({ ...current, deadline: event.target.value }))} /></Field>
      </div>

      {draft.preview?.warnings?.length ? (
        <div className="notice warning">
          {draft.preview.warnings.map((warning) => <div key={warning}>{warning}</div>)}
        </div>
      ) : null}

      <div className="manual-catalog-box">
        <div className="manual-catalog-header">
          <div>
            <strong>无法自动解析？使用课程目录</strong>
            <p>可以粘贴或上传课程目录 JSON，LexPlan 会以同样的方式生成可编辑预览。</p>
          </div>
          {manualMode ? <StatusPill tone="warning" label="手动模式" /> : <StatusPill tone="success" label="自动优先" />}
        </div>
        <textarea
          value={draft.catalogJson ?? ''}
          onChange={(event) => setDraft((current) => ({ ...current, catalogJson: event.target.value }))}
          placeholder={'示例：\n{"title":"民法精讲","episodes":[{"title":"民法概述","durationMinutes":45,"order":1},{"title":"民法基本原则","durationMinutes":50,"order":2}]}'}
        />
        <div className="action-row compact-actions">
          <button className="text-button" type="button" onClick={() => loadCatalogJson(draft.catalogJson ?? '')}>载入目录 JSON</button>
          <label className="text-button file-action"><UploadCloud size={16} aria-hidden="true" />上传目录文件<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCatalog(file); }} /></label>
        </div>
      </div>

      {draft.preview ? (
        <>
          <div className="summary-strip compact-summary">
            <SummaryTile label="来源" value={draft.preview.provider} />
            <SummaryTile label="分P" value={selectedEpisodes.length} />
            <SummaryTile label="总时长" value={`${totalMinutes} 分钟`} />
            <SummaryTile label="解析方式" value={draft.preview.manualEntryRequired ? '手动目录' : '自动解析'} />
          </div>
          <EditableEpisodeTable episodes={draft.episodes} setEpisodes={(episodes) => setDraft((current) => ({ ...current, episodes }))} />
        </>
      ) : (
        <EmptyState text="解析课程后，分P目录会显示在这里。" />
      )}
    </>
  );
}

function EditableEpisodeTable({ episodes, setEpisodes }: { episodes: ImportedEpisodeDraft[]; setEpisodes: (episodes: ImportedEpisodeDraft[]) => void }) {
  function update(index: number, patch: Partial<ImportedEpisodeDraft>) {
    setEpisodes(episodes.map((episode, currentIndex) => currentIndex === index ? { ...episode, ...patch } : episode));
  }
  function remove(index: number) {
    update(index, { selected: false });
  }
  return (
    <div className="episode-editor">
      <div className="editor-title"><CheckCircle2 size={17} aria-hidden="true" /><strong>分P校正</strong><span>标题、顺序、时长可直接编辑</span></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>保留</th><th>顺序</th><th>标题</th><th>时长</th><th>操作</th></tr></thead>
          <tbody>
            {episodes.map((episode, index) => (
              <tr key={`${episode.sourceEpisodeId ?? episode.title}-${index}`} className={episode.selected === false ? 'muted-row' : ''}>
                <td><input type="checkbox" checked={episode.selected !== false} onChange={(event) => update(index, { selected: event.target.checked })} /></td>
                <td><div className="order-cell"><GripVertical size={14} aria-hidden="true" /><input type="number" value={episode.order} onChange={(event) => update(index, { order: Number(event.target.value) })} /></div></td>
                <td><input value={episode.title} onChange={(event) => update(index, { title: event.target.value })} /></td>
                <td><div className="duration-cell"><Clock3 size={14} aria-hidden="true" /><input type="number" min={1} value={episode.durationMinutes} onChange={(event) => update(index, { durationMinutes: Number(event.target.value) })} /></div></td>
                <td><button className="icon-button" type="button" onClick={() => remove(index)} aria-label="删除分P"><Trash2 size={16} aria-hidden="true" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function parseCatalogJson(raw: string): { title?: string; episodes: ImportedEpisodeDraft[] } {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('课程目录 JSON 不能为空。');
  const parsed = JSON.parse(trimmed) as unknown;
  const title = isRecord(parsed) && typeof parsed.title === 'string' ? parsed.title : undefined;
  const sourceEpisodes = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.episodes) ? parsed.episodes : undefined;
  if (!sourceEpisodes) throw new Error('课程目录 JSON 必须是数组，或包含 episodes 数组。');
  const episodes = sourceEpisodes
    .filter(isRecord)
    .map((episode, index) => ({
      title: typeof episode.title === 'string' && episode.title.trim() ? episode.title.trim() : `手动分P ${index + 1}`,
      order: positiveInteger(episode.order) ?? index + 1,
      durationMinutes: positiveInteger(episode.durationMinutes) ?? positiveInteger(episode.duration) ?? 1,
      sourceEpisodeId: typeof episode.sourceEpisodeId === 'string' ? episode.sourceEpisodeId : undefined,
      sourceUrl: typeof episode.sourceUrl === 'string' ? episode.sourceUrl : undefined,
      selected: episode.selected !== false,
      page: positiveInteger(episode.page),
    }));
  if (!episodes.length) throw new Error('课程目录 JSON 没有可用分P。');
  return { title, episodes };
}

function createManualPreview(input: { url: string; title: string; episodes: ImportedEpisodeDraft[]; warning: string }): BilibiliImportPreview {
  return {
    title: input.title,
    sourceUrl: input.url || 'manual://course-catalog',
    sourceKind: 'unknown',
    provider: 'bilibili.manual-entry',
    parsedAt: new Date().toISOString(),
    episodes: input.episodes.map((episode, index) => ({ ...episode, order: index + 1, selected: episode.selected !== false })),
    warnings: [input.warning],
    manualEntryRequired: true,
  };
}

function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

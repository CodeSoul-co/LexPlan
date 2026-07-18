import { CheckCircle2, ClipboardList, LinkIcon, Sparkles, Trash2, Unlock } from 'lucide-react';
import type { Dispatch, DragEvent, SetStateAction } from 'react';
import { useMemo, useState } from 'react';
import type { LegalStudyMapping, LegalStudyRuntimeState, MappingSuggestion } from '../api/legalStudyClient';
import { EmptyState, MiniList, PanelHeader, Select, SkeletonPanel, StatusPill, SummaryTile } from '../components/ui';

export interface MappingState {
  courseId: string;
  textbookId: string;
  suggestions: MappingSuggestion[];
}

export function MappingPage({
  runtime,
  mappingState,
  setMappingState,
  loading,
  onSuggest,
  onConfirm,
  onManualConfirm,
  onModifyMapping,
  onDeleteMapping,
  onUnlock,
}: {
  runtime?: LegalStudyRuntimeState;
  mappingState: MappingState;
  setMappingState: Dispatch<SetStateAction<MappingState>>;
  loading?: boolean;
  onSuggest: () => void;
  onConfirm: (suggestion: MappingSuggestion) => void;
  onManualConfirm: (episodeId: string, chapterId: string) => void;
  onModifyMapping: (mappingId: string, chapterId: string) => void;
  onDeleteMapping: (mappingId: string) => void;
  onUnlock: (episodeId: string) => void;
}) {
  const snapshot = runtime?.snapshot;
  const courses = snapshot?.courses ?? [];
  const textbooks = snapshot?.textbooks ?? [];
  const episodes = snapshot?.episodes.filter((episode) => !mappingState.courseId || episode.courseId === mappingState.courseId) ?? [];
  const chapters = snapshot?.chapters.filter((chapter) => !mappingState.textbookId || chapter.textbookId === mappingState.textbookId) ?? [];
  const mappings = snapshot?.mappings ?? [];
  const mappedEpisodeIds = new Set(mappings.map((mapping) => mapping.episodeId));
  const completedEpisodes = episodes.filter((episode) => episode.status === 'completed').length;
  const [selectedEpisodeId, setSelectedEpisodeId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const visibleMappings = useMemo(
    () => mappings.filter((mapping) => episodes.some((episode) => episode.id === mapping.episodeId) || chapters.some((chapter) => chapter.id === mapping.chapterId)),
    [chapters, episodes, mappings]
  );

  function handleEpisodeDrag(event: DragEvent, episodeId: string) {
    event.dataTransfer.setData('text/plain', episodeId);
    setSelectedEpisodeId(episodeId);
  }

  function handleChapterDrop(event: DragEvent, chapterId: string) {
    event.preventDefault();
    const episodeId = event.dataTransfer.getData('text/plain') || selectedEpisodeId;
    setSelectedChapterId(chapterId);
    if (episodeId) onManualConfirm(episodeId, chapterId);
  }

  return (
    <>
      <PanelHeader icon={ClipboardList} title="章节映射" />
      {loading && !runtime ? <SkeletonPanel rows={5} /> : null}
      <div className="hero-band mapping-hero">
        <div>
          <span className="hero-kicker">课程进度 × 教材章节</span>
          <h3>{mappingState.suggestions.length ? `${mappingState.suggestions.length} 条推荐可确认` : '课程进度驱动卡片解锁'}</h3>
          <p>{mappedEpisodeIds.size ? `已确认 ${mappedEpisodeIds.size} 个分P映射。完成课程后，对应章节卡片会自动进入学习队列。` : 'LexPlan 会推荐分P与教材章节的对应关系，人工确认后才会生效。'}</p>
        </div>
        <button className="text-button primary" type="button" onClick={onSuggest} disabled={loading}><Sparkles size={16} aria-hidden="true" />生成推荐</button>
      </div>

      <div className="form-grid two">
        <label className="field"><span>课程</span><Select value={mappingState.courseId} options={courses} onChange={(value) => setMappingState((current) => ({ ...current, courseId: value }))} /></label>
        <label className="field"><span>教材</span><Select value={mappingState.textbookId} options={textbooks} onChange={(value) => setMappingState((current) => ({ ...current, textbookId: value }))} /></label>
      </div>

      <div className="summary-strip compact-summary">
        <SummaryTile label="分P" value={episodes.length} />
        <SummaryTile label="章节" value={chapters.length} />
        <SummaryTile label="确认映射" value={mappedEpisodeIds.size} />
        <SummaryTile label="已完成" value={completedEpisodes} />
      </div>

      <section className="manual-map-console">
        <div className="editor-title"><LinkIcon size={17} aria-hidden="true" /><strong>手动建立映射</strong><span>选择分P和章节，或直接拖放完成匹配</span></div>
        <div className="form-grid two">
          <label className="field"><span>分P</span><Select value={selectedEpisodeId} options={episodes} onChange={setSelectedEpisodeId} /></label>
          <label className="field"><span>章节</span><Select value={selectedChapterId} options={chapters} onChange={setSelectedChapterId} /></label>
        </div>
        <button className="text-button primary" type="button" disabled={!selectedEpisodeId || !selectedChapterId} onClick={() => onManualConfirm(selectedEpisodeId, selectedChapterId)}><CheckCircle2 size={16} aria-hidden="true" />确认人工映射</button>
      </section>

      <div className="mapping-lanes drag-lanes">
        <div>
          <h3>课程分P</h3>
          {episodes.length ? episodes.slice(0, 12).map((episode) => (
            <button key={episode.id} draggable className={selectedEpisodeId === episode.id ? 'drag-item active' : 'drag-item'} type="button" onClick={() => setSelectedEpisodeId(episode.id)} onDragStart={(event) => handleEpisodeDrag(event, episode.id)}>
              <strong>{episode.order}. {episode.title}</strong><span>{episodeStatusLabel(episode.status)} ｜ {episode.durationMinutes} 分钟</span>
            </button>
          )) : <EmptyState text="暂无分P" />}
        </div>
        <div>
          <h3>教材章节</h3>
          {chapters.length ? chapters.slice(0, 12).map((chapter) => (
            <button key={chapter.id} className={selectedChapterId === chapter.id ? 'drop-item active' : 'drop-item'} type="button" onClick={() => setSelectedChapterId(chapter.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => handleChapterDrop(event, chapter.id)}>
              <strong>{chapter.order}. {chapter.title}</strong><span>拖入课程分P以建立映射</span>
            </button>
          )) : <EmptyState text="暂无章节" />}
        </div>
      </div>

      <h3 className="section-title">映射推荐</h3>
      <div className="suggestion-list">
        {mappingState.suggestions.slice(0, 8).map((suggestion) => {
          const alreadyMapped = mappedEpisodeIds.has(suggestion.episode.id);
          return (
            <article className="suggestion-item rich" key={`${suggestion.episode.id}-${suggestion.chapter.id}`}>
              <div className="suggestion-main">
                <div className="map-line"><strong>{suggestion.episode.title}</strong><LinkIcon size={15} aria-hidden="true" /><strong>{suggestion.chapter.title}</strong></div>
                <div className="confidence"><span style={{ width: `${Math.round(suggestion.confidence * 100)}%` }} /></div>
                <p>{suggestion.reason}</p>
              </div>
              <div className="row-actions">
                {alreadyMapped ? <StatusPill tone="success" label="已确认" /> : <button className="text-button" type="button" onClick={() => onConfirm(suggestion)}><CheckCircle2 size={16} aria-hidden="true" />确认</button>}
                <button className="text-button primary" type="button" onClick={() => onUnlock(suggestion.episode.id)}><Unlock size={16} aria-hidden="true" />完成并解锁</button>
              </div>
            </article>
          );
        })}
        {!mappingState.suggestions.length ? <p className="muted">还没有映射推荐。</p> : null}
      </div>

      <h3 className="section-title">已确认映射</h3>
      <ConfirmedMappings mappings={visibleMappings} episodes={episodes} chapters={chapters} onModify={onModifyMapping} onDelete={onDeleteMapping} />
      {!visibleMappings.length ? <MiniList items={[]} empty="暂无确认映射" /> : null}
    </>
  );
}

function ConfirmedMappings({ mappings, episodes, chapters, onModify, onDelete }: { mappings: LegalStudyMapping[]; episodes: Array<{ id: string; title: string }>; chapters: Array<{ id: string; title: string }>; onModify: (mappingId: string, chapterId: string) => void; onDelete: (mappingId: string) => void }) {
  if (!mappings.length) return null;
  return (
    <div className="confirmed-map-list">
      {mappings.slice(0, 10).map((mapping) => (
        <article className="confirmed-map-item" key={mapping.id}>
          <div><strong>{episodeTitle(episodes, mapping.episodeId)}</strong><p>{mapping.reason ?? mapping.source}</p></div>
          <Select value={mapping.chapterId} options={chapters} onChange={(chapterId) => onModify(mapping.id, chapterId)} />
          <button className="icon-button" type="button" onClick={() => onDelete(mapping.id)} aria-label="删除映射"><Trash2 size={16} aria-hidden="true" /></button>
        </article>
      ))}
    </div>
  );
}

function episodeTitle(episodes: Array<{ id: string; title: string }>, id: string): string {
  return episodes.find((episode) => episode.id === id)?.title ?? id;
}

function episodeStatusLabel(status: string): string {
  return { pending: '待学习', in_progress: '进行中', completed: '已完成', skipped: '已跳过', locked: '已锁定' }[status] ?? status;
}

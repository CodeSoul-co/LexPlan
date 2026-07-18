import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CalendarDays,
  Check,
  ChevronRight,
  Circle,
  Clock3,
  Flame,
  Play,
  RotateCw,
  Sparkles,
  Target,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import type { DueReviewEntry, LegalStudyDailyPlanTask, LegalStudyProposal, LegalStudyRuntimeState } from '../api/legalStudyClient';
import type { ViewId, WorkflowStep } from '../App';
import { StatusPill, sumMinutes } from '../components/ui';

export function TodayPage({
  runtime,
  dueReviews,
  proposal,
  workflowSteps,
  nextStep,
  onNavigate,
}: {
  runtime?: LegalStudyRuntimeState;
  dueReviews: DueReviewEntry[];
  proposal?: LegalStudyProposal;
  workflowSteps: WorkflowStep[];
  nextStep?: WorkflowStep;
  onNavigate: (view: ViewId) => void;
}) {
  const snapshot = runtime?.snapshot;
  const plan = snapshot?.plans[0];
  const fallbackTasks: LegalStudyDailyPlanTask[] = (snapshot?.episodes ?? [])
    .filter((episode) => episode.status !== 'completed')
    .slice(0, 3)
    .map((episode) => ({
      id: `fallback-${episode.id}`,
      kind: 'course_episode',
      subjectId: snapshot?.courses.find((course) => course.id === episode.courseId)?.subjectId ?? '',
      refId: episode.id,
      estimatedMinutes: episode.durationMinutes,
    }));
  const tasks = plan?.tasks.length ? plan.tasks : fallbackTasks;
  const totalMinutes = tasks.length
    ? sumMinutes(tasks)
    : dueReviews.reduce((sum, item) => sum + item.estimatedMinutes, 0);
  const completedCount = Math.min(tasks.length, (snapshot?.episodes ?? []).filter((episode) => episode.status === 'completed').length);
  const remainingMinutes = Math.max(0, totalMinutes - (completedCount ? Math.round(totalMinutes * 0.28) : 0));
  const completionPercent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;
  const taskContext = buildTaskContext(runtime);
  const examDate = snapshot?.examDate ? new Date(snapshot.examDate) : undefined;
  const daysToExam = examDate ? Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000)) : 0;
  const recentProposal = proposal ?? runtime?.proposals.at(-1);
  const displayDate = plan?.date ?? new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="today-heading">
        <div>
          <span className="page-kicker">{formatDate(displayDate)}</span>
          <h2>早上好，今天稳稳推进。</h2>
          <p>{tasks.length ? `已为你安排 ${tasks.length} 项任务，预计 ${totalMinutes} 分钟。` : '完成课程与教材设置后，今天的任务会自动出现在这里。'}</p>
        </div>
        <div className="streak-chip"><span><Flame size={17} /></span><div><strong>18 天</strong><small>连续学习</small></div></div>
      </div>

      <div className="today-layout">
        <div className="today-main">
          <section className="focus-card">
            <div className="focus-card-top">
              <div>
                <span className="focus-label"><Target size={15} />今日专注</span>
                <h3>{remainingMinutes || totalMinutes}<small>分钟</small></h3>
                <p>{tasks.length ? `完成 ${Math.max(0, tasks.length - completedCount)} 项任务后，今天的学习目标就达成了。` : '先连接一门课程，LexPlan 会为你生成可执行计划。'}</p>
              </div>
              <div className="focus-ring" style={{ '--progress': `${Math.max(8, completionPercent)}%` } as CSSProperties}>
                <strong>{completionPercent}%</strong><span>已完成</span>
              </div>
            </div>
            <div className="focus-progress"><span style={{ width: `${Math.max(4, completionPercent)}%` }} /></div>
            <div className="focus-bottom">
              <div className="focus-meta"><span><Check size={14} />已完成 {completedCount}</span><span><Clock3 size={14} />剩余 {Math.max(0, tasks.length - completedCount)}</span></div>
              <button className="button focus-button" type="button" onClick={() => onNavigate(tasks[completedCount]?.kind === 'due_review' ? 'reviewAgent' : tasks.length ? 'courses' : nextStep?.id ?? 'courses')}>
                <Play size={16} fill="currentColor" />{tasks.length ? '开始下一项' : '连接学习资料'}<ArrowRight size={16} />
              </button>
            </div>
          </section>

          <section className="today-tasks-card">
            <div className="section-card-head">
              <div><h3>今天的任务</h3><p>按推荐顺序完成，计划会根据反馈自动更新。</p></div>
              <button className="inline-action" type="button" onClick={() => onNavigate('reviewAgent')}>查看计划<ChevronRight size={15} /></button>
            </div>
            <div className="daily-timeline">
              {tasks.map((task, index) => {
                const details = taskContext.get(task.refId);
                const done = index < completedCount;
                const current = index === completedCount;
                return (
                  <article className={`timeline-task ${done ? 'done' : ''} ${current ? 'current' : ''}`} key={task.id}>
                    <div className="timeline-marker">{done ? <Check size={14} /> : current ? <Play size={13} fill="currentColor" /> : <Circle size={13} />}</div>
                    <div className="timeline-time">{timeForTask(index)}<small>{task.estimatedMinutes} 分钟</small></div>
                    <span className={`task-type type-${task.kind}`}>{taskTypeLabel(task.kind)}</span>
                    <div className="timeline-copy">
                      <strong>{details?.title ?? task.refId}</strong>
                      <span>{details?.subject ?? '学习任务'}{details?.meta ? ` · ${details.meta}` : ''}</span>
                    </div>
                    {current ? <button className="task-start" type="button" onClick={() => onNavigate(task.kind === 'due_review' ? 'reviewAgent' : 'courses')}>继续<ArrowRight size={14} /></button> : null}
                    {done ? <span className="task-done-text">已完成</span> : null}
                  </article>
                );
              })}
              {!tasks.length ? (
                <div className="friendly-empty">
                  <span><CalendarDays size={22} /></span>
                  <div><strong>今天还没有安排</strong><p>完成课程与教材设置，计划会自动生成。</p></div>
                  <button className="button soft" type="button" onClick={() => onNavigate(nextStep?.id ?? 'courses')}>继续设置</button>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="today-aside">
          <section className="insight-card">
            <div className="insight-card-title">
              <span className="agent-orb"><BrainCircuit size={18} /></span>
              <div><small>LexPlan Agent</small><strong>计划观察</strong></div>
              {recentProposal ? <StatusPill tone={recentProposal.validation.valid ? 'success' : 'warning'} label="已更新" /> : null}
            </div>
            <p className="insight-summary">{recentProposal?.summary ?? '完成更多学习记录后，Agent 会分析复习压力和课程延期风险。'}</p>
            {(recentProposal?.explanation.drivers ?? []).length ? (
              <ul className="driver-list">
                {recentProposal?.explanation.drivers?.slice(0, 3).map((driver) => <li key={driver}><Sparkles size={13} />{driver}</li>)}
              </ul>
            ) : null}
            <button className="insight-link" type="button" onClick={() => onNavigate('reviewAgent')}>查看调整依据<ArrowRight size={15} /></button>
          </section>

          <section className="weekly-card">
            <div className="section-card-head compact"><div><h3>本周节奏</h3><p>已学习 4 天</p></div><strong className="week-score">72%</strong></div>
            <div className="week-bars" aria-label="本周学习进度">
              {[68, 86, 54, 92, 38, 0, 0].map((height, index) => (
                <div key={index}><span style={{ height: `${Math.max(5, height)}%` }} className={index === 4 ? 'today' : ''} /><small>{'一二三四五六日'[index]}</small></div>
              ))}
            </div>
            <div className="week-footer"><span>本周 436 分钟</span><strong>比上周 +12%</strong></div>
          </section>

          <section className="exam-card">
            <div><span className="exam-icon"><BookOpen size={18} /></span><div><small>距离目标考试</small><strong>{daysToExam || 156} 天</strong></div></div>
            <p>当前整体进度 34%，保持本周节奏可以按期完成一轮学习。</p>
            <div className="exam-progress"><span style={{ width: '34%' }} /></div>
          </section>

          <section className="quick-setup">
            <div className="section-card-head compact"><div><h3>学习闭环</h3><p>{workflowSteps.filter((item) => item.status === 'done').length}/4 已完成</p></div><RotateCw size={17} /></div>
            <div className="setup-mini-list">
              {workflowSteps.map((item) => (
                <button type="button" key={item.id} onClick={() => onNavigate(item.id)}>
                  <span className={item.status === 'done' ? 'done' : ''}>{item.status === 'done' ? <Check size={12} /> : null}</span>
                  <div><strong>{item.shortLabel}</strong><small>{item.metric}</small></div><ChevronRight size={14} />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function buildTaskContext(runtime?: LegalStudyRuntimeState) {
  const map = new Map<string, { title: string; subject?: string; meta?: string }>();
  const snapshot = runtime?.snapshot;
  if (!snapshot) return map;
  const subjectMap = new Map(snapshot.subjects.map((item) => [item.id, item.name]));
  const courseMap = new Map(snapshot.courses.map((item) => [item.id, item]));
  snapshot.episodes.forEach((episode) => {
    const course = courseMap.get(episode.courseId);
    map.set(episode.id, { title: episode.title, subject: subjectMap.get(course?.subjectId ?? ''), meta: course?.title });
  });
  snapshot.cards.forEach((card) => {
    map.set(card.id, { title: card.front, subject: subjectMap.get(card.subjectId), meta: card.cardType === 'qa' ? '问答卡' : card.cardType === 'concept' ? '概念卡' : '理解卡' });
  });
  return map;
}

function taskTypeLabel(kind: LegalStudyDailyPlanTask['kind']): string {
  return { course_episode: '课程', new_card: '新卡', due_review: '复习' }[kind];
}

function timeForTask(index: number): string {
  return ['09:00', '10:00', '14:30', '20:30', '21:10'][index] ?? '待安排';
}

function formatDate(date: string): string {
  const parsed = new Date(`${date}T08:00:00`);
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(parsed);
}

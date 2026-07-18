import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type Tone = 'success' | 'warning' | 'danger';

export interface HistoryEntry {
  id: string;
  time: string;
  title: string;
  detail?: string;
  tone: Tone;
}

export function PanelHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return <div className="panel-header"><Icon size={18} aria-hidden="true" /><h2>{title}</h2></div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Select({ value, options, onChange }: { value: string; options: Array<{ id: string; name?: string; title?: string }>; onChange: (value: string) => void }) {
  return <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option.id} value={option.id}>{option.name ?? option.title ?? option.id}</option>)}</select>;
}

export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return <span className={`status-pill ${tone}`}>{label}</span>;
}

export function SummaryTile({ label, value }: { label: string; value: string | number }) {
  return <div className="summary-tile"><span>{label}</span><strong>{value}</strong></div>;
}

export function MiniList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  return <ul className="mini-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return <div className="empty-state"><span>{text}</span>{action}</div>;
}

export function SkeletonPanel({ rows = 4 }: { rows?: number }) {
  return <div className="skeleton-panel" aria-label="加载中">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

export function ErrorRecovery({ message, onRetry, onReset }: { message?: string; onRetry: () => void; onReset?: () => void }) {
  return (
    <div className="error-recovery">
      <strong>操作没有完成</strong>
      <p>{message || '后端暂时不可用，保留当前页面内容，可重试或重置演示数据。'}</p>
      <div className="action-row compact-actions">
        <button className="text-button primary" type="button" onClick={onRetry}>重试</button>
        {onReset ? <button className="text-button" type="button" onClick={onReset}>重置</button> : null}
      </div>
    </div>
  );
}

export function HistoryPanel({ entries }: { entries: HistoryEntry[] }) {
  if (!entries.length) return <p className="muted">暂无操作历史。</p>;
  return (
    <div className="history-list">
      {entries.slice(0, 8).map((entry) => (
        <article className="history-item" key={entry.id}>
          <StatusPill tone={entry.tone} label={entry.time} />
          <div><strong>{entry.title}</strong>{entry.detail ? <p>{entry.detail}</p> : null}</div>
        </article>
      ))}
    </div>
  );
}

export function sumMinutes(tasks: Array<{ estimatedMinutes: number }>): number {
  return tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
}

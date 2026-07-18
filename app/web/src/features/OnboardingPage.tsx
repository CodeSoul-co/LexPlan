import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, FileText, Link2, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react';
import { useState } from 'react';

export interface OnboardingProfile {
  examDate: string;
  dailyMinutes: number;
  subject: string;
  courseUrl: string;
  textbookName: string;
}

const initialProfile: OnboardingProfile = {
  examDate: '2026-12-20',
  dailyMinutes: 150,
  subject: '民法',
  courseUrl: '',
  textbookName: '',
};

export function OnboardingPage({
  onBack,
  onComplete,
  onDemo,
}: {
  onBack: () => void;
  onComplete: (profile: OnboardingProfile) => void;
  onDemo: () => void;
}) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(initialProfile);

  return (
    <div className="onboarding-page">
      <header className="onboarding-header">
        <button className="landing-brand brand-button" type="button" onClick={onBack}>
          <span className="brand-symbol"><ShieldCheck size={20} /></span>
          <span><strong>LexPlan</strong><small>建立学习空间</small></span>
        </button>
        <button className="button ghost" type="button" onClick={onDemo}><Sparkles size={16} />加载完整样例</button>
      </header>

      <main className="onboarding-shell">
        <aside className="onboarding-aside">
          <span className="section-kicker">首次设置</span>
          <h1>用三分钟，把资料变成计划。</h1>
          <p>先告诉 LexPlan 你的目标，再连接课程和教材。以后每天只需要打开“今天”。</p>
          <div className="onboarding-steps">
            <OnboardingStep number={1} current={step} title="设定目标" text="考试日期与每日时间" icon={CalendarDays} />
            <OnboardingStep number={2} current={step} title="连接课程" text="导入视频目录与进度" icon={Link2} />
            <OnboardingStep number={3} current={step} title="添加教材" text="识别章节并生成卡片" icon={BookOpen} />
          </div>
          <div className="onboarding-note"><ShieldCheck size={17} /><span>课程和卡片写入前均可人工检查。</span></div>
        </aside>

        <section className="onboarding-card">
          <div className="onboarding-card-head">
            <div><small>第 {step} 步，共 3 步</small><h2>{stepTitle(step)}</h2></div>
            <span className="step-fraction">0{step}<i>/03</i></span>
          </div>
          <div className="onboarding-progress"><span style={{ width: `${(step / 3) * 100}%` }} /></div>

          {step === 1 ? (
            <div className="onboarding-content">
              <p className="form-intro">这些信息用于估算每天的任务量，之后可以随时调整。</p>
              <div className="form-grid two">
                <label className="field"><span>目标考试日期</span><div className="input-with-icon"><CalendarDays size={17} /><input type="date" value={profile.examDate} onChange={(event) => setProfile({ ...profile, examDate: event.target.value })} /></div></label>
                <label className="field"><span>每天可用时间</span><div className="input-suffix"><input type="number" min={30} max={600} value={profile.dailyMinutes} onChange={(event) => setProfile({ ...profile, dailyMinutes: Number(event.target.value) })} /><span>分钟</span></div></label>
              </div>
              <label className="field"><span>先从哪个科目开始？</span>
                <div className="subject-options">
                  {['民法', '刑法', '法理学', '宪法学'].map((subject) => (
                    <button className={profile.subject === subject ? 'subject-option active' : 'subject-option'} type="button" key={subject} onClick={() => setProfile({ ...profile, subject })}>
                      <span>{subject}</span>{profile.subject === subject ? <Check size={15} /> : null}
                    </button>
                  ))}
                </div>
              </label>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="onboarding-content">
              <p className="form-intro">粘贴 B 站课程链接，LexPlan 会先生成可编辑预览，不会立即写入。</p>
              <label className="field"><span>课程链接</span><div className="input-with-icon"><Link2 size={17} /><input placeholder="https://www.bilibili.com/video/..." value={profile.courseUrl} onChange={(event) => setProfile({ ...profile, courseUrl: event.target.value })} /></div></label>
              <div className="sample-import-card">
                <span className="sample-icon"><Link2 size={19} /></span>
                <div><strong>也可以稍后添加</strong><p>进入工作台后可导入多个课程，并逐个校正分P。</p></div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="onboarding-content">
              <p className="form-intro">上传教材后会自动识别章节并生成待确认卡片。现在也可以先创建空白空间。</p>
              <label className="onboarding-dropzone">
                <input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(event) => setProfile({ ...profile, textbookName: event.target.files?.[0]?.name ?? '' })} />
                <span className="drop-icon"><UploadCloud size={24} /></span>
                <strong>{profile.textbookName || '拖入教材 PDF，或点击选择'}</strong>
                <p>支持 PDF、PNG、JPG，单个文件建议不超过 100 MB</p>
              </label>
              {profile.textbookName ? <div className="selected-file"><FileText size={17} /><span>{profile.textbookName}</span><Check size={16} /></div> : null}
            </div>
          ) : null}

          <div className="onboarding-actions">
            <button className="button ghost" type="button" onClick={() => step === 1 ? onBack() : setStep(step - 1)}><ArrowLeft size={16} />{step === 1 ? '返回首页' : '上一步'}</button>
            {step < 3
              ? <button className="button primary" type="button" onClick={() => setStep(step + 1)}>继续<ArrowRight size={16} /></button>
              : <button className="button primary" type="button" onClick={() => onComplete(profile)}>进入我的学习空间<ArrowRight size={16} /></button>}
          </div>
        </section>
      </main>
    </div>
  );
}

function OnboardingStep({ number, current, title, text, icon: Icon }: { number: number; current: number; title: string; text: string; icon: typeof CalendarDays }) {
  const state = current === number ? 'active' : current > number ? 'done' : '';
  return (
    <div className={`onboarding-step ${state}`}>
      <span>{current > number ? <Check size={16} /> : <Icon size={17} />}</span>
      <div><strong>{title}</strong><small>{text}</small></div>
    </div>
  );
}

function stepTitle(step: number): string {
  if (step === 1) return '设定你的学习目标';
  if (step === 2) return '连接第一门课程';
  return '添加配套教材';
}

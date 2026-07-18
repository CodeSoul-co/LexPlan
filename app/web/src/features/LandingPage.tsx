import {
  ArrowRight,
  BookOpenCheck,
  BrainCircuit,
  CalendarRange,
  Check,
  ChevronRight,
  CirclePlay,
  FileStack,
  Layers3,
  Menu,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { useState } from 'react';

export function LandingPage({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="LexPlan 首页">
          <span className="brand-symbol"><ShieldCheck size={20} aria-hidden="true" /></span>
          <span><strong>LexPlan</strong><small>法律学习规划助手</small></span>
        </a>
        <nav className={menuOpen ? 'landing-links open' : 'landing-links'} aria-label="起始页导航">
          <a href="#workflow" onClick={() => setMenuOpen(false)}>工作方式</a>
          <a href="#features" onClick={() => setMenuOpen(false)}>核心能力</a>
          <a href="#why" onClick={() => setMenuOpen(false)}>为什么 LexPlan</a>
          <button className="button ghost mobile-cta" type="button" onClick={onDemo}>查看演示</button>
        </nav>
        <div className="landing-nav-actions">
          <button className="button ghost desktop-only" type="button" onClick={onDemo}>查看演示</button>
          <button className="button primary" type="button" onClick={onStart}>开始规划<ArrowRight size={16} /></button>
          <button className="menu-button" type="button" aria-label={menuOpen ? '关闭菜单' : '打开菜单'} onClick={() => setMenuOpen((value) => !value)}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="announcement"><Sparkles size={14} /><span>为法硕备考设计的 AI 学习闭环</span><ChevronRight size={14} /></div>
            <h1>把课程和教材，变成<br /><em>每天学得完</em>的计划</h1>
            <p className="hero-lead">LexPlan 自动拆解课程、理解教材、生成知识卡，并根据复习压力动态安排每一天。你只需要专注完成今天。</p>
            <div className="hero-cta-row">
              <button className="button primary large" type="button" onClick={onStart}>制定我的学习计划<ArrowRight size={18} /></button>
              <button className="button soft large" type="button" onClick={onDemo}><CirclePlay size={18} />体验完整样例</button>
            </div>
            <div className="hero-proof">
              <span><Check size={15} />无需注册即可体验</span>
              <span><Check size={15} />所有写入均需人工确认</span>
            </div>
          </div>

          <div className="product-preview" aria-label="LexPlan 今日学习计划示例">
            <div className="preview-glow" />
            <div className="preview-window">
              <div className="preview-topbar">
                <div className="preview-brand"><span className="mini-logo"><ShieldCheck size={15} /></span><strong>今日计划</strong></div>
                <span className="demo-chip">演示样例</span>
              </div>
              <div className="preview-greeting">
                <div><small>7 月 17 日 · 星期五</small><h2>早上好，今天稳稳推进。</h2></div>
                <div className="focus-score"><strong>112</strong><span>分钟</span></div>
              </div>
              <div className="preview-progress"><span style={{ width: '68%' }} /></div>
              <div className="preview-summary"><span>今日已完成 2 / 4</span><strong>连续学习 18 天</strong></div>
              <div className="preview-tasks">
                <PreviewTask done subject="刑法" title="犯罪构成 · 到期复习" meta="8 分钟 · 已完成" />
                <PreviewTask active subject="民法" title="合同的成立：要约与承诺" meta="42 分钟 · 进行中" />
                <PreviewTask subject="民法" title="要约成立条件 · 新卡学习" meta="12 分钟" />
              </div>
              <div className="preview-agent">
                <span className="agent-orb"><BrainCircuit size={17} /></span>
                <div><strong>Agent 已为你调整计划</strong><p>旧卡优先，刑法新课后移 1 天，预计节省 38 分钟。</p></div>
                <ChevronRight size={17} />
              </div>
            </div>
          </div>
        </section>

        <section className="trust-strip" aria-label="产品能力">
          <span>课程解析</span><i />
          <span>教材 OCR</span><i />
          <span>智能成卡</span><i />
          <span>FSRS 复习</span><i />
          <span>Agent 动态计划</span>
        </section>

        <section className="landing-section workflow-section" id="workflow">
          <div className="section-heading centered">
            <span className="section-kicker">从资料到每天的行动</span>
            <h2>三步建立你的学习闭环</h2>
            <p>不再手工整理几十个表格，也不再靠意志力决定今天学什么。</p>
          </div>
          <div className="landing-steps">
            <LandingStep number="01" icon={CalendarRange} title="导入课程" text="解析课程目录与分P时长，结合考试日期形成可执行进度。" />
            <LandingStep number="02" icon={FileStack} title="理解教材" text="识别教材章节，生成带页码和原文依据的知识卡。" />
            <LandingStep number="03" icon={Target} title="完成今天" text="课程、新卡和旧卡自动汇入今日计划，按压力动态调整。" />
          </div>
        </section>

        <section className="landing-section feature-section" id="features">
          <div className="feature-story">
            <div className="section-heading">
              <span className="section-kicker">不是又一个待办清单</span>
              <h2>学习材料、记忆与时间<br />在同一套系统里协同</h2>
              <p>LexPlan 知道课程讲到哪里、教材对应哪一章、哪些知识即将遗忘，也知道你今天有多少时间。</p>
            </div>
            <ul className="check-list">
              <li><span><Check size={15} /></span><div><strong>内容有来源</strong><p>每张卡片保留教材页码和原文证据。</p></div></li>
              <li><span><Check size={15} /></span><div><strong>计划能解释</strong><p>每次调课都说明原因、影响和取舍。</p></div></li>
              <li><span><Check size={15} /></span><div><strong>关键写入需确认</strong><p>AI 提建议，你始终拥有最终决定权。</p></div></li>
            </ul>
          </div>
          <div className="feature-grid">
            <FeatureCard icon={BookOpenCheck} title="章节智能映射" text="课程分P自动匹配教材章节，完成课程后按规则解锁对应卡片。" tone="jade" />
            <FeatureCard icon={BrainCircuit} title="可解释 Agent" text="识别延期风险和复习压力，给出可修改、可拒绝的计划建议。" tone="navy" />
            <FeatureCard icon={Layers3} title="记忆压力调度" text="旧卡优先于新卡，复习节奏与课程截止日期同时纳入计划。" tone="sand" wide />
          </div>
        </section>

        <section className="landing-section comparison-section" id="why">
          <div className="comparison-card">
            <div className="comparison-copy">
              <span className="section-kicker">你的计划应该会思考</span>
              <h2>从“我应该学什么”<br />变成“下一步就做这个”</h2>
              <p>普通日历只记录任务。LexPlan 把内容进度、遗忘风险和可用时间持续连接起来。</p>
              <button className="button light" type="button" onClick={onDemo}>查看 Agent 调整示例<ArrowRight size={16} /></button>
            </div>
            <div className="comparison-list">
              <ComparisonRow label="课程延期风险" value="较低" note="距离截止 60 天" />
              <ComparisonRow label="今日复习压力" value="14 分钟" note="2 张到期旧卡" />
              <ComparisonRow label="计划利用率" value="75%" note="保留 38 分钟缓冲" />
              <ComparisonRow label="下次自动检查" value="今晚 21:00" note="根据完成情况更新" />
            </div>
          </div>
        </section>

        <section className="final-cta">
          <div>
            <span className="section-kicker">从今天开始，不再被计划拖住</span>
            <h2>把精力留给真正的学习。</h2>
          </div>
          <div className="final-cta-actions">
            <button className="button primary large" type="button" onClick={onStart}>开始制定计划<ArrowRight size={18} /></button>
            <button className="button ghost large" type="button" onClick={onDemo}>先体验样例</button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-brand"><span className="brand-symbol"><ShieldCheck size={18} /></span><span><strong>LexPlan</strong><small>法律学习规划助手</small></span></div>
        <p>课程、教材、记忆与时间的协同系统。</p>
        <span>© 2026 LexPlan</span>
      </footer>
    </div>
  );
}

function PreviewTask({ subject, title, meta, active, done }: { subject: string; title: string; meta: string; active?: boolean; done?: boolean }) {
  return (
    <div className={`preview-task ${active ? 'active' : ''} ${done ? 'done' : ''}`}>
      <span className="task-check">{done ? <Check size={13} /> : null}</span>
      <div><small>{subject}</small><strong>{title}</strong><span>{meta}</span></div>
      {active ? <button type="button" tabIndex={-1}>继续</button> : null}
    </div>
  );
}

function LandingStep({ number, icon: Icon, title, text }: { number: string; icon: typeof CalendarRange; title: string; text: string }) {
  return (
    <article className="landing-step">
      <div className="step-top"><span>{number}</span><i><Icon size={22} /></i></div>
      <h3>{title}</h3><p>{text}</p>
    </article>
  );
}

function FeatureCard({ icon: Icon, title, text, tone, wide }: { icon: typeof CalendarRange; title: string; text: string; tone: string; wide?: boolean }) {
  return (
    <article className={`feature-card ${tone} ${wide ? 'wide' : ''}`}>
      <span className="feature-icon"><Icon size={22} /></span>
      <div><h3>{title}</h3><p>{text}</p></div>
      <ChevronRight size={18} />
    </article>
  );
}

function ComparisonRow({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="comparison-row"><div><span>{label}</span><small>{note}</small></div><strong>{value}</strong></div>;
}

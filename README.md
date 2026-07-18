# LexPlan

LexPlan 是一个面向法律学习场景的智能规划平台。它把课程目录、教材内容、知识卡片和复习压力连接成一套可执行的每日学习计划，让用户从“今天应该学什么”直接进入“下一步完成什么”。

平台围绕完整学习闭环设计：

```text
导入课程
  → 识别教材
  → 生成知识卡
  → 建立课程与章节映射
  → 按学习进度解锁卡片
  → 安排新学与复习任务
  → 根据反馈动态调整计划
```

## 核心功能

### 今日学习工作台

- 汇总课程任务、新卡学习和到期复习。
- 根据可用时间给出推荐执行顺序。
- 展示当日预计用时、本周节奏和学习闭环进度。
- 支持从今日任务直接进入课程、卡片或复习流程。

### 课程导入

- 从 Bilibili 视频链接读取课程及分P信息。
- 导入前预览课程目录。
- 支持修正标题、顺序、时长和是否纳入学习计划。
- 记录课程截止日期并计算剩余学习压力。

默认使用演示数据提供方；设置 `BILIBILI_PROVIDER=real` 后可读取公开课程元数据。

### 教材识别与知识卡

- 上传 PDF、PNG、JPG 或 JPEG 教材。
- 通过独立 OCR 服务识别教材页并提取章节结构。
- 将章节拆分成可追溯的知识切片。
- 生成问答卡、概念卡和规则理解卡。
- 每张卡片保留页码、文本摘要和来源引用，便于人工校对。
- 支持批量确认卡片后再进入正式学习队列。

### 课程与教材映射

- 将课程分P与教材章节建立对应关系。
- 根据标题和内容生成映射建议及置信度。
- 支持人工确认、修改或删除映射。
- 完成课程分P后，根据已确认映射解锁相关知识卡。

### 复习与记忆调度

- 区分待学新卡和到期旧卡。
- 使用轻量 FSRS 调度稳定度、难度和下次复习时间。
- 支持 `Again`、`Hard`、`Good`、`Easy` 四档反馈。
- 计算复习压力，并将到期任务优先纳入每日计划。

### 动态计划 Agent

- 综合考试日期、课程截止日期、可用时间、新卡数量和复习压力生成滚动计划。
- 解释计划变化的原因、时间影响和风险。
- 支持确定性本地建议，也可以接入 DeepSeek 生成个性化说明。
- 所有计划写入均经过用户确认；Agent 不会绕过确认直接修改正式计划。

### 演示模式与真实数据

- 内置隔离的法律学习演示空间，可直接体验完整流程。
- 演示数据保存在浏览器本地，不会写入真实后端。
- 可以切换到真实 API，并随时重置当前学习空间。
- MongoDB 不可用时，后端会降级到内存存储。
- Redis 未配置时，异步任务会使用本地进程状态。

## 页面结构

| 页面 | 作用 |
| --- | --- |
| `/` | 产品介绍和演示入口 |
| `/onboarding` | 学习目标、课程和教材的首次设置 |
| `/app/today` | 今日学习计划与执行入口 |
| `/app/courses` | 课程解析、分P校正和导入 |
| `/app/textbooks` | 教材上传、OCR、章节和卡片校对 |
| `/app/mapping` | 课程分P与教材章节映射 |
| `/app/review` | 新卡、到期复习和动态计划 |
| `/app/settings` | 数据模式、服务状态和操作记录 |

## 技术结构

```text
LexPlan/
├── app/web/                    React + Vite 产品前端
├── backend/lexplan-node/       Express API 与学习业务运行时
├── backend/ocr-service/        PaddleOCR HTTP 服务
├── domain-pack/                LexPlan 法律学习领域定义
├── config/                     本地配置示例
├── infra/docker/               MongoDB、Redis 与 OCR 容器配置
├── skills/                     LexPlan 业务能力说明
├── hypha.lock.json             外部框架版本锁定信息
└── package.json                npm workspace 入口
```

## 必须准备 Hypha

> **LexPlan 当前依赖 Hypha 提供的运行时与工具契约。首次安装前，必须将 [CodeSoul-co/Hypha](https://github.com/CodeSoul-co/Hypha) 克隆到项目根目录的 `Hypha/`。**

`Hypha/` 是本地第三方源码目录，已被 Git 忽略，不属于 LexPlan 仓库，也不得提交到 LexPlan。

目录应当是：

```text
LexPlan/
├── Hypha/          本地克隆，不提交
├── app/
├── backend/
└── package.json
```

克隆并检查版本：

```bash
git clone -b dev-domain-merge https://github.com/CodeSoul-co/Hypha.git Hypha
npm run check:hypha
```

LexPlan 需要的 Hypha 分支和提交记录在 `hypha.lock.json`。如果检查提示提交不一致，请在 `Hypha/` 中切换到该文件记录的 commit 后再安装依赖。

## 本地运行

### 环境要求

- Node.js 20 或更高版本
- npm 10 或更高版本
- Docker Desktop 或兼容的 Docker Compose 环境
- 可选：MongoDB 7、Redis 7
- 真实教材 OCR：Python OCR 服务；Docker GPU 配置需要 NVIDIA GPU 与 Container Toolkit

### 1. 获取代码和外部依赖

```bash
git clone https://github.com/CodeSoul-co/LexPlan.git
cd LexPlan
git clone -b dev-domain-merge https://github.com/CodeSoul-co/Hypha.git Hypha
npm run check:hypha
```

### 2. 配置环境

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

最小配置可以保持默认值。需要真实 Bilibili 解析、OCR 或 DeepSeek 时，再填写对应配置。

### 3. 安装依赖

必须先克隆 `Hypha/`，再执行：

```bash
npm install
```

本项目使用 npm 和根目录的 `package-lock.json`，不要混用 pnpm 或提交 `node_modules/`。

### 4. 启动可选基础服务

只启动 MongoDB 和 Redis：

```bash
docker compose -f infra/docker/compose/docker-compose.dev.yml up -d mongo redis
```

启动 OCR 服务：

```bash
docker compose -f infra/docker/compose/docker-compose.ocr.yml up -d --build
```

OCR 默认监听 `http://127.0.0.1:8765`，健康检查地址为 `/health`，识别接口为 `/ocr`。

### 5. 启动后端和前端

终端一：

```bash
npm run dev:backend
```

终端二：

```bash
npm run dev:web
```

打开：

- Web：`http://127.0.0.1:5173`
- 后端健康检查：`http://127.0.0.1:3000/health`
- 法律学习 API：`http://127.0.0.1:3000/api/v1/legal-study`

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 后端监听端口 |
| `CORS_ORIGIN` | 允许当前来源 | Web 跨域来源 |
| `MONGODB_URI` | `mongodb://127.0.0.1:27017/lexplan` | MongoDB 连接地址 |
| `REDIS_URL` | 空 | Redis 连接地址 |
| `REDIS_OPTIONAL` | `true` | 为 `false` 时强制连接本地 Redis |
| `OCR_SERVICE_URL` | `http://127.0.0.1:8765/ocr` | OCR POST 接口 |
| `BILIBILI_PROVIDER` | `mock` | 设置为 `real` 使用公开元数据接口 |
| `DEEPSEEK_API_KEY` | 空 | DeepSeek API 密钥 |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | DeepSeek 兼容接口地址 |
| `DEEPSEEK_CARD_MODEL` | `deepseek-chat` | 知识卡生成模型 |
| `DEEPSEEK_AGENT_MODEL` | 跟随卡片模型 | 计划解释模型 |
| `LEGAL_STUDY_AGENT_INSIGHT_PROVIDER` | 本地确定性实现 | 设置为 `deepseek` 启用模型解释 |

完整的安全示例见 `.env.example`。真实密钥只能写入本地 `.env`，不得提交。

## API 概览

后端主要接口统一位于 `/api/v1/legal-study`：

- `/state`、`/reset`：读取或重置学习空间。
- `/courses/*`：课程、分P和 Bilibili 导入。
- `/files/upload`、`/textbooks/*`：教材上传与识别。
- `/cards/*`：知识卡查询、确认和修改。
- `/mappings/*`：章节映射建议与确认。
- `/reviews/*`：新卡、到期队列和复习反馈。
- `/agent/proposals/*`：计划提案、修改和人工决策。
- `/jobs/*`：异步任务查询、执行、重试和取消。
- `/tools/*`：受策略约束的工具调用和审批。
- `/capabilities`、`/status`：平台能力与依赖服务状态。

## 构建与类型检查

```bash
npm run typecheck
npm run build
```

后端构建产物位于 `backend/lexplan-node/dist/`，前端构建产物位于 `app/web/dist/`；这些目录均不提交。

## 数据与安全边界

- `Hypha/`、`node_modules/`、`.env`、`data/`、`tmp/`、日志和构建产物不会进入 Git。
- 上传文件、OCR 模型和运行时记录默认保存在 `data/`。
- API 密钥、数据库密码和令牌只能通过环境变量提供。
- 课程导入、教材处理和计划修改均保留明确的业务边界。
- 影响正式学习计划的 Agent 建议必须经过用户确认。

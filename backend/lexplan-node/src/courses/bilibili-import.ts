import type {
  ToolCallContext,
  VideoSourcePreview,
  VideoSourceProvider,
  VideoSourceRequest,
} from '@hypha/tools';

export interface BilibiliCourseImportInput {
  url: string;
  titleHint?: string;
}

export interface BilibiliImportedEpisode {
  title: string;
  order: number;
  durationMinutes: number;
  sourceEpisodeId?: string;
  sourceUrl?: string;
}

export interface ImportedEpisodeDraft extends BilibiliImportedEpisode {
  selected?: boolean;
  page?: number;
  cid?: number;
  bvid?: string;
  aid?: number;
}

export interface BilibiliImportedCourse {
  title: string;
  sourceUrl: string;
  sourceId?: string;
  sourceKind: 'video' | 'collection' | 'playlist' | 'unknown';
  episodes: BilibiliImportedEpisode[];
  importedAt: string;
}

export interface BilibiliImportPreview {
  title: string;
  sourceUrl: string;
  sourceId?: string;
  sourceKind: BilibiliImportedCourse['sourceKind'];
  provider: string;
  parsedAt: string;
  episodes: ImportedEpisodeDraft[];
  warnings: string[];
  manualEntryRequired: boolean;
}

export interface BilibiliCourseImportProvider {
  previewCourse(input: BilibiliCourseImportInput): Promise<BilibiliImportPreview>;
  importCourse(input: BilibiliCourseImportInput): Promise<BilibiliImportedCourse>;
}

export class BilibiliCourseImportError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid_url' | 'provider_unavailable' | 'parse_failed'
  ) {
    super(message);
    this.name = 'BilibiliCourseImportError';
  }
}

export interface MockBilibiliCourseImportProviderOptions {
  now?: string;
  title?: string;
  episodes?: BilibiliImportedEpisode[];
}

export class MockBilibiliCourseImportProvider
  implements BilibiliCourseImportProvider, VideoSourceProvider
{
  readonly id = 'bilibili.mock';

  constructor(private readonly options: MockBilibiliCourseImportProviderOptions = {}) {}

  async previewCourse(input: BilibiliCourseImportInput): Promise<BilibiliImportPreview> {
    const parsed = parseBilibiliCourseUrl(input.url);
    const title = this.options.title ?? input.titleHint ?? mockTitleFromSource(parsed.sourceId);
    const episodes = this.options.episodes ?? createMockEpisodes(input.url, parsed.sourceId);
    return {
      title,
      sourceUrl: input.url,
      sourceId: parsed.sourceId,
      sourceKind: parsed.sourceKind,
      provider: this.id,
      parsedAt: this.options.now ?? new Date().toISOString(),
      episodes: episodes.map((episode) => ({ ...episode, selected: true })),
      warnings: [],
      manualEntryRequired: false,
    };
  }

  async importCourse(input: BilibiliCourseImportInput): Promise<BilibiliImportedCourse> {
    return previewToImportedCourse(await this.previewCourse(input));
  }

  supports(url: string): boolean {
    return isSupportedBilibiliUrl(url);
  }

  async preview(
    request: VideoSourceRequest,
    _context?: ToolCallContext
  ): Promise<VideoSourcePreview> {
    return toVideoSourcePreview(await this.previewCourse(request));
  }
}

export interface RealBilibiliCourseImportProviderOptions {
  endpoint?: string;
  timeoutMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
}

export class RealBilibiliCourseImportProvider
  implements BilibiliCourseImportProvider, VideoSourceProvider
{
  readonly id = 'bilibili.real-public-metadata';
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => string;

  constructor(options: RealBilibiliCourseImportProviderOptions = {}) {
    this.endpoint = options.endpoint ?? process.env.BILIBILI_VIEW_API_URL ?? 'https://api.bilibili.com/x/web-interface/view';
    this.timeoutMs = options.timeoutMs ?? Number(process.env.BILIBILI_REQUEST_TIMEOUT_MS ?? 10000);
    this.userAgent = options.userAgent ?? process.env.BILIBILI_USER_AGENT ?? 'LexPlan-Agent/0.1 (+local-mvp)';
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async previewCourse(input: BilibiliCourseImportInput): Promise<BilibiliImportPreview> {
    const parsed = parseBilibiliCourseUrl(input.url);
    const query = buildViewQuery(parsed);
    if (!query) {
      throw new BilibiliCourseImportError(
        'Only public Bilibili video URLs with BV or av identifiers can be parsed automatically. Please enter episodes manually.',
        'parse_failed'
      );
    }

    const data = await this.fetchViewData(query);
    const sourceUrl = canonicalVideoUrl(data.bvid, parsed.page);
    const pages = Array.isArray(data.pages) && data.pages.length > 0
      ? data.pages
      : [{ page: 1, cid: data.cid, part: data.title, duration: data.duration }];
    const selectedPage = parsed.page;
    const filteredPages = selectedPage ? pages.filter((page) => page.page === selectedPage) : pages;
    const usablePages = filteredPages.length > 0 ? filteredPages : pages;

    return {
      title: input.titleHint?.trim() || data.title,
      sourceUrl,
      sourceId: selectedPage ? `${data.bvid}-p${selectedPage}` : data.bvid,
      sourceKind: usablePages.length > 1 || selectedPage ? 'playlist' : 'video',
      provider: this.id,
      parsedAt: this.now(),
      episodes: usablePages.map((page, index) => ({
        title: page.part || `${data.title} P${page.page ?? index + 1}`,
        order: index + 1,
        durationMinutes: secondsToMinutes(page.duration ?? data.duration),
        sourceEpisodeId: `${data.bvid}-p${page.page ?? index + 1}`,
        sourceUrl: canonicalVideoUrl(data.bvid, page.page ?? index + 1),
        selected: true,
        page: page.page ?? index + 1,
        cid: page.cid,
        bvid: data.bvid,
        aid: data.aid,
      })),
      warnings: selectedPage && filteredPages.length === 0
        ? [`Requested page ${selectedPage} was not found; all pages are shown for manual correction.`]
        : [],
      manualEntryRequired: false,
    };
  }

  async importCourse(input: BilibiliCourseImportInput): Promise<BilibiliImportedCourse> {
    return previewToImportedCourse(await this.previewCourse(input));
  }

  supports(url: string): boolean {
    return isSupportedBilibiliUrl(url);
  }

  async preview(
    request: VideoSourceRequest,
    _context?: ToolCallContext
  ): Promise<VideoSourcePreview> {
    return toVideoSourcePreview(await this.previewCourse(request));
  }

  private async fetchViewData(query: BilibiliViewQuery): Promise<BilibiliViewData> {
    const url = new URL(this.endpoint);
    if (query.bvid) url.searchParams.set('bvid', query.bvid);
    if (query.aid) url.searchParams.set('aid', String(query.aid));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': this.userAgent,
          Referer: 'https://www.bilibili.com/',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new BilibiliCourseImportError(
          `Bilibili metadata request failed with HTTP ${response.status}. Please enter the course manually.`,
          'provider_unavailable'
        );
      }
      const payload = await response.json() as BilibiliViewResponse;
      if (payload.code !== 0 || !payload.data) {
        throw new BilibiliCourseImportError(
          `Bilibili metadata parse failed: ${payload.message || payload.code}. Please enter the course manually.`,
          'parse_failed'
        );
      }
      return normalizeViewData(payload.data);
    } catch (error) {
      if (error instanceof BilibiliCourseImportError) throw error;
      throw new BilibiliCourseImportError(
        `Bilibili metadata provider is unavailable: ${error instanceof Error ? error.message : String(error)}. Please enter the course manually.`,
        'provider_unavailable'
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function toVideoSourcePreview(preview: BilibiliImportPreview): VideoSourcePreview {
  return {
    provider: preview.provider,
    sourceKind: preview.sourceKind,
    sourceId: preview.sourceId,
    canonicalUrl: preview.sourceUrl,
    title: preview.title,
    episodes: preview.episodes.map((episode) => ({
      id: episode.sourceEpisodeId,
      title: episode.title,
      order: episode.order,
      durationSeconds: episode.durationMinutes * 60,
      url: episode.sourceUrl,
      metadata: {
        page: episode.page,
        cid: episode.cid,
        bvid: episode.bvid,
        aid: episode.aid,
        selected: episode.selected,
      },
    })),
    parsedAt: preview.parsedAt,
    warnings: preview.warnings,
    manualEntryRequired: preview.manualEntryRequired,
  };
}

function isSupportedBilibiliUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith('bilibili.com') || hostname === 'b23.tv';
  } catch {
    return false;
  }
}


export function createManualBilibiliImportPreview(input: {
  url: string;
  titleHint?: string;
  warning?: string;
  now?: string;
  episodes?: ImportedEpisodeDraft[];
}): BilibiliImportPreview {
  let parsed: ReturnType<typeof parseBilibiliCourseUrl> | undefined;
  try {
    parsed = parseBilibiliCourseUrl(input.url);
  } catch {
    parsed = undefined;
  }
  return {
    title: input.titleHint?.trim() || '手动录入课程',
    sourceUrl: input.url,
    sourceId: parsed?.sourceId,
    sourceKind: parsed?.sourceKind ?? 'unknown',
    provider: 'bilibili.manual-entry',
    parsedAt: input.now ?? new Date().toISOString(),
    episodes: (input.episodes ?? []).map((episode, index) => ({
      ...episode,
      title: episode.title?.trim() || `手动分P ${index + 1}`,
      order: episode.order ?? index + 1,
      durationMinutes: episode.durationMinutes ?? 1,
      selected: episode.selected !== false,
    })),
    warnings: [
      input.warning || 'B站公开元数据解析不可用，请手动录入或粘贴课程目录 JSON。',
    ],
    manualEntryRequired: true,
  };
}
export function previewToImportedCourse(preview: BilibiliImportPreview): BilibiliImportedCourse {
  return {
    title: preview.title,
    sourceUrl: preview.sourceUrl,
    sourceId: preview.sourceId,
    sourceKind: preview.sourceKind,
    episodes: preview.episodes
      .filter((episode) => episode.selected !== false)
      .map((episode, index) => ({
        title: episode.title,
        order: episode.order ?? index + 1,
        durationMinutes: episode.durationMinutes,
        sourceEpisodeId: episode.sourceEpisodeId,
        sourceUrl: episode.sourceUrl,
      }))
      .sort((left, right) => left.order - right.order),
    importedAt: preview.parsedAt,
  };
}

export function parseBilibiliCourseUrl(url: string): {
  sourceId?: string;
  sourceKind: BilibiliImportedCourse['sourceKind'];
  bvid?: string;
  aid?: number;
  page?: number;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BilibiliCourseImportError(`Invalid Bilibili URL: ${url}`, 'invalid_url');
  }
  if (!parsed.hostname.endsWith('bilibili.com') && parsed.hostname !== 'b23.tv') {
    throw new BilibiliCourseImportError(`Unsupported Bilibili host: ${parsed.hostname}`, 'invalid_url');
  }

  const text = `${parsed.pathname}${parsed.search}`;
  const page = positiveInteger(parsed.searchParams.get('p'));
  const bv = text.match(/BV[0-9A-Za-z]+/)?.[0];
  if (bv) {
    return {
      sourceId: page ? `${bv}-p${page}` : bv,
      sourceKind: page ? 'playlist' : 'video',
      bvid: bv,
      page,
    };
  }

  const av = text.match(/av(\d+)/i);
  if (av) {
    const aid = Number(av[1]);
    return {
      sourceId: `av${aid}`,
      sourceKind: page ? 'playlist' : 'video',
      aid,
      page,
    };
  }

  const collectionId = parsed.searchParams.get('sid') ?? parsed.searchParams.get('season_id');
  if (collectionId) {
    return {
      sourceId: `collection-${collectionId}`,
      sourceKind: 'collection',
    };
  }

  return {
    sourceKind: 'unknown',
  };
}

interface BilibiliViewQuery {
  bvid?: string;
  aid?: number;
}

interface BilibiliViewResponse {
  code: number;
  message?: string;
  data?: unknown;
}

interface BilibiliViewData {
  aid?: number;
  bvid: string;
  title: string;
  duration: number;
  cid?: number;
  pages: Array<{
    cid?: number;
    page?: number;
    part?: string;
    duration?: number;
  }>;
}

function buildViewQuery(parsed: ReturnType<typeof parseBilibiliCourseUrl>): BilibiliViewQuery | undefined {
  if (parsed.bvid) return { bvid: parsed.bvid };
  if (parsed.aid) return { aid: parsed.aid };
  return undefined;
}

function normalizeViewData(data: unknown): BilibiliViewData {
  if (!isRecord(data)) {
    throw new BilibiliCourseImportError('Bilibili metadata response data must be an object.', 'parse_failed');
  }
  const bvid = stringField(data.bvid);
  const title = stringField(data.title);
  if (!bvid || !title) {
    throw new BilibiliCourseImportError('Bilibili metadata response is missing bvid or title.', 'parse_failed');
  }
  return {
    aid: numberField(data.aid),
    bvid,
    title,
    duration: numberField(data.duration) ?? 0,
    cid: numberField(data.cid),
    pages: Array.isArray(data.pages)
      ? data.pages.filter(isRecord).map((page) => ({
          cid: numberField(page.cid),
          page: numberField(page.page),
          part: stringField(page.part),
          duration: numberField(page.duration),
        }))
      : [],
  };
}

function createMockEpisodes(url: string, sourceId?: string): BilibiliImportedEpisode[] {
  const baseUrl = url.split('?')[0];
  const prefix = sourceId ?? 'mock';
  return [
    {
      title: '导学与复习框架',
      order: 1,
      durationMinutes: 35,
      sourceEpisodeId: `${prefix}-ep1`,
      sourceUrl: `${baseUrl}?p=1`,
    },
    {
      title: '核心概念精讲',
      order: 2,
      durationMinutes: 48,
      sourceEpisodeId: `${prefix}-ep2`,
      sourceUrl: `${baseUrl}?p=2`,
    },
    {
      title: '真题应用与错题提醒',
      order: 3,
      durationMinutes: 42,
      sourceEpisodeId: `${prefix}-ep3`,
      sourceUrl: `${baseUrl}?p=3`,
    },
  ];
}

function mockTitleFromSource(sourceId?: string): string {
  return sourceId ? `B站导入课程 ${sourceId}` : 'B站导入课程';
}

function canonicalVideoUrl(bvid: string, page?: number): string {
  return `https://www.bilibili.com/video/${bvid}${page ? `?p=${page}` : ''}`;
}

function secondsToMinutes(seconds: number | undefined): number {
  if (!Number.isFinite(seconds) || !seconds || seconds <= 0) return 1;
  return Math.max(1, Math.ceil(seconds / 60));
}

function positiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

import type { LegalStudyCard } from '../types';
import type { LegalStudyCardGenerationInput, LegalStudyCardGenerationProvider } from './types';

export class DeterministicCardGenerationProvider implements LegalStudyCardGenerationProvider {
  readonly id = 'card-generator.deterministic';

  async generateCards(input: LegalStudyCardGenerationInput): Promise<LegalStudyCard[]> {
    const title = input.chapter.title;
    return [
      createCard(input, 'qa', `${title}的核心考点是什么？`, summarize(input.sourceText)),
      createCard(input, 'concept', `${title}应如何分层记忆？`, `围绕“定义、构成、效果、例外”四层记忆：${summarize(input.sourceText)}`),
    ];
  }
}

export class DeepSeekCardGenerationProvider implements LegalStudyCardGenerationProvider {
  readonly id = 'card-generator.deepseek';

  constructor(
    private readonly config: {
      apiKeyEnv?: string;
      baseUrl?: string;
      model?: string;
      timeoutMs?: number;
      fallback?: LegalStudyCardGenerationProvider;
    } = {}
  ) {}

  async generateCards(input: LegalStudyCardGenerationInput): Promise<LegalStudyCard[]> {
    const apiKey = process.env[this.config.apiKeyEnv ?? 'DEEPSEEK_API_KEY'];
    if (!apiKey) {
      if (this.config.fallback) return this.config.fallback.generateCards(input);
      throw new Error('DEEPSEEK_API_KEY is required for DeepSeek card generation.');
    }
    const response = await this.callDeepSeek(input, apiKey);
    const parsed = parseDeepSeekCards(response);
    if (!parsed.length && this.config.fallback) return this.config.fallback.generateCards(input);
    return parsed.map((card, index) =>
      createCard(
        input,
        card.cardType ?? (index === 0 ? 'qa' : 'concept'),
        card.front,
        card.back,
        `deepseek-${index + 1}`
      )
    );
  }

  private async callDeepSeek(input: LegalStudyCardGenerationInput, apiKey: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 60000);
    try {
      const baseUrl = (this.config.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model ?? process.env.DEEPSEEK_CARD_MODEL ?? 'deepseek-chat',
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content:
                '你是法硕背诵卡生成器。只输出 JSON：{"cards":[{"front":"...","back":"...","cardType":"qa|concept|rule_understanding"}]}。必须忠于原文，不编造。',
            },
            {
              role: 'user',
              content: `学科：${input.subject.name}\n教材：${input.textbook.title}\n章节：${input.chapter.title}\n原文：\n${input.sourceText}`,
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`DeepSeek API returned HTTP ${response.status}: ${await response.text()}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      return data.choices?.[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timeout);
    }
  }
}

function createCard(
  input: LegalStudyCardGenerationInput,
  cardType: LegalStudyCard['cardType'],
  front: string,
  back: string,
  suffix: string = cardType
): LegalStudyCard {
  return {
    id: `card-${input.slice.id}-${suffix}`,
    userId: input.userId,
    subjectId: input.subject.id,
    textbookId: input.textbook.id,
    chapterId: input.chapter.id,
    sliceId: input.slice.id,
    front,
    back,
    cardType,
    status: 'pending_confirmation',
    unlockStatus: 'locked',
    sourceEvidence: {
      pageStart: input.slice.pageStart,
      pageEnd: input.slice.pageEnd,
      textHash: input.slice.textHash,
      excerptRef: input.slice.sourceTextRef,
    },
    createdAt: input.now,
  };
}

function summarize(text: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function parseDeepSeekCards(content: string): Array<{
  front: string;
  back: string;
  cardType?: LegalStudyCard['cardType'];
}> {
  try {
    const parsed = JSON.parse(content) as {
      cards?: Array<{ front?: unknown; back?: unknown; cardType?: unknown }>;
    };
    return (parsed.cards ?? [])
      .filter((card) => typeof card.front === 'string' && typeof card.back === 'string')
      .map((card) => ({
        front: String(card.front),
        back: String(card.back),
        cardType:
          card.cardType === 'qa' || card.cardType === 'concept' || card.cardType === 'rule_understanding'
            ? card.cardType
            : undefined,
      }));
  } catch {
    return [];
  }
}

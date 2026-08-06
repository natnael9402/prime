import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export type StorefrontLanguage = 'en' | 'am';

export interface TranslatableProductContent {
  name: string;
  shortDesc: string;
  description: string;
  features?: string[];
  requirements?: string[];
  activationSteps?: string[];
}

export interface ProductTranslation {
  name?: string;
  shortDesc?: string;
  description?: string;
  features?: string[];
  requirements?: string[];
  activationSteps?: string[];
}

export type ProductTranslations = Partial<Record<StorefrontLanguage, ProductTranslation>>;

const LANGUAGE_NAMES: Record<StorefrontLanguage, string> = {
  en: 'English',
  am: 'Amharic',
};

const EMPTY_CONTENT: Required<ProductTranslation> = {
  name: '',
  shortDesc: '',
  description: '',
  features: [],
  requirements: [],
  activationSteps: [],
};

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return (this.config.get<string>('DEEPSEEK_API_KEY') || '').trim().length > 20;
  }

  get model(): string {
    return (
      this.config.get<string>('DEEPSEEK_DEFAULT_MODEL') ||
      this.config.get<string>('DEEPSEEK_MODEL') ||
      'deepseek-chat'
    );
  }

  status() {
    return {
      configured: this.configured,
      model: this.model,
      languages: Object.entries(LANGUAGE_NAMES).map(([code, name]) => ({ code, name })),
    };
  }

  async translateProductContent(input: TranslatableProductContent): Promise<ProductTranslations> {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'DeepSeek is not configured. Set DEEPSEEK_API_KEY in backend/.env.',
      );
    }

    const source = this.sanitizeInput(input);
    if (!source.name || !source.shortDesc || !source.description) {
      throw new BadGatewayException('Title, short description, and full description are required for translation.');
    }

    try {
      const payload = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: [
              'You are a professional ecommerce localization engine for an Ethiopian digital-license store.',
              'Translate product content naturally; do not transliterate brand names, product names, plan lengths, URLs, currency codes, or technical terms unless that is the common local usage.',
              'Keep marketing copy concise, trustworthy, and mobile-friendly.',
              'Return one strict JSON object only. No markdown, comments, or explanation.',
              'The JSON shape must be:',
              '{"en":{"name":"","shortDesc":"","description":"","features":[],"requirements":[],"activationSteps":[]},"am":{...}}.',
              'Preserve array order and array lengths. English may be polished; am must be an accurate translation.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              task: 'Localize this product for the storefront languages.',
              languages: LANGUAGE_NAMES,
              source,
            }),
          },
        ],
        temperature: this.numberConfig('DEEPSEEK_TEMPERATURE', 0.2),
        max_tokens: this.numberConfig('DEEPSEEK_MAX_TOKENS', 4000),
        response_format: { type: 'json_object' },
      };

      let response = await this.requestTranslation(payload);
      let content = this.extractContent(response);

      // Some DeepSeek reasoning models spend the whole completion budget on
      // reasoning_content and return an empty final content field. Retry once
      // without response_format, then fall back to the stable chat model.
      if (!content) {
        const retryPayload: any = { ...payload, max_tokens: 6000 };
        delete retryPayload.response_format;
        response = await this.requestTranslation(retryPayload);
        content = this.extractContent(response);
      }

      if (!content && this.model !== 'deepseek-chat') {
        const fallbackPayload: any = {
          ...payload,
          model: this.config.get<string>('DEEPSEEK_FALLBACK_MODEL') || 'deepseek-chat',
          max_tokens: 6000,
        };
        response = await this.requestTranslation(fallbackPayload);
        content = this.extractContent(response);
      }

      if (!content) {
        throw new Error('DeepSeek returned an empty translation response');
      }

      return this.normalizeTranslations(this.parseJson(content), source);
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'DeepSeek translation failed';
      this.logger.warn(`DeepSeek translation failed: ${message}`);
      throw new BadGatewayException(`DeepSeek translation failed: ${message}`);
    }
  }

  private endpoint(): string {
    const configured =
      this.config.get<string>('DEEPSEEK_API_BASE_URL') ||
      this.config.get<string>('DEEPSEEK_BASE_URL') ||
      'https://api.deepseek.com';
    const base = configured.replace(/\/+$/, '');
    return base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
  }

  private requestTranslation(payload: any) {
    return axios.post(this.endpoint(), payload, {
      headers: {
        Authorization: `Bearer ${this.config.get<string>('DEEPSEEK_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      timeout: 90000,
    });
  }

  private extractContent(response: any): string {
    const message = response.data?.choices?.[0]?.message;
    if (typeof message?.content === 'string') return message.content.trim();
    if (Array.isArray(message?.content)) {
      return message.content
        .map((part: any) => (typeof part === 'string' ? part : part?.text || ''))
        .join('')
        .trim();
    }
    return String(response.data?.output_text || '').trim();
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private sanitizeInput(input: TranslatableProductContent): TranslatableProductContent {
    const text = (value: any, max = 2500) => String(value || '').trim().slice(0, max);
    const list = (value: any, maxItems = 24) =>
      Array.isArray(value)
        ? value.map((item) => text(item, 500)).filter(Boolean).slice(0, maxItems)
        : [];

    return {
      name: text(input?.name, 180),
      shortDesc: text(input?.shortDesc, 300),
      description: text(input?.description, 2500),
      features: list(input?.features),
      requirements: list(input?.requirements),
      activationSteps: list(input?.activationSteps),
    };
  }

  private parseJson(content: string): any {
    const clean = content
      .trim()
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    try {
      return JSON.parse(clean);
    } catch {
      const start = clean.indexOf('{');
      const end = clean.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(clean.slice(start, end + 1));
      }
      throw new Error('DeepSeek did not return valid JSON');
    }
  }

  private normalizeTranslations(raw: any, source: TranslatableProductContent): ProductTranslations {
    const text = (value: any, fallback = '') => {
      const clean = String(value ?? '').trim();
      return clean || fallback;
    };
    const list = (value: any, fallback: string[]) => {
      if (!Array.isArray(value)) return fallback;
      const clean = value.map((item) => String(item || '').trim()).filter(Boolean);
      return clean.length ? clean : fallback;
    };

    const englishFallback: Required<ProductTranslation> = {
      name: source.name,
      shortDesc: source.shortDesc,
      description: source.description,
      features: source.features || [],
      requirements: source.requirements || [],
      activationSteps: source.activationSteps || [],
    };

    const normalized: ProductTranslations = {};
    (Object.keys(LANGUAGE_NAMES) as StorefrontLanguage[]).forEach((lang) => {
      const row = raw?.[lang] || {};
      normalized[lang] = {
        name: text(row.name, lang === 'en' ? englishFallback.name : ''),
        shortDesc: text(row.shortDesc, lang === 'en' ? englishFallback.shortDesc : ''),
        description: text(row.description, lang === 'en' ? englishFallback.description : ''),
        features: list(row.features, lang === 'en' ? englishFallback.features : []),
        requirements: list(row.requirements, lang === 'en' ? englishFallback.requirements : []),
        activationSteps: list(row.activationSteps, lang === 'en' ? englishFallback.activationSteps : []),
      };
    });

    normalized.en = { ...EMPTY_CONTENT, ...englishFallback, ...normalized.en };
    return normalized;
  }
}

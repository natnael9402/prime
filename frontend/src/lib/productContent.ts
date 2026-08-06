import { Lang } from './i18n';

export interface ProductTranslationContent {
  name?: string;
  shortDesc?: string;
  description?: string;
  features?: string[];
  requirements?: string[];
  activationSteps?: string[];
}

export interface LocalizableProduct {
  name: string;
  shortDesc: string;
  description?: string;
  features?: string[];
  requirements?: string[];
  translations?: Partial<Record<Lang, ProductTranslationContent>>;
  activationGuide?: {
    steps?: string[];
    [key: string]: any;
  } | null;
  [key: string]: any;
}

export function localizedProductContent<T extends LocalizableProduct>(product: T, lang: Lang) {
  const translation = product.translations?.[lang] || {};
  return {
    ...product,
    name: translation.name || product.name,
    shortDesc: translation.shortDesc || product.shortDesc,
    description: translation.description || product.description || '',
    features: translation.features?.length ? translation.features : product.features || [],
    requirements: translation.requirements?.length ? translation.requirements : product.requirements || [],
    activationGuide: product.activationGuide
      ? {
          ...product.activationGuide,
          steps: translation.activationSteps?.length
            ? translation.activationSteps
            : product.activationGuide.steps || [],
        }
      : product.activationGuide,
  };
}

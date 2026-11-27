import { publicApi } from '@/api/http';

export const discountTypeLabels = {
  PERCENT: 'Процентная скидка',
  FIXED_AMOUNT: 'Фиксированная скидка',
  SPECIAL_PRICE: 'Специальная цена',
  FREE_ITEM: 'Подарок',
  OTHER: 'Другое предложение',
} satisfies Record<string, string>;

export type DiscountType = keyof typeof discountTypeLabels;

export interface CatalogOffer {
  id: string;
  conditions: string;
  discountType: DiscountType;
  discountValue: number | null;
  source: {
    type: 'WEBSITE' | 'SOCIAL_MEDIA' | 'ORGANIZATION' | 'PERSONAL_VISIT' | 'OTHER';
    url: string | null;
  } | null;
  lastVerifiedAt: string;
  validFrom: string | null;
  validUntil: string | null;
  schedule: { dayOfWeek: number; timeFrom: string; timeUntil: string }[];
}

export interface CatalogPlace {
  id: string;
  name: string;
  city: string;
  addressLine: string;
  location: { lat: number; lon: number };
  category: { code: string; name: string };
  timezone: string;
  offers: CatalogOffer[];
}

export function getPlace(placeId: string, signal?: AbortSignal): Promise<CatalogPlace> {
  return publicApi('GET', `/api/v1/catalog/places/${encodeURIComponent(placeId)}`, undefined, { signal });
}

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeZone: 'UTC' });

export function formatDiscount(type: DiscountType, value: number | null): string {
  if (value === null) return discountTypeLabels[type];
  const amount = numberFormat.format(value);
  if (type === 'PERCENT') return `Скидка ${amount}%`;
  return `${discountTypeLabels[type]}: ${amount}`;
}

export function formatValidity(from: string | null, until: string | null): string {
  if (from && until) return `${dateFormat.format(new Date(from))} — ${dateFormat.format(new Date(until))}`;
  if (from) return `с ${dateFormat.format(new Date(from))}`;
  if (until) return `до ${dateFormat.format(new Date(until))}`;
  return 'Без ограничения по датам';
}

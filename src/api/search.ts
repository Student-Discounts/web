import type { CatalogOffer, DiscountType } from '@/api/catalog';
import { publicApi } from '@/api/http';
import { pageSize, query } from '@/lib/requests';

interface SearchOffer extends Pick<CatalogOffer, 'discountType' | 'discountValue' | 'lastVerifiedAt' | 'validFrom' | 'validUntil'> {
  offerId: string;
  schedule: { daysOfWeek: number[]; intervals: { timeFrom: string; timeUntil: string }[] }[];
}

export interface SearchPlace {
  placeId: string;
  name: string;
  city: string;
  addressLine: string;
  categoryCode: string;
  categoryName: string;
  offers: SearchOffer[];
}

export interface SearchFilters {
  q: string;
  city: string;
  categoryCode: string;
  discountType: DiscountType | '';
}

export function searchPlaces(filters: SearchFilters, offset: number, signal?: AbortSignal): Promise<SearchPlace[]> {
  const params = query({
    q: filters.q.trim() || undefined,
    city: filters.city.trim() || undefined,
    categoryCode: filters.categoryCode.trim() || undefined,
    discountType: filters.discountType || undefined,
    limit: pageSize,
    offset,
  });
  return publicApi('GET', `/api/v1/search/places${params}`, undefined, { signal });
}

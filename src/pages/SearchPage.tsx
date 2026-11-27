import { lazy, Suspense, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, List, Map, MapPin, Search } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { discountTypeLabels, formatDiscount, formatValidity, type DiscountType } from '@/api/catalog';
import { searchPlaces, type SearchFilters, type SearchPlace } from '@/api/search';
import { ErrorBox, Spinner } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { pageSize, query, useRead } from '@/lib/requests';

const PlaceMap = lazy(() => import('@/components/PlaceMap').catch(() => ({
  default: function MapUnavailable() {
    return <Card className="p-5 text-sm" role="alert">Не удалось открыть карту. Места доступны в списке.</Card>;
  },
})));

function discountType(value: string): DiscountType | '' {
  return Object.hasOwn(discountTypeLabels, value) ? value as DiscountType : '';
}

function searchLink(filters: SearchFilters, offset: number, mapView: boolean) {
  return `/search${query({ ...filters, offset: offset || undefined, view: mapView ? 'map' : undefined })}`;
}

function SearchForm({ filters, onApply }: { filters: SearchFilters; onApply: (filters: SearchFilters) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();
    onApply({ q: read('q'), city: read('city'), categoryCode: read('categoryCode'), discountType: discountType(read('discountType')) });
  }

  return (
    <Card className="p-4 sm:p-6">
      <form role="search" aria-label="Фильтры поиска" onSubmit={submit} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1.2fr_auto] xl:items-end">
        <div className="min-w-0 space-y-2">
          <Label htmlFor="search-q">Что ищете?</Label>
          <Input id="search-q" name="q" type="search" defaultValue={filters.q} placeholder="Название или адрес" />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="search-city">Город</Label>
          <Input id="search-city" name="city" defaultValue={filters.city} placeholder="Любой город" />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="search-category">Код категории</Label>
          <Input id="search-category" name="categoryCode" defaultValue={filters.categoryCode} placeholder="Например, cafe" />
        </div>
        <div className="min-w-0 space-y-2">
          <Label htmlFor="search-discount">Тип скидки</Label>
          <NativeSelect id="search-discount" name="discountType" defaultValue={filters.discountType} className="w-full">
            <NativeSelectOption value="">Любой тип</NativeSelectOption>
            {Object.entries(discountTypeLabels).map(([type, label]) => (
              <NativeSelectOption key={type} value={type}>{label}</NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit" className="sm:col-span-2 sm:justify-self-start xl:col-span-1">
          <Search aria-hidden="true" /> Найти скидки
        </Button>
      </form>
    </Card>
  );
}

function ResultList({ places, returnTo, mapView }: { places: SearchPlace[]; returnTo: string; mapView: boolean }) {
  return (
    <ul aria-label="Найденные места" className={mapView ? 'grid min-w-0 gap-3' : 'grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
      {places.map((place) => (
        <li key={place.placeId} className="min-w-0">
          <Card className="h-full gap-4 p-4 sm:p-5">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Badge variant="secondary">{place.categoryName}</Badge>
                <span className="break-all text-xs text-muted-foreground">Код: {place.categoryCode}</span>
              </div>
              <h3 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">
                <Link to={`/places/${place.placeId}`} state={{ returnTo }} className="rounded-sm hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  {place.name}
                </Link>
              </h3>
              <p className="flex items-start gap-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{place.city}, {place.addressLine}</span>
              </p>
            </div>
            <ul aria-label="Предложения" className="space-y-2 border-t pt-3">
              {place.offers.map((offer) => (
                <li key={offer.offerId} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="text-sm font-medium text-primary">{formatDiscount(offer.discountType, offer.discountValue)}</span>
                  {(offer.validFrom || offer.validUntil) && (
                    <span className="text-xs text-muted-foreground">{formatValidity(offer.validFrom, offer.validUntil)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function SearchPage() {
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const filters: SearchFilters = {
    q: params.get('q')?.trim() ?? '',
    city: params.get('city')?.trim() ?? '',
    categoryCode: params.get('categoryCode')?.trim() ?? '',
    discountType: discountType(params.get('discountType') ?? ''),
  };
  const value = params.get('offset');
  const parsedOffset = value && /^\d+$/.test(value) ? Number(value) : 0;
  const offset = parsedOffset <= 2_147_483_647 ? parsedOffset : 0;
  const mapView = params.get('view') === 'map';
  const filterKey = query({ ...filters });
  const request = useRead((signal) => searchPlaces(filters, offset, signal), `${filterKey}|${offset}`);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  function applyFilters(next: SearchFilters) {
    const href = searchLink(next, 0, mapView);
    if (href === searchLink(filters, offset, mapView)) request.reload();
    else setParams(href.slice('/search'.length));
  }

  return (
    <div className="space-y-6">
      <header className="space-y-3 rounded-2xl border bg-linear-to-br from-primary/10 via-card to-card p-5 sm:p-8">
        <Badge variant="secondary"><MapPin aria-hidden="true" /> Каталог скидок</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Поиск скидок</h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Ищите студенческие скидки по названию, городу или категории. В карточке места — условия и время действия каждого предложения.
        </p>
      </header>
      <SearchForm key={filterKey} filters={filters} onApply={applyFilters} />
      <section aria-labelledby="search-results-title" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 id="search-results-title" className="text-xl font-semibold">Результаты поиска</h2>
            {request.data && request.data.length > 0 && (
              <p className="text-sm text-muted-foreground" role="status">
                Места {offset + 1}–{offset + request.data.length}{mapView && ' · карта текущей страницы'}
              </p>
            )}
          </div>
          <nav aria-label="Вид результатов" className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
            <Button asChild size="sm" variant={mapView ? 'ghost' : 'default'}>
              <Link to={searchLink(filters, offset, false)} aria-current={mapView ? undefined : 'page'}>
                <List aria-hidden="true" /> Список
              </Link>
            </Button>
            <Button asChild size="sm" variant={mapView ? 'default' : 'ghost'}>
              <Link to={searchLink(filters, offset, true)} aria-current={mapView ? 'page' : undefined}>
                <Map aria-hidden="true" /> Карта
              </Link>
            </Button>
          </nav>
        </div>
        {request.loading && <Spinner />}
        {request.error != null && (
          <div className="space-y-3">
            <ErrorBox error={request.error} />
            <Button type="button" variant="outline" onClick={request.reload}>Повторить поиск</Button>
          </div>
        )}
        {request.data?.length === 0 && (
          <Card className="gap-2 border-dashed p-6 text-center" role="status">
            <p className="font-semibold">{offset > 0 ? 'На этой странице нет мест' : 'Места не найдены'}</p>
            <p className="text-sm text-muted-foreground">{offset > 0 ? 'Вернитесь к предыдущим результатам.' : 'Попробуйте изменить запрос или убрать один из фильтров.'}</p>
          </Card>
        )}
        {request.data && request.data.length > 0 && (
          <div className={mapView ? 'grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.65fr)]' : undefined}>
            {mapView && (
              <Suspense fallback={<Card className="p-5"><Spinner /></Card>}>
                <PlaceMap places={request.data} returnTo={returnTo} />
              </Suspense>
            )}
            <ResultList places={request.data} returnTo={returnTo} mapView={mapView} />
          </div>
        )}
        {request.data && (offset > 0 || request.data.length === pageSize) && (
          <nav aria-label="Страницы результатов" className="flex flex-wrap gap-2">
            {offset > 0 ? (
              <Button asChild variant="outline">
                <Link to={searchLink(filters, Math.max(0, offset - pageSize), mapView)}><ArrowLeft aria-hidden="true" /> Предыдущая</Link>
              </Button>
            ) : <Button variant="outline" disabled><ArrowLeft aria-hidden="true" /> Предыдущая</Button>}
            {request.data.length === pageSize ? (
              <Button asChild variant="outline">
                <Link to={searchLink(filters, offset + pageSize, mapView)}>Следующая <ArrowRight aria-hidden="true" /></Link>
              </Button>
            ) : <Button variant="outline" disabled>Следующая <ArrowRight aria-hidden="true" /></Button>}
          </nav>
        )}
      </section>
    </div>
  );
}

import { ArrowLeft, ExternalLink, MapPin, Pencil, Plus } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { formatDiscount, formatValidity, getPlace, type CatalogOffer } from '@/api/catalog';
import { ApiError } from '@/api/http';
import { useAuth } from '@/auth/AuthContext';
import { ErrorBox, Spinner } from '@/components/ui';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { query, useRead } from '@/lib/requests';

const weekdayNames = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const sourceLabels = {
  WEBSITE: 'Сайт',
  SOCIAL_MEDIA: 'Социальные сети',
  ORGANIZATION: 'Организация',
  PERSONAL_VISIT: 'Личный визит',
  OTHER: 'Другой источник',
};

function externalSource(rawUrl: string | null) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function verificationFormatter(timezone: string): ((instant: string) => string) | null {
  const options = { dateStyle: 'medium', timeStyle: 'short' } as const;
  const timeZone = timezone === 'Z' || timezone === 'UT' ? 'UTC' : timezone.replace(/^(?:UTC|GMT|UT)(?=[+-])/, '');
  // Java ZoneId permits fixed offsets that older browsers cannot pass to Intl.
  const offset = /^([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(timeZone);
  if (offset) {
    const seconds = (Number(offset[2]) * 3600 + Number(offset[3]) * 60 + Number(offset[4] ?? 0)) * (offset[1] === '-' ? -1 : 1);
    const utc = new Intl.DateTimeFormat('ru-RU', { ...options, timeZone: 'UTC' });
    return (instant) => utc.format(Date.parse(instant) + seconds * 1000);
  }
  try {
    const formatter = new Intl.DateTimeFormat('ru-RU', { ...options, timeZone });
    return (instant) => formatter.format(new Date(instant));
  } catch {
    return null;
  }
}

function OfferCard({ offer, changeLink, verifiedAt }: { offer: CatalogOffer; changeLink: string | null; verifiedAt: ((instant: string) => string) | null }) {
  const sourceUrl = externalSource(offer.source?.url ?? null);
  const intervalsByDay = new Map<number, string[]>();
  for (const interval of offer.schedule) {
    const range = `${interval.timeFrom}–${interval.timeUntil}`;
    const ranges = intervalsByDay.get(interval.dayOfWeek);
    if (ranges) ranges.push(range);
    else intervalsByDay.set(interval.dayOfWeek, [range]);
  }

  return (
    <Card className="gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xl font-semibold text-primary">{formatDiscount(offer.discountType, offer.discountValue)}</h3>
        {changeLink && (
          <Button asChild size="sm" variant="outline">
            <Link to={changeLink}><Pencil aria-hidden="true" /> Предложить изменение</Link>
          </Button>
        )}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{offer.conditions}</p>
      <dl className="grid gap-4 border-t pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <dt className="font-medium">Период действия</dt>
          <dd className="text-muted-foreground">{formatValidity(offer.validFrom, offer.validUntil)}</dd>
        </div>
        <div className="space-y-1">
          <dt className="font-medium">Последняя проверка</dt>
          <dd className="text-muted-foreground">
            <time dateTime={offer.lastVerifiedAt}>{verifiedAt?.(offer.lastVerifiedAt) ?? offer.lastVerifiedAt}</time>
          </dd>
        </div>
        <div className="space-y-1">
          <dt className="font-medium">Источник</dt>
          <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            {offer.source ? sourceLabels[offer.source.type] : 'Не указан'}
            {sourceUrl && (
              <a className="inline-flex items-center gap-1 rounded-sm text-primary underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring" href={sourceUrl} target="_blank" rel="noopener noreferrer">
                Открыть источник <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            )}
          </dd>
        </div>
      </dl>
      <div className="space-y-2 text-sm">
        <h4 className="font-medium">Расписание · местное время</h4>
        {offer.schedule.length === 0 ? (
          <p className="text-muted-foreground">Весь день</p>
        ) : (
          <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {weekdayNames.map((day, index) => {
              const ranges = intervalsByDay.get(index + 1);
              return ranges && (
                <div key={day} className="rounded-md bg-muted/60 px-3 py-2">
                  <dt className="font-medium">{day}</dt>
                  <dd className="text-muted-foreground">{ranges.join(', ')}</dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </Card>
  );
}

export function PlacePage() {
  const { placeId = '' } = useParams<'placeId'>();
  const { state } = useLocation();
  const { user, hasRole } = useAuth();
  const request = useRead((signal) => getPlace(placeId, signal), placeId);
  const place = request.data;
  const from = (state as { returnTo?: unknown } | null)?.returnTo;
  const returnTo = typeof from === 'string' && /^\/search(?:[?#]|$)/.test(from) ? from : '/search';
  const notFound = request.error instanceof ApiError && request.error.status === 404;
  const canSuggest = !user || hasRole('STUDENT', 'ORG_REPRESENTATIVE');
  const verifiedAt = place ? verificationFormatter(place.timezone) : null;

  return (
    <div className="space-y-5">
      <Button asChild variant="ghost" className="-ml-2">
        <Link to={returnTo}><ArrowLeft aria-hidden="true" /> К результатам поиска</Link>
      </Button>
      {request.loading && <Spinner />}
      {notFound ? (
        <Card className="gap-2 p-6" role="status">
          <h1 className="text-xl font-semibold">Место больше не доступно</h1>
          <p className="text-sm text-muted-foreground">В каталоге нет публичной карточки для этого места.</p>
        </Card>
      ) : request.error != null && (
        <div className="space-y-3">
          <ErrorBox error={request.error} />
          <Button variant="outline" onClick={request.reload}>Повторить загрузку</Button>
        </div>
      )}
      {place && (
        <>
          <header className="space-y-4 rounded-2xl border bg-linear-to-br from-primary/10 via-card to-card p-5 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{place.category.name}</Badge>
              <span className="break-all text-xs text-muted-foreground">Код: {place.category.code}</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{place.name}</h1>
            <p className="flex items-start gap-2 text-muted-foreground [overflow-wrap:anywhere]">
              <MapPin className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <span>{place.city}, {place.addressLine}</span>
            </p>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <div className="space-y-1">
                <dt className="font-medium">Координаты (широта, долгота)</dt>
                <dd className="text-muted-foreground">{place.location.lat}, {place.location.lon}</dd>
              </div>
              <div className="space-y-1">
                <dt className="font-medium">Часовой пояс</dt>
                <dd className="text-muted-foreground">{place.timezone}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button asChild variant="outline">
                <a href={`https://www.openstreetmap.org/?mlat=${place.location.lat}&mlon=${place.location.lon}#map=17/${place.location.lat}/${place.location.lon}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden="true" /> Открыть в OpenStreetMap
                </a>
              </Button>
              {canSuggest && (
                <Button asChild>
                  <Link to={`/submissions/new${query({ placeId: place.id })}`}><Plus aria-hidden="true" /> Предложить новую скидку</Link>
                </Button>
              )}
            </div>
          </header>
          <section aria-labelledby="place-offers-title" className="space-y-3">
            <h2 id="place-offers-title" className="text-2xl font-semibold tracking-tight">Предложения</h2>
            <ul className="space-y-3">
              {place.offers.map((offer) => (
                <li key={offer.id}>
                  <OfferCard
                    offer={offer}
                    changeLink={canSuggest ? `/submissions/new${query({ placeId: place.id, offerId: offer.id })}` : null}
                    verifiedAt={verifiedAt}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

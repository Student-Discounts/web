import type { ReactNode } from 'react';
import { discountLabels, sourceLabels, type DraftPayload, type DraftPlace } from '@/api/submissions';
import { PrivateAttachment } from '@/components/PrivateAttachment';

function Fact({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="break-words whitespace-pre-wrap">{children ?? '—'}</dd>
    </div>
  );
}

function sourceUrl(url: string) {
  try {
    const address = new URL(url);
    if (address.protocol === 'https:' || address.protocol === 'http:') return address.href;
  } catch {
    // A historical source may not be a navigable URL; show it only as text.
  }
}

export const weekdays = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

export function PlaceSnapshot({ place }: { place: DraftPlace | null | undefined }) {
  if (!place) return <p className="text-sm text-muted-foreground">Место не указано.</p>;
  return (
    <dl className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
      <Fact label="Название">{place.name}</Fact>
      <Fact label="Город">{place.city}</Fact>
      <Fact label="Адрес">{place.addressLine}</Fact>
      <Fact label="Код категории">{place.categoryCode}</Fact>
      <Fact label="Координаты">
        {place.location && `${place.location.lat ?? '—'}, ${place.location.lon ?? '—'}`}
      </Fact>
    </dl>
  );
}

export function SubmissionSnapshot({ payload }: { payload: DraftPayload }) {
  const { place, offers, attachments } = payload;
  return (
    <div className="grid gap-5">
      <section className="grid gap-2">
        <h3 className="font-semibold">Место</h3>
        <PlaceSnapshot place={place} />
      </section>
      <section className="grid gap-2">
        <h3 className="font-semibold">Скидки</h3>
        {!offers?.length && <p className="text-sm text-muted-foreground">Нет скидок.</p>}
        {offers?.map((offer, index) => {
          const url = offer.source?.url;
          const href = url ? sourceUrl(url) : undefined;
          return (
            <article className="min-w-0 space-y-2 rounded-md border p-3" key={offer.id ?? index}>
              <h4 className="font-medium">Скидка №{index + 1}</h4>
              <dl className="grid gap-3 sm:grid-cols-2">
                <Fact label="Условия">{offer.conditions}</Fact>
                <Fact label="Тип скидки">{offer.discountType && discountLabels[offer.discountType]}</Fact>
                <Fact label="Значение">{offer.discountValue != null ? `${offer.discountValue}${offer.discountType === 'PERCENT' ? '%' : ''}` : null}</Fact>
                <Fact label="Тип источника">{offer.source?.type && sourceLabels[offer.source.type]}</Fact>
                {url && <Fact label="Ссылка на источник">{href ? <a className="underline" href={href} target="_blank" rel="noreferrer">{url}</a> : url}</Fact>}
                {offer.source?.note && <Fact label="Примечание к источнику">{offer.source.note}</Fact>}
                <Fact label="Действует с">{offer.validFrom}</Fact>
                <Fact label="Действует по">{offer.validUntil}</Fact>
                <Fact label="Расписание">
                  {offer.schedule?.length ? (
                    <ul className="space-y-1">
                      {offer.schedule.map((interval, position) => (
                        <li key={position}>{weekdays[interval.dayOfWeek - 1]}: {interval.timeFrom}–{interval.timeUntil}</li>
                      ))}
                    </ul>
                  ) : 'Весь день'}
                </Fact>
              </dl>
            </article>
          );
        })}
      </section>
      {Boolean(attachments?.length) && (
        <section className="grid gap-2">
          <h3 className="font-semibold">Приватные вложения</h3>
          {attachments?.map((reference) => <PrivateAttachment key={reference.mediaAssetId} reference={reference} />)}
        </section>
      )}
    </div>
  );
}

import { useEffect, useId, useRef, useState } from 'react';
import { uploadMedia } from '@/api/media';
import {
  discountLabels, getLocationSuggestions, sourceLabels,
  type AttachmentReference, type Coordinates, type DraftOffer, type DraftPayload, type DraftPlace, type SubmissionType,
} from '@/api/submissions';
import { PrivateAttachment } from '@/components/PrivateAttachment';
import { PlaceSnapshot, weekdays } from '@/components/SubmissionSnapshot';
import { ErrorBox, Notice, Spinner } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { removeDraftOffer } from '@/components/submission-payload';
import { useIntent, useRead } from '@/lib/requests';

const mediaLimit = 10;
const maxFileSize = 10 * 1024 * 1024;
const purposes = { PROOF: 'Подтверждение', PHOTO: 'Фото' };
const days = Object.fromEntries(weekdays.map((day, position) => [String(position + 1), day]));

interface SubmissionFormProps {
  value: DraftPayload;
  onChange: (value: DraftPayload) => void;
  type: SubmissionType;
  correction?: boolean;
  disabled?: boolean;
  onUploadPendingChange?: (pending: boolean) => void;
}

function TextField({ label, value, onChange, type, placeholder, multiline, step, inputMode }: {
  label: string;
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  type?: 'date' | 'number';
  placeholder?: string;
  multiline?: boolean;
  step?: string;
  inputMode?: 'numeric' | 'decimal';
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea id={id} value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value)} />
      ) : (
        <Input id={id} type={type} step={step} placeholder={placeholder} inputMode={inputMode} value={value ?? ''} onChange={(event) => onChange(event.currentTarget.value)} />
      )}
    </div>
  );
}

function ChoiceField<T extends string>({ label, value, options, onChange, empty }: {
  label: string;
  value: T | '';
  options: Record<T, string>;
  onChange: (value: T | '') => void;
  empty?: string;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect className="w-full" id={id} value={value} onChange={(event) => onChange(event.currentTarget.value as T | '')}>
        {empty && <NativeSelectOption value="">{empty}</NativeSelectOption>}
        {(Object.entries(options) as [T, string][]).map(([option, name]) => (
          <NativeSelectOption key={option} value={option}>{name}</NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function LocationSuggestions({ city, addressLine, select }: {
  city: string;
  addressLine: string;
  select: (coordinates: Coordinates) => void;
}) {
  const read = useRead((signal) => getLocationSuggestions(city, addressLine, signal), JSON.stringify([city, addressLine]));
  return (
    <div className="space-y-2">
      {read.loading && <Spinner />}
      {Boolean(read.error) && <>
        <ErrorBox error={read.error} />
        <Button type="button" variant="outline" onClick={read.reload}>Повторить поиск координат</Button>
      </>}
      {read.data && (read.data.candidates.length ? (
        <ul className="grid gap-2">
          {read.data.candidates.map(({ location, timezone }, index) => (
            <li key={index}>
              <Button type="button" variant="outline" className="h-auto max-w-full whitespace-normal" onClick={() => select(location)}>
                Выбрать {location.lat}, {location.lon} · {timezone}
              </Button>
            </li>
          ))}
        </ul>
      ) : <Notice>Координаты не найдены. Их можно ввести вручную.</Notice>)}
    </div>
  );
}

function PlaceFields({ place, onChange, readOnly, disabled }: {
  place: DraftPlace | null | undefined;
  onChange: (place: DraftPlace) => void;
  readOnly: boolean;
  disabled: boolean;
}) {
  const [request, setRequest] = useState<{ city: string; addressLine: string; attempt: number }>();
  if (readOnly) {
    return (
      <section className="grid gap-2">
        <h2 className="font-semibold">Место заявки</h2>
        <p className="text-sm text-muted-foreground">Для новой скидки место не меняется.</p>
        <PlaceSnapshot place={place} />
      </section>
    );
  }
  const city = place?.city?.trim() ?? '';
  const addressLine = place?.addressLine?.trim() ?? '';
  const location = place?.location;
  function coordinate(field: keyof Coordinates, raw: string) {
    const number = raw === '' ? undefined : Number(raw);
    const next = { ...location, [field]: number };
    onChange({ ...place, location: next.lat == null && next.lon == null ? undefined : next });
  }

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border p-3 sm:p-4">
      <legend className="px-1 font-semibold">Место</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="Название" value={place?.name} onChange={(name) => onChange({ ...place, name: name || undefined })} />
        <TextField label="Город" value={place?.city} onChange={(value) => { setRequest(undefined); onChange({ ...place, city: value || undefined }); }} />
        <TextField label="Адрес" value={place?.addressLine} onChange={(value) => { setRequest(undefined); onChange({ ...place, addressLine: value || undefined }); }} />
        <TextField label="Код категории" value={place?.categoryCode} onChange={(categoryCode) => onChange({ ...place, categoryCode: categoryCode || undefined })} />
        <TextField label="Широта" type="number" inputMode="decimal" step="any" value={location?.lat} onChange={(raw) => coordinate('lat', raw)} />
        <TextField label="Долгота" type="number" inputMode="decimal" step="any" value={location?.lon} onChange={(raw) => coordinate('lon', raw)} />
      </div>
      <p className="text-sm text-muted-foreground">Для публикации нужны обе координаты. Пока их нет, можно сохранить черновик без координат.</p>
      <Button type="button" variant="outline" disabled={!city || !addressLine} onClick={() => setRequest({ city, addressLine, attempt: (request?.attempt ?? 0) + 1 })}>
        Найти координаты
      </Button>
      {request?.city === city && request.addressLine === addressLine && (
        <LocationSuggestions key={request.attempt} city={city} addressLine={addressLine} select={(coordinates) => {
          onChange({ ...place, location: coordinates });
          setRequest(undefined);
        }} />
      )}
    </fieldset>
  );
}

function OfferFields({ offer, index, change, remove, disabled }: {
  offer: DraftOffer;
  index: number;
  change: (offer: DraftOffer) => void;
  remove?: () => void;
  disabled: boolean;
}) {
  const schedule = offer.schedule ?? [];
  const discount = offer.discountType ?? 'OTHER';
  const hasValue = discount !== 'OTHER' && discount !== 'FREE_ITEM';
  const source = offer.source;

  function changeSource(fields: NonNullable<DraftOffer['source']>) {
    const next = { ...source, ...fields };
    change({ ...offer, source: next.type || next.url || next.note ? next : undefined });
  }
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border p-3 sm:p-4">
      <legend className="px-1 font-semibold">Скидка №{index + 1}</legend>
      <TextField label="Условия" value={offer.conditions} multiline onChange={(conditions) => change({ ...offer, conditions: conditions || undefined })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <ChoiceField label="Тип скидки" value={discount} options={discountLabels} onChange={(type) => {
          change({ ...offer, discountType: type || undefined, discountValue: type === 'OTHER' || type === 'FREE_ITEM' ? undefined : offer.discountValue });
        }} />
        {hasValue && <TextField label="Размер скидки" type="number" inputMode="decimal" step="any" value={offer.discountValue} onChange={(raw) => change({ ...offer, discountValue: raw === '' ? undefined : Number(raw) })} />}
        <TextField label="Действует с" type="date" value={offer.validFrom} onChange={(validFrom) => change({ ...offer, validFrom: validFrom || undefined })} />
        <TextField label="Действует по" type="date" value={offer.validUntil} onChange={(validUntil) => change({ ...offer, validUntil: validUntil || undefined })} />
        <ChoiceField label="Тип источника" value={source?.type ?? ''} options={sourceLabels} empty="Не указан" onChange={(type) => changeSource({ type: type || undefined })} />
        <TextField label="Ссылка на источник" value={source?.url} placeholder="https://" onChange={(url) => changeSource({ url: url || undefined })} />
      </div>
      <TextField label="Примечание к источнику" value={source?.note} multiline onChange={(note) => changeSource({ note: note || undefined })} />
      <section className="grid gap-2">
        <h3 className="font-medium">Расписание</h3>
        <p className="text-sm text-muted-foreground">Без интервалов скидка действует весь день. Время в формате ЧЧ:ММ; 24:00 допустимо только для конца.</p>
        {schedule.map((interval, position) => {
          const update = (next: typeof interval) => change({ ...offer, schedule: schedule.map((current, i) => i === position ? next : current) });
          return (
            <fieldset key={position} className="grid min-w-0 items-end gap-2 rounded-md border p-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
              <legend className="px-1 text-sm">Интервал №{position + 1}</legend>
              <ChoiceField label="День недели" value={String(interval.dayOfWeek)} options={days} onChange={(day) => update({ ...interval, dayOfWeek: Number(day) })} />
              <TextField label="Начало" value={interval.timeFrom} placeholder="09:00" onChange={(timeFrom) => update({ ...interval, timeFrom })} />
              <TextField label="Конец" value={interval.timeUntil} placeholder="18:00" onChange={(timeUntil) => update({ ...interval, timeUntil })} />
              <Button type="button" variant="outline" aria-label={`Удалить интервал №${position + 1} скидки №${index + 1}`} onClick={() => change({ ...offer, schedule: schedule.filter((_, i) => i !== position) })}>Удалить</Button>
            </fieldset>
          );
        })}
        <div>
          <Button type="button" variant="outline" disabled={schedule.length >= 28} onClick={() => change({ ...offer, schedule: [...schedule, { dayOfWeek: 1, timeFrom: '09:00', timeUntil: '18:00' }] })}>
            Добавить интервал
          </Button>
        </div>
      </section>
      {remove && <Button type="button" variant="outline" onClick={remove}>Удалить скидку №{index + 1}</Button>}
    </fieldset>
  );
}

export function SubmissionForm({ value, onChange, type, correction = false, disabled = false, onUploadPendingChange }: SubmissionFormProps) {
  const offers = value.offers ?? [];
  const attachments = value.attachments ?? [];
  const upload = useIntent();
  const [file, setFile] = useState<File>();
  const [fileError, setFileError] = useState('');
  const [purpose, setPurpose] = useState<AttachmentReference['purpose']>('PROOF');
  const [scope, setScope] = useState<number | null>(null);
  const fileId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const uploading = upload.busy || upload.uncertain;
  const locked = disabled || uploading;
  const offerLimit = type === 'CHANGE' ? 1 : 5;

  useEffect(() => {
    onUploadPendingChange?.(uploading);
  }, [onUploadPendingChange, uploading]);

  function selectFile(selected?: File) {
    upload.resetError();
    const invalidType = selected && selected.type !== 'image/png' && selected.type !== 'image/jpeg';
    const tooLarge = selected && selected.size > maxFileSize;
    setFileError(invalidType ? 'Выберите изображение в формате JPEG или PNG.' : tooLarge ? 'Размер файла не должен превышать 10 МиБ.' : '');
    setFile(invalidType || tooLarge ? undefined : selected);
  }

  function attach() {
    if (!file || locked || attachments.length >= mediaLimit) return;
    void upload.run(async (key) => {
      const receipt = await uploadMedia(file, key);
      const reference: AttachmentReference = { mediaAssetId: receipt.id, purpose };
      if (scope != null) reference.offerIndex = scope;
      onChange({ ...value, attachments: [...attachments, reference] });
      setFile(undefined);
      if (fileInput.current) fileInput.current.value = '';
    });
  }

  function removeOffer(index: number) {
    if (scope != null && scope >= index) setScope(scope === index ? null : scope - 1);
    onChange(removeDraftOffer(value, index));
  }

  return (
    <div className="grid gap-5">
      <PlaceFields place={value.place} onChange={(place) => onChange({ ...value, place })} readOnly={type === 'NEW_OFFER'} disabled={locked} />
      <section className="grid gap-3">
        <h2 className="font-semibold">Скидки</h2>
        {!offers.length && <p className="text-sm text-muted-foreground">В черновике пока нет скидок.</p>}
        {offers.map((offer, index) => <OfferFields
          key={offer.id ?? index} offer={offer} index={index} disabled={locked}
          change={(next) => onChange({ ...value, offers: offers.map((current, position) => position === index ? next : current) })}
          remove={correction ? undefined : () => removeOffer(index)}
        />)}
        {!correction && <div>
          <Button type="button" variant="outline" disabled={locked || offers.length >= offerLimit} onClick={() => onChange({ ...value, offers: [...offers, { discountType: 'OTHER' }] })}>
            Добавить скидку
          </Button>
        </div>}
      </section>
      <section className="grid gap-3">
        <h2 className="font-semibold">Приватные вложения</h2>
        {correction ? (
          <p className="text-sm text-muted-foreground">Вложения автора и связи со скидками остаются без изменений.</p>
        ) : (
          <p className="text-sm text-muted-foreground">JPEG или PNG до 10 МиБ; не более 10 вложений. Можно сохранять и отправлять заявку, пока файлы обрабатываются.</p>
        )}
        {attachments.map((reference) => (
          <PrivateAttachment
            key={reference.mediaAssetId} reference={reference} disabled={locked}
            onRemove={correction ? undefined : () => onChange({ ...value, attachments: attachments.filter((item) => item.mediaAssetId !== reference.mediaAssetId) })}
          />
        ))}
        {!correction && <>
          <fieldset className="min-w-0 space-y-3 rounded-md border p-3" disabled={locked || attachments.length >= mediaLimit}>
            <legend className="px-1 text-sm font-medium">Добавить вложение</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChoiceField label="Назначение" options={purposes} value={purpose} onChange={(next) => { if (next) setPurpose(next); }} />
              <ChoiceField label="К какой скидке относится" empty="Ко всем скидкам" value={scope == null ? '' : String(scope)}
                options={Object.fromEntries(offers.map((_, index) => [String(index), `Скидка №${index + 1}`]))}
                onChange={(next) => setScope(next === '' ? null : Number(next))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={fileId}>Файл</Label>
              <Input id={fileId} ref={fileInput} type="file" accept="image/png,image/jpeg" onChange={(event) => selectFile(event.currentTarget.files?.[0])} />
            </div>
            {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
            <Button type="button" disabled={!file} onClick={attach}>Загрузить и прикрепить</Button>
          </fieldset>
          {upload.busy && <Notice>Загрузка вложения…</Notice>}
          <ErrorBox error={upload.error} />
          {upload.uncertain && <div className="space-y-2">
            <Notice>Результат загрузки неизвестен. Можно повторить ту же загрузку или завершить эту попытку.</Notice>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={disabled || upload.busy} onClick={() => void upload.retry()}>Повторить загрузку</Button>
              <Button type="button" variant="outline" disabled={disabled || upload.busy} onClick={upload.clear}>Завершить попытку</Button>
            </div>
          </div>}
        </>}
      </section>
    </div>
  );
}

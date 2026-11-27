import { describe, expect, it } from 'vitest';
import type { DraftPayload } from '@/api/submissions';
import { buildDraftPatch, reapplyDraftPatch, removeDraftOffer } from './submission-payload';

describe('draft merge patch', () => {
  it('clears nested fields with null and omits unchanged fields and target IDs', () => {
    const previous = { place: { id: 'place', city: 'Город', addressLine: 'Улица' }, offers: [{ id: 'offer', conditions: 'Скидка' }] };
    const next = { place: { id: 'place', city: 'Город' }, offers: [{ id: 'offer', conditions: 'Скидка' }] };
    const patch = buildDraftPatch(previous, next);
    expect(patch).toEqual({ place: { addressLine: null } });
    expect(reapplyDraftPatch({ place: { city: 'Новый город', addressLine: 'Улица' } }, patch))
      .toEqual({ place: { city: 'Новый город' } });
    expect(buildDraftPatch(previous, previous)).toEqual({});
  });

  it('replaces changed arrays without client-supplied offer IDs', () => {
    const previous = { offers: [{ id: 'offer', conditions: 'Скидка', source: { note: 'Примечание' } }] };
    const next = { offers: [{ id: 'offer', conditions: 'Новые условия' }] };
    expect(buildDraftPatch(previous, next)).toEqual({ offers: [{ conditions: 'Новые условия' }] });
  });

  it('does not patch an offer field that was blank before and remains blank', () => {
    expect(buildDraftPatch({ offers: [{}] }, { offers: [{ conditions: undefined }] })).toEqual({});
  });
});

describe('offer removal', () => {
  it('drops evidence for the removed offer and preserves other associations', () => {
    const source: DraftPayload = {
      offers: [{ conditions: 'А' }, { conditions: 'Б' }, { conditions: 'В' }],
      attachments: [
        { mediaAssetId: 'first', purpose: 'PROOF', offerIndex: 0 },
        { mediaAssetId: 'removed', purpose: 'PROOF', offerIndex: 1 },
        { mediaAssetId: 'third', purpose: 'PHOTO', offerIndex: 2 },
        { mediaAssetId: 'unscoped', purpose: 'PROOF' },
      ],
    };
    expect(removeDraftOffer(source, 1)).toEqual({
      offers: [{ conditions: 'А' }, { conditions: 'В' }],
      attachments: [
        { mediaAssetId: 'first', purpose: 'PROOF', offerIndex: 0 },
        { mediaAssetId: 'third', purpose: 'PHOTO', offerIndex: 1 },
        { mediaAssetId: 'unscoped', purpose: 'PROOF' },
      ],
    });
  });
});

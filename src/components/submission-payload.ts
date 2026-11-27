import { withoutTargetIds, type DraftPayload } from '@/api/submissions';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function equal(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => equal(value, right[index]));
  }
  if (isObject(left) && isObject(right)) {
    return Object.keys(left).every((key) => equal(left[key], right[key])) &&
      Object.keys(right).every((key) => Object.hasOwn(left, key) || right[key] === undefined);
  }
  return false;
}

function mergePatch(previous: JsonObject, next: JsonObject): JsonObject {
  const patch: JsonObject = {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const old = previous[key];
    const current = next[key];
    if (current == null) {
      if (old != null) patch[key] = null;
    } else if (isObject(current)) {
      const nested = mergePatch(isObject(old) ? old : {}, current);
      if (!isObject(old) || Object.keys(nested).length) patch[key] = nested;
    } else if (!equal(old, current)) {
      patch[key] = current;
    }
  }
  return patch;
}

export function buildDraftPatch(previous: DraftPayload, next: DraftPayload): JsonObject {
  return mergePatch({ ...withoutTargetIds(previous) }, { ...withoutTargetIds(next) });
}

function applyMergePatch(target: JsonObject, patch: JsonObject): JsonObject {
  const result = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    const base = result[key];
    if (value === null) delete result[key];
    else result[key] = isObject(value) ? applyMergePatch(isObject(base) ? base : {}, value) : value;
  }
  return result;
}

/** Reapply local edits only after the author has explicitly reviewed the fresh draft. */
export function reapplyDraftPatch(target: DraftPayload, patch: JsonObject): DraftPayload {
  return applyMergePatch({ ...target }, patch) as DraftPayload;
}

export function removeDraftOffer(payload: DraftPayload, index: number): DraftPayload {
  return {
    ...payload,
    offers: payload.offers?.filter((_, position) => position !== index),
    attachments: payload.attachments?.flatMap((reference) => {
      const position = reference.offerIndex;
      if (position === index) return [];
      return position != null && position > index
        ? [{ ...reference, offerIndex: position - 1 }]
        : [reference];
    }),
  };
}

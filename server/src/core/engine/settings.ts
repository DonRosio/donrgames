import type { SettingDef, SettingValue } from '@mini-jeux/shared';

/** Content counts of the room, for settings bounded by the content left. */
export interface ContentCounts {
  left: number;
}

export type SettingLimits = Record<string, { min: number; max: number }>;

type Defs = Readonly<Record<string, SettingDef>>;

/** Current bounds of the integer settings. */
export function settingLimits(defs: Defs, counts: ContentCounts | null): SettingLimits {
  const limits: SettingLimits = {};
  for (const [key, def] of Object.entries(defs)) {
    if (def.kind !== 'int') continue;
    limits[key] = { min: def.min, max: def.max === 'contentLeft' ? (counts?.left ?? 0) : def.max };
  }
  return limits;
}

function defaultOf(def: SettingDef, counts: ContentCounts | null): SettingValue {
  if (def.kind === 'int' && def.default === 'contentLeft') return counts?.left ?? 0;
  return def.default;
}

export function defaultSettings(
  defs: Defs,
  counts: ContentCounts | null = null,
): Record<string, SettingValue> {
  return Object.fromEntries(
    Object.entries(defs).map(([key, def]) => [key, defaultOf(def, counts)]),
  );
}

/**
 * Settings to use now: defaults for the keys the host did not touch (they follow the content
 * counts as players come and go), and values clamped to the current bounds.
 */
export function effectiveSettings(
  defs: Defs,
  values: Record<string, SettingValue>,
  touched: ReadonlySet<string>,
  counts: ContentCounts | null,
): Record<string, SettingValue> {
  const limits = settingLimits(defs, counts);
  const result: Record<string, SettingValue> = {};
  for (const [key, def] of Object.entries(defs)) {
    let value = touched.has(key) && key in values ? values[key]! : defaultOf(def, counts);
    const bounds = limits[key];
    if (bounds && typeof value === 'number')
      value = Math.min(bounds.max, Math.max(bounds.min, value));
    result[key] = value;
  }
  return result;
}

function isValid(
  def: SettingDef,
  bounds: { min: number; max: number } | undefined,
  value: unknown,
) {
  switch (def.kind) {
    case 'int':
      return (
        Number.isInteger(value) &&
        bounds !== undefined &&
        (value as number) >= bounds.min &&
        (value as number) <= bounds.max
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'choice':
      return def.options.some((option) => option.value === value);
  }
}

/** Applies a patch to the current settings; null when a key is unknown or a value invalid. */
export function patchSettings(
  defs: Defs,
  current: Record<string, SettingValue>,
  patch: Record<string, unknown>,
  counts: ContentCounts | null = null,
): Record<string, SettingValue> | null {
  const limits = settingLimits(defs, counts);
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const def = Object.hasOwn(defs, key) ? defs[key] : undefined;
    if (!def || !isValid(def, limits[key], value)) return null;
    next[key] = value as SettingValue;
  }
  return next;
}

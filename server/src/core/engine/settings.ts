import type { SettingDef, SettingValue } from '@mini-jeux/shared';

export function defaultSettings(
  defs: Readonly<Record<string, SettingDef>>,
): Record<string, SettingValue> {
  return Object.fromEntries(Object.entries(defs).map(([key, def]) => [key, def.default]));
}

function isValid(def: SettingDef, value: unknown): value is SettingValue {
  switch (def.kind) {
    case 'int':
      return (
        Number.isInteger(value) && (value as number) >= def.min && (value as number) <= def.max
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'choice':
      return def.options.some((option) => option.value === value);
  }
}

/** Applies a patch to the current settings; null when a key is unknown or a value invalid. */
export function patchSettings(
  defs: Readonly<Record<string, SettingDef>>,
  current: Record<string, SettingValue>,
  patch: Record<string, unknown>,
): Record<string, SettingValue> | null {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const def = Object.hasOwn(defs, key) ? defs[key] : undefined;
    if (!def || !isValid(def, value)) return null;
    next[key] = value;
  }
  return next;
}

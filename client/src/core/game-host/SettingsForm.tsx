import { useState } from 'react';
import type { SettingDef, SettingValue } from '@mini-jeux/shared';
import styles from './SettingsForm.module.css';

interface SettingsFormProps {
  defs: Record<string, SettingDef>;
  values: Record<string, SettingValue>;
  /** Current bounds of the integer settings (some depend on the content left). */
  limits?: Record<string, { min: number; max: number }>;
  /** Read-only for everyone but the host. */
  editable: boolean;
  onChange: (patch: Record<string, SettingValue>) => void;
}

/** Generic form built from the declarative settings of a game. */
export function SettingsForm({ defs, values, limits, editable, onChange }: SettingsFormProps) {
  const entries = Object.entries(defs);
  if (entries.length === 0) return null;
  return (
    <dl className={styles.form}>
      {entries.map(([key, def]) => {
        const id = `setting-${key}`;
        const value = values[key] ?? def.default;
        return (
          <div key={key} className={styles.field}>
            <dt>
              <label htmlFor={id}>{def.label}</label>
            </dt>
            <dd>
              {!editable ? (
                <span className={styles.readOnly}>{displayValue(def, value)}</span>
              ) : def.kind === 'int' ? (
                <IntInput
                  id={id}
                  min={limits?.[key]?.min ?? def.min}
                  max={limits?.[key]?.max ?? (typeof def.max === 'number' ? def.max : def.min)}
                  value={value as number}
                  onCommit={(v) => onChange({ [key]: v })}
                />
              ) : def.kind === 'boolean' ? (
                <input
                  id={id}
                  type="checkbox"
                  className={styles.checkbox}
                  checked={value as boolean}
                  onChange={(event) => onChange({ [key]: event.target.checked })}
                />
              ) : (
                <select
                  id={id}
                  className={styles.select}
                  value={value as string}
                  onChange={(event) => onChange({ [key]: event.target.value })}
                >
                  {def.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function displayValue(def: SettingDef, value: SettingValue): string {
  if (def.kind === 'boolean') return value ? 'Oui' : 'Non';
  if (def.kind === 'choice') return def.options.find((o) => o.value === value)?.label ?? '';
  return String(value);
}

/** Number field sent to the server once the value is valid and the edit is finished. */
function IntInput(props: {
  id: string;
  min: number;
  max: number;
  value: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const parsed = Number(draft);
    setDraft(null);
    if (Number.isInteger(parsed) && parsed !== props.value) {
      props.onCommit(Math.min(props.max, Math.max(props.min, parsed)));
    }
  };
  return (
    <input
      id={props.id}
      type="number"
      className={styles.number}
      min={props.min}
      max={props.max}
      step={1}
      value={draft ?? String(props.value)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
      }}
    />
  );
}

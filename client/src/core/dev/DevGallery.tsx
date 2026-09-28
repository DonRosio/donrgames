import { useState } from 'react';
import type { PlayerView, RankingEntry, SettingDef, SettingValue } from '@mini-jeux/shared';
import { SettingsForm } from '../game-host/SettingsForm.tsx';
import { localNow } from '../session/clock.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.tsx';
import { ConnectionBanner } from '../ui/ConnectionBanner.tsx';
import { Countdown } from '../ui/Countdown.tsx';
import { PlayerList } from '../ui/PlayerList.tsx';
import { RankingScreen } from '../ui/RankingScreen.tsx';
import { Scoreboard } from '../ui/Scoreboard.tsx';
import styles from './DevGallery.module.css';

// Sample data only: this page is a visual check of the shared components (development mode).
const players: PlayerView[] = [
  { id: 'a', nickname: 'Léa 🎬', connected: true, isHost: true, role: 'player' },
  { id: 'b', nickname: 'Tom', connected: true, isHost: false, role: 'player' },
  { id: 'c', nickname: 'Zoé', connected: false, isHost: false, role: 'player' },
  { id: 'd', nickname: 'Hervé', connected: true, isHost: false, role: 'waiting' },
];

const ranking: RankingEntry[] = [
  { playerId: 'b', nickname: 'Tom', score: 12, rank: 1 },
  { playerId: 'a', nickname: 'Léa 🎬', score: 9, rank: 2 },
  { playerId: 'c', nickname: 'Zoé', score: 9, rank: 2 },
  { playerId: 'd', nickname: 'Hervé', score: 4, rank: 4 },
];

const settingDefs: Record<string, SettingDef> = {
  rounds: { kind: 'int', label: 'Nombre de manches', min: 1, max: 10, default: 3 },
  double: { kind: 'boolean', label: 'Points doubles', default: false },
  mode: {
    kind: 'choice',
    label: 'Mode',
    options: [
      { value: 'fun', label: 'Détente' },
      { value: 'pro', label: 'Compétition' },
    ],
    default: 'fun',
  },
};

export function DevGallery() {
  const [settings, setSettings] = useState<Record<string, SettingValue>>({
    rounds: 3,
    double: false,
    mode: 'fun',
  });
  const [deadline, setDeadline] = useState(() => localNow() + 10_000);
  const [confirming, setConfirming] = useState(false);

  return (
    <main className={styles.page}>
      <h1>Galerie des composants</h1>
      <p className="muted">Page de développement : données d'exemple, aucune connexion.</p>

      <Section title="ConnectionBanner">
        <ConnectionBanner status="reconnecting" />
      </Section>

      <Section title="PlayerList (vue de l'hôte)">
        <PlayerList players={players} me="a" onMakeHost={() => {}} onKick={() => {}} />
      </Section>

      <Section title="Scoreboard">
        <Scoreboard
          me="a"
          entries={[
            { playerId: 'a', nickname: 'Léa 🎬', score: 9, delta: 2 },
            { playerId: 'b', nickname: 'Tom', score: 12, delta: 3 },
            { playerId: 'c', nickname: 'Zoé', score: 9, delta: 0 },
            { playerId: 'd', nickname: 'Hervé', score: 4, delta: 1 },
          ]}
        />
      </Section>

      <Section title="RankingScreen">
        <RankingScreen title="Classement final · Exemple" ranking={ranking} me="a">
          <button type="button" className="btn btn-primary">
            Retour au salon
          </button>
        </RankingScreen>
      </Section>

      <Section title="Countdown">
        <div className={styles.row}>
          <Countdown endsAt={deadline} label="Fin dans" />
          <button type="button" className="btn" onClick={() => setDeadline(localNow() + 10_000)}>
            Relancer (10 s)
          </button>
        </div>
      </Section>

      <Section title="SettingsForm (hôte / autres joueurs)">
        <div className={styles.row}>
          <SettingsForm
            defs={settingDefs}
            values={settings}
            editable
            onChange={(patch) => setSettings((current) => ({ ...current, ...patch }))}
          />
          <SettingsForm defs={settingDefs} values={settings} editable={false} onChange={() => {}} />
        </div>
      </Section>

      <Section title="ConfirmDialog">
        <button type="button" className="btn btn-danger" onClick={() => setConfirming(true)}>
          Ouvrir
        </button>
        {confirming && (
          <ConfirmDialog
            title="Arrêter la partie ?"
            message="Exemple de confirmation."
            confirmLabel="Arrêter"
            danger
            onConfirm={() => setConfirming(false)}
            onCancel={() => setConfirming(false)}
          />
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <h2 className={styles.title}>{title}</h2>
      {children}
    </section>
  );
}

import type { GameInfo, SettingValue } from '@mini-jeux/shared';
import { RolesCarousel } from './RolesCarousel.tsx';
import { RulesPanel } from './RulesPanel.tsx';
import styles from './among-legends.module.css';

/** Under the lobby columns: the rules (foldable), then the roles carousel. */
export function LobbyPanel(props: { info: GameInfo; settings: Record<string, SettingValue> }) {
  return (
    <div className={styles.lobbyExtras}>
      <RulesPanel {...props} />
      <RolesCarousel settings={props.settings} />
    </div>
  );
}

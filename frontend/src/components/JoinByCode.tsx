import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { btnGold, card, sectionLabel } from '../theme';

type JoinByCodeProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
};

export function JoinByCode({ value, onChange, onSubmit, busy }: JoinByCodeProps) {
  const { t } = useTranslation();
  const canSubmit = value.trim().length > 0 && !busy;

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canSubmit) onSubmit();
  };

  return (
    <div style={{ ...card, padding: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <div style={sectionLabel}>{t('lobbyBrowser.joinByCodeTitle')}</div>
        <div style={{ color: '#a99a83', fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>
          {t('lobbyBrowser.joinByCodeDesc')}
        </div>
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onKeyDown={handleKeyDown}
        placeholder={t('lobbyBrowser.roomCodePlaceholder')}
        maxLength={8}
        style={{
          background: '#12100a',
          border: '1px solid #3a2c1d',
          borderRadius: 10,
          color: '#f0e2c4',
          padding: '14px 14px',
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: '.24em',
          textAlign: 'center',
          outline: 'none',
          width: '100%',
        }}
      />
      <button
        onClick={onSubmit}
        disabled={!canSubmit}
        style={{
          ...btnGold,
          padding: '12px 18px',
          fontSize: 14,
          opacity: canSubmit ? 1 : 0.5,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
        }}
      >
        {busy ? t('lobbyBrowser.joiningBtn') : t('lobbyBrowser.joinRoomBtn')}
      </button>
    </div>
  );
}

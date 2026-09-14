import { useTranslation } from 'react-i18next';
import { btnGold } from '../theme';

type Props = {
  onClose: () => void;
};

/** Full-screen overlay explaining classic Ludo rules — content sourced from docs/Ludo Rules.md. */
export function RulesModal({ onClose }: Props) {
  const { t } = useTranslation();

  const sections: Array<{ title: string; body: string }> = [
    { title: t('rules.objectiveTitle'), body: t('rules.objectiveBody') },
    { title: t('rules.setupTitle'), body: t('rules.setupBody') },
    { title: t('rules.turnOrderTitle'), body: t('rules.turnOrderBody') },
    { title: t('rules.movementTitle'), body: t('rules.movementBody') },
  ];

  const zones = [
    t('rules.zoneStarting'),
    t('rules.zoneTrack'),
    t('rules.zoneStar'),
    t('rules.zoneColumn'),
    t('rules.zoneHome'),
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(4px)',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          maxWidth: '100%',
          maxHeight: '85vh',
          overflowY: 'auto',
          borderRadius: 20,
          padding: '30px 34px',
          background: 'linear-gradient(180deg,#241b13,#171009)',
          border: '1px solid #6a4826',
          boxShadow: '0 60px 100px -30px #000',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{ fontFamily: "'Cinzel',serif", fontSize: 26, color: '#f4e9cf', marginBottom: 20 }}
        >
          {t('rules.modalTitle')}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {sections.map((s) => (
            <div key={s.title}>
              <div
                style={{
                  fontSize: 13,
                  letterSpacing: '.08em',
                  textTransform: 'uppercase',
                  color: '#c99b45',
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                {s.title}
              </div>
              <div style={{ color: '#d8cbb2', fontSize: '14.5px', lineHeight: 1.55 }}>{s.body}</div>
            </div>
          ))}

          <div>
            <div
              style={{
                fontSize: 13,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: '#c99b45',
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              {t('rules.zonesTitle')}
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {zones.map((z) => (
                <li key={z} style={{ color: '#d8cbb2', fontSize: '14.5px', lineHeight: 1.5 }}>
                  {z}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <button onClick={onClose} style={{ ...btnGold, width: '100%', padding: 13, marginTop: 26 }}>
          {t('rules.close')}
        </button>
      </div>
    </div>
  );
}

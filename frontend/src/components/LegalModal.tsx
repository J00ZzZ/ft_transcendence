import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useApp, type Lang } from '../store'
import { retroAudio } from '../utils/audio'
import { MarkdownViewer } from './MarkdownViewer'
import {
  RETRO_WINDOW,
  WINDOW_HEADER,
  WINDOW_BODY,
  RETRO_BTN,
} from '../styles/tw'

import privacyEn from '../content/docs/Privacy-Policy-en.md?raw'
import privacyFr from '../content/docs/Privacy-Policy-fr.md?raw'
import privacyMs from '../content/docs/Privacy-Policy-my.md?raw'
import termsEn from '../content/docs/Terms-of-Service-en.md?raw'
import termsFr from '../content/docs/Terms-of-Service-fr.md?raw'
import termsMs from '../content/docs/Terms-of-Service-my.md?raw'

export type LegalDocType = 'privacy' | 'terms'

interface LegalModalProps {
  isOpen: boolean
  initialDoc?: LegalDocType
  onClose: () => void
}

const DOCS: Record<LegalDocType, Record<Lang, string>> = {
  privacy: {
    en: privacyEn,
    fr: privacyFr,
    ms: privacyMs,
  },
  terms: {
    en: termsEn,
    fr: termsFr,
    ms: termsMs,
  },
}

export function LegalModal({ isOpen, initialDoc = 'privacy', onClose }: LegalModalProps) {
  const { t } = useTranslation()
  const { lang, setLang } = useApp()
  const [activeDoc, setActiveDoc] = useState<LegalDocType>(initialDoc)
  const [docLang, setDocLang] = useState<Lang>(lang || 'en')

  useEffect(() => {
    if (initialDoc) setActiveDoc(initialDoc)
  }, [initialDoc])

  useEffect(() => {
    if (lang) setDocLang(lang)
  }, [lang])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        retroAudio.playUiBeep(440, 0.05)
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const currentContent = DOCS[activeDoc][docLang] || DOCS[activeDoc]['en']

  return createPortal(
    <div
      className="fixed inset-0 z-[10010] flex items-center justify-center p-4 sm:p-6 bg-[rgba(5,2,14,0.82)] backdrop-blur-[12px] animate-fade-in"
      onClick={() => {
        retroAudio.playUiBeep(440, 0.05)
        onClose()
      }}
    >
      <div
        className={`${RETRO_WINDOW} w-full max-w-4xl max-h-[90vh] flex flex-col shadow-[0_25px_70px_rgba(0,0,0,0.95),0_0_35px_rgba(0,240,255,0.25)] border-[1.5px] border-[rgba(0,240,255,0.4)] rounded-xl overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title, Controls & Switchers */}
        <div className={WINDOW_HEADER} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px' }}>
          <div className="flex items-center gap-3">
            <span className="font-display font-black text-sm tracking-wider text-[#ffffff]">
              {activeDoc === 'privacy' ? '🛡️ ' + t('legal.privacyPolicy', 'PRIVACY POLICY') : '📜 ' + t('legal.termsOfService', 'TERMS OF SERVICE')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Document Tabs */}
            <div className="flex items-center bg-[rgba(0,0,0,0.5)] p-0.5 rounded-lg border border-[rgba(0,240,255,0.25)]">
              <button
                type="button"
                className={`px-2.5 py-1 text-[0.7rem] font-display font-bold rounded transition-all ${
                  activeDoc === 'privacy'
                    ? 'bg-[var(--accent-pink)] text-[#ffffff] shadow-[0_0_10px_rgba(255,0,127,0.5)]'
                    : 'text-[var(--text-muted)] hover:text-[#ffffff]'
                }`}
                onClick={() => {
                  retroAudio.playUiBeep(720, 0.05)
                  setActiveDoc('privacy')
                }}
              >
                {t('legal.tabPrivacy', 'PRIVACY')}
              </button>
              <button
                type="button"
                className={`px-2.5 py-1 text-[0.7rem] font-display font-bold rounded transition-all ${
                  activeDoc === 'terms'
                    ? 'bg-[var(--accent-pink)] text-[#ffffff] shadow-[0_0_10px_rgba(255,0,127,0.5)]'
                    : 'text-[var(--text-muted)] hover:text-[#ffffff]'
                }`}
                onClick={() => {
                  retroAudio.playUiBeep(720, 0.05)
                  setActiveDoc('terms')
                }}
              >
                {t('legal.tabTerms', 'TERMS')}
              </button>
            </div>

            {/* Language Switcher */}
            <div className="flex items-center bg-[rgba(0,0,0,0.5)] p-0.5 rounded-lg border border-[rgba(0,240,255,0.25)]">
              {(['en', 'ms', 'fr'] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`px-2 py-1 text-[0.68rem] font-mono font-bold rounded transition-all ${
                    docLang === l
                      ? 'bg-[var(--accent-cyan)] text-[#0a0519] shadow-[0_0_8px_rgba(0,240,255,0.5)]'
                      : 'text-[var(--text-muted)] hover:text-[#ffffff]'
                  }`}
                  onClick={() => {
                    retroAudio.playUiBeep(880, 0.05)
                    setDocLang(l)
                    setLang(l)
                  }}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Close Button */}
            <button
              type="button"
              className={`${RETRO_BTN} px-2 py-0.5 text-xs text-[var(--accent-pink)] hover:bg-[rgba(255,0,127,0.2)]`}
              onClick={() => {
                retroAudio.playUiBeep(440, 0.05)
                onClose()
              }}
              title={t('common.close', 'Close')}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Scrollable Document Body */}
        <div
          className={`${WINDOW_BODY} flex-1 overflow-y-auto p-6 sm:p-8 bg-[rgba(12,4,28,0.92)] text-[var(--text-main)]`}
          style={{ maxHeight: 'calc(90vh - 110px)' }}
        >
          <MarkdownViewer content={currentContent} />
        </div>

        {/* Modal Footer Bar */}
        <div className="p-3 bg-[rgba(18,6,42,0.95)] border-t border-[rgba(0,240,255,0.2)] flex justify-between items-center px-6">
          <span className="font-mono text-[0.68rem] text-[var(--text-muted)]">
            // PACE 24 · RETROLUDO '42 LEGAL ARCHIVE [{docLang.toUpperCase()}]
          </span>
          <button
            type="button"
            className={`${RETRO_BTN} px-4 py-1.5 text-xs font-display font-black text-[#ffffff] bg-[linear-gradient(90deg,rgba(0,240,255,0.3),rgba(255,0,127,0.3))] border border-[var(--accent-cyan)] rounded-lg hover:shadow-[0_0_15px_rgba(0,240,255,0.4)]`}
            onClick={() => {
              retroAudio.playUiBeep(440, 0.05)
              onClose()
            }}
          >
            {t('legal.acceptClose', 'CLOSE')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

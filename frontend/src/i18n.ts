import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { ms } from './locales/ms';
import { fr } from './locales/fr';

const savedLang = localStorage.getItem('lr.lang');
const defaultLang = savedLang && ['en', 'ms', 'fr'].includes(savedLang) ? savedLang : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ms: { translation: ms },
      fr: { translation: fr },
    },
    lng: defaultLang,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })
  .catch(() => {
    // Language loading failure falls back to defaults.
  });

export default i18n;

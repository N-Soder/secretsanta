import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './en';

export type Translations = typeof en;

const resources = {
  en: { translation: en },
} satisfies Record<string, { translation: Translations }>;

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

// Type augmentation for useTranslation hook
declare module 'i18next' {
  interface CustomTypeOptions {
    resources: typeof resources['en'];
  }
}

export default i18n; 
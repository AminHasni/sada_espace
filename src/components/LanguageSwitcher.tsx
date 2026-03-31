import React from 'react';
import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';

const LanguageSwitcher: React.FC = () => {
  const { i18n, t } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'fr' ? 'ar' : 'fr';
    i18n.changeLanguage(newLang);
    document.documentElement.dir = newLang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = newLang;
  };

  return (
    <button
      onClick={toggleLanguage}
      className="p-2 rounded-xl transition-all active:scale-95 shadow-sm border bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
      aria-label={t('common.language')}
    >
      <Languages size={20} />
    </button>
  );
};

export default LanguageSwitcher;

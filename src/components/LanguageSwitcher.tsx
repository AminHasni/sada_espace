import React from 'react';
import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';
import { cn } from '../lib/utils';

const LanguageSwitcher: React.FC<{ className?: string }> = ({ className }) => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'fr' ? 'ar' : 'fr';
    i18n.changeLanguage(newLang);
  };

  return (
    <button
      onClick={toggleLanguage}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all",
        "bg-slate-100 text-slate-600 hover:bg-slate-200",
        className
      )}
    >
      <Globe size={14} />
      <span>{i18n.language === 'fr' ? 'العربية' : 'Français'}</span>
    </button>
  );
};

export default LanguageSwitcher;

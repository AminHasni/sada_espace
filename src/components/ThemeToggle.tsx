import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '../lib/utils';
import { useTranslation } from 'react-i18next';

interface ThemeToggleProps {
  className?: string;
}

const ThemeToggle: React.FC<ThemeToggleProps> = ({ className }) => {
  const { theme, toggleTheme } = useTheme();
  const { t } = useTranslation();

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "p-2 rounded-xl transition-all active:scale-95 shadow-sm border",
        theme === 'dark' 
          ? "bg-slate-800 border-slate-700 text-yellow-400 hover:bg-slate-700" 
          : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50",
        className
      )}
      aria-label={t('common.theme')}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
};

export default ThemeToggle;

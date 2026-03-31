import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../components/AuthProvider';
import { Sparkles } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { cn } from '../lib/utils';

const LoginPage: React.FC = () => {
  const { loginWithEmail, resetPassword, user, authError, logout } = useAuth();
  const { t, i18n } = useTranslation();
  const [isResetting, setIsResetting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (user) return <Navigate to="/" />;

  const isRTL = i18n.language === 'ar';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isResetting) {
      await resetPassword(email);
      alert(t('auth.resetInstructions'));
      setIsResetting(false);
    } else {
      await loginWithEmail(email, password);
    }
  };

  return (
    <div className={cn("min-h-screen bg-slate-50 dark:bg-slate-950 flex overflow-hidden", isRTL && "font-sans")}>
      {/* Left Side: Illustration/Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-accent rounded-full blur-3xl"></div>
        </div>
        
        <div className="relative z-10 max-w-lg text-white">
          <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8">
            <Sparkles className="text-white w-8 h-8" />
          </div>
          <h1 className="text-6xl font-display font-bold mb-6 leading-tight">
            {t('auth.heroTitle')}
          </h1>
          <p className="text-xl text-white/80 font-light leading-relaxed">
            {t('auth.heroSubtitle')}
          </p>
          
          <div className="mt-12 grid grid-cols-2 gap-6">
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/10">
              <div className="text-3xl font-bold mb-1">100%</div>
              <div className="text-sm text-white/60 uppercase tracking-wider">{t('auth.secure')}</div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/10">
              <div className="text-3xl font-bold mb-1">IA</div>
              <div className="text-sm text-white/60 uppercase tracking-wider">{t('auth.aiAnalysis')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative">
        <div className="absolute top-6 right-6 lg:right-12">
          <LanguageSwitcher />
        </div>

        <div className="max-w-md w-full">
          <div className="mb-10 lg:hidden">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Sparkles className="text-white w-4 h-4" />
              </div>
              <span className="font-display font-bold text-xl tracking-tight dark:text-white">Stock & Credit</span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-display font-bold text-slate-900 dark:text-white mb-2">
              {isResetting ? t('auth.reset') : t('auth.welcomeBack')}
            </h2>
            <p className="text-slate-500 dark:text-slate-400">
              {isResetting 
                ? t('auth.resetInstructions') 
                : t('auth.loginInstructions')}
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('auth.email')}</label>
              <input
                required
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                className="input-field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {!isResetting && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('auth.password')}</label>
                  <button 
                    type="button"
                    onClick={() => setIsResetting(true)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
                <input
                  required
                  type="password"
                  placeholder="••••••••"
                  className="input-field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}

            {authError && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 p-4 rounded-xl text-sm text-red-600 dark:text-red-400 flex items-start gap-3">
                <div className="w-5 h-5 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center shrink-0 mt-0.5">!</div>
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full btn-primary py-3 shadow-lg shadow-primary/20"
            >
              {isResetting ? t('auth.sendLink') : t('auth.signIn')}
            </button>
          </form>

          {isResetting && (
            <div className="mt-10 text-center">
              <button 
                onClick={() => setIsResetting(false)} 
                className="text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-primary transition-colors"
              >
                {t('auth.backToLogin')}
              </button>
            </div>
          )}

          {authError && authError.includes('network-request-failed') && (
            <div className="mt-6 text-center">
              <p className="text-xs text-slate-500 mb-2">{t('auth.connectionIssue')}</p>
              <button 
                onClick={() => {
                  logout();
                  window.location.reload();
                }}
                className="text-sm font-medium text-danger hover:underline"
              >
                {t('auth.clearCache')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;

import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useTranslation } from 'react-i18next';
import { User, Shield, Clock, Mail, Phone, Edit2, Save, X, Key, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { cn } from '../lib/utils';

const Profile: React.FC = () => {
  const { user, profile, updateProfile, resetPassword } = useAuth();
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: profile?.displayName || '',
    phoneNumber: profile?.phoneNumber || '',
  });
  const [isResetting, setIsResetting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const dateLocale = fr;

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(formData);
      setIsEditing(false);
      showSuccess(t('profile.successUpdate'));
    } catch (error) {
      console.error(error);
      // alert(t('common.error'));
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    setIsResetting(true);
    try {
      await resetPassword(user.email);
      showSuccess(t('profile.successReset'));
    } catch (error) {
      console.error(error);
      // alert(t('common.error'));
    } finally {
      setIsResetting(false);
    }
  };

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  if (!profile) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('profile.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('profile.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all shadow-sm border",
            isEditing 
              ? "bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-700" 
              : "bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary hover:text-primary"
          )}
        >
          {isEditing ? <X size={16} /> : <Edit2 size={16} />}
          {isEditing ? t('profile.cancel') : t('profile.edit')}
        </button>
      </div>

      {successMessage && (
        <div className="bg-success/10 text-success p-4 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={20} />
          <p className="text-sm font-bold">{successMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Left Column: Form */}
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleUpdate} className="card p-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('profile.form.fullName')}</label>
                <div className="relative">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    disabled={!isEditing}
                    type="text"
                    className="input-field pl-12 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 dark:disabled:text-slate-400"
                    placeholder={t('profile.form.fullName')}
                    value={formData.displayName}
                    onChange={(e) => setFormData({...formData, displayName: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('profile.form.phone')}</label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    disabled={!isEditing}
                    type="text"
                    className="input-field pl-12 disabled:bg-slate-50 dark:disabled:bg-slate-800/50 disabled:text-slate-500 dark:disabled:text-slate-400"
                    placeholder={t('profile.form.phone')}
                    value={formData.phoneNumber}
                    onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('profile.form.email')}</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  disabled
                  type="email"
                  className="input-field pl-12 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                  value={profile.email}
                />
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">{t('profile.form.emailNote')}</p>
            </div>

            {isEditing && (
              <div className="pt-4">
                <button
                  type="submit"
                  className="w-full btn-primary py-4 flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Save size={18} />
                  {t('profile.form.save')}
                </button>
              </div>
            )}
          </form>

          {/* Security Section */}
          <div className="card p-8 bg-slate-50/50 dark:bg-slate-800/20 border-dashed">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <Shield size={20} />
              </div>
              <h3 className="text-xl font-display font-bold text-slate-900 dark:text-white">{t('profile.security.title')}</h3>
            </div>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                  <Key size={24} />
                </div>
                <div>
                  <p className="text-sm font-display font-bold text-slate-900 dark:text-white">{t('profile.security.password')}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('profile.security.lastModified')}</p>
                </div>
              </div>
              <button
                onClick={handleResetPassword}
                disabled={isResetting}
                className="w-full sm:w-auto btn-secondary py-2.5 px-6 flex items-center justify-center gap-2"
              >
                {isResetting ? (
                  <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin"></div>
                ) : (
                  <Key size={16} />
                )}
                {isResetting ? t('profile.security.sending') : t('profile.security.resetEmail')}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Profile Summary */}
        <div className="space-y-6">
          <div className="card overflow-hidden bg-slate-900 dark:bg-slate-950 text-white border-none shadow-2xl shadow-slate-900/20">
            <div className="p-8 pb-12 bg-gradient-to-br from-primary/20 to-transparent">
              <div className="w-24 h-24 rounded-3xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-4xl font-bold text-white mb-6 shadow-xl">
                {profile.displayName[0]}
              </div>
              <h3 className="text-2xl font-display font-bold mb-1">{profile.displayName}</h3>
              <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full w-fit border border-white/10">
                <Shield size={12} className="text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest">{t(`users.roles.${profile.role}`)}</span>
              </div>
            </div>
            
            <div className="p-8 space-y-6 bg-white/5 backdrop-blur-sm">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-white/60">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{t('profile.summary.memberSince')}</p>
                  <p className="text-sm font-mono text-white/80">{format(new Date(profile.createdAt), 'dd MMMM yyyy', { locale: dateLocale })}</p>
                </div>
              </div>
              
              <div className="pt-6 border-t border-white/10">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">{t('profile.summary.status')}</p>
                    <p className="text-xs font-bold text-success">{t('profile.summary.active')}</p>
                  </div>
                  <div className="text-center p-3 rounded-2xl bg-white/5 border border-white/5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">{t('profile.summary.verified')}</p>
                    <p className="text-xs font-bold text-info">{t('profile.summary.yes')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6 bg-primary/5 dark:bg-primary/10 border-primary/10">
            <p className="text-xs text-primary/80 dark:text-primary/60 font-medium leading-relaxed">
              {t('profile.summary.help')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;

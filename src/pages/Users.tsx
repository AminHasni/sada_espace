import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, limit } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { UserProfile, ActivityLog, UserRole } from '../types';
import { useAuth } from '../components/AuthProvider';
import { Shield, User as UserIcon, Clock, Search, Edit2, X, Mail, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { logActivity } from '../services/activity';
import { notificationService } from '../services/notificationService';

const Users: React.FC = () => {
  const { profile: currentUserProfile } = useAuth();
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('warehouseman');
  const [isPaused, setIsPaused] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'warehouseman' as UserRole });

  const { adminCreateUser } = useAuth();

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  useEffect(() => {
    if (currentUserProfile?.role !== 'admin') {
      setLoading(false);
      return;
    }

    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(doc => ({ ...doc.data() } as UserProfile)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
    });

    const qLogs = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(20));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setLogs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'logs');
    });

    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, [currentUserProfile]);

  if (currentUserProfile?.role !== 'admin') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 rounded-3xl bg-danger/10 flex items-center justify-center text-danger mb-6">
          <Shield size={40} />
        </div>
        <h2 className="text-2xl font-display font-bold text-slate-900">{t('users.restrictedAccess')}</h2>
        <p className="text-slate-500 mt-2 max-w-md">{t('users.restrictedMessage')}</p>
      </div>
    );
  }

  const handleRoleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      await updateDoc(doc(db, 'users', editingUser.uid), {
        role: selectedRole,
        isPaused: isPaused
      });

      // Send notification to the updated user
      await notificationService.sendNotification({
        userId: editingUser.uid,
        title: t('notifications.userUpdate.title'),
        message: t('notifications.userUpdate.message', { role: selectedRole, status: isPaused ? t('common.paused') : t('common.active') }),
        type: isPaused ? 'warning' : 'info'
      });

      if (currentUserProfile) await logActivity(currentUserProfile.uid, currentUserProfile.displayName, 'user_update', t('activity.userUpdate', { name: editingUser.displayName, role: selectedRole, status: isPaused ? t('common.paused') : t('common.active') }));
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newUserUid = await adminCreateUser(newUser.email, newUser.password, newUser.name, newUser.role);
      
      // Send welcome notification to the new user
      if (newUserUid) {
        await notificationService.sendNotification({
          userId: newUserUid,
          title: t('notifications.welcome.title'),
          message: t('notifications.welcome.message', { role: newUser.role }),
          type: 'info'
        });
      }
      
      setIsAddUserModalOpen(false);
      setNewUser({ name: '', email: '', password: '', role: 'warehouseman' });
      if (currentUserProfile) await logActivity(currentUserProfile.uid, currentUserProfile.displayName, 'user_create', t('activity.userCreate', { name: newUser.name, role: newUser.role }));
    } catch (error) {
      console.error(error);
    }
  };

  const openModal = (user: UserProfile) => {
    setEditingUser(user);
    setSelectedRole(user.role);
    setIsPaused(user.isPaused || false);
    setIsModalOpen(true);
  };

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('users.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('users.subtitle')}</p>
        </div>
        <button
          onClick={() => setIsAddUserModalOpen(true)}
          className="btn-primary py-2 px-4"
        >
          {t('users.addUser')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* User List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder={t('users.searchPlaceholder')}
                className="input-field pl-12"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('users.table.user')}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('users.table.role')}</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">{t('users.table.action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => (
                    <tr key={u.uid} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <UserIcon size={20} />
                          </div>
                          <div>
                            <p className="text-sm font-display font-bold text-slate-900 dark:text-white">{u.displayName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider",
                          u.role === 'admin' ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                        )}>
                          {t(`users.roles.${u.role}`)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openModal(u)}
                          className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                        >
                          <Edit2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Activity Logs */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="text-primary" size={20} />
            <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white">{t('users.activity.title')}</h3>
          </div>
          <div className="space-y-4">
            {logs.map((log) => (
              <div key={log.id} className="card p-4 hover:border-primary/20 transition-all group">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 dark:text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                      {log.userName?.[0] || 'S'}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{log.userName}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">{format(new Date(log.timestamp), 'dd/MM HH:mm', { locale: dateLocale })}</span>
                </div>
                <p className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-tight mb-1">{log.action.replace(/_/g, ' ')}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 italic line-clamp-2">{log.details}</p>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-400 italic">{t('users.activity.noActivity')}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit Role Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">{t('users.modal.title')}</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('users.modal.subtitle')}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleRoleUpdate} className="p-8 space-y-6">
              <div className="flex items-center gap-4 p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-700 flex items-center justify-center text-primary shadow-sm">
                  <UserIcon size={24} />
                </div>
                <div>
                  <p className="text-sm font-display font-bold text-slate-900 dark:text-white">{editingUser?.displayName}</p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Mail size={12} />
                    <span>{editingUser?.email}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('users.modal.selectRole')}</label>
                <div className="grid grid-cols-1 gap-2">
                  {(['admin', 'warehouseman'] as UserRole[]).map((role) => (
                    <label 
                      key={role} 
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all",
                        selectedRole === role 
                          ? "bg-primary/5 border-primary text-primary" 
                          : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-600"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="role"
                          value={role}
                          checked={selectedRole === role}
                          onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                          className="sr-only"
                        />
                        <span className="text-xs font-bold uppercase tracking-widest">{t(`users.roles.${role}`)}</span>
                      </div>
                      {selectedRole === role && <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>}
                    </label>
                  ))}
                </div>
              </div>

              {selectedRole === 'warehouseman' && (
                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('common.paused')}</label>
                  <button
                    type="button"
                    onClick={() => setIsPaused(!isPaused)}
                    className={cn(
                      "w-12 h-6 rounded-full transition-colors relative",
                      isPaused ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
                    )}
                  >
                    <div className={cn(
                      "w-4 h-4 rounded-full bg-white absolute top-1 transition-transform",
                      isPaused ? "translate-x-7" : "translate-x-1"
                    )}></div>
                  </button>
                </div>
              )}

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  {t('users.modal.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20"
                >
                  {t('users.modal.update')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddUserModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsAddUserModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">{t('users.addUser')}</h2>
              </div>
              <button onClick={() => setIsAddUserModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleAddUser} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('users.modal.name')}</label>
                <input required type="text" className="input-field" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('auth.email')}</label>
                <input required type="email" className="input-field" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('auth.password')}</label>
                <input required type="password" className="input-field" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('users.modal.selectRole')}</label>
                <div className="grid grid-cols-1 gap-2">
                  {(['admin', 'warehouseman'] as UserRole[]).map((role) => (
                    <label 
                      key={role} 
                      className={cn(
                        "flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all",
                        newUser.role === role 
                          ? "bg-primary/5 border-primary text-primary" 
                          : "bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-slate-200 dark:hover:border-slate-600"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="role"
                          value={role}
                          checked={newUser.role === role}
                          onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                          className="sr-only"
                        />
                        <span className="text-xs font-bold uppercase tracking-widest">{t(`users.roles.${role}`)}</span>
                      </div>
                      {newUser.role === role && <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>}
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddUserModalOpen(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  {t('users.modal.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20"
                >
                  {t('users.addUser')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Users;

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Reclamation } from '../types';
import { useAuth } from '../components/AuthProvider';
import { Plus, Search, X, Calendar, Edit2, Trash2, MessageSquareWarning, Eye } from 'lucide-react';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { logActivity } from '../services/activity';

const Reclamations: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [reclamations, setReclamations] = useState<Reclamation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingReclamation, setEditingReclamation] = useState<Reclamation | null>(null);
  const [viewingReclamation, setViewingReclamation] = useState<Reclamation | null>(null);

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
    status: 'pending' as 'pending' | 'in_progress' | 'resolved' | 'rejected',
    resolutionNotes: '',
  });

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'reclamations'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      let data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Reclamation));
      
      // If warehouseman, only show their own reclamations
      if (profile.role === 'warehouseman') {
        data = data.filter(r => r.submittedBy === profile.uid);
      }
      
      setReclamations(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'reclamations');
    });

    return () => unsub();
  }, [profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      const timestamp = new Date().toISOString();
      if (editingReclamation) {
        // Only admin can update status/resolution, warehouseman can only edit their own pending reclamations
        if (profile.role === 'warehouseman' && editingReclamation.status !== 'pending') {
          alert(t('errorBoundary.permissionDenied'));
          return;
        }

        const updateData: any = {
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          updatedAt: timestamp,
        };

        if (profile.role === 'admin') {
          updateData.status = formData.status;
          updateData.resolutionNotes = formData.resolutionNotes;
          if (formData.status === 'resolved' || formData.status === 'rejected') {
             updateData.resolvedAt = timestamp;
          }
        }

        await updateDoc(doc(db, 'reclamations', editingReclamation.id!), updateData);
        await logActivity(profile.uid, profile.displayName, 'reclamation_update', `${formData.title}`);
      } else {
        await addDoc(collection(db, 'reclamations'), {
          title: formData.title,
          description: formData.description,
          priority: formData.priority,
          status: 'pending',
          submittedBy: user.uid,
          submittedByName: profile.displayName,
          createdAt: timestamp,
        });
        await logActivity(profile.uid, profile.displayName, 'reclamation_create', `${formData.title}`);
      }

      setIsModalOpen(false);
      setEditingReclamation(null);
      resetForm();
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'reclamations');
    }
  };

  const handleDelete = async (reclamation: Reclamation) => {
    if (profile?.role !== 'admin' && reclamation.submittedBy !== profile?.uid) return;
    if (profile?.role === 'warehouseman' && reclamation.status !== 'pending') {
        alert(t('errorBoundary.permissionDenied'));
        return;
    }
    
    if (!window.confirm(t('reclamations.deleteConfirm'))) return;

    try {
      await deleteDoc(doc(db, 'reclamations', reclamation.id!));
      if (profile) await logActivity(profile.uid, profile.displayName, 'reclamation_delete', `${reclamation.title}`);
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'reclamations');
    }
  };

  const openEditModal = (reclamation: Reclamation) => {
    setEditingReclamation(reclamation);
    setFormData({
      title: reclamation.title,
      description: reclamation.description,
      priority: reclamation.priority,
      status: reclamation.status,
      resolutionNotes: reclamation.resolutionNotes || '',
    });
    setIsModalOpen(true);
  };

  const openViewModal = (reclamation: Reclamation) => {
    setViewingReclamation(reclamation);
    setIsViewModalOpen(true);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      priority: 'medium',
      status: 'pending',
      resolutionNotes: '',
    });
  };

  const filteredReclamations = reclamations.filter(r => 
    r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.submittedByName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'in_progress': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'resolved': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'rejected': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'text-slate-500';
      case 'medium': return 'text-amber-500';
      case 'high': return 'text-red-500';
      default: return 'text-slate-500';
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('reclamations.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('reclamations.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setEditingReclamation(null);
              resetForm();
              setIsModalOpen(true);
            }}
            className="btn-primary flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            {t('reclamations.newReclamation')}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card dark:bg-slate-900 dark:border-slate-800 p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={t('reclamations.searchPlaceholder')}
            className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white pl-12"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Reclamations Table */}
      <div className="card dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reclamations.table.date')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reclamations.table.title')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reclamations.table.priority')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('reclamations.table.status')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredReclamations.map((reclamation) => (
                <tr key={reclamation.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="text-sm font-mono">{format(new Date(reclamation.createdAt), 'dd/MM/yyyy', { locale: dateLocale })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{reclamation.title}</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t('reclamations.submittedBy', { name: reclamation.submittedByName })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("text-xs font-bold uppercase tracking-wider", getPriorityColor(reclamation.priority))}>
                      {t(`reclamations.priority.${reclamation.priority}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider", getStatusColor(reclamation.status))}>
                      {t(`reclamations.status.${reclamation.status}`)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => openViewModal(reclamation)}
                        className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-primary transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600"
                      >
                        <Eye size={16} />
                      </button>
                      {(profile?.role === 'admin' || (profile?.role === 'warehouseman' && reclamation.status === 'pending')) && (
                        <>
                          <button
                            onClick={() => openEditModal(reclamation)}
                            className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-primary transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(reclamation)}
                            className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-danger transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredReclamations.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 dark:text-slate-600">
                <MessageSquareWarning size={32} />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-display">{t('reclamations.noReclamations')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Reclamation Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {editingReclamation ? t('reclamations.modal.editTitle') : t('reclamations.modal.newTitle')}
                </h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('reclamations.modal.title')}</label>
                  <input
                    required
                    type="text"
                    className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    disabled={profile?.role === 'admin' && !!editingReclamation}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('reclamations.modal.description')}</label>
                  <textarea
                    required
                    rows={4}
                    className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                    disabled={profile?.role === 'admin' && !!editingReclamation}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('reclamations.modal.priority')}</label>
                  <select
                    className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: e.target.value as any})}
                    disabled={profile?.role === 'admin' && !!editingReclamation}
                  >
                    <option value="low">{t('reclamations.priority.low')}</option>
                    <option value="medium">{t('reclamations.priority.medium')}</option>
                    <option value="high">{t('reclamations.priority.high')}</option>
                  </select>
                </div>

                {profile?.role === 'admin' && editingReclamation && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('reclamations.modal.status')}</label>
                      <select
                        className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        value={formData.status}
                        onChange={(e) => setFormData({...formData, status: e.target.value as any})}
                      >
                        <option value="pending">{t('reclamations.status.pending')}</option>
                        <option value="in_progress">{t('reclamations.status.in_progress')}</option>
                        <option value="resolved">{t('reclamations.status.resolved')}</option>
                        <option value="rejected">{t('reclamations.status.rejected')}</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('reclamations.modal.resolutionNotes')}</label>
                      <textarea
                        rows={3}
                        className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                        value={formData.resolutionNotes}
                        onChange={(e) => setFormData({...formData, resolutionNotes: e.target.value})}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 btn-secondary dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 py-3"
                >
                  {t('reclamations.modal.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20"
                >
                  {editingReclamation ? t('reclamations.modal.update') : t('reclamations.modal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Modal */}
      {isViewModalOpen && viewingReclamation && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsViewModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {t('reclamations.modal.viewTitle')}
                </h2>
              </div>
              <button onClick={() => setIsViewModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{viewingReclamation.title}</h3>
                <div className="flex items-center gap-4 mt-2">
                  <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider", getStatusColor(viewingReclamation.status))}>
                    {t(`reclamations.status.${viewingReclamation.status}`)}
                  </span>
                  <span className={cn("text-xs font-bold uppercase tracking-wider", getPriorityColor(viewingReclamation.priority))}>
                    {t(`reclamations.priority.${viewingReclamation.priority}`)}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('reclamations.modal.description')}</p>
                <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{viewingReclamation.description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('reclamations.submittedBy', { name: '' })}</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{viewingReclamation.submittedByName}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('reclamations.table.date')}</p>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{format(new Date(viewingReclamation.createdAt), 'dd/MM/yyyy HH:mm', { locale: dateLocale })}</p>
                </div>
              </div>

              {viewingReclamation.resolutionNotes && (
                <div className="space-y-1 pt-4 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('reclamations.modal.resolutionNotes')}</p>
                  <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">{viewingReclamation.resolutionNotes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reclamations;

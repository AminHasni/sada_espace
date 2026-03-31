import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Expense } from '../types';
import { useAuth } from '../components/AuthProvider';
import { Wallet, Plus, Search, X, Calendar, User as UserIcon, Trash2, Edit2, Download } from 'lucide-react';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { logActivity } from '../services/activity';

const Expenses: React.FC = () => {
  const { user, profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  const [formData, setFormData] = useState({
    amount: '' as any,
    description: '',
    category: '',
    date: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (!profile) return;

    const q = query(collection(db, 'expenses'), orderBy('date', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'expenses');
    });

    return () => unsub();
  }, [profile]);

  const handleExportCSV = () => {
    if (profile?.role !== 'admin') return;
    
    const headers = ["Date", "Description", "Catégorie", "Montant", "Enregistré par"];
    const csvData = expenses.map(e => [
      format(new Date(e.date), 'dd/MM/yyyy'),
      e.description,
      e.category || '',
      e.amount,
      e.recordedByName
    ]);

    const csvContent = [headers, ...csvData].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `rapport_depenses_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;

    try {
      const timestamp = new Date().toISOString();
      if (editingExpense) {
        if (profile.role !== 'admin') return;
        await updateDoc(doc(db, 'expenses', editingExpense.id), {
          ...formData,
          updatedAt: timestamp,
        });
        await logActivity(profile.uid, profile.displayName, 'expense_update', t('activity.expenseUpdate', { amount: formData.amount, description: formData.description }));
      } else {
        await addDoc(collection(db, 'expenses'), {
          ...formData,
          recordedBy: user.uid,
          recordedByName: profile.displayName,
          createdAt: timestamp,
        });
        await logActivity(profile.uid, profile.displayName, 'expense_create', t('activity.expenseCreate', { amount: formData.amount, description: formData.description }));
      }

      setIsModalOpen(false);
      setEditingExpense(null);
      setFormData({
        amount: '' as any,
        description: '',
        category: '',
        date: new Date().toISOString().split('T')[0],
      });
    } catch (error: any) {
      handleFirestoreError(error, OperationType.WRITE, 'expenses');
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (profile?.role !== 'admin' && profile?.role !== 'warehouseman') return;
    if (!window.confirm(t('expenses.deleteConfirm', { amount: expense.amount }))) return;

    try {
      await deleteDoc(doc(db, 'expenses', expense.id));
      if (profile) await logActivity(profile.uid, profile.displayName, 'expense_delete', t('activity.expenseDelete', { amount: expense.amount, description: expense.description }));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'expenses');
    }
  };

  const openEditModal = (expense: Expense) => {
    if (profile?.role !== 'admin') return;
    setEditingExpense(expense);
    setFormData({
      amount: expense.amount,
      description: expense.description,
      category: expense.category || '',
      date: expense.date,
    });
    setIsModalOpen(true);
  };

  const categories = Array.from(new Set(expenses.map(e => e.category).filter(Boolean)));

  const filteredExpenses = expenses.filter(e => {
    const matchesSearch = e.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (e.category && e.category.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !selectedCategory || e.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

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
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('expenses.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('expenses.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {profile?.role === 'admin' && (
            <button
              onClick={handleExportCSV}
              className="btn-secondary flex items-center gap-2"
            >
              <Download size={18} />
              {t('expenses.exportCSV')}
            </button>
          )}
          <button
            onClick={() => {
              setEditingExpense(null);
              setFormData({
                amount: '' as any,
                description: '',
                category: '',
                date: new Date().toISOString().split('T')[0],
              });
              setIsModalOpen(true);
            }}
            className="btn-primary flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            {t('expenses.newExpense')}
          </button>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 card dark:bg-slate-900 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder={t('expenses.searchPlaceholder')}
              className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white pl-12"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white sm:w-48"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="">{t('common.allCategories')}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div className="xl:col-span-2 card dark:bg-slate-900 dark:border-slate-800 p-4 flex items-center justify-between bg-primary/5 border-primary/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Wallet size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('common.total')}</p>
              <p className="text-lg font-display font-bold text-slate-900 dark:text-white">
                {(filteredExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)).toLocaleString()} {t('common.currency')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="card dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('expenses.table.date')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('expenses.table.description')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('expenses.table.category')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{t('expenses.table.amount')}</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExpenses.map((expense) => (
                <tr key={expense.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar size={14} className="text-slate-400" />
                      <span className="text-sm font-mono">{format(new Date(expense.date), 'dd/MM/yyyy', { locale: dateLocale })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{expense.description}</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">{t('expenses.recordedBy', { name: expense.recordedByName })}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                      {expense.category || '-'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm font-display font-bold text-slate-900 dark:text-white">{(Number(expense.amount) || 0).toLocaleString()} {t('common.currency')}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {profile?.role === 'admin' && (
                        <button
                          onClick={() => openEditModal(expense)}
                          className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-primary transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600"
                        >
                          <Edit2 size={16} />
                        </button>
                      )}
                      {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                        <button
                          onClick={() => handleDelete(expense)}
                          className="p-2 hover:bg-white dark:hover:bg-slate-700 rounded-xl text-slate-400 hover:text-danger transition-all shadow-sm border border-transparent hover:border-slate-100 dark:hover:border-slate-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredExpenses.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300 dark:text-slate-600">
                <Wallet size={32} />
              </div>
              <p className="text-slate-500 dark:text-slate-400 font-display">{t('expenses.noExpenses')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Expense Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {editingExpense ? t('expenses.modal.editTitle') : t('expenses.modal.newTitle')}
                </h2>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('expenses.modal.amount')}</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    value={formData.amount === '' ? '' : (isNaN(formData.amount as any) ? '' : formData.amount)}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || !isNaN(Number(val)) || val === '.') {
                        setFormData({...formData, amount: val === '' ? '' as any : parseFloat(val)});
                      }
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('expenses.modal.description')}</label>
                  <textarea
                    required
                    rows={3}
                    className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    value={formData.description}
                    onChange={(e) => setFormData({...formData, description: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('expenses.modal.category')}</label>
                    <input
                      required
                      type="text"
                      className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      value={formData.category}
                      onChange={(e) => setFormData({...formData, category: e.target.value})}
                      placeholder={t('expenses.modal.categoryPlaceholder')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('expenses.modal.date')}</label>
                    <input
                      required
                      type="date"
                      className="input-field dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                      value={formData.date}
                      onChange={(e) => setFormData({...formData, date: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 btn-secondary dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700 py-3"
                >
                  {t('expenses.modal.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20"
                >
                  {t('expenses.modal.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Expenses;

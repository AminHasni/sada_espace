import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Client, Payment } from '../types';
import { Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, X, Receipt, User, Wallet } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { logActivity } from '../services/activity';
import { cn } from '../lib/utils';

const Clients: React.FC = () => {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    totalCredit: 0,
    creditLimit: 0
  });

  const [paymentData, setPaymentData] = useState({
    amount: 0,
    method: 'cash' as Payment['method'],
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'clients'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });
    return unsub;
  }, [profile]);

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData(client);
    } else {
      setEditingClient(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        address: '',
        totalCredit: 0,
        creditLimit: 0
      });
    }
    setIsModalOpen(true);
  };

  const handleOpenPaymentModal = (client: Client) => {
    setSelectedClient(client);
    setPaymentData({
      amount: 0,
      method: 'cash',
      notes: '',
      date: new Date().toISOString().split('T')[0]
    });
    setIsPaymentModalOpen(true);
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedClient) return;

    try {
      const clientRef = doc(db, 'clients', selectedClient.id!);
      const currentCredit = selectedClient.totalCredit || 0;
      const newCredit = Math.max(0, currentCredit - paymentData.amount);

      await updateDoc(clientRef, { totalCredit: newCredit });
      
      await addDoc(collection(db, 'payments'), {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        amount: paymentData.amount,
        date: paymentData.date,
        method: paymentData.method,
        notes: paymentData.notes,
        performedBy: profile.uid,
        performedByName: profile.displayName,
        createdAt: new Date().toISOString()
      });

      await logActivity(profile.uid, profile.displayName, 'client_payment', `Paiement reçu de ${selectedClient.name}: ${paymentData.amount} DT`);
      
      setIsPaymentModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payments');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.role !== 'admin' && profile?.role !== 'warehouseman') return;

    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id), formData);
        if (profile) await logActivity(profile.uid, profile.displayName, 'client_update', `Client modifié: ${formData.name}`);
      } else {
        await addDoc(collection(db, 'clients'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        if (profile) await logActivity(profile.uid, profile.displayName, 'client_create', `Nouveau client: ${formData.name}`);
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clients');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (profile?.role !== 'admin') {
      alert(t('clients.permissionDenied'));
      return;
    }
    if (window.confirm(t('clients.deleteConfirm', { name }))) {
      try {
        await deleteDoc(doc(db, 'clients', id));
        if (profile) await logActivity(profile.uid, profile.displayName, 'client_delete', `Client supprimé: ${name}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `clients/${id}`);
      }
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone && c.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (c.email && c.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

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
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('clients.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('clients.subtitle')}</p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
          <button
            onClick={() => handleOpenModal()}
            className="btn-primary flex items-center gap-2 shadow-lg shadow-primary/20"
          >
            <Plus size={18} />
            {t('clients.newClient')}
          </button>
        )}
      </div>

      {/* Search */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={t('clients.searchPlaceholder')}
            className="input-field pl-12"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredClients.map((client) => (
          <div key={client.id} className="card group relative overflow-hidden">
            <div className={cn(
              "absolute top-0 left-0 w-1 h-full",
              client.totalCredit > 0 ? "bg-danger" : "bg-success"
            )}></div>
            
            <div className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <User size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-slate-900 dark:text-white">{client.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{client.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                    <button
                      onClick={() => handleOpenModal(client)}
                      className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                      title={t('clients.edit')}
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  {profile?.role === 'admin' && (
                    <button
                      onClick={() => handleDelete(client.id!, client.name)}
                      className="p-2 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-lg transition-all"
                      title={t('clients.delete')}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4 mb-6">
                {client.email && (
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <Mail size={16} className="text-slate-400" />
                    <span>{client.email}</span>
                  </div>
                )}
                {client.address && (
                  <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
                    <MapPin size={16} className="text-slate-400" />
                    <span className="line-clamp-1">{client.address}</span>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-slate-100 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('clients.creditLimit')}</span>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    {client.creditLimit?.toLocaleString() || 0} <span className="text-[10px] font-normal text-slate-400">{t('common.currency')}</span>
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('clients.totalCredit')}</span>
                  <span className={cn(
                    "text-xl font-display font-bold",
                    client.totalCredit > (client.creditLimit || 0) ? "text-danger" : "text-success"
                  )}>
                    {client.totalCredit.toLocaleString()} <span className="text-xs font-sans font-normal text-slate-400">{t('common.currency')}</span>
                  </span>
                </div>
                
                {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                  <button
                    onClick={() => handleOpenPaymentModal(client)}
                    disabled={client.totalCredit <= 0}
                    className={cn(
                      "w-full mt-4 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all font-bold text-sm",
                      client.totalCredit <= 0 
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-500"
                        : "bg-success/10 text-success hover:bg-success hover:text-white"
                    )}
                  >
                    <Wallet size={16} />
                    {t('clients.recordPayment', 'Enregistrer Paiement')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {editingClient ? t('clients.modal.editTitle') : t('clients.modal.newTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('clients.modal.subtitle')}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.name')}</label>
                <input
                  required
                  type="text"
                  className="input-field"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.phone')}</label>
                  <input
                    required
                    type="tel"
                    className="input-field"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.email')}</label>
                  <input
                    type="email"
                    className="input-field"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.address')}</label>
                <input
                  type="text"
                  className="input-field"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.initialCredit')}</label>
                  <input
                    type="number"
                    className="input-field"
                    value={isNaN(formData.totalCredit) ? '' : formData.totalCredit}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setFormData({ ...formData, totalCredit: isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.creditLimit')}</label>
                  <input
                    disabled={profile?.role !== 'admin'}
                    type="number"
                    className="input-field disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500"
                    value={isNaN(formData.creditLimit) ? '' : formData.creditLimit}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setFormData({ ...formData, creditLimit: isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  {t('clients.form.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20"
                >
                  {editingClient ? t('clients.form.save') : t('clients.form.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Payment Modal */}
      {isPaymentModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsPaymentModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {t('clients.modal.paymentTitle', 'Enregistrer un Paiement')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedClient.name}</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.amount', 'Montant')}</label>
                <input
                  required
                  type="number"
                  min="0"
                  max={selectedClient.totalCredit}
                  step="0.01"
                  className="input-field text-2xl font-bold text-success"
                  value={paymentData.amount}
                  onChange={(e) => setPaymentData({ ...paymentData, amount: parseFloat(e.target.value) || 0 })}
                />
                <p className="text-[10px] text-slate-400">{t('clients.currentCredit', 'Crédit actuel')}: {selectedClient.totalCredit.toLocaleString()} DT</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.date', 'Date')}</label>
                  <input
                    required
                    type="date"
                    className="input-field"
                    value={paymentData.date}
                    onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.method', 'Méthode')}</label>
                  <select
                    className="input-field"
                    value={paymentData.method}
                    onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value as Payment['method'] })}
                  >
                    <option value="cash">{t('common.cash', 'Espèces')}</option>
                    <option value="check">{t('common.check', 'Chèque')}</option>
                    <option value="transfer">{t('common.transfer', 'Virement')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.notes', 'Notes')}</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={paymentData.notes}
                  onChange={(e) => setPaymentData({ ...paymentData, notes: e.target.value })}
                />
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  {t('common.cancel', 'Annuler')}
                </button>
                <button
                  type="submit"
                  disabled={paymentData.amount <= 0}
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20 bg-success hover:bg-success/90 border-success hover:border-success/90 disabled:opacity-50"
                >
                  {t('common.confirm', 'Confirmer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;

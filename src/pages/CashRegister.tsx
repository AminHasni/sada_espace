import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { CashSession, CashTransaction } from '../types';
import { Wallet, Plus, CheckCircle, XCircle, Clock, History, User, ArrowUpCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';

export default function CashRegister() {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [allSessions, setAllSessions] = useState<CashSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialAmount, setInitialAmount] = useState<string>('');
  const [finalAmount, setFinalAmount] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [addAmount, setAddAmount] = useState<string>('');
  const [addReason, setAddReason] = useState('');
  const [sessionTransactions, setSessionTransactions] = useState<CashTransaction[]>([]);
  const [isAddingFunds, setIsAddingFunds] = useState(false);

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  useEffect(() => {
    if (!profile) return;

    // Current open session for the logged in user
    const q = query(
      collection(db, 'cash_sessions'),
      where('userId', '==', profile.uid),
      where('status', '==', 'open'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const sessionData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as CashSession;
        setCurrentSession(sessionData);
        
        // Fetch transactions for this session
        const transQ = query(
          collection(db, 'cash_transactions'),
          where('sessionId', '==', sessionData.id),
          orderBy('timestamp', 'desc')
        );
        
        const unsubscribeTrans = onSnapshot(transQ, (transSnapshot) => {
          setSessionTransactions(transSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashTransaction)));
        });
        
        return () => unsubscribeTrans();
      } else {
        setCurrentSession(null);
        setSessionTransactions([]);
      }
      setLoading(false);
    }, (error) => {
      console.error("Error fetching cash session:", error);
      setLoading(false);
    });

    // All sessions for admin view
    let unsubscribeAll = () => {};
    if (profile.role === 'admin') {
      const qAll = query(
        collection(db, 'cash_sessions'),
        orderBy('openedAt', 'desc'),
        limit(50)
      );
      unsubscribeAll = onSnapshot(qAll, (snapshot) => {
        setAllSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CashSession)));
      });
    }

    return () => {
      unsubscribe();
      unsubscribeAll();
    };
  }, [profile]);

  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !initialAmount) return;

    try {
      await addDoc(collection(db, 'cash_sessions'), {
        userId: profile.uid,
        userName: profile.displayName,
        openedAt: new Date().toISOString(),
        initialAmount: Number(initialAmount),
        status: 'open',
        notes: notes
      });
      setInitialAmount('');
      setNotes('');
    } catch (error) {
      console.error("Error opening cash session:", error);
    }
  };

  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession?.id || !finalAmount) return;

    try {
      await updateDoc(doc(db, 'cash_sessions', currentSession.id), {
        closedAt: new Date().toISOString(),
        finalAmount: Number(finalAmount),
        status: 'closed'
      });
      setFinalAmount('');
    } catch (error) {
      console.error("Error closing cash session:", error);
    }
  };

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSession?.id || !profile || !addAmount) return;

    setIsAddingFunds(true);
    try {
      const transactionRef = await addDoc(collection(db, 'cash_transactions'), {
        sessionId: currentSession.id,
        userId: profile.uid,
        userName: profile.displayName,
        amount: Number(addAmount),
        type: 'add_funds',
        reason: addReason,
        timestamp: new Date().toISOString()
      });
      
      // Update session total
      await updateDoc(doc(db, 'cash_sessions', currentSession.id), {
        totalAdded: (currentSession.totalAdded || 0) + Number(addAmount)
      });
      
      // Log activity
      await addDoc(collection(db, 'logs'), {
        userId: profile.uid,
        userName: profile.displayName,
        action: 'cash_add_funds',
        details: `Ajout de ${addAmount} DT à la caisse. Raison: ${addReason || 'Non spécifiée'}`,
        timestamp: new Date().toISOString()
      });

      setAddAmount('');
      setAddReason('');
    } catch (error) {
      console.error("Error adding funds:", error);
    } finally {
      setIsAddingFunds(false);
    }
  };

  const totalAdded = sessionTransactions
    .filter(t => t.type === 'add_funds')
    .reduce((sum, t) => sum + t.amount, 0);

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="text-primary" />
          {t('nav.cashRegister')}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Active Session Card */}
        <div>
          {!currentSession ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                  <Wallet size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('cashRegister.openSession')}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {t('cashRegister.openSessionDesc')}
                </p>
              </div>

              <form onSubmit={handleOpenSession} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('cashRegister.initialAmount')}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={initialAmount}
                    onChange={(e) => setInitialAmount(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Ex: 5000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('cashRegister.notes')}
                  </label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Remarques..."
                    rows={2}
                  />
                </div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-primary text-white px-4 py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                >
                  <Plus size={20} />
                  {t('cashRegister.startWork')}
                </button>
              </form>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-6">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} />
                </div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('cashRegister.sessionOpen')}</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                  {t('cashRegister.sessionOpenDesc')}
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t('cashRegister.openedAt')}</span>
                  <span className="font-medium text-slate-900 dark:text-white flex items-center gap-1">
                    <Clock size={14} />
                    {new Date(currentSession.openedAt).toLocaleTimeString()}
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{t('cashRegister.initialAmount')}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {currentSession.initialAmount.toLocaleString('fr-TN')} DT
                  </span>
                </div>
                {totalAdded > 0 && (
                  <div className="flex justify-between items-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                    <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{t('cashRegister.addedFunds', 'Fonds ajoutés')}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      + {totalAdded.toLocaleString('fr-TN')} DT
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center p-3 bg-primary/5 rounded-xl border border-primary/10">
                  <span className="text-sm text-primary font-bold">{t('cashRegister.currentTotal', 'Total actuel')}</span>
                  <span className="font-black text-primary text-lg">
                    {(currentSession.initialAmount + totalAdded).toLocaleString('fr-TN')} DT
                  </span>
                </div>
              </div>

              {/* Recent Transactions */}
              {sessionTransactions.length > 0 && (
                <div className="mb-6 space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">{t('cashRegister.recentTransactions', 'Transactions récentes')}</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {sessionTransactions.map(transaction => (
                      <div key={transaction.id} className="flex justify-between items-center p-2 bg-white dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
                            <Plus size={12} />
                          </div>
                          <div>
                            <p className="font-bold text-slate-700 dark:text-slate-300">{transaction.amount.toLocaleString()} DT</p>
                            <p className="text-[10px] text-slate-500">{transaction.reason || t('common.noReason', 'Sans raison')}</p>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400">{new Date(transaction.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add Funds Form */}
              <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-100 dark:border-slate-800">
                <h3 className="font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
                  <ArrowUpCircle size={18} className="text-emerald-500" />
                  {t('cashRegister.addFundsTitle', 'Ajouter des fonds')}
                </h3>
                <form onSubmit={handleAddFunds} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      type="number"
                      required
                      min="0.01"
                      step="0.01"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                      placeholder={t('cashRegister.amountToAdd', 'Montant à ajouter')}
                    />
                    <input
                      type="text"
                      value={addReason}
                      onChange={(e) => setAddReason(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                      placeholder={t('cashRegister.addReason', 'Raison (ex: Fond de roulement)')}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isAddingFunds}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white px-4 py-2 rounded-xl font-bold hover:bg-emerald-600 transition-colors text-sm disabled:opacity-50"
                  >
                    <Plus size={16} />
                    {isAddingFunds ? t('common.loading') : t('cashRegister.submitAddFunds', 'Confirmer l\'ajout')}
                  </button>
                </form>
              </div>

              <form onSubmit={handleCloseSession} className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-6">
                <h3 className="font-bold text-slate-900 dark:text-white mb-2">{t('cashRegister.closeSession')}</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    {t('cashRegister.finalAmount')}
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={finalAmount}
                    onChange={(e) => setFinalAmount(e.target.value)}
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="Montant total compté"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-3 rounded-xl font-bold hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                >
                  <XCircle size={20} />
                  {t('cashRegister.submitClose')}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Admin History View */}
        {profile?.role === 'admin' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <History className="text-primary" size={20} />
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('cashRegister.history.title')}</h2>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('cashRegister.history.subtitle')}</p>
            
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
              {allSessions.map((session) => (
                <div key={session.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                        <User size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{session.userName}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">
                          {format(new Date(session.openedAt), 'dd MMM yyyy HH:mm', { locale: dateLocale })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                      session.status === 'open' 
                        ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' 
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}>
                      {session.status === 'open' ? t('cashRegister.history.open') : t('cashRegister.history.closedStatus')}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-50 dark:border-slate-800">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('cashRegister.history.initial')}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{session.initialAmount.toLocaleString()} DT</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('cashRegister.addedFunds', 'Ajouté')}</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {session.totalAdded ? `+${session.totalAdded.toLocaleString()} DT` : '0 DT'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('cashRegister.history.final')}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {session.finalAmount ? `${session.finalAmount.toLocaleString()} DT` : '-'}
                      </p>
                    </div>
                  </div>
                  
                  {session.closedAt && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 text-right">
                      {t('cashRegister.history.closed')}: {format(new Date(session.closedAt), 'HH:mm', { locale: dateLocale })}
                    </p>
                  )}
                </div>
              ))}
              {allSessions.length === 0 && (
                <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-slate-400 dark:text-slate-500 text-sm">Aucun historique de session disponible.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDocs } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Client, Payment, StockExit, Product } from '../types';
import { Plus, Search, Edit2, Trash2, Phone, Mail, MapPin, X, Receipt, User, Wallet, FileText, Calendar, Download, PackagePlus, Briefcase, ChevronDown, Package } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { logActivity } from '../services/activity';
import { cn } from '../lib/utils';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { generateClientCreditReport } from '../utils/pdfGenerator';
import { useNavigate } from 'react-router-dom';

const Clients: React.FC = () => {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportLoading, setReportLoading] = useState(false);

  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const [formData, setFormData] = useState<Partial<Client>>({
    name: '',
    email: '',
    phone: '',
    address: '',
    totalCredit: 0,
    creditLimit: 0
  });

  const [paymentData, setPaymentData] = useState({
    amount: '' as any,
    method: 'cash' as Payment['method'],
    notes: '',
    date: new Date().toISOString().split('T')[0]
  });

  const [isCreditSaleModalOpen, setIsCreditSaleModalOpen] = useState(false);
  const [creditSaleData, setCreditSaleData] = useState({
    items: [] as {
      productId: string;
      variantId: string;
      productName: string;
      variantName?: string;
      quantity: number;
      unitPrice: number;
    }[],
    notes: ''
  });

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemData, setItemData] = useState({
    variantId: '',
    quantity: 1,
    unitPrice: 0
  });

  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('');

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'clients'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    const qProducts = query(collection(db, 'products'), orderBy('name'));
    const unsubProducts = onSnapshot(qProducts, (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    return () => {
      unsub();
      unsubProducts();
    };
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
      amount: '' as any,
      method: 'cash',
      notes: '',
      date: new Date().toISOString().split('T')[0]
    });
    setIsPaymentModalOpen(true);
  };

  const handleOpenReportModal = (client: Client) => {
    setSelectedClient(client);
    setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    setIsReportModalOpen(true);
  };

  const handleOpenCreditSaleModal = (client: Client) => {
    setSelectedClient(client);
    setProductSearch('');
    setProductCategoryFilter('');
    setSelectedProduct(null);
    setCreditSaleData({
      items: [],
      notes: ''
    });
    setIsCreditSaleModalOpen(true);
  };

  const handleCreditSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedClient || creditSaleData.items.length === 0) return;

    const totalAmount = creditSaleData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    try {
      // We need to use a transaction to ensure consistency
      const { runTransaction } = await import('firebase/firestore');
      await runTransaction(db, async (transaction) => {
        const clientRef = doc(db, 'clients', selectedClient.id!);
        const clientSnap = await transaction.get(clientRef);
        if (!clientSnap.exists()) throw new Error("Client non trouvé");

        const exitRef = doc(collection(db, 'stock_exits'));
        const itemsToSave = [];

        // 1. Collect all unique product IDs and fetch their snaps first (READS)
        const uniqueProductIds = Array.from(new Set(creditSaleData.items.map(item => item.productId)));
        const productRefs = uniqueProductIds.map(id => doc(db, 'products', id));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        
        const productSnapsMap = new Map();
        productSnaps.forEach((snap, index) => {
          productSnapsMap.set(uniqueProductIds[index], snap);
        });

        // 2. Process each item and perform updates (WRITES)
        for (const item of creditSaleData.items) {
          const productRef = doc(db, 'products', item.productId);
          const productSnap = productSnapsMap.get(item.productId);
          
          if (!productSnap || !productSnap.exists()) throw new Error(`Produit ${item.productName} non trouvé`);
          
          const productData = productSnap.data() as Product;
          let currentStock = productData.stockQuantity || 0;
          let updatedVariants = productData.variants ? [...productData.variants] : undefined;

          if (item.variantId && updatedVariants) {
            const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
            if (variantIndex !== -1) {
              const variant = updatedVariants[variantIndex];
              if (variant.stockQuantity < item.quantity) {
                throw new Error(`Stock insuffisant pour la variante ${variant.name} de ${item.productName}. Disponible: ${variant.stockQuantity}`);
              }
              updatedVariants[variantIndex] = {
                ...variant,
                stockQuantity: variant.stockQuantity - item.quantity
              };
            } else {
              throw new Error(`Variante non trouvée pour ${item.productName}`);
            }
          } else {
            if (currentStock < item.quantity) {
              throw new Error(`Stock insuffisant pour ${item.productName}. Disponible: ${currentStock}`);
            }
          }

          // Update product stock
          transaction.update(productRef, {
            stockQuantity: currentStock - item.quantity,
            ...(updatedVariants ? { variants: updatedVariants } : {}),
            updatedAt: new Date().toISOString()
          });

          itemsToSave.push({
            productId: item.productId,
            productName: item.productName,
            variantId: item.variantId || null,
            variantName: item.variantName || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice
          });
        }

        // Update client credit
        const currentCredit = clientSnap.data().totalCredit || 0;
        transaction.update(clientRef, {
          totalCredit: currentCredit + totalAmount
        });

        // Create stock exit
        const exitData = {
          exitNumber: `CREDIT-${Date.now().toString().slice(-6)}`,
          type: 'sale',
          clientId: selectedClient.id,
          clientName: selectedClient.name,
          exitDate: new Date().toISOString().split('T')[0],
          paymentStatus: 'credit',
          notes: creditSaleData.notes || 'Vente à crédit multi-produits',
          discount: 0,
          amountPaid: 0,
          totalAmount,
          items: itemsToSave,
          performedBy: profile.uid,
          performedByName: profile.displayName,
          createdAt: new Date().toISOString()
        };
        transaction.set(exitRef, exitData);

        // Log activity
        const logRef = doc(collection(db, 'logs'));
        transaction.set(logRef, {
          userId: profile.uid,
          userName: profile.displayName,
          action: 'credit_sale',
          details: `Vente à crédit multi-produits pour ${selectedClient.name} (${totalAmount} DT)`,
          createdAt: new Date().toISOString()
        });
      });

      setIsCreditSaleModalOpen(false);
      logActivity(profile.uid, profile.displayName, 'credit_sale', `Vente à crédit multi-produits pour ${selectedClient.name} (${totalAmount} DT)`);
    } catch (error: any) {
      alert(error.message || "Erreur lors de la vente à crédit");
      handleFirestoreError(error, OperationType.CREATE, 'stock_exits');
    }
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedClient) return;

    try {
      const clientRef = doc(db, 'clients', selectedClient.id!);
      const currentCredit = selectedClient.totalCredit || 0;
      const newCredit = Math.max(0, currentCredit - (Number(paymentData.amount) || 0));

      await updateDoc(clientRef, { totalCredit: newCredit });
      
      await addDoc(collection(db, 'payments'), {
        clientId: selectedClient.id,
        clientName: selectedClient.name,
        amount: Number(paymentData.amount) || 0,
        date: paymentData.date,
        method: paymentData.method,
        notes: paymentData.notes,
        performedBy: profile.uid,
        performedByName: profile.displayName,
        createdAt: new Date().toISOString()
      });

      await logActivity(profile.uid, profile.displayName, 'client_payment', t('activity.clientPayment', { name: selectedClient.name, amount: Number(paymentData.amount) || 0 }));
      
      setIsPaymentModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'payments');
    }
  };

  const generatePDFReport = async () => {
    if (!selectedClient || !profile) return;
    setReportLoading(true);
    try {
      const exitsQuery = query(collection(db, 'stock_exits'), orderBy('exitDate', 'desc'));
      const paymentsQuery = query(collection(db, 'payments'), orderBy('date', 'desc'));

      const [exitsSnap, paymentsSnap] = await Promise.all([
        getDocs(exitsQuery),
        getDocs(paymentsQuery)
      ]);

      const allExits = exitsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockExit[];
      const allPayments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Payment[];

      const start = parseISO(startDate);
      const end = parseISO(endDate);

      const filteredExits = allExits.filter(exit => {
        const date = parseISO(exit.exitDate);
        return exit.clientId === selectedClient.id && isWithinInterval(date, { start, end });
      });

      const filteredPayments = allPayments.filter(payment => {
        const date = parseISO(payment.date);
        return payment.clientId === selectedClient.id && isWithinInterval(date, { start, end });
      });

      const transactions = [
        ...filteredExits.map(e => ({
          date: e.exitDate,
          type: 'credit',
          amount: (e.totalAmount || 0) - (e.amountPaid || 0),
          ref: e.exitNumber,
          items: e.items,
          serviceName: e.serviceName,
          performedByName: e.performedByName
        })),
        ...filteredPayments.map(p => ({
          date: p.date,
          type: 'payment',
          amount: p.amount,
          ref: 'PAY-' + p.id?.slice(-4),
          performedByName: p.performedByName
        }))
      ].sort((a, b) => a.date.localeCompare(b.date));

      const totalCredit = filteredExits.reduce((sum, e) => sum + ((e.totalAmount || 0) - (e.amountPaid || 0)), 0);
      const totalPaid = filteredPayments.reduce((sum, p) => sum + p.amount, 0);

      await generateClientCreditReport(
        selectedClient,
        startDate,
        endDate,
        transactions,
        { totalCredit, totalPaid },
        t,
        i18n.language
      );

      setIsReportModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'reports');
    } finally {
      setReportLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.role !== 'admin' && profile?.role !== 'warehouseman') return;

    try {
      if (editingClient) {
        await updateDoc(doc(db, 'clients', editingClient.id!), formData);
        if (profile) await logActivity(profile.uid, profile.displayName, 'client_update', t('activity.clientUpdate', { name: formData.name }));
      } else {
        await addDoc(collection(db, 'clients'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        if (profile) await logActivity(profile.uid, profile.displayName, 'client_create', t('activity.clientCreate', { name: formData.name }));
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clients');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (profile?.role !== 'admin' && profile?.role !== 'warehouseman') {
      alert(t('clients.permissionDenied'));
      return;
    }
    if (window.confirm(t('clients.deleteConfirm', { name }))) {
      try {
        await deleteDoc(doc(db, 'clients', id));
        if (profile) await logActivity(profile.uid, profile.displayName, 'client_delete', t('activity.clientDelete', { name }));
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

      {/* Clients Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">{t('clients.form.name')}</th>
                <th className="px-6 py-4">{t('clients.form.phone')}</th>
                <th className="px-6 py-4">{t('clients.form.email')}</th>
                <th className="px-6 py-4 text-right">{t('clients.creditLimit')}</th>
                <th className="px-6 py-4 text-right">{t('clients.totalCredit')}</th>
                <th className="px-6 py-4 text-center">{t('common.status')}</th>
                <th className="px-6 py-4 text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredClients.map((client) => {
                const isOverLimit = client.totalCredit > (client.creditLimit || 0);
                return (
                  <tr 
                    key={client.id} 
                    className={cn(
                      "hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors",
                      isOverLimit && "bg-danger/[0.02] hover:bg-danger/[0.04]"
                    )}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                          <User size={16} />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">{client.name}</div>
                          {client.address && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                              <MapPin size={12} />
                              <span className="line-clamp-1">{client.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {client.phone || '-'}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {client.email || '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-slate-700 dark:text-slate-300">
                      {client.creditLimit?.toLocaleString() || 0} {t('common.currency')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className={cn(
                        "font-bold",
                        isOverLimit ? "text-danger" : client.totalCredit > 0 ? "text-orange-500" : "text-success"
                      )}>
                        {client.totalCredit.toLocaleString()} {t('common.currency')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block",
                        client.totalCredit <= 0 ? "bg-success/10 text-success" : 
                        isOverLimit ? "bg-danger/10 text-danger" : "bg-orange-500/10 text-orange-500"
                      )}>
                        {client.totalCredit <= 0 ? t('common.paid') : 
                         isOverLimit ? t('common.overLimit') : t('common.credit')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                          <button
                            onClick={() => handleOpenCreditSaleModal(client)}
                            className="p-2 text-indigo-500 hover:bg-indigo-500/10 rounded-lg transition-all"
                            title="Nouvelle vente à crédit"
                          >
                            <PackagePlus size={16} />
                          </button>
                        )}
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleOpenReportModal(client)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                            title={t('creditReports.generate')}
                          >
                            <FileText size={16} />
                          </button>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                          <button
                            onClick={() => handleOpenPaymentModal(client)}
                            disabled={client.totalCredit <= 0}
                            className={cn(
                              "p-2 rounded-lg transition-all",
                              client.totalCredit <= 0 
                                ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                                : "text-success hover:bg-success/10"
                            )}
                            title={t('clients.recordPayment')}
                          >
                            <Wallet size={16} />
                          </button>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                          <button
                            onClick={() => handleOpenModal(client)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                            title={t('clients.edit')}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
                          <button
                            onClick={() => handleDelete(client.id!, client.name)}
                            className="p-2 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-lg transition-all"
                            title={t('clients.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    <User size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    {t('clients.noClients')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                    required
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
                  required
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
                    required
                    type="text"
                    inputMode="decimal"
                    className="input-field"
                    value={isNaN(formData.totalCredit as any) ? '' : formData.totalCredit}
                    onChange={(e) => {
                      const valStr = e.target.value.replace(',', '.');
                      if (valStr === '' || !isNaN(Number(valStr)) || valStr === '.') {
                        const val = valStr === '' ? 0 : parseFloat(valStr);
                        setFormData({ ...formData, totalCredit: isNaN(val) ? 0 : val });
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.creditLimit')}</label>
                  <input
                    disabled={profile?.role !== 'admin'}
                    type="text"
                    inputMode="decimal"
                    className="input-field disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-500"
                    value={isNaN(formData.creditLimit as any) ? '' : formData.creditLimit}
                    onChange={(e) => {
                      const valStr = e.target.value.replace(',', '.');
                      if (valStr === '' || !isNaN(Number(valStr)) || valStr === '.') {
                        const val = valStr === '' ? 0 : parseFloat(valStr);
                        setFormData({ ...formData, creditLimit: isNaN(val) ? 0 : val });
                      }
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
                  {t('clients.modal.paymentTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedClient.name}</p>
              </div>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handlePaymentSubmit} className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.amount')}</label>
                <input
                  required
                  type="text"
                  inputMode="decimal"
                  className="input-field text-2xl font-bold text-success"
                  value={paymentData.amount === '' ? '' : (isNaN(paymentData.amount as any) ? '' : paymentData.amount)}
                  onChange={(e) => {
                    const val = e.target.value.replace(',', '.');
                    if (val === '' || !isNaN(Number(val)) || val === '.') {
                      setPaymentData({ ...paymentData, amount: val === '' ? '' as any : parseFloat(val) });
                    }
                  }}
                />
                <p className="text-[10px] text-slate-400">{t('clients.currentCredit')}: {selectedClient.totalCredit.toLocaleString()} {t('common.currency')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.date')}</label>
                  <input
                    required
                    type="date"
                    className="input-field"
                    value={paymentData.date}
                    onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.method')}</label>
                  <select
                    className="input-field"
                    value={paymentData.method}
                    onChange={(e) => setPaymentData({ ...paymentData, method: e.target.value as Payment['method'] })}
                  >
                    <option value="cash">{t('common.cash')}</option>
                    <option value="check">{t('common.check')}</option>
                    <option value="transfer">{t('common.transfer')}</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('clients.form.notes')}</label>
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
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={Number(paymentData.amount) <= 0}
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20 bg-success hover:bg-success/90 border-success hover:border-success/90 disabled:opacity-50"
                >
                  {t('common.confirm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {isReportModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsReportModalOpen(false)}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {t('creditReports.title')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedClient.name}</p>
              </div>
              <button onClick={() => setIsReportModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="grid grid-cols-1 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('creditReports.startDate')}</label>
                  <input
                    type="date"
                    className="input-field"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('creditReports.endDate')}</label>
                  <input
                    type="date"
                    className="input-field"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={generatePDFReport}
                  disabled={reportLoading}
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {reportLoading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <Download size={18} />}
                  {t('creditReports.generate')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Credit Sale Modal */}
      {isCreditSaleModalOpen && selectedClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsCreditSaleModalOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  Nouvelle vente à crédit
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedClient.name}</p>
              </div>
              <button onClick={() => setIsCreditSaleModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} className="dark:text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleCreditSaleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Product Selection Section */}
              {!selectedProduct && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Catégorie</label>
                      <select
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium"
                        value={productCategoryFilter}
                        onChange={(e) => setProductCategoryFilter(e.target.value)}
                      >
                        <option value="">Toutes les catégories</option>
                        {Array.from(new Set(products.map(p => p.category))).sort().map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 relative">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Rechercher un produit</label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                          type="text"
                          placeholder="Nom, référence..."
                          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                        />
                      </div>

                      {/* Floating Dropdown */}
                      {(productSearch || productCategoryFilter) && !selectedProduct && (
                        <div className="absolute top-full left-0 right-0 mt-2 z-[110] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl shadow-slate-200/50 dark:shadow-none max-h-[300px] overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-200">
                          <div className="p-2 space-y-1">
                            {products
                              .filter(p => {
                                const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                                  p.reference.toLowerCase().includes(productSearch.toLowerCase()) ||
                                  p.barcode?.toLowerCase().includes(productSearch.toLowerCase());
                                const matchesCategory = !productCategoryFilter || p.category === productCategoryFilter;
                                return matchesSearch && matchesCategory;
                              })
                              .map(p => (
                                <button
                                  key={p.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedProduct(p);
                                    setItemData({
                                      variantId: '',
                                      quantity: 1,
                                      unitPrice: p.salePrice || 0
                                    });
                                    setProductSearch('');
                                  }}
                                  className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-primary/5 transition-all text-left group"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-primary transition-colors">
                                      <Package size={16} />
                                    </div>
                                    <div>
                                      <h4 className="font-bold text-slate-900 dark:text-white text-xs">{p.name}</h4>
                                      <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
                                        {p.category} • Ref: {p.reference}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-bold text-primary text-xs">
                                      {p.salePrice.toLocaleString()} DT
                                    </div>
                                    <div className={cn(
                                      "text-[9px] font-bold mt-0.5",
                                      p.stockQuantity > 0 ? "text-success" : "text-danger"
                                    )}>
                                      {p.stockQuantity} en stock
                                    </div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Current Item Configuration */}
              {selectedProduct && (
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                          <Package size={20} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-sm">{selectedProduct.name}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
                            {selectedProduct.reference}
                          </p>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => setSelectedProduct(null)}
                        className="text-slate-400 hover:text-danger transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Variante</label>
                          <select
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                            value={itemData.variantId}
                            onChange={(e) => setItemData({ ...itemData, variantId: e.target.value })}
                          >
                            <option value="">Standard</option>
                            {selectedProduct.variants.map(v => (
                              <option key={v.id} value={v.id}>{v.name} ({v.stockQuantity})</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Quantité</label>
                        <input
                          type="number"
                          min="1"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          value={itemData.quantity}
                          onChange={(e) => setItemData({ ...itemData, quantity: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Prix Unitaire</label>
                        <input
                          type="number"
                          min="0"
                          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
                          value={itemData.unitPrice}
                          onChange={(e) => setItemData({ ...itemData, unitPrice: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const variantName = selectedProduct.variants?.find(v => v.id === itemData.variantId)?.name;
                        setCreditSaleData({
                          ...creditSaleData,
                          items: [
                            ...creditSaleData.items,
                            {
                              productId: selectedProduct.id,
                              productName: selectedProduct.name,
                              variantId: itemData.variantId,
                              variantName,
                              quantity: itemData.quantity,
                              unitPrice: itemData.unitPrice
                            }
                          ]
                        });
                        setSelectedProduct(null);
                        setProductSearch('');
                        setProductCategoryFilter('');
                      }}
                      className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                    >
                      Ajouter au panier
                    </button>
                  </div>
                )}

              {/* Items List Section */}
              <div className="space-y-4">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">Produits ajoutés ({creditSaleData.items.length})</label>
                <div className="space-y-2">
                  {creditSaleData.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                          <Package size={16} />
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white text-xs">{item.productName}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400">
                            {item.quantity} x {item.unitPrice.toLocaleString()} DT {item.variantName ? `• ${item.variantName}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right font-bold text-slate-900 dark:text-white text-xs">
                          {(item.quantity * item.unitPrice).toLocaleString()} DT
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = [...creditSaleData.items];
                            newItems.splice(index, 1);
                            setCreditSaleData({ ...creditSaleData, items: newItems });
                          }}
                          className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {creditSaleData.items.length === 0 && (
                    <div className="py-8 text-center border-2 border-dashed border-slate-50 dark:border-slate-800/50 rounded-2xl">
                      <p className="text-slate-400 dark:text-slate-500 text-xs font-medium">Aucun produit dans le panier</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Notes</label>
                  <textarea
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium"
                    rows={2}
                    value={creditSaleData.notes}
                    onChange={(e) => setCreditSaleData({...creditSaleData, notes: e.target.value})}
                  />
                </div>

                <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
                  <div className="flex justify-between text-base font-bold text-slate-900 dark:text-white">
                    <span>Total à créditer:</span>
                    <span>{creditSaleData.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0).toLocaleString()} DT</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex gap-4">
                  <button type="button" onClick={() => setIsCreditSaleModalOpen(false)} className="flex-1 px-6 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm">
                    {t('common.cancel')}
                  </button>
                  <button 
                    type="submit" 
                    disabled={creditSaleData.items.length === 0}
                    className="flex-1 px-6 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Valider la vente
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Clients;


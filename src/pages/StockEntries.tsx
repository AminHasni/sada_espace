import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { useTranslation } from 'react-i18next';
import { StockEntry, Product, StockEntryItem } from '../types';
import { 
  Plus, 
  Search, 
  X, 
  FileDown, 
  Calendar, 
  Truck, 
  CheckCircle2, 
  Package,
  History,
  Info,
  ChevronDown,
  ChevronUp,
  Trash2
} from 'lucide-react';
import { logActivity } from '../services/activity';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';

const StockEntries: React.FC = () => {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  const [formData, setFormData] = useState({
    entryNumber: `RECP-${Date.now().toString().slice(-6)}`,
    type: 'adjustment_plus' as StockEntry['type'],
    receptionDate: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
    items: [] as StockEntryItem[]
  });

  useEffect(() => {
    if (!profile) return;

    const qEntries = query(collection(db, 'stock_entries'), orderBy('createdAt', 'desc'));
    const unsubscribeEntries = onSnapshot(qEntries, (snapshot) => {
      setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockEntry[]);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stock_entries'));

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);
    });

    return () => {
      unsubscribeEntries();
      unsubscribeProducts();
    };
  }, [profile]);

  const handleOpenModal = () => {
    setFormData({
      entryNumber: `RECP-${Date.now().toString().slice(-6)}`,
      type: 'adjustment_plus',
      receptionDate: new Date().toISOString().split('T')[0],
      reference: '',
      notes: '',
      items: []
    });
    setIsModalOpen(true);
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { productId: '', productName: '', quantity: '' as any, unitPrice: 0, batchNumber: '', expiryDate: '' }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const updateItemField = (index: number, field: keyof StockEntryItem, value: any) => {
    const newItems = [...formData.items];
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      newItems[index] = { 
        ...newItems[index], 
        productId: value, 
        productName: product?.name || '', 
        unitPrice: product?.purchasePrice || 0 
      };
    } else {
      newItems[index] = { ...newItems[index], [field]: value };
    }
    setFormData({ ...formData, items: newItems });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    try {
      await runTransaction(db, async (transaction) => {
        const entryRef = doc(collection(db, 'stock_entries'));
        
        // 1. All Reads
        const productRefs = formData.items.map(item => doc(db, 'products', item.productId));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        // 2. All Writes
        for (let i = 0; i < formData.items.length; i++) {
          const item = formData.items[i];
          const productRef = productRefs[i];
          const productSnap = productSnaps[i];

          if (productSnap.exists()) {
            const currentStock = productSnap.data().stockQuantity || 0;
            const newStock = currentStock + item.quantity;
            transaction.update(productRef, { stockQuantity: newStock });
            
            const historyRef = doc(collection(db, 'stock_history'));
            transaction.set(historyRef, {
              productId: item.productId,
              productName: item.productName,
              type: 'entry',
              quantity: item.quantity,
              previousStock: currentStock,
              newStock: newStock,
              documentId: entryRef.id,
              documentReference: formData.entryNumber,
              date: new Date().toISOString(),
              performedBy: profile.uid,
              performedByName: profile.displayName
            });
          }
        }

        // 3. Create Stock Entry
        const entryData = {
          ...formData,
          receivedBy: profile.uid,
          receivedByName: profile.displayName,
          createdAt: new Date().toISOString()
        };
        transaction.set(entryRef, entryData);

        // 4. Log Activity
        const logRef = doc(collection(db, 'logs'));
        transaction.set(logRef, {
          userId: profile.uid,
          userName: profile.displayName,
          action: 'stock_entry',
          details: `Entrée de stock: ${formData.entryNumber} (${formData.type})`,
          timestamp: new Date().toISOString()
        });
      });

      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'stock_entries');
    }
  };

  const filteredEntries = entries.filter(e => 
    e.entryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.supplierName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('stockEntries.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t('stockEntries.subtitle')}</p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
          <button onClick={handleOpenModal} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> {t('stockEntries.newReception')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <Search className="text-slate-400" size={20} />
        <input 
          type="text" 
          placeholder={t('stockEntries.searchPlaceholder')}
          className="flex-1 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-4">
        {filteredEntries.map((entry) => (
          <div key={entry.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden hover:border-primary/20 transition-all">
            <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-green-50 dark:bg-green-900/20 flex items-center justify-center text-green-600 dark:text-green-400">
                  <FileDown size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{entry.entryNumber}</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium">
                    {t('stockEntries.directEntry')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Truck size={16} className="text-slate-400" />
                  <span>{entry.supplierName || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Calendar size={16} className="text-slate-400" />
                  <span>{format(new Date(entry.receptionDate), 'dd MMM yyyy', { locale: dateLocale })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setExpandedEntryId(expandedEntryId === entry.id ? null : entry.id)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                  >
                    {expandedEntryId === entry.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>
            </div>

            {expandedEntryId === entry.id && (
              <div className="px-6 pb-6 pt-2 border-t border-slate-50 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="px-4 py-3">{t('stockEntries.table.product')}</th>
                        <th className="px-4 py-3 text-center">{t('stockEntries.table.receivedQuantity')}</th>
                        <th className="px-4 py-3">{t('stockEntries.table.batchExpiry')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {entry.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.productName}</td>
                          <td className="px-4 py-3 text-center font-bold text-green-600 dark:text-green-400">+{item.quantity}</td>
                          <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                            {item.batchNumber && <span className="block text-xs">Lot: {item.batchNumber}</span>}
                            {item.expiryDate && <span className="block text-xs">Exp: {format(new Date(item.expiryDate), 'dd/MM/yyyy')}</span>}
                            {!item.batchNumber && !item.expiryDate && '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 italic">
                  <span>{t('stockEntries.receivedBy', { name: entry.receivedByName })}</span>
                  {entry.notes && <span>{t('common.notes')}: {entry.notes}</span>}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('stockEntries.modal.title')}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all shadow-sm">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t('stockEntries.modal.entryNumber')}</label>
                  <input type="text" readOnly className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400" value={formData.entryNumber} />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t('stockEntries.modal.type')}</label>
                  <select 
                    required 
                    className="w-full px-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as StockEntry['type'], items: []})}
                  >
                    <option value="return_from_client">{t('stockEntries.types.return_from_client')}</option>
                    <option value="adjustment_plus">{t('stockEntries.types.adjustment_plus')}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t('stockEntries.modal.reference')}</label>
                  <input 
                    type="text" 
                    placeholder="ex: Client X, Inventaire..."
                    className="w-full px-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    value={formData.reference}
                    onChange={(e) => setFormData({...formData, reference: e.target.value})}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t('stockEntries.modal.date')}</label>
                  <input type="date" required className="w-full px-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" value={formData.receptionDate} onChange={(e) => setFormData({...formData, receptionDate: e.target.value})} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Package size={20} className="text-primary" /> {t('stockEntries.modal.itemsTitle')}
                  </h3>
                  <button type="button" onClick={addItem} className="text-primary hover:text-primary/80 font-semibold text-sm flex items-center gap-1">
                    <Plus size={16} /> {t('stockEntries.modal.addItem')}
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 items-end">
                      <div className="md:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.product')}</label>
                        <select 
                          required 
                          className="w-full px-3 py-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                          value={item.productId}
                          onChange={(e) => updateItemField(index, 'productId', e.target.value)}
                        >
                          <option value="">{t('stockEntries.modal.selectProduct')}</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.quantity')}</label>
                        <input 
                          type="number" 
                          min="1" 
                          required 
                          className="w-full px-3 py-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-green-600 dark:text-green-400"
                          value={(item.quantity as any) === '' ? '' : (isNaN(item.quantity as any) ? '' : item.quantity)}
                          onChange={(e) => {
                            const val = e.target.value;
                            updateItemField(index, 'quantity', val === '' ? '' as any : parseInt(val));
                          }}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.batch')}</label>
                        <input 
                          type="text" 
                          placeholder="Batch #"
                          className="w-full px-3 py-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                          value={item.batchNumber}
                          onChange={(e) => updateItemField(index, 'batchNumber', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.expiry')}</label>
                        <input 
                          type="date" 
                          className="w-full px-3 py-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm"
                          value={item.expiryDate}
                          onChange={(e) => updateItemField(index, 'expiryDate', e.target.value)}
                        />
                      </div>
                      <div className="md:col-span-1">
                        <button type="button" onClick={() => removeItem(index)} className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors mt-6">
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {formData.items.length === 0 && (
                    <div className="text-center py-8 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-slate-400 dark:text-slate-500 flex flex-col items-center gap-2">
                      <Info size={32} />
                      <p>
                        {t('stockEntries.modal.noItemsManual')}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 ml-1">{t('stockEntries.modal.notes')}</label>
                <textarea className="w-full px-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white" rows={2} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
            </form>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-6 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-semibold hover:bg-white dark:hover:bg-slate-800 transition-all">
                {t('stockEntries.modal.cancel')}
              </button>
              <button 
                type="submit" 
                onClick={handleSubmit} 
                disabled={formData.items.length === 0}
                className="flex-1 px-6 py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('stockEntries.modal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StockEntries;

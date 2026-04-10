import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  orderBy,
  runTransaction,
  where,
  limit
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
  Trash2,
  ArrowUpRight
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
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [listCategoryFilter, setListCategoryFilter] = useState('');
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});
  const [currentSession, setCurrentSession] = useState<any | null>(null);
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
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'products'));

    const qSession = query(
      collection(db, 'cash_sessions'),
      where('userId', '==', profile.uid),
      where('status', '==', 'open'),
      limit(1)
    );
    const unsubscribeSession = onSnapshot(qSession, (snapshot) => {
      if (!snapshot.empty) {
        setCurrentSession({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any);
      } else {
        setCurrentSession(null);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, 'cash_sessions'));

    return () => {
      unsubscribeEntries();
      unsubscribeProducts();
      unsubscribeSession();
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
    setProductSearch('');
    setSelectedCategory('');
    setVariantPickerProduct(null);
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
        
        // 1. Group items by product to handle multiple variants of the same product
        const itemsByProduct = formData.items.reduce((acc, item) => {
          if (!acc[item.productId]) acc[item.productId] = [];
          acc[item.productId].push(item);
          return acc;
        }, {} as Record<string, StockEntryItem[]>);

        const uniqueProductIds = Object.keys(itemsByProduct);
        const productRefs = uniqueProductIds.map(id => doc(db, 'products', id));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));

        // 2. All Writes
        for (let i = 0; i < uniqueProductIds.length; i++) {
          const productId = uniqueProductIds[i];
          const productRef = productRefs[i];
          const productSnap = productSnaps[i];
          const productItems = itemsByProduct[productId];

          if (productSnap.exists()) {
            const productData = productSnap.data() as Product;
            const totalQuantityToEntry = productItems.reduce((sum, item) => sum + item.quantity, 0);
            const currentStock = productData.stockQuantity || 0;
            const newStock = currentStock + totalQuantityToEntry;

            let updatedVariants = productData.variants ? [...productData.variants] : undefined;
            
            // Update variant stocks if applicable
            for (const item of productItems) {
              if (item.variantId && updatedVariants) {
                const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
                if (variantIndex !== -1) {
                  const variant = updatedVariants[variantIndex];
                  updatedVariants[variantIndex] = {
                    ...variant,
                    stockQuantity: variant.stockQuantity + item.quantity
                  };
                }
              }
            }

            transaction.update(productRef, { 
              stockQuantity: newStock,
              variants: updatedVariants,
              updatedAt: new Date().toISOString()
            });
            
            // History records for each variant/item
            for (const item of productItems) {
              const historyRef = doc(collection(db, 'stock_history'));
              transaction.set(historyRef, {
                productId: item.productId,
                productName: item.productName,
                variantId: item.variantId || null,
                variantName: item.variantName || null,
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
        }

        // 3. Create Stock Entry
        const sanitizedItems = formData.items.map(item => ({
          ...item,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
        }));

        const entryData = {
          ...formData,
          items: sanitizedItems,
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
          details: t('stockEntries.logs.entry', { 
            number: formData.entryNumber, 
            type: t(`stockEntries.types.${formData.type}`) 
          }),
          timestamp: new Date().toISOString()
        });
      });

      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'stock_entries');
    }
  };

  const filteredEntries = entries.filter(e => {
    const matchesSearch = e.entryNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.supplierName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !listCategoryFilter || e.items.some(item => {
      const product = products.find(p => p.id === item.productId);
      return product?.category === listCategoryFilter;
    });

    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('stockEntries.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t('stockEntries.subtitle')}</p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
          <div className="flex flex-col items-end gap-2">
            <button 
              onClick={handleOpenModal} 
              disabled={!currentSession}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!currentSession ? "Veuillez ouvrir une session de caisse d'abord" : ""}
            >
              <Plus size={20} /> {t('stockEntries.newReception')}
            </button>
            {!currentSession && (
              <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Caisse non ouverte
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex-1 flex items-center gap-4">
          <Search className="text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder={t('stockEntries.searchPlaceholder')}
            className="flex-1 bg-transparent border-none focus:ring-0 text-slate-900 dark:text-white placeholder:text-slate-400"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="w-full md:w-64">
          <select
            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all text-sm"
            value={listCategoryFilter}
            onChange={(e) => setListCategoryFilter(e.target.value)}
          >
            <option value="">{t('stock.allCategories')}</option>
            {Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort().map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
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
                  <span>{entry.supplierName || t('common.na')}</span>
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
                            {item.batchNumber && <span className="block text-xs">{t('stockEntries.table.batch')}: {item.batchNumber}</span>}
                            {item.expiryDate && <span className="block text-xs">{t('stockEntries.table.expiry')}: {format(new Date(item.expiryDate), 'dd/MM/yyyy')}</span>}
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
                    placeholder={t('stockEntries.modal.referencePlaceholder')}
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
                </div>

                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      placeholder={t('stockExits.modal.searchProduct')}
                      className="w-full pl-12 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                  <div className="md:w-64">
                    <select
                      className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium"
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    >
                      <option value="">{t('stock.allCategories')}</option>
                      {Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort().map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                </div>

                  <div className="relative">
                    {(productSearch || selectedCategory) && (
                      <div className="absolute z-20 w-full -mt-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl max-h-64 overflow-y-auto">
                        {products.filter(p => 
                          (p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.reference.toLowerCase().includes(productSearch.toLowerCase())) && 
                          (!selectedCategory || p.category === selectedCategory) &&
                          !formData.items.find(i => i.productId === p.id)
                        ).map(p => (
                          <button
                            key={p.id}
                            type="button"
                            className="w-full text-left px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors"
                            onClick={() => {
                              if (p.variants && p.variants.length > 0) {
                                setVariantPickerProduct(p);
                                const initialQs: Record<string, number> = {};
                                p.variants.forEach(v => initialQs[v.id] = 0);
                                setVariantQuantities(initialQs);
                              } else {
                                setFormData({
                                  ...formData,
                                  items: [...formData.items, { 
                                    productId: p.id, 
                                    productName: p.name, 
                                    category: p.category,
                                    quantity: 1, 
                                    unitPrice: p.purchasePrice || 0, 
                                    batchNumber: '', 
                                    expiryDate: '' 
                                  }]
                                });
                                setProductSearch('');
                                setSelectedCategory('');
                              }
                            }}
                          >
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white block">{p.name}</span>
                              <span className="text-xs text-slate-500 dark:text-slate-400">{p.reference}</span>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              <div>
                                <span className="text-sm font-bold text-primary block">{p.purchasePrice?.toLocaleString()} {t('common.currency')}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t('stock.currentStock')}: {p.stockQuantity}</span>
                              </div>
                              <div className="p-2 bg-primary/5 rounded-lg text-primary">
                                <ArrowUpRight size={18} />
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    {variantPickerProduct && (
                      <div className="absolute z-30 inset-x-0 -mt-4 bg-white dark:bg-slate-800 border-2 border-primary/30 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
                        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-primary/5">
                          <div>
                            <h4 className="font-bold text-slate-900 dark:text-white">{variantPickerProduct.name}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{t('stock.selectVariants')}</p>
                          </div>
                          <button onClick={() => setVariantPickerProduct(null)} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
                            <X size={18} />
                          </button>
                        </div>
                        <div className="p-5 space-y-4 max-h-80 overflow-y-auto">
                          {variantPickerProduct.variants?.map(variant => (
                            <div key={variant.id} className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                              <div className="flex-1">
                                <span className="font-semibold text-slate-800 dark:text-slate-200 block">{variant.name}</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400">{t('stock.currentStock')}: <span className="font-bold text-slate-700 dark:text-slate-300">{variant.stockQuantity}</span></span>
                              </div>
                              <div className="flex items-center gap-3">
                                <input 
                                  type="number"
                                  min="0"
                                  className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-bold text-center focus:ring-2 focus:ring-primary/20"
                                  value={variantQuantities[variant.id] || 0}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    setVariantQuantities({...variantQuantities, [variant.id]: val});
                                  }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-700 flex gap-3">
                          <button 
                            type="button"
                            onClick={() => setVariantPickerProduct(null)}
                            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-white transition-all"
                          >
                            {t('common.cancel')}
                          </button>
                          <button 
                            type="button"
                            onClick={() => {
                              const newItems: StockEntryItem[] = [];
                              Object.entries(variantQuantities).forEach(([vId, qty]) => {
                                if (qty > 0) {
                                  const variant = variantPickerProduct.variants?.find(v => v.id === vId);
                                  newItems.push({
                                    productId: variantPickerProduct.id,
                                    productName: variantPickerProduct.name,
                                    category: variantPickerProduct.category,
                                    variantId: vId,
                                    variantName: variant?.name,
                                    quantity: qty,
                                    unitPrice: variantPickerProduct.purchasePrice || 0,
                                    batchNumber: '',
                                    expiryDate: ''
                                  });
                                }
                              });
                              
                              if (newItems.length > 0) {
                                setFormData({
                                  ...formData,
                                  items: [...formData.items, ...newItems]
                                });
                              }
                              setVariantPickerProduct(null);
                              setProductSearch('');
                              setSelectedCategory('');
                            }}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-bold text-sm hover:bg-primary/90 transition-all shadow-md shadow-primary/20"
                          >
                            {t('common.add')} ({Object.values(variantQuantities).reduce((a, b) => a + b, 0)})
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                
                <div className="space-y-3">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 items-end shadow-sm">
                      <div className="md:col-span-4 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.product')}</label>
                        <div className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-medium h-[38px] flex items-center justify-between">
                          <span>{item.productName}</span>
                          {item.variantName && (
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              {item.variantName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.quantity')}</label>
                        <input 
                          type="text" 
                          inputMode="decimal"
                          required 
                          className="w-full px-3 py-2 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-green-600 dark:text-green-400"
                          value={(item.quantity as any) === '' ? '' : (isNaN(item.quantity as any) ? '' : item.quantity)}
                          onChange={(e) => {
                            const val = e.target.value.replace(',', '.');
                            if (val === '' || !isNaN(Number(val)) || val === '.') {
                              updateItemField(index, 'quantity', val === '' ? '' as any : parseFloat(val));
                            }
                          }}
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">{t('stockEntries.modal.batch')}</label>
                        <input 
                          type="text" 
                          placeholder={t('stockEntries.modal.batchPlaceholder')}
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

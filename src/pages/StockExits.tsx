import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  doc, 
  query, 
  orderBy,
  runTransaction,
  where
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { useTranslation } from 'react-i18next';
import { StockExit, Client, Product, StockExitItem, UserProfile } from '../types';
import { 
  Plus, 
  Search, 
  X, 
  FileUp, 
  Calendar, 
  User, 
  Package,
  Info,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Briefcase,
  Trash2,
  ArrowUpRight
} from 'lucide-react';
import { logActivity } from '../services/activity';
import { notificationService } from '../services/notificationService';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';

const StockExits: React.FC = () => {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [exits, setExits] = useState<StockExit[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [notifiedUsers, setNotifiedUsers] = useState<UserProfile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedExitId, setExpandedExitId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [listCategoryFilter, setListCategoryFilter] = useState('');
  const [variantPickerProduct, setVariantPickerProduct] = useState<Product | null>(null);
  const [variantQuantities, setVariantQuantities] = useState<Record<string, number>>({});

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  const [formData, setFormData] = useState({
    exitNumber: `SORT-${Date.now().toString().slice(-6)}`,
    type: 'sale' as StockExit['type'],
    clientId: '',
    projectId: '',
    projectName: '',
    serviceName: '',
    exitDate: new Date().toISOString().split('T')[0],
    paymentStatus: 'paid' as 'paid' | 'credit',
    amountPaid: '' as any,
    notes: '',
    items: [] as StockExitItem[]
  });

  useEffect(() => {
    if (!profile) return;

    const qExits = query(collection(db, 'stock_exits'), orderBy('createdAt', 'desc'));
    const unsubscribeExits = onSnapshot(qExits, (snapshot) => {
      setExits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StockExit[]);
      setLoading(false);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'stock_exits'));

    const unsubscribeClients = onSnapshot(collection(db, 'clients'), (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Client[]);
    });

    const unsubscribeProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[]);
    });

    const unsubscribeUsers = onSnapshot(query(collection(db, 'users'), where('role', 'in', ['admin', 'warehouseman'])), (snapshot) => {
      const usersList = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[];
      setNotifiedUsers(usersList);
    });

    return () => {
      unsubscribeExits();
      unsubscribeClients();
      unsubscribeProducts();
      unsubscribeUsers();
    };
  }, [profile]);

  const handleOpenModal = () => {
    setFormData({
      exitNumber: `SORT-${Date.now().toString().slice(-6)}`,
      type: 'sale',
      clientId: '',
      projectId: '',
      projectName: '',
      serviceName: '',
      exitDate: new Date().toISOString().split('T')[0],
      paymentStatus: 'paid',
      amountPaid: '' as any,
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
      items: [...formData.items, { productId: '', productName: '', quantity: 1, unitPrice: '' as any }]
    });
  };

  const removeItem = (index: number) => {
    const newItems = [...formData.items];
    newItems.splice(index, 1);
    setFormData({ ...formData, items: newItems });
  };

  const updateItem = (index: number, field: keyof StockExitItem, value: any) => {
    const newItems = [...formData.items];
    if (field === 'productId') {
      const product = products.find(p => p.id === value);
      newItems[index] = { 
        ...newItems[index], 
        productId: value, 
        productName: product?.name || '', 
        unitPrice: product?.salePrice === undefined ? '' as any : product.salePrice
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
        const exitRef = doc(collection(db, 'stock_exits'));
        
        // 1. Group items by product to handle multiple variants of the same product
        const itemsByProduct = formData.items.reduce((acc, item) => {
          if (!acc[item.productId]) acc[item.productId] = [];
          acc[item.productId].push(item);
          return acc;
        }, {} as Record<string, StockExitItem[]>);

        const uniqueProductIds = Object.keys(itemsByProduct);
        const productRefs = uniqueProductIds.map(id => doc(db, 'products', id));
        const productSnaps = await Promise.all(productRefs.map(ref => transaction.get(ref)));
        
        let clientSnap = null;
        let clientRef = null;
        if (formData.type === 'sale' && formData.clientId) {
          clientRef = doc(db, 'clients', formData.clientId);
          clientSnap = await transaction.get(clientRef);
        }

        // 2. All Writes
        for (let i = 0; i < uniqueProductIds.length; i++) {
          const productId = uniqueProductIds[i];
          const productRef = productRefs[i];
          const productSnap = productSnaps[i];
          const productItems = itemsByProduct[productId];
          
          if (!productSnap.exists()) {
            throw new Error(`Produit non trouvé: ${productId}`);
          }

          const productData = productSnap.data() as Product;
          const totalQuantityToExit = productItems.reduce((sum, item) => sum + item.quantity, 0);
          const currentStock = productData.stockQuantity || 0;

          if (currentStock < totalQuantityToExit) {
            throw new Error(`Stock insuffisant pour ${productData.name}. Disponible: ${currentStock}, Demandé: ${totalQuantityToExit}`);
          }

          let updatedVariants = productData.variants ? [...productData.variants] : undefined;
          
          // Update variant stocks if applicable
          for (const item of productItems) {
            if (item.variantId && updatedVariants) {
              const variantIndex = updatedVariants.findIndex(v => v.id === item.variantId);
              if (variantIndex !== -1) {
                const variant = updatedVariants[variantIndex];
                if (variant.stockQuantity < item.quantity) {
                  throw new Error(`Stock insuffisant pour la variante ${variant.name} de ${productData.name}. Disponible: ${variant.stockQuantity}`);
                }
                updatedVariants[variantIndex] = {
                  ...variant,
                  stockQuantity: variant.stockQuantity - item.quantity
                };
              }
            }
          }

          const newStock = currentStock - totalQuantityToExit;
          transaction.update(productRef, { 
            stockQuantity: newStock,
            variants: updatedVariants,
            updatedAt: new Date().toISOString()
          });

          // Send low stock notification if below threshold
          if (updatedVariants) {
            for (const variant of updatedVariants) {
              const variantMinStock = variant.minStockLevel ?? productData.minStockLevel ?? 0;
              if (variant.stockQuantity <= variantMinStock) {
                notifiedUsers.forEach(user => {
                  notificationService.sendNotification({
                    userId: user.uid,
                    title: 'Alerte Stock Faible',
                    message: `La variante "${variant.name}" du produit "${productData.name}" a atteint un niveau de stock faible (${variant.stockQuantity} restants).`,
                    type: 'warning',
                    link: `/stock?search=${encodeURIComponent(productData.name)}`
                  }).catch(err => console.error('Error sending low stock notification:', err));
                });
              }
            }
          } else {
            const minStock = productData.minStockLevel || 0;
            if (newStock <= minStock) {
              notifiedUsers.forEach(user => {
                notificationService.sendNotification({
                  userId: user.uid,
                  title: 'Alerte Stock Faible',
                  message: `Le produit "${productData.name}" a atteint un niveau de stock faible (${newStock} restants).`,
                  type: 'warning',
                  link: `/stock?search=${encodeURIComponent(productData.name)}`
                }).catch(err => console.error('Error sending low stock notification:', err));
              });
            }
          }
          
          // History records for each variant/item
          for (const item of productItems) {
            const historyRef = doc(collection(db, 'stock_history'));
            transaction.set(historyRef, {
              productId: item.productId,
              productName: item.productName,
              variantId: item.variantId || null,
              variantName: item.variantName || null,
              type: 'exit',
              quantity: item.quantity,
              previousStock: currentStock, // This is slightly simplified for multi-item products
              newStock: newStock,
              documentId: exitRef.id,
              documentReference: formData.exitNumber,
              date: new Date().toISOString(),
              performedBy: profile.uid,
              performedByName: profile.displayName
            });
          }
        }

        // 3. Create Stock Exit
        const client = clients.find(c => c.id === formData.clientId);
        const totalAmount = formData.items.reduce((sum, item) => sum + (item.quantity * (Number(item.unitPrice) || 0)), 0);
        
        const sanitizedItems = formData.items.map(item => ({
          ...item,
          variantId: item.variantId || null,
          variantName: item.variantName || null,
        }));
        
        const exitData = {
          ...formData,
          items: sanitizedItems,
          totalAmount,
          clientName: client?.name || '',
          performedBy: profile.uid,
          performedByName: profile.displayName,
          createdAt: new Date().toISOString()
        };
        transaction.set(exitRef, exitData);

        // 4. Update Client Credit if it's a sale to a client
        if (formData.type === 'sale' && formData.clientId && clientRef && clientSnap) {
          if (clientSnap.exists()) {
            const currentCredit = clientSnap.data().totalCredit || 0;
            const creditToAdd = totalAmount - (Number(formData.amountPaid) || 0);
            if (creditToAdd > 0) {
              transaction.update(clientRef, { totalCredit: currentCredit + creditToAdd });
            }
          }

          // Also record a payment if there was an upfront payment
          if (Number(formData.amountPaid) > 0) {
            const paymentRef = doc(collection(db, 'payments'));
            transaction.set(paymentRef, {
              clientId: formData.clientId,
              clientName: client?.name || '',
              amount: Number(formData.amountPaid),
              date: formData.exitDate,
              method: 'cash',
              notes: `Paiement initial pour la vente ${formData.exitNumber}`,
              performedBy: profile.uid,
              performedByName: profile.displayName,
              createdAt: new Date().toISOString()
            });
          }
        }

        // 5. Log Activity
        const logRef = doc(collection(db, 'logs'));
        transaction.set(logRef, {
          userId: profile.uid,
          userName: profile.displayName,
          action: 'stock_exit',
          details: t('stockExits.logs.exit', { 
            number: formData.exitNumber, 
            type: t(`stockExits.types.${formData.type}`) 
          }),
          timestamp: new Date().toISOString()
        });
      });

      setIsModalOpen(false);
    } catch (error: any) {
      if (error.message.includes('Stock insuffisant')) {
        alert(error.message);
      } else {
        handleFirestoreError(error, OperationType.WRITE, 'stock_exits');
      }
    }
  };

  const filteredExits = exits.filter(e => {
    const matchesSearch = e.exitNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.projectName?.toLowerCase().includes(searchTerm.toLowerCase());
    
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
          <h1 className="text-2xl font-display font-bold text-slate-900 dark:text-white">{t('stockExits.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400">{t('stockExits.subtitle')}</p>
        </div>
        {(profile?.role === 'admin' || profile?.role === 'warehouseman') && (
          <button onClick={handleOpenModal} className="btn-primary flex items-center gap-2">
            <Plus size={20} /> {t('stockExits.newExit')}
          </button>
        )}
      </div>

      <div className="flex flex-col md:flex-row items-center gap-4 bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex-1 flex items-center gap-4">
          <Search className="text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder={t('stockExits.searchPlaceholder')}
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
            <option value="">{t('stock.allCategories', 'Toutes les catégories')}</option>
            {Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort().map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {filteredExits.map((exit) => (
          <div key={exit.id} className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden hover:border-primary/20 transition-all">
            <div className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-900/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <FileUp size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{exit.exitNumber}</h3>
                  <p className="text-slate-500 dark:text-slate-400 font-medium capitalize">
                    {exit.type === 'sale' ? t('stockExits.types.sale') : 
                     exit.type === 'internal_consumption' ? t('stockExits.types.internal_consumption') :
                     exit.type === 'project_delivery' ? t('stockExits.types.project_delivery') :
                     exit.type === 'return_to_supplier' ? t('stockExits.types.return_to_supplier') :
                     exit.type === 'adjustment_minus' ? t('stockExits.types.adjustment_minus') :
                     (exit.type as string).replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6 text-sm">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <User size={16} className="text-slate-400" />
                  <span>{exit.clientName || exit.projectName || exit.serviceName || t('common.na')}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Calendar size={16} className="text-slate-400" />
                  <span>{format(new Date(exit.exitDate), 'dd MMM yyyy', { locale: dateLocale })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setExpandedExitId(expandedExitId === exit.id ? null : exit.id)}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 transition-colors"
                  >
                    {expandedExitId === exit.id ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </button>
                </div>
              </div>
            </div>

            {expandedExitId === exit.id && (
              <div className="px-6 pb-6 pt-2 border-t border-slate-50 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30">
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold">
                      <tr>
                        <th className="px-4 py-3">{t('stockExits.table.product')}</th>
                        <th className="px-4 py-3 text-center">{t('stockExits.table.quantity')}</th>
                        <th className="px-4 py-3 text-right">{t('stockExits.table.unitPrice')}</th>
                        <th className="px-4 py-3 text-right">{t('stockExits.table.total')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                      {exit.items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{item.productName}</td>
                          <td className="px-4 py-3 text-center font-bold text-orange-600 dark:text-orange-400">-{item.quantity}</td>
                          <td className="px-4 py-3 text-right dark:text-slate-300">{(Number(item.unitPrice) || 0).toLocaleString()} {t('common.currency')}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">{(item.quantity * (Number(item.unitPrice) || 0)).toLocaleString()} {t('common.currency')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500 italic">
                  <span>{t('stockExits.processedBy', { name: exit.performedByName })}</span>
                  {exit.notes && <span>{t('common.notes')}: {exit.notes}</span>}
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
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">{t('stockExits.modal.title')}</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-all shadow-sm">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('stockExits.modal.exitNumber')}</label>
                  <input type="text" readOnly className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-medium" value={formData.exitNumber} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('stockExits.modal.type')}</label>
                  <select 
                    required 
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium"
                    value={formData.type}
                    onChange={(e) => setFormData({...formData, type: e.target.value as StockExit['type']})}
                  >
                    <option value="sale">{t('stockExits.types.sale')}</option>
                    <option value="internal_consumption">{t('stockExits.types.internal_consumption')}</option>
                    <option value="return_to_supplier">{t('stockExits.types.return_to_supplier')}</option>
                    <option value="adjustment_minus">{t('stockExits.types.adjustment_minus')}</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('stockExits.modal.date')}</label>
                  <input type="date" required className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium" value={formData.exitDate} onChange={(e) => setFormData({...formData, exitDate: e.target.value})} />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2 text-lg">
                    <Package size={20} className="text-primary" /> {t('stockExits.modal.itemsTitle')}
                  </h3>
                </div>
                
                <div className="flex flex-col md:flex-row gap-4 mb-6">
                  <div className="flex-1 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                      type="text"
                      placeholder={t('stockExits.modal.searchProduct')}
                      className="w-full pl-12 pr-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium text-lg"
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                    />
                  </div>
                  <div className="md:w-64">
                    <select
                      className="w-full px-4 py-3.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all font-medium h-[58px]"
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
                  {productSearch && (
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
                                  unitPrice: p.salePrice === undefined ? '' as any : p.salePrice 
                                }]
                              });
                              setProductSearch('');
                            }
                          }}
                        >
                          <div>
                            <span className="font-bold text-slate-900 dark:text-white block">{p.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{p.reference}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold text-primary block">{p.salePrice?.toLocaleString()} {t('common.currency')}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{t('stock.currentStock')}: {p.stockQuantity}</span>
                          </div>
                        </button>
                      ))}
                      {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()) && !formData.items.find(i => i.productId === p.id)).length === 0 && (
                        <div className="px-6 py-8 text-slate-500 text-center flex flex-col items-center justify-center">
                          <Package size={32} className="text-slate-300 dark:text-slate-600 mb-2" />
                          <p>{t('stock.noProductFound')}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {variantPickerProduct && (
                    <div className="absolute z-30 inset-x-0 -mt-4 bg-white dark:bg-slate-800 border-2 border-primary/30 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-300">
                      <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center bg-primary/5">
                        <div>
                          <h4 className="font-bold text-slate-900 dark:text-white">{variantPickerProduct.name}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{t('stock.selectVariants')}</p>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            type="button"
                            onClick={() => {
                              const allOut: Record<string, number> = {};
                              variantPickerProduct.variants?.forEach(v => allOut[v.id] = v.stockQuantity);
                              setVariantQuantities(allOut);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-xs font-bold hover:bg-orange-200 transition-colors"
                          >
                            {t('stock.exitAll')}
                          </button>
                          <button onClick={() => setVariantPickerProduct(null)} className="p-1.5 hover:bg-white dark:hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">
                            <X size={18} />
                          </button>
                        </div>
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
                                max={variant.stockQuantity}
                                className="w-24 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-bold text-center focus:ring-2 focus:ring-primary/20"
                                value={variantQuantities[variant.id] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setVariantQuantities({...variantQuantities, [variant.id]: Math.min(val, variant.stockQuantity)});
                                }}
                              />
                              <button 
                                type="button"
                                onClick={() => setVariantQuantities({...variantQuantities, [variant.id]: variant.stockQuantity})}
                                className="p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors"
                                title={t('stock.exitAllVariant')}
                              >
                                <ArrowUpRight size={18} />
                              </button>
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
                            const newItems: StockExitItem[] = [];
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
                                  unitPrice: variantPickerProduct.salePrice === undefined ? '' as any : variantPickerProduct.salePrice
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
                  {formData.items.map((item, index) => {
                    const product = products.find(p => p.id === item.productId);
                    const isStockInsufficient = product && product.stockQuantity < item.quantity;

                    return (
                      <div key={index} className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-5 rounded-2xl bg-white dark:bg-slate-800 shadow-sm border transition-all ${isStockInsufficient ? 'border-danger/50 bg-danger/5' : 'border-slate-200 dark:border-slate-700'}`}>
                        <div className="md:col-span-5 space-y-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('stockExits.modal.product')}</label>
                          <div className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm font-medium flex items-center h-[42px] justify-between">
                            <span>{item.productName}</span>
                            {item.variantName && (
                              <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                {item.variantName}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('stockExits.modal.quantity')}</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            required 
                            className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold focus:border-primary focus:ring-primary/20 transition-all ${isStockInsufficient ? 'text-danger' : 'text-orange-600 dark:text-orange-400'}`}
                            value={isNaN(item.quantity) ? '' : item.quantity}
                            onChange={(e) => {
                              const valStr = e.target.value.replace(',', '.');
                              if (valStr === '' || !isNaN(Number(valStr)) || valStr === '.') {
                                const val = valStr === '' ? 0 : parseFloat(valStr);
                                updateItem(index, 'quantity', isNaN(val) ? 0 : val);
                              }
                            }}
                          />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('stockExits.modal.unitPrice')}</label>
                          <input 
                            type="text" 
                            inputMode="decimal"
                            required 
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:border-primary focus:ring-primary/20 transition-all"
                            value={(item.unitPrice as any) === '' ? '' : (isNaN(item.unitPrice as any) ? '' : item.unitPrice)}
                            onChange={(e) => {
                              const val = e.target.value.replace(',', '.');
                              if (val === '' || !isNaN(Number(val)) || val === '.') {
                                updateItem(index, 'unitPrice', val === '' ? '' as any : parseFloat(val));
                              }
                            }}
                          />
                        </div>
                        <div className="md:col-span-2 space-y-2">
                          <label className="text-xs font-bold text-slate-500 dark:text-slate-400">{t('stockExits.modal.total')}</label>
                          <div className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center h-[42px]">
                            {(item.quantity * (Number(item.unitPrice) || 0)).toLocaleString()}
                          </div>
                        </div>
                        <div className="md:col-span-1 flex items-end justify-center pb-1">
                          <button type="button" onClick={() => removeItem(index)} className="p-2.5 text-danger hover:bg-danger/10 rounded-xl transition-colors" title={t('common.delete')}>
                            <Trash2 size={18} />
                          </button>
                        </div>
                        {isStockInsufficient && (
                          <div className="md:col-span-12 flex items-center gap-2 text-danger text-xs font-bold mt-1 bg-danger/10 p-2 rounded-lg">
                            <AlertTriangle size={14} />
                            {t('stockExits.modal.insufficientStock', { quantity: product.stockQuantity })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {formData.items.length === 0 && (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-3xl text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/30">
                      <Package size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                      <p>{t('stockExits.modal.noItems')}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t('stockExits.modal.notes')}</label>
                <textarea className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-primary/20 transition-all" rows={3} placeholder={t('stockExits.modal.notesPlaceholder')} value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
              </div>
            </form>
            <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex gap-4">
              <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-6 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-semibold hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm">
                {t('stockExits.modal.cancel')}
              </button>
              <button 
                type="submit" 
                onClick={handleSubmit} 
                disabled={formData.items.length === 0 || formData.items.some(item => {
                  const p = products.find(prod => prod.id === item.productId);
                  return p && p.stockQuantity < item.quantity;
                })}
                className="flex-1 px-6 py-3.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('stockExits.modal.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Re-importing Trash2 since it was used in removeItem but might be missing from imports
// Removed duplicate import

export default StockExits;

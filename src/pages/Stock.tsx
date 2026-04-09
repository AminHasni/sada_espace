import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, writeBatch } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, ProductVariant } from '../types';
import { useAuth } from '../components/AuthProvider';
import { Package, Plus, Search, Edit2, Trash2, AlertTriangle, X, Sparkles, Tag, Filter } from 'lucide-react';
import { analyzeStock } from '../services/gemini';
import { logActivity } from '../services/activity';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';

const Stock: React.FC = () => {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low'>('all');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);

  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    reference: '',
    category: '',
    description: '',
    purchasePrice: '' as any,
    salePrice: '' as any,
    stockQuantity: '' as any,
    minStockLevel: 1,
    unit: 'unité',
    variants: []
  });

  // Automatically sync total stock with variants' stock
  useEffect(() => {
    if (formData.variants && formData.variants.length > 0) {
      const totalStock = formData.variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0);
      if (formData.stockQuantity !== totalStock) {
        setFormData(prev => ({ ...prev, stockQuantity: totalStock }));
      }
    }
  }, [formData.variants]);

  const [newVariant, setNewVariant] = useState<Partial<ProductVariant>>({
    name: '',
    stockQuantity: '' as any,
    minStockLevel: '' as any,
    priceAdjustment: '' as any
  });

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });
    return () => unsubscribe();
  }, [profile]);

  const handleOpenModal = (product?: Product) => {
    if (!['admin', 'warehouseman'].includes(profile?.role || '')) return;
    if (product) {
      setEditingProduct(product);
      setFormData(product);
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        reference: `REF-${Date.now().toString().slice(-6)}`,
        category: '',
        description: '',
        purchasePrice: '' as any,
        salePrice: '' as any,
        stockQuantity: '' as any,
        minStockLevel: 1,
        unit: 'unité',
        variants: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!['admin', 'warehouseman'].includes(profile?.role || '')) return;

    // Ensure stock consistency for products with variants
    if (formData.variants && formData.variants.length > 0) {
      const totalStock = formData.variants.reduce((sum, v) => sum + (v.stockQuantity || 0), 0);
      formData.stockQuantity = totalStock;
    }

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), formData);
        if (profile) await logActivity(profile.uid, profile.displayName, 'product_update', `Produit modifié: ${formData.name}`);
      } else {
        await addDoc(collection(db, 'products'), {
          ...formData,
          createdAt: new Date().toISOString()
        });
        if (profile) await logActivity(profile.uid, profile.displayName, 'product_create', `Nouveau produit: ${formData.name}`);
      }
      setIsModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!['admin', 'warehouseman'].includes(profile?.role || '')) {
      alert(t('stock.permissionDenied'));
      return;
    }
    if (window.confirm(t('stock.deleteConfirm', { name }))) {
      try {
        await deleteDoc(doc(db, 'products', id));
        if (profile) await logActivity(profile.uid, profile.displayName, 'product_delete', `Produit supprimé: ${name}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, `products/${id}`);
      }
    }
  };

  const handleAddVariant = () => {
    if (!newVariant.name) return;
    
    // If this is the first variant, default its stock to the current total stock if not specified
    const currentTotal = formData.stockQuantity || 0;
    const variantStock = ( (!formData.variants || formData.variants.length === 0) && (typeof newVariant.stockQuantity !== 'number'))
      ? currentTotal 
      : (newVariant.stockQuantity || 0);

    const variant: ProductVariant = {
      id: Date.now().toString(),
      name: newVariant.name,
      stockQuantity: variantStock,
      minStockLevel: newVariant.minStockLevel || 0,
      priceAdjustment: newVariant.priceAdjustment || 0
    };
    setFormData({
      ...formData,
      variants: [...(formData.variants || []), variant]
    });
    setNewVariant({ name: '', stockQuantity: '' as any, minStockLevel: '' as any, priceAdjustment: '' as any });
  };

  const handleRemoveVariant = (id: string) => {
    setFormData({
      ...formData,
      variants: formData.variants?.filter(v => v.id !== id)
    });
  };

  const handleUpdateVariant = (id: string, field: keyof ProductVariant, value: any) => {
    setFormData({
      ...formData,
      variants: formData.variants?.map(v => v.id === id ? { ...v, [field]: value } : v)
    });
  };

  const handleAnalyze = async () => {
    if (!['admin', 'warehouseman'].includes(profile?.role || '')) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeStock(products);
      setAnalysis(result);
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (p.reference && p.reference.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesStock = stockFilter === 'all' || p.stockQuantity <= p.minStockLevel;
    return matchesSearch && matchesCategory && matchesStock;
  });

  const categories = Array.from(new Set(products.map(p => p.category))).filter(Boolean);

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
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('stock.title')}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('stock.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {['admin', 'warehouseman'].includes(profile?.role || '') && (
            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="btn-secondary flex items-center gap-2"
            >
              <Sparkles size={18} className="text-accent" />
              {isAnalyzing ? t('stock.analyzing') : t('stock.aiAnalysis')}
            </button>
          )}
          {['admin', 'warehouseman'].includes(profile?.role || '') && (
            <button
              onClick={() => handleOpenModal()}
              className="btn-primary flex items-center gap-2 shadow-lg shadow-primary/20"
            >
              <Plus size={18} />
              {t('stock.newProduct')}
            </button>
          )}
        </div>
      </div>

      {/* AI Analysis Result */}
      {analysis && (
        <div className="card p-6 bg-accent/5 dark:bg-accent/10 border-accent/20 animate-in slide-in-from-top-4 duration-500 relative">
          <button onClick={() => setAnalysis(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="text-accent" size={20} />
            <h3 className="font-display font-bold text-slate-900 dark:text-white">{t('stock.aiTitle')}</h3>
          </div>
          <div className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed prose prose-slate dark:prose-invert max-w-none">
            <ReactMarkdown>{analysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder={t('stock.searchPlaceholder')}
            className="input-field pl-12"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={18} />
          <select
            className="input-field min-w-[180px]"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="all">{t('stock.allCategories')}</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            className="input-field min-w-[150px]"
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as 'all' | 'low')}
          >
            <option value="all">{t('stock.allStock')}</option>
            <option value="low">{t('stock.lowStockOnly')}</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="px-6 py-4">{t('stock.form.reference')}</th>
                <th className="px-6 py-4">{t('stock.form.name')}</th>
                <th className="px-6 py-4">{t('stock.form.category')}</th>
                <th className="px-6 py-4 text-center">{t('stock.quantity')}</th>
                <th className="px-6 py-4 text-right">{t('stock.salePrice')}</th>
                <th className="px-6 py-4 text-center">{t('common.status')}</th>
                <th className="px-6 py-4 text-right">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredProducts.map((product) => {
                const isLowStock = (product.variants && product.variants.length > 0) 
                  ? product.variants.some(v => v.stockQuantity <= (v.minStockLevel ?? product.minStockLevel))
                  : product.stockQuantity <= product.minStockLevel;
                return (
                  <tr 
                    key={product.id} 
                    className={cn(
                      "hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors",
                      isLowStock && "bg-danger/[0.02] hover:bg-danger/[0.04]"
                    )}
                  >
                    <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {product.reference}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 dark:text-white">{product.name}</div>
                      {product.variants && product.variants.length > 0 && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {product.variants.length} {t('stock.variants')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-600 dark:text-slate-300">
                      {product.category || '-'}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="font-bold text-slate-900 dark:text-white">{product.stockQuantity}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">{t(`stock.units.${product.unit}`)}</span>
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-primary">
                      {product.salePrice.toLocaleString()} {t('common.currency')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-block",
                        isLowStock ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                      )}>
                        {isLowStock ? t('stock.lowStock') : t('stock.inStock')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {['admin', 'warehouseman'].includes(profile?.role || '') && (
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                            title={t('stock.edit')}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {['admin', 'warehouseman'].includes(profile?.role || '') && (
                          <button
                            onClick={() => handleDelete(product.id, product.name)}
                            className="p-2 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-lg transition-all"
                            title={t('stock.delete')}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-500 dark:text-slate-400">
                    <Package size={32} className="mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    {t('stock.noProducts')}
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
          <div className="absolute inset-0 bg-slate-900/60 dark:bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setIsModalOpen(false)}></div>
          <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div>
                <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">
                  {editingProduct ? t('stock.modal.editTitle') : t('stock.modal.newTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('stock.modal.subtitle')}</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-colors shadow-sm border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                <X size={20} />
              </button>
            </div>
 
            <form onSubmit={handleSubmit} className="p-8 overflow-y-auto space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.name')}</label>
                  <input
                    required
                    type="text"
                    className="input-field"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.reference')}</label>
                  <input
                    required
                    type="text"
                    className="input-field"
                    value={formData.reference}
                    onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.category')}</label>
                  <input
                    required
                    type="text"
                    list="categories-list"
                    className="input-field"
                    placeholder={t('stock.form.categoryPlaceholder')}
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  />
                  <datalist id="categories-list">
                    {categories.map(c => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.unit')}</label>
                  <select
                    required
                    className="input-field"
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  >
                    <option value="unité">{t('stock.units.unit')}</option>
                    <option value="kg">{t('stock.units.kg')}</option>
                    <option value="litre">{t('stock.units.litre')}</option>
                    <option value="mètre">{t('stock.units.metre')}</option>
                    <option value="paquet">{t('stock.units.paquet')}</option>
                  </select>
                </div>
              </div>
 
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.description')}</label>
                <textarea
                  required
                  className="input-field min-h-[100px] py-3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
 
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.purchasePrice')}</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    className="input-field"
                    value={(formData.purchasePrice as any) === '' ? '' : (isNaN(formData.purchasePrice as any) ? '' : formData.purchasePrice)}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || !isNaN(Number(val)) || val === '.') {
                        setFormData({ ...formData, purchasePrice: val === '' ? '' as any : parseFloat(val) });
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.salePrice')}</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    className="input-field"
                    value={(formData.salePrice as any) === '' ? '' : (isNaN(formData.salePrice as any) ? '' : formData.salePrice)}
                    onChange={(e) => {
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || !isNaN(Number(val)) || val === '.') {
                        setFormData({ ...formData, salePrice: val === '' ? '' as any : parseFloat(val) });
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.stockTotal')}</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    className={cn(
                      "input-field",
                      formData.variants && formData.variants.length > 0 && "bg-slate-50 dark:bg-slate-800/50 cursor-not-allowed opacity-80"
                    )}
                    readOnly={formData.variants && formData.variants.length > 0}
                    value={(formData.stockQuantity as any) === '' ? '' : (isNaN(formData.stockQuantity as any) ? '' : formData.stockQuantity)}
                    onChange={(e) => {
                      if (formData.variants && formData.variants.length > 0) return;
                      const val = e.target.value.replace(',', '.');
                      if (val === '' || !isNaN(Number(val)) || val === '.') {
                        setFormData({ ...formData, stockQuantity: val === '' ? '' as any : parseFloat(val) });
                      }
                    }}
                  />
                  {formData.variants && formData.variants.length > 0 && (
                    <p className="text-[10px] text-primary font-medium mt-1 italic">
                      {t('stock.form.stockAutoCalculated', 'Calculé automatiquement à partir des variantes')}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.minStock')}</label>
                  <input
                    required
                    type="text"
                    inputMode="decimal"
                    className="input-field"
                    value={isNaN(formData.minStockLevel) ? '' : formData.minStockLevel}
                    onChange={(e) => {
                      const valStr = e.target.value.replace(',', '.');
                      if (valStr === '' || !isNaN(Number(valStr)) || valStr === '.') {
                        const val = valStr === '' ? 0 : parseFloat(valStr);
                        setFormData({ ...formData, minStockLevel: isNaN(val) ? 0 : val });
                      }
                    }}
                  />
                </div>
              </div>
 
              {/* Variants Section */}
              <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">{t('stock.form.variantsTitle')}</h3>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">{t('stock.form.optional')}</span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="md:col-span-2">
                    <input
                      type="text"
                      placeholder={t('stock.form.variantNamePlaceholder')}
                      className="input-field bg-white dark:bg-slate-800"
                      value={newVariant.name}
                      onChange={(e) => setNewVariant({ ...newVariant, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t('stock.form.variantStockPlaceholder', 'Stock')}
                      className="input-field bg-white dark:bg-slate-800"
                      value={(newVariant.stockQuantity as any) === '' ? '' : newVariant.stockQuantity}
                      onChange={(e) => {
                        const val = e.target.value.replace(',', '.');
                        if (val === '' || !isNaN(Number(val)) || val === '.') {
                          setNewVariant({ ...newVariant, stockQuantity: val === '' ? '' as any : parseFloat(val) });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t('stock.form.variantMinStockPlaceholder', 'Seuil')}
                      className="input-field bg-white dark:bg-slate-800"
                      value={(newVariant.minStockLevel as any) === '' ? '' : newVariant.minStockLevel}
                      onChange={(e) => {
                        const val = e.target.value.replace(',', '.');
                        if (val === '' || !isNaN(Number(val)) || val === '.') {
                          setNewVariant({ ...newVariant, minStockLevel: val === '' ? '' as any : parseFloat(val) });
                        }
                      }}
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={t('stock.form.variantPricePlaceholder')}
                      className="input-field bg-white dark:bg-slate-800"
                      value={(newVariant.priceAdjustment as any) === '' ? '' : newVariant.priceAdjustment}
                      onChange={(e) => {
                        const val = e.target.value.replace(',', '.');
                        if (val === '' || !isNaN(Number(val)) || val === '.') {
                          setNewVariant({ ...newVariant, priceAdjustment: val === '' ? '' as any : parseFloat(val) });
                        }
                      }}
                    />
                  </div>
                  <div className="md:col-span-5">
                    <button
                      type="button"
                      onClick={handleAddVariant}
                      className="btn-secondary w-full flex items-center justify-center gap-2 h-12"
                    >
                      <Plus size={16} />
                      {t('stock.form.addVariant')}
                    </button>
                  </div>
                </div>
 
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('stock.form.variants')}</h4>
                    {formData.variants && formData.variants.length > 0 && (
                      <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full uppercase">
                        {formData.variants.length} {t('stock.form.variant')}
                      </span>
                    )}
                  </div>
                  
                  {formData.variants?.map((v) => (
                    <div key={v.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-primary/30 transition-all gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                        <div className="min-w-[120px]">
                          <span className="text-sm font-bold text-slate-900 dark:text-white block truncate">{v.name}</span>
                          <span className="text-[10px] text-slate-400 uppercase font-bold tracking-tight">{t('stock.form.variant')}</span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Stock</label>
                            <input 
                              type="text"
                              inputMode="decimal"
                              className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold text-primary focus:ring-2 focus:ring-primary/20 transition-all"
                              value={v.stockQuantity}
                              onChange={(e) => {
                                const val = e.target.value.replace(',', '.');
                                if (val === '' || !isNaN(Number(val)) || val === '.') {
                                  handleUpdateVariant(v.id, 'stockQuantity', val === '' ? 0 : parseFloat(val));
                                }
                              }}
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">Seuil</label>
                            <input 
                              type="text"
                              inputMode="decimal"
                              className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary/20 transition-all"
                              value={v.minStockLevel ?? ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(',', '.');
                                if (val === '' || !isNaN(Number(val)) || val === '.') {
                                  handleUpdateVariant(v.id, 'minStockLevel', val === '' ? 0 : parseFloat(val));
                                }
                              }}
                            />
                          </div>
                          
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider ml-1">+/- Prix ({t('common.currency')})</label>
                            <input 
                              type="text"
                              inputMode="decimal"
                              className="w-28 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-slate-300 focus:ring-2 focus:ring-primary/20 transition-all"
                              value={v.priceAdjustment}
                              onChange={(e) => {
                                const val = e.target.value.replace(',', '.');
                                if (val === '' || !isNaN(Number(val)) || val === '.') {
                                  handleUpdateVariant(v.id, 'priceAdjustment', val === '' ? 0 : parseFloat(val));
                                }
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(v.id)}
                        className="p-2.5 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-xl transition-all self-end sm:self-center"
                        title={t('common.delete')}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
 
              <div className="pt-6 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 btn-secondary py-3"
                >
                  {t('stock.form.cancel')}
                </button>
                <button
                  type="submit"
                  className="flex-[2] btn-primary py-3 shadow-lg shadow-primary/20"
                >
                  {editingProduct ? t('stock.form.save') : t('stock.form.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Stock;

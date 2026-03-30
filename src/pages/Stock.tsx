import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
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
    purchasePrice: 0,
    salePrice: 0,
    stockQuantity: 0,
    minStockLevel: 5,
    unit: 'unité',
    variants: []
  });

  const [newVariant, setNewVariant] = useState<Partial<ProductVariant>>({
    name: '',
    stockQuantity: 0,
    priceAdjustment: 0
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
        purchasePrice: 0,
        salePrice: 0,
        stockQuantity: 0,
        minStockLevel: 5,
        unit: 'unité',
        variants: []
      });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!['admin', 'warehouseman'].includes(profile?.role || '')) return;

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
    if (profile?.role !== 'admin') {
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
    const variant: ProductVariant = {
      id: Date.now().toString(),
      name: newVariant.name,
      stockQuantity: newVariant.stockQuantity || 0,
      priceAdjustment: newVariant.priceAdjustment || 0
    };
    setFormData({
      ...formData,
      variants: [...(formData.variants || []), variant]
    });
    setNewVariant({ name: '', stockQuantity: 0, priceAdjustment: 0 });
  };

  const handleRemoveVariant = (id: string) => {
    setFormData({
      ...formData,
      variants: formData.variants?.filter(v => v.id !== id)
    });
  };

  const handleAnalyze = async () => {
    if (profile?.role !== 'admin') return;
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
          {profile?.role === 'admin' && (
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
                const isLowStock = product.stockQuantity <= product.minStockLevel;
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
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => handleOpenModal(product)}
                            className="p-2 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                            title={t('stock.edit')}
                          >
                            <Edit2 size={16} />
                          </button>
                        )}
                        {profile?.role === 'admin' && (
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
                    {t('stock.noProducts', 'Aucun produit trouvé')}
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
                    type="number"
                    className="input-field"
                    value={isNaN(formData.purchasePrice) ? '' : formData.purchasePrice}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setFormData({ ...formData, purchasePrice: isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.salePrice')}</label>
                  <input
                    required
                    type="number"
                    className="input-field"
                    value={isNaN(formData.salePrice) ? '' : formData.salePrice}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setFormData({ ...formData, salePrice: isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.stockTotal')}</label>
                  <input
                    required
                    type="number"
                    className="input-field"
                    value={isNaN(formData.stockQuantity) ? '' : formData.stockQuantity}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setFormData({ ...formData, stockQuantity: isNaN(val) ? 0 : val });
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{t('stock.form.minStock')}</label>
                  <input
                    required
                    type="number"
                    className="input-field"
                    value={isNaN(formData.minStockLevel) ? '' : formData.minStockLevel}
                    onChange={(e) => {
                      const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                      setFormData({ ...formData, minStockLevel: isNaN(val) ? 0 : val });
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
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="md:col-span-1">
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
                      type="number"
                      placeholder={t('stock.form.variantStockPlaceholder')}
                      className="input-field bg-white dark:bg-slate-800"
                      value={newVariant.stockQuantity}
                      onChange={(e) => setNewVariant({ ...newVariant, stockQuantity: Number(e.target.value) })}
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder={t('stock.form.variantPricePlaceholder')}
                      className="input-field bg-white dark:bg-slate-800"
                      value={newVariant.priceAdjustment}
                      onChange={(e) => setNewVariant({ ...newVariant, priceAdjustment: Number(e.target.value) })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddVariant}
                    className="btn-secondary flex items-center justify-center gap-2 h-full"
                  >
                    <Plus size={16} />
                    {t('stock.form.addVariant')}
                  </button>
                </div>
 
                <div className="space-y-2">
                  {formData.variants?.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-primary/30 transition-colors">
                      <div className="flex items-center gap-6">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">{v.name}</span>
                        <div className="flex gap-4 text-xs text-slate-500 dark:text-slate-400">
                          <span>Stock: <b>{v.stockQuantity}</b></span>
                          <span>Prix: <b>{v.priceAdjustment >= 0 ? '+' : ''}{v.priceAdjustment} {t('common.currency')}</b></span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(v.id)}
                        className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger/5 rounded-lg transition-all"
                      >
                        <Trash2 size={16} />
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

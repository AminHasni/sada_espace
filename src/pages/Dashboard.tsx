import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, limit, where, Timestamp } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';
import { Product, Client, StockExit, Payment, Expense, ServiceRecord, CashSession } from '../types';
import { useAuth } from '../components/AuthProvider';
import { 
  Package, 
  Users, 
  TrendingUp, 
  AlertTriangle, 
  Sparkles, 
  Wallet, 
  X,
  Calendar,
  ChevronRight,
  PackagePlus,
  UserPlus,
  PackageMinus,
  Truck,
  ArrowUpRight,
  ArrowDownRight,
  Filter,
  BarChart3,
  Download
} from 'lucide-react';
import { analyzeStock, analyzeCredits } from '../services/gemini';
import { generatePDFReport } from '../utils/pdfGenerator';
import { format, subDays, startOfDay, endOfDay, isWithinInterval, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { cn } from '../lib/utils';
import ReactMarkdown from 'react-markdown';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from 'recharts';

const Dashboard: React.FC = () => {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [stockExits, setStockExits] = useState<StockExit[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [currentSession, setCurrentSession] = useState<CashSession | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<{ type: 'stock' | 'credit', content: string } | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const dateLocale = i18n.language === 'ar' ? arDZ : fr;

  useEffect(() => {
    if (!profile) return;

    const unsubProducts = onSnapshot(collection(db, 'products'), (snap) => {
      setProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'products');
    });

    const unsubClients = onSnapshot(collection(db, 'clients'), (snap) => {
      setClients(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Client)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'clients');
    });

    const unsubExits = onSnapshot(collection(db, 'stock_exits'), (snap) => {
      setStockExits(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockExit)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'stock_exits');
    });

    const unsubPayments = onSnapshot(collection(db, 'payments'), (snap) => {
      setPayments(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'payments');
    });

    const unsubExpenses = onSnapshot(collection(db, 'expenses'), (snap) => {
      setExpenses(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Expense)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'expenses');
    });

    const unsubServices = onSnapshot(collection(db, 'services'), (snap) => {
      setServices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as ServiceRecord)));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'services');
    });

    const qSession = query(
      collection(db, 'cash_sessions'),
      where('userId', '==', profile.uid),
      where('status', '==', 'open'),
      limit(1)
    );
    const unsubSession = onSnapshot(qSession, (snap) => {
      if (!snap.empty) {
        setCurrentSession({ id: snap.docs[0].id, ...snap.docs[0].data() } as CashSession);
      } else {
        setCurrentSession(null);
      }
    }, (error) => {
      console.error("Error fetching cash session:", error);
    });

    return () => {
      unsubProducts();
      unsubClients();
      unsubExits();
      unsubPayments();
      unsubExpenses();
      unsubServices();
      unsubSession();
    };
  }, [profile]);

  const handleStockAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeStock(products);
      setAiAnalysis({ type: 'stock', content: analysis });
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCreditAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeCredits(clients);
      setAiAnalysis({ type: 'credit', content: analysis });
    } catch (error) {
      console.error(error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredData = useMemo(() => {
    const start = startOfDay(parseISO(dateRange.start));
    const end = endOfDay(parseISO(dateRange.end));

    const filterByDate = (item: any) => {
      const date = parseISO(item.date || item.exitDate || item.createdAt);
      return isWithinInterval(date, { start, end });
    };

    const periodSales = stockExits.filter(e => e.type === 'sale' && filterByDate(e));
    const periodPayments = payments.filter(filterByDate);
    const periodExpenses = expenses.filter(filterByDate);
    const periodServices = services.filter(filterByDate);

    const totalSales = periodSales.filter(s => s.paymentStatus !== 'credit').reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const totalCreditSales = periodSales.filter(s => s.paymentStatus === 'credit').reduce((sum, s) => sum + (Number(s.totalAmount) || 0), 0);
    const totalDiscounts = periodSales.reduce((sum, s) => sum + (Number(s.discount) || 0), 0);
    const totalPayments = periodPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const totalExpenses = periodExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalServices = periodServices.reduce((sum, s) => sum + Number(s.price), 0);
    const totalCredits = clients.reduce((sum, c) => sum + (Number(c.totalCredit) || 0), 0);
    const netProfit = totalPayments + totalServices - totalExpenses;

    // Chart data
    const days = eachDayOfInterval({ start, end });
    const chartData = days.map(day => {
      const daySales = periodSales.filter(s => isSameDay(parseISO(s.exitDate), day) && s.paymentStatus !== 'credit')
        .reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const dayCreditSales = periodSales.filter(s => isSameDay(parseISO(s.exitDate), day) && s.paymentStatus === 'credit')
        .reduce((sum, s) => sum + (s.totalAmount || 0), 0);
      const dayPayments = periodPayments.filter(p => isSameDay(parseISO(p.date), day))
        .reduce((sum, p) => sum + p.amount, 0);
      const dayExpenses = periodExpenses.filter(e => isSameDay(parseISO(e.date), day))
        .reduce((sum, e) => sum + e.amount, 0);
      const dayServices = periodServices.filter(s => isSameDay(parseISO(s.date), day))
        .reduce((sum, s) => sum + s.price, 0);

      return {
        date: format(day, 'dd/MM'),
        sales: daySales,
        creditSales: dayCreditSales,
        payments: dayPayments,
        expenses: dayExpenses,
        services: dayServices,
        profit: dayPayments + dayServices - dayExpenses
      };
    });

    return {
      totalSales,
      totalCreditSales,
      totalDiscounts,
      totalPayments,
      totalExpenses,
      totalServices,
      totalCredits,
      netProfit,
      chartData,
      periodSales,
      periodPayments,
      periodExpenses,
      periodServices
    };
  }, [stockExits, payments, expenses, services, clients, dateRange]);

  const handleGenerateReport = async () => {
    if (profile?.role !== 'admin') return;
    setIsGeneratingReport(true);
    try {
      await generatePDFReport({
        dateRange,
        totalSales: filteredData.totalSales,
        totalCreditSales: filteredData.totalCreditSales,
        totalDiscounts: filteredData.totalDiscounts,
        totalPayments: filteredData.totalPayments,
        totalExpenses: filteredData.totalExpenses,
        totalServices: filteredData.totalServices,
        totalCredits: filteredData.totalCredits,
        netProfit: filteredData.netProfit,
        stockExits: filteredData.periodSales,
        payments: filteredData.periodPayments,
        expenses: filteredData.periodExpenses,
        services: filteredData.periodServices,
        products: products,
        language: i18n.language
      }, t);
    } catch (error) {
      console.error('Report generation failed:', error);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleGenerateDailyReport = async () => {
    if (profile?.role !== 'admin') return;
    setIsGeneratingReport(true);
    const today = format(new Date(), 'yyyy-MM-dd');
    try {
      await generatePDFReport({
        dateRange: { start: today, end: today },
        totalSales: filteredData.totalSales,
        totalCreditSales: filteredData.totalCreditSales,
        totalDiscounts: filteredData.totalDiscounts,
        totalPayments: filteredData.totalPayments,
        totalExpenses: filteredData.totalExpenses,
        totalServices: filteredData.totalServices,
        totalCredits: filteredData.totalCredits,
        netProfit: filteredData.netProfit,
        stockExits: filteredData.periodSales,
        payments: filteredData.periodPayments,
        expenses: filteredData.periodExpenses,
        services: filteredData.periodServices,
        products: products,
        language: i18n.language,
        isDaily: true
      }, t);
    } catch (error) {
      console.error('Daily report generation failed:', error);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const totalStockValue = products.reduce((sum, p) => sum + ((Number(p.stockQuantity) || 0) * (Number(p.purchasePrice) || 0)), 0);
  const totalPotentialRevenue = products.reduce((sum, p) => sum + ((Number(p.stockQuantity) || 0) * (Number(p.salePrice) || 0)), 0);
  const lowStockCount = products.filter(p => (Number(p.stockQuantity) || 0) <= (Number(p.minStockLevel) || 0)).length;
  const totalProducts = products.length;

  const stats = [
    { label: t('dashboard.stats.totalProducts'), value: totalProducts, icon: Package, color: 'bg-primary', iconColor: 'text-primary' },
    { label: t('dashboard.stats.potentialRevenue', 'Valeur Stock (Vente)'), value: `${totalPotentialRevenue.toLocaleString()} ${t('common.currency')}`, icon: Wallet, color: 'bg-success', iconColor: 'text-success' },
    { label: t('dashboard.stats.stockValue'), value: `${totalStockValue.toLocaleString()} ${t('common.currency')}`, icon: TrendingUp, color: 'bg-accent', iconColor: 'text-accent' },
    { label: t('dashboard.stats.stockAlerts'), value: lowStockCount, icon: AlertTriangle, color: 'bg-danger', iconColor: 'text-danger' },
  ];

  const financialStats = [
    { label: t('dashboard.financials.totalSales', 'Ventes Normales'), value: filteredData.totalSales, icon: ArrowUpRight, color: 'text-primary', bg: 'bg-primary/10' },
    { label: t('dashboard.financials.totalCreditSales', 'Ventes par Crédit'), value: filteredData.totalCreditSales, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { label: t('dashboard.financials.totalDiscounts', 'Remises'), value: filteredData.totalDiscounts, icon: ArrowDownRight, color: 'text-danger', bg: 'bg-danger/10' },
    { label: t('dashboard.financials.paymentsReceived'), value: filteredData.totalPayments, icon: Wallet, color: 'text-success', bg: 'bg-success/10' },
    { label: t('dashboard.financials.totalServices'), value: filteredData.totalServices, icon: Sparkles, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: t('dashboard.financials.totalExpenses'), value: filteredData.totalExpenses, icon: ArrowDownRight, color: 'text-danger', bg: 'bg-danger/10' },
    { label: t('dashboard.financials.netProfit'), value: filteredData.netProfit, icon: TrendingUp, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      {/* Cash Session Warning */}
      {!currentSession && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="w-10 h-10 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-amber-600 dark:text-amber-400 w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-amber-800 dark:text-amber-300 font-bold">{t('dashboard.cashWarning.title')}</h3>
            <p className="text-amber-700 dark:text-amber-400 text-sm mt-1">
              {t('dashboard.cashWarning.desc')}
            </p>
          </div>
          <button
            onClick={() => navigate('/cash-register')}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap"
          >
            {t('dashboard.cashWarning.button')}
          </button>
        </div>
      )}

      {/* Welcome Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold text-slate-900 dark:text-white">{t('dashboard.welcome', { name: profile?.displayName })}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('dashboard.todayDate')}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{format(new Date(), 'dd MMMM yyyy', { locale: dateLocale })}</p>
          </div>
          <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
            <Calendar className="text-primary w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      {['admin', 'warehouseman'].includes(profile?.role || '') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <button onClick={() => navigate('/stock-entries')} className="card p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
              <PackagePlus size={20} />
            </div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.quickActions.newStockEntry')}</span>
          </button>

          <button onClick={() => navigate('/stock-exits')} className="card p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-full bg-danger/10 text-danger flex items-center justify-center group-hover:scale-110 transition-transform">
              <PackageMinus size={20} />
            </div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.quickActions.newStockExit')}</span>
          </button>

          {['admin', 'warehouseman'].includes(profile?.role || '') && (
            <button onClick={() => navigate('/stock')} className="card p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-full bg-accent/10 text-accent flex items-center justify-center group-hover:scale-110 transition-transform">
                <Package size={20} />
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.quickActions.newProduct')}</span>
            </button>
          )}

          {['admin', 'warehouseman'].includes(profile?.role || '') && (
            <button onClick={() => navigate('/clients')} className="card p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 text-purple-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <UserPlus size={20} />
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.quickActions.newClient')}</span>
            </button>
          )}

          {['admin', 'warehouseman'].includes(profile?.role || '') && (
            <button onClick={() => navigate('/suppliers')} className="card p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Truck size={20} />
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.quickActions.newSupplier')}</span>
            </button>
          )}

          {['admin', 'warehouseman'].includes(profile?.role || '') && (
            <button onClick={() => navigate('/expenses')} className="card p-4 flex flex-col items-center justify-center gap-3 hover:border-primary/50 hover:shadow-md transition-all group">
              <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center group-hover:scale-110 transition-transform">
                <Wallet size={20} />
              </div>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">{t('dashboard.quickActions.newExpense')}</span>
            </button>
          )}
        </div>
      )}

      {/* Financial Management Section */}
      {['admin', 'manager'].includes(profile?.role || '') && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="text-primary" size={20} />
              {t('dashboard.financialOverview')}
            </h2>
            
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="flex items-center gap-2 px-3 py-1.5 border-r border-slate-100 dark:border-slate-700">
                  <Filter size={14} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('common.period')}</span>
                </div>
                <input
                  type="date"
                  className="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-slate-300 focus:ring-0 p-1"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                />
                <span className="text-slate-300 dark:text-slate-600">→</span>
                <input
                  type="date"
                  className="bg-transparent border-none text-xs font-bold text-slate-700 dark:text-slate-300 focus:ring-0 p-1"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                />
              </div>

              {profile?.role === 'admin' && (
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateDailyReport}
                    disabled={isGeneratingReport}
                    className="btn-secondary flex items-center gap-2 shadow-sm whitespace-nowrap disabled:opacity-50"
                  >
                    <Calendar size={18} />
                    {t('dashboard.report.dailyReport', 'Rapport Jour')}
                  </button>
                  <button
                    onClick={handleGenerateReport}
                    disabled={isGeneratingReport}
                    className="btn-primary flex items-center gap-2 shadow-lg shadow-primary/20 whitespace-nowrap disabled:opacity-50"
                  >
                    {isGeneratingReport ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    ) : (
                      <Download size={18} />
                    )}
                    {isGeneratingReport ? t('common.loading') : t('dashboard.generateReport')}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {financialStats.map((stat, idx) => (
              <div key={idx} className={cn(
                "card p-4 flex flex-col gap-2 transition-all hover:shadow-md",
                idx === 5 ? "col-span-2 lg:col-span-1 bg-indigo-50/30 dark:bg-indigo-500/5 border-indigo-100 dark:border-indigo-500/20" : ""
              )}>
                <div className="flex items-center justify-between">
                  <div className={cn("p-2 rounded-xl", stat.bg, stat.color)}>
                    <stat.icon size={18} />
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{stat.label}</p>
                  <h4 className={cn("text-lg font-display font-bold mt-0.5", stat.color)}>
                    {stat.value.toLocaleString()} <span className="text-[10px] font-sans font-normal opacity-70">{t('common.currency')}</span>
                  </h4>
                </div>
              </div>
            ))}
          </div>

          {/* Revenue Evolution Chart */}
          <div className="card p-6 min-h-[400px]">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-display font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="text-primary" size={18} />
                {t('dashboard.revenueTrend')}
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-primary"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('dashboard.financials.totalSales')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-success"></div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('dashboard.financials.paymentsReceived')}</span>
                </div>
              </div>
            </div>

            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={filteredData.chartData}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPayments" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }}
                    tickFormatter={(value) => `${value}`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#fff', 
                      borderRadius: '16px', 
                      border: 'none', 
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                      padding: '12px'
                    }}
                    labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#1e293b' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorSales)" 
                  />
                  <Area 
                    type="monotone" 
                    dataKey="payments" 
                    stroke="#10b981" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorPayments)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <div key={idx} className="card p-6 group">
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-300",
                "bg-slate-50 dark:bg-slate-800 group-hover:bg-opacity-100",
                stat.iconColor.replace('text-', 'group-hover:bg-').replace('text-', 'bg-') + "/10",
                stat.iconColor
              )}>
                <stat.icon size={24} />
              </div>
              {idx === 3 && Number(stat.value) > 0 && (
                <span className="flex h-2 w-2 rounded-full bg-danger animate-ping"></span>
              )}
            </div>
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">{stat.label}</p>
            <h3 className="text-2xl font-display font-bold text-slate-900 dark:text-white mt-1">{stat.value}</h3>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;

import React from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Receipt, 
  LogOut, 
  Menu, 
  X, 
  Shield, 
  User as UserIcon,
  Sparkles,
  ChevronRight,
  Truck,
  FileText,
  FileDown,
  FileUp,
  ArrowLeftRight,
  Building2,
  ShoppingCart,
  Wallet,
  Briefcase,
  MessageSquareWarning
} from 'lucide-react';
import { useAuth } from './AuthProvider';
import { cn } from '../lib/utils';
import LanguageSwitcher from './LanguageSwitcher';
import ThemeToggle from './ThemeToggle';
import NotificationBell from './NotificationBell';

const Layout: React.FC = () => {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard', roles: ['admin', 'warehouseman'] },
    { to: '/stock', icon: Package, labelKey: 'nav.stock', roles: ['admin', 'warehouseman'] },
    { to: '/stock-entries', icon: FileDown, labelKey: 'nav.stockEntries', roles: ['admin', 'warehouseman'] },
    { to: '/stock-exits', icon: FileUp, labelKey: 'nav.stockExits', roles: ['admin', 'warehouseman'] },
    { to: '/suppliers', icon: Truck, labelKey: 'nav.suppliers', roles: ['admin', 'warehouseman'] },
    { to: '/clients', icon: Users, labelKey: 'nav.clients', roles: ['admin', 'warehouseman'] },
    { to: '/expenses', icon: Wallet, labelKey: 'nav.expenses', roles: ['admin', 'warehouseman'] },
    { to: '/services', icon: Briefcase, labelKey: 'nav.services', roles: ['admin', 'warehouseman'] },
    { to: '/reclamations', icon: MessageSquareWarning, labelKey: 'nav.reclamations', roles: ['admin', 'warehouseman'] },
    { to: '/users', icon: Shield, labelKey: 'nav.users', roles: ['admin'] },
  ];

  const filteredNavItems = navItems.filter(item => 
    profile && item.roles.includes(profile.role)
  );

  const currentItem = navItems.find(item => item.to === location.pathname);
  const currentPageLabel = currentItem ? t(currentItem.labelKey) : t('common.page');

  const isRTL = i18n.language === 'ar';

  return (
    <div className={cn("min-h-screen bg-background flex flex-col lg:flex-row", isRTL && "font-sans")}>
      {/* Sidebar - Desktop */}
      <aside className={cn(
        "hidden lg:flex flex-col w-72 bg-white dark:bg-slate-900 sticky top-0 h-screen z-40",
        isRTL ? "border-l border-slate-200 dark:border-slate-800" : "border-r border-slate-200 dark:border-slate-800"
      )}>
        <div className="p-8 flex-1 overflow-y-auto">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-none text-slate-900 dark:text-white">Espace Sadaa</h1>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-widest font-bold">فضاء صدى</span>
            </div>
          </div>

          <nav className="space-y-1.5">
            {filteredNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all group",
                    isActive 
                      ? "bg-primary text-white shadow-lg shadow-primary/20" 
                      : "text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                  )
                }
              >
                <div className="flex items-center gap-3">
                  <item.icon size={18} />
                  <span>{t(item.labelKey)}</span>
                </div>
                <ChevronRight size={14} className={cn(
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  isRTL && "rotate-180"
                )} />
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50 dark:bg-slate-800/50 dark:border-slate-700">
          <NavLink 
            to="/profile"
            className={({ isActive }) => cn(
              "flex items-center gap-3 p-3 rounded-2xl transition-all group",
              isActive ? "bg-white dark:bg-slate-800 shadow-sm border border-slate-200 dark:border-slate-700" : "hover:bg-white/50 dark:hover:bg-slate-800/50"
            )}
          >
            <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center font-display font-bold text-primary shadow-sm">
              {profile?.displayName?.[0] || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{profile?.displayName}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">{profile?.role}</p>
            </div>
          </NavLink>
          
          <button
            onClick={handleLogout}
            className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-danger hover:bg-danger/5 transition-all"
          >
            <LogOut size={16} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700 z-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Sparkles className="text-white w-4 h-4" />
          </div>
          <span className="font-display font-bold text-base text-slate-900 dark:text-white">Espace Sadaa - فضاء صدى</span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationBell />
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMenuOpen && (
        <div className="lg:hidden fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-40 pt-16">
          <div className={cn(
            "bg-white dark:bg-slate-900 h-full p-6 animate-in duration-300",
            isRTL ? "slide-in-from-left" : "slide-in-from-right"
          )}>
            <nav className="space-y-2">
              {filteredNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-4 p-4 rounded-2xl text-base font-semibold transition-all",
                      isActive 
                        ? "bg-primary text-white shadow-lg shadow-primary/20" 
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    )
                  }
                >
                  <item.icon size={20} />
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              ))}
              
              <div className="pt-6 border-t border-slate-100 dark:border-slate-800 mt-6 space-y-2">
                <NavLink
                  to="/profile"
                  onClick={() => setIsMenuOpen(false)}
                  className={({ isActive }) => cn(
                    "flex items-center gap-4 p-4 rounded-2xl text-base font-semibold transition-all",
                    isActive ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  )}
                >
                  <UserIcon size={20} />
                  <span>{t('nav.profile')}</span>
                </NavLink>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 p-4 rounded-2xl text-base font-semibold text-danger hover:bg-danger/5 transition-all"
                >
                  <LogOut size={20} />
                  <span>{t('nav.logout')}</span>
                </button>
              </div>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 min-w-0 pt-16 lg:pt-0 flex flex-col">
        <header className="hidden lg:flex h-20 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 items-center justify-between px-10 sticky top-0 z-30">
          <div className="flex items-center gap-4">
             <div className="h-8 w-1 bg-primary rounded-full"></div>
             <h2 className="text-xl font-display font-bold text-slate-900 dark:text-white">{currentPageLabel}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <ThemeToggle />
            <NotificationBell />
            
            <NavLink to="/profile" className="flex items-center gap-3 group">
              <div className={cn("text-right", isRTL && "text-left")}>
                <p className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-primary transition-colors">{profile?.displayName}</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">{profile?.role}</p>
              </div>
              <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center font-display font-bold text-slate-500 dark:text-slate-400 border-2 border-transparent group-hover:border-primary transition-all shadow-sm">
                {profile?.displayName?.[0] || 'U'}
              </div>
            </NavLink>
          </div>
        </header>

        <div className="p-6 lg:p-10 max-w-7xl w-full mx-auto flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;

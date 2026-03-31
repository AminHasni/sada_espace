import React, { useState, useEffect, useRef } from 'react';
import { Bell, BellOff, Check, Trash2, ExternalLink, X } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { notificationService } from '../services/notificationService';
import { Notification } from '../types';
import { formatDistanceToNow } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';

const NotificationBell: React.FC = () => {
  const { profile } = useAuth();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isRTL = i18n.language === 'ar';
  const dateLocale = isRTL ? arDZ : fr;

  useEffect(() => {
    if (!profile?.uid) return;

    const unsubscribe = notificationService.subscribeToNotifications(
      profile.uid,
      (newNotifications) => {
        setNotifications(newNotifications);
      }
    );

    return () => unsubscribe();
  }, [profile?.uid]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.markAsRead(id);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await notificationService.deleteNotification(id);
  };

  const handleMarkAllAsRead = async () => {
    if (profile?.uid) {
      await notificationService.markAllAsRead(profile.uid);
    }
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.isRead) {
      await notificationService.markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
      setIsOpen(false);
    }
  };

  const getTypeStyles = (type: Notification['type']) => {
    switch (type) {
      case 'success': return 'bg-success/10 text-success border-success/20';
      case 'warning': return 'bg-warning/10 text-warning border-warning/20';
      case 'error': return 'bg-danger/10 text-danger border-danger/20';
      default: return 'bg-primary/10 text-primary border-primary/20';
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t('notifications.title')}
        className={cn(
          "relative p-2 rounded-xl transition-all",
          isOpen 
            ? "bg-primary text-white shadow-lg shadow-primary/20" 
            : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        )}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className={cn(
              "absolute top-full mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 z-50 overflow-hidden",
              isRTL ? "left-0" : "right-0"
            )}
          >
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white">{t('notifications.title')}</h3>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full uppercase tracking-wider">
                    {unreadCount} {t('notifications.new')}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                >
                  <Check size={14} />
                  {t('notifications.markAllRead')}
                </button>
              )}
            </div>

            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length > 0 ? (
                <div className="divide-y divide-slate-50 dark:divide-slate-800">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      onClick={() => handleNotificationClick(notification)}
                      className={cn(
                        "p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer relative group",
                        !notification.isRead && "bg-primary/[0.02]"
                      )}
                    >
                      {!notification.isRead && (
                        <div className="absolute top-4 right-4 w-2 h-2 bg-primary rounded-full"></div>
                      )}
                      
                      <div className="flex gap-3">
                        <div className={cn(
                          "w-10 h-10 rounded-xl border flex items-center justify-center shrink-0",
                          getTypeStyles(notification.type)
                        )}>
                          <Bell size={18} />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className={cn(
                              "text-sm font-bold truncate",
                              notification.isRead ? "text-slate-700 dark:text-slate-300" : "text-slate-900 dark:text-white"
                            )}>
                              {notification.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap mt-0.5">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true, locale: dateLocale })}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                            {notification.message}
                          </p>
                          
                          <div className="flex items-center justify-between">
                            {notification.link && (
                              <span className="text-[10px] font-bold text-primary flex items-center gap-1 uppercase tracking-wider">
                                <ExternalLink size={10} />
                                {t('notifications.viewDetails')}
                              </span>
                            )}
                            <div className="flex items-center gap-2 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                              {!notification.isRead && (
                                <button
                                  onClick={(e) => handleMarkAsRead(notification.id, e)}
                                  className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                                  title={t('notifications.markAsRead')}
                                >
                                  <Check size={14} />
                                </button>
                              )}
                              <button
                                onClick={(e) => handleDelete(notification.id, e)}
                                className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-all"
                                title={t('common.delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300 dark:text-slate-600">
                    <BellOff size={32} />
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{t('notifications.empty')}</h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t('notifications.upToDate')}</p>
                </div>
              )}
            </div>

            {notifications.length > 0 && (
              <div className="p-3 bg-slate-50/50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-center">
                <button 
                  onClick={() => setIsOpen(false)}
                  className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {t('common.close')}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;

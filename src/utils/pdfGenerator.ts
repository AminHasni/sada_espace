import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { Product, Client, StockExit, Payment, Expense, ServiceRecord } from '../types';
import * as arabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();

// Helper to detect Arabic characters
const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

// Use more reliable font sources with CORS support
const AMIRI_FONT_URLS = [
  'https://cdn.jsdelivr.net/gh/googlefonts/amiri@main/fonts/ttf/Amiri-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/alif-type/amiri@0.113/fonts/ttf/Amiri-Regular.ttf',
  'https://fonts.gstatic.com/s/amiri/v28/J7afp9id8znt9L06Z97S.ttf',
  'https://cdn.jsdelivr.net/npm/amiri-font@0.0.3/Amiri-Regular.ttf',
  'https://unpkg.com/@fontsource/amiri/files/amiri-arabic-400-normal.ttf'
];

let cachedFontBase64: string | null = null;

const fetchFontAsBase64 = async (urls: string[]): Promise<string> => {
  if (cachedFontBase64) return cachedFontBase64;

  const fetchOne = async (url: string): Promise<string> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per source
    
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-cache' // Force fresh fetch to avoid stale cache issues
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (!result || !result.includes('base64,')) {
            reject(new Error('Invalid base64 result'));
            return;
          }
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  };

  // Fallback for Promise.any if not available
  const anyPromise = async <T>(promises: Promise<T>[]): Promise<T> => {
    if (typeof Promise.any === 'function') {
      return Promise.any(promises);
    }
    
    // Simple fallback: return the first one that succeeds
    return new Promise((resolve, reject) => {
      let rejectedCount = 0;
      const errors: any[] = [];
      promises.forEach(p => {
        p.then(resolve).catch(err => {
          errors.push(err);
          rejectedCount++;
          if (rejectedCount === promises.length) {
            reject(new Error('All promises failed: ' + errors.map(e => e.message).join(', ')));
          }
        });
      });
    });
  };

  try {
    // Try all sources in parallel, return the first one that succeeds
    cachedFontBase64 = await anyPromise(urls.map(url => fetchOne(url)));
    return cachedFontBase64!;
  } catch (e) {
    console.error('All font sources failed to load:', e);
    throw new Error('Failed to load Arabic font from all sources. Please check your internet connection.');
  }
};

const processArabicText = (text: string) => {
  if (!text) return '';
  try {
    // Reshape Arabic characters
    const reshaped = (arabicReshaper as any).reshape(text);
    // Apply Bidi algorithm to handle RTL correctly
    const bidiData = bidi.getVisual(reshaped);
    return bidiData;
  } catch (e) {
    console.error('Error processing Arabic text:', e);
    return text;
  }
};

interface ReportData {
  dateRange: { start: string; end: string };
  totalSales: number;
  totalPayments: number;
  totalExpenses: number;
  totalServices: number;
  totalCredits: number;
  netProfit: number;
  stockExits: StockExit[];
  payments: Payment[];
  expenses: Expense[];
  services: ServiceRecord[];
  products: Product[];
  language: string;
}

export const generatePDFReport = async (data: ReportData, t: any) => {
  const doc = new jsPDF();
  const dateLocale = data.language === 'ar' ? arDZ : fr;
  const isArabicUI = data.language === 'ar';
  let fontLoaded = false;

  // Always try to load Arabic font if UI is Arabic OR if we suspect Arabic content
  // To be safe and support mixed content, we'll try to load it always
  try {
    const fontBase64 = await fetchFontAsBase64(AMIRI_FONT_URLS);
    doc.addFileToVFS('Amiri-Regular.ttf', fontBase64);
    doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal');
    fontLoaded = true;
  } catch (error) {
    console.error('Failed to load Arabic font:', error);
  }

  const formatText = (text: string) => {
    if (!text) return '';
    // Process if it's Arabic UI OR if the text itself contains Arabic characters
    if (isArabicUI || hasArabic(text)) {
      return processArabicText(text);
    }
    return text;
  };

  const getFont = (text: string) => {
    return (fontLoaded && (isArabicUI || hasArabic(text))) ? 'Amiri' : 'helvetica';
  };

  const title = formatText(t('dashboard.report.title', "Rapport d'Activité"));
  const period = `${format(new Date(data.dateRange.start), 'dd MMMM yyyy', { locale: dateLocale })} - ${format(new Date(data.dateRange.end), 'dd MMMM yyyy', { locale: dateLocale })}`;

  // Header
  doc.setFontSize(20);
  doc.setFont(getFont(title));
  if (isArabicUI) {
    doc.text(title, 196, 22, { align: 'right' });
  } else {
    doc.text(title, 14, 22);
  }
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  const periodText = formatText(`Période: ${period}`);
  const generatedText = formatText(`Généré le: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`);
  
  if (isArabicUI) {
    doc.setFont(getFont(periodText));
    doc.text(periodText, 196, 30, { align: 'right' });
    doc.setFont(getFont(generatedText));
    doc.text(generatedText, 196, 36, { align: 'right' });
  } else {
    doc.setFont(getFont(periodText));
    doc.text(periodText, 14, 30);
    doc.setFont(getFont(generatedText));
    doc.text(generatedText, 14, 36);
  }

  // Summary Section
  doc.setFontSize(14);
  doc.setTextColor(0);
  const summaryTitle = formatText(t('dashboard.report.summary', 'Résumé Financier'));
  doc.setFont(getFont(summaryTitle));
  if (isArabicUI) {
    doc.text(summaryTitle, 196, 50, { align: 'right' });
  } else {
    doc.text(summaryTitle, 14, 50);
  }

  autoTable(doc, {
    startY: 55,
    head: [[
      t('dashboard.financials.totalSales', 'Ventes Totales'),
      t('dashboard.financials.paymentsReceived', 'Paiements Reçus'),
      t('dashboard.financials.totalServices', 'Services Totaux'),
      t('dashboard.financials.totalExpenses', 'Dépenses Totales'),
      t('dashboard.financials.netProfit', 'Recette Nette')
    ].map(formatText)],
    body: [[
      `${data.totalSales.toLocaleString()} DT`,
      `${data.totalPayments.toLocaleString()} DT`,
      `${data.totalServices.toLocaleString()} DT`,
      `${data.totalExpenses.toLocaleString()} DT`,
      `${data.netProfit.toLocaleString()} DT`
    ].map(formatText)],
    theme: 'grid',
    headStyles: { 
      fillColor: [63, 131, 248],
      font: fontLoaded ? 'Amiri' : 'helvetica',
      halign: isArabicUI ? 'right' : 'left'
    },
    styles: {
      font: fontLoaded ? 'Amiri' : 'helvetica',
      halign: isArabicUI ? 'right' : 'left'
    }
  });

  // Sales Table
  const sales = data.stockExits.filter(e => e.type === 'sale');
  if (sales.length > 0) {
    const salesTitle = formatText(t('dashboard.report.sales', 'Détail des Ventes'));
    const salesY = (doc as any).lastAutoTable.finalY + 15;
    if (isArabicUI) {
      doc.text(salesTitle, 196, salesY, { align: 'right' });
    } else {
      doc.text(salesTitle, 14, salesY);
    }

    autoTable(doc, {
      startY: salesY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('common.client', 'Client'),
        t('common.productsCategories', 'Produits & Catégories'),
        t('common.amount', 'Montant'),
        t('common.status', 'Statut'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: sales.map(s => {
        const productDetails = s.items.map(item => {
          const product = data.products.find(p => p.id === item.productId);
          const category = product?.category ? `(${product.category})` : '';
          return `${item.productName} ${category} x${item.quantity}`;
        }).join('\n');

        const details = s.serviceName 
          ? `${t('common.service', 'Service')}: ${s.serviceName}\n${productDetails}`
          : productDetails;

        return [
          format(new Date(s.exitDate), 'dd/MM/yyyy HH:mm'),
          s.clientName || '-',
          details,
          `${(s.totalAmount || 0).toLocaleString()} DT`,
          s.paymentStatus === 'paid' ? t('common.paid', 'Payé') : t('common.unpaid', 'Non payé'),
          s.performedByName || '-'
        ].map(formatText);
      }),
      theme: 'striped',
      headStyles: { 
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      }
    });
  }

  // Services Table
  if (data.services.length > 0) {
    const servicesTitle = formatText(t('services.title', 'Services'));
    const servicesY = (doc as any).lastAutoTable.finalY + 15;
    if (isArabicUI) {
      doc.text(servicesTitle, 196, servicesY, { align: 'right' });
    } else {
      doc.text(servicesTitle, 14, servicesY);
    }

    autoTable(doc, {
      startY: servicesY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('common.description', 'Description'),
        t('common.amount', 'Montant'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: data.services.map(s => [
        format(new Date(s.date), 'dd/MM/yyyy HH:mm'),
        s.description,
        `${s.price.toLocaleString()} DT`,
        s.performedByName || '-'
      ].map(formatText)),
      theme: 'striped',
      headStyles: { 
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      }
    });
  }

  // Expenses Table
  if (data.expenses.length > 0) {
    const expensesTitle = formatText(t('dashboard.report.expenses', 'Détail des Dépenses'));
    const expensesY = (doc as any).lastAutoTable.finalY + 15;
    if (isArabicUI) {
      doc.text(expensesTitle, 196, expensesY, { align: 'right' });
    } else {
      doc.text(expensesTitle, 14, expensesY);
    }

    autoTable(doc, {
      startY: expensesY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('common.description', 'Description'),
        t('common.category', 'Catégorie'),
        t('common.amount', 'Montant'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: data.expenses.map(e => [
        format(new Date(e.date), 'dd/MM/yyyy HH:mm'),
        e.description,
        e.category || '-',
        `${e.amount.toLocaleString()} DT`,
        e.recordedByName || '-'
      ].map(formatText)),
      theme: 'striped',
      headStyles: { 
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      }
    });
  }

  // Payments Table
  if (data.payments.length > 0) {
    const paymentsTitle = formatText(t('dashboard.report.payments', 'Détail des Paiements'));
    const paymentsY = (doc as any).lastAutoTable.finalY + 15;
    if (isArabicUI) {
      doc.text(paymentsTitle, 196, paymentsY, { align: 'right' });
    } else {
      doc.text(paymentsTitle, 14, paymentsY);
    }

    autoTable(doc, {
      startY: paymentsY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('common.client', 'Client'),
        t('common.amount', 'Montant'),
        t('common.method', 'Méthode'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: data.payments.map(p => [
        format(new Date(p.date), 'dd/MM/yyyy HH:mm'),
        p.clientName,
        `${p.amount.toLocaleString()} DT`,
        p.method === 'cash' ? t('common.cash', 'Espèces') :
        p.method === 'check' ? t('common.check', 'Chèque') :
        t('common.transfer', 'Virement'),
        p.performedByName || '-'
      ].map(formatText)),
      theme: 'striped',
      headStyles: { 
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      }
    });
  }

  // Save the PDF
  doc.save(`rapport_boutique_${data.dateRange.start}_au_${data.dateRange.end}.pdf`);
};

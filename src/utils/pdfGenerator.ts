import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { Product, Client, StockExit, Payment, Expense, ServiceRecord } from '../types';
import arabicReshaper from 'arabic-reshaper';
import bidiFactory from 'bidi-js';

// Initialize bidi with a safer check for the factory function
const getBidiInstance = () => {
  try {
    const factory = (bidiFactory as any).default || bidiFactory;
    return typeof factory === 'function' ? factory() : factory;
  } catch (e) {
    console.error('Failed to initialize bidi-js:', e);
    return null;
  }
};

const bidi = getBidiInstance();

// Helper to detect Arabic characters
const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

// Use more reliable font sources with CORS support
const AMIRI_FONT_URLS = [
  'https://github.com/googlefonts/amiri/raw/master/fonts/ttf/Amiri-Regular.ttf',
  'https://github.com/googlefonts/amiri/raw/main/fonts/ttf/Amiri-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/googlefonts/amiri@main/fonts/ttf/Amiri-Regular.ttf'
];

let cachedFontBase64: string | null = null;

const fetchFontAsBase64 = async (urls: string[]): Promise<string> => {
  if (cachedFontBase64) return cachedFontBase64;

  const fetchOne = async (url: string): Promise<string> => {
    try {
      const response = await fetch(url, { 
        cache: 'force-cache',
        mode: 'cors'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          if (result && result.includes('base64,')) {
            resolve(result.split(',')[1]);
          } else {
            reject(new Error('Invalid base64 result'));
          }
        };
        reader.onerror = () => reject(new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      throw e;
    }
  };

  // Try sources sequentially to avoid overwhelming or triggering rate limits
  const errors: string[] = [];
  for (const url of urls) {
    try {
      console.log(`Attempting to load Arabic font from: ${url}`);
      const base64 = await fetchOne(url);
      console.log(`Successfully loaded Arabic font from: ${url}`);
      cachedFontBase64 = base64;
      return base64;
    } catch (e: any) {
      console.warn(`Failed to load Arabic font from ${url}:`, e.message);
      errors.push(`${url}: ${e.message}`);
      continue;
    }
  }

  const errorMessage = 'Failed to load Arabic font from all sources: ' + errors.join('; ');
  console.error(errorMessage);
  throw new Error(errorMessage);
};

const processArabicText = (text: string) => {
  if (!text) return '';
  try {
    // Check if it's a mix of Arabic and other characters
    if (!hasArabic(text)) return text;

    // Reshape Arabic characters
    // Using a safe access for the reshape function
    const reshaper = (arabicReshaper as any).default || arabicReshaper;
    const reshaped = typeof reshaper.reshape === 'function' 
      ? reshaper.reshape(text) 
      : (typeof reshaper === 'function' ? reshaper(text) : text);
    
    // Apply Bidi algorithm to handle RTL correctly
    if (bidi) {
      if (typeof bidi.getVisual === 'function') {
        return bidi.getVisual(reshaped);
      } else if (typeof (bidi as any).processText === 'function') {
        return (bidi as any).processText(reshaped).visual;
      }
    }
    return reshaped;
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

  // Key Statistics Grid (Visual Cards)
  const statsY = 55;
  const cardWidth = 35;
  const cardHeight = 20;
  const cardGap = 5;
  
  const keyStats = [
    { label: t('dashboard.financials.totalSales', 'Ventes'), value: `${data.totalSales.toLocaleString()} DT`, color: [240, 247, 255], textColor: [37, 99, 235] },
    { label: t('dashboard.financials.paymentsReceived', 'Paiements'), value: `${data.totalPayments.toLocaleString()} DT`, color: [240, 253, 244], textColor: [22, 163, 74] },
    { label: t('dashboard.financials.totalExpenses', 'Dépenses'), value: `${data.totalExpenses.toLocaleString()} DT`, color: [254, 242, 242], textColor: [220, 38, 38] },
    { label: t('dashboard.financials.netProfit', 'Recette'), value: `${data.netProfit.toLocaleString()} DT`, color: [255, 251, 235], textColor: [217, 119, 6] },
    { label: t('dashboard.financials.outstandingCredits', 'Crédits'), value: `${data.totalCredits.toLocaleString()} DT`, color: [255, 247, 237], textColor: [234, 88, 12] }
  ];

  keyStats.forEach((stat, i) => {
    const x = 14 + i * (cardWidth + cardGap);
    
    // Draw card background
    doc.setFillColor(stat.color[0], stat.color[1], stat.color[2]);
    doc.roundedRect(x, statsY, cardWidth, cardHeight, 2, 2, 'F');
    
    // Label
    doc.setFontSize(7);
    doc.setTextColor(100);
    const label = formatText(stat.label);
    doc.setFont(getFont(label));
    doc.text(label, x + cardWidth / 2, statsY + 7, { align: 'center' });
    
    // Value
    doc.setFontSize(9);
    doc.setTextColor(stat.textColor[0], stat.textColor[1], stat.textColor[2]);
    doc.setFont(getFont(stat.value), 'bold');
    doc.text(stat.value, x + cardWidth / 2, statsY + 14, { align: 'center' });
  });

  autoTable(doc, {
    startY: statsY + cardHeight + 10,
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
      halign: 'center'
    },
    styles: {
      font: fontLoaded ? 'Amiri' : 'helvetica',
      halign: 'center',
      fontSize: 10
    }
  });

  // Trends Visualization (Simple Bar Chart)
  const chartY = (doc as any).lastAutoTable.finalY + 15;
  const chartTitle = formatText(t('dashboard.report.trends', 'Tendances d\'Activité'));
  doc.setFontSize(14);
  doc.setFont(getFont(chartTitle));
  if (isArabicUI) {
    doc.text(chartTitle, 196, chartY, { align: 'right' });
  } else {
    doc.text(chartTitle, 14, chartY);
  }

  const chartData = [
    { label: t('dashboard.financials.totalSales', 'Ventes'), value: data.totalSales, color: [63, 131, 248] },
    { label: t('dashboard.financials.paymentsReceived', 'Paiements'), value: data.totalPayments, color: [16, 185, 129] },
    { label: t('dashboard.financials.totalExpenses', 'Dépenses'), value: data.totalExpenses, color: [239, 68, 68] },
    { label: t('dashboard.financials.netProfit', 'Recette'), value: data.netProfit, color: [245, 158, 11] }
  ];

  const maxVal = Math.max(...chartData.map(d => d.value), 1);
  const chartHeight = 40;
  const chartWidth = 160;
  const barWidth = 25;
  const gap = 15;
  const startX = 25;
  const startY = chartY + 10;

  // Draw axis
  doc.setDrawColor(200);
  doc.line(startX, startY, startX, startY + chartHeight); // Y axis
  doc.line(startX, startY + chartHeight, startX + chartWidth, startY + chartHeight); // X axis

  chartData.forEach((item, i) => {
    const barHeight = (item.value / maxVal) * chartHeight;
    const x = startX + gap + i * (barWidth + gap);
    const y = startY + chartHeight - barHeight;

    // Draw bar
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.rect(x, y, barWidth, barHeight, 'F');

    // Label
    doc.setFontSize(8);
    doc.setTextColor(100);
    const label = formatText(item.label);
    doc.setFont(getFont(label));
    doc.text(label, x + barWidth / 2, startY + chartHeight + 5, { align: 'center' });
    
    // Value
    doc.setFontSize(7);
    doc.text(`${item.value.toLocaleString()} DT`, x + barWidth / 2, y - 2, { align: 'center' });
  });

  // Footer function
  const addFooter = () => {
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      const footerText = formatText(t('dashboard.report.footer', 'Page {page} sur {total}', { page: i, total: pageCount }));
      doc.setFont(getFont(footerText));
      doc.text(footerText, 105, 285, { align: 'center' });
      
      // Decorative line
      doc.setDrawColor(240);
      doc.line(14, 280, 196, 280);
    }
  };

  // Sales Table
  const sales = data.stockExits.filter(e => e.type === 'sale');
  if (sales.length > 0) {
    const salesTitle = formatText(t('dashboard.report.sales', 'Détail des Ventes'));
    const salesY = startY + chartHeight + 20;
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
        fillColor: [63, 131, 248],
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left',
        fontSize: 9
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
        fillColor: [245, 158, 11],
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left',
        fontSize: 9
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
        fillColor: [239, 68, 68],
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left',
        fontSize: 9
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
        t('common.notes', 'Notes'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: data.payments.map(p => [
        format(new Date(p.date), 'dd/MM/yyyy HH:mm'),
        p.clientName,
        `${p.amount.toLocaleString()} DT`,
        p.method === 'cash' ? t('common.cash', 'Espèces') :
        p.method === 'check' ? t('common.check', 'Chèque') :
        t('common.transfer', 'Virement'),
        p.notes || '-',
        p.performedByName || '-'
      ].map(formatText)),
      theme: 'striped',
      headStyles: { 
        fillColor: [16, 185, 129],
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: fontLoaded ? 'Amiri' : 'helvetica',
        halign: isArabicUI ? 'right' : 'left',
        fontSize: 9
      }
    });
  }

  // Add footer to all pages
  addFooter();

  // Save the PDF
  doc.save(`rapport_boutique_${data.dateRange.start}_au_${data.dateRange.end}.pdf`);
};

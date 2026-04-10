import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format, parseISO } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { Product, Client, StockExit, Payment, Expense, ServiceRecord, CashSession } from '../types';

// Helper to detect Arabic characters
const hasArabic = (text: string) => /[\u0600-\u06FF]/.test(text);

// Helper to reshape and reorder Arabic text (Simplified to avoid build issues)
export const reshapeArabic = (text: string) => {
  if (!text) return '';
  return String(text);
};

// Helper to format currency and avoid PDF rendering issues with locale-specific characters (like slashes or non-breaking spaces)
export const formatCurrency = (value: number) => {
  if (value === undefined || value === null) return '0';
  const num = Number(value);
  if (isNaN(num)) return '0';
  
  const parts = num.toFixed(3).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const decimalPart = parts[1].replace(/0+$/, '');
  
  return decimalPart.length > 0 ? `${integerPart},${decimalPart}` : integerPart;
};

// Use more reliable font sources with CORS support
const AMIRI_FONT_URLS = [
  'https://cdn.jsdelivr.net/gh/googlefonts/amiri@main/fonts/ttf/Amiri-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@master/hinted/ttf/NotoSansArabic/NotoSansArabic-Regular.ttf',
  'https://unpkg.com/amiri-font@0.1.0/Amiri-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/rastikerdar/vazir-font@v30.1.0/dist/Vazir.ttf',
  'https://fonts.gstatic.com/s/amiri/v17/J7afF9i7VnKu6beeS_S2.ttf'
];

let cachedFontBase64: string | null = null;

const fetchFontAsBase64 = async (urls: string[]): Promise<string> => {
  if (cachedFontBase64) return cachedFontBase64;

  const errors: string[] = [];
  for (const url of urls) {
    try {
      console.log(`Attempting to load Arabic font from: ${url}`);
      const response = await fetch(url, { 
        cache: 'force-cache',
        mode: 'cors'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 0x8000;
      let binary = '';
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
      }
      const base64 = btoa(binary);
      
      if (base64) {
        console.log(`Successfully loaded Arabic font from: ${url}`);
        cachedFontBase64 = base64;
        return base64;
      }
    } catch (e: any) {
      console.warn(`Failed to load Arabic font from ${url}:`, e.message);
      errors.push(`${url}: ${e.message}`);
    }
  }

  throw new Error('Failed to load Arabic font from all sources: ' + errors.join('; '));
};

interface ReportData {
  dateRange: { start: string; end: string };
  totalSales: number;
  totalCreditSales: number;
  totalDiscounts: number;
  totalPayments: number;
  totalExpenses: number;
  totalServices: number;
  totalCredits: number;
  netProfit: number;
  stockExits: StockExit[];
  payments: Payment[];
  expenses: Expense[];
  services: ServiceRecord[];
  cashSessions: CashSession[];
  products: Product[];
  language: string;
  isDaily?: boolean;
}

// --- SHARED VISUAL COMPONENTS ---

const drawHeader = (doc: jsPDF, y: number, title: string, isArabicUI: boolean, formatText: (t: string) => string, getFont: (t: string) => string) => {
  doc.setFillColor(63, 131, 248);
  doc.roundedRect(14, y, 12, 12, 2, 2, 'F');
  doc.setTextColor(255);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('ES', 20, y + 8, { align: 'center' });

  doc.setFontSize(16);
  doc.setTextColor(63, 131, 248);
  const storeName = formatText("Espace Sadaa - فضاء صدى");
  const storeFont = getFont(storeName);
  doc.setFont(storeFont, storeFont === 'ArabicFont' ? 'normal' : 'bold');
  if (isArabicUI) {
    doc.text(storeName, 196, y + 8, { align: 'right' });
  } else {
    doc.text(storeName, 30, y + 8);
  }

  doc.setFontSize(18);
  doc.setTextColor(31, 41, 55);
  const titleFont = getFont(title);
  doc.setFont(titleFont, titleFont === 'ArabicFont' ? 'normal' : 'bold');
  if (isArabicUI) {
    doc.text(title, 196, y + 25, { align: 'right' });
  } else {
    doc.text(title, 14, y + 25);
  }

  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.line(14, y + 14, 196, y + 14);
  return y + 35;
};

const addFooter = (doc: jsPDF, isArabicUI: boolean, t: any, formatText: (t: string) => string, getFont: (t: string) => string) => {
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150);
    const footerText = formatText(t('dashboard.report.footer', 'Page {page} sur {total}', { page: i, total: pageCount }));
    doc.setFont(getFont(footerText));
    doc.text(footerText, 105, 285, { align: 'center' });
    doc.setDrawColor(240);
    doc.line(14, 280, 196, 280);
  }
};

const drawStatCards = (doc: jsPDF, y: number, stats: any[], formatText: (t: string) => string, getFont: (t: string) => string) => {
  const cardWidth = (182 - (stats.length - 1) * 4) / stats.length;
  const cardHeight = 22;
  
  stats.forEach((stat, i) => {
    const x = 14 + i * (cardWidth + 4);
    doc.setFillColor(stat.color[0], stat.color[1], stat.color[2]);
    doc.setDrawColor(stat.borderColor[0], stat.borderColor[1], stat.borderColor[2]);
    doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');
    
    doc.setFontSize(8);
    doc.setTextColor(75, 85, 99);
    const label = formatText(stat.label);
    doc.setFont(getFont(label));
    doc.text(label, x + cardWidth / 2, y + 8, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(stat.textColor[0], stat.textColor[1], stat.textColor[2]);
    const valFont = getFont(stat.value);
    doc.setFont(valFont, valFont === 'ArabicFont' ? 'normal' : 'bold');
    doc.text(stat.value, x + cardWidth / 2, y + 16, { align: 'center' });
  });
  return y + cardHeight + 10;
};

export const generatePDFReport = async (data: ReportData, t: any) => {
  const doc = new jsPDF();
  const dateLocale = data.language === 'ar' ? arDZ : fr;
  const isArabicUI = data.language === 'ar';
  let fontLoaded = false;

  // Always try to load Arabic font if UI is Arabic OR if we suspect Arabic content
  // To be safe and support mixed content, we'll try to load it always
  try {
    const fontBase64 = await fetchFontAsBase64(AMIRI_FONT_URLS);
    doc.addFileToVFS('ArabicFont.ttf', fontBase64);
    doc.addFont('ArabicFont.ttf', 'ArabicFont', 'normal');
    fontLoaded = true;
    if (isArabicUI) doc.setFont('ArabicFont', 'normal');
  } catch (error) {
    console.error('Failed to load Arabic font:', error);
  }

  const formatText = (text: string) => {
    if (!text) return '';
    const str = String(text);
    if (fontLoaded && (isArabicUI || hasArabic(str))) {
      return reshapeArabic(str);
    }
    return str;
  };

  const getFont = (text: string) => {
    const str = String(text);
    return (fontLoaded && (isArabicUI || hasArabic(str))) ? 'ArabicFont' : 'helvetica';
  };

  // --- REPORT GENERATION ---

  const title = data.isDaily 
    ? t('dashboard.report.dailyReport', 'Rapport Journalier')
    : t('dashboard.report.title', "Rapport d'Activité");
  let currentY = drawHeader(doc, 10, title, isArabicUI, formatText, getFont);

  // Period Info
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128);
  const isFrench = data.language.startsWith('fr');
  const dateFormatStr = isFrench ? 'EEEE dd MMMM yyyy' : 'dd MMMM yyyy';
  const period = `${format(parseISO(data.dateRange.start), dateFormatStr, { locale: dateLocale })} - ${format(parseISO(data.dateRange.end), dateFormatStr, { locale: dateLocale })}`;
  const periodText = formatText(`${t('common.period', 'Période')}: ${period}`);
  const generatedText = formatText(`${t('common.generatedAt', 'Généré le')}: ${format(new Date(), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale })}`);
  
  if (isArabicUI) {
    doc.text(periodText, 196, currentY, { align: 'right' });
    doc.text(generatedText, 196, currentY + 6, { align: 'right' });
  } else {
    doc.text(periodText, 14, currentY);
    doc.text(generatedText, 14, currentY + 6);
  }
  currentY += 15;

  // Summary
  const summaryTitle = formatText(t('dashboard.report.summary', 'Résumé Financier'));
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  const summaryTitleFont = getFont(summaryTitle);
  doc.setFont(summaryTitleFont, summaryTitleFont === 'ArabicFont' ? 'normal' : 'bold');
  if (isArabicUI) {
    doc.text(summaryTitle, 196, currentY, { align: 'right' });
  } else {
    doc.text(summaryTitle, 14, currentY);
  }
  currentY += 5;

  const keyStats = [
    { label: t('dashboard.financials.totalSales', 'Ventes Normales'), value: `${formatCurrency(data.totalSales)} DT`, color: [239, 246, 255], textColor: [37, 99, 235], borderColor: [191, 219, 254] },
    { label: t('dashboard.financials.totalCreditSales', 'Ventes par Crédit'), value: `${formatCurrency(data.totalCreditSales)} DT`, color: [255, 247, 237], textColor: [249, 115, 22], borderColor: [255, 237, 213] },
    { label: t('dashboard.financials.totalDiscounts', 'Remises'), value: `${formatCurrency(data.totalDiscounts)} DT`, color: [254, 242, 242], textColor: [220, 38, 38], borderColor: [254, 202, 202] },
    { label: t('dashboard.financials.paymentsReceived', 'Paiements'), value: `${formatCurrency(data.totalPayments)} DT`, color: [240, 253, 244], textColor: [22, 163, 74], borderColor: [187, 247, 208] },
    { label: t('dashboard.financials.totalExpenses', 'Dépenses'), value: `${formatCurrency(data.totalExpenses)} DT`, color: [254, 242, 242], textColor: [220, 38, 38], borderColor: [254, 202, 202] },
    { label: t('dashboard.financials.totalServices', 'Services'), value: `${formatCurrency(data.totalServices)} DT`, color: [245, 243, 255], textColor: [124, 58, 237], borderColor: [221, 214, 254] },
    { label: t('dashboard.financials.netProfit', 'Recette'), value: `${formatCurrency(data.netProfit)} DT`, color: [255, 251, 235], textColor: [217, 119, 6], borderColor: [254, 243, 199] }
  ];

  currentY = drawStatCards(doc, currentY, keyStats, formatText, getFont);

  // Chart
  const chartTitle = formatText(t('dashboard.report.trends', 'Tendances d\'Activité'));
  doc.setFontSize(14);
  const chartTitleFont = getFont(chartTitle);
  doc.setFont(chartTitleFont, chartTitleFont === 'ArabicFont' ? 'normal' : 'bold');
  if (isArabicUI) {
    doc.text(chartTitle, 196, currentY + 5, { align: 'right' });
  } else {
    doc.text(chartTitle, 14, currentY + 5);
  }

  const chartData = [
    { label: t('dashboard.financials.totalSales', 'Ventes'), value: data.totalSales, color: [63, 131, 248] },
    { label: t('dashboard.financials.paymentsReceived', 'Paiements'), value: data.totalPayments, color: [16, 185, 129] },
    { label: t('dashboard.financials.totalExpenses', 'Dépenses'), value: data.totalExpenses, color: [239, 68, 68] },
    { label: t('dashboard.financials.netProfit', 'Recette'), value: data.netProfit, color: [245, 158, 11] }
  ];

  const maxVal = Math.max(...chartData.map(d => d.value), 1);
  const chartHeight = 35;
  const barWidth = 20;
  const gap = 15;
  const startX = 35;
  const startY = currentY + 15;

  chartData.forEach((item, i) => {
    const barHeight = (item.value / maxVal) * chartHeight;
    const x = startX + i * (barWidth + gap);
    const y = startY + chartHeight - barHeight;
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.rect(x, y, barWidth, barHeight, 'F');
    doc.setFontSize(7);
    doc.setTextColor(100);
    const label = formatText(item.label);
    doc.setFont(getFont(label));
    doc.text(label, x + barWidth / 2, startY + chartHeight + 5, { align: 'center' });
    doc.text(`${formatCurrency(item.value)} DT`, x + barWidth / 2, y - 2, { align: 'center' });
  });

  currentY = startY + chartHeight + 20;

  // Sales Table (Detailed)
  const salesExits = data.stockExits.filter(e => e.type === 'sale');
  if (salesExits.length > 0) {
    const salesTitle = formatText(t('dashboard.report.sales', 'Détails des Ventes'));
    const salesTitleFont = getFont(salesTitle);
    doc.setFont(salesTitleFont, salesTitleFont === 'ArabicFont' ? 'normal' : 'bold');
    doc.setFontSize(14);
    if (isArabicUI) {
      doc.text(salesTitle, 196, currentY, { align: 'right' });
    } else {
      doc.text(salesTitle, 14, currentY);
    }

    const salesRows: string[][] = [];
    salesExits.forEach(sale => {
      sale.items.forEach(item => {
        const product = data.products.find(p => p.id === item.productId);
        const category = item.category || product?.category || '-';
        const totalCost = item.quantity * (item.unitPrice || 0);
        const rawDate = sale.createdAt || sale.exitDate;
        const saleDateFormatted = rawDate ? format(parseISO(rawDate), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale }) : '-';
        salesRows.push([
          saleDateFormatted,
          category,
          item.productName,
          item.quantity.toString(),
          `${formatCurrency(totalCost)} DT`,
          sale.performedByName || '-'
        ].map(formatText));
      });
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('common.category', 'Catégorie'),
        t('common.product', 'Produit'),
        t('common.quantity', 'Quantité'),
        t('common.totalCost', 'Coût Total'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: salesRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [243, 244, 246],
        textColor: [31, 41, 55],
        font: 'helvetica',
        fontStyle: 'bold',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: {
        font: 'helvetica',
        fontStyle: 'normal',
        halign: isArabicUI ? 'right' : 'left',
        fontSize: 9,
        cellPadding: 4
      },
      didParseCell: (data) => {
        if (fontLoaded) {
          const cellText = data.cell.text.join(' ');
          if (isArabicUI || hasArabic(cellText)) {
            data.cell.styles.font = 'ArabicFont';
            if (data.section === 'head' && !isArabicUI) {
              data.cell.styles.fontStyle = 'normal'; // ArabicFont might not support bold
            }
          }
        }
      },
      alternateRowStyles: {
        fillColor: [255, 255, 255]
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Expenses Table
  if (data.expenses.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    const expTitle = formatText(t('dashboard.report.expenses', 'Détails des Dépenses'));
    doc.setFont(getFont(expTitle), getFont(expTitle) === 'ArabicFont' ? 'normal' : 'bold');
    doc.setFontSize(14);
    if (isArabicUI) doc.text(expTitle, 196, currentY, { align: 'right' });
    else doc.text(expTitle, 14, currentY);

    const expRows = data.expenses.map(exp => {
      const rawDate = exp.createdAt || exp.date;
      return [
        rawDate ? format(parseISO(rawDate), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale }) : '-',
        exp.category || '-',
        exp.description,
        `${formatCurrency(exp.amount)} DT`
      ].map(formatText);
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [[t('common.date', 'Date'), t('common.category', 'Catégorie'), t('common.description', 'Description'), t('common.amount', 'Montant')].map(formatText)],
      body: expRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [243, 244, 246], 
        textColor: [31, 41, 55], 
        font: 'helvetica', 
        fontStyle: 'bold',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: { 
        font: 'helvetica', 
        fontSize: 9, 
        halign: isArabicUI ? 'right' : 'left' 
      },
      didParseCell: (data) => {
        if (fontLoaded) {
          const cellText = data.cell.text.join(' ');
          if (isArabicUI || hasArabic(cellText)) {
            data.cell.styles.font = 'ArabicFont';
            if (data.section === 'head' && !isArabicUI) {
              data.cell.styles.fontStyle = 'normal';
            }
          }
        }
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Services Table
  if (data.services.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    const servTitle = formatText(t('dashboard.report.services', 'Détails des Services'));
    doc.setFont(getFont(servTitle), getFont(servTitle) === 'ArabicFont' ? 'normal' : 'bold');
    doc.setFontSize(14);
    if (isArabicUI) doc.text(servTitle, 196, currentY, { align: 'right' });
    else doc.text(servTitle, 14, currentY);

    const servRows = data.services.map(serv => {
      const rawDate = serv.createdAt || serv.date;
      return [
        rawDate ? format(parseISO(rawDate), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale }) : '-',
        serv.description,
        `${formatCurrency(serv.price)} DT`,
        serv.performedByName || '-'
      ].map(formatText);
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [[t('common.date', 'Date'), t('common.description', 'Description'), t('common.price', 'Prix'), t('common.user', 'Magasinier')].map(formatText)],
      body: servRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [243, 244, 246], 
        textColor: [31, 41, 55], 
        font: 'helvetica', 
        fontStyle: 'bold',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: { 
        font: 'helvetica', 
        fontSize: 9, 
        halign: isArabicUI ? 'right' : 'left' 
      },
      didParseCell: (data) => {
        if (fontLoaded) {
          const cellText = data.cell.text.join(' ');
          if (isArabicUI || hasArabic(cellText)) {
            data.cell.styles.font = 'ArabicFont';
            if (data.section === 'head' && !isArabicUI) {
              data.cell.styles.fontStyle = 'normal';
            }
          }
        }
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Credits Table (Detailed)
  const creditExits = data.stockExits.filter(e => e.paymentStatus === 'credit');
  if (creditExits.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    const creditsTitle = formatText(t('dashboard.report.credits', 'Détails des Crédits'));
    doc.setFont(getFont(creditsTitle), getFont(creditsTitle) === 'ArabicFont' ? 'normal' : 'bold');
    doc.setFontSize(14);
    if (isArabicUI) doc.text(creditsTitle, 196, currentY, { align: 'right' });
    else doc.text(creditsTitle, 14, currentY);

    const creditRows: string[][] = [];
    creditExits.forEach(exit => {
      exit.items.forEach(item => {
        const rawDate = exit.createdAt || exit.exitDate;
        creditRows.push([
          rawDate ? format(parseISO(rawDate), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale }) : '-',
          exit.clientName || '-',
          item.productName,
          item.quantity.toString(),
          `${formatCurrency(item.quantity * item.unitPrice)} DT`
        ].map(formatText));
      });
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('clients.form.name', 'Client'),
        t('common.product', 'Produit'),
        t('common.quantity', 'Quantité'),
        t('common.total', 'Total')
      ].map(formatText)],
      body: creditRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [243, 244, 246], 
        textColor: [31, 41, 55], 
        font: 'helvetica', 
        fontStyle: 'bold',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: { 
        font: 'helvetica', 
        fontSize: 9, 
        halign: isArabicUI ? 'right' : 'left' 
      },
      didParseCell: (data) => {
        if (fontLoaded) {
          const cellText = data.cell.text.join(' ');
          if (isArabicUI || hasArabic(cellText)) {
            data.cell.styles.font = 'ArabicFont';
          }
        }
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Payments Table (Detailed)
  if (data.payments.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    const paymentsTitle = formatText(t('dashboard.report.payments', 'Détail des Paiements'));
    doc.setFont(getFont(paymentsTitle), getFont(paymentsTitle) === 'ArabicFont' ? 'normal' : 'bold');
    doc.setFontSize(14);
    if (isArabicUI) doc.text(paymentsTitle, 196, currentY, { align: 'right' });
    else doc.text(paymentsTitle, 14, currentY);

    const paymentRows = data.payments.map(pay => {
      const rawDate = pay.createdAt || pay.date;
      return [
        rawDate ? format(parseISO(rawDate), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale }) : '-',
        pay.clientName || '-',
        `${formatCurrency(pay.amount)} DT`,
        pay.method || '-',
        pay.performedByName || '-'
      ].map(formatText);
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [[
        t('common.dateHeure', 'Date & Heure'),
        t('clients.table.client', 'Client'),
        t('common.amount', 'Montant'),
        t('clients.form.method', 'Méthode'),
        t('common.user', 'Magasinier')
      ].map(formatText)],
      body: paymentRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [243, 244, 246], 
        textColor: [31, 41, 55], 
        font: 'helvetica', 
        fontStyle: 'bold',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: { 
        font: 'helvetica', 
        fontSize: 9, 
        halign: isArabicUI ? 'right' : 'left' 
      },
      didParseCell: (data) => {
        if (fontLoaded) {
          const cellText = data.cell.text.join(' ');
          if (isArabicUI || hasArabic(cellText)) {
            data.cell.styles.font = 'ArabicFont';
          }
        }
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Cash Sessions Table
  if (data.cashSessions.length > 0) {
    if (currentY > 240) { doc.addPage(); currentY = 20; }
    const cashTitle = formatText(t('dashboard.report.cashSessions', 'Sessions de Caisse'));
    doc.setFont(getFont(cashTitle), getFont(cashTitle) === 'ArabicFont' ? 'normal' : 'bold');
    doc.setFontSize(14);
    if (isArabicUI) doc.text(cashTitle, 196, currentY, { align: 'right' });
    else doc.text(cashTitle, 14, currentY);

    const cashRows = data.cashSessions.map(session => {
      return [
        format(parseISO(session.openedAt), isFrench ? 'dd/MM HH:mm' : 'dd/MM HH:mm', { locale: dateLocale }),
        session.userName,
        `${formatCurrency(session.initialAmount)} DT`,
        `${formatCurrency(session.totalAdded || 0)} DT`,
        session.finalAmount !== undefined && session.finalAmount !== null ? `${formatCurrency(session.finalAmount)} DT` : '-',
        t(`cashRegister.status.${session.status}`)
      ].map(formatText);
    });

    autoTable(doc, {
      startY: currentY + 5,
      head: [[
        t('common.date', 'Date'),
        t('common.user', 'Magasinier'),
        t('cashRegister.initialAmount', 'Initial'),
        t('cashRegister.addedFunds', 'Ajouté'),
        t('cashRegister.finalAmount', 'Final'),
        t('common.status', 'Statut')
      ].map(formatText)],
      body: cashRows,
      theme: 'grid',
      headStyles: { 
        fillColor: [243, 244, 246], 
        textColor: [31, 41, 55], 
        font: 'helvetica', 
        fontStyle: 'bold',
        halign: isArabicUI ? 'right' : 'left'
      },
      styles: { 
        font: 'helvetica', 
        fontSize: 9, 
        halign: isArabicUI ? 'right' : 'left' 
      },
      didParseCell: (data) => {
        if (fontLoaded) {
          const cellText = data.cell.text.join(' ');
          if (isArabicUI || hasArabic(cellText)) {
            data.cell.styles.font = 'ArabicFont';
          }
        }
      }
    });
    currentY = (doc as any).lastAutoTable.finalY + 15;
  }

  // Add signature section
  const signatureY = Math.min(currentY + 15, 260);
  const signatureText = formatText(t('common.signature', 'Signature & Cachet'));
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont(getFont(signatureText), 'normal');
  if (isArabicUI) {
    doc.text(signatureText, 196, signatureY, { align: 'right' });
  } else {
    doc.text(signatureText, 14, signatureY);
  }

  // Add footer to all pages
  addFooter(doc, isArabicUI, t, formatText, getFont);

  // Save the PDF
  doc.save(`rapport_boutique_${data.dateRange.start}_au_${data.dateRange.end}.pdf`);
};

export const generateClientCreditReport = async (
  client: Client,
  startDate: string,
  endDate: string,
  transactions: any[],
  summary: { totalCredit: number; totalPaid: number },
  t: any,
  language: string
) => {
  const doc = new jsPDF();
  const dateLocale = language === 'ar' ? arDZ : fr;
  const isArabicUI = language === 'ar';
  let fontLoaded = false;

  try {
    const fontBase64 = await fetchFontAsBase64(AMIRI_FONT_URLS);
    doc.addFileToVFS('ArabicFont.ttf', fontBase64);
    doc.addFont('ArabicFont.ttf', 'ArabicFont', 'normal');
    fontLoaded = true;
    if (isArabicUI) doc.setFont('ArabicFont', 'normal');
  } catch (error) {
    console.error('Failed to load Arabic font:', error);
  }

  const formatText = (text: string) => {
    if (!text) return '';
    const str = String(text);
    if (fontLoaded && (isArabicUI || hasArabic(str))) {
      return reshapeArabic(str);
    }
    return str;
  };

  const getFont = (text: string) => {
    const str = String(text);
    return (fontLoaded && (isArabicUI || hasArabic(str))) ? 'ArabicFont' : 'helvetica';
  };

  // --- REPORT GENERATION ---

  const title = t('creditReports.title', 'Rapport de Crédit Client');
  let currentY = drawHeader(doc, 10, title, isArabicUI, formatText, getFont);

  // Client Info
  doc.setFontSize(11);
  doc.setTextColor(55, 65, 81);
  const clientNameText = formatText(`${t('clients.form.name', 'Nom')}: ${client.name}`);
  const isFrench = language.startsWith('fr');
  const dateFormatStr = isFrench ? 'EEEE dd MMMM yyyy' : 'dd MMMM yyyy';
  const periodText = formatText(`${t('common.period', 'Période')}: ${format(parseISO(startDate), dateFormatStr, { locale: dateLocale })} - ${format(parseISO(endDate), dateFormatStr, { locale: dateLocale })}`);
  
  if (isArabicUI) {
    doc.text(clientNameText, 196, currentY, { align: 'right' });
    doc.text(periodText, 196, currentY + 6, { align: 'right' });
  } else {
    doc.text(clientNameText, 14, currentY);
    doc.text(periodText, 14, currentY + 6);
  }
  currentY += 15;

  // Summary
  const summaryTitle = formatText(t('creditReports.summary', 'Résumé du Compte'));
  doc.setFontSize(14);
  doc.setTextColor(31, 41, 55);
  const summaryTitleFont = getFont(summaryTitle);
  doc.setFont(summaryTitleFont, summaryTitleFont === 'ArabicFont' ? 'normal' : 'bold');
  if (isArabicUI) {
    doc.text(summaryTitle, 196, currentY, { align: 'right' });
  } else {
    doc.text(summaryTitle, 14, currentY);
  }
  currentY += 5;

  const keyStats = [
    { label: t('creditReports.totalSales', 'Total Crédit'), value: `${formatCurrency(summary.totalCredit)} DT`, color: [239, 246, 255], textColor: [37, 99, 235], borderColor: [191, 219, 254] },
    { label: t('creditReports.totalPayments', 'Total Payé'), value: `${formatCurrency(summary.totalPaid)} DT`, color: [240, 253, 244], textColor: [22, 163, 74], borderColor: [187, 247, 208] },
    { label: t('creditReports.netBalance', 'Solde Restant'), value: `${formatCurrency(summary.totalCredit - summary.totalPaid)} DT`, color: [254, 242, 242], textColor: [220, 38, 38], borderColor: [254, 202, 202] }
  ];

  currentY = drawStatCards(doc, currentY, keyStats, formatText, getFont);

  // Details Table
  const detailsTitle = formatText(t('creditReports.clientDetails', 'Détails des Transactions'));
  doc.setFontSize(14);
  const detailsTitleFont = getFont(detailsTitle);
  doc.setFont(detailsTitleFont, detailsTitleFont === 'ArabicFont' ? 'normal' : 'bold');
  if (isArabicUI) {
    doc.text(detailsTitle, 196, currentY, { align: 'right' });
  } else {
    doc.text(detailsTitle, 14, currentY);
  }

  const tableData = transactions.map((tTrans: any) => {
    const rawDate = tTrans.createdAt || tTrans.date;
    return [
      rawDate ? format(parseISO(rawDate), isFrench ? 'EEEE dd MMMM yyyy HH:mm' : 'dd MMMM yyyy HH:mm', { locale: dateLocale }) : '-',
      tTrans.type === 'credit' ? t('common.credit', 'Crédit') : t('clients.recordPayment', 'Paiement'),
      `${formatCurrency(tTrans.amount)} DT`,
      tTrans.ref || '-'
    ].map(formatText);
  });

  autoTable(doc, {
    startY: currentY + 5,
    head: [[
      t('creditReports.table.date', 'Date'),
      t('creditReports.table.type', 'Type'),
      t('creditReports.table.amount', 'Montant'),
      t('creditReports.table.reference', 'Référence')
    ].map(formatText)],
    body: tableData,
    theme: 'grid',
    headStyles: { 
      fillColor: [243, 244, 246],
      textColor: [31, 41, 55],
      font: 'helvetica',
      fontStyle: 'bold',
      halign: isArabicUI ? 'right' : 'left'
    },
    styles: {
      font: 'helvetica',
      fontStyle: 'normal',
      halign: isArabicUI ? 'right' : 'left',
      fontSize: 9,
      cellPadding: 4
    },
    didParseCell: (data) => {
      if (fontLoaded) {
        const cellText = data.cell.text.join(' ');
        if (isArabicUI || hasArabic(cellText)) {
          data.cell.styles.font = 'ArabicFont';
          if (data.section === 'head' && !isArabicUI) {
            data.cell.styles.fontStyle = 'normal';
          }
        }
      }
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255]
    }
  });

  currentY = (doc as any).lastAutoTable.finalY + 15;

  // Add signature section
  const signatureY = Math.min(currentY + 15, 260);
  const signatureText = formatText(t('common.signature', 'Signature & Cachet'));
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.setFont(getFont(signatureText), 'normal');
  if (isArabicUI) {
    doc.text(signatureText, 196, signatureY, { align: 'right' });
  } else {
    doc.text(signatureText, 14, signatureY);
  }

  // Add footer to all pages
  addFooter(doc, isArabicUI, t, formatText, getFont);

  doc.save(`Rapport_Credit_${client.name}_${startDate}_${endDate}.pdf`);
};

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { fr, arDZ } from 'date-fns/locale';
import { Product, Client, StockExit, Payment, Expense, ServiceRecord } from '../types';

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
  language: string;
}

export const generatePDFReport = (data: ReportData, t: any) => {
  const doc = new jsPDF();
  const dateLocale = data.language === 'ar' ? arDZ : fr;
  const isRTL = data.language === 'ar';

  const title = t('dashboard.report.title', "Rapport d'Activité");
  const period = `${format(new Date(data.dateRange.start), 'dd MMMM yyyy', { locale: dateLocale })} - ${format(new Date(data.dateRange.end), 'dd MMMM yyyy', { locale: dateLocale })}`;

  // Header
  doc.setFontSize(20);
  doc.text(title, 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Période: ${period}`, 14, 30);
  doc.text(`Généré le: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 36);

  // Summary Section
  doc.setFontSize(14);
  doc.setTextColor(0);
  doc.text(t('dashboard.report.summary', 'Résumé Financier'), 14, 50);

  autoTable(doc, {
    startY: 55,
    head: [[
      t('dashboard.financials.totalSales', 'Ventes Totales'),
      t('dashboard.financials.paymentsReceived', 'Paiements Reçus'),
      t('dashboard.financials.totalServices', 'Services Totaux'),
      t('dashboard.financials.totalExpenses', 'Dépenses Totales'),
      t('dashboard.financials.netProfit', 'Recette Nette')
    ]],
    body: [[
      `${data.totalSales.toLocaleString()} DT`,
      `${data.totalPayments.toLocaleString()} DT`,
      `${data.totalServices.toLocaleString()} DT`,
      `${data.totalExpenses.toLocaleString()} DT`,
      `${data.netProfit.toLocaleString()} DT`
    ]],
    theme: 'grid',
    headStyles: { fillColor: [63, 131, 248] }, // Primary color
  });

  // Sales Table
  const sales = data.stockExits.filter(e => e.type === 'sale');
  if (sales.length > 0) {
    doc.text(t('dashboard.report.sales', 'Détail des Ventes'), 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[
        t('common.date', 'Date'),
        t('common.client', 'Client'),
        t('common.amount', 'Montant'),
        t('common.status', 'Statut'),
        t('common.user', 'Magasinier')
      ]],
      body: sales.map(s => [
        format(new Date(s.exitDate), 'dd/MM/yyyy'),
        s.clientName || '-',
        `${(s.totalAmount || 0).toLocaleString()} DT`,
        s.paymentStatus === 'paid' ? t('common.paid', 'Payé') : t('common.unpaid', 'Non payé'),
        s.performedByName || '-'
      ]),
      theme: 'striped',
    });
  }

  // Services Table
  if (data.services.length > 0) {
    doc.text(t('services.title', 'Services'), 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[
        t('common.date', 'Date'),
        t('common.description', 'Description'),
        t('common.amount', 'Montant'),
        t('common.user', 'Magasinier')
      ]],
      body: data.services.map(s => [
        format(new Date(s.date), 'dd/MM/yyyy'),
        s.description,
        `${s.price.toLocaleString()} DT`,
        s.performedByName || '-'
      ]),
      theme: 'striped',
    });
  }

  // Expenses Table
  if (data.expenses.length > 0) {
    doc.text(t('dashboard.report.expenses', 'Détail des Dépenses'), 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[
        t('common.date', 'Date'),
        t('common.description', 'Description'),
        t('common.category', 'Catégorie'),
        t('common.amount', 'Montant'),
        t('common.user', 'Magasinier')
      ]],
      body: data.expenses.map(e => [
        format(new Date(e.date), 'dd/MM/yyyy'),
        e.description,
        e.category || '-',
        `${e.amount.toLocaleString()} DT`,
        e.recordedByName || '-'
      ]),
      theme: 'striped',
    });
  }

  // Payments Table
  if (data.payments.length > 0) {
    doc.text(t('dashboard.report.payments', 'Détail des Paiements'), 14, (doc as any).lastAutoTable.finalY + 15);
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 20,
      head: [[
        t('common.date', 'Date'),
        t('common.client', 'Client'),
        t('common.amount', 'Montant'),
        t('common.method', 'Méthode'),
        t('common.user', 'Magasinier')
      ]],
      body: data.payments.map(p => [
        format(new Date(p.date), 'dd/MM/yyyy'),
        p.clientName,
        `${p.amount.toLocaleString()} DT`,
        p.method === 'cash' ? t('common.cash', 'Espèces') :
        p.method === 'check' ? t('common.check', 'Chèque') :
        t('common.transfer', 'Virement'),
        p.performedByName || '-'
      ]),
      theme: 'striped',
    });
  }

  // Save the PDF
  doc.save(`rapport_boutique_${data.dateRange.start}_au_${data.dateRange.end}.pdf`);
};

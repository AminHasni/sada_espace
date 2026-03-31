import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './components/AuthProvider';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Stock from './pages/Stock';
import Clients from './pages/Clients';
import Suppliers from './pages/Suppliers';
import StockEntries from './pages/StockEntries';
import StockExits from './pages/StockExits';
import Profile from './pages/Profile';
import Users from './pages/Users';
import Expenses from './pages/Expenses';
import Services from './pages/Services';
import Reclamations from './pages/Reclamations';
import LoginPage from './pages/LoginPage';
import { Sparkles } from 'lucide-react';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
      <div className="text-xs font-display font-semibold text-slate-500 uppercase tracking-widest">Chargement de votre espace...</div>
    </div>
  );
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
};

import { ThemeProvider } from './components/ThemeProvider';

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="stock" element={<Stock />} />
              <Route path="clients" element={<Clients />} />
              <Route path="suppliers" element={<Suppliers />} />
              <Route path="stock-entries" element={<StockEntries />} />
              <Route path="stock-exits" element={<StockExits />} />
              <Route path="expenses" element={<Expenses />} />
              <Route path="services" element={<Services />} />
              <Route path="reclamations" element={<Reclamations />} />
              <Route path="profile" element={<Profile />} />
              <Route path="users" element={<Users />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

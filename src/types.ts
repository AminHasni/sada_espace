export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  createdAt: string;
}

export interface StockMovementItem {
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
}

export interface StockMovement {
  id: string;
  reference: string;
  type: 'transfer' | 'adjustment_plus' | 'adjustment_minus';
  sourceWarehouseId?: string;
  sourceWarehouseName?: string;
  destinationWarehouseId?: string;
  destinationWarehouseName?: string;
  reason?: string;
  items: StockMovementItem[];
  date: string;
  performedBy: string;
  performedByName: string;
  notes?: string;
  createdAt: string;
}

export interface StockHistory {
  id: string;
  productId: string;
  productName: string;
  variantId?: string;
  variantName?: string;
  type: 'entry' | 'exit' | 'transfer_out' | 'transfer_in' | 'adjustment_plus' | 'adjustment_minus';
  quantity: number;
  previousStock: number;
  newStock: number;
  warehouseId?: string;
  warehouseName?: string;
  documentId: string;
  documentReference: string;
  reason?: string;
  date: string;
  performedBy: string;
  performedByName: string;
}

export interface ProductVariant {
  id: string;
  name: string; // e.g., "Size: XL", "Color: Red"
  sku?: string;
  stockQuantity: number;
  minStockLevel?: number;
  priceAdjustment?: number;
}

export interface Product {
  id: string;
  name: string;
  reference: string;
  barcode?: string;
  category: string;
  subCategory?: string;
  purchasePrice: number;
  salePrice: number;
  unit: string; // e.g., "kg", "unit", "box"
  stockQuantity: number;
  stockByWarehouse?: Record<string, number>;
  minStockLevel: number;
  description?: string;
  imageUrl?: string;
  variants?: ProductVariant[];
  createdAt: string;
  updatedAt?: string;
}

export interface Client {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  totalCredit: number;
  creditLimit?: number;
  address?: string;
  createdAt: string;
}

export interface Payment {
  id?: string;
  clientId?: string;
  clientName?: string;
  amount: number;
  date: string;
  method: 'cash' | 'check' | 'transfer';
  notes?: string;
  performedBy: string;
  performedByName: string;
  createdAt: string;
}

export interface Supplier {
  id: string;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  category?: string;
  createdAt: string;
}

export interface StockEntryItem {
  productId: string;
  productName: string;
  category?: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  batchNumber?: string;
  expiryDate?: string;
  unitPrice: number;
}

export interface StockEntry {
  id: string;
  entryNumber: string;
  type: 'return_from_client' | 'adjustment_plus';
  supplierId?: string;
  supplierName?: string;
  clientId?: string;
  clientName?: string;
  items: StockEntryItem[];
  receptionDate: string;
  receivedBy: string; // User UID
  receivedByName: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

export interface StockExitItem {
  productId: string;
  productName: string;
  category?: string;
  variantId?: string;
  variantName?: string;
  quantity: number;
  unitPrice: number;
}

export interface StockExit {
  id: string;
  exitNumber: string;
  type: 'sale' | 'internal_consumption' | 'project_delivery' | 'return_to_supplier' | 'adjustment_minus';
  clientId?: string;
  clientName?: string;
  supplierId?: string;
  supplierName?: string;
  projectId?: string;
  projectName?: string;
  serviceName?: string;
  items: StockExitItem[];
  exitDate: string;
  paymentStatus?: 'paid' | 'credit';
  amountPaid?: number;
  totalAmount?: number;
  discount?: number;
  performedBy: string; // User UID
  performedByName: string;
  notes?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  amount: number;
  description: string;
  date: string;
  recordedBy: string; // User UID
  recordedByName: string;
  category?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ServiceRecord {
  id?: string;
  description: string;
  price: number;
  date: string;
  performedBy: string;
  performedByName: string;
  createdAt: string;
}

export type UserRole = 'admin' | 'warehouseman';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phoneNumber?: string;
  role: UserRole;
  isPaused?: boolean;
  createdAt: string;
  lastLogin?: string;
}

export interface ActivityLog {
  id?: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string; // Recipient
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  link?: string;
  createdAt: string;
}

export interface CashSession {
  id?: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt?: string | null;
  initialAmount: number;
  totalAdded?: number;
  finalAmount?: number | null;
  status: 'open' | 'closed';
  notes?: string;
}

export interface CashTransaction {
  id?: string;
  sessionId: string;
  userId: string;
  userName: string;
  amount: number;
  type: 'add_funds' | 'remove_funds';
  reason?: string;
  timestamp: string;
}

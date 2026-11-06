// Shared record shapes for the app's persisted data (`data.*` in state.js).
// These are ambient globals (the scripts share one global scope), so JSDoc can use them directly:
//   /** @param {ClientPO} po */
// Fields marked optional are ones legacy or partially-migrated records may omit.

/** One line on a client or supplier purchase order. */
interface PoLine {
  item: string;
  code: string;
  brand: string;
  qty: number;
  uom: string;
  price: number;
  discount?: number;
  discountReason?: string;
  lot?: string;
  expiry?: string;
  [extra: string]: any;
}

interface PoHistoryEntry {
  date: string;
  status: string;
  note?: string;
  by?: string;
}

/** Client purchase order (data.purchaseOrders). Separate system from supplier POs. */
interface ClientPO {
  id: string;
  client: string;
  area: string;
  salesperson: string;
  date: string;
  lines: PoLine[];
  status: string;
  completedType?: string;
  history?: PoHistoryEntry[];
  [extra: string]: any;
}

/** Supplier / inventory purchase order (data.inventoryPurchaseOrders). */
interface InventoryPO {
  id: string;
  supplier: string;
  branch: string;
  date: string;
  terms: number;
  status: string;
  lines?: PoLine[];
  history?: PoHistoryEntry[];
  createdByUser?: string;
  receivedBy?: string;
  receivingBranch?: string;
  approvedBy?: string;
  cancelledBy?: string;
  [extra: string]: any;
}

/** One Inventory -> Stocks row (data.inventory): an item/branch/lot with a quantity. */
interface StockRow {
  code: string;
  item: string;
  brand: string;
  branch: string;
  lot: string;
  serial?: string;
  expiry: string;
  qty: number;
  min: number;
  note?: string;
  archived?: boolean;
  [extra: string]: any;
}

/** One line on a sales invoice (SI / TS / DR). */
interface SaleLine extends PoLine {
  sourceBranch?: string;
  branch?: string;
}

/** Sales invoice / transmittal slip / delivery receipt (data.sales). */
interface Sale {
  id: string;
  documentNo: string;
  type: string;
  client: string;
  area: string;
  po: string;
  date: string;
  net: number;
  paid: number;
  status: string;
  terms?: number;
  salesperson?: string;
  lines?: SaleLine[];
  noPo?: boolean;
  replacementId?: string;
  [extra: string]: any;
}

/** Login account row (data.users). */
interface AppUser {
  email: string;
  username?: string;
  name: string;
  role: string;
  id?: string;
  disabled?: boolean;
  inviteStatus?: string;
  [extra: string]: any;
}

interface Bank { name: string; account?: string; [extra: string]: any }

/** Payment request / CV (data.paymentRequests). */
interface PaymentRequest {
  id: string;
  cvNo: string;
  client?: string;
  invoice?: string;
  status: string;
  requestStatus: string;
  total: number;
  date?: string;
  history: PoHistoryEntry[];
  [extra: string]: any;
}

interface Employee { name: string; birthday?: string; archived?: boolean; [extra: string]: any }

/** In-app notification (data.notifications). */
interface AppNotification {
  key?: string;
  status: string;
  generated?: boolean;
  type?: string;
  message?: string;
  section?: string;
  record?: string;
  date?: string;
  audience?: string[] | null;
  targetUser?: string | null;
  [extra: string]: any;
}

interface ProductIssue { id: string; status: string; history: PoHistoryEntry[]; [extra: string]: any }

/** Client masterlist entry (data.clients). */
interface Client {
  name: string;
  area: string;
  dealer?: string;
  salesperson?: string;
  terms?: number;
  creditLimit: number;
  tin?: string;
  address?: string;
  withholdingTax?: boolean;
  expandedWithholdingTax?: boolean;
  docs?: any;
  archived?: boolean;
  [extra: string]: any;
}

/** Product/service masterlist entry (data.items). */
interface MasterItem {
  code: string;
  name: string;
  brand: string;
  uom?: string;
  price: number;
  cost?: number;
  category?: string;
  archived?: boolean;
  [extra: string]: any;
}

interface Supplier { name: string; brand?: string; archived?: boolean; [extra: string]: any }

/** Collection receipt (data.payments). */
interface Payment {
  receiptNo: string;
  method: string;
  collectionStatus: string;
  amount?: number;
  [extra: string]: any;
}

interface Payable { id: string; amount: number; paid: number; supplier: string; [extra: string]: any }
interface Replenishment { id: string; requestStatus: string; status: string; [extra: string]: any }
interface CollectionContact { client: string; area: string; status: string; [extra: string]: any }
interface PendingTransfer { id: string; status: string; code?: string; lot?: string; from?: string; to?: string; lines: any[]; [extra: string]: any }
interface ImportBatch { id: string; date: string; module: string; status: string; [extra: string]: any }
interface Warranty { serial?: string; client?: string; warrantyEnd?: string; [extra: string]: any }

/** The slices of app state that have precise types; every other collection stays loosely typed. */
interface AppData {
  purchaseOrders: ClientPO[];
  inventoryPurchaseOrders: InventoryPO[];
  inventory: StockRow[];
  clients: Client[];
  items: MasterItem[];
  suppliers: Supplier[];
  payments: Payment[];
  payables: Payable[];
  replenishments: Replenishment[];
  collectionContacts: CollectionContact[];
  pendingTransfers: PendingTransfer[];
  imports: ImportBatch[];
  warranties: Warranty[];
  sales: Sale[];
  users: AppUser[];
  banks: Bank[];
  paymentRequests: PaymentRequest[];
  employees: Employee[];
  notifications: AppNotification[];
  productIssues: ProductIssue[];
  [collection: string]: any;
}

/** Persisted data as it arrives from storage/the server: every collection is an array, but records may be legacy-shaped. */
interface RawData {
  [key: string]: any;
  clients: any[]; items: any[]; suppliers: any[]; employees: any[]; inventory: any[]; sales: any[];
  pendingTransfers: any[]; payables: any[]; replenishments: any[]; payments: any[]; purchaseOrders: any[];
  inventoryPurchaseOrders: any[]; inventoryDemoRequests: any[]; collectionContacts: any[]; productIssues: any[];
}

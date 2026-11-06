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
  serial?: string;
  vatCode?: string;
  sourceBranch?: string;
  branch?: string;
  receivedQty?: number;
  requestedQty?: number;
  requestedLot?: string;
  requestedExpiry?: string;
  dispatchedQty?: number;
  dispatchedLot?: string;
  dispatchedExpiry?: string;
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
  amount: number;
  discount?: number;
  discountReason?: string;
  terms?: number;
  salesperson?: string;
  agent?: string;
  dealer?: string;
  division?: string;
  lines?: SaleLine[];
  noPo?: boolean;
  migrated?: boolean;
  replacementId?: string;
  deliveryStatus?: string;
  vatCode?: string;
  siNumber?: string;
  taxTreatment?: string;
  withholdingTax?: boolean | number;
  expandedWithholdingTax?: boolean | number;
  cancelledFrom?: string | null;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
  // Older single-line invoices keep the line on the invoice itself.
  item?: string;
  code?: string;
  brand?: string;
  qty?: number;
  uom?: string;
  price?: number;
  lot?: string;
  expiry?: string;
  sourceBranch?: string;
  branch?: string;
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
  paymentConfirmed?: boolean;
  paymentType?: string;
  employee?: string;
  amount?: number;
  gross?: number;
  items?: { amount?: number; netAmount?: number; invoice?: string }[];
  invoices?: string[];
  withholdingTax?: boolean | number;
  expandedWithholdingTax?: boolean | number;
  bank?: string;
  bankAccount?: string;
  chequeDate?: string;
  transferDate?: string;
  preparedBy?: string;
  createdAt?: string;
  createdByUser?: string;
  approvedBy?: string;
  approvedAt?: string;
  completedBy?: string;
  completedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  cancelReason?: string;
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
  division?: string;
  code?: string;
  contact?: string;
  salesperson?: string;
  terms?: number;
  creditLimit: number;
  tin?: string;
  address?: string;
  withholdingTax?: boolean;
  expandedWithholdingTax?: boolean;
  // Masterlist entries keep a list; imported ones keep the text from the spreadsheet.
  docs?: string | string[];
  migrated?: boolean;
  status?: string;
  archived?: boolean;
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
  appliedToInvoice?: boolean;
  client?: string;
  invoice: string;
  paymentRequestCvNo?: string;
  bank?: string;
  bankAccount?: string;
  transferDate?: string;
  reference?: string;
  tag?: string;
  date?: string;
  dateRecorded?: string;
  dateCollected?: string;
  postedDate?: string;
  postedReminderKey?: string;
  chequeDate?: string;
  cheques?: unknown[];
  statusHistory?: unknown[];
  voided?: boolean;
}

interface Payable {
  id: string;
  amount: number;
  paid: number;
  supplier: string;
  date: string;
  status: string;
  requestStatus: string;
  createdByUser?: string;
  approvedBy?: string;
  approvedAt?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  method?: string;
  bank?: string;
  cheque?: string;
  chequeDate?: string;
  grossAmount?: number;
  withholdingTax?: number;
  total?: number;
  item?: string;
  items?: unknown[];
  qty?: number;
  uom?: string;
  paymentConfirmed?: boolean;
}
interface Replenishment {
  id: string;
  requestStatus: string;
  status: string;
  amount: number;
  total?: number;
  paid?: number;
  createdByUser?: string;
  cancelledBy?: string;
  cancelledAt?: string;
  date?: string;
  type?: string;
  label?: string;
  source?: string;
  office?: string;
  employeeName?: string;
  requester?: string;
  file?: unknown;
  items?: unknown[];
  method?: string;
  bank?: string;
  cheque?: string;
  chequeDate?: string;
  approvedAt?: string;
  approvedBy?: string;
  paymentConfirmed?: boolean;
}
interface CollectionContact { client: string; area: string; status: string; [extra: string]: any }
interface PendingTransfer { id: string; status: string; code?: string; lot?: string; from?: string; to?: string; lines: any[]; [extra: string]: any }
interface ImportBatch { id: string; date: string; module: string; status: string; [extra: string]: any }
interface Warranty { serial?: string; client?: string; warrantyEnd?: string; [extra: string]: any }

interface ImportCheckRow { row: number; kind: string; status: string; issues: string; [extra: string]: any }
interface StockReceipt { id: string; status: string; poId?: string; lines: any[]; [extra: string]: any }
interface DemoRequest { id: string; status: string; client?: string; items?: any[]; [extra: string]: any }
interface MemoRecord { id: string; [extra: string]: any }
interface PrintTemplate { type: string; [extra: string]: any }
interface CreditInvoiceRequest { id: string; status: string; [extra: string]: any }

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
  stockReceipts: StockReceipt[];
  inventoryDemoRequests: DemoRequest[];
  memos: MemoRecord[];
  printTemplates: PrintTemplate[];
  pendingCreditInvoices: CreditInvoiceRequest[];
  [collection: string]: any;
}

/** Persisted data as it arrives from storage/the server: every collection is an array, but records may be legacy-shaped. */
interface RawData {
  [key: string]: any;
  clients: any[]; items: any[]; suppliers: any[]; employees: any[]; inventory: any[]; sales: any[];
  pendingTransfers: any[]; payables: any[]; replenishments: any[]; payments: any[]; purchaseOrders: any[];
  inventoryPurchaseOrders: any[]; inventoryDemoRequests: any[]; collectionContacts: any[]; productIssues: any[];
}

/** Cloudflare Worker environment (vars, secrets and bindings). Loosely typed: bindings are only used inside src/. */
interface WorkerEnv {
  ENVIRONMENT?: string;
  [binding: string]: any;
}

// ---- Worker: authorization and money rules (src/worker.js) ----
type AppRole = "Superadmin" | "CEO" | "Admin" | "Accounting" | "Sales" | "Logistics" | "HR" | "Engineering" | "Product Specialist";
type AccessMode = "view" | "edit";

/** The signed-in user as built by profileForUser(). Every permission decision reads from this. */
interface Profile {
  id: string;
  /** Taken from profiles.full_name, which can be empty. */
  name: string | null | undefined;
  email: string;
  role: AppRole;
  branch: string;
  phone: string;
  modules: string[];
  customPermissions: { enabled: boolean; view: string[]; edit: string[] };
  passwordKycDue: boolean;
  themePreference: "dark" | "light";
}

/** A row of the Supabase profiles table, before profileForUser() turns it into a Profile. */
interface ProfileRow {
  id: string; email: string; full_name?: string | null; role: AppRole; base_role?: AppRole | null; branch?: string | null; phone?: string | null;
  is_superadmin?: boolean; password_confirmed_at?: string | null; created_at?: string | null; theme_preference?: string | null;
}

interface ModulePermissionRow { module_key: string; can_view: boolean; can_edit: boolean }

/**
 * One row of app_records. `data` comes from the client on writes, so it is `unknown` field by field:
 * the rules must coerce or check a value before trusting it.
 */
interface AppRecordRow<T = Record<string, unknown>> { module_name: string; record_key: string; data: T; [column: string]: unknown }
type StoredRow<T = Record<string, unknown>> = Pick<AppRecordRow<T>, "record_key" | "data">;

/** A sales line as submitted by a client. Numbers may arrive as anything until Number() checks them. */
interface IncomingSaleLine { item?: string; code?: string; qty?: unknown; price?: unknown; sourceBranch?: string; branch?: string; lot?: string; expiry?: string }
interface IncomingSale extends IncomingSaleLine {
  documentNo?: string; client?: string; type?: string;
  amount?: unknown; net?: unknown; discount?: unknown;
  migrated?: boolean; noPo?: boolean;
  lines?: IncomingSaleLine[];
}
interface ClientRowData { name?: string; creditLimit?: unknown; archived?: boolean }
interface InventoryRowData { code?: string; branch?: string; lot?: string; qty?: unknown }
interface DemoRequestData { status?: string; lines?: { type?: string }[] }
interface PoRowData { id?: string; client?: string; status?: string }
interface ReceivingLineInput { code?: string; qty?: unknown; branch?: string; lot?: string; expiry?: string }

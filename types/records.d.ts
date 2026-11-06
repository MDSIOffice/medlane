// Shared record shapes for the app's persisted data (`data.*` in state.js).
// These are ambient globals (the scripts share one global scope), so JSDoc can use them directly:
//   /** @param {ClientPO} po */
// Fields marked optional are ones legacy or partially-migrated records may omit.

/** One line on a client or supplier purchase order. */
interface PoLine {
  item: string;
  code: string;
  brand?: string;
  qty: number;
  uom?: string;
  price?: number;
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

/** The slices of app state that have precise types; every other collection stays loosely typed. */
interface AppData {
  purchaseOrders: ClientPO[];
  inventoryPurchaseOrders: InventoryPO[];
  inventory: StockRow[];
  [collection: string]: any;
}

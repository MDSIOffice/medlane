// A small but realistic company, so each screen has real rows to draw and not just empty states.
// Row counts from production (6 Nov 2026), so performance runs draw what staff really see.
const PRODUCTION_ROWS = { clients: 410, items: 572, suppliers: 130, inventory: 223, sales: 63, payments: 23, payables: 9, replenishments: 9, purchaseOrders: 82, inventoryPurchaseOrders: 5, paymentRequests: 32, collectionContacts: 61, notifications: 81 };
const UNIQUE_FIELDS = { clients: ["name"], items: ["code", "name"], suppliers: ["name"], inventory: ["lot"], sales: ["id", "documentNo"], payments: ["receiptNo"], payables: ["id"], replenishments: ["id"], purchaseOrders: ["id"], inventoryPurchaseOrders: ["id"], paymentRequests: ["id", "cvNo"], collectionContacts: [], notifications: [] };

// `scale` 0 is the small company the smoke tests use; 1 matches production's row counts.
export function seedData(scale = 0) {
  const base = baseData();
  if (!scale) return base;
  base.notifications = [{ key: "n", status: "Unread", type: "Info", message: "Fake notification", section: "dashboard", date: base.sales[0].date }];
  const grown = { ...base };
  for (const [key, target] of Object.entries(PRODUCTION_ROWS)) {
    const count = Math.round(target * scale);
    grown[key] = Array.from({ length: count }, (_, index) => {
      const copy = { ...base[key][index % base[key].length] };
      if (index >= base[key].length) for (const field of UNIQUE_FIELDS[key]) copy[field] = `${copy[field]} ${index}`;
      return copy;
    });
  }
  return grown;
}

function baseData() {
  const today = new Date();
  const day = (offset) => new Date(today.getTime() + offset * 86400000).toISOString().slice(0, 10);
  const line = { item: "Glucose Reagent", code: "GLU-1", brand: "Medlane", qty: 2, uom: "box", price: 1500, sourceBranch: "Las Pinas", branch: "Las Pinas", lot: "L100", expiry: day(300) };
  return {
    clients: [
      { name: "Naga City Lab", area: "Naga", dealer: "", salesperson: "Fake Sales", terms: 30, creditLimit: 100000, tin: "000-000-000", address: "Naga City", archived: false },
      { name: "Over Limit Clinic", area: "Manila", salesperson: "Fake Sales", terms: 15, creditLimit: 1000, archived: false },
    ],
    items: [{ code: "GLU-1", name: "Glucose Reagent", brand: "Medlane", uom: "box", price: 1500, cost: 900, category: "Reagent", archived: false }],
    suppliers: [{ name: "Reagent Supply Co", brand: "Medlane", archived: false }],
    employees: [{ name: "Fake Sales", birthday: "1990-01-15", archived: false }],
    inventory: [
      { code: "GLU-1", item: "Glucose Reagent", brand: "Medlane", branch: "Las Pinas", lot: "L100", expiry: day(300), qty: 40, min: 5 },
      { code: "GLU-1", item: "Glucose Reagent", brand: "Medlane", branch: "Las Pinas", lot: "L099", expiry: day(20), qty: 3, min: 5 },
    ],
    purchaseOrders: [{ id: "PO-1", client: "Naga City Lab", area: "Naga", salesperson: "Fake Sales", date: day(-10), lines: [line], status: "For Invoicing", history: [] }],
    inventoryPurchaseOrders: [{ id: "IPO-1", supplier: "Reagent Supply Co", branch: "Las Pinas", date: day(-5), terms: 30, status: "For Approval", lines: [line], history: [] }],
    sales: [
      { id: "SI-1", documentNo: "SI-1", type: "SI", client: "Naga City Lab", area: "Naga", po: "PO-1", date: day(-40), terms: 30, salesperson: "Fake Sales", lines: [line], qty: 2, amount: 3000, discount: 0, net: 3000, paid: 1000, status: "Active" },
      { id: "SI-2", documentNo: "SI-2", type: "SI", client: "Over Limit Clinic", area: "Manila", po: "", noPo: true, date: day(-2), terms: 15, salesperson: "Fake Sales", lines: [line], qty: 2, amount: 3000, discount: 0, net: 3000, paid: 0, status: "Active" },
      { id: "DR-1", documentNo: "DR-1", type: "DR", client: "Naga City Lab", area: "Naga", po: "", date: day(-1), lines: [line], qty: 2, amount: 0, discount: 0, net: 0, paid: 0, status: "Active" },
    ],
    payments: [{ receiptNo: "OR-1", invoice: "SI-1", client: "Naga City Lab", method: "Cheque", amount: 1000, date: day(-3), dateRecorded: day(-3), collectionStatus: "For Deposition" }],
    paymentRequests: [{ id: "PR-1", cvNo: "CV-1", client: "Naga City Lab", invoice: "SI-1", date: day(-1), total: 1000, status: "Pending", requestStatus: "Pending", history: [] }],
    payables: [{ id: "PAY-1", supplier: "Reagent Supply Co", amount: 5000, paid: 0, date: day(-4), dueDate: day(10), status: "For Approval", requestStatus: "For Approval", history: [] }],
    replenishments: [{ id: "EXP-1", date: day(-2), requestStatus: "For Approval", status: "For Approval", amount: 500, items: [], history: [] }],
    collectionContacts: [{ client: "Naga City Lab", area: "Naga", status: "Pending" }],
    pendingTransfers: [],
    warranties: [],
    productIssues: [],
    imports: [],
    notifications: [],
  };
}

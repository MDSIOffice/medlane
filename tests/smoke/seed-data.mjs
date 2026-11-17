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

// Support Tracker tickets at every stage, timed relative to now so the response clocks read the same
// on every run: breached, at risk, waiting on the client, on track, resolved, and one older report.
function supportTickets() {
  const now = Date.now();
  const ago = (hours) => new Date(now - hours * 3600e3).toISOString();
  const e1 = { engineer: "Engineer 1", engineerEmail: "engineering@medlane.test" };
  const e2 = { engineer: "Engineer 2", engineerEmail: "engineer2@medlane.test" };
  const t = (id, companyName, equipment, serialNo, concerns, issueType, priority, ticketStatus, openedH, extra = {}) => ({
    id, reportType: "technical", companyName, equipment, serialNo, concerns, issueType, priority, ticketStatus, typeOfSupport: issueType === "Training" ? "Training Support" : "Technical Support",
    status: ticketStatus === "Resolved" ? "Resolved" : "Open", openedAt: ago(openedH), statusSince: ago(openedH), startDate: ago(openedH).slice(0, 10), performedBy: "Fake Sales",
    originRole: "Sales", currentActor: ticketStatus === "New" ? "Sales" : "Engineering", branch: "Las Pinas",
    history: [{ at: ago(openedH), date: ago(openedH).slice(0, 10), status: "New", note: "Ticket opened", by: "Fake Sales" }], ...extra,
  });
  return [
    t("TSR-0146", "Sample Clinic B", "VEDA8900", "1230104910203", "Reader won't read cassette barcodes", "Hardware", "high", "New", 7, { currentActor: "Sales" }),
    t("TSR-0142", "Sample Lab C", "Zybio Z5", "Z5-2411-00873", "WBC errors back after workaround; CBC down", "Hardware", "critical", "On-site visit set", 41, { ...e2, branch: "Naga", firstResponseAt: ago(39.5), visitAt: ago(-15), reopenOf: "TSR-0136" }),
    t("TSR-0145", "Sample Hospital A", "Zybio EXC 200", "838920930409", "ALT QC out of range after reagent lot change", "Reagent / QC", "high", "Assigned", 14, { ...e1, firstResponseAt: ago(13.25) }),
    t("TSR-0144", "Sample Diagnostic D", "Zybio EXU 500", "EXU-2501-00977", "Strip reader jams again", "Hardware", "medium", "Waiting for client", 60, { ...e2, branch: "Naga", firstResponseAt: ago(57), statusSince: ago(40) }),
    t("TSR-0140", "Sample Clinic F", "CYANCoag", "CC-2410-0061", "LIS interface not sending results", "Software / LIS", "low", "Waiting for client", 168, { ...e1, branch: "Naga", firstResponseAt: ago(166), statusSince: ago(150) }),
    t("TSR-0143", "Sample Hospital E", "Zybio Z5", "Z5-2502-01140", "Training for 3 new medtechs", "Training", "low", "On-site visit set", 96, { ...e1, firstResponseAt: ago(91), visitAt: ago(-20) }),
    t("TSR-0147", "Sample Hospital E", "Zybio EXR 110", "EXR-2604-00312", "How to export the monthly QC report", "Training", "low", "New", 2, { currentActor: "Sales" }),
    t("TSR-0141", "Sample Clinic B", "VEDA8900", "1230104910203", "Optical module drift", "Hardware", "high", "Resolved", 500, { ...e1, firstResponseAt: ago(499), closedAt: ago(472), resolvedAt: ago(472).slice(0, 10), outcome: "Fixed on first visit", resolvedBy: "Service Engineer" }),
    t("TSR-0139", "Sample Hospital A", "Zybio EXC 200", "838920930409", "Printer not printing reports", "Software / LIS", "medium", "Resolved", 290, { ...e1, firstResponseAt: ago(289.5), closedAt: ago(287), resolvedAt: ago(287).slice(0, 10), outcome: "Fixed remotely", resolvedBy: "Service Engineer" }),
    t("TSR-0138", "Sample Diagnostic D", "Zybio EXU 500", "EXU-2501-00977", "Strip reader jam", "Hardware", "medium", "Resolved", 340, { ...e2, branch: "Naga", firstResponseAt: ago(337), closedAt: ago(316), resolvedAt: ago(316).slice(0, 10), outcome: "Needed more visits", resolvedBy: "Service Engineer" }),
    t("TSR-0136", "Sample Lab C", "Zybio Z5", "Z5-2411-00873", "Sampling errors (temporary workaround)", "Hardware", "high", "Resolved", 380, { ...e2, branch: "Naga", firstResponseAt: ago(379), closedAt: ago(330), resolvedAt: ago(330).slice(0, 10), outcome: "Fixed on first visit", resolvedBy: "Service Engineer" }),
    { id: "TSR-0101", reportType: "technical", companyName: "Naga City Lab", equipment: "Centrifuge 12-Slot", serialNo: "CN12-NGA-004", concerns: "Lid sensor error", typeOfSupport: "Technical Support", status: "Resolved", startDate: "2026-06-01", resolvedAt: "2026-06-03", performedBy: "Fake Sales", originRole: "Sales", currentActor: "Engineering", history: [] },
  ];
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
    warranties: [
      { client: "Sample Lab C", model: "Zybio Z5", equipment: "Zybio Z5", unitType: "Hematology", serial: "Z5-2411-00873", branch: "Naga", installDate: day(-700), warrantyEnd: day(42), lastPm: day(-75), contractStatus: "none", status: "Expiring Soon", service: "" },
      { client: "Sample Diagnostic D", model: "Zybio EXU 500", equipment: "Zybio EXU 500", unitType: "Urinalysis", serial: "EXU-2501-00977", branch: "Naga", installDate: day(-1100), warrantyEnd: day(-300), lastPm: day(-130), contractStatus: "none", status: "Expired", service: "" },
      { client: "Sample Clinic B", model: "VEDA8900", equipment: "VEDA8900", unitType: "Immunoassay", serial: "1230104910203", installDate: day(-200), warrantyEnd: day(450), lastPm: day(-85), status: "Active", service: "" },
      { client: "Sample Hospital A", model: "Zybio EXC 200", equipment: "Zybio EXC 200", unitType: "Chemistry", serial: "838920930409", installDate: day(-120), warrantyEnd: day(600), lastPm: day(-30), pmScheduledFor: day(9), pmEngineer: "Engineer 1", status: "Active", service: "" },
      { client: "Sample Hospital E", model: "Zybio Z5", equipment: "Zybio Z5", unitType: "Hematology", serial: "Z5-2502-01140", installDate: day(-270), warrantyEnd: day(95), lastPm: day(-50), status: "Active", service: "" },
      { client: "Sample Hospital E", model: "Zybio EXR 110", equipment: "Zybio EXR 110", unitType: "Chemistry", serial: "EXR-2604-00312", installDate: day(-40), warrantyEnd: day(690), status: "Active", service: "" },
      { client: "Sample Clinic F", model: "CYANCoag", equipment: "CYANCoag", unitType: "Coagulation", serial: "CC-2410-0061", branch: "Naga", installDate: day(-760), warrantyEnd: day(-30), lastPm: day(-60), contractStatus: "active", contractEnd: day(335), status: "Service Contract", service: "" },
      { client: "Naga City Lab", model: "Zybio Z5", equipment: "Zybio Z5", unitType: "Hematology", serial: "Z5-2306-00418", installDate: day(-890), warrantyEnd: day(-160), lastPm: day(-200), contractStatus: "quoted", contractEnd: day(205), status: "Expired", service: "" },
      { client: "Over Limit Clinic", model: "VEDA8900", equipment: "VEDA8900", unitType: "Immunoassay", serial: "VD-2308-00211", installDate: day(-830), warrantyEnd: day(-100), lastPm: day(-80), status: "Expired", service: "" },
    ],
    warrantyClaims: [
      { id: "WC-2026-004", serial: "Z5-2411-00873", client: "Sample Lab C", model: "Zybio Z5", ticketId: "TSR-0136", issue: "Sampling errors", part: "Sample probe assembly", partCost: 18500, rma: "ZY-RMA-88123", status: "Old part returned", openedAt: day(-15) + "T02:00:00.000Z", history: [] },
      { id: "WC-2026-005", serial: "1230104910203", client: "Sample Clinic B", model: "VEDA8900", ticketId: "TSR-0141", issue: "Optical module drift", part: "Optical module", partCost: 42000, rma: "", status: "Open", openedAt: day(-20) + "T02:00:00.000Z", history: [] },
      { id: "WC-2026-002", serial: "838920930409", client: "Sample Hospital A", model: "Zybio EXC 200", issue: "Lamp failure", part: "Halogen lamp", partCost: 6200, rma: "ZY-RMA-87011", status: "Credited", openedAt: day(-60) + "T02:00:00.000Z", creditedAt: day(-25) + "T02:00:00.000Z", history: [] },
    ],
    warrantySettings: [{ id: "warranty-settings", pmMonths: { VEDA8900: 6 }, defaultPmMonths: 3 }],
    calendarEvents: [
      { id: "EVT-standup", title: "Weekly ops meeting", date: day(1), time: "08:30", type: "internal", note: "Conference room", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdByRole: "Superadmin", createdAt: day(-2) },
      { id: "EVT-visit", title: "Visit: Sample Lab C · Zybio Z5 (TSR-0142)", date: day(2), time: "09:00", type: "service", source: "support-visit", sourceId: "TSR-0142", module: "product-issues", branch: "Naga", assigneeEmail: "engineer2@medlane.test", assigneeName: "Engineer 2", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
      { id: "EVT-pm", title: "PM: Sample Diagnostic D · Zybio EXU 500 (EXU-2501-00977)", date: day(2), time: "10:00", type: "service", source: "warranty-pm", sourceId: "EXU-2501-00977", module: "warranty", branch: "Naga", assigneeEmail: "engineer2@medlane.test", assigneeName: "Engineer 2", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
      { id: "EVT-delivery", title: "Deliver reagents to Naga City Lab", date: day(3), time: "13:00", type: "deliveries", branch: "Naga", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
      { id: "EVT-pdc", title: "PDC from Naga City Lab", date: day(5), time: "", allDay: true, type: "moneyin", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
      { id: "EVT-rent", title: "Office rent due", date: day(6), time: "", allDay: true, type: "moneyout", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
      { id: "EVT-arrival", title: "Zybio container arrives", date: day(9), time: "10:00", type: "arrivals", createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
      { id: "EVT-gone", title: "Cancelled dinner", date: day(4), time: "19:00", removed: true, createdBy: "Fake Superadmin", createdByUser: "superadmin@medlane.test", createdAt: day(-1) },
    ],
    productIssues: supportTickets(),
    imports: [],
    notifications: [],
  };
}

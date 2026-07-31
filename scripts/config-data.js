const peso = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 });
const today = new Date("2026-07-15T09:00:00");
const uomOptions = ["box", "kit", "piece", "vial", "gallon", "bottle", "set", "unit"];
const supplierClassificationOptions = ["ACCOMMODATION", "BIDDING", "FREIGHT FEE", "FUEL", "GOVERNMENT BENEFITS", "IMPORTATION", "INSURANCE", "LEGAL AND PROFESSIONAL FEES", "LICENSES AND PERMIT", "LOCAL PURCHASES", "OFFICE EXPENSE", "OFFICE SUPPLIES", "OTHERS - INSURANCE", "PARKING FEE", "PER DIEM", "PETTY CASH", "REPAIR AND MAINTENANCE", "REPRESENTATION", "SPONSORSHIP", "TOLL FEE", "TRANSPORTATION", "UTILITIES", "WAREHOUSE EXPENSE"];
const productClassificationOptions = ["Accessories", "Consumables", "Equipment", "Reagents and Diagnostic kit", "Spare parts", "Supplies", "Tools"];
const requiredSecurityApprovals = ["Discount approval", "Credit-limit override", "Cancelled invoice replacement", "Cheque collection review", "Stock transfer receiving"];
const requiredClientDocs = ["Mayor's Permit", "2303", "SEC or DTI", "FDALTO", "GAIA"];
const employeeBenefitOptions = ["SSS", "PhilHealth", "Pag-IBIG"];
const supportTypeOptions = ["Application Troubleshooting", "Training Support", "Technical Support"];
const supportTopicOptions = ["Theories and Principles", "Unit Operation", "Parameter Prog.", "Unit Maintenance", "Basic Troubleshooting", "PM and Calibration"];
const tableBatchSize = 15;
const tableState = new Map();

const initialData = {
  dataVersion: 23,
  branch: "all",
  platformAreas: ["Region I", "Region II", "Region III", "Region IV-A", "Region V", "Visayas Dealer", "Mindanao Dealer"],
  platformBranches: ["Las Pinas", "Naga"],
  branchAddresses: { "Las Pinas": "13 Gumamela St. Pilar Village, Las Pinas City", Naga: "Naga City" },
  invoiceApprovals: { SI: "ECTOSOC", TS: "ECTOSOC", DR: "ECTOSOC" },
  masterTab: "clients",
  clients: [
    { name: "IlocosCare Laboratory", area: "Region I", dealer: "Direct", address: "San Fernando, La Union", contact: "Liza Mercado / 0917-111-2233", tin: "009-441-778-000", creditLimit: 180000, withholdingTax: true, expandedWithholdingTax: true, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA" },
    { name: "Cagayan Valley Diagnostics", area: "Region II", dealer: "Direct", address: "Tuguegarao City", contact: "Dr. Carlo Go / 0918-222-3344", tin: "112-445-779-000", creditLimit: 120000, withholdingTax: false, expandedWithholdingTax: true, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Central Luzon MedLab", area: "Region III", dealer: "Direct", address: "San Fernando, Pampanga", contact: "Nina Reyes / accounting@centralmed.ph", tin: "004-778-221-000", creditLimit: 210000, docs: "Mayor's Permit, 2303, SEC or DTI, GAIA" },
    { name: "CALABARZON Hospital Lab", area: "Region IV-A", dealer: "Direct", address: "Calamba, Laguna", contact: "Mika Villanueva / 0919-888-1200", tin: "221-772-640-000", creditLimit: 160000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA" },
    { name: "Bicol Diagnostics", area: "Region V", dealer: "Direct", address: "Magsaysay Avenue, Naga City", contact: "Leo Ramos / 0918-777-1212", tin: "112-555-779-000", creditLimit: 130000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Visayas Dealer Hub", area: "Visayas Dealer", dealer: "Visayas Dealer", address: "Cebu City", contact: "Dealer desk / visayas@dealer.ph", tin: "331-221-640-000", creditLimit: 250000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA" },
    { name: "Mindanao Dealer Hub", area: "Mindanao Dealer", dealer: "Mindanao Dealer", address: "Davao City", contact: "Dealer desk / mindanao@dealer.ph", tin: "441-221-640-000", creditLimit: 250000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO, GAIA" },
    { name: "North Luzon Diagnostics", area: "Region I", dealer: "Direct", address: "Laoag City", contact: "Billing / northluzon@example.ph", tin: "551-221-640-000", creditLimit: 110000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Tuguegarao Med Center", area: "Region II", dealer: "Direct", address: "Tuguegarao City", contact: "Accounting / tugmed@example.ph", tin: "552-221-640-000", creditLimit: 135000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Pampanga Clinical Lab", area: "Region III", dealer: "Direct", address: "Angeles City", contact: "Collections / pampanga@example.ph", tin: "553-221-640-000", creditLimit: 145000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Batangas Diagnostic Care", area: "Region IV-A", dealer: "Direct", address: "Batangas City", contact: "Finance / batangas@example.ph", tin: "554-221-640-000", creditLimit: 155000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Cebu Partner Lab", area: "Visayas Dealer", dealer: "Visayas Dealer", address: "Mandaue City", contact: "Dealer accounting / cebu@example.ph", tin: "555-221-640-000", creditLimit: 185000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
    { name: "Davao Diagnostics Plus", area: "Mindanao Dealer", dealer: "Mindanao Dealer", address: "Davao City", contact: "Dealer accounting / davao@example.ph", tin: "556-221-640-000", creditLimit: 195000, docs: "Mayor's Permit, 2303, SEC or DTI, FDALTO" },
  ],
  items: [
    { code: "REAG-001", name: "Hematology Reagent", brand: "Sysmex", source: "Supplier", supplier: "MedSource PH", category: "Reagent", uom: "kit", terms: 30, cost: 2800, price: 4200, lot: "HT-26-071", expiry: "2026-09-18" },
    { code: "REAG-014", name: "Clinical Chemistry Control", brand: "Mindray", source: "Supplier", supplier: "BioLab Imports", category: "Reagent", uom: "vial", terms: 45, cost: 3100, price: 5100, lot: "CC-88-2026", expiry: "2026-08-05" },
    { code: "SUP-042", name: "Vacutainer Tubes", brand: "BD", source: "Supplier", supplier: "MedSource PH", category: "Supply", uom: "box", terms: 15, cost: 18, price: 35, lot: "VT-442", expiry: "2027-01-15" },
    { code: "EQP-018", name: "Centrifuge 12-Slot", brand: "Eppendorf", source: "Client", supplier: "Client Pullout", category: "Equipment", uom: "unit", terms: 30, cost: 28000, price: 42000, lot: "CN-1200", expiry: "2028-03-31" },
  ],
  suppliers: [
    { name: "MedSource PH", address: "Makati City", contact: "procurement@medsource.ph / 028-555-1000", docs: "DTI, BIR, Product Certs", items: "Reagents, vacutainers, consumables" },
    { name: "BioLab Imports", address: "Pasay City", contact: "sales@biolabimports.ph", docs: "SEC, BIR, FDA docs", items: "Chemistry controls, calibrators" },
  ],
  employees: [
    { name: "Admin User", role: "Admin", contact: "admin@medlane.local", benefits: "SSS, PhilHealth, Pag-IBIG", salary: "Confidential" },
    { name: "Joy Santos", role: "Accounting", contact: "joy@medlane.local", benefits: "SSS, PhilHealth, Pag-IBIG", salary: "CEO Only" },
    { name: "Ramon Dela Cruz", role: "Logistics", contact: "ramon@medlane.local", benefits: "SSS, PhilHealth", salary: "CEO Only" },
  ],
  inventory: [
    { code: "REAG-001", item: "Hematology Reagent", brand: "Sysmex", branch: "Las Pinas", lot: "HT-26-071", serial: "N/A", expiry: "2026-09-18", qty: 18, min: 25 },
    { code: "REAG-001", item: "Hematology Reagent", brand: "Sysmex", branch: "Naga", lot: "HT-26-072", serial: "N/A", expiry: "2026-12-12", qty: 32, min: 20 },
    { code: "REAG-014", item: "Clinical Chemistry Control", brand: "Mindray", branch: "Las Pinas", lot: "CC-88-2026", serial: "N/A", expiry: "2026-08-05", qty: 11, min: 15 },
    { code: "REAG-014", item: "Clinical Chemistry Control", brand: "Mindray", branch: "Naga", lot: "CC-88-2025", serial: "N/A", expiry: "2026-06-30", qty: 6, min: 10 },
    { code: "SUP-042", item: "Vacutainer Tubes", brand: "BD", branch: "Naga", lot: "VT-442", serial: "N/A", expiry: "2027-01-15", qty: 240, min: 100 },
    { code: "EQP-018", item: "Centrifuge 12-Slot", brand: "Eppendorf", branch: "Naga", lot: "CN-1200", serial: "CN12-NGA-004", expiry: "N/A", qty: 4, min: 2 },
  ],
  sales: [
    { id: "SI-2026-001", documentNo: "SI-2026-001", po: "PO-REG1-001", client: "IlocosCare Laboratory", area: "Region I", dealer: "Direct", salesperson: "Ana Cruz", type: "SI", date: "2026-05-18", item: "Hematology Reagent", brand: "Sysmex", qty: 22, uom: "kit", amount: 89100, discount: 1200, discountReason: "Bundle discount", tax: 10548, net: 98448, terms: 30, paid: 50000, status: "Active", lines: [{ item: "Hematology Reagent", code: "REAG-001", brand: "Sysmex", qty: 20, uom: "kit", price: 4200, terms: 30 }, { item: "Clinical Chemistry Control", code: "REAG-014", brand: "Mindray", qty: 1, uom: "vial", price: 5100, terms: 45 }] },
    { id: "TS-2026-009", documentNo: "TS-2026-009", po: "PO-REG2-009", client: "Cagayan Valley Diagnostics", area: "Region II", dealer: "Direct", salesperson: "Leo Ramos", type: "TS", date: "2026-06-03", item: "Vacutainer Tubes", brand: "BD", qty: 1000, uom: "box", amount: 35000, discount: 0, discountReason: "", tax: 0, net: 35000, terms: 15, paid: 35000, status: "Active" },
    { id: "SI-2026-014", documentNo: "SI-2026-014", po: "PO-REG3-014", client: "Central Luzon MedLab", area: "Region III", dealer: "Direct", salesperson: "Ana Cruz", type: "SI", date: "2026-06-20", item: "Clinical Chemistry Control", brand: "Mindray", qty: 18, uom: "vial", amount: 91800, discount: 0, discountReason: "", tax: 11016, net: 102816, terms: 45, paid: 0, status: "Active" },
    { id: "TS-2026-016", documentNo: "TS-2026-016", po: "PO-REG4A-016", client: "CALABARZON Hospital Lab", area: "Region IV-A", dealer: "Direct", salesperson: "Ana Cruz", type: "TS", date: "2026-06-28", item: "Vacutainer Tubes", brand: "BD", qty: 1500, uom: "box", amount: 52500, discount: 0, discountReason: "", tax: 0, net: 52500, terms: 30, paid: 20000, status: "Active" },
    { id: "SI-2026-017", documentNo: "SI-2026-017", po: "PO-REG5-017", client: "Bicol Diagnostics", area: "Region V", dealer: "Direct", salesperson: "Mika Tan", type: "SI", date: "2026-07-01", item: "Centrifuge 12-Slot", brand: "Eppendorf", qty: 2, uom: "unit", amount: 84000, discount: 0, discountReason: "", tax: 10080, net: 94080, terms: 15, paid: 0, status: "Active" },
    { id: "SI-2026-021", documentNo: "SI-2026-021", po: "PO-VIS-021", client: "Visayas Dealer Hub", area: "Visayas Dealer", dealer: "Visayas Dealer", salesperson: "Dealer Desk", type: "SI", date: "2026-07-08", item: "Hematology Reagent", brand: "Sysmex", qty: 12, uom: "kit", amount: 50400, discount: 0, discountReason: "", tax: 6048, net: 56448, terms: 30, paid: 20000, status: "Active" },
    { id: "SI-2026-024", documentNo: "SI-2026-024", po: "PO-MIN-024", client: "Mindanao Dealer Hub", area: "Mindanao Dealer", dealer: "Mindanao Dealer", salesperson: "Dealer Desk", type: "SI", date: "2026-07-10", item: "Clinical Chemistry Control", brand: "Mindray", qty: 10, uom: "vial", amount: 51000, discount: 0, discountReason: "", tax: 6120, net: 57120, terms: 30, paid: 0, status: "Active" },
    { id: "SI-2026-030", documentNo: "SI-2026-030", po: "PO-REG1-030", client: "IlocosCare Laboratory", area: "Region I", dealer: "Direct", salesperson: "Ana Cruz", type: "SI", date: "2026-07-11", item: "Hematology Reagent", brand: "Sysmex", qty: 16, uom: "kit", amount: 72200, discount: 2200, discountReason: "Repeat order discount", tax: 8400, net: 78400, terms: 45, paid: 20000, status: "Active", lines: [{ item: "Hematology Reagent", code: "REAG-001", brand: "Sysmex", qty: 10, uom: "kit", price: 4200, terms: 30 }, { item: "Clinical Chemistry Control", code: "REAG-014", brand: "Mindray", qty: 2, uom: "vial", price: 5100, terms: 45 }, { item: "Vacutainer Tubes", code: "SUP-042", brand: "BD", qty: 600, uom: "box", price: 35, terms: 15 }] },
    { id: "DR-2026-004", documentNo: "DR-2026-004", po: "PO-REG1-DR4", client: "IlocosCare Laboratory", area: "Region I", dealer: "Direct", salesperson: "Ana Cruz", type: "DR", date: "2026-07-13", item: "Vacutainer Tubes", brand: "BD", qty: 300, uom: "box", amount: 0, discount: 0, discountReason: "", tax: 0, net: 0, terms: 15, paid: 0, status: "Active", lines: [{ item: "Vacutainer Tubes", code: "SUP-042", brand: "BD", qty: 300, uom: "box", price: 0, terms: 15 }] },
  ],
  purchaseOrders: [
    { id: "PO-REG1-040", client: "IlocosCare Laboratory", area: "Region I", salesperson: "Ana Cruz", date: "2026-07-14", lines: [{ item: "Hematology Reagent", code: "REAG-001", brand: "Sysmex", qty: 10, uom: "kit", price: 4200 }, { item: "Vacutainer Tubes", code: "SUP-042", brand: "BD", qty: 400, uom: "box", price: 35 }], status: "For Invoicing" },
    { id: "PO-REG4A-041", client: "CALABARZON Hospital Lab", area: "Region IV-A", salesperson: "Ana Cruz", date: "2026-07-15", lines: [{ item: "Clinical Chemistry Control", code: "REAG-014", brand: "Mindray", qty: 8, uom: "vial", price: 5100 }, { item: "Vacutainer Tubes", code: "SUP-042", brand: "BD", qty: 500, uom: "box", price: 35 }], status: "Pending Orders" },
  ],
  inventoryPurchaseOrders: [],
  payments: [
    { invoice: "SI-2026-001", tag: "SI-CR", receiptNo: "CR-0001", method: "Bank Transfer", bank: "BPI", reference: "BPI-7781", chequeDate: "", dateCollected: "2026-07-09", dateRecorded: "2026-07-09", client: "IlocosCare Laboratory", amount: 50000 },
    { invoice: "TS-2026-009", tag: "TS-PR", receiptNo: "PR-0001", method: "Cheque", bank: "BDO", reference: "CHK-9921", chequeDate: "2026-07-12", dateCollected: "2026-07-12", dateRecorded: "2026-07-13", client: "Bicol Diagnostics", amount: 35000 },
    { invoice: "SI-2026-030", tag: "SI-CR", receiptNo: "CR-0030", method: "Bank Transfer", bank: "BPI", reference: "BPI-8810", chequeDate: "", dateCollected: "2026-07-14", dateRecorded: "2026-07-14", client: "IlocosCare Laboratory", amount: 20000 },
  ],
  payables: [
    { supplier: "MedSource PH", contact: "procurement@medsource.ph", item: "Hematology Reagent restock", uom: "kit", qty: 40, amount: 112000, method: "Cheque", bank: "BDO", status: "Delivered Cheque", cheque: "CHK-1044", chequeDate: "2026-07-20", paid: 0 },
    { supplier: "BioLab Imports", contact: "sales@biolabimports.ph", item: "Chemistry Controls", uom: "vial", qty: 20, amount: 62000, method: "Bank Transfer", bank: "BPI", status: "Partially Paid", cheque: "", chequeDate: "", paid: 30000 },
  ],
  replenishments: [
    { id: "REP-001", type: "Petty Cash", requester: "Ramon Dela Cruz", office: "Naga", amount: 8500, file: "naga-july-expenses.xlsx", status: "For HR Approval" },
    { id: "REP-002", type: "Per Diem", requester: "Ana Cruz", office: "Las Pinas", amount: 4200, file: "field-work-form.xlsx", status: "Approved by HR" },
  ],
  users: [
    { name: "Superadmin", email: "superadmin@medlane.local", role: "Superadmin", branch: "Both", access: "Everything, users/passwords, salaries, masterlist approvals, notifications", superadminPermissions: true },
    { name: "Admin User", email: "admin@medlane.local", role: "Admin", branch: "Both", access: "Full operational modules, inventory approvals, stock transfers, reports" },
    { name: "Joy Santos", email: "accounting@medlane.local", role: "Accounting", branch: "Both", access: "PO, invoicing, collections, receivables, payables, expenses" },
    { name: "Ana Cruz", email: "sales@medlane.local", role: "Sales", branch: "Las Pinas", access: "Personal sales, client credit status, inventory view" },
    { name: "Ramon Dela Cruz", email: "logistics@medlane.local", role: "Logistics", branch: "Both", access: "Inventory operations; receive/transfer needs Admin approval" },
  ],
  logs: [
    { date: "Jul 15, 2026 08:32", user: "Admin User", action: "Reviewed compliance dashboard", module: "Dashboard", record: "Medlane OS" },
  ],
  warranties: [
    { client: "Naga City Lab", equipment: "Centrifuge 12-Slot", serial: "CN12-NGA-004", installDate: "2026-06-28", warrantyEnd: "2027-06-28", status: "Active", service: "Quarterly calibration due Sep 2026" },
    { client: "SouthMed Hospital", equipment: "Chemistry Analyzer", serial: "CA-LP-1188", installDate: "2025-11-10", warrantyEnd: "2026-11-10", status: "Active", service: "Preventive maintenance completed" },
  ],
  productIssues: [
    { id: "TSR-2026-001", startDate: "2026-07-10", companyName: "Naga City Lab", address: "Magsaysay Avenue, Naga City", contactPerson: "Dr. Elena Reyes", typeOfSupport: "Technical Support, Application Troubleshooting", topicsDiscussed: "Basic Troubleshooting, Unit Operation", equipment: "Centrifuge 12-Slot", serialNo: "CN12-NGA-004", concerns: "Unit showing intermittent error code E-04 during spin cycle.", actionsTaken: "Replaced worn rotor bearing and recalibrated speed sensor. Ran 3 test cycles with no error codes.", status: "Resolved", resolvedBy: "Service Engineer", performedBy: "Ramon Dela Cruz", conforme: "Dr. Elena Reyes", resolvedAt: "2026-07-11", qcLevel1Lot: "L1-2607", qcLevel2Lot: "L2-2607", qcLevel3Lot: "L3-2607", qcParameters: [
      { parameter: "Speed Accuracy", factor: "1.00", l1Range: "3200-3400", l1Result: "3310", l1P: true, l1F: false, l2Range: "4200-4400", l2Result: "4320", l2P: true, l2F: false, l3Range: "5200-5400", l3Result: "5290", l3P: true, l3F: false },
    ], history: [
      { date: "2026-07-10", status: "Open", note: "Report started - unit showing error code E-04 intermittently.", by: "Ramon Dela Cruz" },
      { date: "2026-07-11", status: "Resolved", note: "Bearing replaced and recalibrated. Client confirmed unit running normally.", by: "Ramon Dela Cruz" },
    ] },
  ],
  imports: [
    { date: "Jul 15, 2026", module: "Clients", file: "manual sample", records: 4, status: "Ready" },
  ],
  pendingTransfers: [
    { id: "TR-001", code: "REAG-001", item: "Hematology Reagent", from: "Las Pinas", to: "Naga", qty: 5, lot: "HT-26-071-TR", status: "In Transit", requestedBy: "Ramon Dela Cruz" },
  ],
  paymentRequests: [],
  transferHistory: [
    { date: "Jul 15, 2026 09:10", transferId: "TR-001", action: "Created", item: "Hematology Reagent", from: "Las Pinas", to: "Naga", qty: 5, lot: "HT-26-071", user: "Ramon Dela Cruz", notes: "Source stock deducted and transfer opened." },
    { date: "Jul 15, 2026 09:12", transferId: "TR-001", action: "Marked In Transit", item: "Hematology Reagent", from: "Las Pinas", to: "Naga", qty: 5, lot: "HT-26-071", user: "Ramon Dela Cruz", notes: "Items dispatched from source branch." },
  ],
  notifications: [
    { date: "Jul 15, 2026 09:10", type: "Transfer", message: "TR-001 is waiting for Naga receiving confirmation.", section: "inventory", status: "Unread" },
    { date: "Jul 15, 2026 09:25", type: "Credit", message: "Central Luzon MedLab is nearing its credit limit.", section: "masterlists", status: "Unread" },
  ],
  reconHistory: [
    { date: "Jul 12, 2026 09:18", range: "2026-07-01 to 2026-07-12", period: "month", findings: 5, high: 2, medium: 2, low: 1, passRate: 84 },
    { date: "Jul 14, 2026 10:05", range: "2026-07-01 to 2026-07-14", period: "month", findings: 4, high: 1, medium: 2, low: 1, passRate: 88 },
  ],
  collectionContacts: [
    { area: "Region I", status: "Answered", lastContact: "2026-07-14", employee: "Joy Santos", notes: "Confirmed payment schedule with IlocosCare." },
    { area: "Region II", status: "Called", lastContact: "2026-07-13", employee: "Joy Santos", notes: "Cheque clearing follow-up." },
    { area: "Region III", status: "No Response", lastContact: "2026-07-12", employee: "Ana Cruz", notes: "Try accounting line again." },
    { area: "Region IV-A", status: "Pending", lastContact: "", employee: "", notes: "Not yet contacted this week." },
    { area: "Region V", status: "Answered", lastContact: "2026-07-15", employee: "Ana Cruz", notes: "Bicol branch requested updated SOA." },
    { area: "Visayas Dealer", status: "Called", lastContact: "2026-07-11", employee: "Dealer Desk", notes: "Dealer payment reminder sent." },
    { area: "Mindanao Dealer", status: "Pending", lastContact: "", employee: "", notes: "Contact dealer desk this week." },
  ],
  collectionContactHistory: [
    { date: "Jul 15, 2026 09:40", area: "Region V", status: "Answered", employee: "Ana Cruz", notes: "Requested updated SOA." },
    { date: "Jul 14, 2026 10:15", area: "Region I", status: "Answered", employee: "Joy Santos", notes: "Payment schedule confirmed." },
  ],
  banks: [
    { name: "BDO", account: "Main Collection", notes: "Cheque and deposit clearing" },
    { name: "BPI", account: "Operating Account", notes: "Bank transfer collections" },
    { name: "Metrobank", account: "Collections", notes: "Backup collection account" },
    { name: "UnionBank", account: "Online Payments", notes: "Digital transfer account" },
  ],
};

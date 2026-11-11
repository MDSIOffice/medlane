// @ts-check
data = loadData();
syncGeneratedNotifications();

window.addEventListener("online", () => flushPendingSaveQueue());
window.addEventListener("focus", () => flushPendingSaveQueue());
document.addEventListener("visibilitychange", () => { if (!document.hidden) flushPendingSaveQueue(); });
// Without this, a save that failed from a timeout (e.g. a slow/overloaded machine) only ever
// retries on the next focus/online/visibilitychange event — a tab left sitting idle, still
// focused, on a struggling PC could otherwise sit on a failed save indefinitely. flushPendingSaveQueue()
// already no-ops instantly when there's nothing queued, so this is cheap to just let run.
const PENDING_SAVE_RETRY_INTERVAL_MS = 45 * 1000;
setInterval(() => flushPendingSaveQueue(), PENDING_SAVE_RETRY_INTERVAL_MS);
window.addEventListener("beforeunload", (event) => {
  if (!hasPendingSaveQueue() && !isSaveInFlight()) return;
  event.preventDefault();
  event.returnValue = "";
});
qs("#save-guard-dialog")?.addEventListener("cancel", (event) => event.preventDefault());

/** @param {AppUser[]} [users] */
function mergeUsersFromBackend(users = []) {
  const byEmail = new Map(data.users.map((user) => [String(user.email || "").trim().toLowerCase(), user]));
  users.forEach((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return;
    const previous = byEmail.get(email) || /** @type {Record<string, any>} */ ({});
    const incomingName = String(user.name || user.full_name || "").trim();
    const previousName = String(previous.name || previous.full_name || "").trim();
    const name = incomingName && incomingName.toLowerCase() !== email ? incomingName : previousName && previousName.toLowerCase() !== email ? previousName : incomingName || previousName || email;
    byEmail.set(email, { ...previous, ...user, name, email, branch: "all" });
  });
  data.users = [...byEmail.values()].sort((a, b) => String(a.email || a.name).localeCompare(String(b.email || b.name)));
}

async function syncBackendUsers() {
  if (!currentUser || !MedlaneAPI?.session()?.access_token || !["Superadmin", "CEO"].includes(currentUser.role)) return;
  const payload = await MedlaneAPI.listUsers().catch(() => null);
  if (!payload?.users) return;
  const backendEmails = new Set(/** @type {AppUser[]} */ (payload.users).map((user) => String(user.email || "").trim().toLowerCase()));
  const staleCount = data.users.filter((user) => !backendEmails.has(String(user.email || "").trim().toLowerCase())).length;
  data.users = data.users.filter((user) => backendEmails.has(String(user.email || "").trim().toLowerCase()));
  mergeUsersFromBackend(payload.users);
  if (staleCount) saveData();
}

/** @param {Record<string, any>} values @param {any} view @param {any} edit */
function confirmInviteUser(values, view, edit) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "modal invite-confirm-modal";
    dialog.innerHTML = `<form method="dialog"><div class="modal-header"><div><p class="eyebrow">Confirm Invite</p><h2>Preview User Access</h2></div><button class="icon-button" value="cancel" aria-label="Close">x</button></div><div class="report-preview-grid"><div class="report-preview-card"><small>Name</small><strong>${escapeHtml(values.name)}</strong></div><div class="report-preview-card"><small>Email</small><strong>${escapeHtml(values.email)}</strong></div><div class="report-preview-card"><small>Role</small><strong>${escapeHtml(values.role)}</strong></div><div class="report-preview-card"><small>Branch</small><strong>All branches</strong></div></div><p class="page-description">This will send a Supabase invitation email and create/update the user profile.</p><div class="invoice-tax-summary"><div class="invoice-meta"><span>View Access</span><strong>${view.length} modules</strong></div><div class="invoice-meta"><span>Edit Access</span><strong>${edit.length} modules</strong></div></div><div class="modal-actions"><button class="ghost-button" value="cancel">Go Back</button><button class="primary-button" value="confirm">Confirm & Send Invite</button></div></form>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("close", () => { const ok = dialog.returnValue === "confirm"; dialog.remove(); resolve(ok); });
    dialog.showModal();
  });
}

let inviteInFlight = false;
/** @param {Record<string, any>} values @param {any} view @param {any} edit */
async function handleUserInvite(values, view, edit) {
  if (inviteInFlight) return toast("An invite for this user is already in progress.");
  inviteInFlight = true;
  try {
    const confirmed = await confirmInviteUser(values, view, edit);
    if (!confirmed) return;
    toast("Sending invitation email...");
    const result = await MedlaneAPI.inviteUser({ ...values, modules: view, editModules: edit });
    mergeUsersFromBackend([result.user]);
    await syncBackendUsers();
    log("Invited user", "Users", `${result.user.email} · ${result.user.role}`);
    const deliveryNote = result.emailDelivery?.sent ? "Email sent via Resend" : result.emailDelivery?.reason || "Email not sent";
    notify("User Invite", `${result.user.email} ${result.existing ? "already exists and was loaded" : "was invited"} as ${result.user.role}. ${deliveryNote}.`, "users", result.user.email);
    renderAll();
    toast(`${result.user.email} invited. ${deliveryNote}.`);
  } catch (/** @type {any} */ error) {
    console.error("Invite user failed", error);
    toast(`Invite failed: ${error.message || "Unable to invite user."}`);
  } finally {
    inviteInFlight = false;
  }
}

/** @param {string} password */
function passwordPolicyError(password) {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter.";
  if (!/\d/.test(value)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include at least one special character.";
  if (/\s/.test(value)) return "Password cannot contain spaces.";
  return "";
}

/** @param {SubmitEvent} event */
async function submitModal(event) {
  event.preventDefault();
  const form = qs("#modal-form");
  if (!form) return toast("Form not found. Close and reopen the modal.");
  if (modalType === "client") syncClientDepartmentContactsHidden();
  const values = formObject(form);
  // Masterlist text is stored trimmed so " Acme" and "Acme" can never become two records.
  if (["client", "item", "bank", "supplier", "employee"].includes(modalType)) for (const key of Object.keys(values)) if (typeof values[key] === "string") values[key] = values[key].trim();
  if (["invoice", "cancelReplace", "purchaseOrder", "inventoryPurchaseOrder"].includes(modalType)) {
    try { values.itemsText = collectInvoiceEditorLines(); }
    catch (/** @type {any} */ error) { return toast(error.message); }
  }
  if (editContext) {
    const previous = editContext.list[editContext.index];
    // Start from the stored record: the edit form only shows some fields, and the rest (client/
    // supplier `code`, imported bank/sales-account fields, `archived`, `migrated`...) would
    // otherwise be silently dropped on save.
    const next = { ...previous, ...values };
    if (modalType === "item" && next.classification) next.category = importedCategory(next.classification);
    if (modalType === "employee" && !canManageEmployeeSalary()) next.salary = editContext.list[editContext.index].salary;
    try { validateMasterRecord(modalType, next, editContext.index); }
    catch (/** @type {any} */ error) { return toast(error.message); }
    if (modalType === "client") { next.creditLimit = Number(next.creditLimit); next.terms = Number(next.terms || 30); }
    if (modalType === "employee" && canManageEmployeeSalary()) next.salary = Number(next.salary || 0);
    if (modalType === "employee") next.targetSales = Number(next.targetSales || 0);
    const moduleKey = masterlistModuleKey(modalType);
    const previousKey = masterlistRecordKey(modalType, previous);
    if (!(await confirmFinalSave(`Save changes to this ${modalType}?`))) return;
    // The confirm can sit open while other users save — re-check against the latest data.
    try { validateMasterRecord(modalType, next, editContext.index); }
    catch (/** @type {any} */ error) { return toast(error.message); }
    editContext.list[editContext.index] = next;
    if (moduleKey) {
      const saveResult = await persistRecords({ [moduleKey]: [next] }, { [moduleKey]: [previousKey] });
      if (!saveResult?.ok) return;
    }
    log("Edited masterlist record", "Masterlists", `Edited ${modalType}: ${recordLabel(modalType, previous)}`, { save: false });
    editContext = null;
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast("Masterlist record updated.");
    return;
  }
  if (["client", "item", "bank", "supplier", "employee"].includes(modalType)) {
    if (modalType === "item" && values.classification) values.category = importedCategory(values.classification);
    try { validateMasterRecord(modalType, values); }
    catch (/** @type {any} */ error) { return toast(error.message); }
  }
  if (["client", "item", "bank", "supplier", "employee"].includes(modalType)) {
    const record = modalType === "client" ? { ...values, terms: Number(values.terms || 30), creditLimit: Number(values.creditLimit), docs: values.docs || "" }
      : modalType === "employee" ? { ...values, salary: canManageEmployeeSalary() ? Number(values.salary || 0) : 0, targetSales: Number(values.targetSales || 0) }
      : values;
    /** @type {Record<string, any[]>} */
    const listByType = { client: data.clients, item: data.items, supplier: data.suppliers, employee: data.employees, bank: data.banks };
    const moduleKey = masterlistModuleKey(modalType);
    if (!(await confirmFinalSave(`Save this new ${modalType}?`))) return;
    try { validateMasterRecord(modalType, values); }
    catch (/** @type {any} */ error) { return toast(error.message); }
    listByType[modalType].push(record);
    if (moduleKey) {
      const saveResult = await persistRecords({ [moduleKey]: [record] });
      if (!saveResult?.ok) return;
    }
    log(`Saved ${modalType}`, modalConfigs[modalType].title, Object.values(values)[0], { save: false });
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "invoice") {
    const allowCreditPending = currentUser?.role === "Accounting";
    try {
      const sale = await buildWithItemRefresh(() => buildSale(values, null, { allowCreditPending }));
      if (!(await confirmFinalSave("Save this invoice?"))) return;
      data.sales.push(sale);
      const saveResult = await persistRecords({ sales: [sale], inventory: inventoryTouchedBySale(sale), purchaseOrders: purchaseOrdersTouchedBySales([sale]) });
      if (!saveResult?.ok) return;
      log("Created invoice", "Invoicing", `${sale.documentNo} · ${sale.type} · ${sale.client}`, { save: false });
      saveData(["notifications"]);
      qs("#demo-modal").close();
      form.reset();
      renderAll();
      toast(`${modalConfigs[modalType].title} saved.`);
      return;
    }
    catch (/** @type {any} */ error) {
      if (error instanceof CreditApprovalRequiredError) {
        if (!(await confirmFinalSave(`${error.message} Submit this invoice for Admin/CEO approval?`))) return;
        const request = { id: `PCA-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, client: error.credit.client, requestedBy: currentUser?.name || "System User", requestedByRole: currentUser?.role, requestedAt: fmtDate(today), projected: error.credit.projected, limit: error.credit.limit, values: { ...values }, status: "Pending" };
        data.pendingCreditInvoices.push(request);
        const saveResult = await persistRecords({ pendingCreditInvoices: [request] });
        if (!saveResult?.ok) return;
        log("Requested credit approval", "Invoicing", `${request.id} · ${request.client}`, { save: false });
        notify("Credit", `${request.requestedBy} requested approval to invoice ${request.client} over its credit limit (${peso.format(request.projected)} / ${peso.format(request.limit)}).`, "invoicing", request.id);
        saveData(["notifications"]);
        qs("#demo-modal").close();
        form.reset();
        renderAll();
        toast("Submitted for Admin/CEO credit approval.");
        return;
      }
      notify("Validation", error.message, "sales", values.documentNo || values.client || ""); saveData(); return toast(error.message);
    }
  }
  if (modalType === "purchaseOrder") {
    const wasEditing = Boolean(editingPoId);
    let po;
    try { po = await buildWithItemRefresh(() => buildPurchaseOrder(values, { editingId: editingPoId })); }
    catch (/** @type {any} */ error) { notify("Validation", error.message, "purchase-orders", values.client || ""); saveData(); return toast(error.message); }
    if (!(await confirmFinalSave(wasEditing ? `Save changes to ${po.id}?` : "Save this purchase order?"))) return;
    if (wasEditing) {
      const index = data.purchaseOrders.findIndex((entry) => entry.id === po.id);
      if (index >= 0) data.purchaseOrders[index] = po; else data.purchaseOrders.push(po);
    } else {
      data.purchaseOrders.push(po);
    }
    const saveResult = await persistRecords({ purchaseOrders: [po] });
    if (!saveResult?.ok) return;
    log(wasEditing ? "Edited purchase order" : `Saved ${modalType}`, modalConfigs[modalType].title, po.id || po.client, { save: false });
    editingPoId = null;
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(wasEditing ? `${po.id} updated.` : `${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "inventoryPurchaseOrder") {
    let po;
    try { po = await buildWithItemRefresh(() => buildInventoryPurchaseOrder(values)); }
    catch (/** @type {any} */ error) { notify("Validation", error.message, "inventory", values.supplier || ""); saveData(); return toast(error.message); }
    if (!(await confirmFinalSave("Save this inventory purchase order?"))) return;
    data.inventoryPurchaseOrders.push(po);
    const saveResult = await persistRecords({ inventoryPurchaseOrders: [po] });
    if (!saveResult?.ok) return;
    log(`Saved ${modalType}`, modalConfigs[modalType].title, po.id || po.supplier, { save: false });
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "cancelReplace") {
    const oldSale = data.sales.find((sale) => sale.id === values.oldInvoice);
    if (!oldSale || oldSale.status === "Cancelled") return toast("Original invoice is not available for cancellation.");
    if (!(await confirmFinalSave(`Cancel and replace ${oldSale.documentNo || oldSale.id}?`))) return;
    try {
      restoreCancelledStock(oldSale);
      const replacement = buildSale(values, oldSale.documentNo || oldSale.id);
      oldSale.status = "Cancelled";
      oldSale.cancelReason = values.reason;
      oldSale.replacementId = replacement.documentNo;
      oldSale.cancelledBy = currentUser?.name || "System User";
      data.sales.push(replacement);
      const saveResult = await persistRecords({ sales: [oldSale, replacement], inventory: [...inventoryTouchedBySale(oldSale), ...inventoryTouchedBySale(replacement)], purchaseOrders: purchaseOrdersTouchedBySales([oldSale, replacement]) });
      if (!saveResult?.ok) return;
      log("Cancelled and replaced invoice", "Invoicing", `${oldSale.documentNo || oldSale.id} -> ${replacement.documentNo}`, { save: false });
      notify("Cancellation", `${oldSale.documentNo || oldSale.id} cancelled and replaced by ${replacement.documentNo}.`, "receivables-tracker", replacement.documentNo || replacement.id);
      saveData(["notifications"]);
      qs("#demo-modal").close();
      form.reset();
      renderAll();
      toast(`${modalConfigs[modalType].title} saved.`);
      return;
    } catch (/** @type {any} */ error) { deductSaleStock(oldSale); return toast(error.message); }
  }
  if (modalType === "paymentRequest") {
    if (!values.cvNo?.trim()) return toast("CV number is required.");
    if (data.paymentRequests.some((request) => request.cvNo.toLowerCase() === values.cvNo.toLowerCase() && cvYear(request.date || request.createdAt) === cvYear(values.date))) return toast("Duplicate CV number detected for this year.");
    if (values.paymentType === "Bank Transfer") {
      if (!values.transferDate) return toast("Transfer date is required for bank transfer collections.");
      if (!values.bank) return toast("Bank name is required for bank transfer collections.");
      values.bankAccount = data.banks.find((bank) => bank.name === values.bank)?.account || values.bankAccount || "";
    }
    if (values.paymentType !== "Bank Transfer") { values.transferDate = ""; values.bankAccount = ""; }

    let items, gross, withholdingTax, expandedWithholdingTax, total, netAmount;
    if (paymentRequestPreselectedInvoice) {
      const amount = Number(qs("#single-amount")?.value || 0);
      if (amount <= 0) return toast("Enter an amount greater than zero.");
      const deductions = paymentRequestDeductions(amount);
      gross = amount; withholdingTax = deductions.withholdingTax; expandedWithholdingTax = deductions.expandedWithholdingTax; total = deductions.total; netAmount = deductions.total;
      items = [{ invoice: paymentRequestPreselectedInvoice, particulars: paymentRequestPreselectedInvoice, amount, withholdingTax: deductions.withholdingTax > 0, expandedWithholdingTax: deductions.expandedWithholdingTax > 0, netAmount: deductions.total }];
    } else {
      const rows = collectPaymentRequestLines();
      netAmount = Number(values.netAmount || 0);
      if (netAmount <= 0) return toast("Net Amount is required and must be greater than zero.");
      if (!rows.length || rows.some((row) => !row.invoice || row.amount <= 0)) return toast("Each row needs an invoice and an amount greater than zero.");
      const seen = new Set();
      for (const row of rows) {
        if (seen.has(row.invoice)) return toast(`${row.invoice} is selected in more than one row — each invoice can only be paid once per collection.`);
        seen.add(row.invoice);
      }
      if (paymentRequestNetAmountExceeded(rows, netAmount)) return toast(`Itemized amount total exceeds Net Amount (${peso.format(netAmount)}). Reduce the amounts or increase Net Amount.`);
      items = rows.map((row) => {
        const deductions = paymentRequestRowDeductions(row);
        return { invoice: row.invoice, particulars: row.invoice, amount: row.amount, amountDue: row.amountDue, withholdingTax: row.withholdingTax, expandedWithholdingTax: row.expandedWithholdingTax, netAmount: deductions.total };
      });
      gross = items.reduce((sum, item) => sum + item.amount, 0);
      withholdingTax = items.reduce((sum, item) => sum + paymentRequestRowDeductions(item).withholdingTax, 0);
      expandedWithholdingTax = items.reduce((sum, item) => sum + paymentRequestRowDeductions(item).expandedWithholdingTax, 0);
      // "total" must tally with the entered Net Amount (cash) — item.netAmount is the
      // per-invoice AR-settlement value (cash + withholding credit) used on approval, not the
      // cash total this voucher/deposit itself represents.
      total = gross;
    }
    if (total <= 0) return toast("Payment request total must be greater than zero.");

    const invoiceIds = collectPaymentRequestInvoices();
    const linkedSales = /** @type {any[]} */ (invoiceIds.map((id) => findSaleByDocumentInput(id)).filter(Boolean));
    if (invoiceIds.length && linkedSales.length !== invoiceIds.length) return toast("One or more selected invoices could not be found.");
    if (linkedSales.length) {
      const combinedBalance = linkedSales.reduce((sum, sale) => sum + Math.max(Number(sale.net || 0) - Number(sale.paid || 0), 0), 0);
      if (total > combinedBalance) return toast(`Total (${peso.format(total)}) exceeds the combined balance of the selected invoice(s) (${peso.format(combinedBalance)}).`);
    }
    const isCollection = linkedSales.length > 0;
    const nowStamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" });
    const paymentRequest = {
      ...values,
      items,
      particulars: items.map((item) => item.particulars).join("; "),
      amount: items[0]?.amount || 0,
      gross, withholdingTax, expandedWithholdingTax, total, netAmount,
      instructions: paymentRequestInstructions,
      preparedBy: values.preparedBy?.trim() || currentUser?.name || "System User",
      preparedRole: activeEmployees().find((employee) => employee.name === values.preparedBy?.trim())?.role || currentUser?.role || "Accounting",
      createdByUser: currentUser?.email || "",
      invoice: linkedSales.map((sale) => sale.documentNo || sale.id).join(", "),
      invoices: linkedSales.map((sale) => sale.documentNo || sale.id),
      invoiceClient: linkedSales[0]?.client || "",
      requestStatus: isCollection ? "Pending" : "Approved",
      approvedBy: isCollection ? "" : "Maria Emma F. Llorin",
      approvedRole: isCollection ? "" : "CEO",
      status: isCollection ? "Pending" : "Prepared",
      history: [{ date: nowStamp, status: isCollection ? "Pending" : "Prepared", note: isCollection ? `Collection created for ${linkedSales.map((sale) => sale.documentNo || sale.id).join(", ")}.` : "CV voucher created.", by: currentUser?.name || "System User" }],
      createdAt: fmtDate(today),
    };
    if (!(await confirmFinalSave("Save this payment request?"))) return;
    data.paymentRequests.unshift(/** @type {PaymentRequest} */ (/** @type {any} */ (paymentRequest)));
    const saveResult = await persistRecords({ paymentRequests: [paymentRequest] });
    if (!saveResult?.ok) return;
    log("Created payment request", "Collections", `${values.cvNo} · ${values.employee} · ${peso.format(total)}`, { save: false });
    notify("Payment Received", `${values.cvNo} ${isCollection ? "pending approval" : "prepared"} for ${values.employee}.`, "collections", values.cvNo);
    saveData(["notifications"]);
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    previewPaymentRequest(0);
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "payable") {
    const items = collectFinancialLines();
    const gross = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const deductions = financialRequestDeductions(gross);
    if (!items.length || deductions.total <= 0) return toast("Add at least one payable item with amount.");
    const payable = { id: nextId(data.payables, "PAY"), ...values, item: items.map((item) => item.particulars).join("; "), qty: items.length, uom: "item", items, grossAmount: deductions.grossAmount, withholdingTax1: deductions.withholdingTax1, withholdingTax2: deductions.withholdingTax2, amount: deductions.total, paid: 0, method: "", bank: "", cheque: "", chequeDate: "", status: "For Approval", requestStatus: "For Approval", paymentConfirmed: false, createdByUser: currentUser?.email || "" };
    if (!(await confirmFinalSave("Save this payable?"))) return;
    data.payables.push(/** @type {Payable} */ (/** @type {unknown} */ (payable)));
    const saveResult = await persistRecords({ payables: [payable] });
    if (!saveResult?.ok) return;
    log("Created payable", "Payables", `${payable.id} · ${/** @type {any} */ (payable).supplier || "Supplier"}`, { save: false });
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "replenishment") {
    const items = collectFinancialLines();
    const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (!items.length || amount <= 0) return toast("Add at least one expense item with amount.");
    if (items.some((item) => !EXPENSE_CLASSIFICATION_OPTIONS.includes(item.classification))) return toast("Select a classification (from the list) for every expense item.");
    if (["Per Diem", "Revolving Fund"].includes(values.type) && !String(values.employeeName || "").trim()) return toast("Employee Name is required for Per Diem or Revolving Fund expenses.");
    if (!["Per Diem", "Revolving Fund"].includes(values.type)) values.employeeName = "";
    const replenishment = { id: `REP-${String(data.replenishments.length + 1).padStart(3, "0")}`, ...values, items, amount, status: "For Approval", requestStatus: "For Approval", paymentConfirmed: false, method: "", bank: "", cheque: "", chequeDate: "", createdByUser: currentUser?.email || "" };
    if (!(await confirmFinalSave("Save this expense/replenishment?"))) return;
    data.replenishments.push(replenishment);
    const saveResult = await persistRecords({ replenishments: [replenishment] });
    if (!saveResult?.ok) return;
    log("Created replenishment", "Expenses", `${replenishment.id} · ${/** @type {any} */ (replenishment).requester || "Requester"}`, { save: false });
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "warranty") {
    if (!(await confirmFinalSave("Save this warranty record?"))) return;
    data.warranties.push(values);
    const saveResult = await persistRecords({ warranties: [values] });
    if (!saveResult?.ok) return;
    log("Created warranty record", "Add Warranty Record", `${values.serial || values.equipment || values.client}`, { save: false });
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (["productIssue", "instrumentalServiceReport"].includes(modalType)) {
    if (!values.companyName?.trim()) return toast("Company name is required.");
    if (values.status === "Resolved" && !values.resolvedBy) return toast("Select who resolved this report.");
    values.id = values.id?.trim() || nextProductIssueId(modalType);
    if (data.productIssues.some((report) => report.id === values.id)) return toast("Duplicate document number detected.");
    values.reportType = modalType === "instrumentalServiceReport" ? "instrumental" : "technical";
    values.status = values.status || "Open";
    values.performedBy = currentUser?.name || "System User";
    values.qcParameters = collectProductIssueParameters?.() || [];
    values.resolvedAt = values.status === "Resolved" ? fmtDate(today) : "";
    values.originRole = productIssueOriginRole(currentUser?.role);
    values.currentActor = values.originRole;
    values.history = [{ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }), status: values.status || "Open", note: values.remarks?.trim() ? `Report started: ${values.remarks.trim()}` : "Report started", by: values.performedBy || currentUser?.name || "System User" }];
    if (!(await confirmFinalSave(`Save this ${modalConfigs[modalType].title.toLowerCase()}?`))) return;
    data.productIssues.push(/** @type {ProductIssue} */ (values));
    const saveResult = await persistRecords({ productIssues: [values] });
    if (!saveResult?.ok) return;
    log(`Created ${modalConfigs[modalType].title.toLowerCase()}`, "Support Tracker", `${values.id} · ${values.companyName}`, { save: false });
    notify("Support Report", `${values.id} started for ${values.companyName}.`, "product-issues", values.id);
    saveData(["notifications"]);
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast(`${modalConfigs[modalType].title} saved.`);
    return;
  }
  if (modalType === "user") {
    if (!canManageUsers()) return toast("Only Superadmin/CEO can add users.");
    const email = String(values.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast("Enter a valid email address.");
    if (data.users.some((user) => String(user.email || "").trim().toLowerCase() === email && !userIsArchived(user))) return toast("A user with this email already exists.");
    values.email = email;
    values.branch = "all";
    if (values.role === "Superadmin") values.superadminPermissions = true;
    const view = qsa("input[name='userViewModules']:checked").map((input) => input.value);
    const edit = qsa("input[name='userEditModules']:checked").map((input) => input.value).filter((module) => view.includes(module));
    qs("#demo-modal").close();
    form.reset();
    handleUserInvite(values, view, edit);
    return;
  }
}

qsa(".nav-item").forEach((button) => button.addEventListener("click", (event) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.button === 1) return; // let the browser open a new tab/window natively
  event.preventDefault();
  showSection(/** @type {string} */ (button.dataset.section), { scrollTop: true });
  if (location.protocol !== "file:") history.replaceState(null, "", `/dashboard?section=${button.dataset.section}`);
}));
document.body.addEventListener("click", (event) => {
  const modalButton = closestEl(event.target, "[data-action='open-modal']");
  if (modalButton) {
    if (qs("#report-preview-modal")?.open) qs("#report-preview-modal").close();
    return canEditActiveSection() ? openModal(/** @type {string} */ (modalButton.dataset.type)) : toast("Editing is disabled for this module in User Settings.");
  }
  const sortButton = closestEl(event.target, "[data-sort-col]");
  if (sortButton) return sortTable(sortButton);
  if (!closestEl(event.target, ".notification-menu")) { qs("#notification-popover").hidden = true; qs("#notification-toggle").setAttribute("aria-expanded", "false"); }
  if (!closestEl(event.target, ".user-menu")) { qs("#user-popover").hidden = true; qs("#user-menu-toggle").setAttribute("aria-expanded", "false"); }
  const workflowAction = closestEl(event.target, "[data-workflow-action]");
  if (workflowAction) return handleWorkflowAction(/** @type {string} */ (workflowAction.dataset.workflowAction));
  const paymentRequestPreview = closestEl(event.target, "[data-payment-request-preview]");
  if (paymentRequestPreview) { qs("#payment-request-more-modal")?.close(); return previewPaymentRequest(/** @type {string} */ (paymentRequestPreview.dataset.paymentRequestPreview)); }
  const paymentRequestApprove = closestEl(event.target, "[data-payment-request-approve]");
  if (paymentRequestApprove) return approvePaymentRequest(/** @type {string} */ (paymentRequestApprove.dataset.paymentRequestApprove));
  const paymentRequestCancel = closestEl(event.target, "[data-payment-request-cancel]");
  if (paymentRequestCancel) return cancelPaymentRequest(/** @type {string} */ (paymentRequestCancel.dataset.paymentRequestCancel));
  const paymentRequestTimeline = closestEl(event.target, "[data-payment-request-timeline]");
  if (paymentRequestTimeline) { qs("#payment-request-more-modal")?.close(); return renderPaymentRequestDetail(/** @type {string} */ (paymentRequestTimeline.dataset.paymentRequestTimeline)); }
  const paymentRequestMore = closestEl(event.target, "[data-payment-request-more]");
  if (paymentRequestMore) return openPaymentRequestMoreMenu(/** @type {string} */ (paymentRequestMore.dataset.paymentRequestMore));
  const openPaymentRequest = closestEl(event.target, "[data-open-payment-request]");
  if (openPaymentRequest) { closeReportPreview(); return renderPaymentRequestDetail(/** @type {string} */ (openPaymentRequest.dataset.openPaymentRequest)); }
  const requestPreview = closestEl(event.target, "[data-request-preview]");
  if (requestPreview) { const [type, id] = /** @type {string} */ (requestPreview.dataset.requestPreview).split(":"); return previewFinancialRequest(type, id); }
  const requestApprove = closestEl(event.target, "[data-request-approve]");
  if (requestApprove) { const [type, id] = /** @type {string} */ (requestApprove.dataset.requestApprove).split(":"); return approveFinancialRequest(type, id); }
  const requestCancel = closestEl(event.target, "[data-request-cancel]");
  if (requestCancel) { const [type, id] = /** @type {string} */ (requestCancel.dataset.requestCancel).split(":"); return cancelFinancialRequest(type, id); }
  const creditApprove = closestEl(event.target, "[data-credit-approve]");
  if (creditApprove) return approveCreditInvoice(/** @type {string} */ (creditApprove.dataset.creditApprove));
  const creditReject = closestEl(event.target, "[data-credit-reject]");
  if (creditReject) return rejectCreditInvoice(/** @type {string} */ (creditReject.dataset.creditReject));
  const generate2307 = closestEl(event.target, "[data-generate2307]");
  if (generate2307) return downloadBir2307(/** @type {string} */ (generate2307.dataset.generate2307));
  const viewUserSessions = closestEl(event.target, "[data-view-user-sessions]");
  if (viewUserSessions) return openUserSessions(Number(/** @type {string} */ (viewUserSessions.dataset.viewUserSessions)));
  const revokeSession = closestEl(event.target, "[data-revoke-session]");
  if (revokeSession) return forceLogoutSession(/** @type {string} */ (revokeSession.dataset.revokeSession));
  const downloadBackup = closestEl(event.target, "[data-download-backup]");
  if (downloadBackup) return downloadBackupFile(/** @type {string} */ (downloadBackup.dataset.downloadBackup));
  const downloadBackupKey = closestEl(event.target, "[data-download-backup-key]");
  if (downloadBackupKey) return downloadBackupObjectFile(/** @type {string} */ (downloadBackupKey.dataset.downloadBackupKey));
  const restoreBackupId = closestEl(event.target, "[data-restore-backup-id]");
  if (restoreBackupId) return restoreBackupFromRef({ id: restoreBackupId.dataset.restoreBackupId, created: restoreBackupId.dataset.restoreBackupCreated, records: restoreBackupId.dataset.restoreBackupRecords, size: restoreBackupId.dataset.restoreBackupSize, source: restoreBackupId.dataset.restoreBackupSource });
  const restoreBackupKey = closestEl(event.target, "[data-restore-backup-key]");
  if (restoreBackupKey) return restoreBackupFromRef({ key: restoreBackupKey.dataset.restoreBackupKey, created: restoreBackupKey.dataset.restoreBackupCreated, records: restoreBackupKey.dataset.restoreBackupRecords, size: restoreBackupKey.dataset.restoreBackupSize, source: restoreBackupKey.dataset.restoreBackupSource });
  const confirmPayment = closestEl(event.target, "[data-confirm-payment]");
  if (confirmPayment) { const [type, id, method] = /** @type {string} */ (confirmPayment.dataset.confirmPayment).split(":"); return confirmFinancialPayment(type, id, method); }
  const makePaymentRequest = closestEl(event.target, "[data-make-payment-request]");
  if (makePaymentRequest) return openPaymentRequestForInvoice(/** @type {string} */ (makePaymentRequest.dataset.makePaymentRequest));
  const collectionStatus = closestEl(event.target, "[data-collection-status]");
  if (collectionStatus) { const [receiptNo, status] = /** @type {string} */ (collectionStatus.dataset.collectionStatus).split(":"); return updateCollectionPaymentStatus(receiptNo, status); }
  const addressButton = closestEl(event.target, "[data-edit-branch-address]");
  if (addressButton) return editPlatformBranchAddress(/** @type {string} */ (addressButton.dataset.editBranchAddress));
  const removeBranchButton = closestEl(event.target, "[data-remove-platform-branch]");
  if (removeBranchButton) return removePlatformBranch(/** @type {string} */ (removeBranchButton.dataset.removePlatformBranch));
  const inventoryPoPrint = closestEl(event.target, "[data-inventory-po-print]");
  if (inventoryPoPrint) return previewInventoryPurchaseOrder(/** @type {string} */ (inventoryPoPrint.dataset.inventoryPoPrint));
  const inventoryPoTimeline = closestEl(event.target, "[data-inventory-po-timeline]");
  if (inventoryPoTimeline) return renderInventoryPoDetail(/** @type {string} */ (inventoryPoTimeline.dataset.inventoryPoTimeline));
  const inventoryPoApprove = closestEl(event.target, "[data-inventory-po-approve]");
  if (inventoryPoApprove) return approvePurchaseOrder(Number(/** @type {string} */ (inventoryPoApprove.dataset.inventoryPoApprove)));
  const inventoryPoAdvance = closestEl(event.target, "[data-inventory-po-advance]");
  if (inventoryPoAdvance) return advancePurchaseOrderStatus(Number(/** @type {string} */ (inventoryPoAdvance.dataset.inventoryPoAdvance)));
  const inventoryPoCancel = closestEl(event.target, "[data-inventory-po-cancel]");
  if (inventoryPoCancel) return cancelPurchaseOrder(Number(/** @type {string} */ (inventoryPoCancel.dataset.inventoryPoCancel)));
  const inventoryPoReceive = closestEl(event.target, "[data-inventory-po-receive]");
  if (inventoryPoReceive) { const po = data.inventoryPurchaseOrders[Number(/** @type {string} */ (inventoryPoReceive.dataset.inventoryPoReceive))]; if (po) openStockSheetForPo(po.id); return; }
  const stockReceiptApprove = closestEl(event.target, "[data-stock-receipt-approve]");
  if (stockReceiptApprove) return approveStockReceipt(Number(/** @type {string} */ (stockReceiptApprove.dataset.stockReceiptApprove)));
  const stockReceiptEdit = closestEl(event.target, "[data-stock-receipt-edit]");
  if (stockReceiptEdit) return openStockSheetForReceiptEdit(Number(/** @type {string} */ (stockReceiptEdit.dataset.stockReceiptEdit)));
  const stockReceiptCancel = closestEl(event.target, "[data-stock-receipt-cancel]");
  if (stockReceiptCancel) return cancelStockReceipt(Number(/** @type {string} */ (stockReceiptCancel.dataset.stockReceiptCancel)));
  const stockEditButton = closestEl(event.target, "[data-stock-edit]");
  if (stockEditButton) return openStockEditDialog(/** @type {string} */ (stockEditButton.dataset.stockEdit));
  const stockHistoryButton = closestEl(event.target, "[data-stock-history]");
  if (stockHistoryButton) return showStockHistory(/** @type {string} */ (stockHistoryButton.dataset.stockHistory));
  const revertImport = closestEl(event.target, "[data-revert-import]");
  if (revertImport) return revertImportBatch(Number(/** @type {string} */ (revertImport.dataset.revertImport)));
  const productIssuePrint = closestEl(event.target, "[data-product-issue-print]");
  if (productIssuePrint) return previewProductIssue(/** @type {string} */ (productIssuePrint.dataset.productIssuePrint));
  const productIssueTimeline = closestEl(event.target, "[data-product-issue-timeline]");
  if (productIssueTimeline) return renderProductIssueDetail(/** @type {string} */ (productIssueTimeline.dataset.productIssueTimeline));
  const productIssueStatus = closestEl(event.target, "[data-product-issue-status]");
  if (productIssueStatus) { const [issueId, issueStatus] = /** @type {string} */ (productIssueStatus.dataset.productIssueStatus).split(":"); return updateProductIssueStatus(issueId, issueStatus); }
  const poEditButton = closestEl(event.target, "[data-po-edit]");
  if (poEditButton) return editPurchaseOrder(/** @type {string} */ (poEditButton.dataset.poEdit));
  const invoicePoButton = closestEl(event.target, "[data-create-invoice-po]");
  if (invoicePoButton) return openInvoiceForPurchaseOrder(/** @type {string} */ (invoicePoButton.dataset.createInvoicePo));
  const clientInvoices = closestEl(event.target, "[data-client-invoices]");
  if (clientInvoices) {
    const nextClient = clientInvoices.dataset.clientInvoices;
    if (nextClient !== currentClientView) {
      if (qs("#client-invoices-status-filter")) qs("#client-invoices-status-filter").value = "all";
      if (qs("#client-invoices-from")) qs("#client-invoices-from").value = "";
      if (qs("#client-invoices-to")) qs("#client-invoices-to").value = "";
    }
    currentClientView = nextClient;
    // "client-invoices" itself is never a valid origin here (a click from within it would just
    // re-enter this same branch for a different client) — keep whatever the last real origin was.
    if (document.body.dataset.activeSection && document.body.dataset.activeSection !== "client-invoices") clientInvoicesReturnSection = document.body.dataset.activeSection;
    renderClientInvoices();
    return showSection("client-invoices");
  }
  const clientInvoicesExportCsv = closestEl(event.target, "#client-invoices-export-csv");
  if (clientInvoicesExportCsv) return exportClientInvoicesCsv();
  const clientInvoicesExportPdf = closestEl(event.target, "#client-invoices-export-pdf");
  if (clientInvoicesExportPdf) return printClientInvoicesReport();
  const clientInvoicesResetFilters = closestEl(event.target, "#client-invoices-reset-filters");
  if (clientInvoicesResetFilters) return resetClientInvoicesFilters();
  const logDetail = closestEl(event.target, "[data-log-detail]");
  if (logDetail) return showAuditLogDetail(Number(/** @type {string} */ (logDetail.dataset.logDetail)));
  const createSoa = closestEl(event.target, "[data-create-soa]");
  if (createSoa) return previewSoa(/** @type {string} */ (createSoa.dataset.createSoa));
  const invoiceFlow = closestEl(event.target, "[data-invoice-flow]");
  if (invoiceFlow) return renderInvoiceFlowDetail(/** @type {string} */ (invoiceFlow.dataset.invoiceFlow));
  const calendarNav = closestEl(event.target, "[data-calendar-nav]");
  if (calendarNav) {
    const widget = closestEl(calendarNav, ".calendar-widget");
    const prefix = widget?.dataset.calendarPrefix;
    if (prefix) navigateCalendarWidget(prefix, Number(/** @type {string} */ (calendarNav.dataset.calendarNav)));
    return;
  }
  const calendarDay = closestEl(event.target, "[data-calendar-day]");
  if (calendarDay) {
    const widget = closestEl(calendarDay, ".calendar-widget");
    const prefix = widget?.dataset.calendarPrefix;
    if (prefix) showCalendarDayDetail(prefix, /** @type {string} */ (calendarDay.dataset.calendarDay));
    return;
  }
  const target = closestEl(event.target, "[data-go-section]");
  if (!target) return;
  const notice = closestEl(event.target, "[data-notice-index]");
  if (notice) {
    data.notifications[Number(/** @type {string} */ (notice.dataset.noticeIndex))].status = "Seen";
    saveData();
    renderNotifications();
  }
  goToFocused(/** @type {string} */ (target.dataset.goSection), target.dataset.focusRecord || "");
  qs("#notification-popover").hidden = true;
});
qs("#notification-toggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const popover = qs("#notification-popover");
  qs("#user-popover").hidden = true;
  qs("#user-menu-toggle").setAttribute("aria-expanded", "false");
  popover.hidden = !popover.hidden;
  /** @type {AnyEl} */ (event.currentTarget).setAttribute("aria-expanded", String(!popover.hidden));
});
qs("#view-all-notifications").addEventListener("click", () => { qs("#notification-popover").hidden = true; qs("#notification-toggle").setAttribute("aria-expanded", "false"); showSection("notifications"); });
qs("#user-menu-toggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const popover = qs("#user-popover");
  qs("#notification-popover").hidden = true;
  qs("#notification-toggle").setAttribute("aria-expanded", "false");
  popover.hidden = !popover.hidden;
  /** @type {AnyEl} */ (event.currentTarget).setAttribute("aria-expanded", String(!popover.hidden));
});
qs("#open-settings").addEventListener("click", () => { qs("#user-popover").hidden = true; qs("#user-menu-toggle").setAttribute("aria-expanded", "false"); renderUserSettings(); showSection("user-settings"); });
function syncThemeToggleLabel() {
  const isDark = document.documentElement.dataset.theme === "dark";
  const button = qs("#theme-toggle");
  if (!button) return;
  button.setAttribute("aria-checked", String(isDark));
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
  const label = qs("#theme-switch-label");
  if (label) label.textContent = isDark ? "Dark mode" : "Light mode";
}
/** @param {string} theme */
function setThemePreference(theme) {
  applyThemePreference(theme);
  syncThemeToggleLabel();
  if (currentUser) {
    currentUser.themePreference = theme;
    localStorage.setItem("medlane-session", JSON.stringify(currentUser));
  }
  MedlaneAPI.setTheme(theme).catch((error) => console.error(JSON.stringify({ message: "Failed to save theme preference", error: error.message })));
}
qs("#theme-toggle").addEventListener("click", () => {
  setThemePreference(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
syncThemeToggleLabel();
function syncSidebarCollapseToggle() {
  const collapsed = document.documentElement.classList.contains("sidebar-collapsed");
  const button = qs("#sidebar-collapse-toggle");
  if (!button) return;
  button.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
  button.setAttribute("title", collapsed ? "Expand sidebar" : "Collapse sidebar");
}
qs("#sidebar-collapse-toggle")?.addEventListener("click", () => {
  const collapsed = document.documentElement.classList.toggle("sidebar-collapsed");
  localStorage.setItem("medlane-sidebar-collapsed", collapsed ? "1" : "0");
  syncSidebarCollapseToggle();
});
syncSidebarCollapseToggle();
qs("#logout-top-button")?.addEventListener("click", logoutCurrentUser);
qs("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const values = formObject(event.currentTarget);
  const profile = { email: values.email, phone: values.phone, notes: values.notes };
  currentUser = { ...currentUser, ...profile };
  localStorage.setItem("medlane-session", JSON.stringify(currentUser));
  renderUserMenu();
  applyRole();
  toast("User settings updated for this session. Profile persistence is managed by Admin users.");
});
qs("#invoice-approval-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!(await confirmFinalSave("Save invoice approval settings?"))) return;
  data.invoiceApprovals = formObject(event.currentTarget);
  log("Updated invoice approval settings", "Invoicing", "Invoice approvals");
  notify("Invoicing", "Invoice approved-by names were updated.", "invoicing", "Invoice approvals");
  saveData(["invoiceApprovals"]);
  toast("Invoice approved-by names saved.");
});
qs("#reset-demo-settings")?.addEventListener("click", () => toast("Production reset is disabled. Use Admin data tools or Supabase maintenance scripts."));
qs("#open-password-modal").addEventListener("click", () => {
  qs("#password-form").reset();
  qs("#password-modal").showModal();
});
qs("#password-close").addEventListener("click", () => guardedDialogClose(() => qs("#password-modal").close()));
qs("#password-cancel").addEventListener("click", () => qs("#password-modal").close());
qs("#password-modal").addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "password-modal") guardedDialogClose(() => qs("#password-modal").close()); });
guardDialogEscape(qs("#password-modal"));
qs("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formObject(event.currentTarget);
  const policyError = passwordPolicyError(values.newPassword);
  if (policyError) return toast(policyError);
  if (values.newPassword !== values.confirmPassword) return toast("Confirm password does not match.");
  const activeSession = MedlaneAPI.session();
  if (!activeSession?.access_token) return toast("Sign in again before changing your password.");
  if (!(await confirmFinalSave("Change your password?"))) return;
  try { await MedlaneAPI.changePassword(values.oldPassword, values.newPassword); }
  catch (/** @type {any} */ error) { return toast(error.message || "Password update failed."); }
  /** @type {AnyEl} */ (event.currentTarget).reset();
  qs("#password-modal").close();
  if (currentUser) { currentUser.passwordKycDue = false; localStorage.setItem("medlane-session", JSON.stringify(currentUser)); }
  log("Changed password", "User Settings", currentUser?.role || "User");
  notify("Password", `${currentUser?.name || "A user"} changed password.`, "logs", currentUser?.role || "User");
  if (currentUser?.email) notify("Security", "Your password was changed.", "notifications", "", null, currentUser.email);
  saveData(["notifications"]);
  toast("Password updated.");
});
qs("#platform-branch-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!canEditModule("masterlists")) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  const values = formObject(event.currentTarget);
  const branch = values.branch.trim();
  if (!branch) return toast("Branch name is required.");
  if (platformBranches().some((item) => item.toLowerCase() === branch.toLowerCase())) return toast("Branch already exists.");
  if (!(await confirmFinalSave(`Add branch "${branch}"?`))) return;
  data.platformBranches.push(branch);
  data.branchAddresses ||= {};
  data.branchAddresses[branch] = values.address.trim();
  /** @type {AnyEl} */ (event.currentTarget).reset();
  log("Added branch masterlist record", "Masterlists", branch);
  notify("Settings", `${branch} was added to platform branches.`, "settings", branch);
  saveData();
  renderPlatformSettings();
  renderAll();
  toast(`${branch} added to platform branches.`);
});
document.body.addEventListener("click", (event) => {
  const openDocs = closestEl(event.target, "[data-open-client-docs]");
  if (openDocs) return openClientDocsModal(/** @type {string} */ (openDocs.dataset.openClientDocs));
  const closeDocs = closestEl(event.target, "[data-close-client-docs]");
  if (closeDocs) return qs("#client-docs-modal")?.close();
  const closeMemoCompose = closestEl(event.target, "[data-close-memo-compose]");
  if (closeMemoCompose) return guardedDialogClose(() => qs("#memo-compose-modal")?.close());
  const submitMemo = closestEl(event.target, "#submit-memo-compose");
  if (submitMemo) return submitMemoCompose();
});
document.addEventListener("click", (event) => {
  if (/** @type {AnyEl} */ (event.target).id === "client-docs-modal") qs("#client-docs-modal")?.close();
  if (/** @type {AnyEl} */ (event.target).id === "memo-compose-modal") guardedDialogClose(() => qs("#memo-compose-modal")?.close());
});
document.addEventListener("change", (event) => {
  if (/** @type {AnyEl} */ (event.target).id === "memo-audience-all") qs("#memo-audience-grid").hidden = /** @type {AnyEl} */ (event.target).checked;
});
qs("#post-memo-button").addEventListener("click", openMemoComposeModal);
qs("#memo-list").addEventListener("click", (event) => {
  const ack = closestEl(event.target, "[data-acknowledge-memo]");
  if (ack) return acknowledgeMemo(/** @type {string} */ (ack.dataset.acknowledgeMemo));
  const print = closestEl(event.target, "[data-print-memo]");
  if (print) return printMemo(/** @type {string} */ (print.dataset.printMemo));
});
qs("#platform-branch-list").addEventListener("click", /** @returns {any} */ (event) => {
  const addressButton = closestEl(event.target, "[data-edit-branch-address]");
  if (addressButton) return editPlatformBranchAddress(/** @type {string} */ (addressButton.dataset.editBranchAddress));
  const button = closestEl(event.target, "[data-remove-platform-branch]");
  if (button) return removePlatformBranch(/** @type {string} */ (button.dataset.removePlatformBranch));
});

/** @param {string} branch */
async function editPlatformBranchAddress(branch) {
  if (!canEditModule("masterlists")) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  const nextAddress = prompt(`Address for ${branch}:`, data.branchAddresses?.[branch] || "") || data.branchAddresses?.[branch] || "";
  if (!(await confirmFinalSave(`Save address for ${branch}?`))) return;
  data.branchAddresses ||= {};
  data.branchAddresses[branch] = nextAddress;
  log("Edited branch address", "Masterlists", branch);
  notify("Settings", `${branch} branch address was updated.`, "settings", branch);
  saveData();
  renderAll();
  toast(`${branch} address saved.`);
}

/** @param {string} branch */
async function removePlatformBranch(branch) {
  if (!canEditModule("masterlists")) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  const reasons = branchUsageReasons(branch);
  if (reasons.length) return toast(`Cannot remove ${branch}; it is used by ${reasons.join(", ")}.`);
  if (!(await confirmFinalSave(`Remove branch "${branch}"?`))) return;
  data.platformBranches = platformBranches().filter((item) => item !== branch);
  if (data.branchAddresses) delete data.branchAddresses[branch];
  if (inventoryBranchTab === branch) inventoryBranchTab = platformBranches()[0] || "";
  log("Removed branch masterlist record", "Masterlists", branch);
  notify("Settings", `${branch} was removed from platform branches.`, "settings", branch);
  saveData();
  renderAll();
  toast(`${branch} removed from platform branches.`);
}
qs("#master-add-button").addEventListener("click", () => {
  if (!canEditActiveSection()) return toast("Masterlist changes need approval from Admin or Superadmin.");
  if (data.masterTab === "branches") return qs("#platform-branch-name").focus();
  /** @type {Record<string, string>} */
  const modalByTab = { clients: "client", items: "item", suppliers: "supplier", employees: "employee", banks: "bank" };
  openModal(modalByTab[data.masterTab]);
});
qs("#users-table").addEventListener("click", async (event) => {
  const resendButton = closestEl(event.target, "[data-resend-invite]");
  if (resendButton) return resendUserInvite(Number(/** @type {string} */ (resendButton.dataset.resendInvite)));
  const statusButton = closestEl(event.target, "[data-toggle-user-disabled]");
  if (statusButton) return toggleUserDisabled(Number(/** @type {string} */ (statusButton.dataset.toggleUserDisabled)));
  const resetButton = closestEl(event.target, "[data-reset-user-password]");
  if (resetButton) return setUserPasswordPrompt(Number(/** @type {string} */ (resetButton.dataset.resetUserPassword)));
  const copyLinkButton = closestEl(event.target, "[data-copy-invite-link]");
  if (copyLinkButton) return copyInviteLink(Number(/** @type {string} */ (copyLinkButton.dataset.copyInviteLink)));
  const resetPermissionsButton = closestEl(event.target, "[data-reset-user-permissions]");
  if (resetPermissionsButton) return resetUserPermissions(Number(/** @type {string} */ (resetPermissionsButton.dataset.resetUserPermissions)));
  const button = closestEl(event.target, "[data-archive-user]");
  if (!button) return;
  if (!canManageUsers()) return toast("Only Superadmin/CEO can archive users.");
  const index = Number(/** @type {string} */ (button.dataset.archiveUser));
  const user = data.users[index];
  if (!user) return;
  if (String(user.email || "").trim().toLowerCase() === String(currentUser?.email || "").trim().toLowerCase()) return toast("You cannot archive your own account.");
  const reason = prompt(`Reason for archiving ${user.name || user.email}:`, "Archived by admin");
  if (!String(reason || "").trim()) return toast("Archive reason is required.");
  if (!(await confirmFinalSave(`Archive ${user.name || user.email}?`))) return;
  const result = /** @type {OrApiError<UserStatusResponse>} */ (await MedlaneAPI.setUserDisabled(user.email || user.username, true, String(reason).trim()).catch((error) => ({ error })));
  if (result.error) return toast(result.error.message || "Unable to archive user.");
  await syncBackendUsers();
  const archivedUser = data.users.find((entry) => String(entry.email || entry.username || "").trim().toLowerCase() === String(user.email || user.username || "").trim().toLowerCase()) || user;
  archivedUser.inviteStatus = "Archived";
  archivedUser.disabledReason = String(reason).trim();
  archivedUser.archivedAt = new Date().toISOString();
  archivedUser.archivedBy = currentUser?.email || currentUser?.name || "System User";
  log("Archived user", "Users", `${user.email || user.name} · ${user.role}`);
  saveData();
  renderUsers();
  toast(`${user.name || user.email} archived.`);
});

/** @param {number} index */
async function toggleUserDisabled(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can disable users.");
  const user = data.users[index];
  if (!user?.email) return toast("User email is required.");
  if (user.email === currentUser?.email) return toast("You cannot disable your own account.");
  const disabled = !/disabled|archived/i.test(user.inviteStatus || "Active");
  const verb = disabled ? "disable" : "enable";
  if (!confirm(`${disabled ? "Disable" : "Enable"} ${user.name || user.email}?`)) return;
  const reason = disabled ? prompt(`Reason for disabling ${user.name || user.email}:`) : "";
  if (disabled && !String(reason || "").trim()) return toast("Disable reason is required.");
  const result = /** @type {OrApiError<UserStatusResponse>} */ (await MedlaneAPI.setUserDisabled(user.email, disabled, reason || "").catch((error) => ({ error })));
  if (result.error) return toast(result.error.message || `Unable to ${verb} user.`);
  user.inviteStatus = disabled ? "Disabled" : "Active";
  user.disabledReason = disabled ? String(reason).trim() : "";
  if (!disabled) { delete user.archivedAt; delete user.archivedBy; }
  await syncBackendUsers();
  log(`${disabled ? "Disabled" : "Enabled"} user`, "Users", `${user.email} · ${user.role}`);
  saveData();
  renderUsers();
  toast(`${user.name || user.email} ${disabled ? "disabled" : "enabled"}.`);
}

/** @param {number} index */
async function resendUserInvite(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can resend invitations.");
  const user = data.users[index];
  if (!user?.email) return toast("User email is required.");
  const result = /** @type {OrApiError<ResendInviteResponse>} */ (await MedlaneAPI.resendInvite(user.email).catch((error) => ({ error })));
  if (result.error) return toast(result.error.message || "Unable to resend invite.");
  toast(result.emailDelivery?.sent ? `Invitation resent to ${user.email}.` : result.emailDelivery?.reason || "Invite link generated, but email was not sent.");
}

/** @param {number} index */
async function resetUserPermissions(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can reset user permissions.");
  const user = data.users[index];
  if (!user?.email) return toast("User email is required.");
  if (!confirm(`Reset ${user.name || user.email}'s permissions to ${user.role}'s current default modules? Any custom view/edit access granted to them individually will be cleared.`)) return;
  const result = /** @type {OrApiError<ResetPermissionsResponse>} */ (await MedlaneAPI.resetUserPermissions(user.email).catch((error) => ({ error })));
  if (result.error) return toast(result.error.message || "Unable to reset permissions.");
  Object.assign(user, result.user);
  log("Reset user permissions to role defaults", "Users", `${user.email} · ${user.role}`);
  saveData();
  renderUsers();
  toast(`${user.name || user.email}'s permissions reset to ${user.role} defaults.`);
}
qs("#users-table").addEventListener("change", async (event) => {
  const checkbox = closestEl(event.target, "[data-user-superadmin]");
  if (!checkbox) return;
  if (!canManageUsers()) { checkbox.checked = !checkbox.checked; return toast("Only Superadmin/CEO can grant Superadmin permissions."); }
  const index = Number(/** @type {string} */ (checkbox.dataset.userSuperadmin));
  const user = data.users[index];
  if (!user) return;
  const granted = checkbox.checked;
  if (String(user.email || "").trim().toLowerCase() === String(currentUser?.email || "").trim().toLowerCase()) {
    checkbox.checked = !granted;
    return toast("You cannot change your own Superadmin permission.");
  }
  checkbox.disabled = true;
  const result = /** @type {OrApiError<SuperadminResponse>} */ (await MedlaneAPI.setUserSuperadmin(user.email, granted).catch((error) => ({ error })));
  checkbox.disabled = false;
  if (result.error) {
    checkbox.checked = !granted;
    return toast(result.error.message || "Unable to update Superadmin permission.");
  }
  user.role = result.role || user.role;
  user.superadminPermissions = granted;
  user.customPermissions = { enabled: false, view: [], edit: [] };
  log("Changed user Superadmin permission", "Users", `${user.email || user.name}: ${granted ? "granted" : "removed"}`);
  renderUsers();
  toast(`${user.name} Superadmin permissions ${granted ? "granted" : "removed"}.`);
});
document.addEventListener("input", (event) => {
  if (/** @type {AnyEl} */ (event.target).matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target);
  if (/** @type {AnyEl} */ (event.target).matches(".transfer-lot")) updateTransferBalanceHint(closestEl(event.target, "tr"));
  comboRefresh(/** @type {AnyEl} */ (event.target));
});
document.addEventListener("blur", (event) => {
  if (/** @type {AnyEl} */ (event.target).matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target, true);
}, true);
// Custom combobox wiring — see ui-utils.js for why <input list> + <datalist> is no longer
// used directly to drive the suggestions popup.
document.addEventListener("focusin", (event) => {
  if (/** @type {AnyEl} */ (event.target).tagName === "INPUT" && (/** @type {AnyEl} */ (event.target).hasAttribute("list") || /** @type {AnyEl} */ (event.target).dataset.comboList)) comboOpen(/** @type {AnyEl} */ (event.target));
}, true);
document.addEventListener("focusout", (event) => {
  if (event.target === comboOpenInput) setTimeout(() => { if (!document.activeElement?.closest?.("#combo-dropdown")) comboClose(); }, 0);
}, true);
document.addEventListener("keydown", comboHandleKeydown);
document.addEventListener("mousedown", (event) => {
  const option = closestEl(event.target, ".combo-option");
  if (option && comboOpenInput) { event.preventDefault(); comboSelect(comboOpenInput, /** @type {string} */ (option.dataset.comboValue)); }
  else if (comboOpenInput && event.target !== comboOpenInput && !closestEl(event.target, "#combo-dropdown")) comboClose();
});
document.addEventListener("click", (event) => {
  const removeSheetRow = closestEl(event.target, ".remove-sheet-row");
  if (removeSheetRow) removeInventorySheetRow(removeSheetRow);
  const uploadCopyButton = closestEl(event.target, "[data-upload-copy]");
  if (uploadCopyButton) /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (uploadCopyButton.parentElement).querySelector(".physical-copy-input"))?.click();
  const viewFileButton = closestEl(event.target, "[data-view-file]");
  if (viewFileButton) MedlaneAPI.viewFile(/** @type {string} */ (viewFileButton.dataset.viewFile)).catch((error) => toast(error.message || "Unable to open file."));
  const viewCollectionHistory = closestEl(event.target, "[data-view-collection-history]");
  if (viewCollectionHistory) openCollectionHistoryModal(/** @type {string} */ (viewCollectionHistory.dataset.viewCollectionHistory));
  const clientHistoryTabButton = closestEl(event.target, "[data-client-history-tab]");
  if (clientHistoryTabButton) { clientHistoryTab = clientHistoryTabButton.dataset.clientHistoryTab; renderClientHistoryTabs(currentClientView || data.sales[0]?.client); }
  const purchaseHistoryMoreButton = closestEl(event.target, "[data-purchase-history-more]");
  if (purchaseHistoryMoreButton) {
    const agent = /** @type {string} */ (purchaseHistoryMoreButton.dataset.purchaseHistoryMore);
    purchaseHistoryVisibleCounts[agent] = (purchaseHistoryVisibleCounts[agent] || purchaseHistoryDefaultLimit(agent)) + purchaseHistoryDefaultLimit(agent);
    renderPurchaseHistory();
  }
});
document.addEventListener("change", (event) => {
  if (/** @type {AnyEl} */ (event.target).matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target, true);
  if (/** @type {AnyEl} */ (event.target).classList.contains("physical-copy-input") && /** @type {AnyEl} */ (event.target).files?.length) {
    const file = /** @type {AnyEl} */ (event.target).files[0];
    const { recordType, recordId, rerender, docName, clientName } = /** @type {AnyEl} */ (event.target).dataset;
    const onDone = rerender === "payment-request-detail" ? () => renderPaymentRequestDetail(recordId)
      : rerender === "client-docs-modal" ? () => refreshClientDocsModal(clientName)
      : rerender === "service-report-modal" ? () => renderServiceReportUploadSlot(recordType, recordId)
      : rerender && sectionRenderers[rerender] ? sectionRenderers[rerender] : null;
    uploadPhysicalCopy(file, recordType, recordId, docName || "Physical copy", onDone);
    /** @type {AnyEl} */ (event.target).value = "";
  }
});
qs("#total-collections-client")?.addEventListener("change", renderCollectionsTotalSummary);
qs("#total-collections-from")?.addEventListener("change", renderCollectionsTotalSummary);
qs("#total-collections-to")?.addEventListener("change", renderCollectionsTotalSummary);
qs("#total-collections-annual")?.addEventListener("click", () => { resetCollectionsTotalToAnnual(); renderCollectionsTotalSummary(); });
qs("#client-invoices-status-filter")?.addEventListener("change", renderClientInvoices);
qs("#client-invoices-from")?.addEventListener("change", renderClientInvoices);
qs("#client-invoices-to")?.addEventListener("change", renderClientInvoices);
// ---- Inventory page (redesign) — delegated handlers; markup/state in modules.js / state.js ----
/** @param {() => void} mutate @param {{ resetPage?: boolean, closeDetail?: boolean }} [options] */
function inventoryChangeView(mutate, { resetPage = true, closeDetail = false } = {}) {
  mutate();
  if (resetPage) inventoryPage = 0;
  if (closeDetail) inventorySelectedRef = null;
  renderInventory();
}
/** @param {string} key */
function inventorySetStatus(key) {
  const meta = INVENTORY_STATUS_META.find((entry) => entry.key === key);
  qs("#inventory-status").value = meta ? meta.name : "all";
  inventoryWorkflowTab = "stocks";
  inventoryChangeView(() => {}, { closeDetail: true });
}
qs("#inventory").addEventListener("click", (event) => {
  const target = /** @type {AnyEl} */ (event.target);
  const tab = closestEl(target, "[data-inventory-workflow]");
  if (tab) {
    inventoryWorkflowTab = tab.dataset.inventoryWorkflow;
    inventorySelectedRef = null;
    renderInventory();
    if (inventoryWorkflowTab === "rhist") qs("#open-stock-receipt-history")?.click();
    if (inventoryWorkflowTab === "thist") qs("#open-transfer-history")?.click();
    return;
  }
  const filter = closestEl(target, "[data-inventory-filter]");
  if (filter) return inventorySetStatus(/** @type {string} */ (filter.dataset.inventoryFilter));
  const branch = closestEl(target, "[data-inventory-branch]");
  if (branch) return inventoryChangeView(() => { inventoryBranchView = branch.dataset.inventoryBranch; if (inventoryBranchView !== "all") inventoryBranchTab = inventoryBranchView; }, { closeDetail: true });
  const sort = closestEl(target, "[data-inventory-sort]");
  if (sort) return inventoryChangeView(() => { const key = sort.dataset.inventorySort; inventorySort = { key: /** @type {any} */ (key), dir: inventorySort.key === key ? -inventorySort.dir : 1 }; });
  if (closestEl(target, "#inventory-compact-toggle")) return inventoryChangeView(() => { inventoryCompactView = !inventoryCompactView; }, { resetPage: false });
  if (closestEl(target, "#inventory-export")) return exportInventoryCsv();
  if (closestEl(target, "#inventory-prev")) return inventoryChangeView(() => { inventoryPage -= 1; }, { resetPage: false });
  if (closestEl(target, "#inventory-next")) return inventoryChangeView(() => { inventoryPage += 1; }, { resetPage: false });
  if (closestEl(target, "#inventory-clear-filters")) {
    qs("#inventory-status").value = "all";
    return inventoryChangeView(() => { inventoryBranchView = "all"; inventorySearch = ""; }, { closeDetail: true });
  }
  const select = closestEl(target, "[data-inventory-select]");
  if (select) { inventorySelectedRef = select.dataset.inventorySelect; renderInventory(); return qs("#inventory-detail")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }
  if (closestEl(target, "[data-inventory-close]")) return inventoryChangeView(() => {}, { resetPage: false, closeDetail: true });
  const transfer = closestEl(target, "[data-inventory-transfer]");
  if (transfer) return openTransferForStock(/** @type {string} */ (transfer.dataset.inventoryTransfer));
});
qs("#inventory-search").addEventListener("input", (event) => {
  clearTimeout(inventorySearchTimer);
  const value = /** @type {AnyEl} */ (event.target).value;
  inventorySearchTimer = setTimeout(() => inventoryChangeView(() => { inventorySearch = value; }, { closeDetail: true }), 150);
});
/** @type {any} */
let inventorySearchTimer = null;
qs("#inventory-area").addEventListener("change", (event) => {
  const source = qs("#branch-filter");
  source.value = /** @type {AnyEl} */ (event.target).value;
  source.dispatchEvent(new Event("change", { bubbles: true }));
});
/** @param {string} ref */
function openTransferForStock(ref) {
  const stock = stockRowByRef(ref);
  if (!stock) return toast("Stock record no longer exists.");
  renderTransferSheet();
  restoreTransferSheetDraft();
  qs("#transfer-sheet-modal").showModal();
  const from = qs("#transfer-sheet-from");
  if (from && [...from.options].some((option) => option.value === stock.branch)) { from.value = stock.branch; from.dispatchEvent(new Event("change", { bubbles: true })); }
  const row = qs("#transfer-sheet-table tbody tr:last-child");
  if (!row) return;
  /** @param {string} selector @param {any} value */
  const set = (selector, value) => { const input = /** @type {AnyEl | null} */ (row.querySelector(selector)); if (!input) return; input.value = value; input.dispatchEvent(new Event("input", { bubbles: true })); input.dispatchEvent(new Event("change", { bubbles: true })); };
  set(".transfer-code", stock.code);
  set(".transfer-lot", stock.lot || stock.serial || "");
}
function exportInventoryCsv() {
  const rows = inventorySortRows(inventoryFilteredRows().filter((m) => inventoryStatusKey === "all" || m.meta.key === inventoryStatusKey));
  if (!rows.length) return toast("No stock in the current view to export.");
  const header = ["Branch", "Brand", "Item Code", "Item Name", "Serial", "Lot", "Expiry", "Qty", "Min", "Status", "Notes"];
  downloadCsv("inventory-stock.csv", [header, ...rows.map((m) => [m.item.branch, m.item.brand, m.item.code, m.item.item, m.item.serial || "", m.item.lot || "", inventoryHasExpiry(m.item) ? m.item.expiry : "", m.item.qty, m.item.min, m.statusText, m.item.note || ""])]);
  log("Exported inventory stock (CSV)", "Inventory", `${rows.length} records`, { save: false });
}
qs("#po-workflow-tabs")?.addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-po-workflow]");
  if (!button) return;
  poWorkflowTab = button.dataset.poWorkflow;
  renderPurchaseOrders();
});
qs("#credit-invoices-workflow-tabs")?.addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-credit-workflow]");
  if (!button) return;
  creditInvoiceWorkflowTab = button.dataset.creditWorkflow;
  renderPendingCreditInvoices();
});
qs("#print-template-tabs")?.addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-pt-tab]");
  if (!button) return;
  ptActiveType = button.dataset.ptTab;
  renderPrintTemplates();
});
qs("#print-template-canvas")?.addEventListener("pointerdown", startPtDrag);
qs("#print-template-canvas")?.addEventListener("click", (event) => {
  const el = closestEl(event.target, ".pt-editable");
  if (el) selectPtFieldFromEl(el);
});
qs("#print-template-canvas")?.addEventListener("keydown", handlePtCanvasKeydown);
qs("#print-template-reset-all")?.addEventListener("click", resetPtAll);
qs("#print-template-save")?.addEventListener("click", () => savePrintTemplate());
qs("#print-template-panel")?.addEventListener("click", (event) => {
  const nudge = closestEl(event.target, "[data-pt-nudge]");
  if (nudge) {
    const step = ptStepIn;
    /** @type {Record<string, [number, number]>} */
    const map = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] };
    nudgePtSelected(...map[/** @type {string} */ (nudge.dataset.ptNudge)]);
    return;
  }
  const resetField = closestEl(event.target, "[data-pt-reset-field]");
  if (resetField) { resetPtField(/** @type {string} */ (resetField.dataset.ptResetField)); return; }
  const resetRow = closestEl(event.target, "[data-pt-reset-row]");
  if (resetRow) resetPtRow();
});
qs("#print-template-panel")?.addEventListener("input", (event) => {
  if (!ptSelectedField) return;
  const id = /** @type {AnyEl} */ (event.target).id;
  /** @param {any} v */
  const num = (v) => Number(v || 0);
  if (ptSelectedKind === "row-spacing") { if (id === "pt-input-spacing") applyPtRowOverride({ spacing: num(/** @type {AnyEl} */ (event.target).value) }); return; }
  if (ptSelectedKind === "row") {
    if (id === "pt-input-left") applyPtRowOverride({ left: num(/** @type {AnyEl} */ (event.target).value) });
    if (id === "pt-input-right") applyPtRowOverride({ right: num(/** @type {AnyEl} */ (event.target).value) });
    if (id === "pt-input-top") applyPtRowOverride({ top: num(/** @type {AnyEl} */ (event.target).value) });
    if (id === "pt-input-height") applyPtRowOverride({ height: num(/** @type {AnyEl} */ (event.target).value) });
    return;
  }
  if (id === "pt-input-left") applyPtFieldOverride(ptSelectedField, { left: num(/** @type {AnyEl} */ (event.target).value) });
  if (id === "pt-input-top") applyPtFieldOverride(ptSelectedField, { top: num(/** @type {AnyEl} */ (event.target).value) });
  if (id === "pt-input-width") applyPtFieldOverride(ptSelectedField, { width: num(/** @type {AnyEl} */ (event.target).value) });
  if (id === "pt-input-fontsize") applyPtFieldOverride(ptSelectedField, { fontSize: /** @type {AnyEl} */ (event.target).value === "" ? undefined : num(/** @type {AnyEl} */ (event.target).value) });
});
qs("#print-template-panel")?.addEventListener("change", (event) => {
  const id = /** @type {AnyEl} */ (event.target).id;
  if (id === "pt-input-align" && ptSelectedField && ptSelectedKind !== "row" && ptSelectedKind !== "row-spacing") applyPtFieldOverride(ptSelectedField, { align: /** @type {AnyEl} */ (event.target).value });
  if (id === "pt-step-select") ptStepIn = Number(/** @type {AnyEl} */ (event.target).value);
});
qs("#collections-workflow-tabs").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-collections-workflow]");
  if (!button) return;
  collectionsWorkflowTab = button.dataset.collectionsWorkflow;
  renderCollections();
});
qs("#load-more-collections-history").addEventListener("click", loadMoreCollectionsHistory);
qs("#payables-workflow-tabs").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-payables-workflow]");
  if (!button) return;
  payablesWorkflowTab = button.dataset.payablesWorkflow;
  renderPayables();
});
qs("#replenishments-workflow-tabs").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-replenishments-workflow]");
  if (!button) return;
  replenishmentsWorkflowTab = button.dataset.replenishmentsWorkflow;
  renderReplenishments();
});
qs("#replenishments-table")?.addEventListener("click", (event) => {
  const row = closestEl(event.target, "[data-expense-detail]");
  if (row) showExpenseDetail(/** @type {string} */ (row.dataset.expenseDetail));
});
qs("#po-view-toggle").addEventListener("click", (event) => {
  const btn = closestEl(event.target, "[data-po-view]");
  if (!btn) return;
  poViewMode = btn.dataset.poView;
  renderPurchaseOrders();
});
qs("#invoice-view-toggle")?.addEventListener("click", (event) => {
  const btn = closestEl(event.target, "[data-invoice-view]");
  if (!btn) return;
  invoiceViewMode = btn.dataset.invoiceView;
  renderInvoicing();
});
qs("#invoicing-type-filter")?.addEventListener("change", renderInvoicing);
qs("#item-forecast-preset-toggle")?.addEventListener("click", (event) => {
  const btn = closestEl(event.target, "[data-forecast-months]");
  if (!btn) return;
  itemForecastMonths = Number(/** @type {string} */ (btn.dataset.forecastMonths));
  renderItemForecast();
});
qs("#item-forecast-custom-months")?.addEventListener("change", (event) => {
  const value = Math.max(1, Math.min(24, Number(/** @type {AnyEl} */ (event.target).value) || 1));
  itemForecastMonths = value;
  renderItemForecast();
});
qsa("#item-forecast-brand, #item-forecast-client, #item-forecast-item, #item-forecast-division, #item-forecast-region, #item-forecast-classification").forEach((select) => select.addEventListener("change", () => {
  itemForecastFilters = {
    brand: qs("#item-forecast-brand")?.value || "",
    client: qs("#item-forecast-client")?.value || "",
    item: qs("#item-forecast-item")?.value || "",
    division: qs("#item-forecast-division")?.value || "",
    region: qs("#item-forecast-region")?.value || "",
    classification: qs("#item-forecast-classification")?.value || "",
  };
  renderItemForecast();
}));
qs("#item-forecast-item")?.addEventListener("input", () => {
  itemForecastFilters = {
    brand: qs("#item-forecast-brand")?.value || "",
    client: qs("#item-forecast-client")?.value || "",
    item: qs("#item-forecast-item")?.value || "",
    division: qs("#item-forecast-division")?.value || "",
    region: qs("#item-forecast-region")?.value || "",
    classification: qs("#item-forecast-classification")?.value || "",
  };
  renderItemForecast();
});
qs("#item-forecast-clear-filters")?.addEventListener("click", () => {
  itemForecastFilters = { brand: "", client: "", item: "", division: "", region: "", classification: "" };
  qsa("#item-forecast-brand, #item-forecast-client, #item-forecast-item, #item-forecast-division, #item-forecast-region, #item-forecast-classification").forEach((select) => { select.value = ""; });
  renderItemForecast();
});
qs("#item-forecast-print")?.addEventListener("click", () => printItemForecast());
qs("#open-stock-sheet").addEventListener("click", () => { renderStockSheet(); restoreStockSheetDraftIfMatching("", null); qs("#stock-sheet-modal").showModal(); });
qs("#open-transfer-sheet").addEventListener("click", () => { renderTransferSheet(); restoreTransferSheetDraft(); qs("#transfer-sheet-modal").showModal(); });
qs("#open-demo-request")?.addEventListener("click", () => { renderDemoRequestSheet(); qs("#demo-request-modal").showModal(); });
qs("#open-transfer-history").addEventListener("click", () => { renderInventory(); qs("#transfer-history-modal").showModal(); });
qs("#open-stock-receipt-history")?.addEventListener("click", () => { renderStockReceiptHistory(); qs("#stock-receipt-history-modal").showModal(); });
qs("#stock-receipt-history-close")?.addEventListener("click", () => qs("#stock-receipt-history-modal").close());
qs("#stock-receipt-history-cancel")?.addEventListener("click", () => qs("#stock-receipt-history-modal").close());
qs("#stock-receipt-history-table")?.addEventListener("click", (event) => {
  const detail = closestEl(event.target, "[data-stock-receipt-detail]");
  if (detail) return showStockReceiptDetail(/** @type {string} */ (detail.dataset.stockReceiptDetail));
});
qs("#stock-receipt-history-modal")?.addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "stock-receipt-history-modal") qs("#stock-receipt-history-modal").close(); });
qs("#stock-sheet-close").addEventListener("click", () => guardedDialogClose(() => qs("#stock-sheet-modal").close(), { keepsDraft: true }));
// Cancel is a deliberate "throw this away" action, so it also drops the autosaved draft — unlike
// the X/Escape guard above, which keeps the draft for next time.
qs("#stock-sheet-cancel").addEventListener("click", () => { clearStockSheetDraft(); qs("#stock-sheet-modal").close(); });
guardDialogEscape(qs("#stock-sheet-modal"), { keepsDraft: true });
qs("#add-stock-sheet-row").addEventListener("click", addStockSheetRow);
qs("#stock-sheet-modal").addEventListener("input", saveStockSheetDraft);
qs("#stock-sheet-modal").addEventListener("change", saveStockSheetDraft);
qs("#stock-sheet-modal").addEventListener("click", (event) => {
  if (closestEl(event.target, ".remove-sheet-row, #add-stock-sheet-row")) setTimeout(saveStockSheetDraft, 0);
});
qs("#transfer-sheet-close").addEventListener("click", () => guardedDialogClose(() => qs("#transfer-sheet-modal").close(), { keepsDraft: true }));
qs("#transfer-sheet-cancel").addEventListener("click", () => { clearTransferSheetDraft(); qs("#transfer-sheet-modal").close(); });
guardDialogEscape(qs("#transfer-sheet-modal"), { keepsDraft: true });
qs("#transfer-sheet-modal").addEventListener("input", saveTransferSheetDraft);
qs("#transfer-sheet-modal").addEventListener("change", saveTransferSheetDraft);
qs("#transfer-sheet-modal").addEventListener("click", (event) => {
  if (closestEl(event.target, ".remove-sheet-row, #add-transfer-sheet-row")) setTimeout(saveTransferSheetDraft, 0);
});
qs("#transfer-history-close").addEventListener("click", () => qs("#transfer-history-modal").close());
qs("#transfer-history-cancel").addEventListener("click", () => qs("#transfer-history-modal").close());
qs("#open-followup-history").addEventListener("click", () => { renderCollectionContactMap(); qs("#followup-history-modal").showModal(); });
qs("#followup-history-close").addEventListener("click", () => qs("#followup-history-modal").close());
qs("#followup-history-cancel").addEventListener("click", () => qs("#followup-history-modal").close());
qs("#add-transfer-sheet-row").addEventListener("click", addTransferSheetRow);
qs("#add-demo-line")?.addEventListener("click", addDemoRequestLine);
qs("#transfer-sheet-from")?.addEventListener("change", () => { preventSameTransferBranch("from"); qsa("#transfer-sheet-table .transfer-item").forEach((input) => syncStockSheetRow(input, true)); });
qs("#transfer-sheet-to")?.addEventListener("change", () => preventSameTransferBranch("to"));
qs("#save-stock-sheet").addEventListener("click", saveStockSheet);
qs("#save-demo-request")?.addEventListener("click", saveDemoRequest);
qs("#demo-request-close")?.addEventListener("click", () => guardedDialogClose(() => qs("#demo-request-modal")?.close()));
qs("#demo-request-cancel")?.addEventListener("click", () => qs("#demo-request-modal")?.close());
guardDialogEscape(qs("#demo-request-modal"));
qs("#stock-sheet-modal").addEventListener("change", (event) => { if (/** @type {AnyEl} */ (event.target).id === "inventory-po-receive-picker") fillStockSheetFromInventoryPo(/** @type {AnyEl} */ (event.target).value); });
qs("#save-transfer-sheet").addEventListener("click", saveTransferSheet);
qs("#demo-request-modal")?.addEventListener("input", (event) => { if (/** @type {AnyEl} */ (event.target).matches(".demo-line-code, .demo-line-item")) syncDemoRequestLine(event.target); });
qs("#demo-request-table")?.addEventListener("click", /** @returns {any} */ (event) => {
  const salesApprove = closestEl(event.target, "[data-demo-sales-approve]");
  if (salesApprove) return updateDemoRequestStatus(/** @type {string} */ (salesApprove.dataset.demoSalesApprove), "For Management Approval");
  const logisticsApprove = closestEl(event.target, "[data-demo-logistics-approve]");
  if (logisticsApprove) return updateDemoRequestStatus(/** @type {string} */ (logisticsApprove.dataset.demoLogisticsApprove), "For Management Approval");
  const managementApprove = closestEl(event.target, "[data-demo-management-approve]");
  if (managementApprove) return updateDemoRequestStatus(/** @type {string} */ (managementApprove.dataset.demoManagementApprove), "Approved");
  const returned = closestEl(event.target, "[data-demo-returned]");
  if (returned) return updateDemoRequestStatus(/** @type {string} */ (returned.dataset.demoReturned), "Returned");
  const toSales = closestEl(event.target, "[data-demo-to-sales]");
  if (toSales) return updateDemoRequestStatus(/** @type {string} */ (toSales.dataset.demoToSales), "To Sales");
});
qs("#transfer-table").addEventListener("click", (event) => {
  const dispatch = closestEl(event.target, "[data-dispatch-transfer]");
  if (dispatch) return openTransferDispatchModal(Number(/** @type {string} */ (dispatch.dataset.dispatchTransfer)));
  const receive = closestEl(event.target, "[data-receive-transfer]");
  if (receive) return openTransferReceiveModal(Number(/** @type {string} */ (receive.dataset.receiveTransfer)));
  const transferTimeline = closestEl(event.target, "[data-transfer-timeline]");
  if (transferTimeline) return showTransferTimeline(/** @type {string} */ (transferTimeline.dataset.transferTimeline));
  const transferPrint = closestEl(event.target, "[data-transfer-print]");
  if (transferPrint) return printTransferRequest(/** @type {string} */ (transferPrint.dataset.transferPrint));
});
qs("#transfer-history-table").addEventListener("click", (event) => {
  const transferTimeline = closestEl(event.target, "[data-transfer-timeline]");
  if (transferTimeline) return showTransferTimeline(/** @type {string} */ (transferTimeline.dataset.transferTimeline));
});
document.body.addEventListener("click", /** @returns {any} */ (event) => {
  const closeReview = closestEl(event.target, "[data-close-transfer-review]");
  if (closeReview) return guardedDialogClose(() => qs("#transfer-review-modal")?.close());
  const confirmDispatch = closestEl(event.target, "#confirm-transfer-dispatch");
  if (confirmDispatch) return confirmTransferDispatch();
  const confirmReceive = closestEl(event.target, "#confirm-transfer-receive");
  if (confirmReceive) return confirmTransferReceive();
});
document.body.addEventListener("input", (event) => {
  if (/** @type {AnyEl} */ (event.target).matches(".transfer-review-lot, .transfer-review-qty")) {
    const dialog = qs("#transfer-review-modal");
    const row = closestEl(event.target, ".transfer-review-row");
    if (dialog && row && /** @type {AnyEl} */ (event.target).classList.contains("transfer-review-lot")) refreshTransferDispatchModalRow(dialog, row);
  }
});
qs("#collections").addEventListener("click", (event) => {
  const statusButton = closestEl(event.target, "[data-contact-status]");
  if (statusButton) return updateCollectionContact(/** @type {string} */ (statusButton.dataset.contactClient), /** @type {string} */ (statusButton.dataset.contactStatus));
  const channelButton = closestEl(event.target, "[data-contact-channel]");
  if (channelButton) return toggleContactChannel(/** @type {string} */ (channelButton.dataset.contactClient), /** @type {string} */ (channelButton.dataset.contactChannel));
  const mapTarget = closestEl(event.target, "[data-map-region]");
  if (mapTarget) return openContactRegion(/** @type {string} */ (mapTarget.dataset.mapRegion), mapTarget.dataset.mapClient || "", false);
});
qs("#ar-tracker-tabs").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-ar-tab]");
  if (!button) return;
  arTrackerTab = button.dataset.arTab;
  renderReceivablesTracker();
});
qs("#ar-tracker-status-filter")?.addEventListener("change", (event) => {
  arTrackerStatusFilter = /** @type {AnyEl} */ (event.target).value;
  renderReceivablesTracker();
});
qs("#collections-client-search")?.addEventListener("input", (event) => {
  collectionsClientSearch = /** @type {AnyEl} */ (event.target).value;
  renderCollectionsClientHistoryPanel();
});
qs("#collections-client-search-clear")?.addEventListener("click", () => {
  collectionsClientSearch = "";
  const input = qs("#collections-client-search");
  if (input) input.value = "";
  renderCollectionsClientHistoryPanel();
});
qs("#invoice-grid").addEventListener("click", (event) => {
  const printButton = closestEl(event.target, "[data-print-invoice]");
  const detailButton = closestEl(event.target, "[data-sale-detail]");
  const cancelButton = closestEl(event.target, "[data-cancel-replace]");
  if (printButton) printInvoice(/** @type {string} */ (printButton.dataset.printInvoice));
  if (detailButton) showSaleDetail(/** @type {string} */ (detailButton.dataset.saleDetail));
  if (cancelButton) openCancelReplaceModal(/** @type {string} */ (cancelButton.dataset.cancelReplace));
});
qs("#invoice-table")?.addEventListener("click", (event) => {
  const printButton = closestEl(event.target, "[data-print-invoice]");
  const detailButton = closestEl(event.target, "[data-sale-detail]");
  const cancelButton = closestEl(event.target, "[data-cancel-replace]");
  if (printButton) printInvoice(/** @type {string} */ (printButton.dataset.printInvoice));
  if (detailButton) showSaleDetail(/** @type {string} */ (detailButton.dataset.saleDetail));
  if (cancelButton) openCancelReplaceModal(/** @type {string} */ (cancelButton.dataset.cancelReplace));
});
qs("#invoice-grid").addEventListener("change", (event) => {
  const select = closestEl(event.target, ".delivery-status-select");
  if (!select) return;
  if (!canUpdateDeliveryStatus()) return toast("Only Accounting/Superadmin/CEO can update delivery status.");
  const sale = data.sales.find((entry) => entry.id === select.dataset.saleId);
  if (!sale) return;
  sale.deliveryStatus = select.value;
  log("Updated invoice delivery status", "Invoicing", `${sale.documentNo || sale.id}: ${select.value}`);
  saveData();
  toast(`${sale.documentNo || sale.id} marked ${select.value}.`);
});
qs("#invoice-table")?.addEventListener("change", (event) => {
  const select = closestEl(event.target, ".delivery-status-select");
  if (!select) return;
  if (!canUpdateDeliveryStatus()) return toast("Only Accounting/Superadmin/CEO can update delivery status.");
  const sale = data.sales.find((entry) => entry.id === select.dataset.saleId);
  if (!sale) return;
  sale.deliveryStatus = select.value;
  log("Updated invoice delivery status", "Invoicing", `${sale.documentNo || sale.id}: ${select.value}`);
  saveData();
  toast(`${sale.documentNo || sale.id} marked ${select.value}.`);
});
qs("#sales-table").addEventListener("click", (event) => {
  const timelineButton = closestEl(event.target, "[data-sale-timeline]");
  if (timelineButton) return renderSaleDetail(/** @type {string} */ (timelineButton.dataset.saleTimeline));
  const detailButton = closestEl(event.target, "[data-sale-detail]");
  if (detailButton) showSaleDetail(/** @type {string} */ (detailButton.dataset.saleDetail));
  const row = closestEl(event.target, "tr[data-sale-row]");
  if (row && !closestEl(event.target, "button")) showSaleDetail(/** @type {string} */ (row.dataset.saleRow));
});
qs("#replenishments-table").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-approve-expense]");
  if (button) approveExpense(Number(/** @type {string} */ (button.dataset.approveExpense)), /** @type {string} */ (button.dataset.nextStatus));
});
qs("#master-table").addEventListener("click", (event) => {
  const editButton = closestEl(event.target, "[data-master-edit]");
  if (editButton) {
    if (!canEditActiveSection()) return toast("Masterlist edits need approval from Admin or Superadmin.");
    return openMasterEditModal(/** @type {string} */ (editButton.dataset.masterEdit), Number(/** @type {string} */ (editButton.dataset.index)));
  }
  const archiveButton = closestEl(event.target, "[data-master-archive]");
  if (archiveButton) return archiveMasterlistRecord(/** @type {string} */ (archiveButton.dataset.masterArchive), Number(/** @type {string} */ (archiveButton.dataset.index)));
  const restoreButton = closestEl(event.target, "[data-master-restore]");
  if (restoreButton) return restoreMasterlistRecord(/** @type {string} */ (restoreButton.dataset.masterRestore), Number(/** @type {string} */ (restoreButton.dataset.index)));
});
qs("#master-archived-toggle")?.addEventListener("click", () => {
  masterShowArchived = !masterShowArchived;
  renderMasterlists();
});
qs("#report-grid").addEventListener("click", (event) => {
  const categoryButton = closestEl(event.target, "[data-report-category]");
  if (categoryButton) {
    reportHubCategory = /** @type {string} */ (categoryButton.dataset.reportCategory);
    return renderReports();
  }
  const reportButton = closestEl(event.target, "[data-operational-report]");
  if (reportButton) return renderOperationalReport(/** @type {string} */ (reportButton.dataset.operationalReport));
  const breakdownButton = closestEl(event.target, "[data-sales-breakdown]");
  if (breakdownButton) {
    // Opening from the hub starts at the default range, the same one its card's figures use.
    qs("#sales-breakdown-date-from").value = "";
    qs("#sales-breakdown-date-to").value = "";
    renderSalesBreakdownReport(/** @type {string} */ (breakdownButton.dataset.salesBreakdown));
  }
});
qs("#report-detail-print")?.addEventListener("click", () => window.print());
qs("#report-detail-status-filter")?.addEventListener("change", () => applyOperationalReport(currentOperationalReportKey));
qs("#report-detail-date-from")?.addEventListener("change", () => applyOperationalReport(currentOperationalReportKey));
qs("#report-detail-date-to")?.addEventListener("change", () => applyOperationalReport(currentOperationalReportKey));
qs("#report-detail-clear-filters")?.addEventListener("click", () => {
  qs("#report-detail-status-filter").value = "";
  qs("#report-detail-date-from").value = "";
  qs("#report-detail-date-to").value = "";
  applyOperationalReport(currentOperationalReportKey);
});
qs("#sales-breakdown-print")?.addEventListener("click", () => window.print());
qs("#sales-breakdown-date-from")?.addEventListener("change", () => renderSalesBreakdownReport(currentSalesBreakdownDimension));
qs("#sales-breakdown-date-to")?.addEventListener("change", () => renderSalesBreakdownReport(currentSalesBreakdownDimension));
qs("#sales-breakdown-clear-dates")?.addEventListener("click", () => {
  qs("#sales-breakdown-date-from").value = "";
  qs("#sales-breakdown-date-to").value = "";
  renderSalesBreakdownReport(currentSalesBreakdownDimension);
});
qs("#reconciliation-history-table").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-recon-history]");
  if (button) applyReconciliationHistory(Number(/** @type {string} */ (button.dataset.reconHistory)));
});
qs("#reconciliation-tabs").addEventListener("click", (event) => {
  const button = closestEl(event.target, "[data-recon-tab]");
  if (!button) return;
  reconciliationTab = button.dataset.reconTab;
  renderReconciliationTabs();
});
qsa("#master-tabs .tab").forEach((button) => button.addEventListener("click", () => { data.masterTab = button.dataset.master; masterShowArchived = false; saveData(); renderMasterlists(); }));
qsa("#master-items-filter-toolbar select").forEach((select) => select.addEventListener("change", renderMasterlists));
qs("#master-items-filter-clear")?.addEventListener("click", () => {
  qsa("#master-items-filter-toolbar select").forEach((select) => { select.value = ""; });
  renderMasterlists();
});
qsa("#master-suppliers-filter-toolbar select").forEach((select) => select.addEventListener("change", renderMasterlists));
qs("#master-suppliers-filter-clear")?.addEventListener("click", () => {
  qsa("#master-suppliers-filter-toolbar select").forEach((select) => { select.value = ""; });
  renderMasterlists();
});
qsa("#analytics-tabs .tab").forEach((button) => button.addEventListener("click", () => {
  qsa("#analytics-tabs .tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  qsa(".analytics-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.analyticsPanel === button.dataset.analyticsTab));
}));
qs("#modal-form").addEventListener("submit", submitModal);
qs("#modal-fields").addEventListener("click", (event) => {
  if (closestEl(event.target, "#add-payment-request-line")) {
    const lineHtml = ["payable", "replenishment"].includes(modalType) ? financialLineTemplate({}, { vendor: modalType !== "payable", classification: modalType === "replenishment" }) : paymentRequestLineTemplate();
    qs("#payment-request-line-list").insertAdjacentHTML("beforeend", lineHtml);
    syncPaymentRequestTotal();
    syncFinancialRequestTotal();
  }
  const paymentRequestRemove = closestEl(event.target, ".remove-payment-request-line");
  if (paymentRequestRemove && qsa(".payment-request-line-row").length > 1) {
    closestEl(paymentRequestRemove, ".payment-request-line-row").remove();
    syncPaymentRequestTotal();
    syncFinancialRequestTotal();
  }
  if (closestEl(event.target, "#add-invoice-line")) {
    qs("#invoice-line-list").insertAdjacentHTML("beforeend", invoiceLineTemplate({}, { requireLot: !["purchaseOrder", "inventoryPurchaseOrder"].includes(modalType), allowDiscount: modalType === "inventoryPurchaseOrder", showCode: modalType === "inventoryPurchaseOrder" }));
    renderInvoiceComputePreview();
  }
  const remove = closestEl(event.target, ".remove-invoice-line");
  if (remove && qsa(".invoice-line-row").length > 1) {
    closestEl(remove, ".invoice-line-row").remove();
    renderInvoiceComputePreview();
  }
  if (closestEl(event.target, "#add-parameter-row")) qs("#parameter-row-list").insertAdjacentHTML("beforeend", parameterRowTemplate());
  const parameterRemove = closestEl(event.target, ".remove-parameter-row");
  if (parameterRemove && qsa(".parameter-row").length > 1) closestEl(parameterRemove, ".parameter-row").remove();
});
qs("#modal-fields").addEventListener("input", (event) => {
  if (/** @type {AnyEl} */ (event.target).hasAttribute("data-tin-input")) {
    const digits = /** @type {AnyEl} */ (event.target).value.replace(/\D/g, "").slice(0, 12);
    /** @type {AnyEl} */ (event.target).value = digits.replace(/(\d{3})(?=\d)/g, "$1-");
  }
  if (modalType === "paymentRequest" && /** @type {AnyEl} */ (event.target).classList.contains("payment-request-invoice-input")) syncPaymentRequestRowDerived(closestEl(event.target, ".payment-request-invoice-row"), { invoiceChanged: true });
  if (modalType === "paymentRequest" && /** @type {AnyEl} */ (event.target).classList.contains("payment-request-amount") && closestEl(event.target, ".payment-request-invoice-row")) syncPaymentRequestRowDerived(closestEl(event.target, ".payment-request-invoice-row"));
  if (modalType === "paymentRequest" && (closestEl(event.target, ".payment-request-line-row") || ["netAmount", "single-amount"].includes(/** @type {AnyEl} */ (event.target).id))) syncPaymentRequestTotal();
  if (["payable", "replenishment"].includes(modalType) && closestEl(event.target, ".payment-request-line-row")) syncFinancialRequestTotal();
  if (modalType === "payable" && ["withholdingTax1", "withholdingTax2"].includes(/** @type {AnyEl} */ (event.target).id)) syncFinancialRequestTotal();
  if (modalType === "paymentRequest" && /** @type {AnyEl} */ (event.target).id === "employee") { refreshPaymentRequestInvoiceRowOptions(); syncPaymentRequestDeductionDefaults(); syncPaymentRequestTotal(); }
  if (/** @type {AnyEl} */ (event.target).id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders();
  if (/** @type {AnyEl} */ (event.target).id === "po" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceFromPurchaseOrder();
  if (/** @type {AnyEl} */ (event.target).id === "sourceBranch" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceLinesForClient();
  if (/** @type {AnyEl} */ (event.target).id === "supplier" && modalType === "item") syncItemSupplierBrand();
  if (/** @type {AnyEl} */ (event.target).id === "companyName" && ["productIssue", "instrumentalServiceReport"].includes(modalType)) syncProductIssueClientAddress();
  if (/** @type {AnyEl} */ (event.target).id === "type" && modalType === "replenishment") toggleReplenishmentEmployeeField();
  if (/** @type {AnyEl} */ (event.target).id === "role" && modalType === "user") syncInviteUserPermissions();
  if (/** @type {AnyEl} */ (event.target).classList.contains("invoice-item-input")) syncInvoiceRowItem(event.target);
  if (/** @type {AnyEl} */ (event.target).classList.contains("invoice-lot-input")) syncInvoiceRowLot(event.target);
  // A date typed by hand belongs to whatever lot is on the row now, so a later lot edit that
  // matches nothing in stock won't wipe it unless the lot actually changes again.
  if (/** @type {AnyEl} */ (event.target).classList.contains("invoice-expiry-input")) /** @type {AnyEl} */ (event.target).dataset.expiryLot = /** @type {AnyEl} */ (closestEl(event.target, ".invoice-line-row")?.querySelector(".invoice-lot-input"))?.value.trim() || "";
  if (["invoice", "cancelReplace"].includes(modalType)) renderInvoiceComputePreview();
});
qs("#modal-fields").addEventListener("change", (event) => {
  if (/** @type {AnyEl} */ (event.target).name === "docsSelected") {
    const label = closestEl(event.target, ".doc-upload-button");
    if (label && /** @type {AnyEl} */ (event.target).files?.length) {
      label.classList.add("uploaded");
      label.classList.remove("missing");
      const status = label.querySelector("strong");
      if (status) status.textContent = /** @type {AnyEl} */ (event.target).files[0].name;
    }
    syncClientDocsHidden();
  }
  if (/** @type {AnyEl} */ (event.target).name === "benefitsSelected") syncEmployeeBenefitsHidden();
  if (/** @type {AnyEl} */ (event.target).classList.contains("dept-contact-input")) syncClientDepartmentContactsHidden();
  if (/** @type {AnyEl} */ (event.target).name?.endsWith("Selected") && !["docsSelected", "benefitsSelected"].includes(/** @type {AnyEl} */ (event.target).name)) syncCheckboxGroupHidden(/** @type {AnyEl} */ (event.target).name.replace(/Selected$/, ""));
  if (/** @type {AnyEl} */ (event.target).id === "status" && ["productIssue", "instrumentalServiceReport"].includes(modalType)) toggleProductIssueResolvedByField();
  if (/** @type {AnyEl} */ (event.target).id === "type" && modalType === "replenishment") toggleReplenishmentEmployeeField();
  if (/** @type {AnyEl} */ (event.target).id === "type") updateDocumentLabel();
  if (/** @type {AnyEl} */ (event.target).id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders(true);
  if (/** @type {AnyEl} */ (event.target).id === "po" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceFromPurchaseOrder();
  if (/** @type {AnyEl} */ (event.target).id === "sourceBranch" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceLinesForClient();
  if (/** @type {AnyEl} */ (event.target).id === "supplier" && modalType === "item") syncItemSupplierBrand();
  if (/** @type {AnyEl} */ (event.target).id === "skipPo" && modalType === "invoice") toggleInvoiceSkipPoField();
  if (/** @type {AnyEl} */ (event.target).id === "method" && modalType === "payable") togglePayableFields();
  if (/** @type {AnyEl} */ (event.target).id === "paymentType" && modalType === "paymentRequest") togglePaymentRequestChequeFields();
  if (modalType === "payable" && ["withholdingTax1", "withholdingTax2"].includes(/** @type {AnyEl} */ (event.target).id)) syncFinancialRequestTotal();
  if (/** @type {AnyEl} */ (event.target).id === "bank" && modalType === "paymentRequest") syncPaymentRequestBankAccount();
  if (["withholdingTax", "expandedWithholdingTax"].includes(/** @type {AnyEl} */ (event.target).id) && modalType === "paymentRequest") syncPaymentRequestTotal();
  if (modalType === "paymentRequest" && (/** @type {AnyEl} */ (event.target).classList.contains("payment-request-invoice-input") || /** @type {AnyEl} */ (event.target).classList.contains("payment-request-row-wtax") || /** @type {AnyEl} */ (event.target).classList.contains("payment-request-row-ewt"))) {
    if (/** @type {AnyEl} */ (event.target).classList.contains("payment-request-row-wtax") || /** @type {AnyEl} */ (event.target).classList.contains("payment-request-row-ewt")) syncPaymentRequestRowDerived(closestEl(event.target, ".payment-request-invoice-row"));
    syncPaymentRequestTotal();
  }
  if (/** @type {AnyEl} */ (event.target).id === "inventory-po-receive-picker") fillStockSheetFromInventoryPo(/** @type {AnyEl} */ (event.target).value);
  if (/** @type {AnyEl} */ (event.target).id === "date" && modalType === "paymentRequest") qs("#cvNo").value = nextCvNumber(cvYear(/** @type {AnyEl} */ (event.target).value));
  if (/** @type {AnyEl} */ (event.target).classList.contains("invoice-item-input")) syncInvoiceRowItem(event.target);
  if (/** @type {AnyEl} */ (event.target).classList.contains("invoice-code-input")) syncInvoiceRowFromCode(event.target);
  if (["invoice", "cancelReplace"].includes(modalType)) renderInvoiceComputePreview();
});
qs("#modal-fields").addEventListener("blur", (event) => {
  if (/** @type {AnyEl} */ (event.target).id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders(true);
  if (/** @type {AnyEl} */ (event.target).classList.contains("payment-request-classification")) enforceExpenseClassification(event.target);
}, true);
qs("#modal-close").addEventListener("click", () => {
  if (modalReadOnly) { editContext = null; qs("#demo-modal").close(); return; }
  guardedDialogClose(() => { editContext = null; editingPoId = null; qs("#demo-modal").close(); });
});
qs("#modal-cancel").addEventListener("click", () => { editContext = null; editingPoId = null; qs("#demo-modal").close(); });
qs("#demo-modal").addEventListener("cancel", (event) => {
  if (modalReadOnly) return;
  event.preventDefault();
  guardedDialogClose(() => { editContext = null; editingPoId = null; qs("#demo-modal").close(); });
});
qs("#report-preview-close").addEventListener("click", closeReportPreview);
qs("#report-preview-cancel").addEventListener("click", closeReportPreview);
qs("#report-preview-print").addEventListener("click", printReportPreview);
qs("#report-preview-print-no-date").addEventListener("click", printReportPreviewNoDate);
qs("#report-preview-template")?.addEventListener("change", (e) => changeReportPreviewTemplate(/** @type {AnyEl} */ (e.target).value));
qs("#payment-request-preview-close").addEventListener("click", () => qs("#payment-request-preview-modal").close());
qs("#payment-request-preview-cancel").addEventListener("click", () => qs("#payment-request-preview-modal").close());
qs("#payment-request-preview-print").addEventListener("click", () => window.print());
qs("#demo-modal").addEventListener("click", (event) => {
  if (/** @type {AnyEl} */ (event.target).id !== "demo-modal") return;
  if (modalReadOnly) { editContext = null; qs("#demo-modal").close(); return; }
  guardedDialogClose(() => { editContext = null; editingPoId = null; qs("#demo-modal").close(); });
});
qs("#report-preview-modal").addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "report-preview-modal") closeReportPreview(); });
qs("#payment-request-preview-modal").addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "payment-request-preview-modal") qs("#payment-request-preview-modal").close(); });
qs("#transfer-history-modal").addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "transfer-history-modal") qs("#transfer-history-modal").close(); });
qs("#followup-history-modal").addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "followup-history-modal") qs("#followup-history-modal").close(); });
qs("#branch-filter").addEventListener("change", (e) => { data.branch = /** @type {AnyEl} */ (e.target).value; saveData(); renderAll(); });
/** @type {any} */
let globalSearchRenderTimer = null;
qs("#global-search").addEventListener("input", () => {
  clearTimeout(globalSearchRenderTimer);
  globalSearchRenderTimer = setTimeout(() => renderSection(), 150);
});
qs("#dashboard-date-from").addEventListener("change", renderDashboard);
qs("#dashboard-date-to").addEventListener("change", renderDashboard);
qs("#clear-dashboard-dates").addEventListener("click", () => { qs("#dashboard-date-from").value = ""; qs("#dashboard-date-to").value = ""; renderDashboard(); toast("Dashboard date filter cleared."); });
qs("#dashboard-export-csv").addEventListener("click", exportDashboardCsv);
qs("#invoicing-export-csv")?.addEventListener("click", exportInvoicingCsv);
qs("#invoicing-export-itemized-csv")?.addEventListener("click", exportItemizedInvoicingCsv);
qs("#replenishments-export-csv")?.addEventListener("click", exportReplenishmentsCsv);
qs("#dashboard-export-pdf").addEventListener("click", printDashboardReport);
qs("#po-date-from").addEventListener("change", renderPurchaseOrders);
qs("#po-date-to").addEventListener("change", renderPurchaseOrders);
qs("#clear-po-dates").addEventListener("click", () => { qs("#po-date-from").value = ""; qs("#po-date-to").value = ""; renderPurchaseOrders(); toast("Purchase order date filter cleared."); });
qs("#inventory-status").addEventListener("change", renderInventory);
/** @type {any} */
let salesClientFilterTimer = null;
qs("#sales-client").addEventListener("input", () => {
  clearTimeout(salesClientFilterTimer);
  salesClientFilterTimer = setTimeout(renderSales, 150);
});
qs("#sales-status").addEventListener("change", renderSales);
qs("#product-issue-status").addEventListener("change", renderProductIssues);
qs("#sales-type").addEventListener("change", renderSales);
qs("#clear-sales-filters").addEventListener("click", () => {
  qs("#sales-client").value = "";
  qs("#sales-status").value = "all";
  qs("#sales-type").value = "all";
  renderSales();
  toast("Sales filters cleared.");
});
qs("#reset-demo")?.addEventListener("click", () => toast("Production reset is disabled."));
qs("#export-demo")?.addEventListener("click", () => { log("Exported summary", "Reports", "Admin summary"); renderAll(); toast("Summary export logged."); });
qs("#print-report").addEventListener("click", () => window.print());
qs("#print-analytics").addEventListener("click", () => window.print());
qs("#run-reconciliation").addEventListener("click", runReconciliationWorkflow);
qs("#recon-date-from").addEventListener("change", () => { selectedReconHistoryIndex = null; renderReconciliation(); });
qs("#recon-date-to").addEventListener("change", () => { selectedReconHistoryIndex = null; renderReconciliation(); });
qs("#recon-period").addEventListener("change", () => { selectedReconHistoryIndex = null; renderReconciliation(); });
qs("#recon-area-filter").addEventListener("change", (event) => { reconciliationAreaFilter = /** @type {AnyEl} */ (event.target).value; renderReconciliation(); });
qs("#clear-recon-dates").addEventListener("click", () => { selectedReconHistoryIndex = null; qs("#recon-date-from").value = ""; qs("#recon-date-to").value = ""; renderReconciliation(); toast("Reconciliation date scope reset."); });
qs("#clear-logs").addEventListener("click", () => { log("Attempted to clear universal audit logs", "Audit Logs", currentUser?.email || currentUser?.name || "User"); notify("Audit Logs", "Universal audit logs cannot be cleared from the app.", "logs", currentUser?.email || currentUser?.name || "User"); saveData(); renderLogs(); toast("Universal audit logs cannot be cleared from the app."); });
qs("#logs-date-from").addEventListener("change", renderLogs);
qs("#logs-date-to").addEventListener("change", renderLogs);
qs("#logs-role-filter").addEventListener("change", renderLogs);
qs("#logs-module-filter").addEventListener("change", renderLogs);
qs("#clear-log-filters").addEventListener("click", () => { qs("#logs-date-from").value = ""; qs("#logs-date-to").value = ""; qs("#logs-role-filter").value = "all"; qs("#logs-module-filter").value = "all"; renderLogs(); toast("Audit log filters cleared."); });
qs("#load-more-logs").addEventListener("click", loadMoreLogs);
qs("#logs-user-search-button").addEventListener("click", () => openUserAuditLog(qs("#logs-user-search").value));
qs("#logs-user-search").addEventListener("keydown", (event) => {
  if (event.key === "Enter") { event.preventDefault(); openUserAuditLog(qs("#logs-user-search").value); }
});
qs("#back-to-logs").addEventListener("click", () => showSection("logs"));
qs("#load-more-user-logs").addEventListener("click", loadMoreUserAuditLog);
qsa("#logs-tabs .tab").forEach((button) => button.addEventListener("click", () => {
  qsa("#logs-tabs .tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  qsa(".logs-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.logsPanel === button.dataset.logsTab));
  if (button.dataset.logsTab === "notifications") renderNotificationLogs();
}));
qs("#clear-notification-log-filters").addEventListener("click", () => { qs("#notification-logs-date-from").value = ""; qs("#notification-logs-date-to").value = ""; qs("#notification-logs-channel-filter").value = "all"; renderNotificationLogs(); toast("Filters cleared."); });
qs("#load-more-notification-logs").addEventListener("click", loadMoreNotificationLogs);
qs("#load-more-sales").addEventListener("click", loadMoreSales);
qs("#load-more-purchase-orders").addEventListener("click", loadMorePurchaseOrders);
qs("#load-more-inventory-pos").addEventListener("click", loadMoreInventoryPurchaseOrders);
qs("#load-more-transfers").addEventListener("click", loadMoreTransfers);
qs("#load-more-payables").addEventListener("click", loadMorePayables);
qs("#load-more-collections").addEventListener("click", loadMoreCollections);
qs("#load-more-payment-requests").addEventListener("click", loadMorePaymentRequests);
qs("#notification-logs-channel-filter").addEventListener("change", renderNotificationLogs);
qs("#clear-notifications").addEventListener("click", () => {
  const dismissed = new Set(data.notificationsDismissed || []);
  data.notifications.filter((notice) => notice.generated && notice.status !== "Unread").forEach((notice) => dismissed.add(`${notice.key}::${notice.record || ""}`));
  data.notificationsDismissed = [...dismissed].slice(-300);
  data.notifications = data.notifications.filter((notice) => notice.status === "Unread");
  saveData();
  renderNotifications();
  toast("Read notifications cleared.");
});
qs("#mark-all-read-notifications").addEventListener("click", () => {
  const unreadCount = data.notifications.filter((notice) => notice.status === "Unread").length;
  if (!unreadCount) return toast("No unread notifications.");
  data.notifications.forEach((notice) => { notice.status = "Read"; });
  saveData();
  renderNotifications();
  toast(`${unreadCount} notification${unreadCount === 1 ? "" : "s"} marked as read.`);
});
qs("#user-devices-close")?.addEventListener("click", () => qs("#user-devices-modal")?.close());
qs("#user-devices-modal")?.addEventListener("click", (event) => { if (/** @type {AnyEl} */ (event.target).id === "user-devices-modal") qs("#user-devices-modal")?.close(); });
qs("#refresh-user-sessions")?.addEventListener("click", () => { renderUserSessions(); toast("Device sessions refreshed."); });
qs("#refresh-backups")?.addEventListener("click", () => { renderBackup(); toast("Backups refreshed."); });
qs("#run-manual-backup")?.addEventListener("click", runManualBackup);
qs("#run-manual-digest-daily")?.addEventListener("click", () => runManualDigest("Daily"));
qs("#run-manual-digest-weekly")?.addEventListener("click", () => runManualDigest("Weekly"));
qs("#run-birthday-test")?.addEventListener("click", runManualBirthdayTest);
qs("#print-value-report")?.addEventListener("click", printSystemValueReport);
qs("#role-tester-select")?.addEventListener("change", renderRoleTester);
qs("#user-status-filter")?.addEventListener("change", (event) => { userStatusFilter = /** @type {AnyEl} */ (event.target).value; renderUsers(); });

/** @param {string} title @param {string} [detail] @param {number} [progress] @param {string} [tone] */
function setBackupStatus(title, detail = "", progress = 0, tone = "active") {
  const panel = qs("#backup-status-panel");
  if (!panel) return;
  panel.hidden = false;
  panel.classList.toggle("success", tone === "success");
  panel.classList.toggle("error", tone === "error");
  qs("#backup-status-title").textContent = title;
  qs("#backup-status-detail").textContent = detail;
  const track = panel.querySelector(".backup-progress");
  track?.classList.toggle("indeterminate", progress < 0);
  const bar = qs("#backup-progress-bar");
  if (bar && progress >= 0) bar.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
}

function clearBackupStatus(delay = 3500) {
  const panel = qs("#backup-status-panel");
  if (!panel) return;
  setTimeout(() => { panel.hidden = true; panel.classList.remove("success", "error"); }, delay);
}

async function runManualBackup() {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can run backups.");
  const button = qs("#run-manual-backup");
  const original = button?.textContent || "Run Manual Backup";
  if (button) { button.disabled = true; button.classList.add("is-loading"); button.textContent = "Running backup..."; }
  try {
    setBackupStatus("Preparing backup", "Reading current app records from Supabase...", 15);
    await new Promise((resolve) => setTimeout(resolve, 120));
    setBackupStatus("Compressing recovery point", "Creating a compressed full backup for safe restore...", 45);
    await MedlaneAPI.runBackup("manual");
    setBackupStatus("Refreshing backup list", "Backup created. Loading latest R2 recovery points...", 85);
    log("Created manual backup", "Backup", currentUser?.email || currentUser?.name || "Superadmin/CEO");
    await renderBackup();
    setBackupStatus("Backup completed", "Manual recovery point is stored in R2.", 100, "success");
    clearBackupStatus();
    toast("Manual backup created.");
  } catch (/** @type {any} */ error) {
    setBackupStatus("Backup failed", error.message || "Backup failed.", 100, "error");
    toast(error.message || "Backup failed.");
  } finally {
    if (button) { button.disabled = false; button.classList.remove("is-loading"); button.textContent = original; }
  }
}

/** @param {string} periodLabel */
async function runManualDigest(periodLabel) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can send digests.");
  const button = qs(periodLabel === "Weekly" ? "#run-manual-digest-weekly" : "#run-manual-digest-daily");
  const original = button?.textContent || `Send ${periodLabel} Digest Now`;
  if (button) { button.disabled = true; button.textContent = "Sending..."; }
  try {
    const result = await MedlaneAPI.runDigest(periodLabel);
    if (result.discord?.sent) {
      toast(`${periodLabel} digest posted to Discord.`);
    } else {
      toast(`${periodLabel} digest generated, but Discord did not post: ${result.discord?.reason || "Unknown reason"}`);
    }
    log(`Sent manual ${periodLabel.toLowerCase()} digest`, "Discord", result.discord?.sent ? "Posted to Discord" : `Not posted: ${result.discord?.reason || "Unknown reason"}`);
  } catch (/** @type {any} */ error) {
    toast(error.message || "Digest failed.");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function runManualBirthdayTest() {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can test this.");
  const button = qs("#run-birthday-test");
  const original = button?.textContent || "Send Test Birthday Greeting Now";
  if (button) { button.disabled = true; button.textContent = "Sending..."; }
  try {
    const result = await MedlaneAPI.runBirthdayGreetingTest();
    if (result.sent) {
      toast(result.test ? "Test birthday greeting posted to Discord." : `Birthday greeting posted for: ${(result.recipients || []).join(", ")}.`);
    } else {
      toast(`Discord did not post: ${result.reason || "Unknown reason"}`);
    }
    log("Sent test birthday greeting", "Discord", result.sent ? "Posted to Discord" : `Not posted: ${result.reason || "Unknown reason"}`);
  } catch (/** @type {any} */ error) {
    toast(error.message || "Birthday greeting test failed.");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

/** @param {string} id */
async function downloadBackupFile(id) {
  try {
    setBackupStatus("Preparing download", "Fetching backup metadata and R2 object...", -1);
    await MedlaneAPI.downloadBackup(id);
    log("Downloaded backup", "Backup", id);
    setBackupStatus("Download started", "Your browser is downloading the backup file.", 100, "success");
    clearBackupStatus();
    toast("Backup download started.");
  } catch (/** @type {any} */ error) {
    setBackupStatus("Download failed", error.message || "Backup download failed.", 100, "error");
    toast(error.message || "Backup download failed.");
  }
}

/** @param {string} key */
async function downloadBackupObjectFile(key) {
  try {
    setBackupStatus("Preparing R2 download", "Fetching backup object directly from R2...", -1);
    await MedlaneAPI.downloadBackupObject(key);
    log("Downloaded R2 backup object", "Backup", key);
    setBackupStatus("Download started", "Your browser is downloading the R2 backup file.", 100, "success");
    clearBackupStatus();
    toast("Backup download started.");
  } catch (/** @type {any} */ error) {
    setBackupStatus("Download failed", error.message || "Backup download failed.", 100, "error");
    toast(error.message || "Backup download failed.");
  }
}

/** @param {{ id?: string, key?: string, source?: string, created?: string, records?: string, size?: string }} ref */
async function restoreBackupFromRef(ref) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can restore backups.");
  const label = ref.key || ref.id || "backup";
  const preview = [`Source: ${ref.source || "Backup"}`, `Created: ${ref.created || "Unknown"}`, `Records: ${ref.records || "-"}`, `Size: ${ref.size || "-"}`].join("\n");
  const typed = prompt(`Restore this backup?\n\n${label}\n${preview}\n\nThis will upsert records from the backup. It will not delete current records. Before restoring, the current data is automatically saved as a "Safety Snapshot" backup so you can always revert back to it, no matter how many restores you do. Type RESTORE to continue.`);
  if (typed !== "RESTORE") return toast("Restore cancelled.");
  try {
    setBackupStatus("Restoring backup", "Saving a safety snapshot of the current data, then upserting records from the backup...", -1);
    const result = await MedlaneAPI.restoreBackup(ref);
    setBackupStatus("Reloading restored data", `${result.restore?.restoredRecords || 0} records upserted. Refreshing dashboard data...`, 85);
    log("Restored backup", "Backup", `${label} · ${result.restore?.restoredRecords || 0} records · safety snapshot ${result.restore?.preRestoreBackupKey || "saved"}`);
    await syncBackendUsers().catch(() => null);
    const fresh = await MedlaneAPI.loadAppState().catch(() => null);
    if (fresh?.data) data = normalizeData({ ...emptyProductionData(), ...fresh.data });
    writePendingSaveQueue({}); // a restore just replaced the underlying data wholesale — any queued snapshot from before it is now meaningless and must not be reapplied later
    renderAll();
    setBackupStatus("Restore completed", `${result.restore?.restoredRecords || 0} records were restored safely by upsert. The prior data was saved as a Safety Snapshot backup in case you need to revert.`, 100, "success");
    clearBackupStatus(5000);
    toast(`Restore completed: ${result.restore?.restoredRecords || 0} records upserted. Prior data saved as a Safety Snapshot.`);
  } catch (/** @type {any} */ error) {
    setBackupStatus("Restore failed", error.message || "Restore failed.", 100, "error");
    toast(error.message || "Restore failed.");
  }
}

/** @param {number} index */
function openUserSessions(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can view device sessions.");
  const user = data.users[index];
  if (!user) return toast("User not found.");
  renderUserSessions({ id: user.id || "", email: user.email || user.username || "", name: user.name || user.email || "User" });
  qs("#user-devices-modal")?.showModal();
}

/** @param {string} sessionId */
async function forceLogoutSession(sessionId) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can force logout devices.");
  if (!sessionId) return toast("Session id is missing.");
  if (!confirm("Force logout this device session?")) return;
  try {
    await MedlaneAPI.revokeUserSession(sessionId);
    log("Forced device logout", "Users", sessionId);
    await renderUserSessions();
    toast("Device session revoked.");
  } catch (/** @type {any} */ error) {
    toast(error.message || "Unable to revoke session.");
  }
}
/** @type {string | null} */
let lastImportFileName = null;
qs("#import-sample").addEventListener("click", () => {
  lastImportFileName = null;
  qs("#csv-input").value = "Year\tMonth\tOffice\tDate\tBranch\tArea\tTS/DR\tSI No.\tCLIENT\tDiscount\tInvoice Amount\tLESS TPC\tCWT\tRemarks\n2026\tJuly\tLas Pinas\t2026-07-15\tLas Pinas\tRegion IV-A\t\tSI-MIG-001\tPrimeCare Diagnostics\t0\t9408\t0\t0\tOpening AR\n2026\tJuly\tNaga\t2026-07-16\tNaga\tRegion V\tTS-MIG-002\t\tBicol Heart Lab\t0\t3500\t0\t0\tOpening AR";
  renderImportCheck();
});
qs("#csv-file-input").addEventListener("change", async (event) => {
  const file = /** @type {AnyEl} */ (event.target).files?.[0];
  if (!file) return;
  const text = await file.text().catch(() => "");
  if (!text.trim()) return toast("Could not read that file, or it was empty.");
  lastImportFileName = file.name;
  qs("#csv-input").value = text;
  renderImportCheck();
  toast(`Loaded ${file.name}. Review the preview before importing.`);
});
qs("#csv-input").addEventListener("input", () => { lastImportFileName = null; });
// Sample migration templates. Headers must keep matching detectImportKind() and the
// rowValue() labels in modules.js, or a downloaded template won't be recognized.
/** @type {Record<string, { file: string, rows: string[][] }>} */
const IMPORT_TEMPLATES = {
  clients: { file: "medlane-template-clients.csv", rows: [
    ["Code", "Name", "Customer Type", "Sales Account", "Term", "Street", "City", "Province", "Country", "Zip Code", "TIN", "Mobile", "Landline", "Fax", "Email", "Website", "Contact Person", "Contact Role", "Bank Name", "Bank Account Number", "Status"],
    ["NCR-0001", "Sample Diagnostics Center", "Direct", "Ana Cruz", "30", "123 Rizal Ave", "Quezon City", "Metro Manila", "Philippines", "1100", "123-456-789-000", "0917 000 0001", "(02) 8000 0001", "", "billing@example.com", "", "Juan Dela Cruz", "Purchasing Officer", "BDO", "001234567890", "Active"],
    ["R5-0001", "Sample Heart Lab", "Dealer", "Mika Tan", "60", "45 Magsaysay Ave", "Naga City", "Camarines Sur", "Philippines", "4400", "222-333-444-000", "0918 000 0002", "", "", "lab@example.com", "", "Maria Santos", "Lab Manager", "", "", "Active"],
  ] },
  suppliers: { file: "medlane-template-suppliers-vendors.csv", rows: [
    ["Code", "Name", "Classification", "TIN", "Address", "Country", "Mobile", "Landline", "Fax", "Email", "Website", "Contact Person", "Contact Role", "Status"],
    ["SUP-0001", "Sample Reagents Trading", "Reagent", "333-444-555-000", "Unit 5, 88 Ayala Ave, Makati City", "Philippines", "0917 000 0003", "(02) 8000 0003", "", "sales@example.com", "", "Pedro Reyes", "Account Manager", "Active"],
    ["SUP-0002", "Sample Medical Equipment Co.", "Equipment", "444-555-666-000", "1 Sample St, Singapore", "Singapore", "", "", "", "orders@example.com", "", "Lee Wong", "Sales Director", "Active"],
  ] },
  products: { file: "medlane-template-products-services.csv", rows: [
    // BRAND and ITEM CODE are optional — a blank brand stays blank; a blank code gets a NOCODE-#### placeholder.
    ["ITEM CODE", "ITEM DESCRIPTION", "BRAND", "ITEM CLASSIFICATION", "UOM"],
    ["RGT-0001", "Sample Hematology Reagent", "Sample Diagnostics", "Reagent", "kit"],
    ["SUP-0001", "Sample Vacutainer Tubes", "Sample Medical", "Supply", "box"],
    ["EQP-0001", "Sample Chemistry Analyzer", "Sample Instruments", "Equipment", "unit"],
    ["SVC-0001", "Sample Preventive Maintenance", "", "Service", "visit"],
  ] },
  // Branch is picked on the Import page (one per file), so the file has no branch column.
  // Lot No. is optional; the same product may repeat once per distinct lot.
  inventory: { file: "medlane-template-inventory-stock.csv", rows: [
    ["Product", "Lot No.", "Quantity", "Expiry Date"],
    ["RGT-0001", "HT-27-001", "25", "2027-06-30"],
    ["RGT-0001", "HT-27-002", "10", "2027-09-30"],
    ["Sample Vacutainer Tubes", "VT-1001", "100", "2027-12-31"],
    ["EQP-0001", "", "2", ""],
  ] },
  // Opening AR carries balances only (no product/qty/price columns): each row becomes one
  // "Accounts Receivable" bookkeeping line, which product/item reports already exclude.
  sales: { file: "medlane-template-sales-opening-ar.csv", rows: [
    ["Year", "Month", "Office", "Date", "Branch", "Area", "TS/DR", "SI No.", "CLIENT", "Discount", "Invoice Amount", "LESS TPC", "CWT", "Remarks"],
    ["2026", "July", "Las Pinas", "2026-07-15", "Las Pinas", "Region IV-A", "", "SI-MIG-001", "Sample Diagnostics Center", "0", "9408", "0", "0", "Opening AR"],
    ["2026", "July", "Naga", "2026-07-16", "Naga", "Region V", "TS-MIG-002", "", "Sample Heart Lab", "0", "3500", "0", "0", "Opening AR"],
  ] },
  collections: { file: "medlane-template-collections.csv", rows: [
    ["SI / TS / DR", "Receipt No.", "Amount Paid", "Method", "Bank", "Reference", "Cheque Date", "Date of Collection"],
    ["SI-MIG-001", "OR-MIG-0001", "5000", "Cheque", "BDO", "CHK-000123", "2026-08-01", "2026-08-03"],
    ["TS-MIG-002", "OR-MIG-0002", "3500", "Bank Transfer", "BPI", "REF-778899", "", "2026-08-05"],
  ] },
};
qsa("[data-import-template]").forEach((button) => button.addEventListener("click", () => {
  const template = IMPORT_TEMPLATES[button.dataset.importTemplate || ""];
  if (!template) return;
  downloadCsv(template.file, template.rows);
  toast(`Downloaded ${template.file}.`);
}));
qs("#check-import").addEventListener("click", () => { renderImportCheck(); toast("Import safety check completed."); });
qs("#import-branch")?.addEventListener("change", () => renderImportCheck());
qs("#clear-import").addEventListener("click", () => { lastImportFileName = null; qs("#csv-file-input").value = ""; qs("#csv-input").value = ""; syncImportBranchField(false); qs("#import-preview-summary").innerHTML = ""; table("#import-check-table", ["Row", "Client", "Area", "Status", "Safety Notes"], []); });
qs("#run-import").addEventListener("click", async () => {
  if (!canApproveMigrations()) return toast("Only Superadmin or CEO can approve a migration import.");
  const checked = renderImportCheck();
  const ready = checked.filter((row) => row.status === "Ready");
  if (!ready.length) return toast("No valid rows to import. Review the skipped-row warnings first.");
  const moduleLabel = /** @type {Record<string, string>} */ ({ clientsMasterlist: "Clients", suppliersMasterlist: "Suppliers/Vendors", productsMasterlist: "Products/Services", inventoryMigration: "Inventory stock" })[ready[0]?.kind] || "Records";
  const ok = await confirmDetailsModal({
    eyebrow: "Confirm Migration Import",
    title: `Import ${ready.length} ${moduleLabel} record(s)`,
    fields: [["File", lastImportFileName || "Pasted CSV/TSV"], ...(ready[0]?.kind === "inventoryMigration" ? [["Stock branch", qs("#import-branch")?.value || "-"]] : []), ["Ready rows", ready.length], ["Skipped rows", checked.length - ready.length]],
    confirmLabel: "Approve & Import",
    note: "This creates new live records. Review the preview table carefully before confirming.",
  });
  if (!ok) return;
  const progressWrap = qs("#import-progress");
  const progressLabel = qs("#import-progress-label");
  const runButton = qs("#run-import");
  runButton.disabled = true;
  if (progressLabel) progressLabel.textContent = `Importing ${ready.length} ${moduleLabel} record${ready.length === 1 ? "" : "s"}...`;
  if (progressWrap) progressWrap.hidden = false;
  try {
    const result = importCheckedRows(checked);
    const importEntry = { id: `IMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }), module: result.module, file: lastImportFileName || "Pasted CSV/TSV", records: result.records, status: result.records ? `Imported (${result.skipped || 0} skipped)` : "No valid rows", recordType: result.recordType || "", recordKeys: result.recordKeys || [], reverted: false, approvedBy: currentUser?.name || "System User" };
    data.imports.unshift(importEntry);
    if (progressLabel) progressLabel.textContent = "Saving to server...";
    const saveResult = await persistRecords({ ...(result.createdRecords || /** @type {Record<string, any>} */ ({})), imports: [importEntry] });
    if (!saveResult?.ok) return;
    log("Imported confirmed CSV/TSV rows", "Imports", `${result.records} ${result.module} records · ${result.skipped || 0} skipped`, { save: false });
    renderAll();
    toast(`${result.records} ${result.module} record/s imported; ${result.skipped || 0} skipped.`);
    lastImportFileName = null;
    qs("#csv-file-input").value = "";
  } finally {
    runButton.disabled = false;
    if (progressWrap) progressWrap.hidden = true;
  }
});
window.addEventListener("afterprint", clearPrintTarget);
window.addEventListener("beforeprint", () => {
  // Catch Cmd/Ctrl+P too, not just the in-app Print button, so long product names still get
  // shrunk to fit their pre-printed form row.
  if (document.body.classList.contains("print-template-overlay")) fitPrintTemplateRows();
});
window.addEventListener("resize", updateTableScrollHints);
document.addEventListener("scroll", (event) => { if (/** @type {AnyEl} */ (event.target)?.classList?.contains("table-card")) updateTableScrollHints(); }, true);
/** @type {any} */
let loginAutofillSubmitTimer = null;
let loginUserTyped = false;
let loginBiometricTried = false;
function isAuthenticatedRoute() {
  return Boolean(currentUser) || document.body.classList.contains("app-route");
}
function submitLoginIfReady() {
  const form = qs("#login-form");
  const email = qs("#login-email");
  const password = qs("#login-password");
  if (!form || !email || !password) return false;
  if (form.dataset.submitting === "true" || isAuthenticatedRoute()) return false;
  if (!String(email.value || "").trim() || !String(password.value || "")) return false;
  form.requestSubmit();
  return true;
}
// After the browser autofills the login — on a Mac this is the Touch ID / Keychain prompt the
// user already sees — submit for them instead of making them reach for the Login button.
function scheduleAutofillLoginSubmit() {
  const form = qs("#login-form");
  const email = qs("#login-email");
  const password = qs("#login-password");
  if (!form || !email || !password || form.dataset.submitting === "true" || isAuthenticatedRoute()) return;
  clearTimeout(loginAutofillSubmitTimer);
  let attempts = 0;
  const tick = () => {
    if (form.dataset.submitting === "true" || isAuthenticatedRoute()) return;
    attempts += 1;
    const filled = String(email.value || "").trim() && String(password.value || "");
    const autofilled = [email, password].some((input) => {
      try { return input.matches(":-webkit-autofill"); } catch { return false; }
    });
    // Any fill the user didn't type counts as an autofill — covers Safari (where :-webkit-autofill
    // on the value is unreliable) and Chrome's Google Password Manager fill.
    if (filled && (autofilled || !loginUserTyped)) { submitLoginIfReady(); return; }
    if (attempts < 12) loginAutofillSubmitTimer = setTimeout(tick, 300);
  };
  loginAutofillSubmitTimer = setTimeout(tick, 250);
}
// Chrome/Edge: proactively ask the browser for a stored password credential. This pops the
// account chooser + Touch ID prompt and, on success, signs in with no clicks at all.
async function tryBiometricLogin() {
  if (loginBiometricTried || isAuthenticatedRoute()) return;
  loginBiometricTried = true;
  if (!("credentials" in navigator) || typeof /** @type {any} */ (window).PasswordCredential !== "function") return;
  let cred;
  try {
    cred = await navigator.credentials.get(/** @type {any} */ ({ password: true, mediation: "optional" }));
  } catch { return; }
  if (!cred || cred.type !== "password") return;
  const email = qs("#login-email");
  const password = qs("#login-password");
  if (email && cred.id) email.value = cred.id;
  if (password && /** @type {any} */ (cred).password) password.value = /** @type {any} */ (cred).password;
  if (password && /** @type {any} */ (cred).password) submitLoginIfReady();
  else scheduleAutofillLoginSubmit();
}
function startLoginAutoSignIn() {
  if (isAuthenticatedRoute()) return;
  loginUserTyped = false;
  loginBiometricTried = false;
  tryBiometricLogin();
  scheduleAutofillLoginSubmit();
}
window.addEventListener("pageshow", () => setTimeout(startLoginAutoSignIn, 300));
qsa("#login-email, #login-password").forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key && event.key.length === 1) loginUserTyped = true;
  });
  input.addEventListener("change", scheduleAutofillLoginSubmit);
  input.addEventListener("input", scheduleAutofillLoginSubmit);
  input.addEventListener("animationstart", scheduleAutofillLoginSubmit);
});
qs("#login-pw-toggle")?.addEventListener("click", () => {
  const input = qs("#login-password");
  const btn = qs("#login-pw-toggle");
  if (!input || !btn) return;
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  btn.classList.toggle("is-on", show);
  btn.setAttribute("aria-pressed", String(show));
  btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  input.focus();
});
qs("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginForm = qs("#login-form");
  if (loginForm?.dataset.submitting === "true") return;
  if (loginForm) loginForm.dataset.submitting = "true";
  const loginButton = /** @type {HTMLButtonElement | null} */ (loginForm?.querySelector("button[type='submit']"));
  const originalLabel = loginButton?.textContent || "Login";
  if (loginButton) {
    loginButton.disabled = true;
    loginButton.classList.add("is-loading");
    loginButton.textContent = "Checking...";
  }
  const email = String(qs("#login-email").value || "").trim().toLowerCase();
  const password = qs("#login-password").value;
  let payload;
  try {
    payload = await MedlaneAPI.login(email, password);
  } catch (/** @type {any} */ error) {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.classList.remove("is-loading");
      loginButton.textContent = originalLabel;
    }
    if (loginForm) loginForm.dataset.submitting = "";
    return toast(error.message || "Invalid email or password.");
  }
  currentUser = payload.user;
  // Hand the credential to the browser's password manager so the next visit can offer the
  // Touch ID / Keychain prompt (and our auto-sign-in above can act on it).
  try {
    if (typeof /** @type {any} */ (window).PasswordCredential === "function" && navigator.credentials?.store) {
      navigator.credentials
        .store(new /** @type {any} */ (window).PasswordCredential({ id: email, password, name: payload.user?.name || email }))
        .catch(() => {});
    }
  } catch { /* PasswordCredential unsupported */ }
  // "Remember email" — persist just the address locally; the browser's own credential manager
  // keeps the password (the inputs carry autocomplete hints and the autofill-submit wiring above).
  if (qs("#remember-login")?.checked) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
  try {
    const serverState = await MedlaneAPI.loadAppState();
    if (!serverState.data || typeof serverState.data !== "object") throw new Error("Server returned an invalid app state.");
    serverRevision = Number(serverState.revision || 0);
    data = normalizeData({ ...emptyProductionData(), ...serverState.data });
    await ensurePendingSaveQueueHydrated();
    const discarded = prunePendingSaveQueue(serverState.resetAt);
    if (discarded.length) toast(`Discarded old unsent changes (${discarded.join(", ")}) — they were made before the latest data reset or more than 12 hours ago.`);
    applyPendingSaveQueueToLocal();
    await syncBackendUsers();
    flushPendingSaveQueue();
  } catch (/** @type {any} */ error) {
    toast(`Logged in, but server data sync failed: ${error.message}`);
  }
  localStorage.setItem("medlane-session", JSON.stringify(currentUser));
  log("Logged in", "Authentication", currentUser.role);
  if (currentUser?.email) notify("Security", `New sign-in to your account (${new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" })}).`, "notifications", "", null, currentUser.email);
  saveData(["notifications"]);
  playLoginSuccessSound();
  showWelcomeTransition(currentUser.name || currentUser.role, () => {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.classList.remove("is-loading");
      loginButton.textContent = originalLabel;
    }
    if (loginForm) loginForm.dataset.submitting = "";
    if (location.protocol !== "file:") history.replaceState(null, "", "/dashboard");
    document.body.classList.add("app-route");
    document.body.classList.remove("login-route", "public-landing");
    applyRole();
    renderAll();
    playDashboardLoginSound();
    toast(`Logged in as ${currentUser.name || currentUser.role}.`);
    maybeShowPasswordKycModal();
    startAppVersionWatch();
  });
});

qs("#login-forgot")?.addEventListener("click", async () => {
  const button = qs("#login-forgot");
  const emailInput = qs("#login-email");
  /** @type {any} */
  let email = String(emailInput?.value || "").trim().toLowerCase();
  if (!email) {
    email = String(prompt("Enter your account email and we'll send you a password reset link:") || "").trim().toLowerCase();
    if (!email) return;
    if (emailInput) emailInput.value = email;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email address first.");
  if (button?.dataset.sending === "true") return;
  const originalLabel = button?.textContent || "Forgot password?";
  if (button) { button.dataset.sending = "true"; button.disabled = true; button.textContent = "Sending..."; }
  try {
    await MedlaneAPI.forgotPassword(email);
    toast("If that email has a Medlane OS account, a password reset link is on its way. Check your inbox.");
  } catch (/** @type {any} */ error) {
    toast(error.message || "Could not start the password reset. Please try again.");
  } finally {
    if (button) { button.dataset.sending = ""; button.disabled = false; button.textContent = originalLabel; }
  }
});

function playLoginSuccessSound() {
  const audio = new Audio("/Startup Sound.mp3");
  audio.volume = 0.55;
  audio.play().catch(() => null);
}

function maybeShowPasswordKycModal() {
  if (!currentUser?.passwordKycDue) return;
  qs("#password-kyc-modal").showModal();
}
qs("#password-kyc-modal").addEventListener("cancel", (event) => event.preventDefault());
qs("#password-kyc-keep").addEventListener("click", async () => {
  try { await MedlaneAPI.keepCurrentPasswordForKyc(); }
  catch (/** @type {any} */ error) { return toast(error.message || "Could not save your choice. Please try again."); }
  currentUser.passwordKycDue = false;
  localStorage.setItem("medlane-session", JSON.stringify(currentUser));
  qs("#password-kyc-modal").close();
  log("Confirmed current password (annual check)", "Authentication", currentUser?.role || "User");
  toast("Thanks — you can keep using your current password.");
});
qs("#password-kyc-change").addEventListener("click", () => {
  qs("#password-kyc-modal").close();
  qs("#password-form").reset();
  qs("#password-modal").showModal();
});

function playDashboardLoginSound() {
  if (!currentUser || sessionStorage.getItem("medlane-dashboard-sound-played") === "1") return;
  if (!visibleNotifications().some((notice) => notice.status === "Unread")) return;
  sessionStorage.setItem("medlane-dashboard-sound-played", "1");
  const audio = new Audio("/Notification Sound.mp3");
  audio.volume = 0.55;
  audio.play().catch(() => null);
}

/** @param {string} name @param {() => void} done */
function showWelcomeTransition(name, done) {
  const overlay = qs("#welcome-transition");
  qs("#welcome-transition-name").textContent = `Welcome ${name}`;
  overlay.hidden = false;
  overlay.setAttribute("aria-hidden", "false");
  setTimeout(() => {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    done();
  }, 2950);
}

/** @param {number} index */
async function setUserPasswordPrompt(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can set passwords.");
  const user = data.users[index];
  const email = String(user?.email || "").trim().toLowerCase();
  if (!user || !email) return toast("User email is required before setting a password.");
  const password = prompt(`Set a new password for ${user.name || email}:\n\nMust be 8+ characters with a letter, a number, and a special character.`);
  if (password === null) return;
  const policyError = passwordPolicyError(password);
  if (policyError) return toast(policyError);
  if (!(await confirmFinalSave(`Set a new password for ${user.name || email}?`))) return;
  const result = /** @type {OrApiError<OkResponse>} */ (await MedlaneAPI.setUserPassword(email, password).catch((error) => ({ error })));
  if (result.error) return toast(result.error.message || "Unable to set password.");
  log("Set user password", "Users", email);
  toast(`Password set for ${user.name || email}. Share it with them securely.`);
}

/** @param {number} index */
async function copyInviteLink(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can generate invite links.");
  const user = data.users[index];
  const email = String(user?.email || "").trim().toLowerCase();
  if (!user || !email) return toast("User email is required to generate an invite link.");
  toast("Generating invite link...");
  const result = /** @type {OrApiError<InviteLinkResponse>} */ (await MedlaneAPI.getInviteLink(email).catch((error) => ({ error })));
  if (result.error) return toast(result.error.message || "Unable to generate invite link.");
  try {
    await navigator.clipboard.writeText(result.actionLink);
    toast(`Invite link copied for ${user.name || email}.`);
  } catch {
    prompt(`Copy this invite link for ${user.name || email}:`, result.actionLink);
  }
}

/** @param {string} email @param {string} token */
function openPasswordResetPage(email, token) {
  qs("#reset-email").value = email;
  qs("#reset-token").value = token;
  qs("#reset-password-email").textContent = email;
  qs("#reset-password-form").reset();
  qs("#reset-email").value = email;
  qs("#reset-token").value = token;
  qs("#reset-screen").classList.remove("hidden");
}

function authHashParams() {
  return new URLSearchParams(String(location.hash || "").replace(/^#/, ""));
}

/** @param {string} token */
function jwtEmail(token) {
  try {
    const payload = JSON.parse(atob(String(token || "").split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") || ""));
    return payload.email || "";
  } catch {
    return "";
  }
}

function showSupabasePasswordSetup() {
  const params = authHashParams();
  const accessToken = params.get("access_token");
  const type = /** @type {string} */ (params.get("type"));
  if (!accessToken || !["invite", "recovery"].includes(type)) return false;
  currentUser = null;
  localStorage.removeItem("medlane-session");
  MedlaneAPI?.setSession(null);
  const email = jwtEmail(accessToken) || "Invited account";
  openPasswordResetPage(email, `supabase:${accessToken}`);
  document.body.classList.add("login-route");
  document.body.classList.remove("public-landing", "app-route");
  qs("#login-screen")?.classList.add("hidden");
  setTimeout(() => qs("#loading-overlay")?.classList.add("hide"), 250);
  return true;
}

qs("#reset-password-cancel").addEventListener("click", () => qs("#reset-screen").classList.add("hidden"));
qsa("#reset-confirm-password, #confirm-password").forEach((input) => input.addEventListener("paste", (event) => { event.preventDefault(); toast("Paste is disabled for confirm password. Please type it manually."); }));
qs("#reset-password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const resetForm = qs("#reset-password-form");
  const values = formObject(resetForm);
  const policyError = passwordPolicyError(values.newPassword);
  if (policyError) return toast(policyError);
  if (values.newPassword !== values.confirmPassword) return toast("Confirm password does not match.");
  if (String(values.token || "").startsWith("supabase:")) {
    const submitButton = /** @type {HTMLButtonElement | null} */ (resetForm?.querySelector("button[type='submit']"));
    const originalLabel = submitButton?.textContent || "Update Password";
    if (submitButton) { submitButton.disabled = true; submitButton.classList.add("is-loading"); submitButton.textContent = "Setting password..."; }
    try {
      await MedlaneAPI.setPassword(values.token.replace(/^supabase:/, ""), values.newPassword);
      history.replaceState(null, "", "/login");
    } catch (/** @type {any} */ error) {
      return toast(error.message || "Password setup failed.");
    } finally {
      if (submitButton) { submitButton.disabled = false; submitButton.classList.remove("is-loading"); submitButton.textContent = originalLabel; }
    }
  } else {
    return toast("Password setup requires a secure Supabase invite or recovery link.");
  }
  currentUser = null;
  localStorage.removeItem("medlane-session");
  MedlaneAPI?.setSession(null);
  qs("#reset-screen").classList.add("hidden");
  qs("#login-screen").classList.remove("hidden");
  qs("#login-email").value = values.email;
  qs("#login-password").value = "";
  log("Completed password reset", "Authentication", values.email);
  toast("Password updated. You can now login.");
});
function logoutCurrentUser() {
  stopAppVersionWatch();
  stopLiveSync();
  currentUser = null;
  appInitialRenderComplete = false; // The next login draws its own notification count, branch, etc.
  localStorage.removeItem("medlane-session");
  sessionStorage.removeItem("medlane-dashboard-sound-played");
  MedlaneAPI?.setSession(null);
  document.body.classList.add("login-route");
  document.body.classList.remove("public-landing", "app-route");
  if (location.protocol !== "file:") history.replaceState(null, "", "/login");
  qs("#login-screen").classList.remove("hidden");
  restoreRememberedLogin();
}

// Deploy-freshness watchdog: a tab left open across a deploy (someone who steps away, or just
// never refreshes) would otherwise keep running whatever JS bundle it loaded at open indefinitely
// — including past a bug fix or permission-check patch. We can't just force-logout on a timer:
// that would blow away an in-progress PO/stock sheet with no warning. Instead we detect the new
// version, then wait for an actual safe point (no dialog open, nothing unsaved) before reloading.
// It's a plain reload, not a session-clearing logout — the still-valid token rehydrates on its own,
// so nobody has to type their password again just because a deploy happened.
const APP_VERSION_POLL_MS = 5 * 60 * 1000;
const APP_UPDATE_RETRY_MS = 30 * 1000;
/** @type {any} */
let appVersionTimer = null;
let appVersionKnown = "";
let appUpdatePending = false;
let appUpdateNoticeShown = false;

function isSafeToApplyAppUpdate() {
  return qsa("dialog[open]").length === 0 && Object.keys(readPendingSaveQueue()).length === 0;
}

/** @param {number} delay */
function scheduleAppVersionCheck(delay) {
  clearTimeout(appVersionTimer);
  appVersionTimer = setTimeout(runAppVersionCheck, delay);
}

async function runAppVersionCheck() {
  if (appUpdatePending) {
    if (isSafeToApplyAppUpdate()) { location.reload(); return; }
    scheduleAppVersionCheck(APP_UPDATE_RETRY_MS);
    return;
  }
  const latest = await MedlaneAPI.fetchAppVersion().catch(() => "");
  if (latest && !appVersionKnown) {
    appVersionKnown = latest;
  } else if (latest && latest !== appVersionKnown) {
    appUpdatePending = true;
    if (!appUpdateNoticeShown) {
      appUpdateNoticeShown = true;
      toast("Medlane OS was updated. It'll refresh automatically once you're not mid-edit.");
    }
    if (isSafeToApplyAppUpdate()) { location.reload(); return; }
  }
  scheduleAppVersionCheck(appUpdatePending ? APP_UPDATE_RETRY_MS : APP_VERSION_POLL_MS);
}

document.addEventListener("visibilitychange", () => {
  // Catch the "closed the laptop" / "switched tabs and forgot about it" moment quickly instead of
  // waiting out the retry interval — but still only reload if nothing is actually unsaved.
  if (document.hidden && appUpdatePending && isSafeToApplyAppUpdate()) location.reload();
});

function startAppVersionWatch() {
  startLiveSync();
  if (appVersionTimer) return;
  scheduleAppVersionCheck(APP_VERSION_POLL_MS);
}

// Live updates. The server pushes a tiny "these modules changed" ping over a WebSocket (LiveHub
// Durable Object, hibernated between messages) the instant anyone saves; this tab then pulls just
// the changed rows from /api/modules/changes. Polling remains only as a safety net: every 5 min
// while the socket is up, every 30 s while it's down. Re-rendering is deferred while a dialog is
// open or a save is in flight so it never disturbs a form mid-edit; it catches up once done.
const LIVE_FALLBACK_POLL_CONNECTED_MS = 5 * 60 * 1000;
const LIVE_FALLBACK_POLL_DISCONNECTED_MS = 30 * 1000;
const LIVE_KEEPALIVE_MS = 45 * 1000;
/** @type {any} */
let liveSyncTimer = null;
let liveSyncInFlight = false;
let liveSyncQueued = false;
let liveSyncRenderPending = false;
/** @type {any} */
let liveSyncDebounce = null;
/** @type {any} */
let liveSocket = null;
let liveSocketRetry = 0;
/** @type {any} */
let liveSocketRetryTimer = null;
/** @type {any} */
let liveKeepaliveTimer = null;
let liveSyncActive = false;
function liveSyncCanRender() {
  return qsa("dialog[open]").length === 0 && !activeSaveCount;
}
function flushLiveSyncRender() {
  if (!liveSyncRenderPending || !liveSyncCanRender() || !currentUser) return;
  liveSyncRenderPending = false;
  renderAll();
}
async function runLiveSync() {
  if (!currentUser || !navigator.onLine) return;
  if (document.hidden) { liveSyncQueued = true; return; }
  if (liveSyncInFlight) { liveSyncQueued = true; return; }
  liveSyncInFlight = true;
  liveSyncQueued = false;
  try {
    const payload = await MedlaneAPI.loadChanges().catch(() => null);
    if (payload?.rows?.length && mergeLiveChanges(payload.rows).size) liveSyncRenderPending = true;
    flushLiveSyncRender();
  } finally {
    liveSyncInFlight = false;
    if (liveSyncQueued && !document.hidden) runLiveSync();
  }
}
function scheduleLiveFallbackPoll() {
  clearTimeout(liveSyncTimer);
  if (!liveSyncActive) return;
  const connected = liveSocket?.readyState === WebSocket.OPEN;
  liveSyncTimer = setTimeout(() => { runLiveSync(); scheduleLiveFallbackPoll(); }, connected ? LIVE_FALLBACK_POLL_CONNECTED_MS : LIVE_FALLBACK_POLL_DISCONNECTED_MS);
}
function connectLiveSocket() {
  if (!liveSyncActive || liveSocket || typeof WebSocket !== "function" || location.protocol === "file:") return;
  const session = MedlaneAPI?.session();
  if (!session?.access_token) return;
  // The access token rides in the Sec-WebSocket-Protocol header (browsers can't set Authorization
  // on a WebSocket) rather than the URL, so it never lands in request logs.
  const params = new URLSearchParams();
  if (session.app_session_id) params.set("sid", session.app_session_id);
  const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/live?${params}`, ["medlane-live", session.access_token]);
  liveSocket = socket;
  socket.addEventListener("open", () => {
    liveSocketRetry = 0;
    clearInterval(liveKeepaliveTimer);
    liveKeepaliveTimer = setInterval(() => { if (socket.readyState === WebSocket.OPEN) socket.send("ping"); }, LIVE_KEEPALIVE_MS);
    runLiveSync(); // catch anything saved while we were disconnected
    scheduleLiveFallbackPoll();
  });
  socket.addEventListener("message", (event) => {
    if (event.data === "pong") return;
    // Coalesce a burst of pings (one save can touch several modules) into a single fetch.
    clearTimeout(liveSyncDebounce);
    liveSyncDebounce = setTimeout(runLiveSync, 200);
  });
  socket.addEventListener("close", () => {
    clearInterval(liveKeepaliveTimer);
    if (liveSocket === socket) liveSocket = null;
    if (!liveSyncActive) return;
    scheduleLiveFallbackPoll();
    // Back off 1s, 2s, 4s ... up to 30s. After a few failures the access token may simply have
    // expired, so nudge a refresh through a normal API call (which refreshes on 401) first.
    liveSocketRetry += 1;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(liveSocketRetry - 1, 5));
    clearTimeout(liveSocketRetryTimer);
    liveSocketRetryTimer = setTimeout(async () => {
      if (liveSocketRetry >= 3) await MedlaneAPI.me().catch(() => null);
      connectLiveSocket();
    }, delay);
  });
}
function startLiveSync() {
  if (liveSyncActive) return;
  liveSyncActive = true;
  connectLiveSocket();
  scheduleLiveFallbackPoll();
}
function stopLiveSync() {
  liveSyncActive = false;
  clearTimeout(liveSyncTimer);
  clearTimeout(liveSocketRetryTimer);
  clearTimeout(liveSyncDebounce);
  clearInterval(liveKeepaliveTimer);
  liveSyncRenderPending = false;
  liveSocketRetry = 0;
  const socket = liveSocket;
  liveSocket = null;
  try { socket?.close(1000, "logout"); } catch { /* already closed */ }
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && liveSyncActive) { runLiveSync(); if (!liveSocket) connectLiveSocket(); } });
window.addEventListener("online", () => { if (liveSyncActive && !liveSocket) connectLiveSocket(); });
document.addEventListener("close", () => setTimeout(flushLiveSyncRender, 0), true);
function stopAppVersionWatch() {
  clearTimeout(appVersionTimer);
  appVersionTimer = null;
  appVersionKnown = "";
  appUpdatePending = false;
  appUpdateNoticeShown = false;
}

const REMEMBERED_EMAIL_KEY = "medlane-remembered-email";
function restoreRememberedLogin() {
  const remembered = String(localStorage.getItem(REMEMBERED_EMAIL_KEY) || "").trim();
  const emailInput = qs("#login-email");
  const rememberBox = qs("#remember-login");
  if (rememberBox) rememberBox.checked = Boolean(remembered);
  if (remembered && emailInput && !emailInput.value) emailInput.value = remembered;
}

qs("#branch-filter").value = data.branch;
restoreRememberedLogin();
function isLoginRoute() {
  return location.pathname.replace(/\/$/, "").endsWith("/login") || new URLSearchParams(location.search).has("login");
}
function isDashboardRoute() {
  return location.pathname.replace(/\/$/, "").endsWith("/dashboard") || new URLSearchParams(location.search).has("dashboard");
}
function showAuthenticatedApp() {
  applyThemePreference(currentUser?.themePreference);
  syncThemeToggleLabel();
  const requestedSection = new URLSearchParams(location.search).get("section");
  const restoreSection = requestedSection && requestedSection !== "security" && canRestoreSection(requestedSection) ? requestedSection : "";
  if (location.protocol !== "file:") history.replaceState(null, "", restoreSection ? `/dashboard?section=${encodeURIComponent(restoreSection)}` : "/dashboard");
  document.body.classList.add("app-route");
  document.body.classList.remove("login-route", "public-landing");
  qs("#login-screen")?.classList.add("hidden");
  applyRole();
  if (restoreSection) showSection(restoreSection);
  renderAll();
  playDashboardLoginSound();
  startAppVersionWatch();
}
async function hydrateAuthenticatedSession() {
  if (!MedlaneAPI?.session()?.access_token) throw new Error("No active API session");
  const me = await MedlaneAPI.me();
  currentUser = me.user;
  localStorage.setItem("medlane-session", JSON.stringify(currentUser));
  const serverState = await MedlaneAPI.loadAppState();
  if (!serverState.data || typeof serverState.data !== "object") throw new Error("Server returned an invalid app state. Refusing to load blank data over it.");
  serverRevision = Number(serverState.revision || 0);
  data = normalizeData({ ...emptyProductionData(), ...serverState.data });
  modulePagination = serverState.pagination || /** @type {Record<string, any>} */ ({});
  await ensurePendingSaveQueueHydrated();
  const discarded = prunePendingSaveQueue(serverState.resetAt);
  if (discarded.length) toast(`Discarded old unsent changes (${discarded.join(", ")}) — they were made before the latest data reset or more than 12 hours ago.`);
  applyPendingSaveQueueToLocal();
  await syncBackendUsers();
  flushPendingSaveQueue();
}
async function initializeRoute() {
  if (showSupabasePasswordSetup()) return;
  const loginRoute = isLoginRoute();
  const dashboardRoute = isDashboardRoute();
  if (!loginRoute && !dashboardRoute) {
    if (currentUser || MedlaneAPI?.session()?.access_token) {
      try {
        await hydrateAuthenticatedSession();
        showAuthenticatedApp();
        setTimeout(() => qs("#loading-overlay")?.classList.add("hide"), 650);
        return;
      } catch {
        currentUser = null;
        localStorage.removeItem("medlane-session");
        MedlaneAPI?.setSession(null);
      }
    }
    currentUser = null;
    document.body.classList.add("public-landing");
    document.body.classList.remove("login-route", "app-route");
    qs("#login-screen")?.classList.add("hidden");
    setTimeout(() => qs("#loading-overlay")?.classList.add("hide"), 250);
    return;
  }
  if (currentUser || MedlaneAPI?.session()?.access_token) {
    try {
      await hydrateAuthenticatedSession();
      showAuthenticatedApp();
      setTimeout(() => qs("#loading-overlay")?.classList.add("hide"), 650);
      return;
    } catch {
      currentUser = null;
      localStorage.removeItem("medlane-session");
      MedlaneAPI?.setSession(null);
    }
  }
  if (dashboardRoute && location.protocol !== "file:") history.replaceState(null, "", "/login");
  else if (location.protocol !== "file:" && new URLSearchParams(location.search).has("login")) history.replaceState(null, "", "/login");
  document.body.classList.add("login-route");
  document.body.classList.remove("public-landing", "app-route");
  applyRole();
  // No renderAll() here: nobody is logged in, so it would only fire the dashboard's API calls with
  // no token, and those 401s pop a false "session expired" toast. It would also mark the first
  // render as done, leaving the render after login to redraw just one section.
  setTimeout(() => qs("#loading-overlay")?.classList.add("hide"), 650);
}
initializeRoute();

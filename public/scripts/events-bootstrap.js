data = loadData();
syncGeneratedNotifications();

window.addEventListener("online", () => flushPendingSaveQueue());
window.addEventListener("focus", () => flushPendingSaveQueue());
document.addEventListener("visibilitychange", () => { if (!document.hidden) flushPendingSaveQueue(); });
window.addEventListener("beforeunload", (event) => {
  if (!hasPendingSaveQueue() && !isSaveInFlight()) return;
  event.preventDefault();
  event.returnValue = "";
});
qs("#save-guard-dialog")?.addEventListener("cancel", (event) => event.preventDefault());

function mergeUsersFromBackend(users = []) {
  const byEmail = new Map(data.users.map((user) => [String(user.email || "").trim().toLowerCase(), user]));
  users.forEach((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return;
    const previous = byEmail.get(email) || {};
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
  const backendEmails = new Set(payload.users.map((user) => String(user.email || "").trim().toLowerCase()));
  const staleCount = data.users.filter((user) => !backendEmails.has(String(user.email || "").trim().toLowerCase())).length;
  data.users = data.users.filter((user) => backendEmails.has(String(user.email || "").trim().toLowerCase()));
  mergeUsersFromBackend(payload.users);
  if (staleCount) saveData();
}

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
  } catch (error) {
    console.error("Invite user failed", error);
    toast(`Invite failed: ${error.message || "Unable to invite user."}`);
  } finally {
    inviteInFlight = false;
  }
}

function passwordPolicyError(password) {
  const value = String(password || "");
  if (value.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(value)) return "Password must include at least one letter.";
  if (!/\d/.test(value)) return "Password must include at least one number.";
  if (!/[^A-Za-z0-9\s]/.test(value)) return "Password must include at least one special character.";
  if (/\s/.test(value)) return "Password cannot contain spaces.";
  return "";
}

async function submitModal(event) {
  event.preventDefault();
  const form = qs("#modal-form");
  if (!form) return toast("Form not found. Close and reopen the modal.");
  if (modalType === "client") syncClientDepartmentContactsHidden();
  const values = formObject(form);
  if (["invoice", "cancelReplace", "purchaseOrder", "inventoryPurchaseOrder"].includes(modalType)) {
    try { values.itemsText = collectInvoiceEditorLines(); }
    catch (error) { return toast(error.message); }
  }
  if (editContext) {
    const previous = editContext.list[editContext.index];
    const next = { ...values };
    if (modalType === "item" && next.classification) next.category = importedCategory(next.classification);
    if (modalType === "employee" && !canManageEmployeeSalary()) next.salary = editContext.list[editContext.index].salary;
    try { validateMasterRecord(modalType, next, editContext.index); }
    catch (error) { return toast(error.message); }
    if (modalType === "client") { next.creditLimit = Number(next.creditLimit); next.terms = Number(next.terms || 30); }
    if (modalType === "employee" && canManageEmployeeSalary()) next.salary = Number(next.salary || 0);
    if (modalType === "employee") next.targetSales = Number(next.targetSales || 0);
    const moduleKey = masterlistModuleKey(modalType);
    const previousKey = masterlistRecordKey(modalType, previous);
    if (!(await confirmFinalSave(`Save changes to this ${modalType}?`))) return;
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
  if (["client", "item", "bank", "supplier"].includes(modalType)) {
    if (modalType === "item" && values.classification) values.category = importedCategory(values.classification);
    try { validateMasterRecord(modalType, values); }
    catch (error) { return toast(error.message); }
  }
  if (["client", "item", "bank", "supplier", "employee"].includes(modalType)) {
    const record = modalType === "client" ? { ...values, terms: Number(values.terms || 30), creditLimit: Number(values.creditLimit), docs: values.docs || "" }
      : modalType === "employee" ? { ...values, salary: canManageEmployeeSalary() ? Number(values.salary || 0) : 0, targetSales: Number(values.targetSales || 0) }
      : values;
    const listByType = { client: data.clients, item: data.items, supplier: data.suppliers, employee: data.employees, bank: data.banks };
    const moduleKey = masterlistModuleKey(modalType);
    if (!(await confirmFinalSave(`Save this new ${modalType}?`))) return;
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
    try {
      const sale = buildSale(values);
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
    catch (error) { notify("Validation", error.message, "sales", values.documentNo || values.client || ""); saveData(); return toast(error.message); }
  }
  if (modalType === "purchaseOrder") {
    const wasEditing = Boolean(editingPoId);
    let po;
    try { po = buildPurchaseOrder(values, { editingId: editingPoId }); }
    catch (error) { notify("Validation", error.message, "purchase-orders", values.client || ""); saveData(); return toast(error.message); }
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
    try { po = buildInventoryPurchaseOrder(values); }
    catch (error) { notify("Validation", error.message, "inventory", values.supplier || ""); saveData(); return toast(error.message); }
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
    } catch (error) { deductSaleStock(oldSale); return toast(error.message); }
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
    const linkedSales = invoiceIds.map((id) => findSaleByDocumentInput(id)).filter(Boolean);
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
      preparedBy: currentUser?.name || "System User",
      preparedRole: currentUser?.role || "Accounting",
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
    data.paymentRequests.unshift(paymentRequest);
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
    data.payables.push(payable);
    const saveResult = await persistRecords({ payables: [payable] });
    if (!saveResult?.ok) return;
    log("Created payable", "Payables", `${payable.id} · ${payable.supplier || "Supplier"}`, { save: false });
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
    log("Created replenishment", "Expenses", `${replenishment.id} · ${replenishment.requester || "Requester"}`, { save: false });
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
    data.productIssues.push(values);
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
    if (data.users.some((user) => String(user.email || "").trim().toLowerCase() === email)) return toast("A user with this email already exists.");
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
  showSection(button.dataset.section, { scrollTop: true });
  if (location.protocol !== "file:") history.replaceState(null, "", `/dashboard?section=${button.dataset.section}`);
}));
document.body.addEventListener("click", (event) => {
  const modalButton = event.target.closest("[data-action='open-modal']");
  if (modalButton) {
    if (qs("#report-preview-modal")?.open) qs("#report-preview-modal").close();
    return canEditActiveSection() ? openModal(modalButton.dataset.type) : toast("Editing is disabled for this module in User Settings.");
  }
  const sortButton = event.target.closest("[data-sort-col]");
  if (sortButton) return sortTable(sortButton);
  if (!event.target.closest(".notification-menu")) { qs("#notification-popover").hidden = true; qs("#notification-toggle").setAttribute("aria-expanded", "false"); }
  if (!event.target.closest(".user-menu")) { qs("#user-popover").hidden = true; qs("#user-menu-toggle").setAttribute("aria-expanded", "false"); }
  const workflowAction = event.target.closest("[data-workflow-action]");
  if (workflowAction) return handleWorkflowAction(workflowAction.dataset.workflowAction);
  const paymentRequestPreview = event.target.closest("[data-payment-request-preview]");
  if (paymentRequestPreview) { qs("#payment-request-more-modal")?.close(); return previewPaymentRequest(paymentRequestPreview.dataset.paymentRequestPreview); }
  const paymentRequestApprove = event.target.closest("[data-payment-request-approve]");
  if (paymentRequestApprove) return approvePaymentRequest(paymentRequestApprove.dataset.paymentRequestApprove);
  const paymentRequestCancel = event.target.closest("[data-payment-request-cancel]");
  if (paymentRequestCancel) return cancelPaymentRequest(paymentRequestCancel.dataset.paymentRequestCancel);
  const paymentRequestTimeline = event.target.closest("[data-payment-request-timeline]");
  if (paymentRequestTimeline) { qs("#payment-request-more-modal")?.close(); return renderPaymentRequestDetail(paymentRequestTimeline.dataset.paymentRequestTimeline); }
  const paymentRequestMore = event.target.closest("[data-payment-request-more]");
  if (paymentRequestMore) return openPaymentRequestMoreMenu(paymentRequestMore.dataset.paymentRequestMore);
  const openPaymentRequest = event.target.closest("[data-open-payment-request]");
  if (openPaymentRequest) { closeReportPreview(); return renderPaymentRequestDetail(openPaymentRequest.dataset.openPaymentRequest); }
  const requestPreview = event.target.closest("[data-request-preview]");
  if (requestPreview) { const [type, index] = requestPreview.dataset.requestPreview.split(":"); return previewFinancialRequest(type, Number(index)); }
  const requestApprove = event.target.closest("[data-request-approve]");
  if (requestApprove) { const [type, index] = requestApprove.dataset.requestApprove.split(":"); return approveFinancialRequest(type, Number(index)); }
  const requestCancel = event.target.closest("[data-request-cancel]");
  if (requestCancel) { const [type, index] = requestCancel.dataset.requestCancel.split(":"); return cancelFinancialRequest(type, Number(index)); }
  const generate2307 = event.target.closest("[data-generate2307]");
  if (generate2307) return downloadBir2307(generate2307.dataset.generate2307);
  const viewUserSessions = event.target.closest("[data-view-user-sessions]");
  if (viewUserSessions) return openUserSessions(Number(viewUserSessions.dataset.viewUserSessions));
  const revokeSession = event.target.closest("[data-revoke-session]");
  if (revokeSession) return forceLogoutSession(revokeSession.dataset.revokeSession);
  const downloadBackup = event.target.closest("[data-download-backup]");
  if (downloadBackup) return downloadBackupFile(downloadBackup.dataset.downloadBackup);
  const downloadBackupKey = event.target.closest("[data-download-backup-key]");
  if (downloadBackupKey) return downloadBackupObjectFile(downloadBackupKey.dataset.downloadBackupKey);
  const restoreBackupId = event.target.closest("[data-restore-backup-id]");
  if (restoreBackupId) return restoreBackupFromRef({ id: restoreBackupId.dataset.restoreBackupId, created: restoreBackupId.dataset.restoreBackupCreated, records: restoreBackupId.dataset.restoreBackupRecords, size: restoreBackupId.dataset.restoreBackupSize, source: restoreBackupId.dataset.restoreBackupSource });
  const restoreBackupKey = event.target.closest("[data-restore-backup-key]");
  if (restoreBackupKey) return restoreBackupFromRef({ key: restoreBackupKey.dataset.restoreBackupKey, created: restoreBackupKey.dataset.restoreBackupCreated, records: restoreBackupKey.dataset.restoreBackupRecords, size: restoreBackupKey.dataset.restoreBackupSize, source: restoreBackupKey.dataset.restoreBackupSource });
  const confirmPayment = event.target.closest("[data-confirm-payment]");
  if (confirmPayment) { const [type, index, method] = confirmPayment.dataset.confirmPayment.split(":"); return confirmFinancialPayment(type, Number(index), method); }
  const makePaymentRequest = event.target.closest("[data-make-payment-request]");
  if (makePaymentRequest) return openPaymentRequestForInvoice(makePaymentRequest.dataset.makePaymentRequest);
  const collectionStatus = event.target.closest("[data-collection-status]");
  if (collectionStatus) { const [receiptNo, status] = collectionStatus.dataset.collectionStatus.split(":"); return updateCollectionPaymentStatus(receiptNo, status); }
  const addressButton = event.target.closest("[data-edit-branch-address]");
  if (addressButton) return editPlatformBranchAddress(addressButton.dataset.editBranchAddress);
  const removeBranchButton = event.target.closest("[data-remove-platform-branch]");
  if (removeBranchButton) return removePlatformBranch(removeBranchButton.dataset.removePlatformBranch);
  const inventoryPoPrint = event.target.closest("[data-inventory-po-print]");
  if (inventoryPoPrint) return previewInventoryPurchaseOrder(inventoryPoPrint.dataset.inventoryPoPrint);
  const inventoryPoTimeline = event.target.closest("[data-inventory-po-timeline]");
  if (inventoryPoTimeline) return renderInventoryPoDetail(inventoryPoTimeline.dataset.inventoryPoTimeline);
  const inventoryPoApprove = event.target.closest("[data-inventory-po-approve]");
  if (inventoryPoApprove) return approvePurchaseOrder(Number(inventoryPoApprove.dataset.inventoryPoApprove));
  const inventoryPoAdvance = event.target.closest("[data-inventory-po-advance]");
  if (inventoryPoAdvance) return advancePurchaseOrderStatus(Number(inventoryPoAdvance.dataset.inventoryPoAdvance));
  const inventoryPoCancel = event.target.closest("[data-inventory-po-cancel]");
  if (inventoryPoCancel) return cancelPurchaseOrder(Number(inventoryPoCancel.dataset.inventoryPoCancel));
  const inventoryPoReceive = event.target.closest("[data-inventory-po-receive]");
  if (inventoryPoReceive) { const po = data.inventoryPurchaseOrders[Number(inventoryPoReceive.dataset.inventoryPoReceive)]; if (po) openStockSheetForPo(po.id); return; }
  const stockReceiptApprove = event.target.closest("[data-stock-receipt-approve]");
  if (stockReceiptApprove) return approveStockReceipt(Number(stockReceiptApprove.dataset.stockReceiptApprove));
  const stockReceiptEdit = event.target.closest("[data-stock-receipt-edit]");
  if (stockReceiptEdit) return openStockSheetForReceiptEdit(Number(stockReceiptEdit.dataset.stockReceiptEdit));
  const stockReceiptCancel = event.target.closest("[data-stock-receipt-cancel]");
  if (stockReceiptCancel) return cancelStockReceipt(Number(stockReceiptCancel.dataset.stockReceiptCancel));
  const revertImport = event.target.closest("[data-revert-import]");
  if (revertImport) return revertImportBatch(Number(revertImport.dataset.revertImport));
  const productIssuePrint = event.target.closest("[data-product-issue-print]");
  if (productIssuePrint) return previewProductIssue(productIssuePrint.dataset.productIssuePrint);
  const productIssueTimeline = event.target.closest("[data-product-issue-timeline]");
  if (productIssueTimeline) return renderProductIssueDetail(productIssueTimeline.dataset.productIssueTimeline);
  const productIssueStatus = event.target.closest("[data-product-issue-status]");
  if (productIssueStatus) { const [issueId, issueStatus] = productIssueStatus.dataset.productIssueStatus.split(":"); return updateProductIssueStatus(issueId, issueStatus); }
  const poEditButton = event.target.closest("[data-po-edit]");
  if (poEditButton) return editPurchaseOrder(poEditButton.dataset.poEdit);
  const invoicePoButton = event.target.closest("[data-create-invoice-po]");
  if (invoicePoButton) return openInvoiceForPurchaseOrder(invoicePoButton.dataset.createInvoicePo);
  const clientInvoices = event.target.closest("[data-client-invoices]");
  if (clientInvoices) {
    const nextClient = clientInvoices.dataset.clientInvoices;
    if (nextClient !== currentClientView) {
      if (qs("#client-invoices-status-filter")) qs("#client-invoices-status-filter").value = "all";
      if (qs("#client-invoices-from")) qs("#client-invoices-from").value = "";
      if (qs("#client-invoices-to")) qs("#client-invoices-to").value = "";
    }
    currentClientView = nextClient;
    renderClientInvoices();
    return showSection("client-invoices");
  }
  const clientInvoicesExportCsv = event.target.closest("#client-invoices-export-csv");
  if (clientInvoicesExportCsv) return exportClientInvoicesCsv();
  const clientInvoicesExportPdf = event.target.closest("#client-invoices-export-pdf");
  if (clientInvoicesExportPdf) return printClientInvoicesReport();
  const clientInvoicesResetFilters = event.target.closest("#client-invoices-reset-filters");
  if (clientInvoicesResetFilters) return resetClientInvoicesFilters();
  const logDetail = event.target.closest("[data-log-detail]");
  if (logDetail) return showAuditLogDetail(Number(logDetail.dataset.logDetail));
  const createSoa = event.target.closest("[data-create-soa]");
  if (createSoa) return previewSoa(createSoa.dataset.createSoa);
  const invoiceFlow = event.target.closest("[data-invoice-flow]");
  if (invoiceFlow) return renderInvoiceFlowDetail(invoiceFlow.dataset.invoiceFlow);
  const calendarNav = event.target.closest("[data-calendar-nav]");
  if (calendarNav) {
    const widget = calendarNav.closest(".calendar-widget");
    const prefix = widget?.dataset.calendarPrefix;
    if (prefix) navigateCalendarWidget(prefix, Number(calendarNav.dataset.calendarNav));
    return;
  }
  const calendarDay = event.target.closest("[data-calendar-day]");
  if (calendarDay) {
    const widget = calendarDay.closest(".calendar-widget");
    const prefix = widget?.dataset.calendarPrefix;
    if (prefix) showCalendarDayDetail(prefix, calendarDay.dataset.calendarDay);
    return;
  }
  const target = event.target.closest("[data-go-section]");
  if (!target) return;
  const notice = event.target.closest("[data-notice-index]");
  if (notice) {
    data.notifications[Number(notice.dataset.noticeIndex)].status = "Seen";
    saveData();
    renderNotifications();
  }
  goToFocused(target.dataset.goSection, target.dataset.focusRecord || "");
  qs("#notification-popover").hidden = true;
});
qs("#notification-toggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const popover = qs("#notification-popover");
  qs("#user-popover").hidden = true;
  qs("#user-menu-toggle").setAttribute("aria-expanded", "false");
  popover.hidden = !popover.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!popover.hidden));
});
qs("#view-all-notifications").addEventListener("click", () => { qs("#notification-popover").hidden = true; qs("#notification-toggle").setAttribute("aria-expanded", "false"); showSection("notifications"); });
qs("#user-menu-toggle").addEventListener("click", (event) => {
  event.stopPropagation();
  const popover = qs("#user-popover");
  qs("#notification-popover").hidden = true;
  qs("#notification-toggle").setAttribute("aria-expanded", "false");
  popover.hidden = !popover.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!popover.hidden));
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
qs("#password-modal").addEventListener("click", (event) => { if (event.target.id === "password-modal") guardedDialogClose(() => qs("#password-modal").close()); });
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
  catch (error) { return toast(error.message || "Password update failed."); }
  event.currentTarget.reset();
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
  event.currentTarget.reset();
  log("Added branch masterlist record", "Masterlists", branch);
  notify("Settings", `${branch} was added to platform branches.`, "settings", branch);
  saveData();
  renderPlatformSettings();
  renderAll();
  toast(`${branch} added to platform branches.`);
});
document.body.addEventListener("click", (event) => {
  const openDocs = event.target.closest("[data-open-client-docs]");
  if (openDocs) return openClientDocsModal(openDocs.dataset.openClientDocs);
  const closeDocs = event.target.closest("[data-close-client-docs]");
  if (closeDocs) return qs("#client-docs-modal")?.close();
  const closeMemoCompose = event.target.closest("[data-close-memo-compose]");
  if (closeMemoCompose) return guardedDialogClose(() => qs("#memo-compose-modal")?.close());
  const submitMemo = event.target.closest("#submit-memo-compose");
  if (submitMemo) return submitMemoCompose();
});
document.addEventListener("click", (event) => {
  if (event.target.id === "client-docs-modal") qs("#client-docs-modal")?.close();
  if (event.target.id === "memo-compose-modal") guardedDialogClose(() => qs("#memo-compose-modal")?.close());
});
document.addEventListener("change", (event) => {
  if (event.target.id === "memo-audience-all") qs("#memo-audience-grid").hidden = event.target.checked;
});
qs("#post-memo-button").addEventListener("click", openMemoComposeModal);
qs("#memo-list").addEventListener("click", (event) => {
  const ack = event.target.closest("[data-acknowledge-memo]");
  if (ack) return acknowledgeMemo(ack.dataset.acknowledgeMemo);
  const print = event.target.closest("[data-print-memo]");
  if (print) return printMemo(print.dataset.printMemo);
});
qs("#platform-branch-list").addEventListener("click", (event) => {
  const addressButton = event.target.closest("[data-edit-branch-address]");
  if (addressButton) return editPlatformBranchAddress(addressButton.dataset.editBranchAddress);
  const button = event.target.closest("[data-remove-platform-branch]");
  if (button) return removePlatformBranch(button.dataset.removePlatformBranch);
});

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
  const modalByTab = { clients: "client", items: "item", suppliers: "supplier", employees: "employee", banks: "bank" };
  openModal(modalByTab[data.masterTab]);
});
qs("#users-table").addEventListener("click", async (event) => {
  const resendButton = event.target.closest("[data-resend-invite]");
  if (resendButton) return resendUserInvite(Number(resendButton.dataset.resendInvite));
  const statusButton = event.target.closest("[data-toggle-user-disabled]");
  if (statusButton) return toggleUserDisabled(Number(statusButton.dataset.toggleUserDisabled));
  const resetButton = event.target.closest("[data-reset-user-password]");
  if (resetButton) return setUserPasswordPrompt(Number(resetButton.dataset.resetUserPassword));
  const copyLinkButton = event.target.closest("[data-copy-invite-link]");
  if (copyLinkButton) return copyInviteLink(Number(copyLinkButton.dataset.copyInviteLink));
  const button = event.target.closest("[data-archive-user]");
  if (!button) return;
  if (!canManageUsers()) return toast("Only Superadmin/CEO can archive users.");
  const index = Number(button.dataset.archiveUser);
  const user = data.users[index];
  if (!user) return;
  if (String(user.email || "").trim().toLowerCase() === String(currentUser?.email || "").trim().toLowerCase()) return toast("You cannot archive your own account.");
  const reason = prompt(`Reason for archiving ${user.name || user.email}:`, "Archived by admin");
  if (!String(reason || "").trim()) return toast("Archive reason is required.");
  if (!(await confirmFinalSave(`Archive ${user.name || user.email}?`))) return;
  const result = await MedlaneAPI.setUserDisabled(user.email || user.username, true, String(reason).trim()).catch((error) => ({ error }));
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
  const result = await MedlaneAPI.setUserDisabled(user.email, disabled, reason || "").catch((error) => ({ error }));
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

async function resendUserInvite(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can resend invitations.");
  const user = data.users[index];
  if (!user?.email) return toast("User email is required.");
  const result = await MedlaneAPI.resendInvite(user.email).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to resend invite.");
  toast(result.emailDelivery?.sent ? `Invitation resent to ${user.email}.` : result.emailDelivery?.reason || "Invite link generated, but email was not sent.");
}
qs("#users-table").addEventListener("change", async (event) => {
  const checkbox = event.target.closest("[data-user-superadmin]");
  if (!checkbox) return;
  if (!canManageUsers()) { checkbox.checked = !checkbox.checked; return toast("Only Superadmin/CEO can grant Superadmin permissions."); }
  const index = Number(checkbox.dataset.userSuperadmin);
  const user = data.users[index];
  if (!user) return;
  const granted = checkbox.checked;
  if (String(user.email || "").trim().toLowerCase() === String(currentUser?.email || "").trim().toLowerCase()) {
    checkbox.checked = !granted;
    return toast("You cannot change your own Superadmin permission.");
  }
  checkbox.disabled = true;
  const result = await MedlaneAPI.setUserSuperadmin(user.email, granted).catch((error) => ({ error }));
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
  if (event.target.matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target);
});
document.addEventListener("blur", (event) => {
  if (event.target.matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target, true);
}, true);
document.addEventListener("click", (event) => {
  const removeSheetRow = event.target.closest(".remove-sheet-row");
  if (removeSheetRow) removeInventorySheetRow(removeSheetRow);
  const uploadCopyButton = event.target.closest("[data-upload-copy]");
  if (uploadCopyButton) uploadCopyButton.parentElement.querySelector(".physical-copy-input")?.click();
  const viewFileButton = event.target.closest("[data-view-file]");
  if (viewFileButton) MedlaneAPI.viewFile(viewFileButton.dataset.viewFile).catch((error) => toast(error.message || "Unable to open file."));
  const viewCollectionHistory = event.target.closest("[data-view-collection-history]");
  if (viewCollectionHistory) openCollectionHistoryModal(viewCollectionHistory.dataset.viewCollectionHistory);
  const clientHistoryTabButton = event.target.closest("[data-client-history-tab]");
  if (clientHistoryTabButton) { clientHistoryTab = clientHistoryTabButton.dataset.clientHistoryTab; renderClientHistoryTabs(currentClientView || data.sales[0]?.client); }
  const purchaseHistoryMoreButton = event.target.closest("[data-purchase-history-more]");
  if (purchaseHistoryMoreButton) {
    const agent = purchaseHistoryMoreButton.dataset.purchaseHistoryMore;
    purchaseHistoryVisibleCounts[agent] = (purchaseHistoryVisibleCounts[agent] || purchaseHistoryDefaultLimit(agent)) + purchaseHistoryDefaultLimit(agent);
    renderPurchaseHistory();
  }
});
document.addEventListener("change", (event) => {
  if (event.target.matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target, true);
  if (event.target.classList.contains("physical-copy-input") && event.target.files?.length) {
    const file = event.target.files[0];
    const { recordType, recordId, rerender, docName, clientName } = event.target.dataset;
    const onDone = rerender === "payment-request-detail" ? () => renderPaymentRequestDetail(recordId)
      : rerender === "client-docs-modal" ? () => refreshClientDocsModal(clientName)
      : rerender === "service-report-modal" ? () => renderServiceReportUploadSlot(recordType, recordId)
      : rerender && sectionRenderers[rerender] ? sectionRenderers[rerender] : null;
    uploadPhysicalCopy(file, recordType, recordId, docName || "Physical copy", onDone);
    event.target.value = "";
  }
});
qs("#total-collections-client")?.addEventListener("change", renderCollectionsTotalSummary);
qs("#total-collections-from")?.addEventListener("change", renderCollectionsTotalSummary);
qs("#total-collections-to")?.addEventListener("change", renderCollectionsTotalSummary);
qs("#total-collections-annual")?.addEventListener("click", () => { resetCollectionsTotalToAnnual(); renderCollectionsTotalSummary(); });
qs("#client-invoices-status-filter")?.addEventListener("change", renderClientInvoices);
qs("#client-invoices-from")?.addEventListener("change", renderClientInvoices);
qs("#client-invoices-to")?.addEventListener("change", renderClientInvoices);
qs("#inventory-branch-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-inventory-branch]");
  if (!button) return;
  inventoryBranchTab = button.dataset.inventoryBranch;
  renderInventory();
});
qs("#inventory-workflow-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-inventory-workflow]");
  if (!button) return;
  inventoryWorkflowTab = button.dataset.inventoryWorkflow;
  renderInventory();
});
qs("#po-workflow-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-po-workflow]");
  if (!button) return;
  poWorkflowTab = button.dataset.poWorkflow;
  renderPurchaseOrders();
});
qs("#print-template-tabs")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-pt-tab]");
  if (!button) return;
  ptActiveType = button.dataset.ptTab;
  renderPrintTemplates();
});
qs("#print-template-canvas")?.addEventListener("pointerdown", startPtDrag);
qs("#print-template-canvas")?.addEventListener("click", (event) => {
  const el = event.target.closest(".pt-editable");
  if (el) selectPtFieldFromEl(el);
});
qs("#print-template-canvas")?.addEventListener("keydown", handlePtCanvasKeydown);
qs("#print-template-reset-all")?.addEventListener("click", resetPtAll);
qs("#print-template-save")?.addEventListener("click", () => savePrintTemplate());
qs("#print-template-panel")?.addEventListener("click", (event) => {
  const nudge = event.target.closest("[data-pt-nudge]");
  if (nudge) {
    const step = ptStepIn;
    const map = { up: [0, -step], down: [0, step], left: [-step, 0], right: [step, 0] };
    nudgePtSelected(...map[nudge.dataset.ptNudge]);
    return;
  }
  const resetField = event.target.closest("[data-pt-reset-field]");
  if (resetField) { resetPtField(resetField.dataset.ptResetField); return; }
  const resetRow = event.target.closest("[data-pt-reset-row]");
  if (resetRow) resetPtRow();
});
qs("#print-template-panel")?.addEventListener("input", (event) => {
  if (!ptSelectedField) return;
  const id = event.target.id;
  const num = (v) => Number(v || 0);
  if (ptSelectedKind === "row-spacing") { if (id === "pt-input-spacing") applyPtRowOverride({ spacing: num(event.target.value) }); return; }
  if (ptSelectedKind === "row") {
    if (id === "pt-input-left") applyPtRowOverride({ left: num(event.target.value) });
    if (id === "pt-input-right") applyPtRowOverride({ right: num(event.target.value) });
    if (id === "pt-input-top") applyPtRowOverride({ top: num(event.target.value) });
    if (id === "pt-input-height") applyPtRowOverride({ height: num(event.target.value) });
    return;
  }
  if (id === "pt-input-left") applyPtFieldOverride(ptSelectedField, { left: num(event.target.value) });
  if (id === "pt-input-top") applyPtFieldOverride(ptSelectedField, { top: num(event.target.value) });
  if (id === "pt-input-width") applyPtFieldOverride(ptSelectedField, { width: num(event.target.value) });
  if (id === "pt-input-fontsize") applyPtFieldOverride(ptSelectedField, { fontSize: event.target.value === "" ? undefined : num(event.target.value) });
});
qs("#print-template-panel")?.addEventListener("change", (event) => {
  const id = event.target.id;
  if (id === "pt-input-align" && ptSelectedField && ptSelectedKind !== "row" && ptSelectedKind !== "row-spacing") applyPtFieldOverride(ptSelectedField, { align: event.target.value });
  if (id === "pt-step-select") ptStepIn = Number(event.target.value);
});
qs("#collections-workflow-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-collections-workflow]");
  if (!button) return;
  collectionsWorkflowTab = button.dataset.collectionsWorkflow;
  renderCollections();
});
qs("#load-more-collections-history").addEventListener("click", loadMoreCollectionsHistory);
qs("#payables-workflow-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-payables-workflow]");
  if (!button) return;
  payablesWorkflowTab = button.dataset.payablesWorkflow;
  renderPayables();
});
qs("#replenishments-workflow-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-replenishments-workflow]");
  if (!button) return;
  replenishmentsWorkflowTab = button.dataset.replenishmentsWorkflow;
  renderReplenishments();
});
qs("#replenishments-table")?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-expense-detail]");
  if (row) showExpenseDetail(row.dataset.expenseDetail);
});
qs("#inventory-compact-toggle").addEventListener("click", () => { inventoryCompactView = !inventoryCompactView; renderInventory(); });
qs("#po-view-toggle").addEventListener("click", (event) => {
  const btn = event.target.closest("[data-po-view]");
  if (!btn) return;
  poViewMode = btn.dataset.poView;
  renderPurchaseOrders();
});
qs("#invoice-view-toggle")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-invoice-view]");
  if (!btn) return;
  invoiceViewMode = btn.dataset.invoiceView;
  renderInvoicing();
});
qs("#item-forecast-preset-toggle")?.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-forecast-months]");
  if (!btn) return;
  itemForecastMonths = Number(btn.dataset.forecastMonths);
  renderItemForecast();
});
qs("#item-forecast-custom-months")?.addEventListener("change", (event) => {
  const value = Math.max(1, Math.min(24, Number(event.target.value) || 1));
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
  const detail = event.target.closest("[data-stock-receipt-detail]");
  if (detail) return showStockReceiptDetail(detail.dataset.stockReceiptDetail);
});
qs("#stock-receipt-history-modal")?.addEventListener("click", (event) => { if (event.target.id === "stock-receipt-history-modal") qs("#stock-receipt-history-modal").close(); });
qs("#stock-sheet-close").addEventListener("click", () => guardedDialogClose(() => qs("#stock-sheet-modal").close()));
// Cancel is a deliberate "throw this away" action, so it also drops the autosaved draft — unlike
// the X/Escape guard above, which still warns about losing changes but (now) actually keeps them.
qs("#stock-sheet-cancel").addEventListener("click", () => { clearStockSheetDraft(); qs("#stock-sheet-modal").close(); });
guardDialogEscape(qs("#stock-sheet-modal"));
qs("#add-stock-sheet-row").addEventListener("click", addStockSheetRow);
qs("#stock-sheet-modal").addEventListener("input", saveStockSheetDraft);
qs("#stock-sheet-modal").addEventListener("change", saveStockSheetDraft);
qs("#stock-sheet-modal").addEventListener("click", (event) => {
  if (event.target.closest(".remove-sheet-row, #add-stock-sheet-row")) setTimeout(saveStockSheetDraft, 0);
});
qs("#transfer-sheet-close").addEventListener("click", () => guardedDialogClose(() => qs("#transfer-sheet-modal").close()));
qs("#transfer-sheet-cancel").addEventListener("click", () => { clearTransferSheetDraft(); qs("#transfer-sheet-modal").close(); });
guardDialogEscape(qs("#transfer-sheet-modal"));
qs("#transfer-sheet-modal").addEventListener("input", saveTransferSheetDraft);
qs("#transfer-sheet-modal").addEventListener("change", saveTransferSheetDraft);
qs("#transfer-sheet-modal").addEventListener("click", (event) => {
  if (event.target.closest(".remove-sheet-row, #add-transfer-sheet-row")) setTimeout(saveTransferSheetDraft, 0);
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
qs("#stock-sheet-modal").addEventListener("change", (event) => { if (event.target.id === "inventory-po-receive-picker") fillStockSheetFromInventoryPo(event.target.value); });
qs("#save-transfer-sheet").addEventListener("click", saveTransferSheet);
qs("#demo-request-modal")?.addEventListener("input", (event) => { if (event.target.matches(".demo-line-code, .demo-line-item")) syncDemoRequestLine(event.target); });
qs("#demo-request-table")?.addEventListener("click", (event) => {
  const salesApprove = event.target.closest("[data-demo-sales-approve]");
  if (salesApprove) return updateDemoRequestStatus(salesApprove.dataset.demoSalesApprove, "For Management Approval");
  const managementApprove = event.target.closest("[data-demo-management-approve]");
  if (managementApprove) return updateDemoRequestStatus(managementApprove.dataset.demoManagementApprove, "Approved");
  const returned = event.target.closest("[data-demo-returned]");
  if (returned) return updateDemoRequestStatus(returned.dataset.demoReturned, "Returned");
  const toSales = event.target.closest("[data-demo-to-sales]");
  if (toSales) return updateDemoRequestStatus(toSales.dataset.demoToSales, "To Sales");
});
qs("#transfer-table").addEventListener("click", (event) => {
  const dispatch = event.target.closest("[data-dispatch-transfer]");
  if (dispatch) return openTransferDispatchModal(Number(dispatch.dataset.dispatchTransfer));
  const receive = event.target.closest("[data-receive-transfer]");
  if (receive) return openTransferReceiveModal(Number(receive.dataset.receiveTransfer));
  const transferTimeline = event.target.closest("[data-transfer-timeline]");
  if (transferTimeline) return showTransferTimeline(transferTimeline.dataset.transferTimeline);
  const transferPrint = event.target.closest("[data-transfer-print]");
  if (transferPrint) return printTransferRequest(transferPrint.dataset.transferPrint);
});
qs("#transfer-history-table").addEventListener("click", (event) => {
  const transferTimeline = event.target.closest("[data-transfer-timeline]");
  if (transferTimeline) return showTransferTimeline(transferTimeline.dataset.transferTimeline);
});
document.body.addEventListener("click", (event) => {
  const closeReview = event.target.closest("[data-close-transfer-review]");
  if (closeReview) return guardedDialogClose(() => qs("#transfer-review-modal")?.close());
  const confirmDispatch = event.target.closest("#confirm-transfer-dispatch");
  if (confirmDispatch) return confirmTransferDispatch();
  const confirmReceive = event.target.closest("#confirm-transfer-receive");
  if (confirmReceive) return confirmTransferReceive();
});
document.body.addEventListener("input", (event) => {
  if (event.target.matches(".transfer-review-lot, .transfer-review-qty")) {
    const dialog = qs("#transfer-review-modal");
    const row = event.target.closest(".transfer-review-row");
    if (dialog && row && event.target.classList.contains("transfer-review-lot")) refreshTransferDispatchModalRow(dialog, row);
  }
});
qs("#collections").addEventListener("click", (event) => {
  const statusButton = event.target.closest("[data-contact-status]");
  if (statusButton) return updateCollectionContact(statusButton.dataset.contactClient, statusButton.dataset.contactStatus);
  const channelButton = event.target.closest("[data-contact-channel]");
  if (channelButton) return toggleContactChannel(channelButton.dataset.contactClient, channelButton.dataset.contactChannel);
  const mapTarget = event.target.closest("[data-map-region]");
  if (mapTarget) return openContactRegion(mapTarget.dataset.mapRegion, mapTarget.dataset.mapClient || "", false);
});
qs("#ar-tracker-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-ar-tab]");
  if (!button) return;
  arTrackerTab = button.dataset.arTab;
  renderReceivablesTracker();
});
qs("#invoice-grid").addEventListener("click", (event) => {
  const printButton = event.target.closest("[data-print-invoice]");
  const detailButton = event.target.closest("[data-sale-detail]");
  const cancelButton = event.target.closest("[data-cancel-replace]");
  if (printButton) printInvoice(printButton.dataset.printInvoice);
  if (detailButton) showSaleDetail(detailButton.dataset.saleDetail);
  if (cancelButton) openCancelReplaceModal(cancelButton.dataset.cancelReplace);
});
qs("#invoice-table")?.addEventListener("click", (event) => {
  const printButton = event.target.closest("[data-print-invoice]");
  const detailButton = event.target.closest("[data-sale-detail]");
  const cancelButton = event.target.closest("[data-cancel-replace]");
  if (printButton) printInvoice(printButton.dataset.printInvoice);
  if (detailButton) showSaleDetail(detailButton.dataset.saleDetail);
  if (cancelButton) openCancelReplaceModal(cancelButton.dataset.cancelReplace);
});
qs("#invoice-grid").addEventListener("change", (event) => {
  const select = event.target.closest(".delivery-status-select");
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
  const select = event.target.closest(".delivery-status-select");
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
  const timelineButton = event.target.closest("[data-sale-timeline]");
  if (timelineButton) return renderSaleDetail(timelineButton.dataset.saleTimeline);
  const detailButton = event.target.closest("[data-sale-detail]");
  if (detailButton) showSaleDetail(detailButton.dataset.saleDetail);
  const row = event.target.closest("tr[data-sale-row]");
  if (row && !event.target.closest("button")) showSaleDetail(row.dataset.saleRow);
});
qs("#replenishments-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-approve-expense]");
  if (button) approveExpense(Number(button.dataset.approveExpense), button.dataset.nextStatus);
});
qs("#master-table").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-master-edit]");
  if (editButton) {
    if (!canEditActiveSection()) return toast("Masterlist edits need approval from Admin or Superadmin.");
    return openMasterEditModal(editButton.dataset.masterEdit, Number(editButton.dataset.index));
  }
  const archiveButton = event.target.closest("[data-master-archive]");
  if (archiveButton) return archiveMasterlistRecord(archiveButton.dataset.masterArchive, Number(archiveButton.dataset.index));
  const restoreButton = event.target.closest("[data-master-restore]");
  if (restoreButton) return restoreMasterlistRecord(restoreButton.dataset.masterRestore, Number(restoreButton.dataset.index));
});
qs("#master-archived-toggle")?.addEventListener("click", () => {
  masterShowArchived = !masterShowArchived;
  renderMasterlists();
});
qs("#report-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-report-preview]");
  if (button) renderReportPage(Number(button.dataset.reportPreview));
});
qs("#report-page-detail").addEventListener("click", (event) => {
  if (event.target.closest("#print-report-inline")) window.print();
});
qs("#reconciliation-history-table").addEventListener("click", (event) => {
  const button = event.target.closest("[data-recon-history]");
  if (button) applyReconciliationHistory(Number(button.dataset.reconHistory));
});
qs("#reconciliation-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-recon-tab]");
  if (!button) return;
  reconciliationTab = button.dataset.reconTab;
  renderReconciliationTabs();
});
qsa("#master-tabs .tab").forEach((button) => button.addEventListener("click", () => { data.masterTab = button.dataset.master; masterShowArchived = false; saveData(); renderMasterlists(); }));
qsa("#analytics-tabs .tab").forEach((button) => button.addEventListener("click", () => {
  qsa("#analytics-tabs .tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  qsa(".analytics-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.analyticsPanel === button.dataset.analyticsTab));
}));
qs("#modal-form").addEventListener("submit", submitModal);
qs("#modal-fields").addEventListener("click", (event) => {
  if (event.target.closest("#add-payment-request-line")) {
    const lineHtml = ["payable", "replenishment"].includes(modalType) ? financialLineTemplate({}, { vendor: modalType !== "payable", classification: modalType === "replenishment" }) : paymentRequestLineTemplate();
    qs("#payment-request-line-list").insertAdjacentHTML("beforeend", lineHtml);
    syncPaymentRequestTotal();
    syncFinancialRequestTotal();
  }
  const paymentRequestRemove = event.target.closest(".remove-payment-request-line");
  if (paymentRequestRemove && qsa(".payment-request-line-row").length > 1) {
    paymentRequestRemove.closest(".payment-request-line-row").remove();
    syncPaymentRequestTotal();
    syncFinancialRequestTotal();
  }
  if (event.target.closest("#add-invoice-line")) {
    qs("#invoice-line-list").insertAdjacentHTML("beforeend", invoiceLineTemplate({}, { requireLot: modalType !== "purchaseOrder", allowDiscount: modalType === "inventoryPurchaseOrder" }));
    renderInvoiceComputePreview();
  }
  const remove = event.target.closest(".remove-invoice-line");
  if (remove && qsa(".invoice-line-row").length > 1) {
    remove.closest(".invoice-line-row").remove();
    renderInvoiceComputePreview();
  }
  if (event.target.closest("#add-parameter-row")) qs("#parameter-row-list").insertAdjacentHTML("beforeend", parameterRowTemplate());
  const parameterRemove = event.target.closest(".remove-parameter-row");
  if (parameterRemove && qsa(".parameter-row").length > 1) parameterRemove.closest(".parameter-row").remove();
});
qs("#modal-fields").addEventListener("input", (event) => {
  if (event.target.hasAttribute("data-tin-input")) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
    event.target.value = digits.replace(/(\d{3})(?=\d)/g, "$1-");
  }
  if (modalType === "paymentRequest" && event.target.classList.contains("payment-request-invoice-input")) syncPaymentRequestRowDerived(event.target.closest(".payment-request-invoice-row"), { invoiceChanged: true });
  if (modalType === "paymentRequest" && event.target.classList.contains("payment-request-amount") && event.target.closest(".payment-request-invoice-row")) syncPaymentRequestRowDerived(event.target.closest(".payment-request-invoice-row"));
  if (modalType === "paymentRequest" && (event.target.closest(".payment-request-line-row") || ["netAmount", "single-amount"].includes(event.target.id))) syncPaymentRequestTotal();
  if (["payable", "replenishment"].includes(modalType) && event.target.closest(".payment-request-line-row")) syncFinancialRequestTotal();
  if (modalType === "payable" && ["withholdingTax1", "withholdingTax2"].includes(event.target.id)) syncFinancialRequestTotal();
  if (modalType === "paymentRequest" && event.target.id === "employee") { refreshPaymentRequestInvoiceRowOptions(); syncPaymentRequestDeductionDefaults(); syncPaymentRequestTotal(); }
  if (event.target.id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders();
  if (event.target.id === "po" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceFromPurchaseOrder();
  if (event.target.id === "sourceBranch" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceLinesForClient();
  if (event.target.id === "supplier" && modalType === "item") syncItemSupplierBrand();
  if (event.target.id === "companyName" && ["productIssue", "instrumentalServiceReport"].includes(modalType)) syncProductIssueClientAddress();
  if (event.target.id === "type" && modalType === "replenishment") toggleReplenishmentEmployeeField();
  if (event.target.id === "role" && modalType === "user") syncInviteUserPermissions();
  if (event.target.classList.contains("invoice-item-input")) syncInvoiceRowItem(event.target);
  if (event.target.classList.contains("invoice-lot-input")) syncInvoiceRowLot(event.target);
  if (["invoice", "cancelReplace"].includes(modalType)) renderInvoiceComputePreview();
});
qs("#modal-fields").addEventListener("change", (event) => {
  if (event.target.name === "docsSelected") {
    const label = event.target.closest(".doc-upload-button");
    if (label && event.target.files?.length) {
      label.classList.add("uploaded");
      label.classList.remove("missing");
      const status = label.querySelector("strong");
      if (status) status.textContent = event.target.files[0].name;
    }
    syncClientDocsHidden();
  }
  if (event.target.name === "benefitsSelected") syncEmployeeBenefitsHidden();
  if (event.target.classList.contains("dept-contact-input")) syncClientDepartmentContactsHidden();
  if (event.target.name?.endsWith("Selected") && !["docsSelected", "benefitsSelected"].includes(event.target.name)) syncCheckboxGroupHidden(event.target.name.replace(/Selected$/, ""));
  if (event.target.id === "status" && ["productIssue", "instrumentalServiceReport"].includes(modalType)) toggleProductIssueResolvedByField();
  if (event.target.id === "type" && modalType === "replenishment") toggleReplenishmentEmployeeField();
  if (event.target.id === "type") updateDocumentLabel();
  if (event.target.id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders(true);
  if (event.target.id === "po" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceFromPurchaseOrder();
  if (event.target.id === "sourceBranch" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceLinesForClient();
  if (event.target.id === "supplier" && modalType === "item") syncItemSupplierBrand();
  if (event.target.id === "method" && modalType === "payable") togglePayableFields();
  if (event.target.id === "paymentType" && modalType === "paymentRequest") togglePaymentRequestChequeFields();
  if (modalType === "payable" && ["withholdingTax1", "withholdingTax2"].includes(event.target.id)) syncFinancialRequestTotal();
  if (event.target.id === "bank" && modalType === "paymentRequest") syncPaymentRequestBankAccount();
  if (["withholdingTax", "expandedWithholdingTax"].includes(event.target.id) && modalType === "paymentRequest") syncPaymentRequestTotal();
  if (modalType === "paymentRequest" && (event.target.classList.contains("payment-request-invoice-input") || event.target.classList.contains("payment-request-row-wtax") || event.target.classList.contains("payment-request-row-ewt"))) {
    if (event.target.classList.contains("payment-request-row-wtax") || event.target.classList.contains("payment-request-row-ewt")) syncPaymentRequestRowDerived(event.target.closest(".payment-request-invoice-row"));
    syncPaymentRequestTotal();
  }
  if (event.target.id === "inventory-po-receive-picker") fillStockSheetFromInventoryPo(event.target.value);
  if (event.target.id === "date" && modalType === "paymentRequest") qs("#cvNo").value = nextCvNumber(cvYear(event.target.value));
  if (event.target.classList.contains("invoice-item-input")) syncInvoiceRowItem(event.target);
  if (["invoice", "cancelReplace"].includes(modalType)) renderInvoiceComputePreview();
});
qs("#modal-fields").addEventListener("blur", (event) => {
  if (event.target.id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders(true);
  if (event.target.classList.contains("payment-request-classification")) enforceExpenseClassification(event.target);
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
qs("#report-preview-template")?.addEventListener("change", (e) => changeReportPreviewTemplate(e.target.value));
qs("#payment-request-preview-close").addEventListener("click", () => qs("#payment-request-preview-modal").close());
qs("#payment-request-preview-cancel").addEventListener("click", () => qs("#payment-request-preview-modal").close());
qs("#payment-request-preview-print").addEventListener("click", () => window.print());
qs("#demo-modal").addEventListener("click", (event) => {
  if (event.target.id !== "demo-modal") return;
  if (modalReadOnly) { editContext = null; qs("#demo-modal").close(); return; }
  guardedDialogClose(() => { editContext = null; editingPoId = null; qs("#demo-modal").close(); });
});
qs("#report-preview-modal").addEventListener("click", (event) => { if (event.target.id === "report-preview-modal") closeReportPreview(); });
qs("#payment-request-preview-modal").addEventListener("click", (event) => { if (event.target.id === "payment-request-preview-modal") qs("#payment-request-preview-modal").close(); });
qs("#transfer-history-modal").addEventListener("click", (event) => { if (event.target.id === "transfer-history-modal") qs("#transfer-history-modal").close(); });
qs("#followup-history-modal").addEventListener("click", (event) => { if (event.target.id === "followup-history-modal") qs("#followup-history-modal").close(); });
qs("#branch-filter").addEventListener("change", (e) => { data.branch = e.target.value; saveData(); renderAll(); });
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
qs("#sales-status").addEventListener("change", renderSales);
qs("#product-issue-status").addEventListener("change", renderProductIssues);
qs("#sales-type").addEventListener("change", renderSales);
qs("#reset-demo")?.addEventListener("click", () => toast("Production reset is disabled."));
qs("#export-demo")?.addEventListener("click", () => { log("Exported summary", "Reports", "Admin summary"); renderAll(); toast("Summary export logged."); });
qs("#print-report").addEventListener("click", () => window.print());
qs("#print-analytics").addEventListener("click", () => window.print());
qs("#run-reconciliation").addEventListener("click", runReconciliationWorkflow);
qs("#recon-date-from").addEventListener("change", () => { selectedReconHistoryIndex = null; renderReconciliation(); });
qs("#recon-date-to").addEventListener("change", () => { selectedReconHistoryIndex = null; renderReconciliation(); });
qs("#recon-period").addEventListener("change", () => { selectedReconHistoryIndex = null; renderReconciliation(); });
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
qs("#user-devices-modal")?.addEventListener("click", (event) => { if (event.target.id === "user-devices-modal") qs("#user-devices-modal")?.close(); });
qs("#refresh-user-sessions")?.addEventListener("click", () => { renderUserSessions(); toast("Device sessions refreshed."); });
qs("#refresh-backups")?.addEventListener("click", () => { renderBackup(); toast("Backups refreshed."); });
qs("#run-manual-backup")?.addEventListener("click", runManualBackup);
qs("#run-manual-digest-daily")?.addEventListener("click", () => runManualDigest("Daily"));
qs("#run-manual-digest-weekly")?.addEventListener("click", () => runManualDigest("Weekly"));
qs("#print-value-report")?.addEventListener("click", printSystemValueReport);
qs("#role-tester-select")?.addEventListener("change", renderRoleTester);
qs("#user-status-filter")?.addEventListener("change", (event) => { userStatusFilter = event.target.value; renderUsers(); });

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
  } catch (error) {
    setBackupStatus("Backup failed", error.message || "Backup failed.", 100, "error");
    toast(error.message || "Backup failed.");
  } finally {
    if (button) { button.disabled = false; button.classList.remove("is-loading"); button.textContent = original; }
  }
}

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
  } catch (error) {
    toast(error.message || "Digest failed.");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function downloadBackupFile(id) {
  try {
    setBackupStatus("Preparing download", "Fetching backup metadata and R2 object...", -1);
    await MedlaneAPI.downloadBackup(id);
    log("Downloaded backup", "Backup", id);
    setBackupStatus("Download started", "Your browser is downloading the backup file.", 100, "success");
    clearBackupStatus();
    toast("Backup download started.");
  } catch (error) {
    setBackupStatus("Download failed", error.message || "Backup download failed.", 100, "error");
    toast(error.message || "Backup download failed.");
  }
}

async function downloadBackupObjectFile(key) {
  try {
    setBackupStatus("Preparing R2 download", "Fetching backup object directly from R2...", -1);
    await MedlaneAPI.downloadBackupObject(key);
    log("Downloaded R2 backup object", "Backup", key);
    setBackupStatus("Download started", "Your browser is downloading the R2 backup file.", 100, "success");
    clearBackupStatus();
    toast("Backup download started.");
  } catch (error) {
    setBackupStatus("Download failed", error.message || "Backup download failed.", 100, "error");
    toast(error.message || "Backup download failed.");
  }
}

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
  } catch (error) {
    setBackupStatus("Restore failed", error.message || "Restore failed.", 100, "error");
    toast(error.message || "Restore failed.");
  }
}

function openUserSessions(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can view device sessions.");
  const user = data.users[index];
  if (!user) return toast("User not found.");
  renderUserSessions({ id: user.id || "", email: user.email || user.username || "", name: user.name || user.email || "User" });
  qs("#user-devices-modal")?.showModal();
}

async function forceLogoutSession(sessionId) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can force logout devices.");
  if (!sessionId) return toast("Session id is missing.");
  if (!confirm("Force logout this device session?")) return;
  try {
    await MedlaneAPI.revokeUserSession(sessionId);
    log("Forced device logout", "Users", sessionId);
    await renderUserSessions();
    toast("Device session revoked.");
  } catch (error) {
    toast(error.message || "Unable to revoke session.");
  }
}
let lastImportFileName = null;
qs("#import-sample").addEventListener("click", () => {
  lastImportFileName = null;
  qs("#csv-input").value = "vvv\tYear\tMonth\tOffice\tDate\tSales Rep\tBranch\tArea\tTS/DR\tSI No.\tTIN\tCLIENT\tClassification\tBrand\tPRODUCT\tQty\tU/M\tUnit Price\tAmount\tDiscount\tTotal Price\tInvoice Amount\tLESS TPC\tActual Sales\t12% VAT\tNET Sales\tCWT\tRemarks\n1\t2026\tJuly\tLas Pinas\t2026-07-15\tAna Cruz\tLas Pinas\tRegion IV-A\t\tSI-MIG-001\t123-456-789\tPrimeCare Diagnostics\tDirect\tSysmex\tHematology Reagent\t2\tkit\t4200\t8400\t0\t8400\t9408\t0\t8400\t1008\t9408\t0\tMigrated opening AR\n2\t2026\tJuly\tNaga\t2026-07-16\tMika Tan\tNaga\tRegion V\tTS-MIG-002\t\t222-333-444\tBicol Heart Lab\tDirect\tBD\tVacutainer Tubes\t100\tbox\t35\t3500\t0\t3500\t3500\t0\t3500\t0\t3500\t0\tMigrated opening AR";
  renderImportCheck();
});
qs("#csv-file-input").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const text = await file.text().catch(() => "");
  if (!text.trim()) return toast("Could not read that file, or it was empty.");
  lastImportFileName = file.name;
  qs("#csv-input").value = text;
  renderImportCheck();
  toast(`Loaded ${file.name}. Review the preview before importing.`);
});
qs("#csv-input").addEventListener("input", () => { lastImportFileName = null; });
qs("#check-import").addEventListener("click", () => { renderImportCheck(); toast("Import safety check completed."); });
qs("#clear-import").addEventListener("click", () => { lastImportFileName = null; qs("#csv-file-input").value = ""; qs("#csv-input").value = ""; qs("#import-preview-summary").innerHTML = ""; table("#import-check-table", ["Row", "Client", "Area", "Status", "Safety Notes"], []); });
qs("#run-import").addEventListener("click", async () => {
  if (!canApproveMigrations()) return toast("Only Superadmin or CEO can approve a migration import.");
  const checked = renderImportCheck();
  const ready = checked.filter((row) => row.status === "Ready");
  if (!ready.length) return toast("No valid rows to import. Review the skipped-row warnings first.");
  const moduleLabel = { clientsMasterlist: "Clients", suppliersMasterlist: "Suppliers/Vendors", productsMasterlist: "Products/Services" }[ready[0]?.kind] || "Records";
  const ok = await confirmDetailsModal({
    eyebrow: "Confirm Migration Import",
    title: `Import ${ready.length} ${moduleLabel} record(s)`,
    fields: [["File", lastImportFileName || "Pasted CSV/TSV"], ["Ready rows", ready.length], ["Skipped rows", checked.length - ready.length]],
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
    const saveResult = await persistRecords({ ...(result.createdRecords || {}), imports: [importEntry] });
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
window.addEventListener("resize", updateTableScrollHints);
document.addEventListener("scroll", (event) => { if (event.target?.classList?.contains("table-card")) updateTableScrollHints(); }, true);
let loginAutofillSubmitTimer = null;
function isAuthenticatedRoute() {
  return Boolean(currentUser) || document.body.classList.contains("app-route");
}
function scheduleAutofillLoginSubmit() {
  const form = qs("#login-form");
  const email = qs("#login-email");
  const password = qs("#login-password");
  if (!form || !email || !password || form.dataset.submitting === "true" || isAuthenticatedRoute()) return;
  clearTimeout(loginAutofillSubmitTimer);
  loginAutofillSubmitTimer = setTimeout(() => {
    const filled = String(email.value || "").trim() && String(password.value || "");
    const autofilled = [email, password].some((input) => {
      try { return input.matches(":-webkit-autofill"); } catch { return false; }
    });
    if (filled && autofilled && form.dataset.submitting !== "true" && !isAuthenticatedRoute()) form.requestSubmit();
  }, 650);
}
window.addEventListener("pageshow", () => setTimeout(scheduleAutofillLoginSubmit, 350));
qsa("#login-email, #login-password").forEach((input) => {
  input.addEventListener("change", scheduleAutofillLoginSubmit);
  input.addEventListener("animationstart", scheduleAutofillLoginSubmit);
});
qs("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginForm = qs("#login-form");
  if (loginForm?.dataset.submitting === "true") return;
  if (loginForm) loginForm.dataset.submitting = "true";
  const loginButton = loginForm?.querySelector("button[type='submit']");
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
  } catch (error) {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.classList.remove("is-loading");
      loginButton.textContent = originalLabel;
    }
    if (loginForm) loginForm.dataset.submitting = "";
    return toast(error.message || "Invalid email or password.");
  }
  currentUser = payload.user;
  try {
    const serverState = await MedlaneAPI.loadAppState();
    if (!serverState.data || typeof serverState.data !== "object") throw new Error("Server returned an invalid app state.");
    serverRevision = Number(serverState.revision || 0);
    data = normalizeData({ ...emptyProductionData(), ...serverState.data });
    applyPendingSaveQueueToLocal();
    await syncBackendUsers();
    flushPendingSaveQueue();
  } catch (error) {
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
  catch (error) { return toast(error.message || "Could not save your choice. Please try again."); }
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
  const result = await MedlaneAPI.setUserPassword(email, password).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to set password.");
  log("Set user password", "Users", email);
  toast(`Password set for ${user.name || email}. Share it with them securely.`);
}

async function copyInviteLink(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can generate invite links.");
  const user = data.users[index];
  const email = String(user?.email || "").trim().toLowerCase();
  if (!user || !email) return toast("User email is required to generate an invite link.");
  toast("Generating invite link...");
  const result = await MedlaneAPI.getInviteLink(email).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to generate invite link.");
  try {
    await navigator.clipboard.writeText(result.actionLink);
    toast(`Invite link copied for ${user.name || email}.`);
  } catch {
    prompt(`Copy this invite link for ${user.name || email}:`, result.actionLink);
  }
}

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
  const type = params.get("type");
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
    const submitButton = resetForm?.querySelector("button[type='submit']");
    const originalLabel = submitButton?.textContent || "Update Password";
    if (submitButton) { submitButton.disabled = true; submitButton.classList.add("is-loading"); submitButton.textContent = "Setting password..."; }
    try {
      await MedlaneAPI.setPassword(values.token.replace(/^supabase:/, ""), values.newPassword);
      history.replaceState(null, "", "/login");
    } catch (error) {
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
  currentUser = null;
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
let appVersionTimer = null;
let appVersionKnown = "";
let appUpdatePending = false;
let appUpdateNoticeShown = false;

function isSafeToApplyAppUpdate() {
  return qsa("dialog[open]").length === 0 && Object.keys(readPendingSaveQueue()).length === 0;
}

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
  if (appVersionTimer) return;
  scheduleAppVersionCheck(APP_VERSION_POLL_MS);
}
function stopAppVersionWatch() {
  clearTimeout(appVersionTimer);
  appVersionTimer = null;
  appVersionKnown = "";
  appUpdatePending = false;
  appUpdateNoticeShown = false;
}

function restoreRememberedLogin() {
  qs("#remember-login")?.closest("label")?.remove();
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
  if (location.protocol !== "file:") history.replaceState(null, "", "/dashboard");
  document.body.classList.add("app-route");
  document.body.classList.remove("login-route", "public-landing");
  qs("#login-screen")?.classList.add("hidden");
  applyRole();
  renderAll();
  if (requestedSection && requestedSection !== "security" && effectiveModules().includes(requestedSection)) showSection(requestedSection);
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
  renderAll();
  setTimeout(() => qs("#loading-overlay")?.classList.add("hide"), 650);
}
initializeRoute();

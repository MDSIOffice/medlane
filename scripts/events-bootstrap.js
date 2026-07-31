data = loadData();
syncGeneratedNotifications();

function mergeUsersFromBackend(users = []) {
  const byEmail = new Map(data.users.map((user) => [String(user.email || "").trim().toLowerCase(), user]));
  users.forEach((user) => {
    const email = String(user.email || "").trim().toLowerCase();
    if (!email) return;
    byEmail.set(email, { ...(byEmail.get(email) || {}), ...user, email, branch: "all" });
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
  const values = formObject(form);
  if (["invoice", "cancelReplace", "purchaseOrder", "inventoryPurchaseOrder"].includes(modalType)) {
    try { values.itemsText = collectInvoiceEditorLines(); }
    catch (error) { return toast(error.message); }
  }
  if (editContext) {
    const previous = editContext.list[editContext.index];
    const next = { ...values };
    if (modalType === "item" && next.classification) next.category = importedCategory(next.classification);
    if (modalType === "item" && next.expiry && daysUntil(next.expiry) < 0) return toast("Expiry date cannot be in the past.");
    if (modalType === "employee" && !canManageEmployeeSalary()) next.salary = editContext.list[editContext.index].salary;
    try { validateMasterRecord(modalType, next, editContext.index); }
    catch (error) { return toast(error.message); }
    if (modalType === "client") { next.creditLimit = Number(next.creditLimit); next.terms = Number(next.terms || 30); }
    if (modalType === "employee" && canManageEmployeeSalary()) next.salary = Number(next.salary || 0);
    editContext.list[editContext.index] = next;
    log("Edited masterlist record", "Masterlists", `Edited ${modalType}: ${recordLabel(modalType, previous)}`);
    editContext = null;
    saveData();
    qs("#demo-modal").close();
    form.reset();
    renderAll();
    toast("Masterlist record updated.");
    return;
  }
  if (["client", "item", "bank"].includes(modalType)) {
    if (modalType === "item" && values.classification) values.category = importedCategory(values.classification);
    if (modalType === "item" && values.expiry && daysUntil(values.expiry) < 0) return toast("Expiry date cannot be in the past.");
    try { validateMasterRecord(modalType, values); }
    catch (error) { return toast(error.message); }
  }
  if (modalType === "client") data.clients.push({ ...values, terms: Number(values.terms || 30), creditLimit: Number(values.creditLimit), docs: values.docs || "" });
  if (modalType === "item") data.items.push(values);
  if (modalType === "bank") data.banks.push(values);
  if (modalType === "supplier") data.suppliers.push(values);
  if (modalType === "employee") data.employees.push({ ...values, salary: canManageEmployeeSalary() ? Number(values.salary || 0) : 0 });
  if (modalType === "invoice") {
    try {
      const sale = buildSale(values);
      data.sales.push(sale);
      log("Created invoice", "Invoicing", `${sale.documentNo} · ${sale.type} · ${sale.client}`);
    }
    catch (error) { notify("Validation", error.message, "sales", values.documentNo || values.client || ""); saveData(); return toast(error.message); }
  }
  if (modalType === "purchaseOrder") {
    try { data.purchaseOrders.push(buildPurchaseOrder(values)); }
    catch (error) { notify("Validation", error.message, "purchase-orders", values.client || ""); saveData(); return toast(error.message); }
  }
  if (modalType === "inventoryPurchaseOrder") {
    try { data.inventoryPurchaseOrders.push(buildInventoryPurchaseOrder(values)); }
    catch (error) { notify("Validation", error.message, "inventory", values.supplier || ""); saveData(); return toast(error.message); }
  }
  if (modalType === "cancelReplace") {
    const oldSale = data.sales.find((sale) => sale.id === values.oldInvoice);
    if (!oldSale || oldSale.status === "Cancelled") return toast("Original invoice is not available for cancellation.");
    try {
      restoreCancelledStock(oldSale);
      const replacement = buildSale(values, oldSale.documentNo || oldSale.id);
      oldSale.status = "Cancelled";
      oldSale.cancelReason = values.reason;
      oldSale.replacementId = replacement.documentNo;
      oldSale.cancelledBy = currentUser?.name || "System User";
      data.sales.push(replacement);
      log("Cancelled and replaced invoice", "Invoicing", `${oldSale.documentNo || oldSale.id} -> ${replacement.documentNo}`);
      notify("Cancellation", `${oldSale.documentNo || oldSale.id} cancelled and replaced by ${replacement.documentNo}.`, "receivables-tracker", replacement.documentNo || replacement.id);
    } catch (error) { deductSaleStock(oldSale); return toast(error.message); }
  }
  if (modalType === "payment") {
    const sale = findSaleByDocumentInput(values.invoice);
    if (!sale || sale.status === "Cancelled") return toast("Cannot collect against missing or cancelled document.");
    if (!values.receiptNo?.trim()) return toast("Receipt number is required.");
    values.receiptNo = values.receiptNo.trim();
    if (receiptExists(values.receiptNo)) return toast("Duplicate receipt number detected.");
    const cheques = values.method === "Multiple Cheques" ? collectChequeLines() : [];
    if (values.method === "Cheque" && (!values.bank || !values.reference || !values.chequeDate)) return toast("Cheque collections require bank, reference, and cheque date.");
    if (values.method === "Multiple Cheques" && (!values.bank || !cheques.length || cheques.some((cheque) => !cheque.reference || !cheque.chequeDate || cheque.amount <= 0))) return toast("Multiple cheques require one bank and complete reference, date, and amount per cheque.");
    if (!["Cheque", "Multiple Cheques"].includes(values.method)) { values.bank = ""; values.reference = ""; values.chequeDate = ""; }
    if (values.collectionStatus === "Posted Date" && !values.postedDate) return toast("Posted Date status requires a claim date.");
    if (values.collectionStatus !== "Posted Date") values.postedDate = "";
    const amount = values.method === "Multiple Cheques" ? cheques.reduce((sum, cheque) => sum + cheque.amount, 0) : Number(values.amount);
    const deductions = collectionDeductions(sale, amount);
    const appliedAmount = deductions.netApplied;
    if (amount <= 0) return toast("Payment amount must be greater than zero.");
    if (appliedAmount <= 0) return toast("Payment net of WTax/EWT must be greater than zero.");
    if (appliedAmount > sale.net - sale.paid) return toast("Payment amount exceeds remaining invoice balance after WTax/EWT.");
    sale.paid = Math.min(sale.net, sale.paid + appliedAmount);
    values.tag = collectionTagForType(sale.type);
    data.payments.push({ invoice: sale.documentNo || sale.id, tag: values.tag, receiptNo: values.receiptNo, method: values.method, bank: values.bank, reference: values.method === "Multiple Cheques" ? cheques.map((cheque) => cheque.reference).join(", ") : values.reference, chequeDate: values.method === "Multiple Cheques" ? cheques.map((cheque) => cheque.chequeDate).join(", ") : values.chequeDate, cheques, collectionStatus: values.collectionStatus || "For Deposition", postedDate: values.postedDate, statusHistory: collectionStatusHistory(values.collectionStatus || "For Deposition"), dateCollected: values.dateCollected, dateRecorded: fmtDate(today), client: sale.client, grossAmount: amount, withholdingTax: deductions.withholdingTax, expandedWithholdingTax: deductions.expandedWithholdingTax, amount: appliedAmount });
    log("Recorded collection payment", "Collections", `${values.receiptNo} · ${sale.documentNo || sale.id} · ${peso.format(appliedAmount)}`);
    notify("Collection", `${peso.format(appliedAmount)} net payment recorded for ${values.invoice}.`, "receivables-tracker", sale.documentNo || sale.id);
  }
  if (modalType === "paymentRequest") {
    const items = collectPaymentRequestLines();
    const gross = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const deductions = paymentRequestDeductions(gross);
    const total = deductions.total;
    if (!values.cvNo?.trim()) return toast("CV number is required.");
    if (data.paymentRequests.some((request) => request.cvNo.toLowerCase() === values.cvNo.toLowerCase() && cvYear(request.date || request.createdAt) === cvYear(values.date))) return toast("Duplicate CV number detected for this year.");
    if (!items.length || items.some((item) => !item.particulars || item.amount <= 0)) return toast("Each payment request item needs particulars and an amount greater than zero.");
    if (total <= 0) return toast("Payment request total must be greater than zero.");
    data.paymentRequests.unshift({ ...values, items, particulars: items.map((item) => item.particulars).join("; "), amount: items[0]?.amount || 0, gross, withholdingTax: deductions.withholdingTax, expandedWithholdingTax: deductions.expandedWithholdingTax, total, instructions: paymentRequestInstructions, preparedBy: currentUser?.name || "System User", preparedRole: currentUser?.role || "Accounting", approvedBy: "Maria Emma F. Llorin", approvedRole: "CEO", status: "Prepared", createdAt: fmtDate(today) });
    log("Created payment request", "Collections", `${values.cvNo} · ${values.employee} · ${peso.format(total)}`);
    notify("Payment Request", `${values.cvNo} prepared for ${values.employee}.`, "collections", values.cvNo);
  }
  if (modalType === "payable") {
    const items = collectFinancialLines();
    const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (!items.length || amount <= 0) return toast("Add at least one payable item with amount.");
    data.payables.push({ id: nextId(data.payables, "PAY"), ...values, item: items.map((item) => item.particulars).join("; "), qty: items.length, uom: "item", items, amount, paid: 0, method: "", bank: "", cheque: "", chequeDate: "", status: "For Approval", requestStatus: "For Approval", paymentConfirmed: false });
  }
  if (modalType === "replenishment") {
    const items = collectFinancialLines();
    const amount = items.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (!items.length || amount <= 0) return toast("Add at least one expense item with amount.");
    data.replenishments.push({ id: `REP-${String(data.replenishments.length + 1).padStart(3, "0")}`, ...values, items, amount, status: "For Approval", requestStatus: "For Approval", paymentConfirmed: false, method: "", bank: "", cheque: "", chequeDate: "" });
  }
  if (modalType === "warranty") data.warranties.push(values);
  if (modalType === "productIssue") {
    if (!values.companyName?.trim()) return toast("Company name is required.");
    if (!values.actionsTaken?.trim()) return toast("Update / actions taken is required.");
    if (values.status === "Resolved" && !values.resolvedBy) return toast("Select who resolved this report.");
    values.id = values.id?.trim() || nextProductIssueId();
    if (data.productIssues.some((report) => report.id === values.id)) return toast("Duplicate document number detected.");
    values.performedBy = currentUser?.name || "System User";
    values.qcParameters = collectProductIssueParameters();
    values.resolvedAt = values.status === "Resolved" ? fmtDate(today) : "";
    values.history = [{ date: new Date().toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }), status: values.status || "Open", note: "Report started", by: values.performedBy || currentUser?.name || "System User" }];
    data.productIssues.push(values);
    log("Created support report", "Product Issues", `${values.id} · ${values.companyName}`);
    notify("Support Report", `${values.id} started for ${values.companyName}.`, "product-issues", values.id);
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
  log(`Saved ${modalType}`, modalConfigs[modalType].title, Object.values(values)[0]);
    saveData();
    qs("#demo-modal").close();
  form.reset();
  renderAll();
  if (modalType === "paymentRequest") previewPaymentRequest(0);
  toast(`${modalConfigs[modalType].title} saved.`);
}

qsa(".nav-item").forEach((button) => button.addEventListener("click", () => showSection(button.dataset.section, { scrollTop: true })));
document.body.addEventListener("click", (event) => {
  const modalButton = event.target.closest("[data-action='open-modal']");
  if (modalButton) {
    if (qs("#report-preview-modal")?.open) qs("#report-preview-modal").close();
    if (qs("#collection-detail-modal")?.open) qs("#collection-detail-modal").close();
    return canEditActiveSection() ? openModal(modalButton.dataset.type) : toast("Editing is disabled for this module in User Settings.");
  }
  const sortButton = event.target.closest("[data-sort-col]");
  if (sortButton) return sortTable(sortButton);
  if (!event.target.closest(".notification-menu")) { qs("#notification-popover").hidden = true; qs("#notification-toggle").setAttribute("aria-expanded", "false"); }
  if (!event.target.closest(".user-menu")) { qs("#user-popover").hidden = true; qs("#user-menu-toggle").setAttribute("aria-expanded", "false"); }
  const workflowAction = event.target.closest("[data-workflow-action]");
  if (workflowAction) return handleWorkflowAction(workflowAction.dataset.workflowAction);
  const paymentRequestPreview = event.target.closest("[data-payment-request-preview]");
  if (paymentRequestPreview) return previewPaymentRequest(paymentRequestPreview.dataset.paymentRequestPreview);
  const requestPreview = event.target.closest("[data-request-preview]");
  if (requestPreview) { const [type, index] = requestPreview.dataset.requestPreview.split(":"); return previewFinancialRequest(type, Number(index)); }
  const requestApprove = event.target.closest("[data-request-approve]");
  if (requestApprove) { const [type, index] = requestApprove.dataset.requestApprove.split(":"); return approveFinancialRequest(type, Number(index)); }
  const requestCancel = event.target.closest("[data-request-cancel]");
  if (requestCancel) { const [type, index] = requestCancel.dataset.requestCancel.split(":"); return cancelFinancialRequest(type, Number(index)); }
  const viewUserSessions = event.target.closest("[data-view-user-sessions]");
  if (viewUserSessions) return openUserSessions(Number(viewUserSessions.dataset.viewUserSessions));
  const revokeSession = event.target.closest("[data-revoke-session]");
  if (revokeSession) return forceLogoutSession(revokeSession.dataset.revokeSession);
  const downloadBackup = event.target.closest("[data-download-backup]");
  if (downloadBackup) return downloadBackupFile(downloadBackup.dataset.downloadBackup);
  const confirmPayment = event.target.closest("[data-confirm-payment]");
  if (confirmPayment) { const [type, index, method] = confirmPayment.dataset.confirmPayment.split(":"); return confirmFinancialPayment(type, Number(index), method); }
  const collectionAction = event.target.closest("[data-collection-action]");
  if (collectionAction) return openCollectionActionModal(collectionAction.dataset.collectionAction);
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
  const productIssuePrint = event.target.closest("[data-product-issue-print]");
  if (productIssuePrint) return previewProductIssue(productIssuePrint.dataset.productIssuePrint);
  const productIssueTimeline = event.target.closest("[data-product-issue-timeline]");
  if (productIssueTimeline) return renderProductIssueDetail(productIssueTimeline.dataset.productIssueTimeline);
  const productIssueStatus = event.target.closest("[data-product-issue-status]");
  if (productIssueStatus) { const [issueId, issueStatus] = productIssueStatus.dataset.productIssueStatus.split(":"); return updateProductIssueStatus(issueId, issueStatus); }
  const invoicePoButton = event.target.closest("[data-create-invoice-po]");
  if (invoicePoButton) return openInvoiceForPurchaseOrder(invoicePoButton.dataset.createInvoicePo);
  const clientInvoices = event.target.closest("[data-client-invoices]");
  if (clientInvoices) {
    currentClientView = clientInvoices.dataset.clientInvoices;
    renderClientInvoices();
    return showSection("client-invoices");
  }
  const invoiceFlow = event.target.closest("[data-invoice-flow]");
  if (invoiceFlow) return renderInvoiceFlowDetail(invoiceFlow.dataset.invoiceFlow);
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
qs("#logout-top-button")?.addEventListener("click", logoutCurrentUser);
qs("#settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const values = formObject(event.currentTarget);
  const profile = { email: values.email, phone: values.phone, notes: values.notes };
  currentUser = { ...currentUser, ...profile };
  sessionStorage.setItem("medlane-session", JSON.stringify(currentUser));
  renderUserMenu();
  applyRole();
  toast("User settings updated for this session. Profile persistence is managed by Admin users.");
});
qs("#invoice-approval-form").addEventListener("submit", (event) => {
  event.preventDefault();
  data.invoiceApprovals = formObject(event.currentTarget);
  log("Updated invoice approval settings", "Settings", "Invoice approvals");
  notify("Settings", "Invoice approved-by names were updated.", "settings", "Invoice approvals");
  saveData();
  toast("Invoice approved-by names saved.");
});
qs("#reset-demo-settings")?.addEventListener("click", () => toast("Production reset is disabled. Use Admin data tools or Supabase maintenance scripts."));
qs("#open-password-modal").addEventListener("click", () => {
  qs("#password-form").reset();
  qs("#password-modal").showModal();
});
qs("#password-close").addEventListener("click", () => qs("#password-modal").close());
qs("#password-cancel").addEventListener("click", () => qs("#password-modal").close());
qs("#password-modal").addEventListener("click", (event) => { if (event.target.id === "password-modal") qs("#password-modal").close(); });
qs("#password-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formObject(event.currentTarget);
  const policyError = passwordPolicyError(values.newPassword);
  if (policyError) return toast(policyError);
  if (values.newPassword !== values.confirmPassword) return toast("Confirm password does not match.");
  const activeSession = MedlaneAPI.session();
  if (!activeSession?.access_token) return toast("Sign in again before changing your password.");
  try { await MedlaneAPI.changePassword(values.oldPassword, values.newPassword); }
  catch (error) { return toast(error.message || "Password update failed."); }
  event.currentTarget.reset();
  qs("#password-modal").close();
  log("Changed password", "User Settings", currentUser?.role || "User");
  notify("Password", `${currentUser?.name || "A user"} changed password.`, "logs", currentUser?.role || "User");
  toast("Password updated.");
});
qs("#platform-branch-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canEditModule("masterlists")) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  const values = formObject(event.currentTarget);
  const branch = values.branch.trim();
  if (!branch) return toast("Branch name is required.");
  if (platformBranches().some((item) => item.toLowerCase() === branch.toLowerCase())) return toast("Branch already exists.");
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
document.body.addEventListener("change", (event) => {
  const uploadDoc = event.target.closest("input[type='file'][data-upload-doc]");
  if (uploadDoc && uploadDoc.files?.length) return uploadClientDoc(Number(uploadDoc.dataset.clientIndex), uploadDoc.dataset.uploadDoc, uploadDoc.files[0].name);
});
qs("#platform-branch-list").addEventListener("click", (event) => {
  const addressButton = event.target.closest("[data-edit-branch-address]");
  if (addressButton) return editPlatformBranchAddress(addressButton.dataset.editBranchAddress);
  const button = event.target.closest("[data-remove-platform-branch]");
  if (button) return removePlatformBranch(button.dataset.removePlatformBranch);
});

function editPlatformBranchAddress(branch) {
  if (!canEditModule("masterlists")) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  data.branchAddresses ||= {};
  data.branchAddresses[branch] = prompt(`Address for ${branch}:`, data.branchAddresses[branch] || "") || data.branchAddresses[branch] || "";
  log("Edited branch address", "Masterlists", branch);
  notify("Settings", `${branch} branch address was updated.`, "settings", branch);
  saveData();
  renderAll();
  toast(`${branch} address saved.`);
}

function removePlatformBranch(branch) {
  if (!canEditModule("masterlists")) return toast("Branch masterlist changes need approval from Admin or Superadmin.");
  const reasons = branchUsageReasons(branch);
  if (reasons.length) return toast(`Cannot remove ${branch}; it is used by ${reasons.join(", ")}.`);
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
  const button = event.target.closest("[data-delete-user]");
  if (!button) return;
  if (!canManageUsers()) return toast("Only Superadmin/CEO can delete users.");
  const index = Number(button.dataset.deleteUser);
  const user = data.users[index];
  if (!user) return;
  const hasRealName = String(user.name || "").toLowerCase() !== String(user.email || "").toLowerCase();
  const confirmation = prompt(`Type the user's ${hasRealName ? "full name" : "email"} to delete this user permanently:\n\n${user.name}`);
  if (confirmation === null) return;
  if (confirmation.trim().toLowerCase() !== String(user.name || "").toLowerCase()) return toast("Full name did not match. User was not deleted.");
  const result = await MedlaneAPI.deleteUser(user.email || user.username, confirmation).catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || "Unable to delete user.");
  data.users.splice(index, 1);
  await syncBackendUsers();
  log("Deleted user", "Users", `${user.email || user.name} · ${user.role}`);
  saveData();
  renderUsers();
  toast(`${user.name} deleted.`);
});

async function toggleUserDisabled(index) {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can disable users.");
  const user = data.users[index];
  if (!user?.email) return toast("User email is required.");
  if (user.email === currentUser?.email) return toast("You cannot disable your own account.");
  const disabled = !String(user.inviteStatus || "Active").toLowerCase().includes("disabled");
  const verb = disabled ? "disable" : "enable";
  if (!confirm(`${disabled ? "Disable" : "Enable"} ${user.name || user.email}?`)) return;
  const reason = disabled ? prompt(`Reason for disabling ${user.name || user.email}:`) : "";
  if (disabled && !String(reason || "").trim()) return toast("Disable reason is required.");
  const result = await MedlaneAPI.setUserDisabled(user.email, disabled, reason || "").catch((error) => ({ error }));
  if (result.error) return toast(result.error.message || `Unable to ${verb} user.`);
  user.inviteStatus = disabled ? "Disabled" : "Active";
  user.disabledReason = disabled ? String(reason).trim() : "";
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
qs("#users-table").addEventListener("change", (event) => {
  const checkbox = event.target.closest("[data-user-superadmin]");
  if (!checkbox) return;
  if (!canManageUsers()) { checkbox.checked = !checkbox.checked; return toast("Only Superadmin/CEO can grant Superadmin permissions."); }
  const index = Number(checkbox.dataset.userSuperadmin);
  const user = data.users[index];
  if (!user) return;
  if (!checkbox.checked && user.name === "Superadmin") { checkbox.checked = true; return toast("The main Superadmin account cannot be demoted."); }
  if (checkbox.checked) {
    user.baseRole ||= user.role === "Superadmin" ? "Admin" : user.role;
    user.role = "Superadmin";
    user.superadminPermissions = true;
    user.access = "Everything, users/passwords, salaries, masterlist approvals, notifications";
  } else {
    user.role = user.baseRole || "Admin";
    user.superadminPermissions = false;
    user.access = user.access?.includes("Everything") ? `${user.role} permissions restored` : user.access;
  }
  log("Changed user Superadmin permission", "Users", `${user.email || user.name}: ${checkbox.checked ? "granted" : "removed"}`);
  saveData();
  renderUsers();
  toast(`${user.name} Superadmin permissions ${checkbox.checked ? "granted" : "removed"}.`);
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
});
document.addEventListener("change", (event) => {
  if (event.target.matches(".stock-code, .stock-item, .transfer-code, .transfer-item, .transfer-from")) syncStockSheetRow(event.target, true);
});
qs("#inventory-branch-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-inventory-branch]");
  if (!button) return;
  inventoryBranchTab = button.dataset.inventoryBranch;
  renderInventory();
});
qs("#open-stock-sheet").addEventListener("click", () => { renderStockSheet(); qs("#stock-sheet-modal").showModal(); });
qs("#open-transfer-sheet").addEventListener("click", () => { renderTransferSheet(); qs("#transfer-sheet-modal").showModal(); });
qs("#open-transfer-history").addEventListener("click", () => { renderInventory(); qs("#transfer-history-modal").showModal(); });
qs("#stock-sheet-close").addEventListener("click", () => qs("#stock-sheet-modal").close());
qs("#stock-sheet-cancel").addEventListener("click", () => qs("#stock-sheet-modal").close());
qs("#add-stock-sheet-row").addEventListener("click", addStockSheetRow);
qs("#transfer-sheet-close").addEventListener("click", () => qs("#transfer-sheet-modal").close());
qs("#transfer-sheet-cancel").addEventListener("click", () => qs("#transfer-sheet-modal").close());
qs("#transfer-history-close").addEventListener("click", () => qs("#transfer-history-modal").close());
qs("#transfer-history-cancel").addEventListener("click", () => qs("#transfer-history-modal").close());
qs("#open-followup-history").addEventListener("click", () => { renderCollectionContactMap(); qs("#followup-history-modal").showModal(); });
qs("#followup-history-close").addEventListener("click", () => qs("#followup-history-modal").close());
qs("#followup-history-cancel").addEventListener("click", () => qs("#followup-history-modal").close());
qs("#collection-detail-close").addEventListener("click", () => qs("#collection-detail-modal").close());
qs("#collection-detail-cancel").addEventListener("click", () => qs("#collection-detail-modal").close());
qs("#add-transfer-sheet-row").addEventListener("click", addTransferSheetRow);
qs("#save-stock-sheet").addEventListener("click", saveStockSheet);
qs("#stock-sheet-modal").addEventListener("change", (event) => { if (event.target.id === "inventory-po-receive-picker") fillStockSheetFromInventoryPo(event.target.value); });
qs("#save-transfer-sheet").addEventListener("click", saveTransferSheet);
qs("#transfer-table").addEventListener("click", (event) => {
  const dispatch = event.target.closest("[data-dispatch-transfer]");
  if (dispatch) return dispatchTransfer(Number(dispatch.dataset.dispatchTransfer));
  const receive = event.target.closest("[data-receive-transfer]");
  if (receive) return receiveTransfer(Number(receive.dataset.receiveTransfer));
  const incomplete = event.target.closest("[data-incomplete-transfer]");
  if (incomplete) return incompleteTransfer(Number(incomplete.dataset.incompleteTransfer));
  const complete = event.target.closest("[data-complete-transfer]");
  if (complete) return completeIncompleteTransfer(Number(complete.dataset.completeTransfer));
});
qs("#collections").addEventListener("click", (event) => {
  const zoomButton = event.target.closest("[data-map-zoom]");
  if (zoomButton) {
    collectionMapZoom = zoomButton.dataset.mapZoom === "reset" ? 1 : Math.max(0.75, Math.min(2.2, collectionMapZoom + (zoomButton.dataset.mapZoom === "in" ? 0.18 : -0.18)));
    renderCollectionMapVisual();
    return;
  }
  const statusButton = event.target.closest("[data-contact-status]");
  if (statusButton) return updateCollectionContact(statusButton.dataset.contactClient, statusButton.dataset.contactStatus);
  const channelButton = event.target.closest("[data-contact-channel]");
  if (channelButton) return toggleContactChannel(channelButton.dataset.contactClient, channelButton.dataset.contactChannel);
  const mapTarget = event.target.closest("[data-map-region]");
  if (mapTarget) return openContactRegion(mapTarget.dataset.mapRegion, mapTarget.dataset.mapClient || "", false);
});
qs("#collection-map").addEventListener("wheel", (event) => {
  event.preventDefault();
  collectionMapZoom = Math.max(0.75, Math.min(2.2, collectionMapZoom + (event.deltaY < 0 ? 0.12 : -0.12)));
  renderCollectionMapVisual();
}, { passive: false });
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
qs("#sales-table").addEventListener("click", (event) => {
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
  const button = event.target.closest("[data-master-edit]");
  if (button) {
    if (!canEditActiveSection()) return toast("Masterlist edits need approval from Admin or Superadmin.");
    openMasterEditModal(button.dataset.masterEdit, Number(button.dataset.index));
  }
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
qsa("#master-tabs .tab").forEach((button) => button.addEventListener("click", () => { data.masterTab = button.dataset.master; saveData(); renderMasterlists(); }));
qsa("#analytics-tabs .tab").forEach((button) => button.addEventListener("click", () => {
  qsa("#analytics-tabs .tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  qsa(".analytics-panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.analyticsPanel === button.dataset.analyticsTab));
}));
qs("#modal-form").addEventListener("submit", submitModal);
qs("#modal-fields").addEventListener("click", (event) => {
  if (event.target.closest("#add-payment-request-line")) {
    qs("#payment-request-line-list").insertAdjacentHTML("beforeend", paymentRequestLineTemplate());
    syncPaymentRequestTotal();
    syncFinancialRequestTotal();
  }
  const paymentRequestRemove = event.target.closest(".remove-payment-request-line");
  if (paymentRequestRemove && qsa(".payment-request-line-row").length > 1) {
    paymentRequestRemove.closest(".payment-request-line-row").remove();
    syncPaymentRequestTotal();
    syncFinancialRequestTotal();
  }
  if (event.target.closest("#add-cheque-line")) {
    qs("#cheque-line-list").insertAdjacentHTML("beforeend", chequeLineTemplate());
    syncMultipleChequeAmount();
  }
  const chequeRemove = event.target.closest(".remove-cheque-line");
  if (chequeRemove && qsa(".cheque-line-row").length > 1) {
    chequeRemove.closest(".cheque-line-row").remove();
    syncMultipleChequeAmount();
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
  if (event.target.id === "invoice" && modalType === "payment") syncPaymentInvoice();
  if (event.target.id === "amount" && modalType === "payment") renderPaymentDeductionPreview();
  if (modalType === "paymentRequest" && event.target.closest(".payment-request-line-row")) syncPaymentRequestTotal();
  if (["payable", "replenishment"].includes(modalType) && event.target.closest(".payment-request-line-row")) syncFinancialRequestTotal();
  if (modalType === "paymentRequest" && event.target.id === "employee") syncPaymentRequestTotal();
  if (modalType === "payment" && event.target.closest(".cheque-line-row")) syncMultipleChequeAmount();
  if (event.target.id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders();
  if (event.target.id === "po" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceFromPurchaseOrder();
  if (event.target.id === "sourceBranch" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceLinesForClient();
  if (event.target.id === "supplier" && modalType === "item") syncItemSupplierBrand();
  if (event.target.id === "companyName" && modalType === "productIssue") syncProductIssueClientAddress();
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
  if (event.target.name?.endsWith("Selected") && !["docsSelected", "benefitsSelected"].includes(event.target.name)) syncCheckboxGroupHidden(event.target.name.replace(/Selected$/, ""));
  if (event.target.id === "status" && modalType === "productIssue") toggleProductIssueResolvedByField();
  if (event.target.id === "type") updateDocumentLabel();
  if (event.target.id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders(true);
  if (event.target.id === "po" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceFromPurchaseOrder();
  if (event.target.id === "sourceBranch" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoiceLinesForClient();
  if (event.target.id === "invoice" && modalType === "payment") syncPaymentInvoice(true);
  if (event.target.id === "supplier" && modalType === "item") syncItemSupplierBrand();
  if (event.target.id === "method" && modalType === "payable") togglePayableFields();
  if (event.target.id === "method" && modalType === "payment") toggleChequeFields();
  if (event.target.id === "collectionStatus" && modalType === "payment") qs("#postedDate").closest(".field").hidden = event.target.value !== "Posted Date";
  if (event.target.id === "inventory-po-receive-picker") fillStockSheetFromInventoryPo(event.target.value);
  if (event.target.id === "date" && modalType === "paymentRequest") qs("#cvNo").value = nextCvNumber(cvYear(event.target.value));
  if (event.target.classList.contains("invoice-item-input")) syncInvoiceRowItem(event.target);
  if (["invoice", "cancelReplace"].includes(modalType)) renderInvoiceComputePreview();
});
qs("#modal-fields").addEventListener("blur", (event) => {
  if (event.target.id === "invoice" && modalType === "payment") syncPaymentInvoice(true);
  if (event.target.id === "client" && ["invoice", "cancelReplace"].includes(modalType)) syncInvoicePurchaseOrders(true);
}, true);
qs("#modal-close").addEventListener("click", () => { editContext = null; qs("#demo-modal").close(); });
qs("#modal-cancel").addEventListener("click", () => { editContext = null; qs("#demo-modal").close(); });
qs("#report-preview-close").addEventListener("click", closeReportPreview);
qs("#report-preview-cancel").addEventListener("click", closeReportPreview);
qs("#report-preview-print").addEventListener("click", printReportPreview);
qs("#report-preview-print-no-date").addEventListener("click", printReportPreviewNoDate);
qs("#payment-request-preview-close").addEventListener("click", () => qs("#payment-request-preview-modal").close());
qs("#payment-request-preview-cancel").addEventListener("click", () => qs("#payment-request-preview-modal").close());
qs("#payment-request-preview-print").addEventListener("click", () => window.print());
qs("#demo-modal").addEventListener("click", (event) => { if (event.target.id === "demo-modal") { editContext = null; qs("#demo-modal").close(); } });
qs("#report-preview-modal").addEventListener("click", (event) => { if (event.target.id === "report-preview-modal") closeReportPreview(); });
qs("#payment-request-preview-modal").addEventListener("click", (event) => { if (event.target.id === "payment-request-preview-modal") qs("#payment-request-preview-modal").close(); });
qs("#transfer-history-modal").addEventListener("click", (event) => { if (event.target.id === "transfer-history-modal") qs("#transfer-history-modal").close(); });
qs("#followup-history-modal").addEventListener("click", (event) => { if (event.target.id === "followup-history-modal") qs("#followup-history-modal").close(); });
qs("#collection-detail-modal").addEventListener("click", (event) => { if (event.target.id === "collection-detail-modal") qs("#collection-detail-modal").close(); });
qs("#branch-filter").addEventListener("change", (e) => { data.branch = e.target.value; saveData(); renderAll(); });
qs("#global-search").addEventListener("input", renderAll);
qs("#dashboard-date-from").addEventListener("change", renderDashboard);
qs("#dashboard-date-to").addEventListener("change", renderDashboard);
qs("#clear-dashboard-dates").addEventListener("click", () => { qs("#dashboard-date-from").value = ""; qs("#dashboard-date-to").value = ""; renderDashboard(); toast("Dashboard date filter cleared."); });
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
qs("#clear-notifications").addEventListener("click", () => { data.notifications = data.notifications.filter((notice) => notice.status === "Unread"); saveData(); renderNotifications(); toast("Read notifications cleared."); });
qs("#user-devices-close")?.addEventListener("click", () => qs("#user-devices-modal")?.close());
qs("#user-devices-modal")?.addEventListener("click", (event) => { if (event.target.id === "user-devices-modal") qs("#user-devices-modal")?.close(); });
qs("#refresh-user-sessions")?.addEventListener("click", () => { renderUserSessions(); toast("Device sessions refreshed."); });
qs("#refresh-backups")?.addEventListener("click", () => { renderBackup(); toast("Backups refreshed."); });
qs("#run-manual-backup")?.addEventListener("click", runManualBackup);

async function runManualBackup() {
  if (!canManageUsers()) return toast("Only Superadmin/CEO can run backups.");
  const button = qs("#run-manual-backup");
  const original = button?.textContent || "Run Manual Backup";
  if (button) { button.disabled = true; button.textContent = "Running backup..."; }
  try {
    await MedlaneAPI.runBackup("manual");
    log("Created manual backup", "Backup", currentUser?.email || currentUser?.name || "Superadmin/CEO");
    await renderBackup();
    toast("Manual backup created.");
  } catch (error) {
    toast(error.message || "Backup failed.");
  } finally {
    if (button) { button.disabled = false; button.textContent = original; }
  }
}

async function downloadBackupFile(id) {
  try {
    await MedlaneAPI.downloadBackup(id);
    log("Downloaded backup", "Backup", id);
    toast("Backup download started.");
  } catch (error) {
    toast(error.message || "Backup download failed.");
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
qs("#import-sample").addEventListener("click", () => {
  qs("#csv-input").value = "vvv\tYear\tMonth\tOffice\tDate\tSales Rep\tBranch\tArea\tTS/DR\tSI No.\tTIN\tCLIENT\tClassification\tBrand\tPRODUCT\tQty\tU/M\tUnit Price\tAmount\tDiscount\tTotal Price\tInvoice Amount\tLESS TPC\tActual Sales\t12% VAT\tNET Sales\tCWT\tRemarks\n1\t2026\tJuly\tLas Pinas\t2026-07-15\tAna Cruz\tLas Pinas\tRegion IV-A\t\tSI-MIG-001\t123-456-789\tPrimeCare Diagnostics\tDirect\tSysmex\tHematology Reagent\t2\tkit\t4200\t8400\t0\t8400\t9408\t0\t8400\t1008\t9408\t0\tMigrated opening AR\n2\t2026\tJuly\tNaga\t2026-07-16\tMika Tan\tNaga\tRegion V\tTS-MIG-002\t\t222-333-444\tBicol Heart Lab\tDirect\tBD\tVacutainer Tubes\t100\tbox\t35\t3500\t0\t3500\t3500\t0\t3500\t0\t3500\t0\tMigrated opening AR";
  renderImportCheck();
});
qs("#check-import").addEventListener("click", () => { renderImportCheck(); toast("Import safety check completed."); });
qs("#clear-import").addEventListener("click", () => { qs("#csv-input").value = ""; qs("#import-preview-summary").innerHTML = ""; table("#import-check-table", ["Row", "Client", "Area", "Status", "Safety Notes"], []); });
qs("#run-import").addEventListener("click", () => {
  const checked = renderImportCheck();
  const ready = checked.filter((row) => row.status === "Ready");
  if (!ready.length) return toast("No valid rows to import. Review the skipped-row warnings first.");
  const result = importCheckedRows(checked);
  data.imports.unshift({ date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), module: result.module, file: "Pasted CSV/TSV", records: result.records, status: result.records ? `Imported (${result.skipped || 0} skipped)` : "No valid rows" });
  log("Imported confirmed CSV/TSV rows", "Imports", `${result.records} ${result.module} records · ${result.skipped || 0} skipped`);
  saveData();
  renderAll();
  toast(`${result.records} ${result.module} record/s imported; ${result.skipped || 0} skipped.`);
});
window.addEventListener("afterprint", clearPrintTarget);
window.addEventListener("resize", updateTableScrollHints);
document.addEventListener("scroll", (event) => { if (event.target?.classList?.contains("table-card")) updateTableScrollHints(); }, true);
qs("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const loginForm = qs("#login-form");
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
    return toast(error.message || "Invalid email or password.");
  }
  currentUser = payload.user;
  try {
    const serverState = await MedlaneAPI.loadAppState();
    serverRevision = Number(serverState.revision || 0);
      data = serverState.data ? normalizeData({ ...structuredClone(initialData), ...serverState.data }) : normalizeData(emptyProductionData());
    await syncBackendUsers();
  } catch (error) {
    toast(`Logged in, but server data sync failed: ${error.message}`);
  }
  sessionStorage.setItem("medlane-session", JSON.stringify(currentUser));
  log("Logged in", "Authentication", currentUser.role);
  showWelcomeTransition(currentUser.name || currentUser.role, () => {
    if (loginButton) {
      loginButton.disabled = false;
      loginButton.classList.remove("is-loading");
      loginButton.textContent = originalLabel;
    }
    if (location.protocol !== "file:") history.replaceState(null, "", "/dashboard");
    document.body.classList.add("app-route");
    document.body.classList.remove("login-route", "public-landing");
    applyRole();
    renderAll();
    playDashboardLoginSound();
    toast(`Logged in as ${currentUser.name || currentUser.role}.`);
  });
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
  sessionStorage.removeItem("medlane-session");
  qs("#reset-screen").classList.add("hidden");
  qs("#login-screen").classList.remove("hidden");
  qs("#login-email").value = values.email;
  qs("#login-password").value = "";
  log("Completed password reset", "Authentication", values.email);
  toast("Password updated. You can now login.");
});
function logoutCurrentUser() {
  currentUser = null;
  sessionStorage.removeItem("medlane-session");
  sessionStorage.removeItem("medlane-dashboard-sound-played");
  MedlaneAPI?.setSession(null);
  document.body.classList.add("login-route");
  document.body.classList.remove("public-landing", "app-route");
  if (location.protocol !== "file:") history.replaceState(null, "", "/login");
  qs("#login-screen").classList.remove("hidden");
  restoreRememberedLogin();
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
  if (location.protocol !== "file:") history.replaceState(null, "", "/dashboard");
  document.body.classList.add("app-route");
  document.body.classList.remove("login-route", "public-landing");
  qs("#login-screen")?.classList.add("hidden");
  applyRole();
  renderAll();
  playDashboardLoginSound();
}
async function hydrateAuthenticatedSession() {
  if (!MedlaneAPI?.session()?.access_token) throw new Error("No active API session");
  const me = await MedlaneAPI.me();
  currentUser = me.user;
  sessionStorage.setItem("medlane-session", JSON.stringify(currentUser));
  const serverState = await MedlaneAPI.loadAppState();
  serverRevision = Number(serverState.revision || 0);
  data = serverState.data ? normalizeData({ ...structuredClone(initialData), ...serverState.data }) : normalizeData(emptyProductionData());
  await syncBackendUsers();
}
async function initializeRoute() {
  if (showSupabasePasswordSetup()) return;
  const loginRoute = isLoginRoute();
  const dashboardRoute = isDashboardRoute();
  if (!loginRoute && !dashboardRoute) {
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
      sessionStorage.removeItem("medlane-session");
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

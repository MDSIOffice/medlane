# Graph Report - medlane  (2026-10-19)

## Corpus Check
- 67 files · ~358,526 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 14 file(s) not represented in the graph (top: (none) 9, .css 3, .xml 1)

## Summary
- 2462 nodes · 5471 edges · 118 communities (99 shown, 19 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 428 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `891f3c15`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- public/scripts/state.js
- scripts/state.js
- scripts/events-bootstrap.js
- public/scripts/events-bootstrap.js
- syncPaymentRequestTotal
- public/scripts/modules.js
- scripts/modules.js
- public/scripts/vendor/pdf-lib.min.js
- scripts/vendor/pdf-lib.min.js
- renderAll
- fetch
- renderReconciliation
- importCheckedRows
- worker.js
- renderInvoicing
- importCheckedRows
- syncStockSheetRow
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- memoCardHtml
- supabase-production-schema.sql
- Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup
- composeAndSendDigest
- openModal
- renderClientInvoices
- renderUsers
- game.js
- renderLogs
- renderCollections
- renderPrintTemplateSidePanel
- buildSale
- renderProductIssues
- syncPaymentRequestTotal
- renderDashboard
- sendResendEmail
- i
- i
- public/scripts/config-data.js
- attachedFilesFor
- renderReconciliation
- scripts/config-data.js
- clearPrintTarget
- comboHandleKeydown
- Implementation Plan: 003-scheduled-digest-backup-reliability
- renderPrintTemplateSidePanel
- saveData
- renderDashboard
- syncStockSheetRow
- common.sh
- renderInventory
- LiveHub
- Feature Specification: Editable Inventory Stock Rows with Change History and Notes
- Tasks: [FEATURE NAME]
- User Scenarios & Testing *(mandatory)*
- saveStockEdit
- Bt
- za
- Bt
- za
- appendTableRows
- gi
- Ir
- renderProductIssues
- appendTableRows
- gi
- Ir
- renderPayables
- Feature Specification: [FEATURE NAME]
- setupReportDetailToolbar
- bi
- normalizeData
- workflowFacts
- bi
- Core Principles
- focusRecord
- ja
- Core Principles
- ge
- le
- Implementation Plan: [FEATURE]
- ge
- Agent Notes
- focusRecord
- archiveMasterlistRecord
- ja
- renderPayables
- le
- saveStockSheet
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- graphNote
- public/scripts/landing-motion.js
- renderAll
- Ni
- scripts/landing-motion.js
- Handoff: Medlane OS Login Page Redesign
- io
- Zs
- guardedDialogClose
- Ni
- postRecordEventsToDiscord
- io
- Zs
- normalizePayableWithholding
- renderInventory
- composeAndSendDigest
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard
- supabaseFetch
- package.json
- canEditActiveSection

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 113 edges
2. `renderAll()` - 58 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 32 edges
5. `composeAndSendDigest()` - 32 edges
6. `supabaseFetch()` - 31 edges
7. `renderInventory()` - 29 edges
8. `openModal()` - 29 edges
9. `recordSystemLog()` - 25 edges
10. `showSection()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Architecture notes` --references--> `canAccessKey()`  [INFERRED]
  specs/001-masterlist-archive-po-edits/plan.md → src/worker.js
- `Grilling follow-ups (2026-08-27, resolved)` --references--> `recordKeyFor()`  [INFERRED]
  specs/002-inventory-stock-edit-history/tasks.md → src/worker.js
- `Assumptions` --references--> `saveMonitoringState()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/spec.md → src/worker.js
- `2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`)` --references--> `runFiveMinuteScheduledTasks()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/plan.md → src/worker.js
- `Part D — Day → night` --references--> `resetGameState()`  [INFERRED]
  specs/005-luksong-milestone-juice-and-skins/spec.md → public/scripts/game.js

## Import Cycles
- None detected.

## Communities (118 total, 19 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (20): accounts, activeBanks(), activeClients(), activeEmployees(), activeItems(), activeRecords(), activeSuppliers(), clientCoordinates (+12 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (44): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+36 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (46): authHashParams(), clearBackupStatus(), confirmInviteUser(), connectLiveSocket(), downloadBackupFile(), downloadBackupObjectFile(), flushLiveSyncRender(), handleUserInvite() (+38 more)

### Community 4 - "syncPaymentRequestTotal"
Cohesion: 0.15
Nodes (22): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), findClientByName(), openInvoicesForPaymentRequest(), openPaymentRequestForInvoice(), paymentRequestDeductions() (+14 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (111): auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money(), bir2307QuarterRange() (+103 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.03
Nodes (90): auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money(), bir2307QuarterRange() (+82 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 9 - "renderAll"
Cohesion: 0.06
Nodes (48): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+40 more)

### Community 10 - "fetch"
Cohesion: 0.07
Nodes (48): assertPurchaseOrderClientsNotArchived(), authenticatedProfile(), authenticatedUser(), checkAssetPageHealth(), cleanEmail(), extractLinkResult(), fetch(), findAuthUserByEmail() (+40 more)

### Community 11 - "renderReconciliation"
Cohesion: 0.08
Nodes (26): applyReconciliationHistory(), demoRequestHistoryCard(), exportInvoicingCsv(), exportItemizedInvoicingCsv(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance() (+18 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.10
Nodes (36): approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions() (+28 more)

### Community 13 - "worker.js"
Cohesion: 0.04
Nodes (75): addDays(), applyReceivingLines(), auditContextForRequest(), BIRTHDAY_GIF_IDS, browserName(), buildServedQtyByPo(), canAccessKey(), canWrite() (+67 more)

### Community 14 - "renderInvoicing"
Cohesion: 0.12
Nodes (25): acknowledgeMemo(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus(), clientDocRecordId() (+17 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.10
Nodes (29): addStockSheetRow(), addTransferSheetRow(), branchOptions(), canApproveStockReceipts(), clearStockSheetDraft(), clearTransferSheetDraft(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt() (+21 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.15
Nodes (33): Context, deleteDiscordWebhookMessage(), discordSafeText(), editDiscordWebhookMessage(), gameBadgeForScore(), gameLevelForXp(), healthCheckLine(), loadDigestState() (+25 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.05
Nodes (20): arTrackerStage(), arTrackerTabs(), calendarToneOrder, canSeeNotification(), clientBalance(), clientCreditState(), clientTaxBadge(), clientTaxLabels() (+12 more)

### Community 20 - "memoCardHtml"
Cohesion: 0.13
Nodes (22): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+14 more)

### Community 21 - "supabase-production-schema.sql"
Cohesion: 0.09
Nodes (26): app_records_delete_guard, prevent_app_records_delete(), reserve_file_storage(), acknowledge_memo(), app_records_sales_client_balance_idx, client_sales_balance(), acknowledge_memo(), app_records (+18 more)

### Community 22 - "Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup"
Cohesion: 0.25
Nodes (7): Assumptions, Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup, Functional Requirements, Non-Functional / Constraints, Out of Scope, Requirements, Success Criteria

### Community 23 - "composeAndSendDigest"
Cohesion: 0.15
Nodes (24): auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), digestAttentionBannerHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml(), digestStatCardsHtml() (+16 more)

### Community 24 - "openModal"
Cohesion: 0.05
Nodes (58): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists() (+50 more)

### Community 25 - "renderClientInvoices"
Cohesion: 0.09
Nodes (27): addMonthsToDate(), clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportClientInvoicesCsv() (+19 more)

### Community 26 - "renderUsers"
Cohesion: 0.10
Nodes (27): canSearchCollectionsClientHistory(), dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams() (+19 more)

### Community 27 - "game.js"
Cohesion: 0.06
Nodes (82): addShake(), applyScoreResult(), attemptScoreSubmit(), clamp01(), closeGameModal(), computeThemeColors(), doJump(), drawGame() (+74 more)

### Community 28 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 29 - "renderCollections"
Cohesion: 0.08
Nodes (33): applyCollectionPayment(), approveCreditInvoice(), approvePaymentRequest(), canApproveCreditInvoice(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory() (+25 more)

### Community 30 - "renderPrintTemplateSidePanel"
Cohesion: 0.15
Nodes (25): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord(), ptCanvasScale() (+17 more)

### Community 31 - "buildSale"
Cohesion: 0.04
Nodes (69): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), competingPurchaseOrdersForItem(), CreditApprovalRequiredError, cvYear() (+61 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.19
Nodes (14): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), productIssueActionsMenu(), productIssueHistory(), productIssueParameterSummaryHtml(), productIssueStatusClass() (+6 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 34 - "renderDashboard"
Cohesion: 0.09
Nodes (32): averageOf(), backupRunLabel(), calendarState(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard(), daysBetween() (+24 more)

### Community 35 - "sendResendEmail"
Cohesion: 0.17
Nodes (18): Grilling: 003-scheduled-digest-backup-reliability, 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Problem, Related, same session (not part of this spec), Tasks: 003-scheduled-digest-backup-reliability (+10 more)

### Community 36 - "i"
Cohesion: 0.23
Nodes (17): a(), as(), _e(), i(), a(), l(), s(), is() (+9 more)

### Community 37 - "i"
Cohesion: 0.23
Nodes (17): a(), as(), _e(), i(), a(), l(), s(), is() (+9 more)

### Community 38 - "public/scripts/config-data.js"
Cohesion: 0.12
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 39 - "attachedFilesFor"
Cohesion: 0.09
Nodes (30): applyCollectionPayment(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+22 more)

### Community 40 - "renderReconciliation"
Cohesion: 0.20
Nodes (12): applyReconciliationHistory(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), periodKey(), recordReconciliationRun() (+4 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "clearPrintTarget"
Cohesion: 0.27
Nodes (10): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), fitPrintTemplateRows(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice(), printReportPreview() (+2 more)

### Community 43 - "comboHandleKeydown"
Cohesion: 0.38
Nodes (10): comboClose(), comboFilter(), comboHandleKeydown(), comboOpen(), comboOptionsFor(), comboRefresh(), comboRenderOptions(), comboReposition() (+2 more)

### Community 44 - "Implementation Plan: 003-scheduled-digest-backup-reliability"
Cohesion: 0.40
Nodes (4): Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback, Verification (no local env)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.20
Nodes (19): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+11 more)

### Community 46 - "saveData"
Cohesion: 0.23
Nodes (18): beginSaveOperation(), clearPendingSaveQueueKeys(), dedupeRecordsForSave(), endSaveOperation(), flushPendingSaveQueue(), hasPendingSaveQueue(), includesSearch(), inferredSaveKeys() (+10 more)

### Community 47 - "renderDashboard"
Cohesion: 0.19
Nodes (14): calendarState(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget(), registerCalendarWidget(), renderAnalytics(), renderCalendarSection() (+6 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.13
Nodes (29): check-prerequisites.sh script, check_dir(), check_file(), find_specify_root(), format_speckit_command(), get_current_branch(), get_feature_paths(), get_invoke_separator() (+21 more)

### Community 50 - "renderInventory"
Cohesion: 0.08
Nodes (30): addDemoRequestLine(), canApproveDemoLogistics(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), canRequestDemo(), demoRequestActions(), demoRequestInitialStatus() (+22 more)

### Community 52 - "Feature Specification: Editable Inventory Stock Rows with Change History and Notes"
Cohesion: 0.12
Nodes (15): Assumptions, Clarifications, Deferred to a follow-up, Edge Cases, Feature Specification: Editable Inventory Stock Rows with Change History and Notes, Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes (+7 more)

### Community 53 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 54 - "User Scenarios & Testing *(mandatory)*"
Cohesion: 0.14
Nodes (13): Assumptions, Edge Cases, Feature Specification: Masterlist Archive, Editable Submitted Client POs, Decimal PO Quantities, Login Preview Refresh, Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+5 more)

### Community 55 - "saveStockEdit"
Cohesion: 0.16
Nodes (21): openStockEditDialog(), saveStockEdit(), showStockHistory(), stockRecordIsEquipment(), stockRowByRef(), canEditStockRecord(), refreshInventoryFromServer(), Architecture notes (+13 more)

### Community 57 - "Bt"
Cohesion: 0.39
Nodes (8): Bt(), Dt(), Ht(), It(), Kt(), Nt(), Ot(), Wt()

### Community 58 - "za"
Cohesion: 0.39
Nodes (8): Ma(), Na(), Pa(), qa(), Ra(), Ta(), Va(), za()

### Community 59 - "Bt"
Cohesion: 0.39
Nodes (8): Bt(), Dt(), Ht(), It(), Kt(), Nt(), Ot(), Wt()

### Community 60 - "za"
Cohesion: 0.39
Nodes (8): Ma(), Na(), Pa(), qa(), Ra(), Ta(), Va(), za()

### Community 62 - "appendTableRows"
Cohesion: 0.24
Nodes (11): appendTableRows(), ensureViewMoreObserver(), loadMoreTableRows(), refreshLoadPreviousButton(), renderViewMoreButton(), rowHtml(), sortTable(), table() (+3 more)

### Community 63 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 64 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 65 - "renderProductIssues"
Cohesion: 0.11
Nodes (23): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), isBookkeepingOnlyLine(), itemClassificationFor(), lineChart(), monthLabel(), productIssueActionsMenu() (+15 more)

### Community 66 - "appendTableRows"
Cohesion: 0.50
Nodes (5): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "renderPayables"
Cohesion: 0.09
Nodes (29): addMonthsToDate(), clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportClientInvoicesCsv() (+21 more)

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "setupReportDetailToolbar"
Cohesion: 0.18
Nodes (20): assignedSalesAgent(), renderClientDocumentsReport(), renderCollectionsArReport(), renderComplianceAuditReport(), renderComplianceAuditTable(), renderReagentExpiryReport(), renderReportKpis(), renderSalesByAgentReport() (+12 more)

### Community 72 - "bi"
Cohesion: 0.47
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "normalizeData"
Cohesion: 0.25
Nodes (11): applyPendingSaveQueueToLocal(), buildWithItemRefresh(), emptyProductionData(), fmtDate(), followupWeekKey(), loadData(), mergeLiveChanges(), normalizeData() (+3 more)

### Community 74 - "workflowFacts"
Cohesion: 0.33
Nodes (6): calendarEventsForMonth(), generatedNoticeDate(), inventoryStatus(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 75 - "bi"
Cohesion: 0.47
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 76 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 77 - "focusRecord"
Cohesion: 0.40
Nodes (5): ensureFocusedRecordsRendered(), focusRecord(), goToFocused(), prepareFocusedSection(), toast()

### Community 78 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 79 - "Core Principles"
Cohesion: 0.18
Nodes (10): Core Principles, Governance, [PRINCIPLE_1_NAME], [PRINCIPLE_2_NAME], [PRINCIPLE_3_NAME], [PRINCIPLE_4_NAME], [PRINCIPLE_5_NAME], [PROJECT_NAME] Constitution (+2 more)

### Community 80 - "ge"
Cohesion: 0.50
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 81 - "le"
Cohesion: 0.22
Nodes (11): ae(), he(), le(), ne(), qe(), re(), se(), ue() (+3 more)

### Community 82 - "Implementation Plan: [FEATURE]"
Cohesion: 0.22
Nodes (8): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: [FEATURE], Project Structure, Source Code (repository root), Summary, Technical Context

### Community 83 - "ge"
Cohesion: 0.50
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 84 - "Agent Notes"
Cohesion: 0.40
Nodes (4): Agent Notes, Deploy Verification, Editing Gotchas, Project Shape

### Community 85 - "focusRecord"
Cohesion: 0.40
Nodes (5): ensureFocusedRecordsRendered(), focusRecord(), goToFocused(), prepareFocusedSection(), toast()

### Community 86 - "archiveMasterlistRecord"
Cohesion: 0.11
Nodes (21): archiveMasterlistRecord(), masterlistDisplayLabel(), masterlistModuleKey(), masterlistRecordKey(), restoreMasterlistRecord(), isArchived(), confirmFinalSave(), Architecture notes (+13 more)

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "renderPayables"
Cohesion: 0.13
Nodes (20): approveFinancialRequest(), canApproveFinancialRequest(), cancelFinancialRequest(), confirmFinancialPayment(), confirmPaymentDetailsModal(), demoRequestLineSummary(), financialRequestDetailFields(), itemizedSummary() (+12 more)

### Community 89 - "le"
Cohesion: 0.22
Nodes (11): ae(), he(), le(), ne(), qe(), re(), se(), ue() (+3 more)

### Community 90 - "saveStockSheet"
Cohesion: 0.17
Nodes (15): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), canApprovePurchaseOrders(), cancelPurchaseOrder(), canManagePoReceiving(), inventoryPoActionsCell() (+7 more)

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 97 - "renderAll"
Cohesion: 0.06
Nodes (47): MedlaneAPI, resetUserPermissions(), advancePurchaseOrderStatus(), applyOperationalReport(), applyRole(), approveExpense(), approvePurchaseOrder(), approveStockReceipt() (+39 more)

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "postRecordEventsToDiscord"
Cohesion: 0.08
Nodes (27): showAuditLogDetail(), showDigestMessagePreview(), Assumptions / Out of scope, Design, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord (+19 more)

### Community 108 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 112 - "renderInventory"
Cohesion: 0.10
Nodes (28): addDemoRequestLine(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineRow(), demoRequestLineSummary(), ensureInventoryDatalists() (+20 more)

### Community 113 - "composeAndSendDigest"
Cohesion: 0.12
Nodes (27): backupDigestLines(), buildBusinessSummaryLines(), composeAndSendDigest(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil() (+19 more)

### Community 123 - "supabaseFetch"
Cohesion: 0.12
Nodes (30): Grilling: 004-audit-digest-view-and-discord-events, activeMetadataUsage(), appStateKey(), assertCreditApprovalAllowed(), assertDemoRequestTransitionsAllowed(), assertFinancialApprovalAllowed(), auditLogDigestRows(), backupStatus() (+22 more)

### Community 129 - "package.json"
Cohesion: 0.22
Nodes (8): devDependencies, clean-css-cli, name, private, scripts, build, build:css, clean-css-cli

### Community 132 - "canEditActiveSection"
Cohesion: 0.67
Nodes (3): canEditActiveSection(), canEditModule(), editableModules()

## Knowledge Gaps
- **1 isolated node(s):** `clean-css-cli`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 540 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `saveStockSheet` to `supabaseFetch`?**
  _High betweenness centrality (0.237) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `composeAndSendDigest()` (e.g. with `Problem` and `Design`) actually correct?**
  _`composeAndSendDigest()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `clean-css-cli` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.0507399577167019 - nodes in this community are weakly interconnected._
- **Why does `MedlaneAPI` connect `renderAll` to `saveStockSheet`, `supabaseFetch`, `renderInvoicing`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Why does `backupStatus()` connect `supabaseFetch` to `renderAll`, `saveStockSheet`, `fetch`, `worker.js`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
# Graph Report - medlane  (2026-11-03)

## Corpus Check
- 69 files · ~369,893 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 15 file(s) not represented in the graph (top: (none) 9, .css 3, .ico 1)

## Summary
- 2518 nodes · 5618 edges · 118 communities (102 shown, 16 thin omitted)
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 431 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6e792d76`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- public/scripts/state.js
- scripts/state.js
- scripts/events-bootstrap.js
- public/scripts/events-bootstrap.js
- openModal
- public/scripts/modules.js
- scripts/modules.js
- public/scripts/vendor/pdf-lib.min.js
- scripts/vendor/pdf-lib.min.js
- renderAll
- fetch
- perf-report.js
- importCheckedRows
- worker.js
- renderInvoicing
- importCheckedRows
- syncStockSheetRow
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- renderReconciliation
- supabase-production-schema.sql
- renderCollections
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
- renderCollectionMapVisual
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
- json
- Feature Specification: Editable Inventory Stock Rows with Change History and Notes
- Tasks: [FEATURE NAME]
- User Scenarios & Testing *(mandatory)*
- saveStockEdit
- lineChart
- Bt
- za
- Bt
- za
- ensurePendingSaveQueueHydrated
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
- Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
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

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 117 edges
2. `renderAll()` - 58 edges
3. `renderAll()` - 52 edges
4. `supabaseFetch()` - 33 edges
5. `openModal()` - 32 edges
6. `composeAndSendDigest()` - 32 edges
7. `renderInventory()` - 29 edges
8. `openModal()` - 29 edges
9. `recordSystemLog()` - 27 edges
10. `appStateKey()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `Architecture notes` --references--> `canAccessKey()`  [INFERRED]
  specs/001-masterlist-archive-po-edits/plan.md → src/worker.js
- `Grilling follow-ups (2026-08-27, resolved)` --references--> `recordKeyFor()`  [INFERRED]
  specs/002-inventory-stock-edit-history/tasks.md → src/worker.js
- `Assumptions` --references--> `saveMonitoringState()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/spec.md → src/worker.js
- `Part D — Day → night` --references--> `resetGameState()`  [INFERRED]
  specs/005-luksong-milestone-juice-and-skins/spec.md → public/scripts/game.js
- `Files touched` --references--> `editPurchaseOrder()`  [INFERRED]
  specs/001-masterlist-archive-po-edits/plan.md → public/scripts/modules.js

## Import Cycles
- None detected.

## Communities (118 total, 16 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (23): accounts, activeBanks(), activeClients(), activeEmployees(), activeItems(), activeRecords(), activeSuppliers(), canEditActiveSection() (+15 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.08
Nodes (31): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+23 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.05
Nodes (56): authHashParams(), clearBackupStatus(), confirmInviteUser(), connectLiveSocket(), downloadBackupFile(), downloadBackupObjectFile(), flushLiveSyncRender(), handleUserInvite() (+48 more)

### Community 4 - "openModal"
Cohesion: 0.15
Nodes (22): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), findClientByName(), openInvoicesForPaymentRequest(), openPaymentRequestForInvoice(), paymentRequestDeductions() (+14 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (110): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+102 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.03
Nodes (77): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+69 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 9 - "renderAll"
Cohesion: 0.05
Nodes (52): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), applyRole(), approveExpense(), approvePurchaseOrder(), canApproveMigrations(), canApprovePurchaseOrders() (+44 more)

### Community 10 - "fetch"
Cohesion: 0.07
Nodes (42): Context, checkAssetPageHealth(), cleanEmail(), dedupeRowsByRecordKey(), enrichAuditLogEntry(), extractLinkResult(), fetch(), findAuthUserByEmail() (+34 more)

### Community 11 - "perf-report.js"
Cohesion: 0.12
Nodes (31): avg(), buildRecommendations(), buildWeeklyReport(), C, chartImageUrl(), dailyRows(), delta(), derivePoints() (+23 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "worker.js"
Cohesion: 0.04
Nodes (64): addDays(), applyReceivingLines(), BIRTHDAY_GIF_IDS, buildServedQtyByPo(), canAccessKey(), canWrite(), defaultSeedSignature, DEMO_ONLY_ROLES (+56 more)

### Community 14 - "renderInvoicing"
Cohesion: 0.06
Nodes (48): acknowledgeMemo(), applyReconciliationHistory(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus() (+40 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.10
Nodes (38): applyCollectionPayment(), approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest() (+30 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.07
Nodes (43): MedlaneAPI, resetUserPermissions(), addStockSheetRow(), addTransferSheetRow(), advancePurchaseOrderStatus(), approvePurchaseOrder(), approveStockReceipt(), branchOptions() (+35 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.12
Nodes (41): Grilling: 003-scheduled-digest-backup-reliability, 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Problem, collectLiveDetails(), claimAutomationPeriod(), deleteDiscordWebhookMessage() (+33 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.05
Nodes (20): arTrackerStage(), arTrackerTabs(), calendarToneOrder, canSeeNotification(), clientBalance(), clientCreditState(), clientTaxBadge(), clientTaxLabels() (+12 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "renderReconciliation"
Cohesion: 0.11
Nodes (20): applyReconciliationHistory(), exportInvoicingCsv(), exportItemizedInvoicingCsv(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), invoicingVisibleSales() (+12 more)

### Community 21 - "supabase-production-schema.sql"
Cohesion: 0.07
Nodes (36): app_records_delete_guard, prevent_app_records_delete(), reserve_file_storage(), acknowledge_memo(), app_records_sales_client_balance_idx, client_sales_balance(), app_state_updated_by_idx, backup_runs_created_by_idx (+28 more)

### Community 22 - "renderCollections"
Cohesion: 0.11
Nodes (27): applyCollectionPayment(), approveFinancialRequest(), approvePaymentRequest(), canApprovePaymentRequests(), cancelFinancialRequest(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory() (+19 more)

### Community 23 - "composeAndSendDigest"
Cohesion: 0.17
Nodes (22): brandedEmailHtml(), brandedInviteEmailHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml(), digestStatCardsHtml(), digestToneColors(), escapeHtml() (+14 more)

### Community 24 - "openModal"
Cohesion: 0.05
Nodes (50): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists() (+42 more)

### Community 25 - "renderClientInvoices"
Cohesion: 0.12
Nodes (19): clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), demoRequestHistoryCard(), exportClientInvoicesCsv(), itemForecastReportHtml(), memoAudienceLabel() (+11 more)

### Community 26 - "renderUsers"
Cohesion: 0.10
Nodes (27): canSearchCollectionsClientHistory(), dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams() (+19 more)

### Community 27 - "game.js"
Cohesion: 0.06
Nodes (82): addShake(), applyScoreResult(), attemptScoreSubmit(), clamp01(), closeGameModal(), computeThemeColors(), doJump(), drawGame() (+74 more)

### Community 28 - "renderLogs"
Cohesion: 0.12
Nodes (21): dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), memoRecipientCount() (+13 more)

### Community 29 - "renderCollections"
Cohesion: 0.10
Nodes (26): calendarState(), collectionStatusActions(), contactActionCard(), isLogisticsDashboard(), loadMoreCollections(), loadMorePaymentRequests(), multiSeriesChart(), navigateCalendarWidget() (+18 more)

### Community 30 - "renderPrintTemplateSidePanel"
Cohesion: 0.14
Nodes (26): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord() (+18 more)

### Community 31 - "buildSale"
Cohesion: 0.04
Nodes (70): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), competingPurchaseOrdersForItem(), CreditApprovalRequiredError, cvYear() (+62 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.17
Nodes (16): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), lineChart(), productIssueActionsMenu(), productIssueHistory(), productIssueParameterSummaryHtml(), productIssueStatusClass() (+8 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.15
Nodes (22): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), findClientByName(), openInvoicesForPaymentRequest(), openPaymentRequestForInvoice(), paymentRequestDeductions() (+14 more)

### Community 34 - "renderDashboard"
Cohesion: 0.15
Nodes (18): averageOf(), backupRunLabel(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard(), daysBetween(), demoTurnaroundDays() (+10 more)

### Community 35 - "sendResendEmail"
Cohesion: 0.17
Nodes (16): 1. Resend pacing + 429 retry (`sendResendEmail` area), Related, same session (not part of this spec), Tasks: 003-scheduled-digest-backup-reliability, Design, Part A — View the digest email from Audit Logs, Requirements, Part A — View digest message from Audit Logs, gunzipText() (+8 more)

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
Cohesion: 0.13
Nodes (24): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+16 more)

### Community 40 - "renderCollectionMapVisual"
Cohesion: 0.10
Nodes (24): collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds(), geoRegionName() (+16 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "clearPrintTarget"
Cohesion: 0.14
Nodes (18): addMonthsToDate(), changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastRows(), previewInventoryPurchaseOrder() (+10 more)

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
Cohesion: 0.24
Nodes (18): beginSaveOperation(), clearPendingSaveQueueKeys(), dedupeRecordsForSave(), endSaveOperation(), flushPendingSaveQueue(), hasPendingSaveQueue(), includesSearch(), inferredSaveKeys() (+10 more)

### Community 47 - "renderDashboard"
Cohesion: 0.12
Nodes (20): backupRunLabel(), calendarState(), canManageUsers(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), formatBytes(), formatSessionDate() (+12 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.13
Nodes (29): check-prerequisites.sh script, check_dir(), check_file(), find_specify_root(), format_speckit_command(), get_current_branch(), get_feature_paths(), get_invoke_separator() (+21 more)

### Community 50 - "renderInventory"
Cohesion: 0.10
Nodes (26): canApproveDemoLogistics(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), canRequestDemo(), demoRequestActions(), demoRequestInitialStatus(), inventoryItemLabel() (+18 more)

### Community 51 - "json"
Cohesion: 0.10
Nodes (22): auditContextForRequest(), authenticatedProfile(), authenticatedUser(), browserName(), clientIp(), createAppSession(), deviceName(), isTransientJwtClockSkew() (+14 more)

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

### Community 56 - "lineChart"
Cohesion: 0.24
Nodes (11): isBookkeepingOnlyLine(), itemClassificationFor(), lineChart(), monthLabel(), renderAnalytics(), renderGrowthAnalytics(), renderSalesBreakdownReport(), renderSupplierPayablesReport() (+3 more)

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

### Community 61 - "ensurePendingSaveQueueHydrated"
Cohesion: 0.67
Nodes (4): ensurePendingSaveQueueHydrated(), openPendingSaveDb(), readPendingSaveQueueFromDb(), writePendingSaveQueueToDb()

### Community 62 - "appendTableRows"
Cohesion: 0.24
Nodes (12): appendTableRows(), ensureViewMoreObserver(), entryHasMore(), loadMoreTableRows(), refreshLoadPreviousButton(), renderViewMoreButton(), rowHtml(), sortTable() (+4 more)

### Community 63 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 64 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 65 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 66 - "appendTableRows"
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "renderPayables"
Cohesion: 0.10
Nodes (25): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), itemForecastMonthKeys(), itemForecastMonthLabels() (+17 more)

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "setupReportDetailToolbar"
Cohesion: 0.20
Nodes (19): assignedSalesAgent(), renderClientDocumentsReport(), renderCollectionsArReport(), renderComplianceAuditReport(), renderComplianceAuditTable(), renderReagentExpiryReport(), renderReportKpis(), renderSalesByAgentReport() (+11 more)

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
Cohesion: 0.14
Nodes (13): confirmFinalSave(), Architecture notes, Design decisions, Implementation Plan: 001-masterlist-archive-po-edits, Out of scope, Risks / mitigations, Cross-cutting, Status (2026-08-27) (+5 more)

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "renderPayables"
Cohesion: 0.08
Nodes (31): approveCreditInvoice(), approveFinancialRequest(), canApproveCreditInvoice(), canApproveFinancialRequest(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+23 more)

### Community 89 - "le"
Cohesion: 0.22
Nodes (11): ae(), he(), le(), ne(), qe(), re(), se(), ue() (+3 more)

### Community 90 - "Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup"
Cohesion: 0.25
Nodes (7): Assumptions, Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup, Functional Requirements, Non-Functional / Constraints, Out of Scope, Requirements, Success Criteria

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 97 - "renderAll"
Cohesion: 0.07
Nodes (42): applyOperationalReport(), applyRole(), approveExpense(), archiveMasterlistRecord(), canApproveMigrations(), canRestoreSection(), confirmTransferDispatch(), confirmTransferReceive() (+34 more)

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "postRecordEventsToDiscord"
Cohesion: 0.11
Nodes (19): Assumptions / Out of scope, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part B — Broadcast workflow status changes / approvals to Discord, Requirements, Success Criteria, Follow-up (not done), Part B — Discord workflow events (+11 more)

### Community 108 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 112 - "renderInventory"
Cohesion: 0.12
Nodes (24): canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineSummary(), inventoryItemLabel(), itemizedSummary(), payable2307Cell() (+16 more)

### Community 113 - "composeAndSendDigest"
Cohesion: 0.11
Nodes (29): auditLogTableHtml(), backupDigestLines(), buildBusinessSummaryLines(), composeAndSendDigest(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestAttentionBannerHtml() (+21 more)

### Community 123 - "supabaseFetch"
Cohesion: 0.10
Nodes (35): Grilling: 004-audit-digest-view-and-discord-events, collectSample(), hasAccessToken(), activeMetadataUsage(), appStateKey(), assertCreditApprovalAllowed(), assertDemoRequestTransitionsAllowed(), assertFinancialApprovalAllowed() (+27 more)

### Community 129 - "package.json"
Cohesion: 0.22
Nodes (8): devDependencies, clean-css-cli, name, private, scripts, build, build:css, clean-css-cli

## Knowledge Gaps
- **1 isolated node(s):** `clean-css-cli`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 545 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderAll` to `fetch`, `supabaseFetch`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **What connects `clean-css-cli` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.04902867715078631 - nodes in this community are weakly interconnected._
- **Why does `MedlaneAPI` connect `syncStockSheetRow` to `fetch`, `supabaseFetch`, `renderInvoicing`?**
  _High betweenness centrality (0.214) - this node is a cross-community bridge._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Why does `backupStatus()` connect `supabaseFetch` to `syncStockSheetRow`, `renderAll`, `fetch`, `worker.js`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08246225319396051 - nodes in this community are weakly interconnected._
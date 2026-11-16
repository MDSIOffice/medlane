# Graph Report - medlane  (2026-11-16)

## Corpus Check
- 123 files · ~711,175 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: (none) 11, .csv 4, .css 3)

## Summary
- 3510 nodes · 7839 edges · 162 communities (132 shown, 30 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 456 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c1e83296`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- public/scripts/state.js
- scripts/state.js
- scripts/events-bootstrap.js
- public/scripts/events-bootstrap.js
- clearPrintTarget
- public/scripts/modules.js
- scripts/modules.js
- public/scripts/vendor/pdf-lib.min.js
- scripts/vendor/pdf-lib.min.js
- renderAll
- fetch
- perf-report.js
- importCheckedRows
- worker.js
- attachedFilesFor
- rowValue
- syncStockSheetRow
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- invoicingTabModel
- supabase-production-schema.sql
- analyticsOverviewHtml
- composeAndSendDigest
- openModal
- printableFooterHtml
- renderLogs
- game.js
- renderLogs
- renderPrintTemplateSidePanel
- records.d.ts
- openModal
- renderProductIssues
- syncPaymentRequestTotal
- renderDashboard
- memoCardHtml
- i
- i
- public/scripts/config-data.js
- attachedFilesFor
- renderCollections
- scripts/config-data.js
- syncBackendUsers
- comboHandleKeydown
- Implementation Plan: 003-scheduled-digest-backup-reliability
- renderPrintTemplateSidePanel
- qs
- renderDashboard
- syncStockSheetRow
- common.sh
- inventoryTabModelBase
- renderInventory
- Feature Specification: Editable Inventory Stock Rows with Change History and Notes
- Tasks: [FEATURE NAME]
- User Scenarios & Testing *(mandatory)*
- saveStockEdit
- buildSale
- Bt
- za
- Bt
- za
- ensurePendingSaveQueueHydrated
- appendTableRows
- gi
- Ir
- showSection
- appendTableRows
- gi
- Ir
- api.d.ts
- Feature Specification: [FEATURE NAME]
- showSection
- bi
- recon-page.js
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
- clearBackupStatus
- le
- Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- escapeHtml
- public/scripts/landing-motion.js
- connectLiveSocket
- sendResendEmail
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
- persistRecordsNow
- isAuthenticatedRoute
- load-worker.mjs
- ui-kit.js
- seed.mjs
- supabaseFetch
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard
- authenticatedProfile
- load-test.mjs
- compilerOptions
- Feature Spec 006 — Inventory page redesign
- 006-inventory-redesign/tasks.md
- fake-backend.mjs
- package.json
- masterlists-page.js
- scripts
- perf-measure.mjs
- sendResendEmail
- any-ratchet.mjs
- OkResponse
- slow-network.spec.mjs
- recon.js
- tsconfig.worker.json
- smoke.spec.mjs
- devDependencies
- inventoryStatus
- annotate-params.py
- landing-journey.js
- runRecon
- semantic-diff.sh
- clearPrintTarget
- guardedDialogClose
- DescribedPrintable
- recon.test.mjs
- start.sh
- noimplicitany-gate.sh
- strict-progress.sh
- global.d.ts
- calendarEventsForMonth
- IncomingSale
- PoLine

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 147 edges
2. `renderAll()` - 52 edges
3. `supabaseFetch()` - 42 edges
4. `renderAll()` - 35 edges
5. `openModal()` - 35 edges
6. `composeAndSendDigest()` - 32 edges
7. `analyticsOverviewHtml()` - 30 edges
8. `openModal()` - 29 edges
9. `recordSystemLog()` - 29 edges
10. `supabaseFetchAll()` - 28 edges

## Surprising Connections (you probably didn't know these)
- `Architecture notes` --references--> `canAccessKey()`  [INFERRED]
  specs/001-masterlist-archive-po-edits/plan.md → src/worker.js
- `Assumptions` --references--> `saveMonitoringState()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/spec.md → src/worker.js
- `2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`)` --references--> `runFiveMinuteScheduledTasks()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/plan.md → src/worker.js
- `Grilling: 005-luksong-milestone-juice-and-skins` --references--> `load()`  [INFERRED]
  specs/005-luksong-milestone-juice-and-skins/grilling.md → tests/helpers/load-worker.mjs
- `Part D — Day → night` --references--> `resetGameState()`  [INFERRED]
  specs/005-luksong-milestone-juice-and-skins/spec.md → public/scripts/game.js

## Import Cycles
- None detected.

## Communities (162 total, 30 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.02
Nodes (55): accounts, activeBanks(), activeClients(), activeEmployees(), activeItems(), activeRecords(), activeSuppliers(), ANALYTICS_TABS (+47 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (45): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+37 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.07
Nodes (25): authHashParams(), IMPORT_TEMPLATES, initializeRoute(), inventoryChangeView(), inventoryLoadMore, inventorySetStatus(), isDashboardRoute(), isLoginRoute() (+17 more)

### Community 4 - "clearPrintTarget"
Cohesion: 0.10
Nodes (24): clientInvoiceReportHtml(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), forecastItemMatchesQuery(), itemForecastMonthKeys(), itemForecastMonthLabels() (+16 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.01
Nodes (176): addDemoRequestLine(), auditEntryById, auditSummaryState, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY() (+168 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.02
Nodes (102): auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money(), bir2307QuarterRange() (+94 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 9 - "renderAll"
Cohesion: 0.06
Nodes (49): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), applyRole(), approveExpense(), approvePurchaseOrder(), canApproveMigrations(), canApprovePurchaseOrders() (+41 more)

### Community 10 - "fetch"
Cohesion: 0.06
Nodes (57): Context, assertCalendarEventChangesAllowed(), assertCreditApprovalAllowed(), assertDemoRequestTransitionsAllowed(), assertFinancialApprovalAllowed(), assertMigratedStockAllowed(), assertPurchaseOrderClientsNotArchived(), assertSaveNotStale() (+49 more)

### Community 11 - "perf-report.js"
Cohesion: 0.12
Nodes (33): avg(), buildRecommendations(), buildWeeklyReport(), C, chartImageUrl(), collectLiveDetails(), collectSample(), dailyRows() (+25 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "worker.js"
Cohesion: 0.03
Nodes (98): getPath(), saleDocType(), saleNo(), setPath(), applyReceivingLines(), applyReconOps(), assertMasterlistUnique(), AUDIT_WATCHED_FIELDS (+90 more)

### Community 14 - "attachedFilesFor"
Cohesion: 0.31
Nodes (9): attachedFilesFor(), attachedFilesHtml(), clientDocRecordId(), clientDocsModalRowsHtml(), docUploadButtons(), openClientDocsModal(), payableAttachmentCell(), refreshClientDocsModal() (+1 more)

### Community 15 - "rowValue"
Cohesion: 0.07
Nodes (53): applyCollectionPayment(), approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest() (+45 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.10
Nodes (29): addStockSheetRow(), addTransferSheetRow(), branchOptions(), clearStockSheetDraft(), clearTransferSheetDraft(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt(), findItemForSheetRow() (+21 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.09
Nodes (54): hasAccessToken(), appStateKey(), auditLogDigestRows(), backupStatus(), boardMonitorsDue(), checkBackupFreshnessHealth(), checkSupabaseAppRecordsHealth(), composeAndSendDigest() (+46 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.05
Nodes (18): CALENDAR_DEPARTMENTS, CALENDAR_OTHER_DEPARTMENT, calendarToneOrder, canSeeNotification(), clientBalance(), clientCreditState(), clientTaxBadge(), clientTaxLabels() (+10 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "invoicingTabModel"
Cohesion: 0.08
Nodes (52): bizSaleBranch(), canUpdateDeliveryStatus(), clientOrdersModel(), collectionBranches(), collectionMethodKey(), collectionMethodLabel(), collectionMethodSub(), collectionPaymentsState() (+44 more)

### Community 21 - "supabase-production-schema.sql"
Cohesion: 0.06
Nodes (40): app_records_delete_guard, prevent_app_records_delete(), reserve_file_storage(), acknowledge_memo(), app_records_sales_client_balance_idx, client_sales_balance(), app_state_updated_by_idx, backup_runs_created_by_idx (+32 more)

### Community 22 - "analyticsOverviewHtml"
Cohesion: 0.06
Nodes (89): addMonthsToDate(), analyticsOverviewHtml(), analyticsTabModel(), analyticsValueHtml(), bizFacts(), bizItemCosts(), bizMargin(), bizMarginText() (+81 more)

### Community 23 - "composeAndSendDigest"
Cohesion: 0.13
Nodes (24): addDays(), backupDigestLines(), buildBusinessSummaryLines(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil() (+16 more)

### Community 24 - "openModal"
Cohesion: 0.05
Nodes (52): buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists(), financialLineTemplate() (+44 more)

### Community 25 - "printableFooterHtml"
Cohesion: 0.14
Nodes (19): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), itemForecastMonthKeys(), itemForecastMonthLabels() (+11 more)

### Community 26 - "renderLogs"
Cohesion: 0.06
Nodes (53): analyticsQueryString(), auditActivityRow(), auditChanges(), auditFailedByAccount(), auditIsLate(), auditManilaHour(), auditSignInFacts(), auditStockWithoutReason() (+45 more)

### Community 27 - "game.js"
Cohesion: 0.06
Nodes (82): addShake(), applyScoreResult(), attemptScoreSubmit(), clamp01(), closeGameModal(), computeThemeColors(), doJump(), drawGame() (+74 more)

### Community 28 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 29 - "renderPrintTemplateSidePanel"
Cohesion: 0.14
Nodes (26): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord() (+18 more)

### Community 30 - "records.d.ts"
Cohesion: 0.04
Nodes (47): AccessMode, AppData, AppNotification, AppRecordRow, AppRole, AppUser, Bank, CalendarEvent (+39 more)

### Community 31 - "openModal"
Cohesion: 0.07
Nodes (41): canManageEmployeeSalary(), collectFinancialLines(), collectMultiCheques(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions() (+33 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 34 - "renderDashboard"
Cohesion: 0.07
Nodes (41): addCalendarEventDialog(), averageOf(), backupRunLabel(), calendarState(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard() (+33 more)

### Community 35 - "memoCardHtml"
Cohesion: 0.13
Nodes (22): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+14 more)

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
Nodes (29): applyReconciliationHistory(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+21 more)

### Community 40 - "renderCollections"
Cohesion: 0.10
Nodes (29): applyCollectionPayment(), approveFinancialRequest(), approvePaymentRequest(), canApprovePaymentRequests(), cancelFinancialRequest(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory() (+21 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "syncBackendUsers"
Cohesion: 0.33
Nodes (7): confirmInviteUser(), handleUserInvite(), hydrateAuthenticatedSession(), mergeUsersFromBackend(), submitModal(), syncBackendUsers(), toggleUserDisabled()

### Community 43 - "comboHandleKeydown"
Cohesion: 0.38
Nodes (10): comboClose(), comboFilter(), comboHandleKeydown(), comboOpen(), comboOptionsFor(), comboRefresh(), comboRenderOptions(), comboReposition() (+2 more)

### Community 44 - "Implementation Plan: 003-scheduled-digest-backup-reliability"
Cohesion: 0.40
Nodes (4): Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback, Verification (no local env)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.14
Nodes (26): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord() (+18 more)

### Community 46 - "qs"
Cohesion: 0.16
Nodes (21): applyPendingSaveQueueToLocal(), buildWithItemRefresh(), clearPendingSaveQueueKeys(), emptyProductionData(), flushPendingSaveQueue(), fmtDate(), followupWeekKey(), hasPendingSaveQueue() (+13 more)

### Community 47 - "renderDashboard"
Cohesion: 0.19
Nodes (14): calendarState(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget(), registerCalendarWidget(), renderAnalytics(), renderCalendarSection() (+6 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.13
Nodes (29): check-prerequisites.sh script, check_dir(), check_file(), find_specify_root(), format_speckit_command(), get_current_branch(), get_feature_paths(), get_invoke_separator() (+21 more)

### Community 50 - "inventoryTabModelBase"
Cohesion: 0.06
Nodes (51): canCreateSupplierPo(), canRequestDemo(), demoRequestInitialStatus(), inventoryBranchLabel(), inventoryBranchOptions(), inventoryCardsHtml(), inventoryExpiryInfo(), inventoryFilteredRows() (+43 more)

### Community 51 - "renderInventory"
Cohesion: 0.09
Nodes (31): addDemoRequestLine(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineRow(), demoRequestLineSummary(), ensureInventoryDatalists() (+23 more)

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

### Community 56 - "buildSale"
Cohesion: 0.07
Nodes (47): buildPurchaseOrder(), buildSale(), clientOrderShipsFrom(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), competingPurchaseOrdersForItem(), CreditApprovalRequiredError, discountNeedsApproval() (+39 more)

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
Cohesion: 0.47
Nodes (6): ensurePendingSaveQueueHydrated(), openPendingSaveDb(), pendingSaveMetaDbKey(), pendingSaveQueueKey(), readPendingSaveQueueFromDb(), writePendingSaveQueueToDb()

### Community 62 - "appendTableRows"
Cohesion: 0.24
Nodes (12): changeTablePage(), entryHasMore(), refreshLoadPreviousButton(), renderTablePager(), rowHtml(), sanitizeHtml(), showTablePage(), sortTable() (+4 more)

### Community 63 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 64 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 65 - "showSection"
Cohesion: 0.07
Nodes (37): applyRole(), canActOnProductIssue(), canRestoreSection(), clientSupportHistoryCard(), compressImageFile(), confirmResolveProductIssue(), ensureUploadedFilesLoaded(), handleWorkflowAction() (+29 more)

### Community 66 - "appendTableRows"
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "api.d.ts"
Cohesion: 0.05
Nodes (37): ApiSession, AppSessionRow, AppStateResponse, AuditSummaryResponse, BackupObject, BackupObjectsResponse, BackupResponse, BackupRun (+29 more)

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "showSection"
Cohesion: 0.12
Nodes (42): applyOperationalReport(), assignedSalesAgent(), lineChart(), masterlistRecordOpenActivity(), monthLabel(), payableFacts(), payablePaidAmount(), renderClientDocumentsReport() (+34 more)

### Community 72 - "bi"
Cohesion: 0.47
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "recon-page.js"
Cohesion: 0.18
Nodes (37): handleReconClick(), inventoryRecordKey(), loadRecon(), RECON_TABS, reconAssignDifference(), reconBankStatement(), reconCanFix(), reconCashCount() (+29 more)

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
Nodes (21): archiveMasterlistRecord(), editPurchaseOrder(), masterlistDisplayLabel(), masterlistModuleKey(), masterlistRecordKey(), restoreMasterlistRecord(), confirmFinalSave(), Architecture notes (+13 more)

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

### Community 89 - "le"
Cohesion: 0.22
Nodes (11): ae(), he(), le(), ne(), qe(), re(), se(), ue() (+3 more)

### Community 90 - "Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup"
Cohesion: 0.25
Nodes (7): Assumptions, Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup, Functional Requirements, Non-Functional / Constraints, Out of Scope, Requirements, Success Criteria

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 93 - "escapeHtml"
Cohesion: 0.15
Nodes (24): auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), digestAttentionBannerHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml(), digestStatCardsHtml() (+16 more)

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 95 - "connectLiveSocket"
Cohesion: 0.47
Nodes (6): connectLiveSocket(), flushLiveSyncRender(), liveSyncCanRender(), runLiveSync(), scheduleLiveFallbackPoll(), startLiveSync()

### Community 96 - "sendResendEmail"
Cohesion: 0.12
Nodes (21): authenticatedUser(), cleanEmail(), extractLinkResult(), findAuthUserByEmail(), findAuthUserForProfileOrEmail(), generateSupabaseActionLink(), isTransientJwtClockSkew(), json() (+13 more)

### Community 97 - "renderAll"
Cohesion: 0.06
Nodes (52): MedlaneAPI, resetUserPermissions(), acknowledgeMemo(), advancePurchaseOrderStatus(), approveCreditInvoice(), approveExpense(), approveFinancialRequest(), approvePurchaseOrder() (+44 more)

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "postRecordEventsToDiscord"
Cohesion: 0.07
Nodes (31): showAuditLogDetail(), showDigestMessagePreview(), Assumptions / Out of scope, Design, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord (+23 more)

### Community 108 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 109 - "persistRecordsNow"
Cohesion: 0.14
Nodes (26): applySavedStock(), beginSaveOperation(), canEditActiveSection(), canEditModule(), canEditSaveKey(), canRequestSupportReport(), dedupeRecordsForSave(), editableModules() (+18 more)

### Community 110 - "isAuthenticatedRoute"
Cohesion: 0.90
Nodes (5): isAuthenticatedRoute(), scheduleAutofillLoginSubmit(), startLoginAutoSignIn(), submitLoginIfReady(), tryBiometricLogin()

### Community 111 - "load-worker.mjs"
Cohesion: 0.06
Nodes (34): env, NOT_RESTORED, me(), NON_MANAGEMENT, as(), env, EXPOSED, load() (+26 more)

### Community 112 - "ui-kit.js"
Cohesion: 0.09
Nodes (27): UI_SERIES_TWO, uiAttrs(), uiBarChart(), uiButton(), uiCellDoc(), uiDashboardGrid(), uiDataTable(), uiDetailPanel() (+19 more)

### Community 113 - "seed.mjs"
Cohesion: 0.10
Nodes (26): api(), AREAS, args, BRANCHES, BRANDS, buildData(), CATEGORIES, ensureAccounts() (+18 more)

### Community 114 - "supabaseFetch"
Cohesion: 0.09
Nodes (33): Grilling: 004-audit-digest-view-and-discord-events, activeMetadataUsage(), assertSaleBasics(), assertSaleNotNegative(), auditLogRow(), createBackup(), createMovementBaseline(), fetchModuleData() (+25 more)

### Community 123 - "authenticatedProfile"
Cohesion: 0.13
Nodes (19): applyPreviewRole(), auditContextForRequest(), authenticatedProfile(), authenticatedProfileCached(), browserName(), clientIp(), createAppSession(), deviceName() (+11 more)

### Community 124 - "load-test.mjs"
Cohesion: 0.11
Nodes (19): accounts, args, BASE, call(), DURATION_S, jitter(), metrics, pct() (+11 more)

### Community 125 - "compilerOptions"
Cohesion: 0.09
Nodes (22): compilerOptions, allowJs, alwaysStrict, checkJs, forceConsistentCasingInFileNames, lib, module, moduleResolution (+14 more)

### Community 126 - "Feature Spec 006 — Inventory page redesign"
Cohesion: 0.50
Nodes (3): Feature Spec 006 — Inventory page redesign, Out of scope / data gaps (reported, not invented), Requirements

### Community 128 - "fake-backend.mjs"
Cohesion: 0.09
Nodes (18): RECON_AREAS, authedRoutes, b64(), fakeToken(), newSession(), port, reconDiffs, reconOverview() (+10 more)

### Community 129 - "package.json"
Cohesion: 0.18
Nodes (8): name, private, clean-css-cli, @cloudflare/workers-types, @playwright/test, supabase, typescript, wrangler

### Community 130 - "masterlists-page.js"
Cohesion: 0.16
Nodes (31): handleMasterlistsClick(), loadMasterAudit(), MASTER_RULES, MASTER_TABS, masterAddBranch(), masterAudit, masterCanArchive(), masterCanEdit() (+23 more)

### Community 131 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, build:css, check:any, check:noimplicitany, check:semantic, load-test, local (+8 more)

### Community 132 - "perf-measure.mjs"
Cohesion: 0.17
Nodes (13): collect(), dashboard(), LABEL, landing(), LIVE_URL, median(), newPage(), observers() (+5 more)

### Community 133 - "sendResendEmail"
Cohesion: 0.22
Nodes (14): Grilling: 003-scheduled-digest-backup-reliability, 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Problem, Related, same session (not part of this spec), Tasks: 003-scheduled-digest-backup-reliability (+6 more)

### Community 134 - "any-ratchet.mjs"
Cohesion: 0.21
Nodes (9): anyIn(), BASELINE, countDts(), countJs(), counts, DIRS, lowered, measure() (+1 more)

### Community 135 - "OkResponse"
Cohesion: 0.15
Nodes (13): BirthdayTestResponse, DigestRunResponse, GameSkinResponse, InventoryPoResponse, MemoResponse, OkResponse, ResendInviteResponse, RestoreResponse (+5 more)

### Community 137 - "recon.js"
Cohesion: 0.11
Nodes (14): cant(), inventoryKey(), isArchived(), isCancelledSale(), keyOf(), latestCountLines(), mergeClientOps(), qtyText() (+6 more)

### Community 138 - "tsconfig.worker.json"
Cohesion: 0.25
Nodes (7): ./tsconfig.json, compilerOptions, lib, types, exclude, extends, include

### Community 139 - "smoke.spec.mjs"
Cohesion: 0.29
Nodes (3): b64(), SECTIONS, token()

### Community 140 - "devDependencies"
Cohesion: 0.29
Nodes (7): devDependencies, clean-css-cli, @cloudflare/workers-types, @playwright/test, supabase, typescript, wrangler

### Community 141 - "inventoryStatus"
Cohesion: 0.33
Nodes (7): expiresWithinMonths(), generatedNoticeDate(), inventoryStatus(), isExpiredDate(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 142 - "annotate-params.py"
Cohesion: 0.48
Nodes (3): main(), split_params(), type_for()

### Community 143 - "landing-journey.js"
Cohesion: 0.60
Nodes (5): render(), renderClouds(), renderMap(), renderRoad(), renderTop()

### Community 144 - "runRecon"
Cohesion: 0.32
Nodes (12): dayOf(), depositDay(), fingerprintOf(), latestPoPrices(), listPriceFor(), manilaDate(), mergeDifferences(), num() (+4 more)

### Community 146 - "clearPrintTarget"
Cohesion: 0.24
Nodes (11): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), fitPrintTemplateRows(), previewFinancialRequest(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice() (+3 more)

### Community 147 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 148 - "DescribedPrintable"
Cohesion: 0.67
Nodes (3): DescribedPrintable, PrintableDocument, PrintableInvoice

### Community 149 - "recon.test.mjs"
Cohesion: 0.27
Nodes (8): dataFromRows(), RECON_CHECKS, cantRun(), data(), fail(), NOW, pass(), run()

### Community 155 - "calendarEventsForMonth"
Cohesion: 0.50
Nodes (4): calendarEventDepartment(), calendarEventsForMonth(), calendarTimeLabel(), canChangeCalendarEvent()

## Knowledge Gaps
- **6 isolated node(s):** `@cloudflare/workers-types`, `clean-css-cli`, `supabase`, `typescript`, `wrangler` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 959 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderAll` to `fake-backend.mjs`, `renderAll`, `worker.js`, `load-worker.mjs`, `recordSystemLog`?**
  _High betweenness centrality (0.233) - this node is a cross-community bridge._
- **What connects `@cloudflare/workers-types`, `clean-css-cli`, `supabase` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.024859663191659984 - nodes in this community are weakly interconnected._
- **Why does `MedlaneAPI` connect `renderAll` to `recordSystemLog`, `load-worker.mjs`?**
  _High betweenness centrality (0.173) - this node is a cross-community bridge._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Why does `backupStatus()` connect `recordSystemLog` to `renderAll`, `renderAll`, `fetch`, `worker.js`, `supabaseFetch`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05909090909090909 - nodes in this community are weakly interconnected._
# Graph Report - medlane  (2026-11-17)

## Corpus Check
- 127 files · ~955,969 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: (none) 11, .csv 4, .css 3)

## Summary
- 3605 nodes · 8093 edges · 175 communities (143 shown, 32 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 457 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f65241ff`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- public/scripts/state.js
- scripts/state.js
- scripts/events-bootstrap.js
- public/scripts/events-bootstrap.js
- printableBrandHeaderHtml
- public/scripts/modules.js
- scripts/modules.js
- public/scripts/vendor/pdf-lib.min.js
- scripts/vendor/pdf-lib.min.js
- renderAll
- fetch
- perf-report.js
- importCheckedRows
- worker.js
- renderProductIssueDetail
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
- approvePaymentRequest
- scripts/config-data.js
- users-page.js
- comboHandleKeydown
- welcome.js
- renderPrintTemplateSidePanel
- qs
- renderCollections
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
- ref_node_assert
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
- sendResendEmail
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- escapeHtml
- public/scripts/landing-motion.js
- connectLiveSocket
- LiveHub
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
- MedlaneAPI
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
- sectionQueryString
- DescribedPrintable
- recon.test.mjs
- start.sh
- noimplicitany-gate.sh
- strict-progress.sh
- global.d.ts
- purchasingTabModel
- IncomingSale
- PoLine
- payablesTabModel
- handleWorkflowAction
- clientOrdersModel
- expensesTabModel
- showSection
- sale-validation.test.mjs
- showAuthenticatedApp
- calendar-events.test.mjs
- backup-restore.test.mjs
- users-endpoints.test.mjs
- bizFacts
- guardedDialogClose

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 151 edges
2. `renderAll()` - 52 edges
3. `supabaseFetch()` - 45 edges
4. `renderAll()` - 35 edges
5. `openModal()` - 35 edges
6. `analyticsOverviewHtml()` - 33 edges
7. `composeAndSendDigest()` - 32 edges
8. `openModal()` - 29 edges
9. `supabaseFetchAll()` - 29 edges
10. `recordSystemLog()` - 29 edges

## Surprising Connections (you probably didn't know these)
- `Grilling follow-ups (2026-08-27, round 2) — DONE` --references--> `archiveMasterlistRecord()`  [INFERRED]
  specs/001-masterlist-archive-po-edits/tasks.md → public/scripts/modules.js
- `Architecture notes` --references--> `canAccessKey()`  [INFERRED]
  specs/001-masterlist-archive-po-edits/plan.md → src/worker.js
- `Assumptions` --references--> `saveMonitoringState()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/spec.md → src/worker.js
- `2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`)` --references--> `runFiveMinuteScheduledTasks()`  [INFERRED]
  specs/003-scheduled-digest-backup-reliability/plan.md → src/worker.js
- `Grilling: 005-luksong-milestone-juice-and-skins` --references--> `load()`  [INFERRED]
  specs/005-luksong-milestone-juice-and-skins/grilling.md → tests/helpers/load-worker.mjs

## Import Cycles
- None detected.

## Communities (175 total, 32 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.03
Nodes (54): accounts, activeBanks(), activeClients(), activeEmployees(), activeItems(), activeRecords(), activeSuppliers(), ANALYTICS_TABS (+46 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (47): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+39 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.09
Nodes (18): authHashParams(), hydrateAuthenticatedSession(), IMPORT_TEMPLATES, initializeRoute(), inventoryChangeView(), inventoryLoadMore, inventorySetStatus(), isDashboardRoute() (+10 more)

### Community 4 - "printableBrandHeaderHtml"
Cohesion: 0.08
Nodes (30): clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), demoRequestHistoryCard(), exportClientInvoicesCsv() (+22 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (148): addDemoRequestLine(), auditEntryById, auditSummaryState, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY() (+140 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.02
Nodes (107): applyReconciliationHistory(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+99 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.05
Nodes (15): cs(), Et(), Gr(), hs(), jt(), Ki(), Kr(), ls() (+7 more)

### Community 9 - "renderAll"
Cohesion: 0.06
Nodes (50): advancePurchaseOrderStatus(), applyRole(), approveExpense(), approveFinancialRequest(), approvePurchaseOrder(), canApproveMigrations(), canApprovePurchaseOrders(), cancelFinancialRequest() (+42 more)

### Community 10 - "fetch"
Cohesion: 0.05
Nodes (62): Context, assertFileRemovable(), assertInviteOpen(), authenticatedUser(), canAccessKey(), checkAssetPageHealth(), cleanEmail(), extractLinkResult() (+54 more)

### Community 11 - "perf-report.js"
Cohesion: 0.12
Nodes (33): avg(), buildRecommendations(), buildWeeklyReport(), C, chartImageUrl(), collectLiveDetails(), collectSample(), dailyRows() (+25 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.14
Nodes (30): approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusHistory() (+22 more)

### Community 13 - "worker.js"
Cohesion: 0.03
Nodes (103): saleDocType(), saleNo(), applyReceivingLines(), assertMasterlistUnique(), assertSaleBasics(), assertSaleNotNegative(), assertSaveNotStale(), AUDIT_WATCHED_FIELDS (+95 more)

### Community 14 - "renderProductIssueDetail"
Cohesion: 0.06
Nodes (45): acknowledgeMemo(), attachedFilesFor(), attachedFilesHtml(), canActOnProductIssue(), canCorrectSupportReport(), canPostMemo(), canRemoveAttachment(), clientDocRecordId() (+37 more)

### Community 15 - "rowValue"
Cohesion: 0.16
Nodes (26): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), findSaleByDocumentInput(), importAddress(), importCheckedRows() (+18 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.07
Nodes (48): addStockSheetRow(), addTransferSheetRow(), branchOptions(), clearStockSheetDraft(), clearTransferSheetDraft(), collectInvoiceEditorLines(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt() (+40 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.08
Nodes (60): showAuditLogDetail(), showDigestMessagePreview(), Design, Part A — View digest message from Audit Logs, hasAccessToken(), appStateKey(), auditLogDigestRows(), auditLogTableHtml() (+52 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.05
Nodes (24): CALENDAR_DEPARTMENTS, CALENDAR_OTHER_DEPARTMENT, calendarEventDepartment(), calendarEventsForMonth(), calendarTimeLabel(), calendarToneOrder, canChangeCalendarEvent(), canSeeNotification() (+16 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "invoicingTabModel"
Cohesion: 0.08
Nodes (46): bizSaleBranch(), canUpdateDeliveryStatus(), cashForecast(), collectionBranches(), collectionMethodKey(), collectionMethodLabel(), collectionMethodSub(), collectionPaymentsState() (+38 more)

### Community 21 - "supabase-production-schema.sql"
Cohesion: 0.06
Nodes (41): app_records_delete_guard, prevent_app_records_delete(), reserve_file_storage(), acknowledge_memo(), app_records_sales_client_balance_idx, client_sales_balance(), app_state_updated_by_idx, backup_runs_created_by_idx (+33 more)

### Community 22 - "analyticsOverviewHtml"
Cohesion: 0.19
Nodes (27): analyticsOverviewHtml(), analyticsTabModel(), analyticsValueHtml(), bizMargin(), bizMarginText(), bizStockValue(), bizTrend(), bizTrendCell() (+19 more)

### Community 23 - "composeAndSendDigest"
Cohesion: 0.13
Nodes (24): addDays(), backupDigestLines(), buildBusinessSummaryLines(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil() (+16 more)

### Community 24 - "openModal"
Cohesion: 0.05
Nodes (53): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists() (+45 more)

### Community 25 - "printableFooterHtml"
Cohesion: 0.14
Nodes (19): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastReportHtml(), itemForecastRows(), memoAudienceLabel() (+11 more)

### Community 26 - "renderLogs"
Cohesion: 0.18
Nodes (17): auditActivityRow(), auditChanges(), auditFailedByAccount(), auditIsLate(), auditManilaHour(), auditSignInFacts(), auditStockWithoutReason(), auditTone() (+9 more)

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
Nodes (34): canManageEmployeeSalary(), clientOrderShipsFrom(), collectInvoicePreviewLines(), cvYear(), ensureMultiChequeEditor(), financialLineTemplate(), findClientByName(), latestAllowedBirthday() (+26 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 34 - "renderDashboard"
Cohesion: 0.08
Nodes (34): addCalendarEventDialog(), averageOf(), backupRunLabel(), calendarState(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard() (+26 more)

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
Nodes (30): applyCollectionPayment(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+22 more)

### Community 40 - "approvePaymentRequest"
Cohesion: 0.07
Nodes (49): applyCollectionPayment(), approvePaymentRequest(), bir2307Rows(), canApprovePaymentRequests(), cancelPaymentRequest(), canRedepositCollections(), collectFinancialLines(), collectionChequeButtons() (+41 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "users-page.js"
Cohesion: 0.15
Nodes (41): handleUsersClick(), loadUsersActivity(), manilaDayOf(), renderUsers(), USER_ROLES, USER_TABS, usersAccessLines(), usersAccounts() (+33 more)

### Community 43 - "comboHandleKeydown"
Cohesion: 0.38
Nodes (10): comboClose(), comboFilter(), comboHandleKeydown(), comboOpen(), comboOptionsFor(), comboRefresh(), comboRenderOptions(), comboReposition() (+2 more)

### Community 44 - "welcome.js"
Cohesion: 0.13
Nodes (22): closeWelcomeScreen(), handleWelcomeClick(), handleWelcomeKey(), showWelcomeScreen(), WELCOME_ACTION_FALLBACK, WELCOME_ACTION_SETS, WELCOME_ACTIONS, WELCOME_TASK_MODULES (+14 more)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.20
Nodes (19): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+11 more)

### Community 46 - "qs"
Cohesion: 0.16
Nodes (21): applyPendingSaveQueueToLocal(), buildWithItemRefresh(), clearPendingSaveQueueKeys(), emptyProductionData(), flushPendingSaveQueue(), fmtDate(), followupWeekKey(), hasPendingSaveQueue() (+13 more)

### Community 47 - "renderCollections"
Cohesion: 0.09
Nodes (26): collectionStatusActions(), contactActionCard(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), lineChart(), monthLabel(), multiSeriesChart() (+18 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.13
Nodes (29): check-prerequisites.sh script, check_dir(), check_file(), find_specify_root(), format_speckit_command(), get_current_branch(), get_feature_paths(), get_invoke_separator() (+21 more)

### Community 50 - "inventoryTabModelBase"
Cohesion: 0.09
Nodes (33): canCreateSupplierPo(), canRequestDemo(), demoRequestInitialStatus(), inventoryFocusTabRecord(), inventoryPoFinishedOn(), inventoryPoTotal(), inventoryReceiptBranches(), inventoryResetTabView() (+25 more)

### Community 51 - "renderInventory"
Cohesion: 0.10
Nodes (28): addDemoRequestLine(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineRow(), demoRequestLineSummary(), ensureInventoryDatalists() (+20 more)

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
Cohesion: 0.10
Nodes (21): buildSale(), competingPurchaseOrdersForItem(), CreditApprovalRequiredError, discountNeedsApproval(), documentExists(), inventoryCardsHtml(), inventoryExpiryInfo(), inventoryFilteredRows() (+13 more)

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
Cohesion: 0.33
Nodes (9): ensurePendingSaveQueueHydrated(), mergePendingSaveQueue(), newPendingSaveMeta(), openPendingSaveDb(), pendingSaveMetaDbKey(), pendingSaveQueueKey(), readPendingSaveQueueFromDb(), writePendingSaveQueue() (+1 more)

### Community 62 - "appendTableRows"
Cohesion: 0.24
Nodes (12): changeTablePage(), entryHasMore(), refreshLoadPreviousButton(), renderTablePager(), rowHtml(), sanitizeHtml(), showTablePage(), sortTable() (+4 more)

### Community 63 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 64 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 65 - "ref_node_assert"
Cohesion: 0.14
Nodes (7): worker, accounting, admin, sales, ceo, context, superadmin

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
Cohesion: 0.08
Nodes (56): applyOperationalReport(), assignedSalesAgent(), isBookkeepingOnlyLine(), itemClassificationFor(), lineChart(), masterlistRecordOpenActivity(), monthLabel(), payableFacts() (+48 more)

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
Cohesion: 0.13
Nodes (14): confirmFinalSave(), Architecture notes, Design decisions, Implementation Plan: 001-masterlist-archive-po-edits, Out of scope, Risks / mitigations, Cross-cutting, Grilling follow-ups (2026-08-27, round 2) — DONE (+6 more)

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

### Community 89 - "le"
Cohesion: 0.22
Nodes (11): ae(), he(), le(), ne(), qe(), re(), se(), ue() (+3 more)

### Community 90 - "sendResendEmail"
Cohesion: 0.09
Nodes (29): Grilling: 003-scheduled-digest-backup-reliability, 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback (+21 more)

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 93 - "escapeHtml"
Cohesion: 0.15
Nodes (23): Grilling: 004-audit-digest-view-and-discord-events, brandedEmailHtml(), brandedInviteEmailHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml(), digestStatCardsHtml(), digestToneColors() (+15 more)

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 95 - "connectLiveSocket"
Cohesion: 0.47
Nodes (6): connectLiveSocket(), flushLiveSyncRender(), liveSyncCanRender(), runLiveSync(), scheduleLiveFallbackPoll(), startLiveSync()

### Community 97 - "renderAll"
Cohesion: 0.05
Nodes (62): advancePurchaseOrderStatus(), approveCreditInvoice(), approveExpense(), approveFinancialRequest(), approvePurchaseOrder(), approveStockReceipt(), archiveMasterlistRecord(), buildInventoryPurchaseOrder() (+54 more)

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "postRecordEventsToDiscord"
Cohesion: 0.09
Nodes (23): Assumptions / Out of scope, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord, Requirements, Requirements, Success Criteria (+15 more)

### Community 108 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 109 - "persistRecordsNow"
Cohesion: 0.16
Nodes (23): applySavedStock(), beginSaveOperation(), canEditActiveSection(), canEditModule(), canEditSaveKey(), canRequestSupportReport(), dedupeRecordsForSave(), editableModules() (+15 more)

### Community 110 - "isAuthenticatedRoute"
Cohesion: 0.90
Nodes (5): isAuthenticatedRoute(), scheduleAutofillLoginSubmit(), startLoginAutoSignIn(), submitLoginIfReady(), tryBiometricLogin()

### Community 111 - "load-worker.mjs"
Cohesion: 0.14
Nodes (11): env, NON_MANAGEMENT, env, EXPOSED, load(), mockSupabase(), STATE, workerSourcePath (+3 more)

### Community 112 - "ui-kit.js"
Cohesion: 0.09
Nodes (27): UI_SERIES_TWO, uiAttrs(), uiBarChart(), uiButton(), uiCellDoc(), uiDashboardGrid(), uiDataTable(), uiDetailPanel() (+19 more)

### Community 113 - "seed.mjs"
Cohesion: 0.10
Nodes (26): api(), AREAS, args, BRANCHES, BRANDS, buildData(), CATEGORIES, ensureAccounts() (+18 more)

### Community 114 - "supabaseFetch"
Cohesion: 0.07
Nodes (57): getPath(), setPath(), activeMetadataUsage(), applyReconOps(), assertCalendarEventChangesAllowed(), assertCreditApprovalAllowed(), assertDemoRequestTransitionsAllowed(), assertFinancialApprovalAllowed() (+49 more)

### Community 123 - "authenticatedProfile"
Cohesion: 0.17
Nodes (15): applyPreviewRole(), auditContextForRequest(), authenticatedProfile(), authenticatedProfileCached(), browserName(), clientIp(), createAppSession(), deviceName() (+7 more)

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

### Community 133 - "MedlaneAPI"
Cohesion: 0.40
Nodes (4): MedlaneAPI, backupStatus(), checkBackupFreshnessHealth(), storageUsage()

### Community 134 - "any-ratchet.mjs"
Cohesion: 0.21
Nodes (9): anyIn(), BASELINE, countDts(), countJs(), counts, DIRS, lowered, measure() (+1 more)

### Community 135 - "OkResponse"
Cohesion: 0.15
Nodes (13): BirthdayTestResponse, DigestRunResponse, GameSkinResponse, InventoryPoResponse, MemoResponse, OkResponse, ResendInviteResponse, RestoreResponse (+5 more)

### Community 136 - "slow-network.spec.mjs"
Cohesion: 0.11
Nodes (6): el(), setup(), source, source, PROFILES, ROLE_ACCOUNTS

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
Cohesion: 0.16
Nodes (15): canCancelFromPreview(), changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), fitPrintTemplateRows(), openCollectionHistoryModal(), previewFinancialRequest(), previewInventoryPurchaseOrder() (+7 more)

### Community 147 - "sectionQueryString"
Cohesion: 0.16
Nodes (17): analyticsQueryString(), clientHistoryQueryString(), clientPoQueryString(), collectionsQueryString(), expensesQueryString(), inventoryQueryString(), invoicingQueryString(), logsQueryString() (+9 more)

### Community 148 - "DescribedPrintable"
Cohesion: 0.67
Nodes (3): DescribedPrintable, PrintableDocument, PrintableInvoice

### Community 149 - "recon.test.mjs"
Cohesion: 0.27
Nodes (8): dataFromRows(), RECON_CHECKS, cantRun(), data(), fail(), NOW, pass(), run()

### Community 155 - "purchasingTabModel"
Cohesion: 0.19
Nodes (22): addMonthsToDate(), bizItemCosts(), bizSamePointLastMonth(), dayCount(), inventoryBranchLabel(), inventoryBranchOptions(), inventoryDateValue(), inventoryPoBranch() (+14 more)

### Community 162 - "payablesTabModel"
Cohesion: 0.13
Nodes (19): canApproveFinancialRequest(), dueInText(), inventoryNextStep(), kpiPayablesDue(), kpiPayablesOpen(), loadMorePayables(), payable2307Cell(), payableFactsAll() (+11 more)

### Community 163 - "handleWorkflowAction"
Cohesion: 0.11
Nodes (21): canApproveDemoLogistics(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), contactActionCard(), demoRequestActions(), demoSaleTotal(), handleWorkflowAction() (+13 more)

### Community 164 - "clientOrdersModel"
Cohesion: 0.17
Nodes (17): clientOrdersModel(), clientTimeline(), isClientAssignedToCurrentUser(), loadMorePurchaseOrders(), loadMoreSales(), paymentMethodLabel(), poCanEdit(), poLineStatus() (+9 more)

### Community 165 - "expensesTabModel"
Cohesion: 0.27
Nodes (17): budgetStatus(), canEditExpensePlanning(), expenseBudgetMap(), expenseByCategory(), expenseCategories(), expensesOverviewHtml(), expenseSpendByCategory(), expensesTabModel() (+9 more)

### Community 166 - "showSection"
Cohesion: 0.12
Nodes (19): applyRole(), buildPurchaseOrder(), canRestoreSection(), inventoryPoHistoryClass(), nextPurchaseOrderId(), poHasAnyServed(), poHistory(), poServedQty() (+11 more)

### Community 167 - "sale-validation.test.mjs"
Cohesion: 0.18
Nodes (10): row(), stored(), item(), run(), stockRow(), stockRow(), client(), run() (+2 more)

### Community 168 - "showAuthenticatedApp"
Cohesion: 0.25
Nodes (8): isSafeToApplyAppUpdate(), playDashboardLoginSound(), runAppVersionCheck(), scheduleAppVersionCheck(), setThemePreference(), showAuthenticatedApp(), startAppVersionWatch(), syncThemeToggleLabel()

### Community 170 - "calendar-events.test.mjs"
Cohesion: 0.33
Nodes (4): MedlaneAPI, acknowledgeMemo(), me(), as()

### Community 172 - "users-endpoints.test.mjs"
Cohesion: 0.33
Nodes (3): accepted(), ago(), env

### Community 173 - "bizFacts"
Cohesion: 0.70
Nodes (5): bizFacts(), bizPaidDates(), bizPaymentDate(), bizReceivedPayments(), kpiCollectedIn()

### Community 174 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

## Knowledge Gaps
- **6 isolated node(s):** `@cloudflare/workers-types`, `clean-css-cli`, `supabase`, `typescript`, `wrangler` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 981 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **32 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `MedlaneAPI` to `fake-backend.mjs`, `renderAll`, `calendar-events.test.mjs`, `worker.js`, `renderProductIssueDetail`?**
  _High betweenness centrality (0.230) - this node is a cross-community bridge._
- **What connects `@cloudflare/workers-types`, `clean-css-cli`, `supabase` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.025170998632010944 - nodes in this community are weakly interconnected._
- **Why does `MedlaneAPI` connect `calendar-events.test.mjs` to `renderAll`, `MedlaneAPI`?**
  _High betweenness centrality (0.188) - this node is a cross-community bridge._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Why does `backupStatus()` connect `MedlaneAPI` to `calendar-events.test.mjs`, `fetch`, `worker.js`, `recordSystemLog`, `supabaseFetch`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.056261343012704176 - nodes in this community are weakly interconnected._
# Graph Report - medlane  (2026-11-14)

## Corpus Check
- 109 files · ~558,114 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: (none) 11, .csv 4, .css 3)

## Summary
- 3309 nodes · 7291 edges · 159 communities (130 shown, 29 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 451 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `9ac119f9`
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
- renderInvoicing
- importCheckedRows
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
- renderInventory
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
- renderCollectionMapVisual
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
- qs
- isAuthenticatedRoute
- load-worker.mjs
- ui-kit.js
- seed.mjs
- sectionQueryString
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard
- supabaseFetch
- load-test.mjs
- compilerOptions
- Feature Spec 006 — Inventory page redesign
- 006-inventory-redesign/tasks.md
- fake-backend.mjs
- package.json
- ref_node_assert
- scripts
- perf-measure.mjs
- sendResendEmail
- any-ratchet.mjs
- OkResponse
- slow-network.spec.mjs
- startAppVersionWatch
- tsconfig.worker.json
- smoke.spec.mjs
- devDependencies
- inventoryStatus
- annotate-params.py
- landing-journey.js
- ref_node_fs
- semantic-diff.sh
- @playwright/test
- guardedDialogClose
- DescribedPrintable
- workflowCard
- start.sh
- noimplicitany-gate.sh
- strict-progress.sh
- global.d.ts
- renderInventoryStocks
- renderUsers
- auth-outage.test.mjs
- IncomingSale
- PoLine

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 138 edges
2. `renderAll()` - 52 edges
3. `renderAll()` - 35 edges
4. `openModal()` - 35 edges
5. `supabaseFetch()` - 35 edges
6. `composeAndSendDigest()` - 32 edges
7. `analyticsOverviewHtml()` - 30 edges
8. `openModal()` - 29 edges
9. `recordSystemLog()` - 28 edges
10. `inventoryTabModelBase()` - 26 edges

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

## Communities (159 total, 29 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.03
Nodes (51): accounts, activeBanks(), activeClients(), activeEmployees(), activeItems(), activeRecords(), activeSuppliers(), ANALYTICS_TABS (+43 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (45): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+37 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.08
Nodes (22): authHashParams(), hydrateAuthenticatedSession(), IMPORT_TEMPLATES, initializeRoute(), inventoryChangeView(), inventoryLoadMore, inventorySetStatus(), isDashboardRoute() (+14 more)

### Community 4 - "clearPrintTarget"
Cohesion: 0.08
Nodes (33): changeReportPreviewTemplate(), clearPrintTarget(), clientInvoiceReportHtml(), closeReportPreview(), dashboardReportHtml(), fitPrintTemplateRows(), forecastItemMatchesQuery(), itemForecastMonthKeys() (+25 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (132): addDemoRequestLine(), applyReconciliationHistory(), auditEntryById, auditSummaryState, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup() (+124 more)

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
Cohesion: 0.05
Nodes (59): Context, assertCalendarEventChangesAllowed(), assertCreditApprovalAllowed(), assertDemoRequestTransitionsAllowed(), assertFinancialApprovalAllowed(), assertMigratedStockAllowed(), assertPurchaseOrderClientsNotArchived(), assertSaleBasics() (+51 more)

### Community 11 - "perf-report.js"
Cohesion: 0.12
Nodes (32): avg(), buildRecommendations(), buildWeeklyReport(), C, chartImageUrl(), collectLiveDetails(), collectSample(), dailyRows() (+24 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "worker.js"
Cohesion: 0.03
Nodes (87): applyReceivingLines(), assertMasterlistUnique(), AUDIT_WATCHED_FIELDS, auditChangeEntries(), auditSensitivity(), auditSummary(), auditValue(), authCache (+79 more)

### Community 14 - "renderInvoicing"
Cohesion: 0.08
Nodes (33): acknowledgeMemo(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), clientDocRecordId(), clientDocsModalRowsHtml() (+25 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.16
Nodes (26): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), collectionTagForType(), detectImportKind(), importAddress(), importCheckedRows() (+18 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.07
Nodes (48): addStockSheetRow(), addTransferSheetRow(), branchOptions(), clearStockSheetDraft(), clearTransferSheetDraft(), collectInvoiceEditorLines(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt() (+40 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.11
Nodes (46): hasAccessToken(), appStateKey(), backupStatus(), boardMonitorsDue(), checkBackupFreshnessHealth(), checkSupabaseAppRecordsHealth(), dailyDigestHours(), deleteDiscordWebhookMessage() (+38 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.06
Nodes (17): calendarEventsForMonth(), calendarTimeLabel(), calendarToneOrder, canChangeCalendarEvent(), canSeeNotification(), clientBalance(), clientCreditState(), clientTaxBadge() (+9 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "invoicingTabModel"
Cohesion: 0.06
Nodes (65): bizSaleBranch(), canUpdateDeliveryStatus(), collectionBranches(), collectionMethodKey(), collectionMethodLabel(), collectionMethodSub(), collectionPaymentsState(), collectionReceipts() (+57 more)

### Community 21 - "supabase-production-schema.sql"
Cohesion: 0.07
Nodes (38): app_records_delete_guard, prevent_app_records_delete(), reserve_file_storage(), acknowledge_memo(), app_records_sales_client_balance_idx, client_sales_balance(), app_state_updated_by_idx, backup_runs_created_by_idx (+30 more)

### Community 22 - "analyticsOverviewHtml"
Cohesion: 0.07
Nodes (87): addMonthsToDate(), analyticsOverviewHtml(), analyticsTabModel(), analyticsValueHtml(), bizFacts(), bizItemCosts(), bizMargin(), bizMarginText() (+79 more)

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
Cohesion: 0.09
Nodes (30): auditActivityRow(), auditChanges(), auditFailedByAccount(), auditIsLate(), auditManilaHour(), auditSignInFacts(), auditStockWithoutReason(), auditTone() (+22 more)

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
Nodes (46): AccessMode, AppData, AppNotification, AppRecordRow, AppRole, AppUser, Bank, CalendarEvent (+38 more)

### Community 31 - "openModal"
Cohesion: 0.06
Nodes (50): clientOrderShipsFrom(), collectFinancialLines(), collectInvoicePreviewLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions() (+42 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 34 - "renderDashboard"
Cohesion: 0.08
Nodes (36): addCalendarEventDialog(), averageOf(), backupRunLabel(), calendarState(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard() (+28 more)

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
Cohesion: 0.40
Nodes (6): confirmInviteUser(), handleUserInvite(), mergeUsersFromBackend(), submitModal(), syncBackendUsers(), toggleUserDisabled()

### Community 43 - "comboHandleKeydown"
Cohesion: 0.38
Nodes (10): comboClose(), comboFilter(), comboHandleKeydown(), comboOpen(), comboOptionsFor(), comboRefresh(), comboRenderOptions(), comboReposition() (+2 more)

### Community 44 - "Implementation Plan: 003-scheduled-digest-backup-reliability"
Cohesion: 0.40
Nodes (4): Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback, Verification (no local env)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.20
Nodes (19): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+11 more)

### Community 46 - "qs"
Cohesion: 0.17
Nodes (27): applyPendingSaveQueueToLocal(), applySavedStock(), buildWithItemRefresh(), clearPendingSaveQueueKeys(), dedupeRecordsForSave(), emptyProductionData(), flushPendingSaveQueue(), fmtDate() (+19 more)

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
Nodes (33): canApproveDemoLogistics(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), canRequestDemo(), demoRequestActions(), demoRequestInitialStatus(), demoSaleTotal() (+25 more)

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
Cohesion: 0.15
Nodes (22): openStockEditDialog(), saveStockEdit(), showStockHistory(), stockRecordIsEquipment(), stockRowByRef(), canEditStockRecord(), refreshInventoryFromServer(), Architecture notes (+14 more)

### Community 56 - "buildSale"
Cohesion: 0.09
Nodes (25): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), competingPurchaseOrdersForItem(), CreditApprovalRequiredError, discountNeedsApproval(), documentExists(), inventoryPoHistoryClass() (+17 more)

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
Cohesion: 0.06
Nodes (41): applyRole(), canActOnProductIssue(), canRestoreSection(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard() (+33 more)

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
Cohesion: 0.10
Nodes (46): applyOperationalReport(), assignedSalesAgent(), isBookkeepingOnlyLine(), itemClassificationFor(), lineChart(), masterlistRecordOpenActivity(), monthLabel(), payableFacts() (+38 more)

### Community 72 - "bi"
Cohesion: 0.47
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "renderCollectionMapVisual"
Cohesion: 0.09
Nodes (25): clientMapPosition(), collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds() (+17 more)

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
Nodes (22): archiveMasterlistRecord(), editPurchaseOrder(), masterlistDisplayLabel(), masterlistModuleKey(), masterlistRecordKey(), restoreMasterlistRecord(), isArchived(), confirmFinalSave() (+14 more)

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
Cohesion: 0.11
Nodes (32): Grilling: 004-audit-digest-view-and-discord-events, auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), composeAndSendDigest(), digestAttentionBannerHtml(), digestDeltaBadge(), digestEmailHtml() (+24 more)

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 95 - "connectLiveSocket"
Cohesion: 0.47
Nodes (6): connectLiveSocket(), flushLiveSyncRender(), liveSyncCanRender(), runLiveSync(), scheduleLiveFallbackPoll(), startLiveSync()

### Community 96 - "sendResendEmail"
Cohesion: 0.12
Nodes (22): authenticatedUser(), cleanEmail(), extractLinkResult(), findAuthUserByEmail(), findAuthUserForProfileOrEmail(), generateSupabaseActionLink(), isTransientJwtClockSkew(), json() (+14 more)

### Community 97 - "renderAll"
Cohesion: 0.05
Nodes (69): MedlaneAPI, resetUserPermissions(), advancePurchaseOrderStatus(), applyCollectionPayment(), approveCreditInvoice(), approveExpense(), approveFinancialRequest(), approvePaymentRequest() (+61 more)

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "postRecordEventsToDiscord"
Cohesion: 0.08
Nodes (29): showAuditLogDetail(), showDigestMessagePreview(), Assumptions / Out of scope, Design, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord (+21 more)

### Community 108 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 109 - "qs"
Cohesion: 0.20
Nodes (12): beginSaveOperation(), canEditActiveSection(), canEditModule(), canEditSaveKey(), canRequestSupportReport(), editableModules(), endSaveOperation(), includesSearch() (+4 more)

### Community 110 - "isAuthenticatedRoute"
Cohesion: 0.90
Nodes (5): isAuthenticatedRoute(), scheduleAutofillLoginSubmit(), startLoginAutoSignIn(), submitLoginIfReady(), tryBiometricLogin()

### Community 111 - "load-worker.mjs"
Cohesion: 0.12
Nodes (19): NON_MANAGEMENT, as(), EXPOSED, load(), mockSupabase(), row(), STATE, stored() (+11 more)

### Community 112 - "ui-kit.js"
Cohesion: 0.09
Nodes (27): UI_SERIES_TWO, uiAttrs(), uiBarChart(), uiButton(), uiCellDoc(), uiDashboardGrid(), uiDataTable(), uiDetailPanel() (+19 more)

### Community 113 - "seed.mjs"
Cohesion: 0.10
Nodes (26): api(), AREAS, args, BRANCHES, BRANDS, buildData(), CATEGORIES, ensureAccounts() (+18 more)

### Community 114 - "sectionQueryString"
Cohesion: 0.18
Nodes (16): analyticsQueryString(), clientHistoryQueryString(), collectionsQueryString(), expensesQueryString(), inventoryQueryString(), invoicingQueryString(), logsQueryString(), moduleViewQueryString() (+8 more)

### Community 123 - "supabaseFetch"
Cohesion: 0.10
Nodes (30): activeMetadataUsage(), applyPreviewRole(), auditContextForRequest(), auditLogDigestRows(), authenticatedProfile(), authenticatedProfileCached(), browserName(), clientIp() (+22 more)

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
Cohesion: 0.11
Nodes (13): authedRoutes, b64(), fakeToken(), newSession(), port, ROLE_MODULES, root, seedScale (+5 more)

### Community 129 - "package.json"
Cohesion: 0.25
Nodes (7): name, private, clean-css-cli, @cloudflare/workers-types, supabase, typescript, wrangler

### Community 130 - "ref_node_assert"
Cohesion: 0.13
Nodes (5): NOT_RESTORED, worker, accounting, admin, sales

### Community 131 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, build:css, check:any, check:noimplicitany, check:semantic, load-test, local (+8 more)

### Community 132 - "perf-measure.mjs"
Cohesion: 0.16
Nodes (13): collect(), dashboard(), LABEL, landing(), LIVE_URL, median(), newPage(), observers() (+5 more)

### Community 133 - "sendResendEmail"
Cohesion: 0.22
Nodes (14): Grilling: 003-scheduled-digest-backup-reliability, 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Problem, Related, same session (not part of this spec), Tasks: 003-scheduled-digest-backup-reliability (+6 more)

### Community 134 - "any-ratchet.mjs"
Cohesion: 0.23
Nodes (9): anyIn(), BASELINE, countDts(), countJs(), counts, DIRS, lowered, measure() (+1 more)

### Community 135 - "OkResponse"
Cohesion: 0.15
Nodes (13): BirthdayTestResponse, DigestRunResponse, GameSkinResponse, InventoryPoResponse, MemoResponse, OkResponse, ResendInviteResponse, RestoreResponse (+5 more)

### Community 137 - "startAppVersionWatch"
Cohesion: 0.50
Nodes (4): isSafeToApplyAppUpdate(), runAppVersionCheck(), scheduleAppVersionCheck(), startAppVersionWatch()

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

### Community 147 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 148 - "DescribedPrintable"
Cohesion: 0.67
Nodes (3): DescribedPrintable, PrintableDocument, PrintableInvoice

### Community 154 - "renderInventoryStocks"
Cohesion: 0.20
Nodes (12): inventoryCardsHtml(), inventoryExpiryInfo(), inventoryFilteredRows(), inventoryHasExpiry(), inventoryIcon(), inventoryItemLabel(), inventoryRef(), inventoryRowModel() (+4 more)

### Community 155 - "renderUsers"
Cohesion: 0.36
Nodes (8): dedupedUsers(), memoRecipientCount(), renderRoleTester(), renderUsers(), userDisplayStatus(), userInviteStatus(), userIsArchived(), userStatusClass()

## Knowledge Gaps
- **6 isolated node(s):** `@cloudflare/workers-types`, `clean-css-cli`, `supabase`, `typescript`, `wrangler` (+1 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 905 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **29 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderAll` to `recordSystemLog`, `worker.js`, `renderInvoicing`, `renderAll`?**
  _High betweenness centrality (0.210) - this node is a cross-community bridge._
- **What connects `@cloudflare/workers-types`, `clean-css-cli`, `supabase` to the rest of the system?**
  _6 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.026196928635953028 - nodes in this community are weakly interconnected._
- **Why does `MedlaneAPI` connect `renderAll` to `recordSystemLog`?**
  _High betweenness centrality (0.185) - this node is a cross-community bridge._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Why does `backupStatus()` connect `recordSystemLog` to `renderAll`, `renderAll`, `fetch`, `worker.js`, `supabaseFetch`?**
  _High betweenness centrality (0.123) - this node is a cross-community bridge._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05909090909090909 - nodes in this community are weakly interconnected._
# Graph Report - medlane  (2026-08-27)

## Corpus Check
- 59 files · ~332,105 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2201 nodes · 4678 edges · 128 communities (110 shown, 18 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 249 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7b21ca72`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- public/scripts/state.js
- scripts/state.js
- scripts/events-bootstrap.js
- public/scripts/events-bootstrap.js
- renderProductIssues
- public/scripts/modules.js
- scripts/modules.js
- public/scripts/vendor/pdf-lib.min.js
- scripts/vendor/pdf-lib.min.js
- renderAll
- fetch
- renderCollections
- importCheckedRows
- worker.js
- renderPayables
- importCheckedRows
- syncStockSheetRow
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- Implementation Plan: 003-scheduled-digest-backup-reliability
- showSection
- Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup
- composeAndSendDigest
- openModal
- renderInventory
- renderLogs
- game.js
- memoCardHtml
- renderUsers
- renderClientInvoices
- openModal
- renderProductIssues
- syncPaymentRequestTotal
- clearPrintTarget
- buildSale
- i
- i
- public/scripts/config-data.js
- renderReconciliation
- computeValueMetrics
- scripts/config-data.js
- printableFooterHtml
- itemForecastRows
- renderDashboard
- confirmDetailsModal
- saveData
- renderDashboard
- syncStockSheetRow
- common.sh
- sendResendEmail
- supabaseFetch
- Feature Specification: Editable Inventory Stock Rows with Change History and Notes
- Tasks: [FEATURE NAME]
- User Scenarios & Testing *(mandatory)*
- Tasks: 002-inventory-stock-edit-history
- createAppSession
- Bt
- za
- Bt
- za
- renderLogs
- appendTableRows
- gi
- Ir
- activeRecords
- appendTableRows
- gi
- Ir
- renderInventory
- Feature Specification: [FEATURE NAME]
- workflowFacts
- bi
- normalizeData
- workflowFacts
- bi
- Core Principles
- focusRecord
- ja
- Core Principles
- jt
- ue
- Implementation Plan: [FEATURE]
- Implementation Plan: 001-masterlist-archive-po-edits
- Agent Notes
- focusRecord
- Tasks: 001-masterlist-archive-po-edits
- ja
- jt
- ue
- normalizePayableWithholding
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- Implementation Plan: 002-inventory-stock-edit-history
- public/scripts/landing-motion.js
- pe
- renderPrintTemplateSidePanel
- renderAll
- guardedDialogClose
- scripts/landing-motion.js
- Tasks: 003-scheduled-digest-backup-reliability
- grilling.md
- guardedDialogClose
- graphNote
- Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events
- arTrackerStage
- canSeeNotification
- clearPrintTarget
- clientTaxBadge
- documentType
- workflowCard
- showAuthenticatedApp
- sendDiscordDigest
- detectThresholdsAndApprovals
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard
- buildPrintTemplateCanvas
- clearBackupStatus
- syncBackendUsers
- Tasks: 004-audit-digest-view-and-discord-events
- pe
- 004-audit-digest-view-and-discord-events/grilling.md

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 94 edges
2. `renderAll()` - 56 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 30 edges
5. `openModal()` - 29 edges
6. `supabaseFetch()` - 27 edges
7. `composeAndSendDigest()` - 23 edges
8. `renderInventory()` - 22 edges
9. `renderInventory()` - 19 edges
10. `recordSystemLog()` - 19 edges

## Surprising Connections (you probably didn't know these)
- `MedlaneAPI` --indirect_call--> `backupStatus()`  [INFERRED]
  public/scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `storageUsage()`  [INFERRED]
  public/scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `backupStatus()`  [INFERRED]
  scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `storageUsage()`  [INFERRED]
  scripts/api-client.js → src/worker.js
- `renderWorkflowAssist()` --indirect_call--> `workflowCard()`  [INFERRED]
  public/scripts/modules.js → public/scripts/ui-utils.js

## Import Cycles
- None detected.

## Communities (128 total, 18 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (15): accounts, canEditActiveSection(), canEditModule(), canEditStockRecord(), clientCoordinates, currentUser, editableModules(), frontendModuleRecordKeys (+7 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (51): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+43 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.09
Nodes (19): authHashParams(), hydrateAuthenticatedSession(), initializeRoute(), isAuthenticatedRoute(), isDashboardRoute(), isLoginRoute(), jwtEmail(), logoutCurrentUser() (+11 more)

### Community 4 - "renderProductIssues"
Cohesion: 0.11
Nodes (24): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), lineChart() (+16 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (97): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+89 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.02
Nodes (92): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+84 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 9 - "renderAll"
Cohesion: 0.08
Nodes (36): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), applyRole(), approveExpense(), approvePurchaseOrder(), canApproveMigrations(), canApprovePurchaseOrders() (+28 more)

### Community 10 - "fetch"
Cohesion: 0.05
Nodes (58): applyReceivingLines(), authenticatedProfile(), authenticatedUser(), canAccessKey(), checkAssetPageHealth(), cleanEmail(), dedupeRowsByRecordKey(), deleteDiscordWebhookMessage() (+50 more)

### Community 11 - "renderCollections"
Cohesion: 0.11
Nodes (26): applyCollectionPayment(), approveFinancialRequest(), approvePaymentRequest(), canApprovePaymentRequests(), cancelFinancialRequest(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory() (+18 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "worker.js"
Cohesion: 0.06
Nodes (52): addDays(), canWrite(), daysUntilIso(), defaultSeedSignature, DIGEST_AUDIT_NOISE_ACTIONS, DIGEST_COLORS, DIGEST_METRIC_CARDS, DIGEST_ROLE_RECIPIENTS (+44 more)

### Community 14 - "renderPayables"
Cohesion: 0.07
Nodes (38): applyReconciliationHistory(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+30 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.18
Nodes (24): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), findSaleByDocumentInput(), importAddress(), importCheckedRows() (+16 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.11
Nodes (27): addStockSheetRow(), addTransferSheetRow(), branchOptions(), clearStockSheetDraft(), clearTransferSheetDraft(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt(), findItemForSheetRow() (+19 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.15
Nodes (31): claimAutomationPeriod(), editDiscordWebhookMessage(), healthCheckLine(), loadDigestState(), manilaMonthParts(), manilaPeriodKeys(), manilaScheduleParts(), monitoringState() (+23 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.07
Nodes (3): calendarToneOrder, clientBalance(), clientCreditState()

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "Implementation Plan: 003-scheduled-digest-backup-reliability"
Cohesion: 0.22
Nodes (8): 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback, Verification (no local env)

### Community 21 - "showSection"
Cohesion: 0.10
Nodes (26): applyCollectionPayment(), approvePaymentRequest(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory(), collectionTagForType(), findSaleByDocumentInput() (+18 more)

### Community 22 - "Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup"
Cohesion: 0.22
Nodes (8): Assumptions, Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup, Functional Requirements, Non-Functional / Constraints, Out of Scope, Problem, Requirements, Success Criteria

### Community 23 - "composeAndSendDigest"
Cohesion: 0.12
Nodes (31): auditLogDigestRows(), auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), buildBusinessSummaryLines(), composeAndSendDigest(), computeBusinessMetrics(), digestAttentionBannerHtml() (+23 more)

### Community 24 - "openModal"
Cohesion: 0.05
Nodes (52): buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists(), financialLineTemplate() (+44 more)

### Community 25 - "renderInventory"
Cohesion: 0.09
Nodes (32): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), approveStockReceipt(), canApproveDemoManagement(), canApproveDemoSales(), canApprovePurchaseOrders() (+24 more)

### Community 26 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 27 - "game.js"
Cohesion: 0.11
Nodes (36): closeGameModal(), computeThemeColors(), doJump(), drawGame(), drawRoundedRect(), endGame(), gameLoop(), hideOverlay() (+28 more)

### Community 28 - "memoCardHtml"
Cohesion: 0.13
Nodes (22): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+14 more)

### Community 29 - "renderUsers"
Cohesion: 0.09
Nodes (31): backupRunLabel(), canManageUsers(), canPostMemo(), cycleTimeCard(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser() (+23 more)

### Community 30 - "renderClientInvoices"
Cohesion: 0.12
Nodes (17): clientInvoicesExportRows(), clientInvoicesFilteredSales(), demoRequestHistoryCard(), exportClientInvoicesCsv(), getReportDefinitions(), openCollectionHistoryModal(), openReportPreview(), renderClientHistoryTabs() (+9 more)

### Community 31 - "openModal"
Cohesion: 0.08
Nodes (38): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions(), findClientByName(), nextCvNumber() (+30 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.23
Nodes (12): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), productIssueActionsMenu(), productIssueHistory(), productIssueParameterSummaryHtml(), productIssueStatusClass(), productIssueTurnaroundDays() (+4 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 34 - "clearPrintTarget"
Cohesion: 0.14
Nodes (18): addMonthsToDate(), changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastRows(), previewInventoryPurchaseOrder() (+10 more)

### Community 35 - "buildSale"
Cohesion: 0.06
Nodes (51): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), competingPurchaseOrdersForItem(), discountNeedsApproval(), documentExists() (+43 more)

### Community 36 - "i"
Cohesion: 0.20
Nodes (17): a(), ae(), as(), _e(), Gr(), i(), is(), Kr() (+9 more)

### Community 37 - "i"
Cohesion: 0.20
Nodes (17): a(), ae(), as(), _e(), Gr(), i(), is(), Kr() (+9 more)

### Community 38 - "public/scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 39 - "renderReconciliation"
Cohesion: 0.08
Nodes (33): applyReconciliationHistory(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+25 more)

### Community 40 - "computeValueMetrics"
Cohesion: 0.14
Nodes (20): averageOf(), catalogItemFor(), clientInvoiceReportHtml(), computeValueMetrics(), dashboardReportHtml(), daysBetween(), demoTurnaroundDays(), financialApprovalDays() (+12 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "printableFooterHtml"
Cohesion: 0.16
Nodes (15): clientInvoiceReportHtml(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), itemForecastReportHtml(), memoAudienceLabel(), memoPrintableHtml() (+7 more)

### Community 43 - "itemForecastRows"
Cohesion: 0.31
Nodes (9): addMonthsToDate(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastRows(), printItemForecast(), renderItemForecast(), renderItemForecastFilters(), setForecastDatalistOptions() (+1 more)

### Community 44 - "renderDashboard"
Cohesion: 0.11
Nodes (21): calendarState(), contactActionCard(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), monthLabel(), multiSeriesChart(), navigateCalendarWidget() (+13 more)

### Community 45 - "confirmDetailsModal"
Cohesion: 0.16
Nodes (15): approveFinancialRequest(), buildPrintTemplateCanvas(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal(), financialRequestDetailFields(), previewFinancialRequest() (+7 more)

### Community 46 - "saveData"
Cohesion: 0.21
Nodes (19): beginSaveOperation(), clearPendingSaveQueueKeys(), dedupeRecordsForSave(), endSaveOperation(), flushPendingSaveQueue(), hasPendingSaveQueue(), includesSearch(), inferredSaveKeys() (+11 more)

### Community 47 - "renderDashboard"
Cohesion: 0.11
Nodes (22): calendarState(), contactActionCard(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget(), notificationItem(), openContactRegion() (+14 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 50 - "sendResendEmail"
Cohesion: 0.50
Nodes (5): paceResend(), resendEmailRequest(), resendFrom(), sendResendEmail(), sleep()

### Community 51 - "supabaseFetch"
Cohesion: 0.17
Nodes (20): activeMetadataUsage(), appStateKey(), backupStatus(), checkBackupFreshnessHealth(), checkSupabaseAppRecordsHealth(), createBackup(), gunzipText(), gzipBytes() (+12 more)

### Community 52 - "Feature Specification: Editable Inventory Stock Rows with Change History and Notes"
Cohesion: 0.12
Nodes (15): Assumptions, Clarifications, Deferred to a follow-up, Edge Cases, Feature Specification: Editable Inventory Stock Rows with Change History and Notes, Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes (+7 more)

### Community 53 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 54 - "User Scenarios & Testing *(mandatory)*"
Cohesion: 0.14
Nodes (13): Assumptions, Edge Cases, Feature Specification: Masterlist Archive, Editable Submitted Client POs, Decimal PO Quantities, Login Preview Refresh, Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+5 more)

### Community 55 - "Tasks: 002-inventory-stock-edit-history"
Cohesion: 0.22
Nodes (8): Cross-cutting, Foundational (blocks US1), Grilling follow-ups (2026-08-27, resolved), Status (2026-08-27) — IMPLEMENTED, not yet verified live, Tasks: 002-inventory-stock-edit-history, US1 — Adjust quantity / correct expiry (P1), US2 — Stock row history view (P2), US3 — Notes column (P3)

### Community 56 - "createAppSession"
Cohesion: 0.38
Nodes (7): auditContextForRequest(), browserName(), clientIp(), createAppSession(), deviceName(), sessionHeader(), validateAppSession()

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

### Community 61 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 62 - "appendTableRows"
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 63 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 64 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 65 - "activeRecords"
Cohesion: 0.29
Nodes (7): activeBanks(), activeClients(), activeEmployees(), activeItems(), activeRecords(), activeSuppliers(), isArchived()

### Community 66 - "appendTableRows"
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "renderInventory"
Cohesion: 0.12
Nodes (24): canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineSummary(), inventoryItemLabel(), itemizedSummary(), payable2307Cell() (+16 more)

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "workflowFacts"
Cohesion: 0.33
Nodes (6): calendarEventsForMonth(), generatedNoticeDate(), inventoryStatus(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 72 - "bi"
Cohesion: 0.40
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "normalizeData"
Cohesion: 0.36
Nodes (8): applyPendingSaveQueueToLocal(), emptyProductionData(), fmtDate(), followupWeekKey(), loadData(), normalizeData(), refreshInventoryFromServer(), withStableFallbackIds()

### Community 74 - "workflowFacts"
Cohesion: 0.33
Nodes (6): calendarEventsForMonth(), generatedNoticeDate(), inventoryStatus(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 75 - "bi"
Cohesion: 0.40
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

### Community 80 - "jt"
Cohesion: 0.40
Nodes (5): Et(), jt(), qt(), Ut(), Vt()

### Community 81 - "ue"
Cohesion: 0.50
Nodes (5): he(), ne(), re(), se(), ue()

### Community 82 - "Implementation Plan: [FEATURE]"
Cohesion: 0.22
Nodes (8): Complexity Tracking, Constitution Check, Documentation (this feature), Implementation Plan: [FEATURE], Project Structure, Source Code (repository root), Summary, Technical Context

### Community 83 - "Implementation Plan: 001-masterlist-archive-po-edits"
Cohesion: 0.29
Nodes (6): Architecture notes, Design decisions, Files touched, Implementation Plan: 001-masterlist-archive-po-edits, Out of scope, Risks / mitigations

### Community 84 - "Agent Notes"
Cohesion: 0.40
Nodes (4): Agent Notes, Deploy Verification, Editing Gotchas, Project Shape

### Community 85 - "focusRecord"
Cohesion: 0.40
Nodes (5): ensureFocusedRecordsRendered(), focusRecord(), goToFocused(), prepareFocusedSection(), toast()

### Community 86 - "Tasks: 001-masterlist-archive-po-edits"
Cohesion: 0.22
Nodes (8): Cross-cutting, Grilling follow-ups (2026-08-27, round 2) — DONE, Status (2026-08-27), Tasks: 001-masterlist-archive-po-edits, US1 — Masterlist archive / restore (P1), US2 — Editable submitted client PO (P2), US3 — Decimal PO quantities (P2), US4 — Login preview refresh (P3, smallest, do first)

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "jt"
Cohesion: 0.40
Nodes (5): Et(), jt(), qt(), Ut(), Vt()

### Community 89 - "ue"
Cohesion: 0.50
Nodes (5): he(), ne(), re(), se(), ue()

### Community 90 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 93 - "Implementation Plan: 002-inventory-stock-edit-history"
Cohesion: 0.29
Nodes (6): Architecture notes, Design decisions, Files touched, Implementation Plan: 002-inventory-stock-edit-history, Out of scope, Risks / mitigations

### Community 95 - "pe"
Cohesion: 0.40
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 96 - "renderPrintTemplateSidePanel"
Cohesion: 0.24
Nodes (17): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+9 more)

### Community 97 - "renderAll"
Cohesion: 0.06
Nodes (48): applyRole(), approveExpense(), archiveMasterlistRecord(), canApproveMigrations(), confirmTransferDispatch(), confirmTransferReceive(), editPurchaseOrder(), getReportDefinitions() (+40 more)

### Community 98 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events"
Cohesion: 0.20
Nodes (9): Assumptions / Out of scope, Design, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord, Requirements, Requirements (+1 more)

### Community 108 - "clearPrintTarget"
Cohesion: 0.25
Nodes (9): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice(), printReportPreview(), printReportPreviewNoDate() (+1 more)

### Community 112 - "showAuthenticatedApp"
Cohesion: 0.25
Nodes (8): isSafeToApplyAppUpdate(), playDashboardLoginSound(), runAppVersionCheck(), scheduleAppVersionCheck(), setThemePreference(), showAuthenticatedApp(), startAppVersionWatch(), syncThemeToggleLabel()

### Community 113 - "sendDiscordDigest"
Cohesion: 0.29
Nodes (8): backupDigestLines(), discordBullet(), discordFieldValue(), pendingSummaryFields(), poFullyPaidServer(), salesPoStatusServer(), sendDiscordDigest(), trackNewOccurrences()

### Community 114 - "detectThresholdsAndApprovals"
Cohesion: 0.39
Nodes (8): dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil(), digestInventoryStatus(), digestSaleStatus(), inventoryStatusFields(), recordMonthKey()

### Community 123 - "buildPrintTemplateCanvas"
Cohesion: 0.29
Nodes (7): buildPrintTemplateCanvas(), printTemplateRecord(), ptFieldStyleAttr(), renderPrintTemplates(), resetPtAll(), resetPtRow(), savePrintTemplate()

### Community 124 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

### Community 125 - "syncBackendUsers"
Cohesion: 0.40
Nodes (6): confirmInviteUser(), handleUserInvite(), mergeUsersFromBackend(), submitModal(), syncBackendUsers(), toggleUserDisabled()

### Community 126 - "Tasks: 004-audit-digest-view-and-discord-events"
Cohesion: 0.33
Nodes (5): Follow-up (not done), Part A — View digest message from Audit Logs, Part B — Discord workflow events, Tasks: 004-audit-digest-view-and-discord-events, Verify

### Community 127 - "pe"
Cohesion: 0.40
Nodes (5): de(), ee(), fe(), ge(), pe()

## Knowledge Gaps
- **242 isolated node(s):** `common.sh script`, `peso`, `today`, `uomOptions`, `supplierClassificationOptions` (+237 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderInventory` to `fetch`, `supabaseFetch`?**
  _High betweenness centrality (0.225) - this node is a cross-community bridge._
- **Why does `MedlaneAPI` connect `renderAll` to `fetch`, `supabaseFetch`?**
  _High betweenness centrality (0.220) - this node is a cross-community bridge._
- **Why does `backupStatus()` connect `supabaseFetch` to `renderInventory`, `fetch`, `worker.js`, `renderAll`?**
  _High betweenness centrality (0.136) - this node is a cross-community bridge._
- **What connects `common.sh script`, `peso`, `today` to the rest of the system?**
  _242 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05384615384615385 - nodes in this community are weakly interconnected._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05764145954521417 - nodes in this community are weakly interconnected._
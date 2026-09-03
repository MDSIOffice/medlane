# Graph Report - medlane  (2026-09-03)

## Corpus Check
- 60 files · ~320,290 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2225 nodes · 4728 edges · 126 communities (107 shown, 19 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 249 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `7fd81d79`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- public/scripts/state.js
- scripts/state.js
- scripts/events-bootstrap.js
- public/scripts/events-bootstrap.js
- renderCollectionMapVisual
- public/scripts/modules.js
- scripts/modules.js
- public/scripts/vendor/pdf-lib.min.js
- scripts/vendor/pdf-lib.min.js
- renderAll
- worker.js
- saveStockSheet
- importCheckedRows
- printableInvoiceHtml
- attachedFilesFor
- importCheckedRows
- syncStockSheetRow
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- Implementation Plan: 003-scheduled-digest-backup-reliability
- renderInventory
- Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup
- composeAndSendDigest
- openModal
- renderInventory
- renderUsers
- game.js
- renderLogs
- renderCollections
- renderReconciliation
- openModal
- renderProductIssues
- syncPaymentRequestTotal
- renderCollections
- buildSale
- i
- i
- public/scripts/config-data.js
- attachedFilesFor
- computeValueMetrics
- scripts/config-data.js
- printableFooterHtml
- clientBalance
- renderPayables
- renderPrintTemplateSidePanel
- saveData
- renderDashboard
- syncStockSheetRow
- common.sh
- sendDiscordWebhook
- supabaseFetch
- Feature Specification: Editable Inventory Stock Rows with Change History and Notes
- Tasks: [FEATURE NAME]
- User Scenarios & Testing *(mandatory)*
- Tasks: 002-inventory-stock-edit-history
- json
- Bt
- za
- Bt
- za
- renderReconciliation
- appendTableRows
- gi
- Ir
- activeRecords
- appendTableRows
- gi
- Ir
- clearPrintTarget
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
- memoCardHtml
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- Implementation Plan: 002-inventory-stock-edit-history
- public/scripts/landing-motion.js
- normalizePayableWithholding
- is
- renderAll
- guardedDialogClose
- scripts/landing-motion.js
- Handoff: Medlane OS Login Page Redesign
- Tasks: 003-scheduled-digest-backup-reliability
- grilling.md
- guardedDialogClose
- graphNote
- Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events
- arTrackerStage
- canSeeNotification
- financialRequestPrintableHtml
- clientTaxBadge
- documentType
- workflowCard
- clearPrintTarget
- money
- is
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard
- confirmDetailsModal
- Tasks: 004-audit-digest-view-and-discord-events
- 004-audit-digest-view-and-discord-events/grilling.md

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 97 edges
2. `renderAll()` - 56 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 30 edges
5. `openModal()` - 29 edges
6. `supabaseFetch()` - 27 edges
7. `composeAndSendDigest()` - 27 edges
8. `renderInventory()` - 22 edges
9. `recordSystemLog()` - 20 edges
10. `renderInventory()` - 19 edges

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

## Communities (126 total, 19 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (15): accounts, canEditActiveSection(), canEditModule(), canEditStockRecord(), clientCoordinates, currentUser, editableModules(), frontendModuleRecordKeys (+7 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.05
Nodes (55): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+47 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.07
Nodes (39): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+31 more)

### Community 4 - "renderCollectionMapVisual"
Cohesion: 0.11
Nodes (21): collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds(), geoRegionName() (+13 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (96): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+88 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.03
Nodes (77): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+69 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 9 - "renderAll"
Cohesion: 0.07
Nodes (45): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+37 more)

### Community 10 - "worker.js"
Cohesion: 0.05
Nodes (81): applyReceivingLines(), canAccessKey(), canWrite(), checkAssetPageHealth(), cleanEmail(), daysUntilIso(), dedupeRowsByRecordKey(), defaultSeedSignature (+73 more)

### Community 11 - "saveStockSheet"
Cohesion: 0.18
Nodes (14): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), canApprovePurchaseOrders(), cancelPurchaseOrder(), canManagePoReceiving(), inventoryPoActionsCell() (+6 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "printableInvoiceHtml"
Cohesion: 0.19
Nodes (13): documentType(), fieldOverrideStyle(), formDate(), formMoney(), lineAmount(), printableInvoiceHtml(), printableRows(), productIssuePrintableHtml() (+5 more)

### Community 14 - "attachedFilesFor"
Cohesion: 0.09
Nodes (30): applyCollectionPayment(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+22 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.13
Nodes (31): approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusHistory() (+23 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.11
Nodes (27): addStockSheetRow(), addTransferSheetRow(), branchOptions(), clearStockSheetDraft(), clearTransferSheetDraft(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt(), findItemForSheetRow() (+19 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.19
Nodes (27): claimAutomationPeriod(), editDiscordWebhookMessage(), healthCheckLine(), loadDigestState(), manilaMonthParts(), manilaScheduleParts(), monitoringState(), normalizeBranchName() (+19 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "Implementation Plan: 003-scheduled-digest-backup-reliability"
Cohesion: 0.22
Nodes (8): 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback, Verification (no local env)

### Community 21 - "renderInventory"
Cohesion: 0.09
Nodes (31): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), approveStockReceipt(), canApproveDemoManagement(), canApproveDemoSales(), canApprovePurchaseOrders() (+23 more)

### Community 22 - "Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup"
Cohesion: 0.22
Nodes (8): Assumptions, Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup, Functional Requirements, Non-Functional / Constraints, Out of Scope, Problem, Requirements, Success Criteria

### Community 23 - "composeAndSendDigest"
Cohesion: 0.15
Nodes (21): auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), composeAndSendDigest(), digestAttentionBannerHtml(), digestDeltaBadge(), digestEmailHtml(), digestProgressStateKey() (+13 more)

### Community 24 - "openModal"
Cohesion: 0.05
Nodes (58): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists() (+50 more)

### Community 25 - "renderInventory"
Cohesion: 0.10
Nodes (27): canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineSummary(), inventoryItemLabel(), itemizedSummary(), notificationItem() (+19 more)

### Community 26 - "renderUsers"
Cohesion: 0.11
Nodes (24): dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), memoRecipientCount() (+16 more)

### Community 27 - "game.js"
Cohesion: 0.11
Nodes (36): closeGameModal(), computeThemeColors(), doJump(), drawGame(), drawRoundedRect(), endGame(), gameLoop(), hideOverlay() (+28 more)

### Community 28 - "renderLogs"
Cohesion: 0.12
Nodes (21): dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), memoRecipientCount() (+13 more)

### Community 29 - "renderCollections"
Cohesion: 0.15
Nodes (19): applyCollectionPayment(), approvePaymentRequest(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory(), collectionTagForType(), findSaleByDocumentInput() (+11 more)

### Community 30 - "renderReconciliation"
Cohesion: 0.18
Nodes (13): applyReconciliationHistory(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), periodKey(), recordReconciliationRun() (+5 more)

### Community 31 - "openModal"
Cohesion: 0.07
Nodes (45): collectFinancialLines(), collectInvoicePreviewLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions(), findClientByName() (+37 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.19
Nodes (14): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), productIssueActionsMenu(), productIssueHistory(), productIssueParameterSummaryHtml(), productIssueStatusClass() (+6 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 34 - "renderCollections"
Cohesion: 0.09
Nodes (27): calendarState(), collectionStatusActions(), contactActionCard(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), monthLabel(), multiSeriesChart() (+19 more)

### Community 35 - "buildSale"
Cohesion: 0.06
Nodes (48): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), competingPurchaseOrdersForItem(), discountNeedsApproval(), documentExists(), editPurchaseOrder() (+40 more)

### Community 36 - "i"
Cohesion: 0.18
Nodes (17): a(), ae(), de(), _e(), ee(), fe(), ge(), Gr() (+9 more)

### Community 37 - "i"
Cohesion: 0.18
Nodes (17): a(), ae(), de(), _e(), ee(), fe(), ge(), Gr() (+9 more)

### Community 38 - "public/scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 39 - "attachedFilesFor"
Cohesion: 0.11
Nodes (27): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+19 more)

### Community 40 - "computeValueMetrics"
Cohesion: 0.15
Nodes (18): averageOf(), backupRunLabel(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard(), daysBetween(), demoTurnaroundDays() (+10 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "printableFooterHtml"
Cohesion: 0.09
Nodes (27): addMonthsToDate(), clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportClientInvoicesCsv() (+19 more)

### Community 44 - "renderPayables"
Cohesion: 0.24
Nodes (11): demoRequestLineSummary(), itemizedSummary(), payable2307Cell(), payableWithholdingSummary(), paymentConfirmActions(), renderFinancialSummary(), renderPayables(), renderPayablesWorkflowTabs() (+3 more)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.24
Nodes (17): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+9 more)

### Community 46 - "saveData"
Cohesion: 0.21
Nodes (19): beginSaveOperation(), clearPendingSaveQueueKeys(), dedupeRecordsForSave(), endSaveOperation(), flushPendingSaveQueue(), hasPendingSaveQueue(), includesSearch(), inferredSaveKeys() (+11 more)

### Community 47 - "renderDashboard"
Cohesion: 0.12
Nodes (21): backupRunLabel(), calendarState(), canManageUsers(), formatBytes(), formatSessionDate(), lineChart(), monthLabel(), multiSeriesChart() (+13 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 50 - "sendDiscordWebhook"
Cohesion: 0.25
Nodes (9): discordEventEmbed(), eventActor(), paceResend(), postWorkflowEventToDiscord(), resendEmailRequest(), resendFrom(), sendDiscordWebhook(), sendResendEmail() (+1 more)

### Community 51 - "supabaseFetch"
Cohesion: 0.15
Nodes (23): activeMetadataUsage(), appStateKey(), auditLogDigestRows(), backupStatus(), checkBackupFreshnessHealth(), checkSupabaseAppRecordsHealth(), createBackup(), digestRecipients() (+15 more)

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

### Community 56 - "json"
Cohesion: 0.17
Nodes (16): auditContextForRequest(), authenticatedProfile(), authenticatedUser(), browserName(), clientIp(), createAppSession(), deviceName(), json() (+8 more)

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

### Community 61 - "renderReconciliation"
Cohesion: 0.20
Nodes (12): applyReconciliationHistory(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), periodKey(), recordReconciliationRun() (+4 more)

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

### Community 69 - "clearPrintTarget"
Cohesion: 0.11
Nodes (21): addMonthsToDate(), changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastRows(), openCollectionHistoryModal() (+13 more)

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

### Community 90 - "memoCardHtml"
Cohesion: 0.12
Nodes (23): canPostMemo(), clientInvoiceReportHtml(), dashboardReportHtml(), itemForecastReportHtml(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml(), memoAudienceLabel(), memoCardHtml() (+15 more)

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 93 - "Implementation Plan: 002-inventory-stock-edit-history"
Cohesion: 0.29
Nodes (6): Architecture notes, Design decisions, Files touched, Implementation Plan: 002-inventory-stock-edit-history, Out of scope, Risks / mitigations

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 95 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 96 - "is"
Cohesion: 0.50
Nodes (5): as(), is(), Ms(), os(), rs()

### Community 97 - "renderAll"
Cohesion: 0.05
Nodes (57): applyRole(), approveExpense(), archiveMasterlistRecord(), canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue() (+49 more)

### Community 98 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events"
Cohesion: 0.20
Nodes (9): Assumptions / Out of scope, Design, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord, Requirements, Requirements (+1 more)

### Community 108 - "financialRequestPrintableHtml"
Cohesion: 0.35
Nodes (11): financialRequestPrintableHtml(), hasWithholding(), inventoryPoPrintableHtml(), itemGross(), moneyWithCents(), paymentRequestPrintableHtml(), printableBrandHeader(), printableFooter() (+3 more)

### Community 112 - "clearPrintTarget"
Cohesion: 0.18
Nodes (12): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), openCollectionHistoryModal(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice(), printReportPreview() (+4 more)

### Community 113 - "money"
Cohesion: 0.13
Nodes (24): addDays(), backupDigestLines(), buildBusinessSummaryLines(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil() (+16 more)

### Community 114 - "is"
Cohesion: 0.50
Nodes (5): as(), is(), Ms(), os(), rs()

### Community 123 - "confirmDetailsModal"
Cohesion: 0.12
Nodes (19): approveFinancialRequest(), buildPrintTemplateCanvas(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal(), financialRequestDetailFields() (+11 more)

### Community 126 - "Tasks: 004-audit-digest-view-and-discord-events"
Cohesion: 0.33
Nodes (5): Follow-up (not done), Part A — View digest message from Audit Logs, Part B — Discord workflow events, Tasks: 004-audit-digest-view-and-discord-events, Verify

## Knowledge Gaps
- **252 isolated node(s):** `common.sh script`, `peso`, `today`, `uomOptions`, `supplierClassificationOptions` (+247 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderInventory` to `worker.js`, `supabaseFetch`?**
  _High betweenness centrality (0.227) - this node is a cross-community bridge._
- **Why does `MedlaneAPI` connect `saveStockSheet` to `worker.js`, `supabaseFetch`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Why does `backupStatus()` connect `supabaseFetch` to `worker.js`, `saveStockSheet`, `renderInventory`?**
  _High betweenness centrality (0.139) - this node is a cross-community bridge._
- **What connects `common.sh script`, `peso`, `today` to the rest of the system?**
  _252 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05384615384615385 - nodes in this community are weakly interconnected._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05407925407925408 - nodes in this community are weakly interconnected._
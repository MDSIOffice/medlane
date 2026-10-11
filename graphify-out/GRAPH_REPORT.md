# Graph Report - medlane  (2026-10-11)

## Corpus Check
- 66 files · ~353,775 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2397 nodes · 5139 edges · 119 communities (107 shown, 12 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 270 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8b39f991`
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
- printableFooterHtml
- importCheckedRows
- worker.js
- renderInvoicing
- importCheckedRows
- syncStockSheetRow
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- Implementation Plan: 003-scheduled-digest-backup-reliability
- buildSale
- Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup
- escapeHtml
- findItemByCodeOrName
- showSection
- renderUsers
- game.js
- renderLogs
- renderCollections
- renderPrintTemplateSidePanel
- memoCardHtml
- renderProductIssues
- openModal
- renderDashboard
- json
- i
- i
- public/scripts/config-data.js
- attachedFilesFor
- pe
- scripts/config-data.js
- showSection
- comboHandleKeydown
- createAppSession
- renderPrintTemplateSidePanel
- saveData
- renderDashboard
- syncStockSheetRow
- common.sh
- renderInventory
- Feature Specification: Editable Inventory Stock Rows with Change History and Notes
- Tasks: [FEATURE NAME]
- User Scenarios & Testing *(mandatory)*
- Tasks: 002-inventory-stock-edit-history
- Tasks: 005-luksong-milestone-juice-and-skins
- Bt
- za
- Bt
- za
- Feature Specification: Luksong Medlane — Milestone Juice + Cosmetic Skins
- appendTableRows
- gi
- Ir
- activeRecords
- appendTableRows
- gi
- Ir
- printableFooterHtml
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
- qs
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- Implementation Plan: 002-inventory-stock-edit-history
- public/scripts/landing-motion.js
- is
- renderAll
- scripts/landing-motion.js
- Handoff: Medlane OS Login Page Redesign
- Tasks: 003-scheduled-digest-backup-reliability
- grilling.md
- guardedDialogClose
- Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events
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
- Tasks: 004-audit-digest-view-and-discord-events
- 005-luksong-milestone-juice-and-skins/grilling.md
- 004-audit-digest-view-and-discord-events/grilling.md
- package.json
- canEditActiveSection

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 107 edges
2. `renderAll()` - 58 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 32 edges
5. `openModal()` - 29 edges
6. `supabaseFetch()` - 29 edges
7. `composeAndSendDigest()` - 29 edges
8. `renderInventory()` - 27 edges
9. `recordSystemLog()` - 22 edges
10. `showSection()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `MedlaneAPI` --indirect_call--> `backupStatus()`  [INFERRED]
  public/scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `storageUsage()`  [INFERRED]
  public/scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `backupStatus()`  [INFERRED]
  scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `storageUsage()`  [INFERRED]
  scripts/api-client.js → src/worker.js
- `MedlaneAPI` --indirect_call--> `resetUserPermissions()`  [INFERRED]
  public/scripts/api-client.js → public/scripts/events-bootstrap.js

## Import Cycles
- None detected.

## Communities (119 total, 12 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (14): accounts, clientCoordinates, currentUser, frontendModuleRecordKeys, itemForecastFilters, LIVE_SINGLETON_KEYS, modulePagination, PRINT_TEMPLATE_FIELDS (+6 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (47): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+39 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.05
Nodes (57): authHashParams(), clearBackupStatus(), confirmInviteUser(), connectLiveSocket(), downloadBackupFile(), downloadBackupObjectFile(), flushLiveSyncRender(), handleUserInvite() (+49 more)

### Community 4 - "openModal"
Cohesion: 0.07
Nodes (42): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions(), findClientByName(), latestAllowedBirthday() (+34 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (114): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+106 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.02
Nodes (103): applyReconciliationHistory(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+95 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 9 - "renderAll"
Cohesion: 0.07
Nodes (41): advancePurchaseOrderStatus(), applyRole(), approveExpense(), approveFinancialRequest(), approvePurchaseOrder(), canApproveMigrations(), canApprovePurchaseOrders(), cancelFinancialRequest() (+33 more)

### Community 10 - "fetch"
Cohesion: 0.06
Nodes (45): canAccessKey(), checkAssetPageHealth(), cleanEmail(), dedupeRowsByRecordKey(), enrichAuditLogEntry(), extractLinkResult(), fetch(), filterRecordsForProfile() (+37 more)

### Community 11 - "printableFooterHtml"
Cohesion: 0.11
Nodes (23): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), itemForecastMonthKeys(), itemForecastMonthLabels() (+15 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.10
Nodes (36): approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions() (+28 more)

### Community 13 - "worker.js"
Cohesion: 0.04
Nodes (70): addDays(), applyReceivingLines(), BIRTHDAY_GIF_IDS, buildServedQtyByPo(), canWrite(), daysUntilIso(), defaultSeedSignature, DEMO_ONLY_ROLES (+62 more)

### Community 14 - "renderInvoicing"
Cohesion: 0.08
Nodes (38): acknowledgeMemo(), applyReconciliationHistory(), attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus() (+30 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 16 - "syncStockSheetRow"
Cohesion: 0.11
Nodes (26): addStockSheetRow(), addTransferSheetRow(), branchOptions(), clearStockSheetDraft(), clearTransferSheetDraft(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt(), itemBranchBalances() (+18 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.16
Nodes (33): claimAutomationPeriod(), deleteDiscordWebhookMessage(), discordSafeText(), editDiscordWebhookMessage(), healthCheckLine(), manilaMonthParts(), manilaScheduleParts(), monitoringState() (+25 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.05
Nodes (19): arTrackerStage(), arTrackerTabs(), calendarToneOrder, canSeeNotification(), clientBalance(), clientCreditState(), clientTaxBadge(), clientTaxLabels() (+11 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "Implementation Plan: 003-scheduled-digest-backup-reliability"
Cohesion: 0.22
Nodes (8): 1. Resend pacing + 429 retry (`sendResendEmail` area), 2. Stagger the 18:00 jobs (`runFiveMinuteScheduledTasks`), 3. Two-phase automation claim (`claimAutomationPeriod`, `runOncePerPeriod`), Changes, Files touched, Implementation Plan: 003-scheduled-digest-backup-reliability, Rollback, Verification (no local env)

### Community 21 - "buildSale"
Cohesion: 0.06
Nodes (54): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), competingPurchaseOrdersForItem(), discountNeedsApproval(), documentExists() (+46 more)

### Community 22 - "Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup"
Cohesion: 0.22
Nodes (8): Assumptions, Feature Specification: Reliable Daily Digest Email and Automatic Friday Backup, Functional Requirements, Non-Functional / Constraints, Out of Scope, Problem, Requirements, Success Criteria

### Community 23 - "escapeHtml"
Cohesion: 0.17
Nodes (22): brandedEmailHtml(), brandedInviteEmailHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml(), digestStatCardsHtml(), digestToneColors(), escapeHtml() (+14 more)

### Community 24 - "findItemByCodeOrName"
Cohesion: 0.08
Nodes (33): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), discountNeedsApproval(), documentExists(), findItemByCodeOrName() (+25 more)

### Community 25 - "showSection"
Cohesion: 0.10
Nodes (24): applyCollectionPayment(), getReportDefinitions(), inventoryPoHistoryClass(), loadMoreUserAuditLog(), openReportPreview(), openUserAuditLog(), paymentRequestHistory(), poHistory() (+16 more)

### Community 26 - "renderUsers"
Cohesion: 0.10
Nodes (27): canSearchCollectionsClientHistory(), dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams() (+19 more)

### Community 27 - "game.js"
Cohesion: 0.08
Nodes (57): addShake(), applyScoreResult(), attemptScoreSubmit(), clamp01(), closeGameModal(), computeThemeColors(), doJump(), drawGame() (+49 more)

### Community 28 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 29 - "renderCollections"
Cohesion: 0.09
Nodes (30): applyCollectionPayment(), approveCreditInvoice(), approvePaymentRequest(), canApproveCreditInvoice(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory() (+22 more)

### Community 30 - "renderPrintTemplateSidePanel"
Cohesion: 0.15
Nodes (24): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord() (+16 more)

### Community 31 - "memoCardHtml"
Cohesion: 0.13
Nodes (22): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+14 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 33 - "openModal"
Cohesion: 0.07
Nodes (39): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions(), findClientByName(), nextCvNumber() (+31 more)

### Community 34 - "renderDashboard"
Cohesion: 0.09
Nodes (32): averageOf(), backupRunLabel(), calendarState(), canManageUsers(), catalogItemFor(), computeValueMetrics(), cycleTimeCard(), daysBetween() (+24 more)

### Community 35 - "json"
Cohesion: 0.12
Nodes (19): authenticatedProfile(), authenticatedUser(), isTransientJwtClockSkew(), json(), LiveHub, methodNotAllowed(), paceResend(), profileForUser() (+11 more)

### Community 36 - "i"
Cohesion: 0.20
Nodes (17): a(), ae(), as(), _e(), Gr(), i(), is(), Kr() (+9 more)

### Community 37 - "i"
Cohesion: 0.18
Nodes (17): a(), ae(), de(), _e(), ee(), fe(), ge(), Gr() (+9 more)

### Community 38 - "public/scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 39 - "attachedFilesFor"
Cohesion: 0.12
Nodes (21): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml(), compressImageFile() (+13 more)

### Community 40 - "pe"
Cohesion: 0.40
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "showSection"
Cohesion: 0.06
Nodes (41): applyOperationalReport(), canActOnProductIssue(), canRestoreSection(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportInvoicingCsv(), exportItemizedInvoicingCsv() (+33 more)

### Community 43 - "comboHandleKeydown"
Cohesion: 0.38
Nodes (10): comboClose(), comboFilter(), comboHandleKeydown(), comboOpen(), comboOptionsFor(), comboRefresh(), comboRenderOptions(), comboReposition() (+2 more)

### Community 44 - "createAppSession"
Cohesion: 0.38
Nodes (7): auditContextForRequest(), browserName(), clientIp(), createAppSession(), deviceName(), sessionHeader(), validateAppSession()

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.15
Nodes (24): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord() (+16 more)

### Community 46 - "saveData"
Cohesion: 0.38
Nodes (11): clearPendingSaveQueueKeys(), dedupeRecordsForSave(), flushPendingSaveQueue(), hasPendingSaveQueue(), mergePendingSaveQueue(), pendingSaveQueueKey(), persistRecords(), readPendingSaveQueue() (+3 more)

### Community 47 - "renderDashboard"
Cohesion: 0.19
Nodes (14): calendarState(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget(), registerCalendarWidget(), renderAnalytics(), renderCalendarSection() (+6 more)

### Community 48 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 49 - "common.sh"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 50 - "renderInventory"
Cohesion: 0.08
Nodes (37): MedlaneAPI, resetUserPermissions(), advancePurchaseOrderStatus(), approvePurchaseOrder(), approveStockReceipt(), canApproveDemoLogistics(), canApproveDemoManagement(), canApproveDemoSales() (+29 more)

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

### Community 56 - "Tasks: 005-luksong-milestone-juice-and-skins"
Cohesion: 0.15
Nodes (12): Asset, Follow-up (not in this feature), game.js — shared plumbing, Part A — milestone callouts, Part B — screen shake, Part C — overdrive, Part D — day → night, Part E — approved-stamp shield (+4 more)

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

### Community 61 - "Feature Specification: Luksong Medlane — Milestone Juice + Cosmetic Skins"
Cohesion: 0.17
Nodes (11): Assumptions / Out of scope, Context, Feature Specification: Luksong Medlane — Milestone Juice + Cosmetic Skins, Part A — Milestone callouts, Part B — Screen shake, Part C — Overdrive (speed lines + hue wash), Part D — Day → night, Part E — "Approved stamp" one-hit shield (+3 more)

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

### Community 69 - "printableFooterHtml"
Cohesion: 0.09
Nodes (29): addMonthsToDate(), clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportClientInvoicesCsv() (+21 more)

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "setupReportDetailToolbar"
Cohesion: 0.21
Nodes (17): renderClientDocumentsReport(), renderCollectionsArReport(), renderComplianceAuditReport(), renderComplianceAuditTable(), renderReagentExpiryReport(), renderReportKpis(), renderSalesTerritoryReport(), renderServiceWarrantyReport() (+9 more)

### Community 72 - "bi"
Cohesion: 0.40
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "normalizeData"
Cohesion: 0.29
Nodes (10): applyPendingSaveQueueToLocal(), emptyProductionData(), fmtDate(), followupWeekKey(), loadData(), mergeLiveChanges(), normalizeData(), refreshInventoryFromServer() (+2 more)

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

### Community 90 - "qs"
Cohesion: 0.38
Nodes (7): beginSaveOperation(), endSaveOperation(), includesSearch(), inferredSaveKeys(), qs(), setGlobalSaveStatus(), updateSaveGuardOverlay()

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 93 - "Implementation Plan: 002-inventory-stock-edit-history"
Cohesion: 0.29
Nodes (6): Architecture notes, Design decisions, Files touched, Implementation Plan: 002-inventory-stock-edit-history, Out of scope, Risks / mitigations

### Community 94 - "public/scripts/landing-motion.js"
Cohesion: 0.60
Nodes (4): moveInk(), onScroll(), setActive(), updateScrollUi()

### Community 95 - "is"
Cohesion: 0.50
Nodes (5): as(), is(), Ms(), os(), rs()

### Community 97 - "renderAll"
Cohesion: 0.05
Nodes (53): applyRole(), approveExpense(), approveFinancialRequest(), archiveMasterlistRecord(), canApproveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmFinancialPayment() (+45 more)

### Community 100 - "Handoff: Medlane OS Login Page Redesign"
Cohesion: 0.17
Nodes (11): About the Design Files, Assets, Design Tokens, Fidelity, Files, Handoff: Medlane OS Login Page Redesign, Interactions & Behavior, Overview (+3 more)

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 105 - "Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events"
Cohesion: 0.20
Nodes (9): Assumptions / Out of scope, Design, Design, Feature Specification: View Digest Email from Audit Logs + Discord Workflow Events, Part A — View the digest email from Audit Logs, Part B — Broadcast workflow status changes / approvals to Discord, Requirements, Requirements (+1 more)

### Community 108 - "normalizePayableWithholding"
Cohesion: 0.60
Nodes (6): hasWithholding(), itemGross(), normalizePayableWithholding(), normalizePaymentRequestWithholding(), roundCurrency(), withholdingBaseFromGross()

### Community 112 - "renderInventory"
Cohesion: 0.10
Nodes (28): addDemoRequestLine(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineRow(), demoRequestLineSummary(), ensureInventoryDatalists() (+20 more)

### Community 113 - "composeAndSendDigest"
Cohesion: 0.11
Nodes (29): auditLogTableHtml(), backupDigestLines(), buildBusinessSummaryLines(), composeAndSendDigest(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestAttentionBannerHtml() (+21 more)

### Community 123 - "supabaseFetch"
Cohesion: 0.09
Nodes (36): MedlaneAPI, acknowledgeMemo(), activeMetadataUsage(), appStateKey(), assertCreditApprovalAllowed(), assertDemoRequestTransitionsAllowed(), assertFinancialApprovalAllowed(), auditLogDigestRows() (+28 more)

### Community 126 - "Tasks: 004-audit-digest-view-and-discord-events"
Cohesion: 0.33
Nodes (5): Follow-up (not done), Part A — View digest message from Audit Logs, Part B — Discord workflow events, Tasks: 004-audit-digest-view-and-discord-events, Verify

### Community 129 - "package.json"
Cohesion: 0.22
Nodes (8): clean-css-cli, devDependencies, clean-css-cli, name, private, scripts, build, build:css

### Community 132 - "canEditActiveSection"
Cohesion: 0.50
Nodes (4): canEditActiveSection(), canEditModule(), canEditStockRecord(), editableModules()

## Knowledge Gaps
- **299 isolated node(s):** `common.sh script`, `name`, `private`, `build:css`, `build` (+294 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderInventory` to `supabaseFetch`, `renderInvoicing`?**
  _High betweenness centrality (0.211) - this node is a cross-community bridge._
- **Why does `MedlaneAPI` connect `supabaseFetch` to `renderAll`?**
  _High betweenness centrality (0.203) - this node is a cross-community bridge._
- **Why does `backupStatus()` connect `supabaseFetch` to `renderInventory`, `fetch`, `worker.js`?**
  _High betweenness centrality (0.125) - this node is a cross-community bridge._
- **What connects `common.sh script`, `name`, `private` to the rest of the system?**
  _299 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.056261343012704176 - nodes in this community are weakly interconnected._
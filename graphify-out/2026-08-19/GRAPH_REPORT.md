# Graph Report - medlaneOSGIT  (2026-08-19)

## Corpus Check
- 46 files · ~278,346 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1952 nodes · 4209 edges · 112 communities (95 shown, 17 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 233 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `db797159`
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
- renderAll
- importCheckedRows
- worker.js
- attachedFilesFor
- importCheckedRows
- attachedFilesFor
- runApiHealthMonitor
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- renderCollectionMapVisual
- renderInventory
- renderCollectionMapVisual
- composeAndSendDigest
- printableFooterHtml
- renderInventory
- supabaseFetch
- memoCardHtml
- renderBackup
- renderDashboard
- renderProductIssues
- openModal
- renderProductIssues
- syncPaymentRequestTotal
- renderCollections
- findItemByCodeOrName
- i
- i
- public/scripts/config-data.js
- renderLogs
- saveStockSheet
- scripts/config-data.js
- printableFooterHtml
- renderLogs
- syncStockSheetRow
- renderPrintTemplateSidePanel
- syncStockSheetRow
- renderDashboard
- clearBackupStatus
- common.sh
- clearPrintTarget
- syncBackendUsers
- renderReconciliation
- Tasks: [FEATURE NAME]
- renderCollections
- recordSystemLog
- createAppSession
- Bt
- za
- Bt
- za
- showSection
- appendTableRows
- gi
- Ir
- clearPrintTarget
- appendTableRows
- gi
- Ir
- saveStockSheet
- Feature Specification: [FEATURE NAME]
- workflowFacts
- bi
- money
- workflowFacts
- bi
- Core Principles
- focusRecord
- ja
- Core Principles
- jt
- ue
- Implementation Plan: [FEATURE]
- renderReconciliation
- Agent Notes
- focusRecord
- pe
- ja
- jt
- ue
- pe
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- graphNote
- public/scripts/landing-motion.js
- guardedDialogClose
- scripts/landing-motion.js
- guardedDialogClose
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard
- arTrackerStage
- canSeeNotification
- clientBalance
- clientTaxBadge
- documentType
- workflowCard

## God Nodes (most connected - your core abstractions)
1. `fetch()` - 76 edges
2. `renderAll()` - 52 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 29 edges
5. `openModal()` - 29 edges
6. `supabaseFetch()` - 27 edges
7. `composeAndSendDigest()` - 22 edges
8. `renderInventory()` - 19 edges
9. `renderInventory()` - 19 edges
10. `escapeHtml()` - 18 edges

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

## Communities (112 total, 17 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.09
Nodes (22): authHashParams(), hydrateAuthenticatedSession(), initializeRoute(), isAuthenticatedRoute(), isDashboardRoute(), isLoginRoute(), jwtEmail(), logoutCurrentUser() (+14 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.05
Nodes (55): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+47 more)

### Community 4 - "openModal"
Cohesion: 0.05
Nodes (52): buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists(), financialLineTemplate() (+44 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.03
Nodes (71): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+63 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.03
Nodes (79): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+71 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 9 - "renderAll"
Cohesion: 0.08
Nodes (36): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+28 more)

### Community 10 - "fetch"
Cohesion: 0.08
Nodes (39): activeMetadataUsage(), authenticatedProfile(), authenticatedUser(), cleanEmail(), extractLinkResult(), fetch(), findAuthUserByEmail(), findAuthUserForProfileOrEmail() (+31 more)

### Community 11 - "renderAll"
Cohesion: 0.07
Nodes (43): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+35 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "worker.js"
Cohesion: 0.06
Nodes (45): canAccessKey(), canWrite(), daysUntilIso(), dedupeRowsByRecordKey(), defaultSeedSignature, DIGEST_AUDIT_NOISE_ACTIONS, DIGEST_COLORS, DIGEST_METRIC_CARDS (+37 more)

### Community 14 - "attachedFilesFor"
Cohesion: 0.12
Nodes (21): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml(), compressImageFile() (+13 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.18
Nodes (24): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), findSaleByDocumentInput(), importAddress(), importCheckedRows() (+16 more)

### Community 16 - "attachedFilesFor"
Cohesion: 0.11
Nodes (27): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+19 more)

### Community 17 - "runApiHealthMonitor"
Cohesion: 0.12
Nodes (26): checkAssetPageHealth(), checkBackupFreshnessHealth(), dashboardAnalyticsFields(), editDiscordWebhookMessage(), healthCheckLine(), loadDigestSnapshot(), loadDigestState(), manilaMonthParts() (+18 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "renderCollectionMapVisual"
Cohesion: 0.10
Nodes (24): collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds(), geoRegionName() (+16 more)

### Community 21 - "renderInventory"
Cohesion: 0.13
Nodes (23): canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineSummary(), inventoryItemLabel(), itemizedSummary(), payable2307Cell() (+15 more)

### Community 22 - "renderCollectionMapVisual"
Cohesion: 0.10
Nodes (24): collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds(), geoRegionName() (+16 more)

### Community 23 - "composeAndSendDigest"
Cohesion: 0.16
Nodes (24): auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), composeAndSendDigest(), digestAttentionBannerHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml() (+16 more)

### Community 24 - "printableFooterHtml"
Cohesion: 0.18
Nodes (14): clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportClientInvoicesCsv(), exportDashboardCsv() (+6 more)

### Community 25 - "renderInventory"
Cohesion: 0.12
Nodes (24): canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineSummary(), inventoryItemLabel(), itemizedSummary(), payable2307Cell() (+16 more)

### Community 26 - "supabaseFetch"
Cohesion: 0.18
Nodes (20): appStateKey(), auditLogDigestRows(), backupStatus(), checkSupabaseAppRecordsHealth(), createBackup(), emailsForRoles(), gunzipText(), gzipBytes() (+12 more)

### Community 27 - "memoCardHtml"
Cohesion: 0.10
Nodes (26): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+18 more)

### Community 28 - "renderBackup"
Cohesion: 0.18
Nodes (13): backupRunLabel(), canManageUsers(), dedupedUsers(), formatBytes(), formatSessionDate(), memoRecipientCount(), renderBackup(), renderDashboardBackupStatus() (+5 more)

### Community 29 - "renderDashboard"
Cohesion: 0.19
Nodes (14): calendarState(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget(), registerCalendarWidget(), renderAnalytics(), renderCalendarSection() (+6 more)

### Community 30 - "renderProductIssues"
Cohesion: 0.19
Nodes (14): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), productIssueActionsMenu(), productIssueHistory(), productIssueParameterSummaryHtml(), productIssueStatusClass() (+6 more)

### Community 31 - "openModal"
Cohesion: 0.08
Nodes (38): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), cvYear(), financialLineTemplate(), financialRequestDeductions(), nextCvNumber(), nextProductIssueId() (+30 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (18): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+10 more)

### Community 34 - "renderCollections"
Cohesion: 0.15
Nodes (19): applyCollectionPayment(), approvePaymentRequest(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory(), collectionTagForType(), findSaleByDocumentInput() (+11 more)

### Community 35 - "findItemByCodeOrName"
Cohesion: 0.08
Nodes (36): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), discountNeedsApproval(), documentExists(), findClientByName() (+28 more)

### Community 36 - "i"
Cohesion: 0.20
Nodes (17): a(), ae(), as(), _e(), Gr(), i(), is(), Kr() (+9 more)

### Community 37 - "i"
Cohesion: 0.20
Nodes (17): a(), ae(), as(), _e(), Gr(), i(), is(), Kr() (+9 more)

### Community 38 - "public/scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 39 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 40 - "saveStockSheet"
Cohesion: 0.18
Nodes (14): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), canApprovePurchaseOrders(), cancelPurchaseOrder(), canManagePoReceiving(), inventoryPoActionsCell() (+6 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "printableFooterHtml"
Cohesion: 0.12
Nodes (21): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastReportHtml(), itemForecastRows(), memoAudienceLabel() (+13 more)

### Community 43 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 44 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.24
Nodes (17): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+9 more)

### Community 46 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 47 - "renderDashboard"
Cohesion: 0.14
Nodes (18): calendarState(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget() (+10 more)

### Community 48 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

### Community 49 - "common.sh"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 50 - "clearPrintTarget"
Cohesion: 0.11
Nodes (21): addMonthsToDate(), changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastRows(), openCollectionHistoryModal() (+13 more)

### Community 51 - "syncBackendUsers"
Cohesion: 0.40
Nodes (6): confirmInviteUser(), handleUserInvite(), mergeUsersFromBackend(), submitModal(), syncBackendUsers(), toggleUserDisabled()

### Community 52 - "renderReconciliation"
Cohesion: 0.13
Nodes (17): applyReconciliationHistory(), ensureWorkflowPanel(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), moduleWorkflowItems() (+9 more)

### Community 53 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 54 - "renderCollections"
Cohesion: 0.13
Nodes (21): applyCollectionPayment(), approvePaymentRequest(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory(), collectionTagForType(), paymentRequestActionsCell() (+13 more)

### Community 55 - "recordSystemLog"
Cohesion: 0.15
Nodes (16): backupDigestLines(), discordFieldValue(), inventoryPoTotal(), moduleRecordMap(), pendingSummaryFields(), poFullyPaidServer(), postNewRecordEventsToDiscord(), recordSystemLog() (+8 more)

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

### Community 61 - "showSection"
Cohesion: 0.14
Nodes (15): getReportDefinitions(), openCollectionHistoryModal(), openReportPreview(), renderInvoiceFlowDetail(), renderReportPage(), renderReports(), renderSaleDetail(), saleEventClass() (+7 more)

### Community 62 - "appendTableRows"
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 63 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 64 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 65 - "clearPrintTarget"
Cohesion: 0.25
Nodes (9): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice(), printReportPreview(), printReportPreviewNoDate() (+1 more)

### Community 66 - "appendTableRows"
Cohesion: 0.50
Nodes (5): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "saveStockSheet"
Cohesion: 0.18
Nodes (14): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), canApprovePurchaseOrders(), cancelPurchaseOrder(), canManagePoReceiving(), inventoryPoActionsCell() (+6 more)

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "workflowFacts"
Cohesion: 0.33
Nodes (6): calendarEventsForMonth(), generatedNoticeDate(), inventoryStatus(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 72 - "bi"
Cohesion: 0.40
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "money"
Cohesion: 0.23
Nodes (13): addDays(), buildBusinessSummaryLines(), computeBusinessMetrics(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil(), digestInventoryStatus(), digestSaleStatus() (+5 more)

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

### Community 83 - "renderReconciliation"
Cohesion: 0.13
Nodes (17): applyReconciliationHistory(), ensureWorkflowPanel(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), moduleWorkflowItems() (+9 more)

### Community 84 - "Agent Notes"
Cohesion: 0.40
Nodes (4): Agent Notes, Deploy Verification, Editing Gotchas, Project Shape

### Community 85 - "focusRecord"
Cohesion: 0.40
Nodes (5): ensureFocusedRecordsRendered(), focusRecord(), goToFocused(), prepareFocusedSection(), toast()

### Community 86 - "pe"
Cohesion: 0.40
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "jt"
Cohesion: 0.40
Nodes (5): Et(), jt(), qt(), Ut(), Vt()

### Community 89 - "ue"
Cohesion: 0.50
Nodes (5): he(), ne(), re(), se(), ue()

### Community 90 - "pe"
Cohesion: 0.40
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 91 - "[CHECKLIST TYPE] Checklist: [FEATURE NAME]"
Cohesion: 0.40
Nodes (4): [Category 1], [Category 2], [CHECKLIST TYPE] Checklist: [FEATURE NAME], Notes

### Community 98 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

## Knowledge Gaps
- **167 isolated node(s):** `common.sh script`, `peso`, `today`, `uomOptions`, `supplierClassificationOptions` (+162 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `saveStockSheet` to `supabaseFetch`, `fetch`?**
  _High betweenness centrality (0.276) - this node is a cross-community bridge._
- **Why does `MedlaneAPI` connect `saveStockSheet` to `supabaseFetch`, `fetch`?**
  _High betweenness centrality (0.263) - this node is a cross-community bridge._
- **Why does `backupStatus()` connect `supabaseFetch` to `saveStockSheet`, `saveStockSheet`, `fetch`, `worker.js`, `runApiHealthMonitor`?**
  _High betweenness centrality (0.168) - this node is a cross-community bridge._
- **What connects `common.sh script`, `peso`, `today` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08901515151515152 - nodes in this community are weakly interconnected._
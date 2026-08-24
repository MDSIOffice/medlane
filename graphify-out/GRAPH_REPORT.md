# Graph Report - medlane  (2026-08-24)

## Corpus Check
- 45 files · ~281,830 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1977 nodes · 4269 edges · 109 communities (92 shown, 17 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 236 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `6103d71a`
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
- renderPayables
- importCheckedRows
- renderPayables
- runApiHealthMonitor
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- renderInventory
- renderInventory
- buildSale
- composeAndSendDigest
- printableFooterHtml
- renderReconciliation
- memoCardHtml
- renderPrintTemplateSidePanel
- memoCardHtml
- renderCollections
- renderProductIssues
- syncPaymentRequestTotal
- renderProductIssues
- syncPaymentRequestTotal
- renderCollections
- openModal
- i
- i
- public/scripts/config-data.js
- renderLogs
- buildPrintTemplateCanvas
- scripts/config-data.js
- printableFooterHtml
- renderCollectionMapVisual
- renderStockSheet
- renderPrintTemplateSidePanel
- syncStockSheetRow
- renderDashboard
- money
- common.sh
- supabaseFetch
- clearBackupStatus
- syncBackendUsers
- Tasks: [FEATURE NAME]
- saveStockSheet
- is
- createAppSession
- Bt
- za
- Bt
- za
- renderLogs
- appendTableRows
- gi
- Ir
- clearPrintTarget
- appendTableRows
- gi
- Ir
- exportItemizedInvoicingCsv
- Feature Specification: [FEATURE NAME]
- workflowFacts
- bi
- workflowFacts
- bi
- Core Principles
- focusRecord
- ja
- Core Principles
- jt
- ue
- Implementation Plan: [FEATURE]
- Agent Notes
- focusRecord
- ja
- jt
- ue
- is
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- public/scripts/landing-motion.js
- guardedDialogClose
- scripts/landing-motion.js
- guardedDialogClose
- graphNote
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
1. `fetch()` - 85 edges
2. `renderAll()` - 54 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 29 edges
5. `openModal()` - 29 edges
6. `supabaseFetch()` - 27 edges
7. `composeAndSendDigest()` - 22 edges
8. `renderInventory()` - 20 edges
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

## Communities (109 total, 17 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.06
Nodes (43): authHashParams(), clearBackupStatus(), confirmInviteUser(), downloadBackupFile(), downloadBackupObjectFile(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute() (+35 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.09
Nodes (19): authHashParams(), hydrateAuthenticatedSession(), initializeRoute(), isAuthenticatedRoute(), isDashboardRoute(), isLoginRoute(), jwtEmail(), logoutCurrentUser() (+11 more)

### Community 4 - "openModal"
Cohesion: 0.08
Nodes (34): collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), financialLineTemplate(), findItemByCodeOrName(), invoiceItemStockQty(), invoiceLineTemplate(), invoiceRowLotOptionsHtml() (+26 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.02
Nodes (91): auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money(), bir2307QuarterRange() (+83 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.03
Nodes (81): applyReconciliationHistory(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+73 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 9 - "renderAll"
Cohesion: 0.09
Nodes (33): applyRole(), approveExpense(), canApproveMigrations(), confirmTransferDispatch(), confirmTransferReceive(), getReportDefinitions(), handleWorkflowAction(), importRevertBlockers() (+25 more)

### Community 10 - "fetch"
Cohesion: 0.06
Nodes (47): applyReceivingLines(), authenticatedProfile(), authenticatedUser(), cleanEmail(), dedupeRowsByRecordKey(), enrichAuditLogEntry(), extractLinkResult(), fetch() (+39 more)

### Community 11 - "renderAll"
Cohesion: 0.07
Nodes (45): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+37 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 13 - "worker.js"
Cohesion: 0.06
Nodes (45): canAccessKey(), canWrite(), daysUntilIso(), defaultSeedSignature, DIGEST_AUDIT_NOISE_ACTIONS, DIGEST_COLORS, DIGEST_METRIC_CARDS, DIGEST_ROLE_RECIPIENTS (+37 more)

### Community 14 - "renderPayables"
Cohesion: 0.11
Nodes (27): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml(), docUploadButtons() (+19 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.10
Nodes (38): applyCollectionPayment(), approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest() (+30 more)

### Community 16 - "renderPayables"
Cohesion: 0.09
Nodes (31): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml(), compressImageFile() (+23 more)

### Community 17 - "runApiHealthMonitor"
Cohesion: 0.10
Nodes (33): checkAssetPageHealth(), editDiscordWebhookMessage(), healthCheckLine(), inventoryPoTotal(), loadDigestSnapshot(), loadDigestState(), manilaMonthParts(), manilaScheduleParts() (+25 more)

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "renderInventory"
Cohesion: 0.07
Nodes (38): MedlaneAPI, acknowledgeMemo(), addDemoRequestLine(), advancePurchaseOrderStatus(), approvePurchaseOrder(), approveStockReceipt(), canApproveDemoManagement(), canApproveDemoSales() (+30 more)

### Community 21 - "renderInventory"
Cohesion: 0.12
Nodes (22): addDemoRequestLine(), canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineRow(), demoRequestLineSummary(), ensureInventoryDatalists() (+14 more)

### Community 22 - "buildSale"
Cohesion: 0.11
Nodes (21): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), discountNeedsApproval(), documentExists(), lineSubtotal(), nextInventoryPurchaseOrderId(), nextPurchaseOrderId() (+13 more)

### Community 23 - "composeAndSendDigest"
Cohesion: 0.15
Nodes (25): auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), composeAndSendDigest(), digestAttentionBannerHtml(), digestDeltaBadge(), digestEmailHtml(), digestSectionHtml() (+17 more)

### Community 24 - "printableFooterHtml"
Cohesion: 0.11
Nodes (23): addMonthsToDate(), clientInvoiceReportHtml(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), dashboardReportHtml(), exportClientInvoicesCsv(), itemForecastMonthKeys(), itemForecastMonthLabels() (+15 more)

### Community 25 - "renderReconciliation"
Cohesion: 0.20
Nodes (12): applyReconciliationHistory(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), periodKey(), recordReconciliationRun() (+4 more)

### Community 26 - "memoCardHtml"
Cohesion: 0.13
Nodes (22): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+14 more)

### Community 27 - "renderPrintTemplateSidePanel"
Cohesion: 0.15
Nodes (24): applyPtFieldOverride(), applyPtRowOverride(), buildPrintTemplateCanvas(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), printTemplateRecord() (+16 more)

### Community 28 - "memoCardHtml"
Cohesion: 0.13
Nodes (22): backupRunLabel(), canManageUsers(), canPostMemo(), dedupedUsers(), formatBytes(), formatSessionDate(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml() (+14 more)

### Community 29 - "renderCollections"
Cohesion: 0.07
Nodes (32): calendarState(), collectionStatusActions(), contactActionCard(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), lineChart(), monthLabel() (+24 more)

### Community 30 - "renderProductIssues"
Cohesion: 0.19
Nodes (14): canActOnProductIssue(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), productIssueActionsMenu(), productIssueHistory(), productIssueParameterSummaryHtml(), productIssueStatusClass() (+6 more)

### Community 31 - "syncPaymentRequestTotal"
Cohesion: 0.14
Nodes (22): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), openPaymentRequestForInvoice(), payableWithholdingSummary(), paymentRequestDeductions() (+14 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.13
Nodes (19): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), productIssueActionsMenu() (+11 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.15
Nodes (22): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), findClientByName(), openInvoicesForPaymentRequest(), openPaymentRequestForInvoice(), paymentRequestDeductions() (+14 more)

### Community 34 - "renderCollections"
Cohesion: 0.10
Nodes (29): applyCollectionPayment(), approveFinancialRequest(), approvePaymentRequest(), canApprovePaymentRequests(), cancelFinancialRequest(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory() (+21 more)

### Community 35 - "openModal"
Cohesion: 0.05
Nodes (56): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists() (+48 more)

### Community 36 - "i"
Cohesion: 0.18
Nodes (17): a(), ae(), de(), _e(), ee(), fe(), ge(), Gr() (+9 more)

### Community 37 - "i"
Cohesion: 0.18
Nodes (17): a(), ae(), de(), _e(), ee(), fe(), ge(), Gr() (+9 more)

### Community 38 - "public/scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 39 - "renderLogs"
Cohesion: 0.18
Nodes (15): formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), notificationLogFilterParams(), notificationLogToneClass() (+7 more)

### Community 40 - "buildPrintTemplateCanvas"
Cohesion: 0.29
Nodes (7): buildPrintTemplateCanvas(), printTemplateRecord(), ptFieldStyleAttr(), renderPrintTemplates(), resetPtAll(), resetPtRow(), savePrintTemplate()

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "printableFooterHtml"
Cohesion: 0.13
Nodes (20): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), itemForecastMonthKeys(), itemForecastMonthLabels(), itemForecastReportHtml(), itemForecastRows(), memoAudienceLabel() (+12 more)

### Community 43 - "renderCollectionMapVisual"
Cohesion: 0.11
Nodes (21): collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds(), geoRegionName() (+13 more)

### Community 44 - "renderStockSheet"
Cohesion: 0.15
Nodes (17): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo() (+9 more)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.24
Nodes (17): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+9 more)

### Community 46 - "syncStockSheetRow"
Cohesion: 0.18
Nodes (14): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo(), receivablePurchaseOrders() (+6 more)

### Community 47 - "renderDashboard"
Cohesion: 0.14
Nodes (18): calendarState(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget() (+10 more)

### Community 48 - "money"
Cohesion: 0.14
Nodes (21): addDays(), backupDigestLines(), buildBusinessSummaryLines(), computeBusinessMetrics(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil() (+13 more)

### Community 49 - "common.sh"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 50 - "supabaseFetch"
Cohesion: 0.15
Nodes (23): activeMetadataUsage(), appStateKey(), auditLogDigestRows(), backupStatus(), checkBackupFreshnessHealth(), checkSupabaseAppRecordsHealth(), createBackup(), emailsForRoles() (+15 more)

### Community 51 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

### Community 52 - "syncBackendUsers"
Cohesion: 0.40
Nodes (6): confirmInviteUser(), handleUserInvite(), mergeUsersFromBackend(), submitModal(), syncBackendUsers(), toggleUserDisabled()

### Community 53 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 54 - "saveStockSheet"
Cohesion: 0.18
Nodes (14): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), canApprovePurchaseOrders(), cancelPurchaseOrder(), canManagePoReceiving(), inventoryPoActionsCell() (+6 more)

### Community 55 - "is"
Cohesion: 0.50
Nodes (5): as(), is(), Ms(), os(), rs()

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
Cohesion: 0.50
Nodes (5): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table()

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
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "exportItemizedInvoicingCsv"
Cohesion: 0.67
Nodes (3): exportInvoicingCsv(), exportItemizedInvoicingCsv(), invoicingVisibleSales()

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "workflowFacts"
Cohesion: 0.33
Nodes (6): calendarEventsForMonth(), generatedNoticeDate(), inventoryStatus(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 72 - "bi"
Cohesion: 0.40
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

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

### Community 84 - "Agent Notes"
Cohesion: 0.40
Nodes (4): Agent Notes, Deploy Verification, Editing Gotchas, Project Shape

### Community 85 - "focusRecord"
Cohesion: 0.40
Nodes (5): ensureFocusedRecordsRendered(), focusRecord(), goToFocused(), prepareFocusedSection(), toast()

### Community 87 - "ja"
Cohesion: 0.40
Nodes (5): Da(), Ea(), Ia(), ja(), Oa()

### Community 88 - "jt"
Cohesion: 0.40
Nodes (5): Et(), jt(), qt(), Ut(), Vt()

### Community 89 - "ue"
Cohesion: 0.50
Nodes (5): he(), ne(), re(), se(), ue()

### Community 90 - "is"
Cohesion: 0.50
Nodes (5): as(), is(), Ms(), os(), rs()

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
- **169 isolated node(s):** `common.sh script`, `peso`, `today`, `uomOptions`, `supplierClassificationOptions` (+164 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **17 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderInventory` to `supabaseFetch`, `fetch`?**
  _High betweenness centrality (0.292) - this node is a cross-community bridge._
- **Why does `MedlaneAPI` connect `saveStockSheet` to `supabaseFetch`, `fetch`?**
  _High betweenness centrality (0.277) - this node is a cross-community bridge._
- **Why does `backupStatus()` connect `supabaseFetch` to `fetch`, `renderInventory`, `worker.js`, `saveStockSheet`?**
  _High betweenness centrality (0.179) - this node is a cross-community bridge._
- **What connects `common.sh script`, `peso`, `today` to the rest of the system?**
  _169 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.061495457721872815 - nodes in this community are weakly interconnected._
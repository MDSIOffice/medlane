# Graph Report - medlane  (2026-08-26)

## Corpus Check
- 46 files · ~290,896 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2042 nodes · 4438 edges · 112 communities (97 shown, 15 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 243 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f0bcf2ee`
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
- renderStockSheet
- recordSystemLog
- public/scripts/ui-utils.js
- scripts/ui-utils.js
- renderInventory
- renderInventory
- renderPrintTemplateSidePanel
- composeAndSendDigest
- computeValueMetrics
- renderCollectionMapVisual
- renderReconciliation
- game.js
- renderBackup
- updateCollectionPaymentStatus
- renderProductIssues
- syncPaymentRequestTotal
- renderProductIssues
- syncPaymentRequestTotal
- renderDashboard
- openModal
- i
- i
- public/scripts/config-data.js
- attachedFilesFor
- memoCardHtml
- scripts/config-data.js
- printableFooterHtml
- detectThresholdsAndApprovals
- renderCollections
- renderPrintTemplateSidePanel
- findItemByCodeOrName
- renderDashboard
- renderReconciliation
- common.sh
- supabaseFetch
- clearPrintTarget
- renderLogs
- Tasks: [FEATURE NAME]
- clearPrintTarget
- buildPrintTemplateCanvas
- createAppSession
- Bt
- za
- Bt
- za
- renderLogs
- appendTableRows
- gi
- Ir
- sendDiscordDigest
- appendTableRows
- gi
- Ir
- pe
- Feature Specification: [FEATURE NAME]
- workflowFacts
- bi
- clearBackupStatus
- workflowFacts
- bi
- Core Principles
- focusRecord
- ja
- Core Principles
- jt
- ue
- Implementation Plan: [FEATURE]
- syncBackendUsers
- Agent Notes
- focusRecord
- clearBackupStatus
- ja
- jt
- ue
- is
- [CHECKLIST TYPE] Checklist: [FEATURE NAME]
- CLAUDE.md
- exportItemizedInvoicingCsv
- public/scripts/landing-motion.js
- guardedDialogClose
- scripts/landing-motion.js
- guardedDialogClose
- graphNote
- arTrackerStage
- canSeeNotification
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
1. `fetch()` - 87 edges
2. `renderAll()` - 54 edges
3. `renderAll()` - 52 edges
4. `openModal()` - 29 edges
5. `openModal()` - 29 edges
6. `supabaseFetch()` - 27 edges
7. `composeAndSendDigest()` - 22 edges
8. `renderInventory()` - 21 edges
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

## Communities (112 total, 15 thin omitted)

### Community 0 - "public/scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 1 - "scripts/state.js"
Cohesion: 0.05
Nodes (46): accounts, applyPendingSaveQueueToLocal(), beginSaveOperation(), canEditActiveSection(), canEditModule(), clearPendingSaveQueueKeys(), clientCoordinates, currentUser (+38 more)

### Community 2 - "scripts/events-bootstrap.js"
Cohesion: 0.09
Nodes (25): authHashParams(), confirmInviteUser(), handleUserInvite(), hydrateAuthenticatedSession(), initializeRoute(), isAuthenticatedRoute(), isDashboardRoute(), isLoginRoute() (+17 more)

### Community 3 - "public/scripts/events-bootstrap.js"
Cohesion: 0.09
Nodes (22): authHashParams(), hydrateAuthenticatedSession(), initializeRoute(), isAuthenticatedRoute(), isDashboardRoute(), isLoginRoute(), jwtEmail(), logoutCurrentUser() (+14 more)

### Community 4 - "openModal"
Cohesion: 0.05
Nodes (53): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoicePreviewLines(), cvYear(), discountNeedsApproval(), documentExists(), financialLineTemplate() (+45 more)

### Community 5 - "public/scripts/modules.js"
Cohesion: 0.03
Nodes (81): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+73 more)

### Community 6 - "scripts/modules.js"
Cohesion: 0.03
Nodes (84): addDemoRequestLine(), auditLogModules, bir2307DrawBoxedDigits(), bir2307DrawDigits(), bir2307DrawTin(), bir2307DrawTinLastGroup(), bir2307MMDDYYYY(), bir2307Money() (+76 more)

### Community 7 - "public/scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 8 - "scripts/vendor/pdf-lib.min.js"
Cohesion: 0.04
Nodes (8): cs(), hs(), qe(), us(), Ve(), Vr(), We(), wr()

### Community 9 - "renderAll"
Cohesion: 0.07
Nodes (41): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+33 more)

### Community 10 - "fetch"
Cohesion: 0.06
Nodes (51): applyReceivingLines(), authenticatedProfile(), authenticatedUser(), checkAssetPageHealth(), cleanEmail(), deleteDiscordWebhookMessage(), extractLinkResult(), fetch() (+43 more)

### Community 11 - "renderAll"
Cohesion: 0.06
Nodes (45): applyRole(), approveExpense(), approveFinancialRequest(), canApproveMigrations(), cancelFinancialRequest(), confirmDetailsModal(), confirmFinancialPayment(), confirmPaymentDetailsModal() (+37 more)

### Community 12 - "importCheckedRows"
Cohesion: 0.10
Nodes (36): approvePaymentRequest(), buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions() (+28 more)

### Community 13 - "worker.js"
Cohesion: 0.05
Nodes (54): canAccessKey(), canWrite(), daysUntilIso(), dedupeRowsByRecordKey(), defaultSeedSignature, DIGEST_AUDIT_NOISE_ACTIONS, DIGEST_COLORS, DIGEST_METRIC_CARDS (+46 more)

### Community 14 - "renderPayables"
Cohesion: 0.10
Nodes (28): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml(), docUploadButtons() (+20 more)

### Community 15 - "importCheckedRows"
Cohesion: 0.19
Nodes (23): buildImportedClient(), buildImportedProduct(), buildImportedSupplier(), buildMigratedSale(), detectImportKind(), importAddress(), importCheckedRows(), importContact() (+15 more)

### Community 16 - "renderStockSheet"
Cohesion: 0.15
Nodes (17): addStockSheetRow(), addTransferSheetRow(), branchOptions(), fillStockSheetFromInventoryPo(), fillStockSheetFromReceipt(), findItemForSheetRow(), itemBranchBalances(), openStockSheetForPo() (+9 more)

### Community 17 - "recordSystemLog"
Cohesion: 0.16
Nodes (30): claimAutomationPeriod(), editDiscordWebhookMessage(), healthCheckLine(), loadDigestState(), manilaMonthParts(), manilaPeriodKeys(), manilaScheduleParts(), monitoringState() (+22 more)

### Community 18 - "public/scripts/ui-utils.js"
Cohesion: 0.07
Nodes (3): calendarToneOrder, clientBalance(), clientCreditState()

### Community 19 - "scripts/ui-utils.js"
Cohesion: 0.08
Nodes (3): calendarToneOrder, graphNote(), visualCard()

### Community 20 - "renderInventory"
Cohesion: 0.09
Nodes (33): MedlaneAPI, acknowledgeMemo(), advancePurchaseOrderStatus(), approvePurchaseOrder(), approveStockReceipt(), canApproveDemoManagement(), canApproveDemoSales(), canApprovePurchaseOrders() (+25 more)

### Community 21 - "renderInventory"
Cohesion: 0.13
Nodes (23): canApproveDemoManagement(), canApproveDemoSales(), canCloseDemoRequest(), demoRequestActions(), demoRequestLineSummary(), inventoryItemLabel(), itemizedSummary(), payable2307Cell() (+15 more)

### Community 22 - "renderPrintTemplateSidePanel"
Cohesion: 0.24
Nodes (17): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+9 more)

### Community 23 - "composeAndSendDigest"
Cohesion: 0.14
Nodes (29): auditLogTableHtml(), brandedEmailHtml(), brandedInviteEmailHtml(), buildBusinessSummaryLines(), composeAndSendDigest(), computeBusinessMetrics(), digestAttentionBannerHtml(), digestDeltaBadge() (+21 more)

### Community 24 - "computeValueMetrics"
Cohesion: 0.10
Nodes (27): addMonthsToDate(), averageOf(), catalogItemFor(), clientInvoiceReportHtml(), computeValueMetrics(), dashboardReportHtml(), daysBetween(), demoTurnaroundDays() (+19 more)

### Community 25 - "renderCollectionMapVisual"
Cohesion: 0.10
Nodes (24): collectionContactsGeoJson(), collectionRegionCount(), collectionRegionSource(), collectionRegionSummaries(), contactActionCard(), featureRegionName(), geoJsonBounds(), geoRegionName() (+16 more)

### Community 26 - "renderReconciliation"
Cohesion: 0.13
Nodes (17): applyReconciliationHistory(), ensureWorkflowPanel(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), moduleWorkflowItems() (+9 more)

### Community 27 - "game.js"
Cohesion: 0.13
Nodes (32): closeGameModal(), doJump(), drawGame(), drawRoundedRect(), endGame(), ensureAudioCtx(), gameLoop(), hideOverlay() (+24 more)

### Community 28 - "renderBackup"
Cohesion: 0.18
Nodes (13): backupRunLabel(), canManageUsers(), dedupedUsers(), formatBytes(), formatSessionDate(), memoRecipientCount(), renderBackup(), renderDashboardBackupStatus() (+5 more)

### Community 29 - "updateCollectionPaymentStatus"
Cohesion: 0.31
Nodes (9): applyCollectionPayment(), paymentRequestHistory(), renderPaymentRequestDetail(), renderSaleDetail(), reverseCollectionPayment(), saleCollectionTimeline(), saleEventClass(), saleForPayment() (+1 more)

### Community 30 - "renderProductIssues"
Cohesion: 0.12
Nodes (20): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), printClientInvoicesReport() (+12 more)

### Community 31 - "syncPaymentRequestTotal"
Cohesion: 0.18
Nodes (19): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions(), paymentRequestLineTemplate() (+11 more)

### Community 32 - "renderProductIssues"
Cohesion: 0.13
Nodes (19): canActOnProductIssue(), clientInvoicesExportRows(), clientInvoicesFilteredSales(), clientSupportHistoryCard(), confirmResolveProductIssue(), demoRequestHistoryCard(), exportClientInvoicesCsv(), productIssueActionsMenu() (+11 more)

### Community 33 - "syncPaymentRequestTotal"
Cohesion: 0.16
Nodes (20): collectFinancialLines(), collectPaymentRequestInvoices(), collectPaymentRequestLines(), financialRequestDeductions(), openInvoicesForPaymentRequest(), payableWithholdingSummary(), paymentRequestDeductions(), paymentRequestInvoiceDatalistOptions() (+12 more)

### Community 34 - "renderDashboard"
Cohesion: 0.10
Nodes (26): backupRunLabel(), calendarState(), canManageUsers(), cycleTimeCard(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), formatBytes() (+18 more)

### Community 35 - "openModal"
Cohesion: 0.05
Nodes (65): buildInventoryPurchaseOrder(), buildPurchaseOrder(), buildSale(), collectInvoiceEditorLines(), collectInvoicePreviewLines(), competingPurchaseOrdersForItem(), cvYear(), discountNeedsApproval() (+57 more)

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
Cohesion: 0.09
Nodes (30): attachedFilesFor(), attachedFilesHtml(), canManageEmployees(), canManageEmployeeSalary(), canPostMemo(), canUpdateDeliveryStatus(), clientDocRecordId(), clientDocsModalRowsHtml() (+22 more)

### Community 40 - "memoCardHtml"
Cohesion: 0.21
Nodes (13): canPostMemo(), memoAcknowledgedByCurrentUser(), memoAudienceCheckboxesHtml(), memoAudienceLabel(), memoCardHtml(), memoPrintableHtml(), memoPrintDateLabel(), memoVisibleToCurrentUser() (+5 more)

### Community 41 - "scripts/config-data.js"
Cohesion: 0.13
Nodes (14): clientContactDepartments, deliveryStatusOptions, employeeBenefitOptions, initialData, peso, productClassificationOptions, requiredClientDocs, requiredSecurityApprovals (+6 more)

### Community 42 - "printableFooterHtml"
Cohesion: 0.11
Nodes (24): addMonthsToDate(), clientInvoiceReportHtml(), dashboardReportHtml(), dashboardReportRows(), dashboardVisibleSales(), exportDashboardCsv(), itemForecastMonthKeys(), itemForecastMonthLabels() (+16 more)

### Community 43 - "detectThresholdsAndApprovals"
Cohesion: 0.24
Nodes (12): addDays(), dashboardAnalyticsFields(), detectThresholdsAndApprovals(), digestClientBalance(), digestDaysUntil(), digestInventoryStatus(), digestSaleStatus(), generateReportsFromState() (+4 more)

### Community 44 - "renderCollections"
Cohesion: 0.15
Nodes (19): applyCollectionPayment(), approvePaymentRequest(), canApprovePaymentRequests(), cancelPaymentRequest(), collectionStatusActions(), collectionStatusHistory(), collectionTagForType(), findSaleByDocumentInput() (+11 more)

### Community 45 - "renderPrintTemplateSidePanel"
Cohesion: 0.24
Nodes (17): applyPtFieldOverride(), applyPtRowOverride(), ensurePtRowOverride(), handlePtCanvasKeydown(), measurePtDefaultRow(), nudgePtSelected(), ptCanvasScale(), ptElementBoxIn() (+9 more)

### Community 46 - "findItemByCodeOrName"
Cohesion: 0.08
Nodes (33): MedlaneAPI, acknowledgeMemo(), addStockSheetRow(), addTransferSheetRow(), advancePurchaseOrderStatus(), approvePurchaseOrder(), branchOptions(), canApprovePurchaseOrders() (+25 more)

### Community 47 - "renderDashboard"
Cohesion: 0.11
Nodes (22): calendarState(), contactActionCard(), lineChart(), monthLabel(), multiSeriesChart(), navigateCalendarWidget(), notificationItem(), openContactRegion() (+14 more)

### Community 48 - "renderReconciliation"
Cohesion: 0.13
Nodes (17): applyReconciliationHistory(), ensureWorkflowPanel(), getReconciliationFindings(), getReconciliationSuccesses(), getReconScope(), getScopedClientBalance(), isWithinReconRange(), moduleWorkflowItems() (+9 more)

### Community 49 - "common.sh"
Cohesion: 0.08
Nodes (17): check-prerequisites.sh script, check_dir(), check_file(), get_feature_paths(), get_repo_root(), has_jq(), _persist_feature_json(), resolve_specify_init_dir() (+9 more)

### Community 50 - "supabaseFetch"
Cohesion: 0.16
Nodes (21): activeMetadataUsage(), appStateKey(), auditLogDigestRows(), backupStatus(), checkBackupFreshnessHealth(), checkSupabaseAppRecordsHealth(), createBackup(), emailsForRoles() (+13 more)

### Community 51 - "clearPrintTarget"
Cohesion: 0.25
Nodes (9): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice(), printReportPreview(), printReportPreviewNoDate() (+1 more)

### Community 52 - "renderLogs"
Cohesion: 0.12
Nodes (21): dedupedUsers(), formatLogCell(), formatLogRecord(), loadMoreCollectionsHistory(), loadMoreLogs(), loadMoreNotificationLogs(), logFilterParams(), memoRecipientCount() (+13 more)

### Community 53 - "Tasks: [FEATURE NAME]"
Cohesion: 0.07
Nodes (26): Dependencies & Execution Order, Format: `[ID] [P?] [Story] Description`, Implementation for User Story 1, Implementation for User Story 2, Implementation for User Story 3, Implementation Strategy, Incremental Delivery, MVP First (User Story 1 Only) (+18 more)

### Community 54 - "clearPrintTarget"
Cohesion: 0.25
Nodes (9): changeReportPreviewTemplate(), clearPrintTarget(), closeReportPreview(), previewInventoryPurchaseOrder(), previewProductIssue(), printInvoice(), printReportPreview(), printReportPreviewNoDate() (+1 more)

### Community 55 - "buildPrintTemplateCanvas"
Cohesion: 0.29
Nodes (7): buildPrintTemplateCanvas(), printTemplateRecord(), ptFieldStyleAttr(), renderPrintTemplates(), resetPtAll(), resetPtRow(), savePrintTemplate()

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

### Community 65 - "sendDiscordDigest"
Cohesion: 0.33
Nodes (7): backupDigestLines(), discordBullet(), discordFieldValue(), pendingSummaryFields(), poFullyPaidServer(), salesPoStatusServer(), sendDiscordDigest()

### Community 66 - "appendTableRows"
Cohesion: 0.33
Nodes (7): appendTableRows(), renderViewMoreButton(), rowHtml(), sortTable(), table(), tableSkeleton(), updateTableScrollHints()

### Community 67 - "gi"
Cohesion: 0.38
Nodes (7): ci(), di(), fi(), gi(), li(), pi(), si()

### Community 68 - "Ir"
Cohesion: 0.52
Nodes (7): Hr(), Ir(), jr(), Lr(), Mr(), Ur(), Zr()

### Community 69 - "pe"
Cohesion: 0.40
Nodes (5): de(), ee(), fe(), ge(), pe()

### Community 70 - "Feature Specification: [FEATURE NAME]"
Cohesion: 0.15
Nodes (12): Assumptions, Edge Cases, Feature Specification: [FEATURE NAME], Functional Requirements, Key Entities *(include if feature involves data)*, Measurable Outcomes, Requirements *(mandatory)*, Success Criteria *(mandatory)* (+4 more)

### Community 71 - "workflowFacts"
Cohesion: 0.33
Nodes (6): calendarEventsForMonth(), generatedNoticeDate(), inventoryStatus(), statusForSale(), syncGeneratedNotifications(), workflowFacts()

### Community 72 - "bi"
Cohesion: 0.40
Nodes (6): ai(), bi(), ii(), mi(), wi(), yi()

### Community 73 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

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

### Community 83 - "syncBackendUsers"
Cohesion: 0.40
Nodes (6): confirmInviteUser(), handleUserInvite(), mergeUsersFromBackend(), submitModal(), syncBackendUsers(), toggleUserDisabled()

### Community 84 - "Agent Notes"
Cohesion: 0.40
Nodes (4): Agent Notes, Deploy Verification, Editing Gotchas, Project Shape

### Community 85 - "focusRecord"
Cohesion: 0.40
Nodes (5): ensureFocusedRecordsRendered(), focusRecord(), goToFocused(), prepareFocusedSection(), toast()

### Community 86 - "clearBackupStatus"
Cohesion: 0.53
Nodes (6): clearBackupStatus(), downloadBackupFile(), downloadBackupObjectFile(), restoreBackupFromRef(), runManualBackup(), setBackupStatus()

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

### Community 93 - "exportItemizedInvoicingCsv"
Cohesion: 0.67
Nodes (3): exportInvoicingCsv(), exportItemizedInvoicingCsv(), invoicingVisibleSales()

### Community 98 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

### Community 103 - "guardedDialogClose"
Cohesion: 0.67
Nodes (3): confirmCloseDialog(), guardDialogEscape(), guardedDialogClose()

## Knowledge Gaps
- **171 isolated node(s):** `common.sh script`, `peso`, `today`, `uomOptions`, `supplierClassificationOptions` (+166 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **15 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MedlaneAPI` connect `renderInventory` to `supabaseFetch`, `fetch`?**
  _High betweenness centrality (0.262) - this node is a cross-community bridge._
- **Why does `MedlaneAPI` connect `findItemByCodeOrName` to `supabaseFetch`, `fetch`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **Why does `backupStatus()` connect `supabaseFetch` to `fetch`, `renderInventory`, `worker.js`, `findItemByCodeOrName`?**
  _High betweenness centrality (0.156) - this node is a cross-community bridge._
- **What connects `common.sh script`, `peso`, `today` to the rest of the system?**
  _171 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `public/scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/state.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05271629778672032 - nodes in this community are weakly interconnected._
- **Should `scripts/events-bootstrap.js` be split into smaller, more focused modules?**
  _Cohesion score 0.08888888888888889 - nodes in this community are weakly interconnected._
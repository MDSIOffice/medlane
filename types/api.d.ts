// What each /api endpoint returns, taken from the handlers in src/worker.js. MedlaneAPI's functions
// are annotated with these, so screens that read a response get checked against the real shape.

interface ApiSession {
  access_token: string;
  refresh_token?: string;
  app_session_id?: string | null;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
}
interface OkResponse { ok: true }
/** For `.catch((error) => ({ error }))` call sites, which check `result.error` before using the rest. */
type OrApiError<T> = T & { error?: Error };

// ---- Auth ----
interface LoginResponse { session: ApiSession; user: Profile }
interface RefreshResponse { session: ApiSession; user: Profile | null }
interface MeResponse { user: Profile }
interface ThemeResponse extends OkResponse { theme: string }

// ---- App data ----
interface ModulePageInfo { hasMore: boolean; cursor: string | null; loading?: boolean }
/** loadedAt: server time the data was read (stamped onto later saves as `basedOn`). resetAt: last data-reset marker, or null. */
interface AppStateResponse { data: RawData; revision: number; changesCursor: string; pagination: Record<string, ModulePageInfo>; loadedAt?: string; resetAt?: string | null }
interface SaveResponse extends OkResponse { savedRecords: number; revision: number; /** Stored qty per inventory record key after the save (server rebases stock). */ stock?: Record<string, number> }
/** One changed record. The module decides its shape, so readers have to narrow `data`. */
interface ChangedRow { module: string; key: string; data: Record<string, unknown> }
interface ChangesResponse { rows: ChangedRow[]; cursor: string }
interface ModulePageResponse { rows: ChangedRow[]; nextCursor: string | null; hasMore: boolean }

// ---- Purchase orders and receiving ----
interface InventoryPoResponse extends OkResponse { po: InventoryPO }
interface StockReceiptResponse extends OkResponse { receipt: StockReceipt; po?: InventoryPO }

// ---- Files ----
interface FileObject {
  id: string; bucket: string; object_key: string; file_name: string; mime_type: string; size_bytes: number;
  record_type: string; record_id: string | null; uploaded_by: string | null; uploaded_at: string; deleted_at: string | null;
}
interface FilesResponse { files: FileObject[] }
interface FileUploadResponse { file: FileObject }

// ---- Users ----
interface EmailDelivery { sent: boolean; reason?: string; [detail: string]: unknown }
interface UsersResponse { users: AppUser[] }
interface InviteResponse { user: AppUser; existing?: boolean; emailDelivery: EmailDelivery }
interface ResendInviteResponse extends OkResponse { emailDelivery: EmailDelivery }
interface InviteLinkResponse { actionLink: string }
interface UserStatusResponse extends OkResponse { disabled: boolean; reason: string }
interface SuperadminResponse extends OkResponse { granted: boolean; role: AppRole }
interface ResetPermissionsResponse { user: AppUser }
interface AppSessionRow {
  id: string; user_id: string; device_name: string; browser: string; ip_address: string | null; user_agent: string | null;
  created_at: string; last_seen_at: string; revoked_at: string | null; revoked_by: string | null; profile: ProfileRow | null;
}
interface UserSessionsResponse { user: ProfileRow | null; sessions: AppSessionRow[] }

// ---- Logs ----
interface LogEntry {
  action?: string; module?: string; record?: string; user?: string; role?: string; date?: string; updatedAt: string;
  [detail: string]: unknown;
}
interface LogsResponse { entries: LogEntry[]; nextCursor: string | null }
/** GET /api/logs/summary — the Audit Logs overview for the last `days` days. */
interface AuditSummaryResponse {
  days: number; total: number; today: number; failedSignIns: number; prevSensitive: number;
  byDay: { day: string, count: number }[]; byModule: { module: string, count: number }[];
  byUser: { user: string, role: string, events: number, sensitive: number, last: string }[];
  sensitive: LogEntry[]; afterHours: LogEntry[]; signins: LogEntry[]; truncated: boolean;
}
interface DigestMessageResponse { html: string; subject: string; role: string; periodLabel: string; createdAt: string }

// ---- Backups and storage ----
interface BackupRun {
  id: string; backup_type: string; mode: string; object_key: string; records_count: number; size_bytes: number;
  since_at?: string | null; created_at: string;
}
interface BackupsResponse { backups: BackupRun[] }
interface BackupResponse { backup: BackupRun }
interface BackupStatusResponse { latest: BackupRun | null; ageHours: number | null; stale: boolean; message?: string }
interface BackupObject { key: string; size: number; uploaded: string; customMetadata: Record<string, string> }
interface BackupObjectsResponse { objects: BackupObject[]; cursor: string | null; truncated: boolean }
interface RestoreResponse extends OkResponse { restore: { restoredRecords: number; objectKey: string; backupCreatedAt: string | null; preRestoreBackupKey: string } }
interface StorageUsageResponse { configured: boolean; usedBytes: number; objectCount: number | null; truncated: boolean; maxBytes: number; remainingBytes: number }

// ---- Reports and printables ----
interface ReportCard { icon: string; title: string; body: string; section: string; actionLabel: string; rows: (string | number)[][]; [detail: string]: unknown }
interface ReportsResponse { reports: ReportCard[] }
interface PrintableDocument { id: string; title: string; html: string }
interface DescribedPrintable extends PrintableDocument { description: string }
interface PrintableInvoice extends DescribedPrintable { documentNo: string; type: string; hasCustomTemplate: boolean }
interface DigestRunResponse extends OkResponse {
  skipped?: boolean; forced?: boolean; reason?: string; recipients: number | null; sent: number | null; discordConfigured: boolean;
  discord: { sent: boolean; reason?: string };
}
interface BirthdayTestResponse extends OkResponse { sent: boolean; reason?: string; recipients?: string[]; test?: boolean }

// ---- Memos ----
interface MemoResponse extends OkResponse { memo: MemoRecord }

// ---- Game ----
interface GameScoreResult { ok?: true; best: number; isNewBest?: boolean; badge: string; skin: string; totalXp: number; level: number; leveledUp?: boolean; xpToNextLevel: number; replayed?: boolean }
interface GameSessionResponse { token: string }
interface GameSkinResponse extends OkResponse { skin: string }
interface GameLeaderboardEntry { name: string; score: number; date: string; totalXp: number; level: number; badge: string; skin: string; [detail: string]: unknown }
interface GameLeaderboardResponse { entries: GameLeaderboardEntry[] }

/**
 * Klien API untuk backend TSD Engine.
 *
 * Semua tipe di sini mencerminkan bentuk JSON yang benar-benar dikembalikan
 * FastAPI, bukan tebakan. Kalau backend berubah, file ini yang pertama
 * disesuaikan supaya kesalahan muncul saat kompilasi, bukan saat runtime.
 */

const PUBLIC_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? ""
const DIRECT_BROWSER_API_BASE =
	typeof window !== "undefined" ? PUBLIC_API_BASE : ""
export const API_BASE = typeof window === "undefined"
	? (process.env.API_INTERNAL_BASE ?? PUBLIC_API_BASE) || "http://127.0.0.1:8000"
	: PUBLIC_API_BASE

export type SpStatus = "matched" | "doc_only" | "sql_only" | "sql_variant"

export type SpBase = {
	sp_key: string
	sp_name: string
	segment: string | null
	tsd_filename: string | null
	status: SpStatus
	confidence: string | null
	variant: string | null
	base_name: string | null
	sql_database: string | null
	sql_file: string | null
	body_lines: number | null
	param_count: number | null
	called_by: string | null
}

export type SearchRow = SpBase & {
	image_count: number
	score: number
	module: string
	bank: string | null
}

export type SearchResponse = {
	total: number
	results: SearchRow[]
	query: string
}

export type ReviewRow = SpBase & {
	image_count: number
	segments?: string | null
	document_count?: number | null
}

export type ReviewResponse = {
	totals: {
		sql_only: number
		doc_only: number
		low_confidence: number
		multi_doc: number
	}
	sql_only: ReviewRow[]
	doc_only: ReviewRow[]
	low_confidence: ReviewRow[]
	multi_doc: ReviewRow[]
}

export type Stats = {
	by_status: Partial<Record<SpStatus, number>>
	totals: {
		sp_total: number
		images: number
		spec_fields: number
		documents: number
		sql_files: number
	}
	segments: {
		segment: string
		total: number
		matched: number
		low_confidence: number
	}[]
	hot_tables: { table_name: string; sp_count: number }[]
	most_copied: { base_name: string; copies: number }[]
	modules: { module: string; total: number; matched: number; sql_only: number }[]
	quality: { reports: number; passed: number; pass_rate: number }
}

export type SpImage = {
	segment: string | null
	kind: "data_model" | "data_flow"
	seq: number
	path: string
	width_in: number | null
	height_in: number | null
	explanation: string | null
}

export type SpTable = {
	role: "source" | "target"
	table_name: string
	operations: string | null
}

export type SpOccurrence = {
	segment: string
	tsd_filename: string
	heading_level: number | null
	section_model: string | null
	section_flow: string | null
	model_status: "available" | "not_available" | "missing"
	flow_status: "available" | "not_available" | "missing"
	bank: string
	confidence: string | null
}

export type ArchiveCopy = {
	sp_name: string
	variant: string | null
	sql_database: string | null
	body_lines: number | null
}

export type SpDetail = SpBase & {
	sharepoint_url: string | null
	heading_level: number | null
	section_model: string | null
	section_flow: string | null
	explanation: string | null
	sql_line: number | null
	parameters: string | null
	ai_summary: string | null
	indexed_at: string | null
	images: SpImage[]
	source_tables: SpTable[]
	target_tables: SpTable[]
	occurrences: SpOccurrence[]
	calls_documented: { sp_name: string; segment: string | null }[]
	archive_copies: ArchiveCopy[]
	document: {
		tsd_filename: string
		segment: string
		sharepoint_url: string | null
		procedure_count: number | null
	} | null
}

export type SegmentSummary = {
	tsd_filename: string
	segment: string
	procedure_count: number | null
	sharepoint_url: string | null
	indexed_sp: number | null
	module: string
	bank: string
	status: "active" | "inactive"
	size_bytes?: number
	updated_at?: string | null
	tags?: string[]
}

export type ModuleSummary = { module: string; sp_count: number }

export type DocumentPreview = {
	filename: string
	status: "active" | "inactive"
	segment: string
	module: string
	bank: string
	size_bytes: number
	modified_at: number
	title: string | null
	author: string | null
	blocks: Array<
		| { type: "heading" | "paragraph"; style: string; text: string }
		| { type: "table"; rows: string[][] }
	>
	total_blocks: number
	offset: number
	limit: number
}

export type DocumentEditorConfig = Record<string, unknown> & {
	document: { title: string }
}

export type SqlSource = {
	filename: string
	bank: string
	size_bytes: number
	modified_at: number
	database: string | null
	encoding: string | null
	procedure_count: number
	status: "active" | "error"
}

export type SqlUploadResult = {
	filename: string
	bank: string
	encoding: string | null
	database: string | null
	procedure_count: number
	primary_procedure_count: number
	archive_copy_count: number
}

export type TsdUploadResult = {
	filename: string
	bank: string
	segment: string
	procedure_count: number
	warning_count: number
	status: "active"
}

export type QualityCheck = {
	code: string
	label: string
	status: "pass" | "fail"
	summary: string
	findings: string[]
}

export type QualityReport = {
	id: string
	checker_version?: number
	filename: string
	segment: string
	score: number
	eligible: boolean
	status: "ready" | "needs_revision" | "active"
	checked_at: string
	activated_at?: string
	bank?: string
	bank_suggestion?: string
	bank_confidence?: "low" | "medium" | "high"
	bank_candidates?: string[]
	summary: { checks: number; passed: number; failed: number; procedures: number }
	checks: QualityCheck[]
}

export async function checkDocument(file: File, bank: string): Promise<QualityReport> {
	let res: Response
	try {
		res = await fetch(`${API_BASE}/api/documents/check?${new URLSearchParams({ bank })}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"X-File-Name": file.name,
			},
			body: file,
		})
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk memeriksa dokumen.")
	}
	if (!res.ok) {
		const payload = (await res.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Pemeriksaan gagal dengan status ${res.status}.`)
	}
	return (await res.json()) as QualityReport
}

export async function getQualityReports(bank?: string): Promise<QualityReport[]> {
	const params = bank ? `?${new URLSearchParams({ bank })}` : ""
	const response = await getJson<{ reports: QualityReport[] }>(`/api/documents/checks${params}`)
	return response.reports
}

export async function uploadTsdSource(file: File, bank: string, replace = false): Promise<TsdUploadResult> {
	let response: Response
	try {
		response = await fetch(`${API_BASE}/api/documents/upload?${new URLSearchParams({ bank, replace: String(replace) })}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				"X-File-Name": file.name,
			},
			body: file,
		})
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk mengunggah dokumen TSD.")
	}
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Unggah TSD gagal (${response.status}).`)
	}
	return response.json() as Promise<TsdUploadResult>
}

export async function activateDocument(reportId: string, bank: string, replace = false): Promise<QualityReport> {
	let res: Response
	try {
		const params = new URLSearchParams({ replace: String(replace), bank })
		res = await fetch(`${API_BASE}/api/documents/checks/${reportId}/activate?${params}`, { method: "POST" })
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk mengaktifkan dokumen.")
	}
	if (!res.ok) {
		const payload = (await res.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Aktivasi gagal dengan status ${res.status}.`)
	}
	const payload = (await res.json()) as { report: QualityReport }
	return payload.report
}

export async function recheckDocument(reportId: string): Promise<QualityReport> {
	let res: Response
	try {
		res = await fetch(`${API_BASE}/api/documents/checks/${reportId}/recheck`, { method: "POST" })
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk memeriksa ulang dokumen.")
	}
	if (!res.ok) {
		const payload = (await res.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Pemeriksaan ulang gagal dengan status ${res.status}.`)
	}
	return (await res.json()) as QualityReport
}

export type AiAnalysis = {
	summary: string
	purpose: string
	process_steps: string[]
	data_reads: string[]
	data_writes: string[]
	review_notes: string[]
	confidence: "rendah" | "sedang" | "tinggi"
}

export type AiAnalysisResponse = {
	analysis: AiAnalysis
	model: string
	created_at: string
	cached: boolean
}

export async function analyzeSp(
	name: string,
	bank = "SCB",
	refresh = false,
): Promise<AiAnalysisResponse> {
	let res: Response
	try {
		res = await fetch(
			`${DIRECT_BROWSER_API_BASE}/api/sp/${encodeURIComponent(name)}/analysis?${new URLSearchParams({ bank, refresh: String(refresh) })}`,
			{ method: "POST" },
		)
	} catch {
		throw new ApiDownError("Backend atau Ollama tidak dapat dihubungi.")
	}
	if (!res.ok) {
		const payload = (await res.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Analisis gagal dengan status ${res.status}.`)
	}
	return (await res.json()) as AiAnalysisResponse
}

export type TableLineage = {
	table: string
	readers: { sp_name: string; segment: string | null; status: SpStatus }[]
	writers: {
		sp_name: string
		segment: string | null
		status: SpStatus
		operations: string | null
	}[]
}

/** Backend tidak bisa dihubungi sama sekali. Biasanya uvicorn belum jalan. */
export class ApiDownError extends Error {}

/** Backend hidup tapi indeksnya belum dibangun (HTTP 503). */
export class IndexMissingError extends Error {}

async function getJson<T>(path: string): Promise<T> {
	let res: Response
	try {
		res = await fetch(`${API_BASE}${path}`, { cache: "no-store" })
	} catch {
		throw new ApiDownError(
			`Tidak bisa menghubungi backend di ${API_BASE}. Pastikan layanan Docker berjalan.`,
		)
	}
	if (res.status === 503) {
		throw new IndexMissingError(
			"Indeks belum dibangun. Jalankan build_index.py lebih dulu.",
		)
	}
	if (!res.ok) {
		throw new Error(`Backend membalas ${res.status} untuk ${path}`)
	}
	return (await res.json()) as T
}

export function imageUrl(path: string): string {
	return `${PUBLIC_API_BASE}/images/${path}`
}

export async function getStats(bank?: string): Promise<Stats> {
	const params = bank ? `?${new URLSearchParams({ bank })}` : ""
	return getJson<Stats>(`/api/stats${params}`)
}

export type SearchOptions = {
	q: string
	status?: string
	segment?: string
	module?: string
	bank?: string
	hideVariants?: boolean
	limit?: number
	offset?: number
}

export async function search(opts: SearchOptions): Promise<SearchResponse> {
	const p = new URLSearchParams({ q: opts.q })
	if (opts.status) p.set("status", opts.status)
	if (opts.segment) p.set("segment", opts.segment)
	if (opts.module) p.set("module", opts.module)
	if (opts.bank) p.set("bank", opts.bank)
	if (opts.hideVariants) p.set("hide_variants", "true")
	p.set("limit", String(opts.limit ?? 20))
	p.set("offset", String(opts.offset ?? 0))
	return getJson<SearchResponse>(`/api/search?${p.toString()}`)
}

/** Mengembalikan null kalau SP tidak ada di indeks, bukan melempar galat. */
export async function getSp(name: string, bank = "SCB"): Promise<SpDetail | null> {
	let res: Response
	const url = `${API_BASE}/api/sp/${encodeURIComponent(name)}?${new URLSearchParams({ bank })}`
	try {
		res = await fetch(url, { cache: "no-store" })
	} catch {
		throw new ApiDownError(
			`Tidak bisa menghubungi backend di ${API_BASE}. Pastikan layanan Docker berjalan.`,
		)
	}
	if (res.status === 404) return null
	if (res.status === 503) {
		throw new IndexMissingError(
			"Indeks belum dibangun. Jalankan build_index.py lebih dulu.",
		)
	}
	if (!res.ok) throw new Error(`Backend membalas ${res.status}`)
	return (await res.json()) as SpDetail
}

export async function getSegments(bank?: string): Promise<SegmentSummary[]> {
	const params = bank ? `?${new URLSearchParams({ bank })}` : ""
	const res = await getJson<SegmentSummary[] | { segments: SegmentSummary[] }>(
		`/api/segments${params}`,
	)
	return Array.isArray(res) ? res : res.segments
}

export async function getModules(bank?: string): Promise<ModuleSummary[]> {
	const params = bank ? `?${new URLSearchParams({ bank })}` : ""
	const res = await getJson<{ modules: ModuleSummary[] }>(`/api/modules${params}`)
	return res.modules
}

export async function getBanks(): Promise<string[]> {
	const res = await getJson<{ banks: string[] }>("/api/banks")
	return res.banks
}

export async function getDocumentPreview(filename: string, bank = "SCB", offset = 0, limit = 80): Promise<DocumentPreview> {
	return getJson<DocumentPreview>(`/api/documents/${encodeURIComponent(filename)}/preview?${new URLSearchParams({ bank, offset: String(offset), limit: String(limit) })}`)
}

export async function getDocumentEditorConfig(filename: string, bank = "SCB"): Promise<DocumentEditorConfig> {
	return getJson<DocumentEditorConfig>(`/api/documents/${encodeURIComponent(filename)}/editor-config?${new URLSearchParams({ bank })}`)
}

export function documentDownloadUrl(filename: string, bank = "SCB", version?: string | number | null): string {
	const params = new URLSearchParams({ bank })
	if (version) params.set("v", String(version))
	return `${PUBLIC_API_BASE}/api/documents/${encodeURIComponent(filename)}/download?${params}`
}

export function documentPdfUrl(filename: string, bank = "SCB", download = false): string {
	return `${PUBLIC_API_BASE}/api/documents/${encodeURIComponent(filename)}/pdf?${new URLSearchParams({ bank, download: String(download) })}`
}

export function matrixDownloadUrl(): string {
	return `${PUBLIC_API_BASE}/api/exports/matrix.xlsx`
}

export function spReportUrl(name: string, bank = "SCB"): string {
	return `${PUBLIC_API_BASE}/api/sp/${encodeURIComponent(name)}/report.pdf?${new URLSearchParams({ bank })}`
}

export async function updateDocumentMetadata(filename: string, newFilename: string, module: string, bank: string, tags: string[]) {
	const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}/metadata`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ filename: newFilename, module, bank, tags }),
	})
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Metadata gagal disimpan (${response.status}).`)
	}
	return response.json() as Promise<{ filename: string; module: string; bank: string; tags: string[] }>
}

async function documentMutation(filename: string, bank: string, action: "activate" | "deactivate" | "delete") {
	const suffix = action === "delete" ? "" : `/${action}`
	const method = action === "delete" ? "DELETE" : "POST"
	let response: Response
	try {
		response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}${suffix}?${new URLSearchParams({ bank })}`, { method })
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk mengelola dokumen.")
	}
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Operasi dokumen gagal (${response.status}).`)
	}
	return response.json()
}

export const deactivateTsd = (filename: string, bank = "SCB") => documentMutation(filename, bank, "deactivate")
export const reactivateTsd = (filename: string, bank = "SCB") => documentMutation(filename, bank, "activate")
export const deleteTsd = (filename: string, bank = "SCB") => documentMutation(filename, bank, "delete")

export async function getReview(limit = 12, bank?: string): Promise<ReviewResponse> {
	const params = new URLSearchParams({ limit: String(limit) })
	if (bank) params.set("bank", bank)
	return getJson<ReviewResponse>(`/api/review?${params}`)
}

export async function getTable(name: string, bank = "SCB"): Promise<TableLineage> {
	return getJson<TableLineage>(`/api/tables/${encodeURIComponent(name)}?${new URLSearchParams({ bank })}`)
}

export async function getSqlSources(bank: string): Promise<SqlSource[]> {
	const response = await getJson<{ sources: SqlSource[] }>(`/api/sql-sources?${new URLSearchParams({ bank })}`)
	return response.sources
}

export async function uploadSqlSource(file: File, bank: string, replace = false): Promise<SqlUploadResult> {
	let response: Response
	try {
		response = await fetch(`${API_BASE}/api/sql-sources/upload?${new URLSearchParams({ bank, replace: String(replace) })}`, {
			method: "POST",
			headers: { "Content-Type": "application/sql", "X-File-Name": file.name },
			body: file,
		})
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk mengunggah skrip SQL.")
	}
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Unggah SQL gagal (${response.status}).`)
	}
	return response.json() as Promise<SqlUploadResult>
}

export async function deleteSqlSource(filename: string, bank: string): Promise<void> {
	const response = await fetch(`${API_BASE}/api/sql-sources/${encodeURIComponent(filename)}?${new URLSearchParams({ bank })}`, { method: "DELETE" })
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Skrip SQL gagal dihapus (${response.status}).`)
	}
}

/** Parameter SP disimpan sebagai string JSON di SQLite. */
export function parseParameters(
	raw: string | null,
): { name: string; type: string }[] {
	if (!raw) return []
	try {
		const v = JSON.parse(raw)
		return Array.isArray(v) ? v : []
	} catch {
		return []
	}
}

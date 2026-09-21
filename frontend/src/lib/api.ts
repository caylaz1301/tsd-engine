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

export type UploadDocumentResult = {
	filename: string
	segment: string
	procedure_count: number
	warning_count: number
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
	summary: { checks: number; passed: number; failed: number; procedures: number }
	checks: QualityCheck[]
}

export async function checkDocument(file: File): Promise<QualityReport> {
	let res: Response
	try {
		res = await fetch(`${API_BASE}/api/documents/check`, {
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

export async function getQualityReports(): Promise<QualityReport[]> {
	const response = await getJson<{ reports: QualityReport[] }>("/api/documents/checks")
	return response.reports
}

export async function activateDocument(reportId: string, replace = false): Promise<QualityReport> {
	let res: Response
	try {
		res = await fetch(`${API_BASE}/api/documents/checks/${reportId}/activate?replace=${replace}`, { method: "POST" })
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
	refresh = false,
): Promise<AiAnalysisResponse> {
	let res: Response
	try {
		res = await fetch(
			`${DIRECT_BROWSER_API_BASE}/api/sp/${encodeURIComponent(name)}/analysis?refresh=${refresh}`,
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

export async function uploadDocument(
	file: File,
	replace = false,
): Promise<UploadDocumentResult> {
	let res: Response
	try {
		res = await fetch(
			`${API_BASE}/api/documents/upload?replace=${replace ? "true" : "false"}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
					"X-File-Name": file.name,
				},
				body: file,
			},
		)
	} catch {
		throw new ApiDownError(
			`Tidak bisa menghubungi backend di ${API_BASE}. Pastikan layanan Docker berjalan.`,
		)
	}

	if (!res.ok) {
		const payload = (await res.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Unggah gagal dengan status ${res.status}.`)
	}
	return (await res.json()) as UploadDocumentResult
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

export async function getStats(): Promise<Stats> {
	return getJson<Stats>("/api/stats")
}

export type SearchOptions = {
	q: string
	status?: string
	segment?: string
	module?: string
	hideVariants?: boolean
	limit?: number
	offset?: number
}

export async function search(opts: SearchOptions): Promise<SearchResponse> {
	const p = new URLSearchParams({ q: opts.q })
	if (opts.status) p.set("status", opts.status)
	if (opts.segment) p.set("segment", opts.segment)
	if (opts.module) p.set("module", opts.module)
	if (opts.hideVariants) p.set("hide_variants", "true")
	p.set("limit", String(opts.limit ?? 20))
	p.set("offset", String(opts.offset ?? 0))
	return getJson<SearchResponse>(`/api/search?${p.toString()}`)
}

/** Mengembalikan null kalau SP tidak ada di indeks, bukan melempar galat. */
export async function getSp(name: string): Promise<SpDetail | null> {
	let res: Response
	const url = `${API_BASE}/api/sp/${encodeURIComponent(name)}`
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

export async function getSegments(): Promise<SegmentSummary[]> {
	const res = await getJson<SegmentSummary[] | { segments: SegmentSummary[] }>(
		"/api/segments",
	)
	return Array.isArray(res) ? res : res.segments
}

export async function getModules(): Promise<ModuleSummary[]> {
	const res = await getJson<{ modules: ModuleSummary[] }>("/api/modules")
	return res.modules
}

export async function getDocumentPreview(filename: string, offset = 0, limit = 80): Promise<DocumentPreview> {
	return getJson<DocumentPreview>(`/api/documents/${encodeURIComponent(filename)}/preview?offset=${offset}&limit=${limit}`)
}

export async function getDocumentEditorConfig(filename: string): Promise<DocumentEditorConfig> {
	return getJson<DocumentEditorConfig>(`/api/documents/${encodeURIComponent(filename)}/editor-config`)
}

export function documentDownloadUrl(filename: string, version?: string | number | null): string {
	const suffix = version ? `?v=${encodeURIComponent(String(version))}` : ""
	return `${PUBLIC_API_BASE}/api/documents/${encodeURIComponent(filename)}/download${suffix}`
}

export function documentPdfUrl(filename: string, download = false): string {
	return `${PUBLIC_API_BASE}/api/documents/${encodeURIComponent(filename)}/pdf${download ? "?download=true" : ""}`
}

export function matrixDownloadUrl(): string {
	return `${PUBLIC_API_BASE}/api/exports/matrix.xlsx`
}

export function spReportUrl(name: string): string {
	return `${PUBLIC_API_BASE}/api/sp/${encodeURIComponent(name)}/report.pdf`
}

export async function updateDocumentMetadata(filename: string, newFilename: string, module: string, tags: string[]) {
	const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}/metadata`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ filename: newFilename, module, tags }),
	})
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Metadata gagal disimpan (${response.status}).`)
	}
	return response.json() as Promise<{ filename: string; module: string; tags: string[] }>
}

async function documentMutation(filename: string, action: "activate" | "deactivate" | "delete") {
	const suffix = action === "delete" ? "" : `/${action}`
	const method = action === "delete" ? "DELETE" : "POST"
	let response: Response
	try {
		response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(filename)}${suffix}`, { method })
	} catch {
		throw new ApiDownError("Backend tidak dapat dihubungi untuk mengelola dokumen.")
	}
	if (!response.ok) {
		const payload = (await response.json().catch(() => null)) as { detail?: string } | null
		throw new Error(payload?.detail ?? `Operasi dokumen gagal (${response.status}).`)
	}
	return response.json()
}

export const deactivateTsd = (filename: string) => documentMutation(filename, "deactivate")
export const reactivateTsd = (filename: string) => documentMutation(filename, "activate")
export const deleteTsd = (filename: string) => documentMutation(filename, "delete")

export async function getReview(limit = 12): Promise<ReviewResponse> {
	return getJson<ReviewResponse>(`/api/review?limit=${limit}`)
}

export async function getTable(name: string): Promise<TableLineage> {
	return getJson<TableLineage>(`/api/tables/${encodeURIComponent(name)}`)
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

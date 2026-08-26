/**
 * Klien API untuk backend TSD Engine.
 *
 * Semua tipe di sini mencerminkan bentuk JSON yang benar-benar dikembalikan
 * FastAPI, bukan tebakan. Kalau backend berubah, file ini yang pertama
 * disesuaikan supaya kesalahan muncul saat kompilasi, bukan saat runtime.
 */

export const API_BASE =
	process.env.NEXT_PUBLIC_API_BASE ?? "http://127.0.0.1:8000"

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
	}
	segments: {
		segment: string
		total: number
		matched: number
		low_confidence: number
	}[]
	hot_tables: { table_name: string; sp_count: number }[]
	most_copied: { base_name: string; copies: number }[]
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
}

export type TableLineage = {
	table_name: string
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
			`Tidak bisa menghubungi backend di ${API_BASE}. Pastikan uvicorn berjalan.`,
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
	return `${API_BASE}/images/${path}`
}

export async function getStats(): Promise<Stats> {
	return getJson<Stats>("/api/stats")
}

export type SearchOptions = {
	q: string
	status?: string
	segment?: string
	hideVariants?: boolean
	limit?: number
	offset?: number
}

export async function search(opts: SearchOptions): Promise<SearchResponse> {
	const p = new URLSearchParams({ q: opts.q })
	if (opts.status) p.set("status", opts.status)
	if (opts.segment) p.set("segment", opts.segment)
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
			`Tidak bisa menghubungi backend di ${API_BASE}. Pastikan uvicorn berjalan.`,
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

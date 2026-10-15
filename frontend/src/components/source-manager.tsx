"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
	AlertCircle,
	Check,
	Database,
	FileCode2,
	FileText,
	Loader2,
	Trash2,
	Upload,
	X,
} from "lucide-react"
import {
	deleteSqlSource,
	uploadSqlSource,
	uploadTsdSource,
	type SqlSource,
	type TsdUploadResult,
} from "@/lib/api"
import { cn } from "@/lib/utils"

type UploadState = "queued" | "processing" | "active" | "error"
type TsdQueueItem = { id: string; file: File; state: UploadState; result?: TsdUploadResult; message?: string }
type SqlQueueItem = { id: string; file: File; state: UploadState; message?: string; procedures?: number }

const DOCX_MAX = 30 * 1024 * 1024
const SQL_MAX = 100 * 1024 * 1024

function bytes(value: number) {
	if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
	return `${(value / 1024 / 1024).toFixed(1)} MB`
}

function fileId(file: File) {
	return `${file.name}-${file.size}-${file.lastModified}`
}

function validate(file: File, kind: "tsd" | "sql") {
	const extension = kind === "tsd" ? ".docx" : ".sql"
	const limit = kind === "tsd" ? DOCX_MAX : SQL_MAX
	if (!file.name.toLowerCase().endsWith(extension)) return `Hanya file ${extension.toUpperCase()} yang diterima.`
	if (file.size === 0) return "File kosong."
	if (file.size > limit) return `Ukuran file melebihi ${kind === "tsd" ? "30" : "100"} MB.`
	return null
}

export function SourceManager({ bank, initialSqlSources }: { bank: string; initialSqlSources: SqlSource[] }) {
	const router = useRouter()
	const [tab, setTab] = useState<"tsd" | "sql">("tsd")
	const [tsdQueue, setTsdQueue] = useState<TsdQueueItem[]>([])
	const [sqlQueue, setSqlQueue] = useState<SqlQueueItem[]>([])
	const [sqlSources, setSqlSources] = useState(initialSqlSources)
	const [replace, setReplace] = useState(false)
	const [busy, setBusy] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const tsdSummary = useMemo(() => ({
		queued: tsdQueue.filter((item) => item.state === "queued").length,
		active: tsdQueue.filter((item) => item.state === "active").length,
		error: tsdQueue.filter((item) => item.state === "error").length,
	}), [tsdQueue])

	function addFiles(files: FileList | File[], kind: "tsd" | "sql") {
		const currentIds = new Set((kind === "tsd" ? tsdQueue : sqlQueue).map((item) => item.id))
		const next = Array.from(files).map((file) => {
			const issue = validate(file, kind)
			return { id: fileId(file), file, state: issue ? "error" : "queued", message: issue } as TsdQueueItem | SqlQueueItem
		}).filter((item) => !currentIds.has(item.id))
		if (kind === "tsd") setTsdQueue((items) => [...items, ...(next as TsdQueueItem[])])
		else setSqlQueue((items) => [...items, ...(next as SqlQueueItem[])])
	}

	async function uploadTsd() {
		const pending = tsdQueue.filter((item) => item.state === "queued")
		if (!pending.length || busy) return
		setBusy(true)
		setError(null)
		for (const item of pending) {
			setTsdQueue((items) => items.map((row) => row.id === item.id ? { ...row, state: "processing", message: "Menyimpan, membaca isi, dan memperbarui indeks..." } : row))
			try {
				const result = await uploadTsdSource(item.file, bank, replace)
				setTsdQueue((items) => items.map((row) => row.id === item.id ? {
					...row,
					result,
					state: "active",
					message: `${result.procedure_count} SP terindeks dari segment ${result.segment}.`,
				} : row))
			} catch (cause) {
				setTsdQueue((items) => items.map((row) => row.id === item.id ? { ...row, state: "error", message: cause instanceof Error ? cause.message : "Unggah TSD gagal." } : row))
			}
		}
		setBusy(false)
		router.refresh()
	}

	async function uploadSql() {
		const pending = sqlQueue.filter((item) => item.state === "queued")
		if (!pending.length || busy) return
		setBusy(true)
		setError(null)
		for (const item of pending) {
			setSqlQueue((items) => items.map((row) => row.id === item.id ? { ...row, state: "processing", message: "Membaca stored procedure dan memperbarui indeks..." } : row))
			try {
				const result = await uploadSqlSource(item.file, bank, replace)
				setSqlQueue((items) => items.map((row) => row.id === item.id ? { ...row, state: "active", procedures: result.procedure_count, message: `${result.procedure_count} stored procedure masuk ke indeks.` } : row))
				setSqlSources((items) => [{ filename: result.filename, bank, size_bytes: item.file.size, modified_at: Date.now() / 1000, database: result.database, encoding: result.encoding, procedure_count: result.procedure_count, status: "active" }, ...items.filter((row) => row.filename !== result.filename)])
			} catch (cause) {
				setSqlQueue((items) => items.map((row) => row.id === item.id ? { ...row, state: "error", message: cause instanceof Error ? cause.message : "Unggah SQL gagal." } : row))
			}
		}
		setBusy(false)
		router.refresh()
	}

	async function removeSql(source: SqlSource) {
		if (!window.confirm(`Hapus ${source.filename} dari sumber ${bank}? Indeks akan diperbarui.`)) return
		setBusy(true)
		setError(null)
		try {
			await deleteSqlSource(source.filename, bank)
			setSqlSources((items) => items.filter((item) => item.filename !== source.filename))
			router.refresh()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Skrip gagal dihapus.")
		} finally {
			setBusy(false)
		}
	}

	return (
		<div className="space-y-5">
			{error ? <Notice message={error} onClose={() => setError(null)} /> : null}
			<div className="flex overflow-x-auto border-b border-zinc-200" role="tablist" aria-label="Jenis sumber">
				<Tab active={tab === "tsd"} onClick={() => setTab("tsd")} icon={FileText}>Dokumen TSD</Tab>
				<Tab active={tab === "sql"} onClick={() => setTab("sql")} icon={Database}>Skrip SQL</Tab>
			</div>

			<div className="flex flex-col gap-3 border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950 sm:flex-row sm:items-center sm:justify-between">
				<p><strong>Tujuan upload: {bank}</strong> · dokumen, skrip, dan indeks dipisahkan dari bank lain.</p>
				<label className="flex shrink-0 items-center gap-2"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} className="size-4 accent-blue-700" />Ganti file dengan nama sama</label>
			</div>

			{tab === "tsd" ? <section aria-labelledby="tsd-upload-title" className="space-y-5">
				<div>
					<h2 id="tsd-upload-title" className="text-lg font-semibold text-zinc-950">Unggah sumber TSD</h2>
					<p className="mt-1 max-w-[72ch] text-sm leading-6 text-zinc-600">Pilih beberapa DOCX sekaligus. File yang valid langsung disimpan sebagai sumber aktif, dipindai, dan dimasukkan ke indeks tanpa melewati quality checker.</p>
				</div>
				<Dropzone kind="tsd" onFiles={(files) => addFiles(files, "tsd")} />
				{tsdQueue.length ? <>
					<div className="flex flex-wrap items-center justify-between gap-3 border-y border-zinc-200 py-3">
						<p className="text-sm text-zinc-600"><span className="font-medium text-zinc-950">{tsdQueue.length} file</span> · {tsdSummary.queued} menunggu · {tsdSummary.active} aktif · {tsdSummary.error} gagal</p>
						<div className="flex flex-wrap gap-2">
							<button type="button" onClick={() => setTsdQueue([])} disabled={busy} className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"><Trash2 className="size-4" />Kosongkan</button>
							<button type="button" onClick={uploadTsd} disabled={busy || !tsdSummary.queued} className="inline-flex min-h-10 items-center gap-2 bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-zinc-300 disabled:text-zinc-600">{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{busy ? "Memproses..." : `Unggah dan indekskan ${tsdSummary.queued || "file"}`}</button>
						</div>
					</div>
					<QueueList items={tsdQueue} onRemove={(id) => setTsdQueue((items) => items.filter((item) => item.id !== id))} />
				</> : <EmptyQueue label="Belum ada dokumen TSD dalam antrean upload." />}
				<p className="text-sm leading-6 text-zinc-600">Setelah berhasil, data otomatis tersedia di Ringkasan, Pencarian, dan Repository Dokumen TSD untuk bank {bank}.</p>
			</section> : null}

			{tab === "sql" ? <section aria-labelledby="sql-upload-title" className="space-y-5">
				<div>
					<h2 id="sql-upload-title" className="text-lg font-semibold text-zinc-950">Unggah sumber SQL</h2>
					<p className="mt-1 max-w-[72ch] text-sm leading-6 text-zinc-600">Skrip dibaca untuk menemukan stored procedure dan relasi tabel, lalu indeks bank diperbarui. Sistem tidak menjalankan perintah SQL ke server bank.</p>
				</div>
				<Dropzone kind="sql" onFiles={(files) => addFiles(files, "sql")} />
				{sqlQueue.length ? <>
					<div className="flex flex-wrap items-center justify-between gap-3 border-y border-zinc-200 py-3">
						<p className="text-sm text-zinc-600"><span className="font-medium text-zinc-950">{sqlQueue.length} file baru</span> · diproses satu per satu agar kegagalan satu file tidak membatalkan yang lain.</p>
						<div className="flex flex-wrap gap-2"><button type="button" onClick={() => setSqlQueue([])} disabled={busy} className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"><Trash2 className="size-4" />Kosongkan</button><button type="button" onClick={uploadSql} disabled={busy || !sqlQueue.some((item) => item.state === "queued")} className="inline-flex min-h-10 items-center gap-2 bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:bg-zinc-300 disabled:text-zinc-600">{busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{busy ? "Memproses..." : "Unggah dan indekskan"}</button></div>
					</div>
					<QueueList items={sqlQueue} onRemove={(id) => setSqlQueue((items) => items.filter((item) => item.id !== id))} />
				</> : null}
				<SqlSources sources={sqlSources} busy={busy} onDelete={removeSql} />
			</section> : null}
		</div>
	)
}

function Tab({ active, onClick, icon: Icon, children }: { active: boolean; onClick: () => void; icon: typeof FileText; children: React.ReactNode }) {
	return <button type="button" role="tab" aria-selected={active} onClick={onClick} className={cn("-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium", active ? "border-blue-700 text-zinc-950" : "border-transparent text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950")}><Icon className="size-4" />{children}</button>
}

function Dropzone({ kind, onFiles }: { kind: "tsd" | "sql"; onFiles: (files: FileList) => void }) {
	const input = useRef<HTMLInputElement>(null)
	const [dragging, setDragging] = useState(false)
	const extension = kind === "tsd" ? ".docx" : ".sql"
	return <button type="button" onClick={() => input.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); onFiles(event.dataTransfer.files) }} className={cn("flex min-h-36 w-full flex-col items-center justify-center border border-dashed px-5 py-6 text-center transition-colors", dragging ? "border-blue-600 bg-blue-50" : "border-zinc-300 bg-zinc-50 hover:border-zinc-500 hover:bg-zinc-100")}>
		<Upload className="size-6 text-zinc-500" /><span className="mt-2 font-medium text-zinc-950">Pilih atau tarik beberapa file {extension.toUpperCase()}</span><span className="mt-1 text-sm text-zinc-600">Maksimum {kind === "tsd" ? "30 MB per dokumen" : "100 MB per skrip"}</span>
		<input ref={input} type="file" multiple accept={extension} className="sr-only" onChange={(event) => { if (event.target.files) onFiles(event.target.files); event.target.value = "" }} />
	</button>
}

function QueueList({ items, onRemove }: { items: Array<TsdQueueItem | SqlQueueItem>; onRemove: (id: string) => void }) {
	return <ul className="divide-y divide-zinc-200 border-y border-zinc-200">{items.map((item) => <li key={item.id} className="flex items-start gap-3 py-3">
		<StateIcon state={item.state} />
		<div className="min-w-0 flex-1"><p className="truncate font-mono text-sm font-medium text-zinc-950" title={item.file.name}>{item.file.name}</p><p className={cn("mt-1 text-sm", item.state === "error" ? "text-red-700" : "text-zinc-600")}>{item.message ?? `${bytes(item.file.size)} · menunggu diproses`}</p></div>
		<button type="button" onClick={() => onRemove(item.id)} disabled={item.state === "processing"} className="inline-flex size-9 shrink-0 items-center justify-center text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40" aria-label={`Hapus ${item.file.name} dari antrean`}><X className="size-4" /></button>
	</li>)}</ul>
}

function StateIcon({ state }: { state: UploadState }) {
	const styles = state === "active" ? "bg-emerald-100 text-emerald-700" : state === "error" ? "bg-red-100 text-red-700" : "bg-zinc-100 text-zinc-600"
	return <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", styles)}>{state === "processing" ? <Loader2 className="size-4 animate-spin" /> : state === "active" ? <Check className="size-4" /> : state === "error" ? <AlertCircle className="size-4" /> : <FileText className="size-4" />}</span>
}

function EmptyQueue({ label }: { label: string }) {
	return <div className="border-y border-zinc-200 py-7 text-center text-sm text-zinc-500">{label}</div>
}

function SqlSources({ sources, busy, onDelete }: { sources: SqlSource[]; busy: boolean; onDelete: (source: SqlSource) => void }) {
	return <div className="pt-2"><div className="flex items-center justify-between border-b border-zinc-200 pb-2"><h3 className="font-semibold text-zinc-950">Skrip aktif</h3><span className="text-sm text-zinc-500">{sources.length} file</span></div>{sources.length ? <ul className="divide-y divide-zinc-200">{sources.map((source) => <li key={source.filename} className="flex items-center gap-3 py-3"><span className="flex size-9 items-center justify-center bg-zinc-100 text-zinc-600"><FileCode2 className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate font-mono text-sm font-medium text-zinc-950">{source.filename}</p><p className="mt-0.5 text-sm text-zinc-600">{source.procedure_count} SP · {source.database || "database tidak dideklarasikan"} · {bytes(source.size_bytes)}</p></div><button type="button" onClick={() => onDelete(source)} disabled={busy} className="inline-flex size-9 items-center justify-center text-red-600 hover:bg-red-50 disabled:opacity-40" aria-label={`Hapus ${source.filename}`}><Trash2 className="size-4" /></button></li>)}</ul> : <div className="flex flex-col items-center border-y border-zinc-200 py-8 text-center"><Database className="size-6 text-zinc-400" /><p className="mt-2 font-medium text-zinc-800">Belum ada skrip SQL untuk bank ini</p><p className="mt-1 text-sm text-zinc-500">Unggah skrip untuk mengaktifkan pencocokan SP dan lineage tabel.</p></div>}</div>
}

function Notice({ message, onClose }: { message: string; onClose: () => void }) {
	return <div role="alert" className="fixed top-20 right-4 z-[70] flex max-w-md items-start gap-3 border border-red-300 bg-white px-4 py-3 text-sm text-red-800 shadow-md"><AlertCircle className="mt-0.5 size-5 shrink-0" /><span className="flex-1 font-medium leading-5">{message}</span><button type="button" onClick={onClose} className="inline-flex size-7 items-center justify-center hover:bg-red-50" aria-label="Tutup"><X className="size-4" /></button></div>
}

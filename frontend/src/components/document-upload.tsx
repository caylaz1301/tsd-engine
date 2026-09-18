"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, Check, ChevronDown, FileCheck2, FileText, Loader2, ShieldCheck, Upload, X } from "lucide-react"
import { activateDocument, checkDocument, getQualityReports, recheckDocument, type QualityReport } from "@/lib/api"
import { cn } from "@/lib/utils"

const MAX_BYTES = 30 * 1024 * 1024

function validateFile(file: File): string | null {
	if (!file.name.toLowerCase().endsWith(".docx")) return "Pilih dokumen Microsoft Word dengan ekstensi .docx."
	if (file.size === 0) return "File yang dipilih kosong."
	if (file.size > MAX_BYTES) return "Ukuran file melebihi batas 30 MB."
	if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.docx$/i.test(file.name)) return "Nama file hanya boleh memakai huruf, angka, spasi, titik, strip, dan garis bawah."
	return null
}

export function DocumentUpload() {
	const router = useRouter()
	const inputRef = useRef<HTMLInputElement>(null)
	const [file, setFile] = useState<File | null>(null)
	const [dragging, setDragging] = useState(false)
	const [loading, setLoading] = useState(false)
	const [activating, setActivating] = useState(false)
	const [rechecking, setRechecking] = useState(false)
	const [replace, setReplace] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [report, setReport] = useState<QualityReport | null>(null)
	const [history, setHistory] = useState<QualityReport[]>([])
	const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null)

	useEffect(() => { void getQualityReports().then(setHistory).catch(() => undefined) }, [])

	function choose(next: File | null) {
		setReport(null); setExpandedHistoryId(null); setError(null)
		if (!next) return setFile(null)
		const issue = validateFile(next)
		setFile(issue ? null : next); setError(issue)
	}

	async function inspect() {
		if (!file || loading) return
		setLoading(true); setError(null)
		try {
			const next = await checkDocument(file)
			setReport(next)
			setExpandedHistoryId(null)
			setHistory((items) => [next, ...items.filter((item) => item.id !== next.id)])
			setFile(null)
			if (inputRef.current) inputRef.current.value = ""
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Dokumen tidak dapat diperiksa.")
		} finally { setLoading(false) }
	}

	async function activate() {
		if (!report?.eligible || activating) return
		setActivating(true); setError(null)
		try {
			const active = await activateDocument(report.id, replace)
			setReport(active)
			setHistory((items) => items.map((item) => item.id === active.id ? active : item))
			router.refresh()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Dokumen tidak dapat diaktifkan.")
		} finally { setActivating(false) }
	}

	async function recheck() {
		if (!report || report.status === "active" || rechecking) return
		setRechecking(true); setError(null)
		try {
			const refreshed = await recheckDocument(report.id)
			setReport(refreshed)
			setHistory((items) => [refreshed, ...items.filter((item) => item.id !== report.id)])
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Dokumen tidak dapat diperiksa ulang.")
		} finally { setRechecking(false) }
	}

	return (
		<div className="space-y-5">
			{error ? <div role="alert" aria-live="assertive" className="fixed top-20 right-4 z-[70] flex max-w-md items-start gap-3 border border-red-300 bg-white px-4 py-3 text-sm text-red-800 shadow-lg"><AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden /><span className="flex-1 font-medium leading-5">{error}</span><button type="button" onClick={() => setError(null)} className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center text-red-700 hover:bg-red-50" aria-label="Tutup notifikasi"><X className="size-4" /></button></div> : null}
			<section className="border border-zinc-300 bg-white">
				<div className="border-b border-zinc-200 px-4 py-3 sm:px-5">
					<h2 className="font-semibold text-zinc-950">TSD quality checker</h2>
					<p className="mt-1 max-w-[70ch] text-sm text-zinc-600">Dokumen diperiksa di ruang terpisah. Hanya hasil 100% yang dapat dijadikan sumber aktif.</p>
				</div>
				<div className="p-4 sm:p-5">
					<label onDragEnter={(e) => { e.preventDefault(); setDragging(true) }} onDragOver={(e) => e.preventDefault()} onDragLeave={(e) => { e.preventDefault(); setDragging(false) }} onDrop={(e) => { e.preventDefault(); setDragging(false); choose(e.dataTransfer.files.item(0)) }} className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed px-5 py-5 text-center", dragging ? "border-accent bg-accent-soft" : "border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100")}>
						{file ? <FileText className="size-6 text-zinc-700" aria-hidden /> : <Upload className="size-6 text-zinc-500" aria-hidden />}
						<span className="mt-2 font-medium text-zinc-900">{file ? file.name : "Pilih atau tarik file DOCX ke sini"}</span>
						<span className="mt-1 text-sm text-zinc-600">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Maksimum 30 MB · file belum menjadi sumber aktif"}</span>
						<input ref={inputRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => choose(e.target.files?.item(0) ?? null)} className="sr-only" />
					</label>
					<div className="mt-3 min-h-6" />
					<button type="button" onClick={inspect} disabled={!file || loading} className="mt-2 inline-flex min-h-11 items-center gap-2 bg-accent px-4 py-2 font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-500">
						{loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
						{loading ? "Memeriksa seluruh dokumen..." : "Jalankan quality checker"}
					</button>
				</div>
			</section>

			{report && !expandedHistoryId ? <QualityResult report={report} replace={replace} setReplace={setReplace} activating={activating} rechecking={rechecking} activate={activate} recheck={recheck} /> : null}

			{history.length > 0 ? (
				<section className="border-y border-zinc-200 py-4">
					<div className="mb-2 flex items-baseline justify-between gap-4"><h2 className="font-semibold text-zinc-900">Riwayat pemeriksaan</h2><span className="text-sm text-zinc-500">10 terbaru</span></div>
					<ul className="divide-y divide-zinc-200">{history.slice(0, 10).map((item) => {
						const expanded = expandedHistoryId === item.id
						return <li key={item.id}><button type="button" onClick={() => { if (expanded) { setExpandedHistoryId(null); setReport(null) } else { setReport(item); setExpandedHistoryId(item.id) } }} aria-expanded={expanded} className="flex w-full items-center gap-3 py-3 text-left hover:bg-zinc-50">
							<span className={cn("flex size-9 shrink-0 items-center justify-center border font-mono text-xs font-semibold", item.score === 100 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>{item.score}</span>
							<span className="min-w-0 flex-1"><span className="block truncate font-mono text-sm font-medium text-zinc-900">{item.filename}</span><span className="block text-sm text-zinc-600">{item.status === "active" ? "Sumber aktif" : item.eligible ? "Siap diaktifkan" : `${item.summary.failed} pemeriksaan gagal`}</span></span>
							<ChevronDown className={cn("size-4 text-zinc-400 transition-transform", expanded ? "rotate-180" : "-rotate-90")} aria-hidden />
						</button>{expanded ? <div className="pb-4"><QualityResult report={item} replace={replace} setReplace={setReplace} activating={activating} rechecking={rechecking} activate={activate} recheck={recheck} /></div> : null}</li>
					})}</ul>
				</section>
			) : null}
		</div>
	)
}

function QualityResult({ report, replace, setReplace, activating, rechecking, activate, recheck }: { report: QualityReport; replace: boolean; setReplace: (value: boolean) => void; activating: boolean; rechecking: boolean; activate: () => void; recheck: () => void }) {
	const active = report.status === "active"
	return (
		<section className="border border-zinc-300 bg-white" aria-live="polite">
			<header className="flex flex-col gap-4 border-b border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
				<div className="flex min-w-0 items-center gap-4">
					<div className={cn("flex size-16 shrink-0 items-center justify-center border font-mono text-xl font-semibold tabular-nums", report.eligible ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800")}>{report.score}%</div>
					<div className="min-w-0"><h2 className="font-mono font-semibold break-all text-zinc-950">{report.filename}</h2><p className="mt-1 text-sm text-zinc-600">{active ? "Aktif dan sudah masuk ke indeks pencarian." : report.eligible ? "Semua pemeriksaan lulus. Dokumen siap diaktifkan." : `${report.summary.failed} dari ${report.summary.checks} pemeriksaan perlu diperbaiki.`}</p></div>
				</div>
				{active ? <span className="inline-flex min-h-10 items-center gap-2 self-start border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"><FileCheck2 className="size-4" aria-hidden />Sumber aktif</span> : null}
			</header>

			<div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_260px]">
				<div className="divide-y divide-zinc-200">
					{report.checks.map((check) => (
						check.status === "pass" ? (
							<div key={check.code} className="flex items-start gap-3 px-4 py-3 sm:px-5">
								<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
									<Check className="size-3.5" aria-hidden />
								</span>
								<span className="min-w-0 flex-1">
									<span className="font-medium text-zinc-900">{check.label}</span>
									<span className="mt-0.5 block text-sm text-zinc-600">{check.summary}</span>
								</span>
							</div>
						) : (
							<details key={check.code} open className="group px-4 py-3 sm:px-5">
								<summary className="flex cursor-pointer list-none items-start gap-3">
									<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
										<X className="size-3.5" aria-hidden />
									</span>
									<span className="min-w-0 flex-1">
										<span className="font-medium text-zinc-900">{check.label}</span>
										<span className="mt-0.5 block text-sm text-zinc-600">{check.summary}</span>
									</span>
									<ChevronDown className="mt-1 size-4 text-zinc-400 transition-transform group-open:rotate-180" aria-hidden />
								</summary>
								<ul className="mt-3 ml-8 list-disc space-y-1 pl-4 text-sm leading-6 text-zinc-700">
									{check.findings.map((finding, index) => <li key={`${finding}-${index}`}>{finding}</li>)}
								</ul>
							</details>
						)
					))}
				</div>
				<aside className="border-t border-zinc-200 bg-zinc-50 p-4 md:border-t-0 md:border-l md:p-5">
					<h3 className="text-sm font-semibold text-zinc-900">Ringkasan</h3>
					<dl className="mt-3 space-y-3 text-sm"><div><dt className="text-zinc-500">Segment</dt><dd className="mt-0.5 font-mono break-all text-zinc-900">{report.segment}</dd></div><div><dt className="text-zinc-500">Pemeriksaan</dt><dd className="mt-0.5 text-zinc-900">{report.summary.passed} lulus · {report.summary.failed} gagal</dd></div><div><dt className="text-zinc-500">Stored procedure</dt><dd className="mt-0.5 font-mono text-zinc-900">{report.summary.procedures}</dd></div></dl>
					{report.eligible && !active ? <div className="mt-6 border-t border-zinc-200 pt-4"><label className="flex cursor-pointer items-start gap-2 text-sm text-zinc-700"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-1 size-4 accent-blue-700" />Ganti sumber aktif bila nama file sama</label><button type="button" onClick={activate} disabled={activating} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60">{activating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <FileCheck2 className="size-4" aria-hidden />}{activating ? "Mengaktifkan..." : "Jadikan sumber aktif"}</button></div> : null}
					{!report.eligible ? <div className="mt-6 border-t border-zinc-200 pt-4"><p className="text-sm leading-6 text-zinc-600">Setelah memperbaiki file Word, unggah versi barunya. Gunakan pemeriksaan ulang untuk menerapkan aturan checker terbaru pada file staging ini.</p><button type="button" onClick={recheck} disabled={rechecking} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-60">{rechecking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}{rechecking ? "Memeriksa ulang..." : "Jalankan ulang checker"}</button></div> : null}
				</aside>
			</div>
		</section>
	)
}

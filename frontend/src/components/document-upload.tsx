"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
	AlertCircle,
	Check,
	ChevronDown,
	FileCheck2,
	FileText,
	Loader2,
	ShieldCheck,
	Upload,
	X,
} from "lucide-react"
import {
	activateDocument,
	checkDocument,
	getQualityReports,
	recheckDocument,
	type QualityReport,
} from "@/lib/api"
import { cn } from "@/lib/utils"

const MAX_BYTES = 30 * 1024 * 1024

function validateFile(file: File): string | null {
	if (!file.name.toLowerCase().endsWith(".docx")) return "Pilih dokumen Word dengan ekstensi .docx."
	if (!file.size) return "File yang dipilih kosong."
	if (file.size > MAX_BYTES) return "Ukuran file melebihi batas 30 MB."
	if (!/^[A-Za-z0-9][A-Za-z0-9._ -]{0,179}\.docx$/i.test(file.name)) return "Nama file hanya boleh memakai huruf, angka, spasi, titik, strip, dan garis bawah."
	return null
}

export function DocumentUpload({ selectedBank }: { selectedBank: string }) {
	const router = useRouter()
	const input = useRef<HTMLInputElement>(null)
	const [file, setFile] = useState<File | null>(null)
	const [report, setReport] = useState<QualityReport | null>(null)
	const [history, setHistory] = useState<QualityReport[]>([])
	const [expanded, setExpanded] = useState<string | null>(null)
	const [replace, setReplace] = useState(false)
	const [dragging, setDragging] = useState(false)
	const [checking, setChecking] = useState(false)
	const [activating, setActivating] = useState(false)
	const [rechecking, setRechecking] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		void getQualityReports(selectedBank).then(setHistory).catch(() => setHistory([]))
	}, [selectedBank])

	function choose(next: File | null) {
		setReport(null)
		setExpanded(null)
		setError(null)
		if (!next) return setFile(null)
		const issue = validateFile(next)
		setFile(issue ? null : next)
		setError(issue)
	}

	async function inspect() {
		if (!file || checking) return
		setChecking(true)
		setError(null)
		try {
			const result = await checkDocument(file, selectedBank)
			setReport(result)
			setHistory((items) => [result, ...items.filter((item) => item.id !== result.id)].slice(0, 10))
			setFile(null)
			if (input.current) input.current.value = ""
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Dokumen tidak dapat diperiksa.")
		} finally {
			setChecking(false)
		}
	}

	async function activate(target: QualityReport) {
		if (!target.eligible || activating) return
		setActivating(true)
		setError(null)
		try {
			const active = await activateDocument(target.id, selectedBank, replace)
			setReport(active)
			setHistory((items) => [active, ...items.filter((item) => item.id !== active.id)].slice(0, 10))
			router.refresh()
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Dokumen tidak dapat diaktifkan.")
		} finally {
			setActivating(false)
		}
	}

	async function recheck(target: QualityReport) {
		if (target.status === "active" || rechecking) return
		setRechecking(true)
		setError(null)
		try {
			const refreshed = await recheckDocument(target.id)
			setReport(refreshed)
			setHistory((items) => [refreshed, ...items.filter((item) => item.id !== refreshed.id)].slice(0, 10))
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : "Dokumen tidak dapat diperiksa ulang.")
		} finally {
			setRechecking(false)
		}
	}

	return (
		<section id="quality-checker" className="border-t border-zinc-200 pt-6">
			<div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h2 className="text-lg font-semibold text-zinc-950">TSD quality checker</h2>
					<p className="mt-1 max-w-[72ch] text-sm leading-6 text-zinc-600">Periksa satu dokumen secara rinci untuk bank {selectedBank}. Hanya hasil 100% yang dapat dijadikan sumber aktif.</p>
				</div>
					<a href="/admin/sources" className="text-sm font-medium text-blue-700 hover:text-blue-900">Kelola sumber TSD dan SQL</a>
			</div>

			{error ? <div role="alert" className="mb-4 flex items-start gap-3 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"><AlertCircle className="mt-0.5 size-5 shrink-0" /><span className="flex-1">{error}</span><button type="button" onClick={() => setError(null)} aria-label="Tutup pesan" className="inline-flex size-7 items-center justify-center hover:bg-red-100"><X className="size-4" /></button></div> : null}

			<div className="border border-zinc-300 bg-white p-4 sm:p-5">
				<label onDragEnter={(event) => { event.preventDefault(); setDragging(true) }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files.item(0)) }} className={cn("flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed px-5 py-5 text-center", dragging ? "border-blue-600 bg-blue-50" : "border-zinc-300 bg-zinc-50 hover:border-zinc-500 hover:bg-zinc-100")}>
					{file ? <FileText className="size-6 text-zinc-700" /> : <Upload className="size-6 text-zinc-500" />}
					<span className="mt-2 font-medium text-zinc-950">{file ? file.name : "Pilih atau tarik file DOCX ke sini"}</span>
					<span className="mt-1 text-sm text-zinc-600">{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "Maksimum 30 MB · belum menjadi sumber aktif"}</span>
					<input ref={input} type="file" accept=".docx" className="sr-only" onChange={(event) => choose(event.target.files?.item(0) ?? null)} />
				</label>
				<button type="button" onClick={inspect} disabled={!file || checking} className="mt-4 inline-flex min-h-11 items-center gap-2 bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600">{checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{checking ? "Memeriksa dokumen..." : "Jalankan quality checker"}</button>
			</div>

			{report && !expanded ? <QualityResult report={report} bank={selectedBank} replace={replace} setReplace={setReplace} activating={activating} rechecking={rechecking} onActivate={() => activate(report)} onRecheck={() => recheck(report)} /> : null}

			<div className="mt-6">
				<div className="flex items-center justify-between border-b border-zinc-200 pb-2"><h3 className="font-semibold text-zinc-950">Riwayat pemeriksaan</h3><span className="text-sm text-zinc-500">10 terbaru</span></div>
				{history.length ? <ul className="divide-y divide-zinc-200">{history.map((item) => {
					const open = expanded === item.id
					return <li key={item.id}><button type="button" onClick={() => { setExpanded(open ? null : item.id); setReport(open ? null : item) }} aria-expanded={open} className="flex w-full items-center gap-3 py-3 text-left hover:bg-zinc-50"><Score report={item} /><span className="min-w-0 flex-1"><span className="block truncate font-mono text-sm font-medium text-zinc-950">{item.filename}</span><span className="block text-sm text-zinc-600">{item.status === "active" ? "Sumber aktif" : item.eligible ? "Siap diaktifkan" : `${item.summary.failed} pemeriksaan gagal`}</span></span><ChevronDown className={cn("size-4 text-zinc-500 transition-transform", open ? "rotate-180" : "-rotate-90")} /></button>{open ? <div className="pb-4"><QualityResult report={item} bank={selectedBank} replace={replace} setReplace={setReplace} activating={activating} rechecking={rechecking} onActivate={() => activate(item)} onRecheck={() => recheck(item)} /></div> : null}</li>
				})}</ul> : <p className="border-b border-zinc-200 py-6 text-center text-sm text-zinc-500">Belum ada pemeriksaan untuk bank ini.</p>}
			</div>
		</section>
	)
}

function Score({ report }: { report: QualityReport }) {
	return <span className={cn("flex size-10 shrink-0 items-center justify-center border font-mono text-xs font-semibold", report.score === 100 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800")}>{report.score}</span>
}

function QualityResult({ report, bank, replace, setReplace, activating, rechecking, onActivate, onRecheck }: { report: QualityReport; bank: string; replace: boolean; setReplace: (value: boolean) => void; activating: boolean; rechecking: boolean; onActivate: () => void; onRecheck: () => void }) {
	const active = report.status === "active"
	return <div className="mt-4 border border-zinc-300 bg-white" aria-live="polite">
		<header className="flex flex-col gap-3 border-b border-zinc-200 p-4 sm:flex-row sm:items-center"><Score report={report} /><div className="min-w-0 flex-1"><h3 className="break-all font-mono font-semibold text-zinc-950">{report.filename}</h3><p className="mt-1 text-sm text-zinc-600">{active ? "Aktif dan sudah masuk ke indeks pencarian." : report.eligible ? "Seluruh pemeriksaan lulus. Dokumen siap diaktifkan." : `${report.summary.failed} dari ${report.summary.checks} pemeriksaan perlu diperbaiki.`}</p></div>{active ? <span className="inline-flex items-center gap-2 self-start border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800"><FileCheck2 className="size-4" />Sumber aktif</span> : null}</header>
		<div className="grid md:grid-cols-[minmax(0,1fr)_260px]">
			<div className="divide-y divide-zinc-200">{report.checks.map((check) => check.status === "pass" ? <div key={check.code} className="flex gap-3 px-4 py-3"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><Check className="size-3.5" /></span><div><p className="font-medium text-zinc-900">{check.label}</p><p className="mt-0.5 text-sm text-zinc-600">{check.summary}</p></div></div> : <details key={check.code} open className="px-4 py-3"><summary className="flex cursor-pointer list-none gap-3"><span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700"><X className="size-3.5" /></span><span className="min-w-0 flex-1"><span className="font-medium text-zinc-900">{check.label}</span><span className="mt-0.5 block text-sm text-zinc-600">{check.summary}</span></span><ChevronDown className="size-4 text-zinc-500" /></summary><ul className="mt-3 ml-8 list-disc space-y-1 pl-4 text-sm leading-6 text-zinc-700">{check.findings.map((finding, index) => <li key={`${check.code}-${index}`}>{finding}</li>)}</ul></details>)}</div>
			<aside className="border-t border-zinc-200 bg-zinc-50 p-4 md:border-t-0 md:border-l"><h4 className="text-sm font-semibold text-zinc-950">Ringkasan</h4><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-zinc-500">Bank tujuan</dt><dd className="font-medium text-zinc-900">{bank}</dd></div><div><dt className="text-zinc-500">Segment</dt><dd className="break-all font-mono text-zinc-900">{report.segment}</dd></div><div><dt className="text-zinc-500">Hasil</dt><dd className="text-zinc-900">{report.summary.passed} lulus · {report.summary.failed} gagal</dd></div></dl>{report.eligible && !active ? <><label className="mt-5 flex items-start gap-2 text-sm text-zinc-700"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} className="mt-0.5 size-4 accent-blue-700" />Ganti file bila nama sama</label><button type="button" onClick={onActivate} disabled={activating} className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 bg-emerald-700 px-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-zinc-300">{activating ? <Loader2 className="size-4 animate-spin" /> : <FileCheck2 className="size-4" />}{activating ? "Mengaktifkan..." : "Jadikan sumber aktif"}</button></> : null}{!report.eligible ? <button type="button" onClick={onRecheck} disabled={rechecking} className="mt-5 inline-flex min-h-10 w-full items-center justify-center gap-2 border border-zinc-300 bg-white px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-50">{rechecking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{rechecking ? "Memeriksa ulang..." : "Periksa ulang"}</button> : null}</aside>
		</div>
	</div>
}

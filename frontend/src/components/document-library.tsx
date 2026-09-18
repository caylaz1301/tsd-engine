"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlertCircle, ChevronLeft, ChevronRight, Download, Eye, FilePenLine, Pause, Play, Search, Tag, Trash2, X } from "lucide-react"
import { deactivateTsd, deleteTsd, documentDownloadUrl, documentPdfUrl, reactivateTsd, updateDocumentMetadata, type SegmentSummary } from "@/lib/api"
import { num } from "@/lib/utils"

export function DocumentLibrary({ documents }: { documents: SegmentSummary[] }) {
	const pageSize = 15
	const router = useRouter()
	const [query, setQuery] = useState("")
	const [module, setModule] = useState("")
	const [status, setStatus] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [notice, setNotice] = useState<string | null>(null)
	const [selected, setSelected] = useState<Set<string>>(new Set())
	const [editing, setEditing] = useState<SegmentSummary | null>(null)
	const [page, setPage] = useState(1)
	const [pending, startTransition] = useTransition()
	const modules = useMemo(() => [...new Set(documents.map((item) => item.module))].sort(), [documents])
	const filtered = documents.filter((item) => {
		const needle = query.trim().toLowerCase()
		return (!needle || `${item.segment} ${item.tsd_filename}`.toLowerCase().includes(needle)) && (!module || item.module === module) && (!status || item.status === status)
	})
	const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
	const currentPage = Math.min(page, pageCount)
	const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize)
	const firstVisible = filtered.length ? (currentPage - 1) * pageSize + 1 : 0
	const lastVisible = Math.min(currentPage * pageSize, filtered.length)

	useEffect(() => {
		if (!notice) return
		const timer = window.setTimeout(() => setNotice(null), 3000)
		return () => window.clearTimeout(timer)
	}, [notice])

	function mutate(item: SegmentSummary, action: "activate" | "deactivate" | "delete") {
		const destructive = action === "delete"
		const message = destructive
			? `Hapus permanen ${item.tsd_filename}? Dokumen dan indeksnya tidak dapat dipulihkan.`
			: action === "deactivate"
				? `Nonaktifkan ${item.tsd_filename}? SP dari dokumen ini akan dikeluarkan dari indeks aktif.`
				: `Aktifkan kembali ${item.tsd_filename}?`
		if (!window.confirm(message)) return
		setError(null)
		startTransition(async () => {
			try {
				if (action === "delete") await deleteTsd(item.tsd_filename)
				else if (action === "deactivate") await deactivateTsd(item.tsd_filename)
				else await reactivateTsd(item.tsd_filename)
				setNotice(
					action === "delete"
						? "Dokumen berhasil dihapus."
						: action === "deactivate"
							? "Dokumen berhasil dinonaktifkan."
							: "Dokumen berhasil diaktifkan kembali.",
				)
				router.refresh()
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : "Operasi dokumen gagal.")
			}
		})
	}

	function toggle(filename: string) {
		setSelected((current) => {
			const next = new Set(current)
			if (next.has(filename)) next.delete(filename); else next.add(filename)
			return next
		})
	}

	function bulk(action: "activate" | "deactivate" | "delete") {
		const items = documents.filter((item) => selected.has(item.tsd_filename))
		if (!items.length || !window.confirm(`Jalankan aksi pada ${items.length} dokumen terpilih?`)) return
		setError(null)
		startTransition(async () => {
			try {
				for (const item of items) {
					if (action === "delete") await deleteTsd(item.tsd_filename)
					else if (action === "deactivate" && item.status === "active") await deactivateTsd(item.tsd_filename)
					else if (action === "activate" && item.status === "inactive") await reactivateTsd(item.tsd_filename)
				}
				setSelected(new Set()); setNotice(`Aksi massal selesai untuk ${items.length} dokumen.`); router.refresh()
			} catch (cause) { setError(cause instanceof Error ? cause.message : "Aksi massal gagal.") }
		})
	}

	return (
		<section className="border border-zinc-200 bg-white">
			{error ? <div role="alert" aria-live="assertive" className="fixed top-20 right-4 z-[70] flex max-w-md items-start gap-3 border border-red-300 bg-white px-4 py-3 text-sm text-red-800 shadow-lg"><AlertCircle className="mt-0.5 size-5 shrink-0" aria-hidden /><span className="flex-1 font-medium leading-5">{error}</span><button type="button" onClick={() => setError(null)} className="-mr-1 inline-flex size-7 shrink-0 items-center justify-center text-red-700 hover:bg-red-50" aria-label="Tutup notifikasi"><X className="size-4" /></button></div> : null}
			{notice ? <div role="status" className="fixed top-20 right-4 z-[70] border border-emerald-300 bg-white px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg">{notice}</div> : null}
			{editing ? <MetadataDialog item={editing} close={() => setEditing(null)} saved={() => { setEditing(null); setNotice("Metadata dokumen diperbarui."); router.refresh() }} failed={setError} /> : null}
			<div className="flex flex-col gap-3 border-b border-zinc-200 p-4 lg:flex-row lg:items-center">
				<div className="relative min-w-0 flex-1">
					<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-500" aria-hidden />
					<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Cari nama file atau segment..." aria-label="Cari dokumen" className="h-10 w-full border border-zinc-300 bg-white pr-3 pl-9 text-sm text-zinc-900 placeholder:text-zinc-500" />
				</div>
				<select value={module} onChange={(event) => { setModule(event.target.value); setPage(1) }} aria-label="Filter modul" className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-800">
					<option value="">Semua modul</option>
					{modules.map((value) => <option key={value} value={value}>{value}</option>)}
				</select>
				<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }} aria-label="Filter status dokumen" className="h-10 border border-zinc-300 bg-white px-3 text-sm text-zinc-800">
					<option value="">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option>
				</select>
			</div>
			{selected.size ? <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm"><strong>{selected.size} dipilih</strong><button onClick={() => bulk("deactivate")} className="border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-100">Nonaktifkan</button><button onClick={() => bulk("activate")} className="border border-zinc-300 bg-white px-3 py-1.5 hover:bg-zinc-100">Aktifkan</button><button onClick={() => bulk("delete")} className="border border-red-300 bg-white px-3 py-1.5 text-red-700 hover:bg-red-50">Hapus</button></div> : null}
			<div className="thin-scroll overflow-x-auto">
				<table className="w-full min-w-[880px] border-collapse text-sm">
					<thead><tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs text-zinc-600"><th className="w-10 px-4 py-2.5"><input type="checkbox" aria-label="Pilih semua dokumen pada halaman ini" checked={visible.length > 0 && visible.every((item) => selected.has(item.tsd_filename))} onChange={(event) => setSelected((current) => { const next = new Set(current); visible.forEach((item) => event.target.checked ? next.add(item.tsd_filename) : next.delete(item.tsd_filename)); return next })} /></th><th className="px-2 py-2.5 font-medium">Dokumen</th><th className="px-3 py-2.5 font-medium">Modul</th><th className="px-3 py-2.5 text-right font-medium">SP</th><th className="px-3 py-2.5 font-medium">Status</th><th className="px-4 py-2.5 text-right font-medium">Aksi</th></tr></thead>
					<tbody className={pending ? "opacity-60" : ""}>{visible.map((item) => (
						<tr key={item.tsd_filename} className="border-b border-zinc-100 hover:bg-zinc-50">
							<td className="px-4 py-3"><input type="checkbox" checked={selected.has(item.tsd_filename)} onChange={() => toggle(item.tsd_filename)} aria-label={`Pilih ${item.tsd_filename}`} /></td>
							<td className="max-w-[430px] px-2 py-3"><Link href={`/documents/${encodeURIComponent(item.tsd_filename)}`} className="block truncate font-mono font-medium text-zinc-950 hover:text-accent" title={item.tsd_filename}>{item.tsd_filename}</Link><span className="mt-0.5 block truncate text-xs text-zinc-600" title={item.segment}>{item.segment}{item.tags?.length ? ` · ${item.tags.join(", ")}` : ""}</span></td>
							<td className="px-3 py-3"><span className="border border-zinc-200 bg-zinc-50 px-2 py-1 font-mono text-xs text-zinc-700">{item.module}</span></td>
							<td className="px-3 py-3 text-right font-mono tabular-nums text-zinc-700">{item.procedure_count == null ? "–" : num(item.procedure_count)}</td>
							<td className="px-3 py-3"><span className={item.status === "active" ? "text-emerald-700" : "text-amber-700"}>{item.status === "active" ? "Aktif" : "Nonaktif"}</span></td>
							<td className="px-4 py-3"><div className="flex justify-end gap-1">
								<IconLink href={documentPdfUrl(item.tsd_filename)} label="Preview dokumen di tab baru" newTab><Eye /></IconLink>
								<IconLink href={documentDownloadUrl(item.tsd_filename, item.updated_at)} label="Unduh DOCX terbaru"><Download /></IconLink>
								<IconLink href={`/documents/${encodeURIComponent(item.tsd_filename)}/edit`} label="Edit dokumen di browser" newTab><FilePenLine /></IconLink>
								<button type="button" onClick={() => setEditing(item)} title="Edit metadata dan tag" aria-label={`Edit metadata ${item.tsd_filename}`} className="inline-flex size-9 items-center justify-center border border-zinc-200 text-zinc-600 hover:bg-zinc-100"><Tag className="size-4" /></button>
								<button type="button" onClick={() => mutate(item, item.status === "active" ? "deactivate" : "activate")} title={item.status === "active" ? "Nonaktifkan" : "Aktifkan kembali"} aria-label={item.status === "active" ? `Nonaktifkan ${item.tsd_filename}` : `Aktifkan ${item.tsd_filename}`} className="inline-flex size-9 items-center justify-center border border-zinc-200 text-zinc-600 hover:bg-zinc-100" disabled={pending}>{item.status === "active" ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
								<button type="button" onClick={() => mutate(item, "delete")} title="Hapus permanen" aria-label={`Hapus ${item.tsd_filename}`} className="inline-flex size-9 items-center justify-center border border-zinc-200 text-red-600 hover:border-red-300 hover:bg-red-50" disabled={pending}><Trash2 className="size-4" /></button>
							</div></td>
						</tr>
					))}</tbody>
				</table>
			</div>
			{filtered.length === 0 ? <p className="px-4 py-10 text-center text-zinc-600">Tidak ada dokumen yang sesuai dengan filter.</p> : null}
			{filtered.length > 0 ? <nav aria-label="Halaman dokumen" className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
				<p className="text-zinc-600">Menampilkan <span className="font-mono text-zinc-900">{firstVisible}-{lastVisible}</span> dari <span className="font-mono text-zinc-900">{filtered.length}</span> dokumen</p>
				<div className="flex items-center gap-2"><button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="inline-flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Halaman sebelumnya" title="Halaman sebelumnya"><ChevronLeft className="size-4" /></button><span className="min-w-24 text-center text-zinc-600">Halaman <span className="font-mono text-zinc-900">{currentPage}</span> dari <span className="font-mono text-zinc-900">{pageCount}</span></span><button type="button" onClick={() => setPage((value) => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} className="inline-flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Halaman berikutnya" title="Halaman berikutnya"><ChevronRight className="size-4" /></button></div>
			</nav> : null}
		</section>
	)
}

function MetadataDialog({ item, close, saved, failed }: { item: SegmentSummary; close: () => void; saved: () => void; failed: (message: string) => void }) {
	const [filename, setFilename] = useState(item.tsd_filename)
	const [module, setModule] = useState(item.module)
	const [tags, setTags] = useState((item.tags ?? []).join(", "))
	const [saving, setSaving] = useState(false)
	async function submit(event: React.FormEvent) {
		event.preventDefault(); setSaving(true)
		try { await updateDocumentMetadata(item.tsd_filename, filename.trim(), module, tags.split(",").map((tag) => tag.trim()).filter(Boolean)); saved() }
		catch (cause) { failed(cause instanceof Error ? cause.message : "Metadata gagal disimpan.") }
		finally { setSaving(false) }
	}
	return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="metadata-title" className="w-full max-w-lg border border-zinc-300 bg-white p-5 shadow-lg"><div className="flex items-start justify-between gap-4"><div><h2 id="metadata-title" className="font-semibold text-zinc-950">Edit identitas dokumen</h2><p className="mt-1 text-xs text-zinc-600">Perubahan nama pada sumber aktif akan memperbarui indeks.</p></div><button type="button" onClick={close} className="inline-flex size-8 items-center justify-center hover:bg-zinc-100" aria-label="Tutup"><X className="size-4" /></button></div><label className="mt-5 block text-sm font-medium text-zinc-800">Nama file<input value={filename} onChange={(event) => setFilename(event.target.value)} maxLength={185} pattern="[A-Za-z0-9][A-Za-z0-9._ -]*\\.docx" required className="mt-1 h-10 w-full border border-zinc-300 px-3 font-mono text-sm" /></label><label className="mt-4 block text-sm font-medium text-zinc-800">Modul<input value={module} onChange={(event) => setModule(event.target.value)} maxLength={40} required className="mt-1 h-10 w-full border border-zinc-300 px-3 font-mono text-sm" /></label><label className="mt-4 block text-sm font-medium text-zinc-800">Tag<span className="ml-1 font-normal text-zinc-500">pisahkan dengan koma</span><input value={tags} onChange={(event) => setTags(event.target.value)} className="mt-1 h-10 w-full border border-zinc-300 px-3 text-sm" placeholder="Urgent, Review" /></label><div className="mt-6 flex justify-end gap-2"><button type="button" onClick={close} className="min-h-10 border border-zinc-300 px-4 hover:bg-zinc-100">Batal</button><button disabled={saving} className="min-h-10 bg-accent px-4 font-medium text-white hover:bg-blue-800 disabled:opacity-60">{saving ? "Menyimpan..." : "Simpan perubahan"}</button></div></form></div>
}

function IconLink({ href, label, children, newTab = false }: { href: string; label: string; children: React.ReactNode; newTab?: boolean }) {
	return <a href={href} target={newTab ? "_blank" : undefined} rel={newTab ? "noreferrer" : undefined} title={label} aria-label={label} className="inline-flex size-9 items-center justify-center border border-zinc-200 text-zinc-600 hover:bg-zinc-100 [&_svg]:size-4">{children}</a>
}

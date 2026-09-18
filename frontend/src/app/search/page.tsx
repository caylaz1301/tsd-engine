import Link from "next/link"
import {
	search,
	getModules,
	getSegments,
	type SearchResponse,
	type ModuleSummary,
	type SpStatus,
} from "@/lib/api"
import { num } from "@/lib/utils"
import {
	EmptyState,
	ErrorPanel,
	LowConfidenceBadge,
	Mono,
	SectionHeading,
	StatusBadge,
} from "@/components/ui"

export const dynamic = "force-dynamic"

const STATUS_TABS: { value: string; label: string }[] = [
	{ value: "", label: "Semua" },
	{ value: "matched", label: "Terdokumentasi" },
	{ value: "doc_only", label: "TSD saja" },
	{ value: "sql_only", label: "Tanpa TSD" },
	{ value: "sql_variant", label: "Salinan arsip" },
]

const PAGE_SIZE = 20

type Params = {
	q?: string
	status?: string
	segment?: string
	module?: string
	hide_variants?: string
	offset?: string
}

function buildHref(base: Params, patch: Partial<Params>): string {
	const merged: Params = { ...base, ...patch }
	const p = new URLSearchParams()
	if (merged.q) p.set("q", merged.q)
	if (merged.status) p.set("status", merged.status)
	if (merged.segment) p.set("segment", merged.segment)
	if (merged.module) p.set("module", merged.module)
	if (merged.hide_variants === "false") p.set("hide_variants", "false")
	if (merged.offset && merged.offset !== "0") p.set("offset", merged.offset)
	return `/search?${p.toString()}`
}

export default async function SearchPage({
	searchParams,
}: {
	// Next 16 mengirim searchParams sebagai Promise.
	searchParams: Promise<Params>
}) {
	const sp = await searchParams
	const q = (sp.q ?? "").trim()
	const status = sp.status ?? ""
	const segment = sp.segment ?? ""
	const selectedModule = sp.module ?? ""
	// Salinan arsip disembunyikan secara bawaan; 1.381 objek bertanggal akan
	// menenggelamkan hasil yang relevan kalau ikut ditampilkan.
	const hideVariants = sp.hide_variants !== "false" && status !== "sql_variant"
	const offset = Math.max(0, Number.parseInt(sp.offset ?? "0", 10) || 0)

	if (!q && !selectedModule) {
		let documentCount = 0
		try {
			documentCount = (await getSegments()).filter((item) => item.status === "active").length
		} catch {
			// Empty search tetap dapat dibuka ketika backend sedang start ulang.
		}
		return (
			<div className="flex flex-col gap-6">
				<EmptyState
					title="Mulai dari command palette"
					description="Tekan ⌘K, lalu ketik nama stored procedure, tabel, atau segment. Salinan arsip disembunyikan secara bawaan agar hasil utama lebih mudah ditemukan."
				/>
				<section className="border border-zinc-200 bg-white p-4 sm:p-6">
					<SectionHeading>Jalur cepat</SectionHeading>
					<div className="divide-y divide-zinc-100 border-y border-zinc-200">
						<Link
							href="/review"
							className="flex min-h-14 items-center justify-between gap-4 py-3 hover:bg-zinc-50"
						>
							<span>
								<span className="block font-medium text-zinc-900">
									Perlu ditinjau
								</span>
								<span className="mt-0.5 block text-xs text-zinc-500">
									Tanpa TSD, TSD saja, confidence rendah.
								</span>
							</span>
							<span className="font-mono text-sm text-zinc-500">/review</span>
						</Link>
						<Link
							href="/search?q=collateral"
							className="flex min-h-14 items-center justify-between gap-4 py-3 hover:bg-zinc-50"
						>
							<span>
								<span className="block font-medium text-zinc-900">
									Contoh collateral
								</span>
								<span className="mt-0.5 block text-xs text-zinc-500">
									Cek urutan hasil tanpa salinan arsip.
								</span>
							</span>
							<span className="font-mono text-sm text-zinc-500">collateral</span>
						</Link>
						<Link
							href="/segments"
							className="flex min-h-14 items-center justify-between gap-4 py-3 hover:bg-zinc-50"
						>
							<span>
								<span className="block font-medium text-zinc-900">
									Dokumen TSD
								</span>
								<span className="mt-0.5 block text-xs text-zinc-500">
									Masuk dari segment pelaporan.
								</span>
							</span>
							<span className="font-mono text-sm text-zinc-500">{documentCount} dokumen</span>
						</Link>
						<Link
							href="/tables/REGLA_COMMON.TBLM_COMMONCODEDETAIL"
							className="flex min-h-14 items-center justify-between gap-4 py-3 hover:bg-zinc-50"
						>
							<span>
								<span className="block font-medium text-zinc-900">
									Tabel populer
								</span>
								<span className="mt-0.5 block text-xs text-zinc-500">
									Lihat lineage tabel yang sering dipakai.
								</span>
							</span>
							<span className="font-mono text-sm text-zinc-500">730 SP</span>
						</Link>
					</div>
				</section>
			</div>
		)
	}

	let res: SearchResponse
	let modules: ModuleSummary[]
	try {
		[res, modules] = await Promise.all([search({
			q,
			status: status || undefined,
			segment: segment || undefined,
			module: selectedModule || undefined,
			hideVariants,
			limit: PAGE_SIZE,
			offset,
		}), getModules()])
	} catch (e) {
		return (
			<ErrorPanel
				title="Pencarian gagal"
				detail={e instanceof Error ? e.message : String(e)}
				hint={
					<>
						Pastikan backend hidup:{" "}
						<Mono>uvicorn app.main:app --reload --port 8000</Mono>
					</>
				}
			/>
		)
	}

	const from = res.total === 0 ? 0 : offset + 1
	const to = Math.min(offset + PAGE_SIZE, res.total)

	return (
		<div className="flex flex-col gap-5">
			<div>
					<h1 className="text-lg font-semibold tracking-tight text-zinc-900">
						{q ? <>Hasil untuk <Mono className="text-lg">{q}</Mono></> : <>Semua SP modul <Mono className="text-lg">{selectedModule}</Mono></>}
				</h1>
				<p className="mt-1 text-zinc-500">
					{res.total === 0
						? "Tidak ada yang cocok"
						: `Menampilkan ${num(from)}–${num(to)} dari ${num(res.total)} hasil`}
					{hideVariants ? " · salinan arsip disembunyikan" : null}
				</p>
			</div>

			<form action="/search" className="flex flex-wrap items-end gap-3 border border-zinc-200 bg-white p-3">
				<input type="hidden" name="q" value={q} /><input type="hidden" name="status" value={status} />
				<label className="min-w-44"><span className="mb-1 block text-xs font-medium text-zinc-600">Modul</span><select name="module" defaultValue={selectedModule} className="h-10 w-full border border-zinc-300 bg-white px-3 text-sm text-zinc-800"><option value="">Semua modul</option>{modules.map((item) => <option key={item.module} value={item.module}>{item.module} ({num(item.sp_count)})</option>)}</select></label>
				<button type="submit" className="min-h-10 border border-zinc-300 bg-zinc-50 px-4 text-sm font-medium text-zinc-800 hover:bg-zinc-100">Terapkan filter</button>
				{selectedModule ? <Link href={buildHref(sp, { module: "", offset: "0" })} className="inline-flex min-h-10 items-center text-sm text-zinc-600 hover:text-zinc-950">Reset modul</Link> : null}
			</form>

			<div className="thin-scroll flex overflow-x-auto border-b border-zinc-200">
				{STATUS_TABS.map((tab) => {
					const activeTab = status === tab.value
					return (
						<Link
							key={tab.value || "all"}
							href={buildHref(sp, { status: tab.value, offset: "0" })}
							className={
								activeTab
									? "-mb-px flex min-h-11 shrink-0 items-center border-b-2 border-accent px-3 font-medium text-zinc-950"
									: "-mb-px flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950"
							}
						>
							{tab.label}
						</Link>
					)
				})}
				<div className="ml-auto flex min-h-11 shrink-0 items-center gap-3 px-2 text-sm">
						{segment ? (
						<Link
							href={buildHref(sp, { segment: "", offset: "0" })}
							className="text-zinc-500 hover:text-zinc-900"
						>
							segment: <Mono>{segment}</Mono> ×
						</Link>
						) : null}
						{selectedModule ? <span className="font-mono text-xs text-zinc-600">modul {selectedModule}</span> : null}
					<Link
						href={buildHref(sp, {
							hide_variants: hideVariants ? "false" : "true",
							offset: "0",
						})}
						className="text-zinc-500 hover:text-zinc-900"
					>
						{hideVariants ? "Tampilkan salinan arsip" : "Sembunyikan salinan arsip"}
					</Link>
				</div>
			</div>

			{res.results.length === 0 ? (
				<EmptyState
					title={`Tidak ada hasil untuk "${q}"`}
					description="Coba kata yang lebih pendek, atau tampilkan salinan arsip kalau yang dicari objek bertanggal."
				/>
			) : (
				<ul className="divide-y divide-zinc-100 border-y border-zinc-200 bg-white">
					{res.results.map((r) => (
						<li key={r.sp_key} className="px-3 py-3.5 hover:bg-zinc-50">
							<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<Link
									href={`/sp/${encodeURIComponent(r.sp_name)}`}
								className="font-mono text-sm font-semibold break-all text-zinc-950 hover:text-accent hover:underline"
								>
									{r.sp_name}
								</Link>
								<StatusBadge status={r.status as SpStatus} />
								{r.confidence === "low" ? <LowConfidenceBadge /> : null}
								{r.variant ? (
									<span className="text-xs text-zinc-500">
										salinan arsip dari{" "}
								<Mono>{r.base_name}</Mono>
									</span>
								) : null}
							</div>

								<div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-zinc-600">
									<span className="border border-zinc-200 bg-zinc-50 px-1.5 font-mono text-xs text-zinc-700">{r.module}</span>
								{r.segment ? (
									<span>
									TSD <Mono>{r.segment}</Mono>
									</span>
								) : (
									<span className="text-amber-700">tidak ada di TSD</span>
								)}
								{r.sql_database ? (
									<span>
									db <Mono>{r.sql_database}</Mono>
									</span>
								) : null}
								{r.body_lines ? (
									<span className="tabular-nums">{num(r.body_lines)} baris</span>
								) : null}
								{r.image_count > 0 ? (
									<span className="tabular-nums">{r.image_count} diagram</span>
								) : null}
								{r.called_by ? (
									<span>
										dipanggil oleh{" "}
									<Mono>{r.called_by}</Mono>
									</span>
								) : null}
							</div>
						</li>
					))}
				</ul>
			)}

			{res.total > PAGE_SIZE ? (
				<div className="flex items-center justify-between">
					{offset > 0 ? (
						<Link
							href={buildHref(sp, {
								offset: String(Math.max(0, offset - PAGE_SIZE)),
							})}
							className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 py-2 font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100"
						>
							← Sebelumnya
						</Link>
					) : (
						<span />
					)}
					{to < res.total ? (
						<Link
							href={buildHref(sp, { offset: String(offset + PAGE_SIZE) })}
							className="inline-flex min-h-11 items-center border border-zinc-300 bg-white px-4 py-2 font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100"
						>
							Berikutnya →
						</Link>
					) : (
						<span />
					)}
				</div>
			) : null}
		</div>
	)
}

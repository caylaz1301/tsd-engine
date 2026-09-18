import Link from "next/link"
import { ArrowRight, CheckCircle2, FileSearch, ShieldCheck } from "lucide-react"
import { ErrorPanel } from "@/components/ui"
import { getStats, type Stats } from "@/lib/api"
import { num } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function HomePage() {
	let stats: Stats
	try {
		stats = await getStats()
	} catch (e) {
		return <ErrorPanel title="Indeks tidak bisa dibaca" detail={e instanceof Error ? e.message : String(e)} />
	}

	const matched = stats.by_status.matched ?? 0
	const variants = stats.by_status.sql_variant ?? 0
	const primary = Math.max(0, stats.totals.sp_total - variants)
	const coverage = primary ? Math.round(matched / primary * 1000) / 10 : 0
	const quality = stats.quality

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<h1 className="text-xl font-semibold text-zinc-950">Ringkasan sumber TSD</h1>
					<p className="mt-1 max-w-[72ch] text-zinc-600">Gambaran berdasarkan sumber yang tersedia saat ini, bukan keseluruhan database perusahaan.</p>
				</div>
				<p className="text-sm text-zinc-600"><span className="font-mono text-zinc-900">{stats.totals.documents}</span> dokumen · <span className="font-mono text-zinc-900">{stats.totals.sql_files}</span> skrip SQL</p>
			</header>

			<section className="grid border border-zinc-200 bg-white lg:grid-cols-2">
				<div className="border-b border-zinc-200 p-5 lg:border-r lg:border-b-0 sm:p-6">
					<div className="flex items-start justify-between gap-4">
						<div><h2 className="flex items-center gap-2 font-semibold text-zinc-950"><FileSearch className="size-5 text-blue-700" aria-hidden />Cakupan stored procedure</h2><p className="mt-1 text-sm text-zinc-600">SP utama yang sudah cocok dengan dokumen TSD.</p></div>
						<span className="font-mono text-2xl font-semibold text-blue-700 tabular-nums">{coverage}%</span>
					</div>
					<div className="mt-6 h-3 overflow-hidden bg-zinc-200" role="img" aria-label={`${coverage}% SP utama memiliki dokumen TSD`}><div className="h-full bg-blue-700 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${coverage}%` }} /></div>
					<p className="mt-3 text-sm text-zinc-700"><strong className="font-mono font-semibold text-zinc-950">{num(matched)}</strong> dari <span className="font-mono text-zinc-950">{num(primary)}</span> SP utama terhubung ke TSD.</p>
					<Link href="/search" className="mt-5 inline-flex min-h-10 items-center gap-2 border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100">Cari SP dan diagram<ArrowRight className="size-4" aria-hidden /></Link>
				</div>

				<div className="p-5 sm:p-6">
					<div className="flex items-start justify-between gap-4">
						<div><h2 className="flex items-center gap-2 font-semibold text-zinc-950"><ShieldCheck className="size-5 text-emerald-700" aria-hidden />Kelulusan quality checker</h2><p className="mt-1 text-sm text-zinc-600">Pemeriksaan yang memperoleh skor penuh.</p></div>
						<span className="font-mono text-2xl font-semibold text-emerald-700 tabular-nums">{quality.pass_rate}%</span>
					</div>
					<div className="mt-6 h-3 overflow-hidden bg-zinc-200" role="img" aria-label={`${quality.pass_rate}% pemeriksaan memperoleh skor 100%`}><div className="h-full bg-emerald-700 transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${quality.pass_rate}%` }} /></div>
					<p className="mt-3 text-sm text-zinc-700"><strong className="font-mono font-semibold text-zinc-950">{quality.passed}</strong> dari <span className="font-mono text-zinc-950">{quality.reports}</span> pemeriksaan mencapai 100%.</p>
					<Link href="/segments" className="mt-5 inline-flex min-h-10 items-center gap-2 border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-100">Buka quality checker<ArrowRight className="size-4" aria-hidden /></Link>
				</div>
			</section>

			<section className="border border-zinc-200 bg-white p-5 sm:p-6">
				<div className="flex flex-col gap-2 border-b border-zinc-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
					<div><h2 className="font-semibold text-zinc-950">Cakupan TSD per modul</h2><p className="mt-1 text-sm text-zinc-600">Bagian berwarna menunjukkan proporsi SP utama yang telah cocok dengan TSD.</p></div>
					<div className="flex items-center gap-4 text-xs text-zinc-600"><span className="flex items-center gap-1.5"><i className="size-2.5 bg-blue-700" />Ada TSD</span><span className="flex items-center gap-1.5"><i className="size-2.5 bg-zinc-200" />Belum cocok</span></div>
				</div>
				<div className="mt-5 space-y-4">
					{stats.modules.map((item) => {
						const percent = item.total ? Math.round(item.matched / item.total * 1000) / 10 : 0
						return <div key={item.module} className="grid items-center gap-2 sm:grid-cols-[110px_minmax(0,1fr)_150px]">
							<Link href={`/search?module=${encodeURIComponent(item.module)}`} className="font-mono text-sm font-medium text-zinc-900 hover:text-blue-700 hover:underline">{item.module}</Link>
							<div className="h-2.5 overflow-hidden bg-zinc-200" role="img" aria-label={`${item.module}: ${percent}% memiliki TSD`}><div className="h-full bg-blue-700" style={{ width: `${percent}%` }} /></div>
							<p className="text-sm text-zinc-600 sm:text-right"><span className="font-mono font-semibold text-zinc-900">{percent}%</span> · {num(item.matched)}/{num(item.total)}</p>
						</div>
					})}
				</div>
				<div className="mt-6 flex items-start gap-2 border-t border-zinc-200 pt-4 text-sm text-zinc-600"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden /><p>Persentase berubah otomatis saat dokumen TSD atau skrip SQL ditambahkan, dinonaktifkan, atau diperbarui.</p></div>
			</section>
		</div>
	)
}

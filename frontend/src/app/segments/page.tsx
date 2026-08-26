import Link from "next/link"
import { getSegments, type SegmentSummary } from "@/lib/api"
import { num } from "@/lib/utils"
import { ErrorPanel, Mono, SectionHeading } from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function SegmentsPage() {
	let segments: SegmentSummary[]
	try {
		segments = await getSegments()
	} catch (e) {
		return (
			<ErrorPanel
				title="Daftar dokumen tidak bisa dibaca"
				detail={e instanceof Error ? e.message : String(e)}
			/>
		)
	}

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h1 className="text-lg font-semibold tracking-tight text-zinc-900">
					Dokumen TSD
				</h1>
				<p className="mt-1 text-zinc-600">
					Setiap dokumen mewakili satu segment pelaporan.
				</p>
			</div>

			<section>
				<SectionHeading hint={`${segments.length} dokumen`}>
					Terindeks
				</SectionHeading>
				<ul className="divide-y divide-zinc-100 border-y border-zinc-200">
					{segments.map((s) => (
						<li key={s.tsd_filename} className="py-3">
							<Link
								href={`/search?q=${encodeURIComponent(s.segment)}&segment=${encodeURIComponent(s.segment)}`}
								className="font-mono text-[13px] font-medium break-all text-zinc-900 hover:text-accent hover:underline"
							>
								{s.segment}
							</Link>
							<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-zinc-500">
								<Mono className="text-xs break-all">{s.tsd_filename}</Mono>
								{s.procedure_count !== null ? (
									<span className="tabular-nums">
										{num(s.procedure_count)} SP di dokumen
									</span>
								) : null}
								{s.indexed_sp !== null ? (
									<span className="tabular-nums">
										{num(s.indexed_sp)} terindeks
									</span>
								) : null}
								{s.sharepoint_url ? (
									<a
										href={s.sharepoint_url}
										target="_blank"
										rel="noreferrer"
										className="text-accent hover:underline"
									>
										buka di SharePoint
									</a>
								) : (
									<span className="text-zinc-400">tautan belum tersedia</span>
								)}
							</div>
						</li>
					))}
				</ul>
			</section>
		</div>
	)
}

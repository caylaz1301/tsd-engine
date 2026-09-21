import Link from "next/link"
import { notFound } from "next/navigation"
import { FileText, Layers } from "lucide-react"
import {
	getSp,
	parseParameters,
	type SpDetail,
} from "@/lib/api"
import { num } from "@/lib/utils"
import { DiagramViewer } from "@/components/diagram-viewer"
import { SpAnalysis } from "@/components/sp-analysis"
import {
	ErrorPanel,
	KeyValue,
	LowConfidenceBadge,
	Mono,
	SectionHeading,
	StatusBadge,
	TableChip,
} from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function SpPage({
	params,
}: {
	// Next 16 mengirim params sebagai Promise.
	params: Promise<{ name: string }>
}) {
	const { name } = await params
	const decoded = decodeURIComponent(name)

	let sp: SpDetail | null
	try {
		sp = await getSp(decoded)
	} catch (e) {
		return (
			<ErrorPanel
				title="Detail prosedur tidak bisa dibaca"
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
	if (!sp) notFound()

	const parameters = parseParameters(sp.parameters)
	const multiDoc = sp.occurrences.length > 1
	const unavailableInDocument = sp.occurrences.length > 0 && sp.occurrences.every(
		(o) => o.model_status === "not_available" && o.flow_status === "not_available",
	)

	return (
		<div className="flex flex-col gap-6">
			<div>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
					<h1 className="font-mono text-lg font-semibold break-all text-zinc-900">
						{sp.sp_name}
					</h1>
					<StatusBadge status={sp.status} />
					{sp.confidence === "low" ? <LowConfidenceBadge /> : null}
					{sp.variant ? (
						<span className="text-xs text-zinc-500">
							salinan arsip dari <Mono className="text-xs">{sp.base_name}</Mono>
						</span>
					) : null}
				</div>

				{multiDoc ? (
					<p className="mt-3 text-sm text-zinc-600">
						Tersedia pada <span className="font-mono text-zinc-900">{sp.occurrences.length}</span> dokumen TSD.
					</p>
				) : null}
			</div>

			<SpAnalysis name={sp.sp_name} />

			<div className="grid gap-8 lg:grid-cols-[340px_minmax(0,1fr)]">
				{/* ---------------------------------------------- rail metadata */}
				<aside className="grid min-w-0 gap-6 sm:grid-cols-2 lg:flex lg:flex-col lg:border-r lg:border-zinc-200 lg:pr-6">
					<div>
						<SectionHeading>Lokasi kode</SectionHeading>
						<dl className="divide-y divide-zinc-100">
							<KeyValue label="Database">
								{sp.sql_database ? (
									<Mono title={sp.sql_database}>{sp.sql_database}</Mono>
								) : (
									<span className="text-amber-700">tidak ditemukan di skrip</span>
								)}
							</KeyValue>
							{sp.sql_file ? (
								<KeyValue label="Berkas">
									<span className="flex min-w-0" title={`${sp.sql_file}${sp.sql_line ? `:${sp.sql_line}` : ""}`}><Mono className="min-w-0 truncate">{sp.sql_file}</Mono>{sp.sql_line ? <span className="shrink-0 font-mono text-sm text-zinc-600 tabular-nums">:{num(sp.sql_line)}</span> : null}</span>
								</KeyValue>
							) : null}
							<KeyValue label="Panjang">
								<span className="font-mono tabular-nums">
									{sp.body_lines ? `${num(sp.body_lines)} baris` : "–"}
								</span>
							</KeyValue>
							<KeyValue label="Parameter">
								{parameters.length === 0 ? (
									<span className="text-zinc-500">tanpa parameter</span>
								) : (
									<ul className="flex flex-col gap-0.5">
										{parameters.map((p) => (
										<li key={p.name} className="truncate" title={`${p.name} ${p.type}`}>
												<Mono>{p.name}</Mono>{" "}
												<span className="text-xs font-medium text-zinc-600 uppercase">
													{p.type}
												</span>
											</li>
										))}
									</ul>
								)}
							</KeyValue>
						</dl>
					</div>

					<div>
						<SectionHeading>Dokumen TSD</SectionHeading>
						{sp.occurrences.length === 0 ? (
							<p className="text-amber-700">
								Tidak ada dokumen TSD yang membahas prosedur ini.
							</p>
						) : (
							<ul className="flex flex-col gap-3">
								{sp.occurrences.map((o) => (
									<li key={`${o.segment}-${o.tsd_filename}`}>
										<Link
											href={`/documents/${encodeURIComponent(o.tsd_filename)}`}
											className="flex items-start gap-1.5 hover:text-accent"
											title={`Buka ${o.tsd_filename}`}
										>
											<Layers
												className="mt-0.5 size-3.5 shrink-0 text-zinc-400"
												aria-hidden
											/>
											<Mono className="block min-w-0 truncate">{o.segment}</Mono>
										</Link>
									<p className="mt-1 truncate pl-5 text-sm text-zinc-600" title={o.tsd_filename}>
											{o.tsd_filename}
										</p>
										{o.section_model ? (
										<p className="mt-0.5 pl-5 font-mono text-xs text-zinc-500">
												{o.section_model.split(" – ")[0]}
												{o.heading_level ? ` · heading ${o.heading_level}` : ""}
											</p>
										) : null}
									</li>
								))}
							</ul>
						)}
							{sp.document ? <Link href={`/documents/${encodeURIComponent(sp.document.tsd_filename)}`} className="mt-3 inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 text-sm font-medium hover:border-zinc-400 hover:bg-zinc-100"><FileText className="size-3.5" aria-hidden />Baca dokumen TSD</Link> : null}
					</div>

					{sp.called_by || sp.calls_documented.length > 0 ? (
						<div>
							<SectionHeading>Keterkaitan</SectionHeading>
							{sp.called_by ? (
								<KeyValue label="Dipanggil oleh">
									<Link
										href={`/sp/${encodeURIComponent(sp.called_by)}`}
										className="hover:text-accent hover:underline"
									>
										<Mono className="block truncate" title={sp.called_by}>{sp.called_by}</Mono>
									</Link>
								</KeyValue>
							) : null}
							{sp.calls_documented.length > 0 ? (
								<KeyValue label="Memanggil">
									<ul className="flex flex-col gap-0.5">
										{sp.calls_documented.map((c) => (
											<li key={c.sp_name}>
												<Link
													href={`/sp/${encodeURIComponent(c.sp_name)}`}
													className="hover:text-accent hover:underline"
												>
												<Mono className="block truncate" title={c.sp_name}>{c.sp_name}</Mono>
												</Link>
											</li>
										))}
									</ul>
								</KeyValue>
							) : null}
						</div>
					) : null}

					{sp.archive_copies.length > 0 ? (
						<div>
							<SectionHeading hint={`${sp.archive_copies.length} objek`}>
								Salinan arsip
							</SectionHeading>
							<ul className="flex flex-col">
								{sp.archive_copies.map((c) => (
									<li
										key={c.sp_name}
										className="flex items-baseline justify-between gap-2 border-b border-zinc-100 py-1"
									>
										<Link
											href={`/sp/${encodeURIComponent(c.sp_name)}`}
											className="min-w-0 flex-1 overflow-hidden hover:text-accent hover:underline"
										>
										<span className="group relative block min-w-0">
											<Mono className="block truncate text-xs">{c.sp_name}</Mono>
											<span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 mb-1 hidden max-w-80 border border-zinc-300 bg-zinc-950 px-2 py-1.5 font-mono text-xs break-all text-white shadow-sm group-hover:block group-focus-within:block">{c.sp_name}</span>
										</span>
										</Link>
									<span className="shrink-0 font-mono text-xs text-zinc-500 tabular-nums">
											{c.body_lines ? num(c.body_lines) : "–"}
										</span>
									</li>
								))}
							</ul>
						</div>
					) : null}
				</aside>

				{/* ------------------------------------------------ isi utama */}
				<div className="flex min-w-0 flex-col gap-8">
					<section>
						<SectionHeading
							hint={
								sp.images.length > 0
									? `${sp.images.length} gambar dari dokumen TSD`
									: undefined
							}
						>
							Diagram dan penjelasan proses
						</SectionHeading>
						<DiagramViewer
							images={sp.images}
							fallbackExplanation={sp.explanation}
							unavailableInDocument={unavailableInDocument}
						/>
					</section>

					<section className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-2">
						<div className="min-w-0">
							<SectionHeading hint={`${sp.source_tables.length}`}>
								Tabel sumber
							</SectionHeading>
							{sp.source_tables.length === 0 ? (
								<p className="text-zinc-500">Tidak terdeteksi.</p>
							) : (
								<div>
									{sp.source_tables.map((t) => (
										<TableChip key={t.table_name} name={t.table_name} />
									))}
								</div>
							)}
						</div>
						<div className="min-w-0">
							<SectionHeading hint={`${sp.target_tables.length}`}>
								Tabel tujuan
							</SectionHeading>
							{sp.target_tables.length === 0 ? (
								<p className="text-amber-700">
									Tidak ada tabel tujuan terdeteksi.
								</p>
							) : (
								<div>
									{sp.target_tables.map((t) => (
										<TableChip
											key={t.table_name}
											name={t.table_name}
											operations={t.operations}
										/>
									))}
								</div>
							)}
						</div>
					</section>
				</div>
			</div>
		</div>
	)
}

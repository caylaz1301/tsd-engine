import { getSegments, type SegmentSummary } from "@/lib/api"
import { ErrorPanel } from "@/components/ui"
import { DocumentUpload } from "@/components/document-upload"
import { DocumentLibrary } from "@/components/document-library"
import { Download } from "lucide-react"

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
			<div className="flex flex-col gap-3 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
				<div><h1 className="text-xl font-semibold tracking-tight text-zinc-900">Repository Dokumen TSD</h1>
				<p className="mt-1 max-w-3xl text-zinc-600">
					Periksa, baca, revisi, dan atur sumber pencarian dari satu tempat. Dokumen baru tidak memengaruhi indeks sebelum seluruh pemeriksaan lulus.
				</p></div>
				<div className="flex flex-wrap items-center gap-4 text-sm">
					<a href="/templates/NTT_Data_Draft_TSD_Template.docx" download className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100"><Download className="size-4" aria-hidden />Unduh template TSD</a>
					<div><span className="block font-mono text-lg font-semibold text-zinc-950">{segments.filter((item) => item.status === "active").length}</span><span className="text-zinc-600">aktif</span></div>
					<div><span className="block font-mono text-lg font-semibold text-zinc-950">{segments.filter((item) => item.status === "inactive").length}</span><span className="text-zinc-600">nonaktif</span></div>
				</div>
			</div>

			<DocumentLibrary documents={segments} />

			<DocumentUpload />
		</div>
	)
}

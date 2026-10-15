import { getSegments, type SegmentSummary } from "@/lib/api"
import { ErrorPanel } from "@/components/ui"
import { DocumentLibrary } from "@/components/document-library"
import { DocumentUpload } from "@/components/document-upload"
import Link from "next/link"
import { Download, Settings2 } from "lucide-react"
import { getSelectedBank } from "@/lib/bank-context"

export const dynamic = "force-dynamic"

export default async function SegmentsPage() {
	let segments: SegmentSummary[]
	const selectedBank = await getSelectedBank()
	try {
		segments = await getSegments(selectedBank)
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
						Baca, revisi, dan atur dokumen TSD untuk bank {selectedBank}. Quality checker tersedia sebagai pemeriksaan terpisah sebelum dokumen diteruskan ke pengelola sumber.
				</p></div>
				<div className="flex flex-wrap items-center gap-3 text-sm">
					<a href="/templates/NTT_Data_Draft_TSD_Template.docx" download className="inline-flex min-h-10 items-center gap-2 border border-zinc-300 bg-white px-3 py-2 font-medium text-zinc-800 hover:border-zinc-400 hover:bg-zinc-100"><Download className="size-4" aria-hidden />Unduh template TSD</a>
					<Link href="/admin/sources" className="inline-flex min-h-10 items-center gap-2 bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-800"><Settings2 className="size-4" aria-hidden />Kelola sumber</Link>
					<div><span className="block font-mono text-lg font-semibold text-zinc-950">{segments.filter((item) => item.status === "active").length}</span><span className="text-zinc-600">aktif</span></div>
					<div><span className="block font-mono text-lg font-semibold text-zinc-950">{segments.filter((item) => item.status === "inactive").length}</span><span className="text-zinc-600">nonaktif</span></div>
				</div>
			</div>

			<DocumentLibrary documents={segments} selectedBank={selectedBank} />

			<DocumentUpload key={selectedBank} selectedBank={selectedBank} />
		</div>
	)
}

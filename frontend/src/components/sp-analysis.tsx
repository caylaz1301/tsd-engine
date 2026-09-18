"use client"

import { useEffect, useState } from "react"
import { BrainCircuit, RotateCcw } from "lucide-react"
import { analyzeSp, type AiAnalysisResponse } from "@/lib/api"

export function SpAnalysis({ name }: { name: string }) {
	const [result, setResult] = useState<AiAnalysisResponse | null>(null)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		void run()
	// Nama SP adalah satu-satunya pemicu analisis baru.
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [name])

	async function run(refresh = false) {
		setLoading(true)
		setError(null)
		try {
			setResult(await analyzeSp(name, refresh))
		} catch (err) {
			setError(err instanceof Error ? err.message : "Analisis tidak dapat dibuat.")
		} finally {
			setLoading(false)
		}
	}

	if (!result) {
		return (
			<div className="border-y border-zinc-200 bg-zinc-50 px-4 py-5 sm:px-5" aria-live="polite" aria-busy={loading}>
				<div className="flex min-w-0 gap-3">
					<BrainCircuit className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
					<div className="min-w-0 flex-1">
						<h2 className="font-semibold text-zinc-900">Analisis AI</h2>
						{error ? (
							<div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
								<p role="alert" className="max-w-2xl text-sm text-red-700">{error}</p>
								<button type="button" onClick={() => run()} className="inline-flex min-h-9 items-center gap-2 border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100">
									<RotateCcw className="size-3.5" aria-hidden />
									Coba lagi
								</button>
							</div>
						) : (
							<div className="mt-3 max-w-3xl space-y-2">
								<p className="text-sm text-zinc-600">Menyusun ringkasan dari dokumen dan relasi tabel...</p>
								<div className="h-3 w-full max-w-2xl animate-pulse rounded bg-zinc-200" />
								<div className="h-3 w-3/4 max-w-xl animate-pulse rounded bg-zinc-200" />
							</div>
						)}
					</div>
				</div>
			</div>
		)
	}

	const { analysis } = result
	return (
		<section className="border-y border-zinc-200 bg-white py-5" aria-live="polite">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-2">
					<BrainCircuit className="size-5 text-accent" aria-hidden />
					<h2 className="font-semibold text-zinc-900">Analisis AI</h2>
					<span className="rounded border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600">
						keyakinan {analysis.confidence}
					</span>
				</div>
			</div>

			<div className="mt-4 max-w-3xl">
				<p className="text-[16px] leading-7 text-zinc-800">{analysis.summary}</p>
				<p className="mt-3 text-sm leading-6 text-zinc-700"><strong className="font-semibold text-zinc-900">Tujuan:</strong> {analysis.purpose}</p>
			</div>

			<div className="mt-6 grid gap-x-8 gap-y-6 md:grid-cols-2">
				<AnalysisList title="Alur yang teridentifikasi" items={analysis.process_steps} ordered />
				<AnalysisList title="Perlu diverifikasi" items={analysis.review_notes} empty="Tidak ada catatan tambahan." />
				<AnalysisList title="Data dibaca" items={analysis.data_reads} mono empty="Tidak terdeteksi dari indeks." />
				<AnalysisList title="Data ditulis" items={analysis.data_writes} mono empty="Tidak ada operasi tulis yang terdeteksi." />
			</div>
			<p className="mt-5 text-xs text-zinc-500">Dibuat lokal dengan {result.model}. Hasil AI perlu dicocokkan dengan TSD dan SQL sumber.</p>
		</section>
	)
}

function AnalysisList({ title, items, ordered = false, mono = false, empty = "Bukti belum cukup." }: { title: string; items: string[]; ordered?: boolean; mono?: boolean; empty?: string }) {
	const Tag = ordered ? "ol" : "ul"
	const cleanItems = ordered
		? items.map((item) => item.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim()).filter(Boolean)
		: items
	return (
		<div className="min-w-0">
			<h3 className="border-b border-zinc-200 pb-2 text-sm font-semibold text-zinc-900">{title}</h3>
			{cleanItems.length === 0 ? <p className="pt-2 text-sm text-zinc-500">{empty}</p> : (
				<Tag className={`mt-2 space-y-2 text-sm leading-6 text-zinc-700 ${ordered ? "list-decimal pl-5" : "list-disc pl-5"}`}>
					{cleanItems.map((item, index) => <li key={`${item}-${index}`} className={mono ? "font-mono text-xs break-all text-zinc-800" : "pl-1"}>{item}</li>)}
				</Tag>
			)}
		</div>
	)
}

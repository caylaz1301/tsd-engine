"use client"

import { useState } from "react"
import { ExternalLink, Minus, Plus, RotateCcw } from "lucide-react"
import { imageUrl, type SpImage } from "@/lib/api"
import { cn } from "@/lib/utils"

const KIND_LABEL: Record<SpImage["kind"], string> = {
	data_model: "Data Model",
	data_flow: "Data Flow",
}

/**
 * Penampil diagram TSD.
 *
 * Sebagian diagram data model berupa teks monospace yang lebar, jadi gambar
 * TIDAK diperkecil agar pas di layar. Gambar ditampilkan pada ukuran asli di
 * dalam wadah yang bisa digeser, dengan kendali perbesaran manual, supaya
 * tulisan di dalamnya tetap terbaca.
 */
export function DiagramViewer({
	images,
	fallbackExplanation,
}: {
	images: SpImage[]
	fallbackExplanation?: string | null
}) {
	const [idx, setIdx] = useState(0)
	const [zoom, setZoom] = useState(1)

	if (images.length === 0) {
		return (
			<div className="border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-zinc-600">
				Tidak ada diagram yang terdeteksi untuk prosedur ini di dokumen TSD.
			</div>
		)
	}

	const current = images[Math.min(idx, images.length - 1)]
	const src = imageUrl(current.path)
	const explanation = current.explanation || fallbackExplanation
	const lines = (explanation ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line) => line.replace(/^[^\p{L}\p{N}@]+/u, ""))
		.filter((line, i) => !(i === 0 && /^Penjelasan\b/i.test(line)))

	return (
		<div className="min-w-0 max-w-full border border-zinc-200 bg-white">
			<div className="border-b border-zinc-200 bg-zinc-50/70">
				<div className="thin-scroll flex max-w-full gap-1 overflow-x-auto px-2 pt-2 pb-1" role="tablist" aria-label="Pilih diagram">
					{images.map((im, i) => {
						const repeatedKind = images.filter((x) => x.kind === im.kind).length > 1
						return (
							<button
								key={`${im.segment ?? "-"}-${im.kind}-${im.seq}`}
								type="button"
								role="tab"
								aria-selected={i === idx}
								onClick={() => {
									setIdx(i)
									setZoom(1)
								}}
								className={cn(
									"flex min-h-11 max-w-[340px] shrink-0 items-center gap-2 border px-3 py-2 text-left text-sm",
									i === idx
										? "border-zinc-400 bg-white text-zinc-900"
										: "border-transparent text-zinc-600 hover:border-zinc-300 hover:bg-white hover:text-zinc-900",
								)}
							>
								<span className="font-medium whitespace-nowrap">
									{KIND_LABEL[im.kind] ?? im.kind}
								</span>
								{repeatedKind || im.segment ? (
									<span className="truncate font-mono text-xs text-zinc-600">
										{im.segment ?? `#${im.seq}`}
									</span>
								) : null}
							</button>
						)
					})}
				</div>

				<div className="flex items-center justify-end gap-1.5 px-2 pb-2">
					<button
						type="button"
						aria-label="Perkecil"
						onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)))}
						disabled={zoom <= 0.5}
						className="flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
					>
					<Minus className="size-4" aria-hidden />
					</button>
					<span className="w-14 text-center font-mono text-xs text-zinc-600 tabular-nums">
						{Math.round(zoom * 100)}%
					</span>
					<button
						type="button"
						aria-label="Perbesar"
						onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}
						disabled={zoom >= 4}
						className="flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-40"
					>
					<Plus className="size-4" aria-hidden />
					</button>
					<button
						type="button"
						aria-label="Kembalikan ukuran"
						onClick={() => setZoom(1)}
						className="flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
					>
					<RotateCcw className="size-4" aria-hidden />
					</button>
					<a
						href={src}
						target="_blank"
						rel="noreferrer"
						aria-label="Buka gambar di tab baru"
					className="flex size-9 items-center justify-center border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 hover:text-zinc-950"
					>
					<ExternalLink className="size-4" aria-hidden />
					</a>
				</div>
			</div>

			<div className="thin-scroll max-h-[70vh] overflow-auto bg-white p-4">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={src}
					alt={`${KIND_LABEL[current.kind] ?? current.kind} untuk prosedur ini`}
					style={{ width: `${zoom * 100}%` }}
					className="max-w-none select-none"
				/>
			</div>

			<div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs text-zinc-600">
				<span>
					Sumber:{" "}
					<span className="font-mono">{current.segment ?? "tidak tercatat"}</span>
				</span>
				{current.width_in && current.height_in ? (
					<span className="font-mono tabular-nums">
						{current.width_in}″ × {current.height_in}″
					</span>
				) : null}
				<span className="font-mono break-all text-zinc-400">{current.path}</span>
			</div>

			<div className="border-t border-zinc-200 px-4 py-5 sm:px-6 sm:py-6">
				<div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
					<h3 className="text-sm font-semibold text-zinc-950">
						Penjelasan {KIND_LABEL[current.kind] ?? current.kind}
					</h3>
					<span className="text-sm text-zinc-600">
						Dikutip dari dokumen TSD yang dipilih
					</span>
				</div>

				{lines.length > 0 ? (
					<div className="max-w-[72ch] space-y-3 text-[15px] leading-7 text-zinc-700 [overflow-wrap:anywhere]">
						{lines.map((line, i) => {
							const isStep = /^(Langkah\b|Step\b|\d+[.)]\s|Penjelasan Proses\b|Tabel (Sumber|Referensi|Tujuan)\b)/i.test(line)
							const labelled = line.match(/^([^:]{2,36}):\s*(.+)$/)
							return isStep ? (
								<p key={`${line}-${i}`} className="pt-2 font-semibold text-zinc-950 first:pt-0">
									{line}
								</p>
							) : labelled ? (
								<p key={`${line}-${i}`} className="text-pretty">
									<strong className="font-semibold text-zinc-900">{labelled[1]}:</strong>{" "}
									{labelled[2]}
								</p>
							) : (
								<p key={`${line}-${i}`} className="text-pretty">
									{line}
								</p>
							)
						})}
					</div>
				) : (
					<p className="max-w-[65ch] text-sm leading-6 text-zinc-500">
						Dokumen TSD tidak memuat penjelasan naratif untuk diagram ini.
					</p>
				)}
			</div>
		</div>
	)
}

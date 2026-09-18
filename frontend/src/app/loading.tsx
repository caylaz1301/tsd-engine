import { SkeletonRows } from "@/components/ui"

export default function Loading() {
	return (
		<div className="border border-zinc-200 bg-white p-4 sm:p-6" aria-label="Memuat halaman">
			<div className="mb-6 h-6 w-52 animate-pulse rounded bg-zinc-200" />
			<SkeletonRows rows={8} />
		</div>
	)
}

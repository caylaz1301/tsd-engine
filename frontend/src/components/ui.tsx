import Link from "next/link"
import { AlertTriangle, Database, FileWarning, SearchX } from "lucide-react"
import { cn } from "@/lib/utils"
import type { SpStatus } from "@/lib/api"

/* ------------------------------------------------------------------ badge */

const STATUS_LABEL: Record<SpStatus, string> = {
	matched: "Terdokumentasi",
	doc_only: "TSD saja",
	sql_only: "Tanpa TSD",
	sql_variant: "Salinan arsip",
}

const STATUS_STYLE: Record<SpStatus, string> = {
	matched: "border-emerald-200 bg-emerald-50 text-emerald-800",
	doc_only: "border-amber-200 bg-amber-50 text-amber-800",
	sql_only: "border-zinc-200 bg-zinc-50 text-zinc-600",
	sql_variant: "border-dashed border-zinc-300 bg-white text-zinc-500",
}

export function StatusBadge({
	status,
	className,
}: {
	status: SpStatus
	className?: string
}) {
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center rounded border px-1.5 py-px text-[11px] font-medium whitespace-nowrap",
				STATUS_STYLE[status],
				className,
			)}
		>
			{STATUS_LABEL[status] ?? status}
		</span>
	)
}

export function LowConfidenceBadge() {
	return (
		<span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-px text-[11px] font-medium text-amber-800">
			<AlertTriangle className="size-3" aria-hidden />
			confidence rendah
		</span>
	)
}

/* ------------------------------------------------------------------- mono */

export function Mono({
	children,
	className,
}: {
	children: React.ReactNode
	className?: string
}) {
	return (
		<span className={cn("font-mono text-[13px] tracking-tight", className)}>
			{children}
		</span>
	)
}

/* ---------------------------------------------------------------- heading */

export function SectionHeading({
	children,
	hint,
}: {
	children: React.ReactNode
	hint?: string
}) {
	return (
		<div className="mb-3 flex items-baseline justify-between gap-4 border-b border-zinc-200 pb-2">
			<h2 className="text-xs font-semibold text-zinc-800">
				{children}
			</h2>
			{hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
		</div>
	)
}

/* --------------------------------------------------------------- key/value */

export function KeyValue({
	label,
	children,
}: {
	label: string
	children: React.ReactNode
}) {
	return (
		<div className="flex flex-col gap-0.5 py-1.5">
			<dt className="text-[11px] tracking-wide text-zinc-500 uppercase">
				{label}
			</dt>
			<dd className="text-zinc-900">{children}</dd>
		</div>
	)
}

/* -------------------------------------------------------------------- stat */

export function Stat({
	label,
	value,
	sub,
	tone = "default",
}: {
	label: string
	value: string
	sub?: string
	tone?: "default" | "warn" | "good"
}) {
	return (
		<div className="border border-zinc-200 bg-white px-3 py-3">
			<div className="text-[11px] font-medium text-zinc-500">
				{label}
			</div>
			<div
				className={cn(
					"mt-1 font-mono text-[26px] leading-none tabular-nums text-zinc-950",
					tone === "warn" && "text-amber-700",
					tone === "good" && "text-emerald-700",
				)}
			>
				{value}
			</div>
			{sub ? <div className="mt-2 text-xs leading-snug text-zinc-600">{sub}</div> : null}
		</div>
	)
}

/* ------------------------------------------------------------ empty/error */

export function EmptyState({
	title,
	description,
}: {
	title: string
	description?: string
}) {
	return (
		<div className="flex flex-col items-center gap-2 border border-dashed border-zinc-300 px-6 py-14 text-center">
			<SearchX className="size-5 text-zinc-400" aria-hidden />
			<p className="font-medium text-zinc-800">{title}</p>
			{description ? (
				<p className="max-w-md text-zinc-500">{description}</p>
			) : null}
		</div>
	)
}

export function ErrorPanel({
	title,
	detail,
	hint,
}: {
	title: string
	detail?: string
	hint?: React.ReactNode
}) {
	return (
		<div className="border border-red-200 bg-red-50/60 px-4 py-3">
			<div className="flex items-start gap-2">
				<FileWarning className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden />
				<div className="min-w-0">
					<p className="font-medium text-red-900">{title}</p>
					{detail ? (
						<p className="mt-0.5 font-mono text-xs break-words text-red-800">
							{detail}
						</p>
					) : null}
					{hint ? (
						<div className="mt-2 text-xs text-red-800">{hint}</div>
					) : null}
				</div>
			</div>
		</div>
	)
}

/* ---------------------------------------------------------------- skeleton */

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
	return (
		<div className="divide-y divide-zinc-100 border-y border-zinc-100">
			{Array.from({ length: rows }).map((_, i) => (
				<div key={i} className="flex items-center gap-3 py-3">
					<div className="h-3.5 w-64 animate-pulse rounded bg-zinc-100" />
					<div className="h-3.5 w-20 animate-pulse rounded bg-zinc-100" />
					<div className="ml-auto h-3.5 w-28 animate-pulse rounded bg-zinc-100" />
				</div>
			))}
		</div>
	)
}

/* ------------------------------------------------------------- table chip */

export function TableChip({
	name,
	operations,
}: {
	name: string
	operations?: string | null
}) {
	const ops = operations ? operations.split(",").filter(Boolean) : []
	return (
		<Link
			href={`/tables/${encodeURIComponent(name)}`}
			className="group flex items-start gap-2 border-b border-zinc-100 py-1.5 hover:bg-zinc-50"
		>
			<Database
				className="mt-1 size-3.5 shrink-0 text-zinc-400"
				aria-hidden
			/>
			<span className="min-w-0 flex-1">
				<Mono className="break-all text-zinc-800 group-hover:text-accent group-hover:underline">
					{name}
				</Mono>
			</span>
			{ops.length > 0 ? (
				<span className="flex shrink-0 gap-1">
					{ops.map((o) => (
						<span
							key={o}
							className="rounded border border-zinc-200 bg-white px-1 text-[10px] tracking-wide text-zinc-600 uppercase"
						>
							{o}
						</span>
					))}
				</span>
			) : null}
		</Link>
	)
}

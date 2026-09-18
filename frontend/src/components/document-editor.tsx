"use client"

import Script from "next/script"
import { useEffect, useRef, useState } from "react"
import { AlertCircle, LoaderCircle } from "lucide-react"
import { getDocumentEditorConfig, type DocumentEditorConfig } from "@/lib/api"

declare global {
	interface Window {
		DocsAPI?: {
			DocEditor: new (id: string, config: DocumentEditorConfig) => { destroyEditor: () => void }
		}
	}
}

export function DocumentEditor({ filename }: { filename: string }) {
	const editor = useRef<{ destroyEditor: () => void } | null>(null)
	const [scriptReady, setScriptReady] = useState(false)
	const [scriptUrl, setScriptUrl] = useState("")
	const [error, setError] = useState<string | null>(null)
	const docsPort = process.env.NEXT_PUBLIC_DOCS_PORT ?? "8080"

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setScriptUrl(`${window.location.protocol}//${window.location.hostname}:${docsPort}/web-apps/apps/api/documents/api.js`)
		}, 0)
		return () => window.clearTimeout(timer)
	}, [docsPort])

	useEffect(() => {
		if (!scriptReady || !window.DocsAPI) return
		let cancelled = false
		getDocumentEditorConfig(filename)
			.then((config) => {
				if (cancelled || !window.DocsAPI) return
				editor.current = new window.DocsAPI.DocEditor("onlyoffice-editor", config)
			})
			.catch((cause) => setError(cause instanceof Error ? cause.message : "Editor tidak dapat dibuka."))
		return () => {
			cancelled = true
			editor.current?.destroyEditor()
			editor.current = null
		}
	}, [filename, scriptReady])

	return (
		<>
		{scriptUrl ? <Script src={scriptUrl} strategy="afterInteractive" onLoad={() => setScriptReady(true)} onError={() => setError("ONLYOFFICE Document Server tidak dapat dihubungi.")} /> : null}
		<div className="relative h-[calc(100vh-5.5rem)] min-h-[680px] w-full overflow-hidden bg-white">
			<div id="onlyoffice-editor" className="h-full w-full" />
			{!scriptReady && !error ? <div className="absolute inset-0 flex items-center justify-center gap-3 bg-zinc-50 text-sm text-zinc-600"><LoaderCircle className="size-5 animate-spin" />Menyiapkan editor dokumen...</div> : null}
			{error ? <div role="alert" className="absolute inset-0 flex items-center justify-center bg-zinc-50 p-6"><div className="max-w-lg border border-red-200 bg-white p-5 text-sm text-red-800"><AlertCircle className="mb-3 size-5" /><strong className="block text-base">Editor tidak tersedia</strong><p className="mt-1 leading-6">{error}</p></div></div> : null}
		</div>
		</>
	)
}

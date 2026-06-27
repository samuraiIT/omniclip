/**
 * Мост к Samurai Media Privacy (:8789).
 *
 * Подключает CapCut-UI (Omniclip-форк) к серверному стеку:
 *   - PII-редакция экспортированного видео (solid/blur/inpaint, ComfyUI SD)
 *   - AI text-to-video (Wan 2.1 1.3B) — вставка сгенерированного клипа
 *   - html-video шаблоны (hyperframes)
 *
 * media-privacy REST принимает path на сервере, поэтому файл сначала
 * загружается через /api/upload, затем обрабатывается по полученному пути.
 */

const MP_BASE = (globalThis as any).MEDIA_PRIVACY_URL || "http://127.0.0.1:8789"

export interface MpResult {
	status: string
	output_path?: string
	backend?: string
	error?: string
	[k: string]: unknown
}

/** Загрузить Blob на сервер media-privacy, вернуть серверный путь. */
async function uploadBlob(blob: Blob, filename = "clip.mp4"): Promise<string> {
	const fd = new FormData()
	fd.append("file", blob, filename)
	const r = await fetch(`${MP_BASE}/api/upload`, {method: "POST", body: fd})
	if (!r.ok) throw new Error(`upload failed: ${r.status}`)
	const j = await r.json()
	return j.path as string
}

/** Скачать обработанный файл с сервера как Blob (через /api/download?path=). */
async function downloadResult(serverPath: string): Promise<Blob> {
	const r = await fetch(`${MP_BASE}/api/download?path=${encodeURIComponent(serverPath)}`)
	if (!r.ok) throw new Error(`download failed: ${r.status}`)
	return await r.blob()
}

export class MediaPrivacyClient {
	base = MP_BASE

	async health(): Promise<boolean> {
		try {
			const r = await fetch(`${this.base}/health`)
			return r.ok
		} catch {
			return false
		}
	}

	/** PII-редакция: upload → redact → download готового Blob. */
	async redactVideo(blob: Blob, mode: "solid" | "blur" | "inpaint" = "inpaint"): Promise<Blob> {
		const path = await uploadBlob(blob)
		const fd = new FormData()
		fd.append("path", path)
		fd.append("mode", mode)
		const r = await fetch(`${this.base}/api/redact-video`, {method: "POST", body: fd})
		if (!r.ok) throw new Error(`redact failed: ${r.status}`)
		const j = (await r.json()) as MpResult
		if (j.status !== "done" || !j.output_path) throw new Error(j.error || "redact failed")
		return await downloadResult(j.output_path)
	}

	/** AI text-to-video (Wan 2.1). Возвращает MP4 Blob сгенерированного клипа. */
	async textToVideo(prompt: string, duration = 3, width = 832, height = 480): Promise<Blob> {
		const fd = new FormData()
		fd.append("prompt", prompt)
		fd.append("duration", String(duration))
		fd.append("width", String(width))
		fd.append("height", String(height))
		const r = await fetch(`${this.base}/api/text-to-video`, {method: "POST", body: fd})
		if (!r.ok) throw new Error(`t2v failed: ${r.status}`)
		const j = (await r.json()) as MpResult
		if (j.status !== "done" || !j.output_path) throw new Error(j.error || "t2v failed")
		return await downloadResult(j.output_path)
	}
}

export const mediaPrivacy = new MediaPrivacyClient()

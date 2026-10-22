type ConversionResult = {fileName: string; type: 'word' | 'cell' | 'slide'; bin: Uint8Array; media: Record<string, string>}
let worker: Worker | null = null
let sequence = 0
const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void}>()
const mediaUrls = new Set<string>()
function connect() {
    if (worker) return worker
    worker = new Worker(new URL('./x2t.worker.ts', import.meta.url))
    const fail = () => {for (const entry of pending.values()) entry.reject(new Error('Document conversion stopped. Keep your edits and retry.')); pending.clear(); worker?.terminate(); worker = null}
    worker.onerror = fail; worker.onmessageerror = fail
    worker.onmessage = ({data}) => {const entry = pending.get(data.requestId); if (!entry) return; pending.delete(data.requestId); if (data.ok) entry.resolve(data.result); else entry.reject(new Error(data.error))}
    return worker
}
function request<T>(method: string, args: unknown[], transfer: Transferable[] = []): Promise<T> {
    const requestId = ++sequence
    return new Promise<T>((resolve, reject) => {pending.set(requestId, {resolve, reject}); try {connect().postMessage({requestId, method, args}, transfer)} catch (error) {pending.delete(requestId); reject(error)}})
}
export const initX2TScript = () => request<void>('initialize', [])
export const initX2T = initX2TScript
export async function convertDocument(file: File): Promise<ConversionResult> {
    const result = await request<{fileName: string; type: ConversionResult['type']; bin: Uint8Array; media: Record<string, Uint8Array>}>('open', [file])
    const media: Record<string, string> = {}
    for (const [name, bytes] of Object.entries(result.media)) {const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer])); mediaUrls.add(url); media[name] = url}
    return {...result, media}
}
/** The editor callback owns this snapshot; transferring releases its sender bytes. */
export const convertBinToDocument = (bin: Uint8Array | string, name: string, extension = 'DOCX') => {
    // With nobase64=false the editor sends a DOCY/XLSY/PPTY snapshot string.
    // Constructing Uint8Array from that string silently produces zero bytes.
    if (typeof bin === 'string') {
        return request<{fileName: string; data: Uint8Array}>('save', [bin, name, extension])
    }
    const owned = bin.buffer instanceof ArrayBuffer && bin.byteOffset === 0 && bin.byteLength === bin.buffer.byteLength ? bin : new Uint8Array(bin)
    return request<{fileName: string; data: Uint8Array}>('save', [owned, name, extension], [owned.buffer as ArrayBuffer])
}
export function releaseConversionWorker() {worker?.terminate(); worker = null; for (const entry of pending.values()) entry.reject(new Error('Editor closed.')); pending.clear(); for (const url of mediaUrls) URL.revokeObjectURL(url); mediaUrls.clear()}

export const getDocumentMimeType = (fileName: string): string => {
    const extension = fileName.split('.').pop()?.toLowerCase() || ''
    const mimeTypes: Record<string, string> = {
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        doc: 'application/msword',
        odt: 'application/vnd.oasis.opendocument.text',
        rtf: 'application/rtf',
        txt: 'text/plain',
        html: 'text/html',
        epub: 'application/epub+zip',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        xls: 'application/vnd.ms-excel',
        ods: 'application/vnd.oasis.opendocument.spreadsheet',
        csv: 'text/csv',
        pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        ppt: 'application/vnd.ms-powerpoint',
        odp: 'application/vnd.oasis.opendocument.presentation',
        pdf: 'application/pdf',
    }

    return mimeTypes[extension] || 'application/octet-stream'
}

// 文件类型常量
export const oAscFileType = {
    UNKNOWN: 0,
    PDF: 513,
    PDFA: 521,
    DJVU: 515,
    XPS: 516,
    DOCX: 65,
    DOC: 66,
    ODT: 67,
    RTF: 68,
    TXT: 69,
    HTML: 70,
    MHT: 71,
    EPUB: 72,
    FB2: 73,
    MOBI: 74,
    DOCM: 75,
    DOTX: 76,
    DOTM: 77,
    FODT: 78,
    OTT: 79,
    DOC_FLAT: 80,
    DOCX_FLAT: 81,
    HTML_IN_CONTAINER: 82,
    DOCX_PACKAGE: 84,
    OFORM: 85,
    DOCXF: 86,
    DOCY: 4097,
    CANVAS_WORD: 8193,
    JSON: 2056,
    XLSX: 257,
    XLS: 258,
    ODS: 259,
    CSV: 260,
    XLSM: 261,
    XLTX: 262,
    XLTM: 263,
    XLSB: 264,
    FODS: 265,
    OTS: 266,
    XLSX_FLAT: 267,
    XLSX_PACKAGE: 268,
    XLSY: 4098,
    PPTX: 129,
    PPT: 130,
    ODP: 131,
    PPSX: 132,
    PPTM: 133,
    PPSM: 134,
    POTX: 135,
    POTM: 136,
    FODP: 137,
    OTP: 138,
    PPTX_PACKAGE: 139,
    IMG: 1024,
    JPG: 1025,
    TIFF: 1026,
    TGA: 1027,
    GIF: 1028,
    PNG: 1029,
    EMF: 1030,
    WMF: 1031,
    BMP: 1032,
    CR2: 1033,
    PCX: 1034,
    RAS: 1035,
    PSD: 1036,
    ICO: 1037,
} as const

export const c_oAscFileType2 = Object.fromEntries(
    Object.entries(oAscFileType).map(([key, value]) => [value, key]),
) as Record<number, keyof typeof oAscFileType>

const LFOS_SDK_URL = 'https://os.linecoflow.com/sdk/v1/lfos.js'

export interface LFOSFileHandle {
  id: string
  name: string
  type: string
  size: number
  lastModified: number
}

interface LFOSEnvironment {
  name: 'LFOS'
  protocolVersion: 1
  capabilities: string[]
}

interface LFOSApi {
  isAvailable(): boolean
  ready(): Promise<LFOSEnvironment>
  capabilities: {
    has(name: string): boolean
  }
  activation: {
    getInitial(): Promise<{ type: 'open-file'; file: LFOSFileHandle } | null>
  }
  files: {
    open(options?: {
      title?: string
      accept?: Array<{
        description?: string
        extensions?: string[]
        mimeTypes?: string[]
      }>
    }): Promise<LFOSFileHandle | null>
    read(handle: LFOSFileHandle): Promise<ArrayBuffer>
    save(options?: {
      title?: string
      suggestedName?: string
      requiredExtension?: string
      mimeType?: string
    }): Promise<LFOSFileHandle | null>
    write(handle: LFOSFileHandle, data: ArrayBuffer | ArrayBufferView | string): Promise<LFOSFileHandle>
    release(handle: LFOSFileHandle): Promise<null>
  }
}

interface LFOSSDKModule {
  lfos: LFOSApi
}

export type LFOSOpenResult =
  | { status: 'opened'; file: File }
  | { status: 'cancelled' }
  | { status: 'unavailable' }

export type LFOSSaveResult = 'saved' | 'cancelled' | 'unavailable'

let connectionPromise: Promise<LFOSApi | null> | null = null

function mimeTypeFromFileName(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  }

  return (extension && mimeTypes[extension]) || 'application/octet-stream'
}

async function connect(): Promise<LFOSApi | null> {
  if (window.self === window.top) return null

  try {
    const sdk = (await import(/* @vite-ignore */ LFOS_SDK_URL)) as LFOSSDKModule
    if (!sdk.lfos.isAvailable()) return null

    const environment = await sdk.lfos.ready()
    return environment.name === 'LFOS' ? sdk.lfos : null
  } catch (error) {
    console.info('LFOS is not available; using the browser file APIs.', error)
    return null
  }
}

export function getLFOS(): Promise<LFOSApi | null> {
  connectionPromise ??= connect()
  return connectionPromise
}

async function fileFromHandle(lfos: LFOSApi, handle: LFOSFileHandle): Promise<File> {
  try {
    const bytes = await lfos.files.read(handle)
    return new File([bytes], handle.name, {
      type: handle.type || mimeTypeFromFileName(handle.name),
      lastModified: handle.lastModified || Date.now(),
    })
  } finally {
    await lfos.files.release(handle)
  }
}

export async function getInitialLFOSFile(): Promise<File | null> {
  const lfos = await getLFOS()
  if (!lfos || !lfos.capabilities.has('activation.openFile')) return null

  const activation = await lfos.activation.getInitial()
  if (activation?.type !== 'open-file') return null
  return fileFromHandle(lfos, activation.file)
}

export async function openFileFromLFOS(): Promise<LFOSOpenResult> {
  const lfos = await getLFOS()
  if (!lfos || !lfos.capabilities.has('files.open')) return { status: 'unavailable' }

  const handle = await lfos.files.open({
    title: 'Open a Microsoft Office file',
    accept: [
      {
        description: 'Microsoft Word, Excel, or PowerPoint',
        extensions: ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'],
        mimeTypes: ['application/*'],
      },
    ],
  })

  if (!handle) return { status: 'cancelled' }
  return { status: 'opened', file: await fileFromHandle(lfos, handle) }
}

export async function saveFileToLFOS(
  data: Uint8Array,
  fileName: string,
  mimeType: string,
): Promise<LFOSSaveResult> {
  const lfos = await getLFOS()
  if (!lfos || !lfos.capabilities.has('files.save')) return 'unavailable'

  const extension = fileName.includes('.') ? `.${fileName.split('.').pop()!.toLowerCase()}` : undefined
  const handle = await lfos.files.save({
    title: 'Save document',
    suggestedName: fileName,
    requiredExtension: extension,
    mimeType,
  })

  if (!handle) return 'cancelled'

  try {
    await lfos.files.write(handle, data)
    return 'saved'
  } finally {
    await lfos.files.release(handle)
  }
}


import {X2TConverter} from './x2t-engine'
const converter = new X2TConverter()
let queue = Promise.resolve()
const scope = globalThis as unknown as {onmessage: (event: MessageEvent) => void; postMessage: (value: unknown, transfer: Transferable[]) => void}
scope.onmessage = ({data}) => {
    const operation = queue.then(async () => {
        await converter.initialize()
        if (data.method === 'initialize') return null
        converter.clearWorking()
        try {
            if (data.method === 'open') return await converter.convertDocument(data.args[0])
            if (data.method === 'save') return await converter.convertBinToDocument(data.args[0], data.args[1], data.args[2])
            throw new Error('Unsupported conversion operation.')
        } finally {converter.clearWorking()}
    })
    queue = operation.then(() => {}, () => {})
    operation.then(result => {
        const buffers: ArrayBuffer[] = []
        if (result && 'bin' in result) {buffers.push(result.bin.buffer as ArrayBuffer); for (const bytes of Object.values(result.media)) buffers.push(bytes.buffer as ArrayBuffer)}
        if (result && 'data' in result) buffers.push(result.data.buffer as ArrayBuffer)
        scope.postMessage({requestId: data.requestId, ok: true, result}, [...new Set(buffers)])
    }, error => scope.postMessage({requestId: data.requestId, ok: false, error: error.message}, []))
}

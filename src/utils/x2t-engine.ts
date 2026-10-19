// types/x2t.d.ts - 类型定义文件
interface EmscriptenFileSystem {
    mkdir(path: string): void
    readdir(path: string): string[]
    readFile(path: string, options?: { encoding: 'binary' }): Uint8Array
    writeFile(path: string, data: Uint8Array | string): void
    unlink(path: string): void
    rmdir(path: string): void
    stat(path: string): {mode: number}
    isDir(mode: number): boolean
}

interface EmscriptenModule {
    FS: EmscriptenFileSystem
    ccall: (funcName: string, returnType: string, argTypes: string[], args: any[]) => number
    onRuntimeInitialized: () => void
    calledRun?: boolean
}

interface ConversionResult {
    fileName: string
    type: DocumentType
    bin: Uint8Array
    media: Record<string, Uint8Array>
}

interface BinConversionResult {
    fileName: string
    data: Uint8Array
}

type DocumentType = 'word' | 'cell' | 'slide'
type SupportedExtension =
    | 'docx'
    | 'doc'
    | 'odt'
    | 'rtf'
    | 'txt'
    | 'xlsx'
    | 'xls'
    | 'ods'
    | 'csv'
    | 'pptx'
    | 'ppt'
    | 'odp'

declare global {
    interface Window {
        Module: EmscriptenModule
    }
}

/**
 * X2T 工具类 - 负责文档转换功能
 */
export class X2TConverter {
    private x2tModule: EmscriptenModule | null = null
    private isReady = false
    private initPromise: Promise<EmscriptenModule> | null = null
    private scriptPromise: Promise<void> | null = null
    private hasScriptLoaded = false

    // 支持的文件类型映射
    private readonly DOCUMENT_TYPE_MAP: Record<string, DocumentType> = {
        docx: 'word',
        doc: 'word',
        odt: 'word',
        rtf: 'word',
        txt: 'word',
        xlsx: 'cell',
        xls: 'cell',
        ods: 'cell',
        csv: 'cell',
        pptx: 'slide',
        ppt: 'slide',
        odp: 'slide',
    }

    private readonly WORKING_DIRS = [
        '/working',
        '/working/media',
        '/working/fonts',
        '/working/themes',
    ]
    private readonly SCRIPT_PATH = new URL('/wasm/x2t/x2t.js', globalThis.location.origin).href
    private readonly INIT_TIMEOUT = 120000

    /**
     * 加载 X2T 脚本文件
     */
    async loadScript(): Promise<void> {
        if (this.hasScriptLoaded) return
        if (this.scriptPromise) return this.scriptPromise

        this.scriptPromise = new Promise((resolve, reject) => {
            try {
                const scope = globalThis as unknown as {Module: EmscriptenModule & {locateFile: (path: string) => string}; importScripts: (...urls: string[]) => void}
                scope.Module = {locateFile: (path: string) => new URL(`/wasm/x2t/${path}`, globalThis.location.origin).href} as typeof scope.Module
                scope.importScripts(this.SCRIPT_PATH)
                this.hasScriptLoaded = true
                resolve()
            } catch (error) {this.scriptPromise = null; reject(error)}
        })
        return this.scriptPromise
    }

    /**
     * 初始化 X2T 模块
     */
    async initialize(): Promise<EmscriptenModule> {
        if (this.isReady && this.x2tModule) {
            return this.x2tModule
        }

        // 防止重复初始化
        if (this.initPromise) {
            return this.initPromise
        }

        this.initPromise = this.doInitialize()
        return this.initPromise
    }

    private async doInitialize(): Promise<EmscriptenModule> {
        try {
            // 确保脚本已加载
            await this.loadScript()

            return await new Promise((resolve, reject) => {
                const x2t = (globalThis as unknown as {Module: EmscriptenModule}).Module
                if (!x2t) {
                    reject(new Error('X2T module not found after script loading'))
                    return
                }

                // 设置超时处理
                const timeoutId = setTimeout(() => {
                    if (!this.isReady) {
                        reject(new Error(`X2T initialization timeout after ${this.INIT_TIMEOUT}ms`))
                    }
                }, this.INIT_TIMEOUT)

                const finishInitialization = () => {
                    try {
                        clearTimeout(timeoutId)
                        this.createWorkingDirectories(x2t)
                        this.x2tModule = x2t
                        this.isReady = true
                        console.log('X2T module initialized successfully')
                        resolve(x2t)
                    } catch (error) {
                        reject(error)
                    }
                }
                x2t.onRuntimeInitialized = finishInitialization
                // A cached/small WASM download can finish before script.onload.
                // Emscripten exposes calledRun once the runtime is usable.
                if (x2t.calledRun) finishInitialization()
            })
        } catch (error) {
            this.initPromise = null // 重置以允许重试
            throw error
        }
    }

    /**
     * 创建工作目录
     */
    private createWorkingDirectories(x2t: EmscriptenModule): void {
        this.WORKING_DIRS.forEach((dir) => {
            try {
                x2t.FS.mkdir(dir)
            } catch (error) {
                // 目录可能已存在，忽略错误
                console.warn(`Directory ${dir} may already exist:`, error)
            }
        })
    }

    /**
     * 获取文档类型
     */
    private getDocumentType(extension: string): DocumentType {
        const docType = this.DOCUMENT_TYPE_MAP[extension.toLowerCase()]
        if (!docType) {
            throw new Error(`Unsupported file format: ${extension}`)
        }
        return docType
    }

    /**
     * 清理文件名
     */
    private sanitizeFileName(input: string): string {
        if (typeof input !== 'string' || !input.trim()) {
            return 'file.bin'
        }

        const parts = input.split('.')
        const ext = parts.pop() || 'bin'
        const name = parts.join('.')

        const illegalChars = /[\/\?<>\\:\*\|"]/g
        const controlChars = /[\x00-\x1f\x80-\x9f]/g
        const reservedPattern = /^\.+$/
        const unsafeChars = /[&'%!"{}[\]]/g

        let sanitized = name
            .replace(illegalChars, '')
            .replace(controlChars, '')
            .replace(reservedPattern, '')
            .replace(unsafeChars, '')

        sanitized = sanitized.trim() || 'file'
        return `${sanitized.slice(0, 200)}.${ext}` // 限制长度
    }

    /**
     * 执行文档转换
     */
    private executeConversion(paramsPath: string): void {
        if (!this.x2tModule) {
            throw new Error('X2T module not initialized')
        }

        const result = this.x2tModule.ccall('main1', 'number', ['string'], [paramsPath])
        if (result !== 0) {
            throw new Error(`Conversion failed with code: ${result}`)
        }
    }

    /**
     * 创建转换参数XML
     */
    private createConversionParams(
        fromPath: string,
        toPath: string,
        additionalParams = '',
    ): string {
        return `<?xml version="1.0" encoding="utf-8"?>
<TaskQueueDataConvert xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <m_sFileFrom>${fromPath}</m_sFileFrom>
  <m_sThemeDir>/working/themes</m_sThemeDir>
  <m_sFileTo>${toPath}</m_sFileTo>
  <m_bIsNoBase64>false</m_bIsNoBase64>
  ${additionalParams}
</TaskQueueDataConvert>`
    }

    /**
     * 读取媒体文件
     */
    private readMediaFiles(): Record<string, Uint8Array> {
        if (!this.x2tModule) return {}

        const media: Record<string, Uint8Array> = {}

        try {
            const files = this.x2tModule.FS.readdir('/working/media/')

            files
                .filter((file) => file !== '.' && file !== '..')
                .forEach((file) => {
                    try {
                        const fileData = this.x2tModule!.FS.readFile(`/working/media/${file}`, {
                            encoding: 'binary',
                        })

                        media[`media/${file}`] = fileData
                    } catch (error) {
                        console.warn(`Failed to read media file ${file}:`, error)
                    }
                })
        } catch (error) {
            console.warn('Failed to read media directory:', error)
        }

        return media
    }

    clearWorking(): void {
        if (!this.x2tModule) return
        const fs = this.x2tModule.FS
        const remove = (path: string) => {
            for (const name of fs.readdir(path)) {
                if (name === '.' || name === '..' || name === 'fonts' || name === 'themes') continue
                const full = `${path}/${name}`
                if (fs.isDir(fs.stat(full).mode)) {remove(full); fs.rmdir(full)} else fs.unlink(full)
            }
        }
        remove('/working'); this.createWorkingDirectories(this.x2tModule)
    }
    /**
     * 将文档转换为 bin 格式
     */
    async convertDocument(file: File): Promise<ConversionResult> {
        await this.initialize()

        const fileName = file.name
        const fileExt = fileName.split('.').pop()?.toLowerCase() || ''
        const documentType = this.getDocumentType(fileExt)

        try {
            // 读取文件内容
            const arrayBuffer = await file.arrayBuffer()
            const data = new Uint8Array(arrayBuffer)

            // 生成安全的文件名
            const sanitizedName = this.sanitizeFileName(fileName)
            const inputPath = `/working/${sanitizedName}`
            const outputPath = `${inputPath}.bin`

            // 写入文件到虚拟文件系统
            this.x2tModule!.FS.writeFile(inputPath, data)

            // 创建转换参数
            const params = this.createConversionParams(inputPath, outputPath)
            this.x2tModule!.FS.writeFile('/working/params.xml', params)

            // 执行转换
            this.executeConversion('/working/params.xml')

            // 读取转换结果
            const result = this.x2tModule!.FS.readFile(outputPath)
            const media = this.readMediaFiles()

            return {
                fileName: sanitizedName,
                type: documentType,
                bin: result,
                media,
            }
        } catch (error) {
            throw new Error(
                `Document conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /** Convert the editor's binary format to a downloadable Office document. */
    async convertBinToDocument(
        bin: Uint8Array,
        originalFileName: string,
        targetExt = 'DOCX',
    ): Promise<BinConversionResult> {
        await this.initialize()

        const sanitizedBase = this.sanitizeFileName(originalFileName).replace(/\.[^/.]+$/, '')
        const binFileName = `${sanitizedBase}.bin`
        const outputFileName = `${sanitizedBase}.${targetExt.toLowerCase()}`

        try {
            // 写入 bin 文件
            this.x2tModule!.FS.writeFile(`/working/${binFileName}`, bin)

            // 创建转换参数
            let additionalParams = ''
            if (targetExt === 'PDF') {
                additionalParams = '<m_sFontDir>/working/fonts/</m_sFontDir>'
            }

            const params = this.createConversionParams(
                `/working/${binFileName}`,
                `/working/${outputFileName}`,
                additionalParams,
            )

            this.x2tModule!.FS.writeFile('/working/params.xml', params)

            // 执行转换
            this.executeConversion('/working/params.xml')

            // 读取生成的文档
            const result = this.x2tModule!.FS.readFile(`/working/${outputFileName}`)

            return {
                fileName: outputFileName,
                data: result,
            }
        } catch (error) {
            throw new Error(
                `Bin to document conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            )
        }
    }

    /**
     * 销毁实例，清理资源
     */
    destroy(): void {
        this.x2tModule = null
        this.isReady = false
        this.initPromise = null
        console.log('X2T converter destroyed')
    }
}


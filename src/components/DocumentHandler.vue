<template>
    <div class="editor-container" v-loading="loading" element-loading-text="Loading...">
        <div id="iframe"></div>
    </div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { getDocumentType, DocmentType } from '@/utils/util'
import { g_sEmpty_bin } from '@/utils/empty_bin'
// @ts-ignore
import {
    initX2TScript,
    initX2T,
    convertDocument,
    convertBinToDocument,
    getDocumentMimeType,
    saveDocumentToDevice,
    c_oAscFileType2,
} from '@/utils/x2t'
import { saveFileToLFOS } from '@/services/lfos'
const X2T = ref(null)
// 设置prop
const props = defineProps<{
    file: DocmentType
}>()

const editor = ref<any>(null)
const loading = ref(false)
let stopFileWatch: (() => void) | null = null
let documentObjectUrl: string | null = null
let saveInProgress = false

// 全局 media 映射对象
const media: { [key: string]: string } = {}

onMounted(async () => {
    loading.value = true
    try {
        await initX2TScript()
        // 加载编辑器API
        await loadEditorApi()
        await initX2T()
        console.log('app has loading')
        loading.value = false
        // 页面初始化后，使用 watchEffect 监听 props.file 并执行 openFile
        // 添加props.file监听

        stopFileWatch = watch(
            () => props.file.fileName,
            async () => {
                try {
                    await openFile()
                } catch (error) {
                    console.error('Error opening file:', error)
                    alert('The file could not be opened. Please check that its format is supported.')
                }
            },
            { immediate: true }, // 立即执行一次以处理初始值
        )
    } catch (error) {
        console.error('Failed to initialize editor:', error)
        // 错误已在各函数中处理
    }
})
// 合并后的文件操作方法
async function handleDocumentOperation(options: { isNew: boolean; fileName: string; file?: File }) {
    try {
        const { isNew, fileName, file } = options
        const fileType = fileName.split('.').pop() || ''
        const docType = getDocumentType(fileType)

        // 获取文档内容
        let documentData: {
            bin: Uint8Array | string
            media?: any
        }

        if (isNew) {
            // 新建文档使用空模板
            const emptyBin = g_sEmpty_bin[`.${fileType}`]
            if (!emptyBin) {
                throw new Error(`Unsupported file type: ${fileType}`)
            }
            documentData = { bin: emptyBin }
        } else {
            // 打开现有文档需要转换
            if (!file) throw new Error('The selected file is invalid')
            documentData = await convertDocument(file)
        }

        // 创建编辑器实例
        createEditorInstance({
            fileName,
            fileType,
            binData: documentData.bin,
            media: documentData.media,
            sourceFile: file,
        })
    } catch (error: any) {
        console.error('Document operation failed:', error)
        alert(`Document operation failed: ${error.message}`)
        throw error
    }
}

// 公共编辑器创建方法
function createEditorInstance(config: {
    fileName: string
    fileType: string
    binData: Uint8Array | string
    media?: any
    sourceFile?: File
}) {
    // 清理旧编辑器实例
    if (editor.value) {
        editor.value.destroyEditor()
        editor.value = null
    }

    const { fileName, fileType, binData, media, sourceFile } = config
    if (documentObjectUrl) URL.revokeObjectURL(documentObjectUrl)
    documentObjectUrl = URL.createObjectURL(sourceFile ?? new Blob([]))

    // The upstream editors persist force-save as a per-editor preference and
    // can otherwise ignore their own Save buttons when no dirty-state signal
    // is pending. LFOS Save is explicit and must always reach the host.
    localStorage.setItem('de-settings-forcesave', '1')
    localStorage.setItem('sse-settings-forcesave', '1')
    localStorage.setItem('pe-settings-forcesave', '1')

    editor.value = new window.DocsAPI.DocEditor('iframe', {
        document: {
            title: fileName,
            url: documentObjectUrl,
            fileType: fileType,
            permissions: {
                edit: true,
                chat: false,
                protect: false,
            },
        },
        editorConfig: {
            lang: 'en',
            customization: {
                help: false,
                about: false,
                hideRightMenu: true,
                features: {
                    spellcheck: {
                        change: false,
                    },
                },
                // LFOS owns persistence. Keep both toolbar and File-menu Save
                // active so they use the same onSave path as the shortcut.
                forcesave: true,
                anonymous: {
                    request: false,
                    label: 'Guest',
                },
            },
        },
        events: {
            onAppReady: () => {
                applyLFOSFileMenuPolicy()
                // 设置媒体资源
                if (media) {
                    editor.value.sendCommand({
                        command: 'asc_setImageUrls',
                        data: { urls: media },
                    })
                }

                // 加载文档内容
                editor.value.sendCommand({
                    command: 'asc_openDocument',
                    data: { buf: binData },
                })
            },
            onDocumentReady: () => {
                console.log('Document loaded:', fileName)
            },
            onSave: handleSaveDocument,
            onDownloadAs: handleExportDocument,
            // writeFile
            // todo writeFile 当外部粘贴图片时候处理
            writeFile: handleWriteFile,
        },
    })
}

// 修改后的openFile方法
async function openFile() {
    const { fileName, file } = props.file

    await handleDocumentOperation({
        isNew: !file, // 根据是否存在file判断是否新建
        fileName,
        file: file || undefined,
    })
}

onBeforeUnmount(() => {
    stopFileWatch?.()
    stopFileWatch = null
    // 清理资源
    if (editor.value) {
        // 如果编辑器有销毁方法，调用它
        if (typeof editor.value.destroyEditor === 'function') {
            editor.value.destroyEditor()
        }
    }
    if (documentObjectUrl) {
        URL.revokeObjectURL(documentObjectUrl)
        documentObjectUrl = null
    }
})

function loadEditorApi(): Promise<void> {
    return new Promise((resolve, reject) => {
        // 检查是否已加载
        if (window.DocsAPI) {
            resolve()
            return
        }

        // 加载编辑器API
        const script = document.createElement('script')
        script.src = './web-apps/apps/api/documents/api.js'
        script.onload = () => resolve()
        script.onerror = (error) => {
            console.error('Failed to load OnlyOffice API:', error)
            alert('The ONLYOFFICE editor could not be loaded.')
            reject(error)
        }
        document.head.appendChild(script)
    })
}

interface SaveEvent {
    data: {
        data: { data: Uint8Array }
        option: {
            outputformat: number
            actionType?: number
        }
    }
}

async function handleSaveDocument(event: SaveEvent) {
    console.log('Save document event:', event)
    if (saveInProgress) return
    saveInProgress = true
    let errorCode = 0
    try {
        if (!event.data?.data?.data) throw new Error('ONLYOFFICE did not provide document data')
        const { data, option } = event.data
        const outputFormat = c_oAscFileType2[option.outputformat] || 'DOCX'
        const converted = await convertBinToDocument(data.data, props.file.fileName, outputFormat)
        // The embedded editors also use onSave for Download As. actionType 6
        // means an exported copy and must never replace the opened LFOS file.
        const sourceFile = option.actionType === 6 ? null : props.file.file
        const lfosResult = await saveFileToLFOS(
            converted.data,
            converted.fileName,
            getDocumentMimeType(converted.fileName),
            sourceFile,
        )

        if (lfosResult === 'unavailable') {
            await saveDocumentToDevice(converted.data, converted.fileName)
        } else if (lfosResult === 'cancelled') {
            errorCode = 1
        }
    } catch (error) {
        errorCode = 1
        console.error('Could not save the document:', error)
    } finally {
        saveInProgress = false
        editor.value?.sendCommand({
            command: 'asc_onSaveCallback',
            data: { err_code: errorCode },
        })
    }
}

interface ExportEvent {
    data?: {
        url?: string
        fileType?: string
        title?: string
    }
}

function fileNameForExport(fileType: string, title?: string): string {
    const extension = fileType.trim().toLowerCase().replace(/^\./, '')
    const sourceName = title?.trim() || props.file.fileName
    const baseName = sourceName.replace(/\.[^.]+$/, '') || 'Document'
    return extension ? `${baseName}.${extension}` : sourceName
}

async function handleExportDocument(event: ExportEvent) {
    const exportUrl = event.data?.url
    const fileType = event.data?.fileType
    if (!exportUrl || !fileType) {
        console.error('ONLYOFFICE did not provide an export URL or file type', event)
        return
    }

    try {
        const response = await fetch(new URL(exportUrl, window.location.href))
        if (!response.ok) throw new Error(`Export request failed with ${response.status}`)
        const bytes = new Uint8Array(await response.arrayBuffer())
        const fileName = fileNameForExport(fileType, event.data?.title)
        const lfosResult = await saveFileToLFOS(
            bytes,
            fileName,
            getDocumentMimeType(fileName),
            null,
        )
        if (lfosResult === 'unavailable') {
            await saveDocumentToDevice(bytes, fileName)
        }
    } catch (error) {
        console.error('Could not export the document:', error)
    }
}

function applyLFOSFileMenuPolicy() {
    const editorFrame = document.querySelector<HTMLIFrameElement>('.editor-container > iframe')
    const editorDocument = editorFrame?.contentDocument
    if (!editorDocument || editorDocument.getElementById('lfos-file-menu-policy')) return

    const style = editorDocument.createElement('style')
    style.id = 'lfos-file-menu-policy'
    style.textContent = '#fm-btn-download-online { display: none !important; }'
    editorDocument.head.appendChild(style)
}

/**
 * 处理文件写入请求（主要用于处理粘贴的图片）
 * @param event - OnlyOffice 编辑器的文件写入事件
 */
function handleWriteFile(event: any) {
    try {
        console.log('Write file event:', event)

        const { data: eventData } = event
        if (!eventData) {
            console.warn('No data provided in writeFile event')
            return
        }

        const {
            data: imageData, // Uint8Array 图片数据
            file: fileName, // 文件名，如 "display8image-174799443357-0.png"
            target, // 目标对象，包含 frameOrigin 等信息
        } = eventData

        // 验证数据
        if (!imageData || !(imageData instanceof Uint8Array)) {
            throw new Error('Invalid image data: expected Uint8Array')
        }

        if (!fileName || typeof fileName !== 'string') {
            throw new Error('Invalid file name')
        }

        // 从文件名中提取扩展名
        const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'png'
        const mimeType = getMimeTypeFromExtension(fileExtension)

        // 创建 Blob 对象
        const blob = new Blob([imageData], { type: mimeType })

        // 创建对象 URL
        const objectUrl = URL.createObjectURL(blob)
        // 将图片设置为base64url
        //  const base64Url = `data:${mimeType};base64,${btoa(String.fromCharCode(...imageData))}`;
        // 将图片URL添加到媒体映射中，使用原始文件名作为key
        media[`media/${fileName}`] = objectUrl
        editor.value.sendCommand({
            command: 'asc_setImageUrls',
            data: {
                urls: media,
            },
        })

        editor.value.sendCommand({
            command: 'asc_writeFileCallback',
            data: {
                // 图片base64
                path: objectUrl,
                imgName: fileName,
            },
        })
        console.log(`Successfully processed image: ${fileName}, URL: ${media}`)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        console.error('Error handling writeFile:', error)

        // 通知编辑器文件处理失败
        if (editor.value && typeof editor.value.sendCommand === 'function') {
            editor.value.sendCommand({
                command: 'asc_writeFileCallback',
                data: {
                    success: false,
                    error: message,
                },
            })
        }

        if (event.callback && typeof event.callback === 'function') {
            event.callback({
                success: false,
                error: message,
            })
        }
    }
}

/**
 * 根据文件扩展名获取 MIME 类型
 * @param extension - 文件扩展名
 * @returns string - MIME 类型
 */
function getMimeTypeFromExtension(extension: string): string {
    const mimeMap: { [key: string]: string } = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        bmp: 'image/bmp',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        ico: 'image/x-icon',
        tiff: 'image/tiff',
        tif: 'image/tiff',
    }

    return mimeMap[extension?.toLowerCase()] || 'image/png'
}

// 组件卸载时清理对象 URL
onBeforeUnmount(() => {
    // 清理媒体资源的对象 URL
    Object.values(media).forEach((url) => {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            URL.revokeObjectURL(url)
        }
    })

    // 清理编辑器资源
    if (editor.value) {
        if (typeof editor.value.destroyEditor === 'function') {
            editor.value.destroyEditor()
        }
    }
})
</script>

<style scoped>
.editor-container {
    width: 100%;
    height: 100vh;
}

#iframe {
    width: 100%;
    height: 100%;
}
</style>

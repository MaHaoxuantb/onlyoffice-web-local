<template>
  <div class="home">
    <div class="top-operation-bar" v-if="!docmentObj?.fileName">
      <el-button type="primary" @click="showCreateDialog = true">New or open a file</el-button>
    </div>
    <div class="editor-content">
      <DocumentHandler
        v-if="docmentObj?.fileName"
        style="height: 100%; width: 100%"
        :file="docmentObj"
        ref="documentHandler"
      />
      <div class="main-content" v-else>
        <h1>ONLYOFFICE for LFOS</h1>
        <p>Create a document or open a Microsoft Office file to get started.</p>
      </div>
    </div>

    <el-dialog v-model="showCreateDialog" title="New or open a file" width="450px" center>
      <div id="panel-createnew">
        <div class="header">Create new</div>
        <div class="thumb-list">
          <div class="thumb-wrap" template="WORD" @click="onCreateNew('.docx')">
            <div class="thumb" style="background-image: url('./img/doc-formats/docx.png')"></div>
            <div class="title">Document</div>
          </div>
          <div class="thumb-wrap" template="EXCEL" @click="onCreateNew('.xlsx')">
            <div class="thumb" style="background-image: url('./img/doc-formats/xlsx.png')"></div>
            <div class="title">Spreadsheet</div>
          </div>
          <div class="thumb-wrap" template="PPT" @click="onCreateNew('.pptx')">
            <div class="thumb" style="background-image: url('./img/doc-formats/pptx.png')"></div>
            <div class="title">Presentation</div>
          </div>
        </div>
        <div class="header">Open</div>
        <div class="open-container">
          <el-button
            type="info"
            size="large"
            :icon="FolderOpened"
            :loading="isOpening"
            @click="onOpenDocument"
            plain
          >
            Open a file
          </el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script lang="ts" setup>
import { FolderOpened } from '@element-plus/icons-vue'
import { onMounted, ref } from 'vue'
import { DocmentType } from '@/utils/util'
import DocumentHandler from '../components/DocumentHandler.vue'
import { useRoute } from 'vue-router'
import { ElLoading, ElMessage } from 'element-plus'
import { getInitialLFOSFile, openFileFromLFOS } from '@/services/lfos'

const showCreateDialog = ref(false)
const documentHandler = ref<InstanceType<typeof DocumentHandler> | null>(null)
const docmentObj = ref<DocmentType | null>(null)
const isOpening = ref(false)
const route = useRoute()

const onCreateNew = (ext: string) => {
  docmentObj.value = {
    fileName: 'New document' + ext,
    file: null,
  }
  showCreateDialog.value = false
}

const onOpenDocument = async () => {
  isOpening.value = true
  try {
    const lfosResult = await openFileFromLFOS()
    if (lfosResult.status === 'opened') {
      showCreateDialog.value = false
      docmentObj.value = {
        fileName: lfosResult.file.name,
        file: lfosResult.file,
      }
      return
    }
    if (lfosResult.status === 'cancelled') return

    openWithBrowserPicker()
  } catch (error) {
    console.error('Could not open the file:', error)
    ElMessage.error('The file could not be opened. Please try again.')
  } finally {
    isOpening.value = false
  }
}

const openWithBrowserPicker = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.docx,.xlsx,.pptx,.doc,.xls,.ppt'

  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) {
      showCreateDialog.value = false
      docmentObj.value = {
        fileName: file.name,
        file: file,
      }
    }
  }

  input.click()
}

async function initFileUrl() {
  const url = route.query.url as string | undefined
  const filenameParam = route.query.filename as string | undefined
  if (!url) {
    return
  }
  const laodingInstance = ElLoading.service({
    lock: true,
    text: 'Loading',
    background: 'rgba(0, 0, 0, 0.7)',
  })
  try {
    const res = await fetch(url)

    if (!res.ok) throw new Error('The file request failed')
    const blob = await res.blob()
    let fileName = ''

    if (filenameParam) {
      fileName = filenameParam
    }

    if (!fileName) {
      const match = decodeURIComponent(url).match(/\/([^\/?#]+)$/)
      if (match && match[1].includes('.')) {
        fileName = match[1]
      }
    }

    if (!fileName) {
      const disposition = res.headers.get('Content-Disposition')
      if (disposition) {
        const match = disposition.match(/filename\*=UTF-8''(.+)|filename="?([^"]+)"?/)
        if (match) {
          fileName = decodeURIComponent(match[1] || match[2])
        }
      }
    }

    if (!fileName) {
      throw new Error('The file name could not be determined')
    }

    const file = new File([blob], fileName, { type: blob.type })
    docmentObj.value = { fileName, file }
    showCreateDialog.value = false
  } catch (err) {
    console.error('Could not load the remote file:', err)
    ElMessage.error('The remote file could not be loaded.')
  } finally {
    laodingInstance.close()
  }
}
onMounted(async () => {
  try {
    const activationFile = await getInitialLFOSFile()
    if (activationFile) {
      docmentObj.value = { fileName: activationFile.name, file: activationFile }
      return
    }
  } catch (error) {
    console.error('Could not open the LFOS activation file:', error)
    ElMessage.error('The LFOS file could not be opened.')
  }

  await initFileUrl()
})
</script>

<style lang="less" scoped>
.home {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f5f5f5;
}

.top-operation-bar {
  background-color: white;
  padding: 12px 20px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
  z-index: 10;
}

.editor-content {
  flex-grow: 1;
}

.main-content {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;

  h1 {
    margin-bottom: 20px;
  }
}

#panel-createnew {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  padding: 20px;
  .header {
    font-size: 18px;
    padding: 0 0 0 25px;
    white-space: nowrap;
    margin-top: 20px;
    margin-bottom: 20px;
  }

  .thumb-list {
    display: flex;
    justify-content: space-around;

    .thumb-wrap {
      display: inline-block;
      text-align: center;
      width: auto;
      cursor: pointer;
      vertical-align: top;
      border-radius: 4px;

      .thumb {
        width: 96px;
        height: 96px;
        background-repeat: no-repeat;
        background-position: center;
        margin: 12px 12px 0px 12px;
        background-size: contain;
      }

      .title {
        width: 104px;
        font-size: 14px;
        line-height: 14px;
        height: 28px;
        margin: 8px 8px 12px 8px;
        word-break: break-word;
        word-wrap: break-word;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
      }

      &:hover {
        background-color: #e0e0e0;
      }

      &:active {
        color: rgba(0, 0, 0, 0.8);
        background-color: #cbcbcb;
      }
    }
  }
}
.open-container {
  text-align: center;
  padding-bottom: 25px;
  margin-top: 20px;
}
</style>

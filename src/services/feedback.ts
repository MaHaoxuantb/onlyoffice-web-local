import { ElMessage } from 'element-plus'
import { showLFOSFeedback } from './lfos'

/** Show transient feedback in the owning LFOS app window or standalone page. */
export async function showAppMessage(message: string, type: 'error' | 'success' = 'error'): Promise<void> {
  try {
    if (await showLFOSFeedback(message)) return
  } catch (error) {
    console.warn('Could not show LFOS app feedback:', error)
  }

  ElMessage({ message, type })
}

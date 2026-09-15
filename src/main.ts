import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import AddModules from './modules/index'
import { showAppMessage } from './services/feedback'

// The bundled editor runs in a same-origin child frame and reports its own load errors here.
declare global {
  interface Window {
    onlyofficeShowFeedback?: (message: string) => void
  }
}
window.onlyofficeShowFeedback = (message) => { void showAppMessage(message) }

const app = createApp(App)
AddModules({ app, router })
app.use(createPinia())
app.use(router)
app.mount('#app')

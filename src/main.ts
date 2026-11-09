import { mount } from 'svelte'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/barlow-condensed/800.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/700.css'
import '@fontsource/permanent-marker/400.css'
import './app.css'
import App from './App.svelte'
import { registerSW } from 'virtual:pwa-register'

// New deploy → the service worker activates immediately and the page reloads itself.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    setInterval(check, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check())
  },
})
void updateSW

const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app

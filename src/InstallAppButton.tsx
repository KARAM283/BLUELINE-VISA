import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __blueLineInstallPrompt?: InstallPromptEvent
  }
}

export default function InstallAppButton({ isEnglish }: { isEnglish: boolean }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true
    setInstalled(isStandalone)

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      const installEvent = event as InstallPromptEvent
      window.__blueLineInstallPrompt = installEvent
      setPromptEvent(installEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
      window.__blueLineInstallPrompt = undefined
      setShowHelp(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    if (window.__blueLineInstallPrompt) setPromptEvent(window.__blueLineInstallPrompt)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function install() {
    if (installed) return
    if (!promptEvent) {
      setShowHelp(value => !value)
      return
    }
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setPromptEvent(null)
    window.__blueLineInstallPrompt = undefined
  }

  return (
    <div className="install-app-wrap">
      <button type="button" className={installed ? 'install-app-btn installed' : 'install-app-btn'} onClick={install} title={isEnglish ? 'Install Blue Line Visa' : 'تثبيت Blue Line Visa'} aria-label={isEnglish ? 'Install app' : 'تثبيت التطبيق'}>
        <Download size={16} />
        <span>{installed ? (isEnglish ? 'Installed' : 'مثبّت') : (isEnglish ? 'Install app' : 'تثبيت التطبيق')}</span>
      </button>
      {showHelp && !installed && (
        <div className="install-help-popover" role="status">
          <button className="install-help-close" type="button" onClick={() => setShowHelp(false)} aria-label={isEnglish ? 'Close' : 'إغلاق'}><X size={14}/></button>
          <strong>{isEnglish ? 'Install Blue Line Visa' : 'تثبيت Blue Line Visa'}</strong>
          <p>{isEnglish
            ? 'If the install window did not open, use the browser menu and choose “Install Blue Line Visa” or “Install this site as an app”.'
            : 'إذا لم تظهر نافذة التثبيت، افتح قائمة Edge وابحث عن «تثبيت Blue Line Visa» أو «تثبيت هذا الموقع كتطبيق».'}</p>
          <small>{isEnglish ? 'The install option appears after the browser finishes checking the app.' : 'قد يحتاج المتصفح لحظات حتى يتعرّف على التطبيق ويُظهر خيار التثبيت.'}</small>
        </div>
      )}
    </div>
  )
}

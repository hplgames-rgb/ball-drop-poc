import { createAppKit } from '@reown/appkit'
import { EthersAdapter } from '@reown/appkit-adapter-ethers'
import { baseSepolia } from '@reown/appkit/networks'

const projectId = 'ab7678a08e393da8bb80dfdac385d495'

const metadata = {
  name: 'HPL Ball Drop Alpha',
  description: 'HPL Games Ball Drop economic Alpha on Base Sepolia',
  url: 'https://hplgames-rgb.github.io',
  icons: []
}

const diag = document.getElementById('hplWalletDiag')
const say = (text) => {
  if (diag) diag.innerHTML = `<b>Wallet:</b> ${text}`
  console.log('[HPL 9.8 AppKit]', text)
}

try {
  const appKit = createAppKit({
    adapters: [new EthersAdapter()],
    networks: [baseSepolia],
    defaultNetwork: baseSepolia,
    metadata,
    projectId,
    features: {
      analytics: false,
      email: false,
      socials: []
    },
    themeMode: 'dark'
  })

  window.hplAppKit = appKit
  say('AppKit ready')

  let evmProvider = null
  let accountState = null
  let lastAdopted = ''

  async function syncToGame() {
    const address = accountState?.address
    const connected = accountState?.isConnected

    if (!connected || !address || !evmProvider) return

    // Avoid repeatedly re-hydrating the entire game for duplicate state emits.
    const key = `${address.toLowerCase()}:${String(accountState?.chainId ?? '')}`
    if (key === lastAdopted && window.hplWalletProvider === evmProvider) return
    lastAdopted = key

    say(`Account + provider ready • ${address.slice(0,6)}…${address.slice(-4)}`)
    await window.hplAdoptReownSession?.(address, evmProvider)
  }

  // Reown's documented Ethers flow exposes EVM providers under eip155.
  appKit.subscribeProviders((providers) => {
    console.log('[HPL 9.8 providers]', providers)
    evmProvider = providers?.['eip155'] || null

    if (evmProvider) {
      window.hplWalletProvider = evmProvider
      say('EVM provider received • waiting for account…')
    }

    syncToGame()
  })

  appKit.subscribeAccount((state) => {
    console.log('[HPL 9.8 account]', state)
    accountState = state

    if (state?.isConnected && state?.address) {
      say(`Account received • ${state.address.slice(0,6)}…${state.address.slice(-4)}`)
      syncToGame()
    } else if (state?.isConnected === false) {
      evmProvider = null
      lastAdopted = ''
      window.hplWalletProvider = null
      window.hplHandleReownDisconnect?.()
      say('Disconnected')
    }
  })

} catch (error) {
  console.error('Reown AppKit failed to initialize:', error)
  say(`AppKit load error • ${error?.message || 'unknown'}`)
}

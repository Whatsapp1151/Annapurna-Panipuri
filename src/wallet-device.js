// Installed mode is observable; installation from an ordinary browser tab is not.
export function walletProvider({userAgent='',platform='',maxTouchPoints=0,standalone=false}={}) {
  if (!standalone) return null;
  if (/iPhone|iPad|iPod/i.test(userAgent) || (platform==='MacIntel' && maxTouchPoints>1)) return 'apple';
  if (/Android/i.test(userAgent)) return 'google';
  return null;
}
export function currentWalletProvider() {
  return walletProvider({...{userAgent:navigator.userAgent,platform:navigator.platform,maxTouchPoints:navigator.maxTouchPoints},standalone:navigator.standalone===true || window.matchMedia('(display-mode: standalone)').matches});
}

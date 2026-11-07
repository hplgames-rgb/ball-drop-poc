const { chromium, devices } = require('playwright');
const fs = require('fs');
(async () => {
 fs.mkdirSync('mobile-wallet-diagnostics',{recursive:true});
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({...devices['Pixel 7'],locale:'en-US'});
 const logs=[];
 page.on('console',m=>logs.push('console '+m.type()+': '+m.text()));
 page.on('pageerror',e=>logs.push('pageerror: '+e.message));
 page.on('requestfailed',r=>logs.push('requestfailed: '+r.url()+' '+r.failure()?.errorText));
 page.on('response',r=>{if(/metamask-connect|v3-alpha\/index\.html/.test(r.url()))logs.push('response '+r.status()+' '+r.url())});
 try {
  await page.goto('https://hplgames-rgb.github.io/ball-drop-poc/v3-alpha/',{waitUntil:'domcontentloaded',timeout:45000});
  await page.waitForTimeout(5000);
  const snapshot=await page.evaluate(()=>({url:location.href,ua:navigator.userAgent,connector:!!window.HPLMetaMaskConnect?.createClient,buttons:[...document.querySelectorAll('button')].map(b=>({text:b.innerText,id:b.id})).filter(x=>/connect/i.test(x.text)).slice(0,12)}));
  logs.push('snapshot '+JSON.stringify(snapshot));
  const connect=page.getByRole('button',{name:/connect wallet/i}).first();
  if(await connect.count()) {
    await connect.click({timeout:10000});
    await page.waitForTimeout(7000);
  } else logs.push('No Connect Wallet button located');
  const result=await page.evaluate(()=>{
    const all=[];const visit=root=>{for(const el of root.querySelectorAll('*')){if(el.tagName.toLowerCase().startsWith('mm-'))all.push({tag:el.tagName,text:(el.shadowRoot?.textContent||el.textContent||'').slice(0,500)});if(el.shadowRoot)visit(el.shadowRoot)}};
    visit(document);
    return {modal:all.some(x=>/modal|connect|select/.test(x.tag.toLowerCase())&&/Scan to connect|Connect With Extension/i.test(x.text)),walletElements:all.slice(0,30),body:document.body.innerText.slice(-1600),connector:!!window.HPLMetaMaskConnect?.createClient};
  });
  logs.push('result '+JSON.stringify(result));
  await page.screenshot({path:'mobile-wallet-diagnostics/android.png',fullPage:true});
  if(result.modal||/Scan to connect with the MetaMask mobile app|Connect With Extension/.test(result.body))throw Error('Desktop/QR MetaMask dialog detected on Android emulation');
  if(!snapshot.connector)throw Error('MetaMask connector unavailable');
 } finally {
  fs.writeFileSync('mobile-wallet-diagnostics/trace.txt',logs.join('\n'));
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1});

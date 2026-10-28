const $=id=>document.getElementById(id);
const state={wallet:null,sessionToken:null,provider:null,expiresAt:null,authBusy:false};
const purchaseState={epoch:0,busy:false,balance:null,balanceError:false};
let testingPaused=true,activeTab='balance',nativeBalance=null,authGeneration=0,checkingTesting=false,installPrompt=null;
"use strict";
const CONFIG={url:"https://brvnzzkatyxfxpevukzt.supabase.co",key:"sb_publishable_N7wjJGUvFGcNznaPN_aFZQ_nnSVYmZ0"};
const MARKET={address:"0xc92c2f7359e20b336dfe14d6785f307194a14c4a",token:"0x7e8e2fbfdfc4337b926329dcceeb82440f51735c",chain:"0x14a34"};
const REFLECTIONS={address:"0x073741dfa10cab0d5f02f8dd4d8dbc817046df9a",claimTopic:"0xcaa03033c11df8560eb1a698ca7632211dfb8d82def73ba95db35495cd6a671b"};
const REWARDS={currentAddress:"0x34a09Bf81563dc8f7Ab796Dd0F4abBE8CFA48Fa2",legacyAddress:"0x019fb73bf80ce116210bcfb7514412ab99b6c218",claimTopic:"0x152b817a4d4f6150e6d3d4cff286dc596b7c82f44240434ac973fd8338b2a544"};
const rewardState={loaded:false,readBusy:false,busy:false,amount:null,sources:[],pendingByAddress:{},paused:false,feeExempt:false,pending:null,error:"",notice:"",lastRefresh:0};
const reflectionState={loaded:false,readBusy:false,claimBusy:false,amount:null,balance:null,feeExempt:false,paused:false,excluded:false,pending:null,error:"",notice:"",lastRefresh:0,balanceGeneration:0};
function formatEthEstimate(units){const n=BigInt(units);if(n>0n && n<100000000000000n)return "<0.0001";const ticks=(n+50000000000000n)/100000000000000n;const fraction=(ticks%10000n).toString().padStart(4,"0").replace(/0+$/,"");return `${(ticks/10000n).toLocaleString()}${fraction?"."+fraction:""}`;}
function formatBalance(units){const cents=BigInt(units)/10000000000000000n;return `${(cents/100n).toLocaleString()}.${(cents%100n).toString().padStart(2,"0")}`;}
function uintWord(n){const value=BigInt(n);if(value<0n || value>=2n**256n) throw new Error("Invalid transaction amount");return value.toString(16).padStart(64,"0");}
const walletProviders=new Map();
window.addEventListener("eip6963:announceProvider",event=>{
  const detail=event.detail;
  if(detail?.info?.uuid && typeof detail.provider?.request==="function") walletProviders.set(detail.info.uuid,detail);
});
window.dispatchEvent(new Event("eip6963:requestProvider"));
function selectWalletProvider(){
  const announced=[...walletProviders.values()].find(x=>x.info.rdns==="io.metamask");
  if(announced) return announced.provider;
  const injected=window.ethereum;
  return injected?.providers?.find(x=>x.isMetaMask) || (injected?.isMetaMask ? injected : null);
}

function reflectionClaimKey(wallet){return `hpl-v3-reflection-claim:${MARKET.chain}:${REFLECTIONS.address}:${wallet}`;}
function restoreReflectionClaim(){
  try{const hash=localStorage.getItem(reflectionClaimKey(state.wallet));reflectionState.pending=/^0x[0-9a-f]{64}$/i.test(hash||"")?hash:null;}catch{reflectionState.pending=null;}
  renderReflections();
}
function simulatedDollar(amount){if(amount===null)return "—";const cents=(amount+10n**18n/2n)/10n**18n;return "$"+(cents/100n).toLocaleString("en-US")+"."+(cents%100n).toString().padStart(2,"0");}
function renderReflections(){ $("walletDollarValue").textContent=simulatedDollar(reflectionState.balance);$("reflectionDollarValue").textContent=simulatedDollar(reflectionState.amount);
  $("quickWalletBalance").textContent=reflectionState.balance===null?"Connect your wallet":`${formatBalance(reflectionState.balance)} TEST-HPL`;$("quickReflections").textContent=reflectionState.amount===null?"Reflections: —":`Claimable reflections: ${formatBalance(reflectionState.amount)} TEST-HPL`;
  $("reflectionWalletBalance").textContent=reflectionState.balance===null?state.wallet?"Loading…":"Connect your wallet":`${formatBalance(reflectionState.balance)} TEST-HPL`;
  $("reflectionAmount").textContent=reflectionState.amount===null?"— TEST-HPL":`${formatBalance(reflectionState.amount)} TEST-HPL`;
  $("claimReflectionsBtn").disabled=!state.sessionToken || !state.provider || reflectionState.claimBusy || reflectionState.readBusy || purchaseState.busy || rewardState.busy ||
    (!reflectionState.pending && (!reflectionState.loaded || !reflectionState.feeExempt || reflectionState.paused || reflectionState.excluded || !(reflectionState.amount>0n)));
  $("claimReflectionsBtn").textContent=reflectionState.claimBusy?"Confirming claim…":reflectionState.pending?"Check claim confirmation":"Claim reflections";
  $("refreshReflectionsBtn").disabled=!state.sessionToken || !state.provider || reflectionState.readBusy || reflectionState.claimBusy || rewardState.busy;
  $("refreshReflectionsBtn").textContent=reflectionState.readBusy?"Refreshing…":"Refresh wallet";
  $("reflectionStatus").textContent=!state.wallet?"Connect your wallet to view reflections.":reflectionState.error||reflectionState.notice||
    (reflectionState.readBusy?"Refreshing wallet…":reflectionState.pending?"Claim receipt saved. Check confirmation before sending another claim.":
    !reflectionState.loaded?"Reflections unavailable · try Refresh wallet":reflectionState.excluded?"This wallet is excluded from reflections.":
    reflectionState.paused || !reflectionState.feeExempt?"Claims temporarily unavailable.":reflectionState.amount===0n?"No reflections to claim yet.":"Unclaimed reflections continue earning. Network fee shown in MetaMask.");
}
async function walletRpc(provider,method,params=[]){
  if(!hplClientActive())throw new Error("Wallet is idle. Return to this page and interact to refresh.");
  if(testingPaused)throw new Error("Alpha testing is paused. Ask the administrator to resume testing.");
  let timer;try{return await Promise.race([provider.request({method,params}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Wallet read timed out. Try Refresh wallet.")),12000);})]);}finally{clearTimeout(timer);}
}
async function reflectionSnapshot(wallet,provider,receiptBlock=null){
  if(!/^0x[0-9a-f]{40}$/i.test(wallet)) throw new Error("Invalid wallet address");
  if(await walletRpc(provider,"eth_chainId")!==MARKET.chain) throw new Error("Switch to Base Sepolia to view reflections.");
  const block=receiptBlock || await walletRpc(provider,"eth_blockNumber");
  const address=wallet.slice(2).padStart(64,"0"),ref=REFLECTIONS.address.slice(2).padStart(64,"0");
  const specs=[
    [REFLECTIONS.address,"0x720ec7cc"],[MARKET.token,"0xd1571e47"],
    [REFLECTIONS.address,"0xf3f2432e"+address],[REFLECTIONS.address,"0x4a2ae305"],
    [REFLECTIONS.address,"0xe6ba2648"+address],[MARKET.token,"0x4fbee193"+ref],
    [MARKET.token,"0x70a08231"+address]
  ];
  const values=await Promise.all(specs.map(([to,data])=>walletRpc(provider,"eth_call",[{to,data},block])));
  if("0x"+values[0].slice(-40).toLowerCase()!==MARKET.token || "0x"+values[1].slice(-40).toLowerCase()!==REFLECTIONS.address) throw new Error("Reflections configuration mismatch.");
  return {block,amount:BigInt(values[2]),paused:BigInt(values[3])!==0n,excluded:BigInt(values[4])!==0n,feeExempt:BigInt(values[5])!==0n,balance:BigInt(values[6])};
}
async function refreshReflections(){if(!hplClientActive())return;if(testingPaused)return;
  if(!state.sessionToken || !state.wallet || !state.provider || reflectionState.readBusy || reflectionState.claimBusy || rewardState.busy) return;
  const wallet=state.wallet,token=state.sessionToken,epoch=purchaseState.epoch,provider=state.provider,generation=reflectionState.balanceGeneration;
  reflectionState.readBusy=true;renderReflections();
  try{
    const snapshot=await reflectionSnapshot(wallet,provider);
    if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken || reflectionState.claimBusy || rewardState.busy || generation!==reflectionState.balanceGeneration) return;
    Object.assign(reflectionState,snapshot,{loaded:true,error:"",lastRefresh:Date.now()});
    purchaseState.balance=snapshot.balance;purchaseState.balanceError=false;renderNativeBalance();
  }catch(error){if(epoch===purchaseState.epoch && token===state.sessionToken){reflectionState.error=error.message;reflectionState.loaded=false;reflectionState.lastRefresh=Date.now();}}
  finally{if(epoch===purchaseState.epoch){reflectionState.readBusy=false;renderReflections();}}
}
async function waitReflectionClaim(hash,wallet,token,epoch,provider){
  for(let n=0;n<30;n++){
    if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken) return false;
    if(await walletRpc(provider,"eth_chainId")!==MARKET.chain) throw new Error("Reconnect on Base Sepolia to check the saved claim.");
    const receipt=await walletRpc(provider,"eth_getTransactionReceipt",[hash]);
    if(receipt){
      if(receipt.transactionHash?.toLowerCase()!==hash.toLowerCase()) throw new Error("Claim receipt mismatch.");
      if(BigInt(receipt.status)!==1n){reflectionState.pending=null;localStorage.removeItem?.(reflectionClaimKey(wallet));throw new Error("Claim transaction reverted. Your reflections remain onchain.");}
      // Smart-wallet relays change outer from/to. Trust only this distributor's event for this wallet.
      const claimed=(receipt.logs||[]).find(log=>!log.removed && log.address?.toLowerCase()===REFLECTIONS.address &&
        log.topics?.[0]?.toLowerCase()===REFLECTIONS.claimTopic && "0x"+log.topics?.[1]?.slice(-40).toLowerCase()===wallet);
      if(!claimed) throw new Error("No reflection claim for this wallet in the receipt. Keep the hash for troubleshooting.");
      reflectionState.pending=null;localStorage.removeItem?.(reflectionClaimKey(wallet));
      reflectionState.notice="Claim confirmed. Your wallet balance is being refreshed.";
      return true;
    }
    reflectionState.notice="Claim sent · waiting for confirmation…";renderReflections();
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  reflectionState.notice="Claim still pending. Its receipt is saved; use Check claim confirmation later.";
  return false;
}
async function claimReflections(){
  if(tradeState.busy || !state.sessionToken || !state.wallet || !state.provider || reflectionState.claimBusy || reflectionState.readBusy || purchaseState.busy || rewardState.busy) return;
  const wallet=state.wallet,token=state.sessionToken,epoch=purchaseState.epoch,provider=state.provider;
  let confirmed=false;reflectionState.claimBusy=true;reflectionState.error="";reflectionState.notice="Checking your claim…";renderReflections();renderWalletButtons();
  try{
    await assertPurchaseWallet(wallet,epoch);
    if(reflectionState.pending){confirmed=await waitReflectionClaim(reflectionState.pending,wallet,token,epoch,provider);return;}
    const snapshot=await reflectionSnapshot(wallet,provider);
    if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken) return;
    Object.assign(reflectionState,snapshot,{loaded:true});
    if(!snapshot.feeExempt || snapshot.paused) throw new Error("Claims temporarily unavailable.");
    if(snapshot.excluded) throw new Error("This wallet is excluded from reflections.");
    if(snapshot.amount<=0n) throw new Error("No reflections to claim yet.");
    const key=reflectionClaimKey(wallet);localStorage.setItem(key,"");localStorage.removeItem?.(key);
    await assertPurchaseWallet(wallet,epoch);
    reflectionState.notice="Confirm the reflection claim in MetaMask.";renderReflections();
    const hash=await provider.request({method:"eth_sendTransaction",params:[{from:wallet,to:REFLECTIONS.address,data:"0x82262808",value:"0x0"}]});
    if(!/^0x[0-9a-f]{64}$/i.test(hash)) throw new Error("Wallet returned an invalid claim transaction hash.");
    try{localStorage.setItem(key,hash);}catch{}
    if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken) return;
    reflectionState.pending=hash;
    confirmed=await waitReflectionClaim(hash,wallet,token,epoch,provider);
  }catch(error){if(epoch===purchaseState.epoch && token===state.sessionToken) reflectionState.error=error.code===4001?"Claim cancelled.":error.message;}
  finally{if(epoch===purchaseState.epoch){reflectionState.claimBusy=false;renderReflections();renderWalletButtons();if(confirmed){reflectionState.balanceGeneration++;reflectionState.notice="Claim confirmed. Wallet balance updated.";await refreshReflections();}}}
}
$("claimReflectionsBtn").addEventListener("click",()=>void claimReflections());
$("refreshReflectionsBtn").addEventListener("click",()=>{reflectionState.notice="";void refreshReflections();});
setInterval(()=>{if(!testingPaused && state.sessionToken && document.visibilityState!=="hidden" && Date.now()-reflectionState.lastRefresh>=30000) void refreshReflections();},30000);


const DEX={router:"0x837e965e801b64429cf4aa070a1834a578688497",factory:"0x37ee8c40b1103606695dc742caa636eccb2a7363",pair:"0x65926e01fa24f08f271d2051f99a3afe480fac60",weth:"0x4200000000000000000000000000000000000006"};
const tradeState={busy:false,quote:null,phase:"",side:"buy",mode:"receive",quoteVersion:0,quoting:false,timer:null};
function tradeKey(wallet){return `hpl-v3-trade:${wallet}`;}
function tradePending(){try{return JSON.parse(localStorage.getItem(tradeKey(state.wallet))||"null");}catch{return null;}}
function tradeAmount(text){if(!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(text)) throw new Error("Enter a positive amount with at most 18 decimal places.");const [a,b=""]=text.split(".");const n=BigInt(a)*10n**18n+BigInt(b.padEnd(18,"0"));if(n<=0n || n>=2n**256n)throw new Error("Invalid amount.");return n;}
function tradeNet(n,taxed){return taxed?n-n*350n/10000n-n*350n/10000n-n*300n/10000n:n;}
function tradePath(side){return (side==="buy"?[DEX.weth,MARKET.token]:[MARKET.token,DEX.weth]).map(a=>a.slice(2).padStart(64,"0"));}
function swapData(q,deadline){const tail=[uintWord(2),...tradePath(q.side)].join("");return q.side==="buy"?"0xb6f9de95"+[uintWord(q.min),uintWord(128),state.wallet.slice(2).padStart(64,"0"),uintWord(deadline)].join("")+tail:"0x791ac947"+[uintWord(q.amount),uintWord(q.min),uintWord(160),state.wallet.slice(2).padStart(64,"0"),uintWord(deadline)].join("")+tail;}
function renderTrade(){ $("tradeAmountHelp").textContent=$("tradeSide").value==="sell"?"Enter the HPL deducted from your wallet. Applicable tax is included in the estimate.":tradeState.mode==="receive"?"This is the amount you receive AFTER tax.":tradeState.mode==="usd"?"$100 targets 10,000 HPL after tax at the simulated $0.01 rate. You pay with test ETH; USD is not charged.":"Enter test ETH to spend. Keep some for network fees.";const pending=tradePending();if(!tradeState.busy && pending?.intent){tradeState.mode=pending.intent.mode||"spend";$("tradeSide").value=pending.intent.side;$("tradeAmount").value=pending.intent.text;$("tradeAmountLabel").textContent=pending.intent.side==="buy"?(tradeState.mode==="receive"?"HPL you want to receive":tradeState.mode==="usd"?"Simulated USD worth of HPL":"Spend test ETH"):"HPL you want to sell";}const locked=tradeState.busy || !!pending;$("buyModeControls").hidden=$("tradeSide").value!=="buy";for(const mode of ["spend","receive","usd"]){const b=$(mode==="spend"?"spendModeBtn":mode==="usd"?"usdModeBtn":"receiveModeBtn");b.disabled=locked;b.setAttribute?.("aria-pressed",String(tradeState.mode===mode));}$("tradeQuoteBtn").disabled=locked || !state.sessionToken;$("tradeSendBtn").disabled=tradeState.quoting || tradeState.busy || !state.sessionToken || (!pending && !tradeState.quote);$("tradeSendBtn").textContent=tradeState.busy?tradeState.phase||"Checking…":pending?"Continue confirmation":tradeState.quote?($("tradeSide").value==="buy"?"Buy TEST-HPL":"Sell TEST-HPL"):"Review quote first";$("tradeAmount").disabled=locked;for(const side of ["buy","sell"]){const tab=$(side==="buy"?"tradeBuyTab":"tradeSellTab");tab.disabled=locked;tab.setAttribute?.("aria-pressed",String($("tradeSide").value===side));}}
function chooseTrade(side){if(tradeState.busy || tradePending())return;$("tradeSide").value=side;tradeState.side=side;$("tradeAmount").value="";$("tradeAmount").placeholder=side==="buy"?(tradeState.mode==="receive"?"25000":tradeState.mode==="usd"?"100.00":"0.0001"):"1000";$("tradeAmountLabel").textContent=side==="buy"?(tradeState.mode==="receive"?"HPL you want to receive":tradeState.mode==="usd"?"Simulated USD worth of HPL":"Spend test ETH"):"HPL you want to sell";invalidateTrade();}
function invalidateTrade(){tradeState.quoting=false;tradeState.quoteVersion++;clearTimeout(tradeState.timer);tradeState.quote=null;$("tradeQuote").textContent="Enter an amount and get a quote.";renderTrade();if(state.sessionToken && $("tradeAmount").value.trim())tradeState.timer=setTimeout(()=>void getTradeQuote(),500);}
function chooseBuyMode(mode){if(tradeState.busy || tradePending())return;tradeState.mode=mode;$("tradeAmount").value="";$("tradeAmount").placeholder=mode==="receive"?"10000":mode==="usd"?"100.00":"0.0001";$("tradeAmountLabel").textContent=mode==="receive"?"HPL you want to receive":mode==="usd"?"Simulated USD worth of HPL":"Spend test ETH";invalidateTrade();}
function usdHplTarget(text){if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text))throw new Error("Enter a positive simulated USD amount with at most 2 decimal places.");const dollars=tradeAmount(text);const target=dollars*100n;if(target>=2n**256n)throw new Error("Amount is too large.");return target;}
function grossForNet(target,taxed){return taxed?(target*10000n+8999n)/9000n:target;}
function decodeQuoteAmounts(out){const words=out.slice(2).match(/.{64}/g);if(words?.length!==4 || BigInt("0x"+words[0])!==32n || BigInt("0x"+words[1])!==2n)throw new Error("Invalid pool quote.");return [BigInt("0x"+words[2]),BigInt("0x"+words[3])];}
async function dexQuote(wallet,epoch){
 await assertPurchaseWallet(wallet,epoch);const provider=state.provider,side=$("tradeSide").value,text=$("tradeAmount").value,mode=tradeState.mode,target=side==="buy" && mode!=="spend"?(mode==="usd"?usdHplTarget(text.trim()):tradeAmount(text.trim())):null,block=await walletRpc(provider,"eth_blockNumber");
 let amount=tradeAmount(text.trim());
 const call=(to,data)=>walletRpc(provider,"eth_call",[{to,data},block]);const aw=wallet.slice(2).padStart(64,"0"),pw=DEX.pair.slice(2).padStart(64,"0");
 const values=await Promise.all([call(DEX.router,"0xc45a0155"),call(DEX.router,"0xad5c4648"),call(DEX.factory,"0xe6a43905"+MARKET.token.slice(2).padStart(64,"0")+DEX.weth.slice(2).padStart(64,"0")),call(MARKET.token,"0xbff51ef8"),call(MARKET.token,"0x4563f30a"),call(MARKET.token,"0x4fbee193"+aw),call(MARKET.token,"0x4fbee193"+pw),call(MARKET.token,"0x70a08231"+aw),call(MARKET.token,"0xa2f90c43"+aw),walletRpc(provider,"eth_getBalance",[wallet,block])]);
 if("0x"+values[0].slice(-40).toLowerCase()!==DEX.factory || "0x"+values[1].slice(-40).toLowerCase()!==DEX.weth || "0x"+values[2].slice(-40).toLowerCase()!==DEX.pair)throw new Error("Test pool configuration mismatch.");
 if(BigInt(values[4]))throw new Error("Token transfers are paused.");const taxed=!!BigInt(values[3]) && !BigInt(values[5]) && !BigInt(values[6]);
 if(side==="sell" && (amount>BigInt(values[7]) || amount>BigInt(values[8])))throw new Error("Amount exceeds your token balance or remaining 24-hour sell allowance.");
 if(target!==null){const grossTarget=grossForNet(target,taxed);const needed=await call(DEX.router,"0x1f00ca74"+uintWord(grossTarget)+uintWord(64)+uintWord(2)+tradePath(side).join(""));amount=decodeQuoteAmounts(needed)[0];}
 if(side==="buy" && amount>=BigInt(values[9]))throw new Error("Leave some test ETH for gas.");
 const input=side==="sell"?tradeNet(amount,taxed):amount;const out=await call(DEX.router,"0xd06ca61f"+uintWord(input)+uintWord(64)+uintWord(2)+tradePath(side).join(""));
 const gross=decodeQuoteAmounts(out)[1],net=side==="buy"?tradeNet(gross,taxed):gross,min=target===null?net*95n/100n:target;if(min<=0n || net<min)throw new Error("Trade amount is too small or target cannot be reached.");
 await assertPurchaseWallet(wallet,epoch);return {side,amount,net,min,taxed,wallet,epoch,at:Date.now(),text,mode,target};
}
async function getTradeQuote(){if(!hplClientActive())return;if(testingPaused)return;if(tradeState.busy || purchaseState.busy || rewardState.busy || reflectionState.claimBusy || !state.sessionToken || tradePending())return;clearTimeout(tradeState.timer);const epoch=purchaseState.epoch,version=++tradeState.quoteVersion;tradeState.quoting=true;tradeState.quote=null;$("tradeQuote").textContent="Estimating…";renderTrade();try{const q=await dexQuote(state.wallet,epoch);if(epoch!==purchaseState.epoch || version!==tradeState.quoteVersion)return;if(q.side!==$("tradeSide").value || q.text!==$("tradeAmount").value || q.mode!==tradeState.mode)return;tradeState.quote=q;displayTradeQuote(q);$("tradeStatus").textContent=q.target!==null?"Your HPL target is the minimum receive amount. If the price moves against you, the trade reverts; refresh the estimate. Gas is additional.":"Estimate valid for 30 seconds · 5% slippage tolerance · gas additional.";}catch(e){if(epoch===purchaseState.epoch && version===tradeState.quoteVersion){$("tradeQuote").textContent="Estimate unavailable";$("tradeStatus").textContent=e.message;}}finally{if(epoch===purchaseState.epoch && version===tradeState.quoteVersion){tradeState.quoting=false;renderTrade();}}}

async function refreshTradeBalance(wallet,epoch,receiptBlock){
 reflectionState.balanceGeneration++;const generation=reflectionState.balanceGeneration;
 $("tradeStatus").textContent="Trade confirmed · updating wallet balance…";
 for(let n=0;n<3;n++){
  await assertPurchaseWallet(wallet,epoch);
  try{const snapshot=await reflectionSnapshot(wallet,state.provider);await assertPurchaseWallet(wallet,epoch);
   if(BigInt(snapshot.block)<BigInt(receiptBlock))throw new Error("Wallet node is catching up.");
   if(generation!==reflectionState.balanceGeneration)return;
   Object.assign(reflectionState,snapshot,{loaded:true,error:"",lastRefresh:Date.now()});purchaseState.balance=snapshot.balance;purchaseState.balanceError=false;renderNativeBalance();renderReflections();$("tradeStatus").textContent="Trade confirmed · wallet balance updated.";return;
  }catch(e){if(epoch!==purchaseState.epoch)throw e;if(n===2){$("tradeStatus").textContent="Trade confirmed. Balance refresh delayed; use Refresh wallet. Your trade was not resent.";return;}}
  await new Promise(r=>setTimeout(r,2000));
 }
}
async function checkTrade(pending,wallet,epoch){
 await assertPurchaseWallet(wallet,epoch);const receipt=await walletRpc(state.provider,"eth_getTransactionReceipt",[pending.hash]);await assertPurchaseWallet(wallet,epoch);
 if(!receipt)return false;
 if(receipt.transactionHash?.toLowerCase()!==pending.hash.toLowerCase())throw new Error("Receipt mismatch.");
 localStorage.removeItem?.(tradeKey(wallet));
 if(BigInt(receipt.status)!==1n)throw new Error("Transaction reverted. Get a new quote before retrying.");
 tradeState.quote=null;
 if(pending.stage!=="approval")await refreshTradeBalance(wallet,epoch,receipt.blockNumber);
 return true;
}
async function waitTrade(pending,wallet,epoch){
 tradeState.phase=pending.stage==="approval"?"Waiting for approval…":"Waiting for trade…";renderTrade();
 for(let n=0;n<30;n++){if(await checkTrade(pending,wallet,epoch))return true;$("tradeStatus").textContent=`${pending.stage==="approval"?"Approval":"Trade"} sent · waiting for confirmation. Hash: ${pending.hash}`;await new Promise(r=>setTimeout(r,2000));}
 $("tradeStatus").textContent="Still pending. Confirmation is saved; use Continue confirmation later.";return false;
}
function displayTradeQuote(q){const box=$("tradeQuote");box.replaceChildren();const rows=q.side==="buy"?[["You receive (after tax)",formatBalance(q.net)+" HPL"],["Estimated cost",formatEthEstimate(q.amount)+" test ETH"],["Simulated HPL value",simulatedDollar(q.net)]]:[["You sell",formatBalance(q.amount)+" HPL"],["Estimated receive",formatEthEstimate(q.net)+" test ETH"],["Simulated HPL value",simulatedDollar(q.amount)]];rows.push(["Token tax",q.taxed?"10% included":"Fee exempt"],["Minimum receive",q.side==="buy"?formatBalance(q.min)+" HPL":formatEthEstimate(q.min)+" test ETH"]);for(const [label,value] of rows){const row=document.createElement("div");row.className="trade-quote-row";const l=document.createElement("span"),v=document.createElement("strong");l.textContent=label;v.textContent=value;row.append(l,v);box.append(row);}}

async function submitTradeTransaction(q,stage,wallet,epoch){
 const provider=state.provider,to=stage==="approval"?MARKET.token:DEX.router;
 const data=stage==="approval"?"0x095ea7b3"+DEX.router.slice(2).padStart(64,"0")+uintWord(q.amount):swapData(q,Math.floor(Date.now()/1000)+300);
 const value=stage==="swap" && q.side==="buy"?"0x"+q.amount.toString(16):"0x0";
 await assertPurchaseWallet(wallet,epoch);await walletRpc(provider,"eth_call",[{from:wallet,to,data,value},"latest"]);await assertPurchaseWallet(wallet,epoch);
 if(Date.now()-q.at>30000)throw new Error("Quote expired. Get a fresh quote.");
 tradeState.phase=stage==="approval"?"Approve in MetaMask…":"Confirm in MetaMask…";renderTrade();$("tradeStatus").textContent=stage==="approval"?"Step 1 of 2: approve this TEST-HPL amount. The sell confirmation follows automatically.":"Confirm the trade in MetaMask. Network gas is additional.";
 const key=tradeKey(wallet);localStorage.setItem(key,"null");
 const hash=await provider.request({method:"eth_sendTransaction",params:[{from:wallet,to,data,value}]});if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error("Invalid transaction hash.");
 const pending={hash,stage,intent:{side:q.side,text:q.text,min:String(q.min),mode:q.mode}};
 try{localStorage.setItem(key,JSON.stringify(pending));}catch{throw new Error(`Transaction sent. Save this hash and check it in MetaMask: ${hash}`);}
 await assertPurchaseWallet(wallet,epoch);return pending;
}
async function continueApprovedSell(intent,wallet,epoch){
 if(!intent || intent.side!=="sell"){ $("tradeStatus").textContent="Approval confirmed. Get a fresh sell quote.";return;}
 if($("tradeSide").value!==intent.side || $("tradeAmount").value!==intent.text){$("tradeStatus").textContent="Approval confirmed. Restore your sell amount and get a fresh quote.";return;}
 tradeState.phase="Refreshing sell quote…";renderTrade();const fresh=await dexQuote(wallet,epoch);await assertPurchaseWallet(wallet,epoch);
 tradeState.quote=fresh;displayTradeQuote(fresh);
 if(fresh.min<BigInt(intent.min)){ $("tradeStatus").textContent="Approval confirmed. The price moved lower; review the updated quote and click Sell to continue.";return;}
 const allowance=BigInt(await walletRpc(state.provider,"eth_call",[{to:MARKET.token,data:"0xdd62ed3e"+wallet.slice(2).padStart(64,"0")+DEX.router.slice(2).padStart(64,"0")},"latest"]));await assertPurchaseWallet(wallet,epoch);
 if(allowance<fresh.amount)throw new Error("Approval is not available yet. Get a fresh quote to retry.");
 const swap=await submitTradeTransaction(fresh,"swap",wallet,epoch);tradeState.quote=null;await waitTrade(swap,wallet,epoch);
}
async function sendTrade(){
 if(tradeState.busy || purchaseState.busy || rewardState.busy || reflectionState.claimBusy || !state.sessionToken)return;
 const wallet=state.wallet,epoch=purchaseState.epoch;tradeState.busy=true;tradeState.phase="Checking wallet…";renderTrade();
 try{await assertPurchaseWallet(wallet,epoch);const pending=tradePending();
  if(pending){if(await waitTrade(pending,wallet,epoch) && pending.stage==="approval")await continueApprovedSell(pending.intent,wallet,epoch);return;}
  const q=tradeState.quote;if(!q || q.wallet!==wallet || q.epoch!==epoch || Date.now()-q.at>30000 || q.side!==$("tradeSide").value || q.text!==$("tradeAmount").value || q.mode!==tradeState.mode)throw new Error("Get a fresh quote before trading.");
  let stage="swap";
  if(q.side==="sell"){const allowance=BigInt(await walletRpc(state.provider,"eth_call",[{to:MARKET.token,data:"0xdd62ed3e"+wallet.slice(2).padStart(64,"0")+DEX.router.slice(2).padStart(64,"0")},"latest"]));await assertPurchaseWallet(wallet,epoch);if(allowance<q.amount)stage="approval";}
  const sent=await submitTradeTransaction(q,stage,wallet,epoch);tradeState.quote=null;
  if(await waitTrade(sent,wallet,epoch) && stage==="approval")await continueApprovedSell(sent.intent,wallet,epoch);
 }catch(e){if(epoch===purchaseState.epoch){tradeState.quote=null;$("tradeStatus").textContent=e.code===4001?"Transaction cancelled. Any confirmed approval remains available.":e.message;}}
 finally{if(epoch===purchaseState.epoch){tradeState.busy=false;tradeState.phase="";renderTrade();}}
}
$("tradeQuoteBtn").addEventListener("click",()=>void getTradeQuote());$("tradeSendBtn").addEventListener("click",()=>void sendTrade());$("tradeAmount").addEventListener("input",invalidateTrade);$("spendModeBtn").addEventListener("click",()=>chooseBuyMode("spend"));$("receiveModeBtn").addEventListener("click",()=>chooseBuyMode("receive"));$("usdModeBtn").addEventListener("click",()=>chooseBuyMode("usd"));$("tradeBuyTab").addEventListener("click",()=>chooseTrade("buy"));$("tradeSellTab").addEventListener("click",()=>chooseTrade("sell"));
setInterval(()=>{renderTrade();if(!testingPaused && activeTab==="trade" && $("tradeCard").open && document.visibilityState!=="hidden" && state.sessionToken && !tradeState.busy && !tradeState.quoting && !tradePending() && tradeState.quote && Date.now()-tradeState.quote.at>=25000)void getTradeQuote();},2000);


function rewardTargets(){
 const targets=[{address:REWARDS.legacyAddress,label:REWARDS.currentAddress?"Earlier rewards":"Game rewards"}];
 if(REWARDS.currentAddress){
  const address=REWARDS.currentAddress.toLowerCase();
  if(!/^0x[0-9a-f]{40}$/.test(address) || /^0x0{40}$/.test(address) || address===REWARDS.legacyAddress)throw new Error("Invalid current rewards configuration.");
  targets.unshift({address,label:"Current rewards"});
 }
 return targets;
}
function rewardClaimKey(wallet,address=REWARDS.legacyAddress){return `hpl-v3-game-claim:${MARKET.chain}:${address}:${wallet}`;}
function restoreRewardClaim(){
 rewardState.pendingByAddress={};
 for(const target of rewardTargets()){
  try{const hash=localStorage.getItem(rewardClaimKey(state.wallet,target.address));if(/^0x[0-9a-f]{64}$/i.test(hash||""))rewardState.pendingByAddress[target.address]=hash;}catch{}
 }
 rewardState.pending=nextSavedRewardClaim();renderGameRewards();
}
function nextSavedRewardClaim(){
 for(const target of rewardTargets())if(rewardState.pendingByAddress[target.address])return {...target,hash:rewardState.pendingByAddress[target.address]};
 return null;
}
function clearRewardClaim(wallet,address){
 delete rewardState.pendingByAddress[address];
 try{localStorage.removeItem(rewardClaimKey(wallet,address));}catch{}
 rewardState.pending=nextSavedRewardClaim();
}
function nextRewardTarget(){
 const pending=nextSavedRewardClaim();if(pending)return pending;
 for(const target of rewardTargets()){
  const row=rewardState.sources.find(r=>r.address===target.address);
  if(row?.loaded && !row.paused && row.feeExempt && row.amount>0n)return target;
 }
 return null;
}
function applyRewardSnapshot(snapshot){
 rewardState.sources=snapshot.sources;rewardState.amount=snapshot.amount;rewardState.loaded=snapshot.sources.some(s=>s.loaded);
 rewardState.pending=nextSavedRewardClaim();rewardState.lastRefresh=Date.now();
}
function renderGameRewards(){
 const known=rewardState.sources.filter(r=>r.loaded),partial=known.length<rewardTargets().length;
 const total=known.reduce((sum,r)=>sum+r.amount,0n);
 $("gameRewardDollarValue").textContent=known.length?`${partial?"At least ":""}${simulatedDollar(total)}`:"—";
 $("gameRewardAmount").textContent=known.length?`${partial?"At least ":""}${formatBalance(total)} TEST-HPL`:"— TEST-HPL";
 const breakdown=$("gameRewardSources");breakdown.replaceChildren();
 if(REWARDS.currentAddress){
  for(const target of rewardTargets()){
   const source=rewardState.sources.find(r=>r.address===target.address),line=document.createElement("p");line.className="mini";
   const amount=source?.loaded?`${simulatedDollar(source.amount)} · ${formatBalance(source.amount)} TEST-HPL`:"—";
   line.textContent=`${target.label}: ${amount}${rewardState.pendingByAddress[target.address]?" · confirmation pending":source?.error?" · refresh unavailable":source?.loaded && (source.paused || !source.feeExempt)?" · claims temporarily unavailable":""}`;
   breakdown.appendChild(line);
  }
 }
 const target=nextRewardTarget();
 $("claimGameRewardsBtn").disabled=!state.sessionToken || !state.provider || rewardState.busy || rewardState.readBusy || tradeState.busy || purchaseState.busy || reflectionState.claimBusy || !target;
 $("claimGameRewardsBtn").textContent=rewardState.busy?"Confirming claim…":rewardState.pending?"Check claim confirmation":target?`Claim ${target.label.toLowerCase()}`:"Claim game rewards";
 $("refreshGameRewardsBtn").disabled=!state.sessionToken || !state.provider || rewardState.busy || rewardState.readBusy;
 $("gameRewardStatus").textContent=!state.wallet?"Connect your wallet to view game rewards.":rewardState.error||rewardState.notice||
  (rewardState.readBusy?"Refreshing rewards…":rewardState.pending?"A claim is saved. Check its confirmation before sending another.":
   partial?"Some rewards could not be refreshed. Available rewards can still be claimed.":!rewardState.loaded?"Rewards unavailable · try Refresh rewards":
   total===0n?"No reserved rewards yet. Finalized round payouts appear after onchain confirmation.":
   !target?"Claims temporarily unavailable. Your rewards remain reserved.":
   REWARDS.currentAddress?"Current and earlier rewards are claimed separately. Each claim needs MetaMask confirmation.":"Claim up to 25 reward records at a time. Network fee shown in MetaMask.");
}
async function rewardSourceSnapshot(wallet,provider,address,block){
 const aw=wallet.slice(2).padStart(64,"0"),rw=address.slice(2).padStart(64,"0");
 const specs=[[address,"0x720ec7cc"],[address,"0x402914f5"+aw],[address,"0x4a2ae305"],[MARKET.token,"0x4fbee193"+rw]];
 const values=await Promise.all(specs.map(([to,data])=>walletRpc(provider,"eth_call",[{to,data},block])));
 if(values.some(v=>!/^0x[0-9a-f]{64}$/i.test(v)))throw new Error("Invalid Rewards response.");
 if("0x"+values[0].slice(-40).toLowerCase()!==MARKET.token)throw new Error("Rewards token configuration mismatch.");
 return {block,address,loaded:true,amount:BigInt(values[1]),paused:BigInt(values[2])!==0n,feeExempt:BigInt(values[3])!==0n,error:""};
}
async function rewardSnapshot(wallet,provider,receiptBlock=null){
 if(!/^0x[0-9a-f]{40}$/i.test(wallet))throw new Error("Invalid wallet address");
 if(await walletRpc(provider,"eth_chainId")!==MARKET.chain)throw new Error("Switch to Base Sepolia.");
 const block=receiptBlock || await walletRpc(provider,"eth_blockNumber"),targets=rewardTargets();
 const results=await Promise.allSettled(targets.map(t=>rewardSourceSnapshot(wallet,provider,t.address,block)));
 const sources=results.map((r,i)=>r.status==="fulfilled"?{...targets[i],...r.value}:{...targets[i],loaded:false,amount:null,paused:false,feeExempt:false,error:"Rewards read unavailable"});
 return {block,sources,amount:sources.every(s=>s.loaded)?sources.reduce((sum,s)=>sum+s.amount,0n):null};
}
async function refreshGameRewards(){if(!hplClientActive())return;if(testingPaused)return;
 if(!state.sessionToken || !state.provider || !state.wallet || rewardState.readBusy || rewardState.busy)return;
 const wallet=state.wallet,token=state.sessionToken,epoch=purchaseState.epoch,provider=state.provider;
 rewardState.readBusy=true;renderGameRewards();
 try{const snapshot=await rewardSnapshot(wallet,provider);if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken || rewardState.busy)return;applyRewardSnapshot(snapshot);rewardState.error="";}
 catch(error){if(epoch===purchaseState.epoch && wallet===state.wallet && token===state.sessionToken){rewardState.sources=[];rewardState.loaded=false;rewardState.amount=null;rewardState.error=error.message;rewardState.lastRefresh=Date.now();}}
 finally{if(epoch===purchaseState.epoch){rewardState.readBusy=false;renderGameRewards();}}
}
async function waitRewardClaim(hash,address,wallet,token,epoch,provider){
 for(let n=0;n<30;n++){
  if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken)return null;
  if(await walletRpc(provider,"eth_chainId")!==MARKET.chain)throw new Error("Reconnect on Base Sepolia to check this claim.");
  const receipt=await walletRpc(provider,"eth_getTransactionReceipt",[hash]);
  if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken)return null;
  if(receipt){
   if(receipt.transactionHash?.toLowerCase()!==hash.toLowerCase())throw new Error("Claim receipt mismatch.");
   if(BigInt(receipt.status)!==1n){clearRewardClaim(wallet,address);throw new Error("Claim reverted. Your rewards remain onchain.");}
   const claimed=(receipt.logs||[]).some(log=>!log.removed && log.address?.toLowerCase()===address && log.topics?.length===4 && log.topics[0]?.toLowerCase()===REWARDS.claimTopic && "0x"+log.topics[3]?.slice(-40).toLowerCase()===wallet);
   if(!claimed)throw new Error("No game reward claim for this wallet in the receipt. Keep the saved hash for troubleshooting.");
   clearRewardClaim(wallet,address);return receipt;
  }
  rewardState.notice="Claim sent · waiting for confirmation…";renderGameRewards();
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 rewardState.notice="Still pending. Receipt saved; use Check claim confirmation later.";return null;
}
async function refreshConfirmedGameClaim(receipt,wallet,token,epoch,provider){
 if(!/^0x[0-9a-f]+$/i.test(receipt.blockNumber||"")){rewardState.notice="Claim confirmed · use Refresh rewards and Refresh wallet.";renderGameRewards();return;}
 const generation=++reflectionState.balanceGeneration;
 const current=()=>epoch===purchaseState.epoch && wallet===state.wallet && token===state.sessionToken && generation===reflectionState.balanceGeneration;
 rewardState.notice="Claim confirmed · updating rewards and wallet balance…";renderGameRewards();
 let rewardsUpdated=false,balanceUpdated=false;
 for(let attempt=0;attempt<3;attempt++){
  if(!current())return;
  const [rewardRead,balanceRead]=await Promise.allSettled([
   rewardsUpdated?Promise.resolve(null):rewardSnapshot(wallet,provider,receipt.blockNumber),
   balanceUpdated?Promise.resolve(null):reflectionSnapshot(wallet,provider,receipt.blockNumber)
  ]);
  if(!current())return;
  if(rewardRead.status==="fulfilled" && rewardRead.value){
   applyRewardSnapshot(rewardRead.value);rewardState.error="";rewardsUpdated=rewardRead.value.sources.every(r=>r.loaded);
  }
  if(balanceRead.status==="fulfilled" && balanceRead.value){
   Object.assign(reflectionState,balanceRead.value,{loaded:true,error:"",lastRefresh:Date.now()});
   purchaseState.balance=balanceRead.value.balance;purchaseState.balanceError=false;balanceUpdated=true;renderNativeBalance();renderReflections();
  }
  if(rewardsUpdated && balanceUpdated){rewardState.notice="Claim confirmed · wallet balance updated.";renderGameRewards();return;}
  renderGameRewards();
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,1500));
 }
 if(current()){rewardState.notice="Claim confirmed · refresh delayed. Use Refresh rewards or Refresh wallet; your claim is saved onchain.";renderGameRewards();}
}
async function claimGameRewards(){
 if(!state.sessionToken || !state.wallet || !state.provider || rewardState.busy || rewardState.readBusy || tradeState.busy || purchaseState.busy || reflectionState.claimBusy)return;
 const wallet=state.wallet,token=state.sessionToken,epoch=purchaseState.epoch,provider=state.provider,requested=nextRewardTarget();
 let receipt=null;rewardState.busy=true;rewardState.error="";rewardState.notice="Checking your rewards…";renderGameRewards();renderReflections();renderWalletButtons();
 try{
  await assertPurchaseWallet(wallet,epoch);
  const saved=nextSavedRewardClaim();
  if(saved){receipt=await waitRewardClaim(saved.hash,saved.address,wallet,token,epoch,provider);return;}
  const snapshot=await rewardSnapshot(wallet,provider);
  if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken)return;
  applyRewardSnapshot(snapshot);
  const target=requested || nextRewardTarget(),source=snapshot.sources.find(s=>s.address===target?.address);
  if(!source?.loaded)throw new Error("Rewards could not be verified. Try Refresh rewards.");
  if(source.paused || !source.feeExempt)throw new Error("Claims temporarily unavailable for these rewards.");
  if(source.amount<=0n)throw new Error("No rewards to claim here yet.");
  const address=source.address,key=rewardClaimKey(wallet,address);localStorage.setItem(key,"");localStorage.removeItem(key);
  const tx={from:wallet,to:address,data:"0x4e71d92d",value:"0x0"};
  await walletRpc(provider,"eth_call",[tx,"latest"]);await assertPurchaseWallet(wallet,epoch);
  rewardState.notice=`Confirm the ${source.label.toLowerCase()} claim in MetaMask.`;renderGameRewards();
  const hash=await provider.request({method:"eth_sendTransaction",params:[tx]});
  if(!/^0x[0-9a-f]{64}$/i.test(hash))throw new Error("Wallet returned an invalid claim hash.");
  try{localStorage.setItem(key,hash);}catch{if(epoch===purchaseState.epoch)rewardState.notice=`Save this claim hash: ${hash}`;}
  if(epoch!==purchaseState.epoch || wallet!==state.wallet || token!==state.sessionToken)return;
  rewardState.pendingByAddress[address]=hash;rewardState.pending=nextSavedRewardClaim();
  receipt=await waitRewardClaim(hash,address,wallet,token,epoch,provider);
 }catch(error){if(epoch===purchaseState.epoch && wallet===state.wallet && token===state.sessionToken)rewardState.error=error.code===4001?"Claim cancelled.":error.message;}
 finally{if(epoch===purchaseState.epoch){
  if(receipt){await refreshConfirmedGameClaim(receipt,wallet,token,epoch,provider);if(epoch===purchaseState.epoch){rewardHistory.generation++;rewardHistory.busy=false;void refreshRewardHistory();}}
  if(epoch===purchaseState.epoch){rewardState.busy=false;renderGameRewards();renderReflections();renderWalletButtons();}
 }}
}
$("claimGameRewardsBtn").addEventListener("click",()=>void claimGameRewards());
$("refreshGameRewardsBtn").addEventListener("click",()=>{rewardState.notice="";void refreshGameRewards();if((activeTab==="rewards" || activeTab==="history"))void refreshRewardHistory();});
// Only poll while the full wallet is open; no per-ball or extra Supabase requests.
setInterval(()=>{if(!testingPaused && (activeTab==="rewards" || activeTab==="history") && document.visibilityState!=="hidden" && state.sessionToken && Date.now()-rewardState.lastRefresh>=30000)void refreshGameRewards();renderGameRewards();},30000);

const rewardHistory={rows:[],loaded:false,busy:false,error:"",offset:0,more:false,generation:0};
function renderRewardHistory(){
 const list=$("rewardHistoryList");list.replaceChildren();
 $("refreshRewardHistoryBtn").disabled=!state.sessionToken||rewardHistory.busy;
 $("moreRewardHistoryBtn").hidden=!state.sessionToken||!rewardHistory.more;
 $("moreRewardHistoryBtn").disabled=rewardHistory.busy;
 $("rewardHistoryStatus").textContent=!state.wallet?"Connect your wallet to view rewards history.":rewardHistory.error||(rewardHistory.busy?"Loading reward history…":!rewardHistory.loaded?"Open your wallet or refresh to load rewards history.":!rewardHistory.rows.length?"No game rewards earned yet. Your confirmed awards will appear here.":`${rewardHistory.rows.length} reward records shown · newest first. Time shown is when each reward was awarded.`);
 for(const row of rewardHistory.rows){
  const item=document.createElement("div");item.className="reward-history-row";item.dataset.status=row.status;
  const left=document.createElement("div"),title=document.createElement("strong"),date=document.createElement("small");
  title.textContent=row.round_number!==null?`${row.tournament?"Tournament ending at round":"Ball Drop · Round"} ${row.round_number}`:`Ball Drop · Reward event ${row.event_id}`;
  const when=new Date(row.awarded_at);date.textContent=Number.isFinite(when.getTime())?when.toLocaleString(undefined,{year:"numeric",month:"short",day:"numeric",hour:"numeric",minute:"2-digit",second:"2-digit",timeZoneName:"short"}):"Award date unavailable";
  left.appendChild(title);left.appendChild(date);
  const right=document.createElement("div"),amount=document.createElement("strong"),status=document.createElement("small");right.className="reward-history-amount";
  amount.textContent=`${formatBalance(BigInt(row.amount))} HPL`;
  status.textContent=({claimed:"Claimed",unclaimed:"Unclaimed",expired:"Expired",reclaimed:"Expired · reclaimed"})[row.status]||"Status unavailable";
  right.appendChild(amount);right.appendChild(status);item.appendChild(left);item.appendChild(right);list.appendChild(item);
 }
}
async function refreshRewardHistory(older=false){
 if(!state.sessionToken||!state.wallet||rewardHistory.busy)return;
 const wallet=state.wallet,token=state.sessionToken,generation=++rewardHistory.generation;
 const offset=older?rewardHistory.offset:0;
 rewardHistory.busy=true;rewardHistory.error="";renderRewardHistory();
 try{
  const data=await edgeRequest("game-reward-history",{session_token:token,offset});
  if(generation!==rewardHistory.generation||wallet!==state.wallet||token!==state.sessionToken)return;
  if(!Array.isArray(data.rows)||data.rows.some(r=>typeof r.id!=="string"||!/^\d+$/.test(r.amount)||!Number.isFinite(Date.parse(r.awarded_at))))throw new Error("Invalid reward history. Please refresh.");
  const rows=new Map((older?rewardHistory.rows:[]).map(r=>[r.id,r]));for(const row of data.rows)rows.set(row.id,row);
  rewardHistory.rows=[...rows.values()].sort((a,b)=>b.awarded_at.localeCompare(a.awarded_at)||a.id.localeCompare(b.id));
  rewardHistory.offset=data.next_offset;rewardHistory.more=data.has_more===true;rewardHistory.loaded=true;
 }catch(error){if(generation===rewardHistory.generation)rewardHistory.error=error.message;}
 finally{if(generation===rewardHistory.generation){rewardHistory.busy=false;renderRewardHistory();}}
}
$("refreshRewardHistoryBtn").addEventListener("click",()=>void refreshRewardHistory());
$("moreRewardHistoryBtn").addEventListener("click",()=>void refreshRewardHistory(true));


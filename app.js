// app.js — Smart Crypto Advisor frontend (v2)
// Uses backend (Render) endpoints and CoinGecko fallback. Provides AI analysis, indicators, Chart.js + TradingView toggle.

const $ = id => document.getElementById(id);
const BACKEND = (window.APP_CONFIG && window.APP_CONFIG.BACKEND_BASE) ? window.APP_CONFIG.BACKEND_BASE.replace(/\/+$/,'') : '';

const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const defaultSymbols = ['BTCUSDT','ETHUSDT','HOLOUSDT'];

// Simple mapping for CoinGecko ids (expandable)
const coinMap = { BTC: 'bitcoin', ETH: 'ethereum', HOLO: 'holoworld-ai', BNB: 'binancecoin', ADA: 'cardano', SOL: 'solana' };

function setStatus(t){ $('status').innerText = 'Status: ' + t; }
function setBackendField(){ $('backendUrl').value = BACKEND || 'none'; }

// Symbol management
function loadSymbols(){
  let list = JSON.parse(localStorage.getItem('SYMBOLS') || '[]');
  if(!list || list.length===0) list = defaultSymbols;
  renderSymbolList(list);
}

function renderSymbolList(list){
  const ul = $('symbolList'); ul.innerHTML = '';
  const sel = $('symbolSelect'); sel.innerHTML = '';
  list.forEach(s=>{
    const li = document.createElement('li');
    const btn = document.createElement('button'); btn.textContent = s; btn.onclick = ()=> selectSymbol(s);
    const rm = document.createElement('button'); rm.textContent='Remove'; rm.onclick = ()=> removeSymbol(s);
    li.appendChild(btn); li.appendChild(rm); ul.appendChild(li);
    const opt = document.createElement('option'); opt.value = s; opt.text = s; sel.appendChild(opt);
  });
  localStorage.setItem('SYMBOLS', JSON.stringify(list));
}

function addSymbol(){
  const s = $('newSymbol').value.trim().toUpperCase();
  if(!s) return alert('Enter symbol');
  const list = JSON.parse(localStorage.getItem('SYMBOLS')||'[]');
  if(!list.includes(s)) list.unshift(s);
  localStorage.setItem('SYMBOLS', JSON.stringify(list));
  renderSymbolList(list);
  $('newSymbol').value='';
}

function removeSymbol(sym){
  const list = JSON.parse(localStorage.getItem('SYMBOLS')||'[]').filter(x=>x!==sym);
  localStorage.setItem('SYMBOLS', JSON.stringify(list));
  renderSymbolList(list);
}

document.getElementById('addSymbolBtn')?.addEventListener('click', addSymbol);

// Portfolio local
document.getElementById('addAssetBtn')?.addEventListener('click', ()=>{
  const sym = document.getElementById('assetSym').value.trim().toUpperCase();
  const qty = Number(document.getElementById('assetQty').value), cost = Number(document.getElementById('assetCost').value);
  if(!sym||!qty||!cost) return alert('Fill fields');
  const pf = JSON.parse(localStorage.getItem('PORTFOLIO')||'[]'); pf.push({symbol:sym, qty, cost});
  localStorage.setItem('PORTFOLIO', JSON.stringify(pf)); renderPortfolio();
});

function renderPortfolio(){
  const pf = JSON.parse(localStorage.getItem('PORTFOLIO')||'[]');
  const tbody = document.getElementById('portfolioTable').querySelector('tbody'); tbody.innerHTML='';
  const last = priceChart && priceChart.data.datasets[0].data.length ? priceChart.data.datasets[0].data.slice(-1)[0] : 0;
  pf.forEach(a=>{
    const cur = last || 0; const value = a.qty * cur; const cost = a.qty * a.cost; const pl = value - cost;
    tbody.innerHTML += `<tr><td>${a.symbol}</td><td>${a.qty}</td><td>${a.cost}</td><td>${cur.toFixed(6)}</td><td>${pl.toFixed(6)}</td></tr>`;
  });
}

// Chart setup
let priceChart = null;
function makeChart(){
  const ctx = document.getElementById('priceChart').getContext('2d');
  if(priceChart) priceChart.destroy();
  priceChart = new Chart(ctx, {type:'line', data:{labels:[], datasets:[{label:'Close', data:[], borderColor:'#00ffb3'}]}, options:{animation:false, responsive:true}});
}

function selectSymbol(sym){
  document.getElementById('symbolSelect').value = sym; analyzeSelected();
}

document.getElementById('analyzeBtn')?.addEventListener('click', analyzeSelected);

async function analyzeSelected(){
  const sym = document.getElementById('symbolSelect').value;
  const interval = document.getElementById('intervalSelect').value;
  if(!sym) return alert('Select symbol');
  makeChart();
  setStatus('Fetching data for ' + sym);

  // Try backend klines
  let klines = null;
  if(BACKEND){
    try{
      const res = await fetch(`${BACKEND}/api/klines?symbol=${sym}&interval=${interval}&limit=500`);
      if(res.ok) klines = await res.json();
    } catch(e){ console.warn('backend klines failed', e); }
  }

  // CoinGecko fallback
  if(!klines || klines.length===0){
    const base = sym.replace(/USDT$/,'');
    const cg = coinMap[base] || base.toLowerCase();
    if(cg){
      try{
        setStatus('Using CoinGecko for ' + cg);
        const days = interval === '1d' ? 30 : 7;
        const url = `${COINGECKO_API}/coins/${cg}/ohlc?vs_currency=usd&days=${days}`;
        const r = await fetch(url);
        if(r.ok){
          const data = await r.json();
          klines = data.map(d=>({t:d[0], o:+d[1], h:+d[2], l:+d[3], c:+d[4], v:0}));
        }
      } catch(e){ console.warn('CoinGecko failed', e); }
    }
  }

  // Binance REST as last resort
  if(!klines || klines.length===0){
    try{
      setStatus('Trying Binance REST (may be blocked by CORS)');
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=500`);
      const data = await r.json();
      klines = data.map(k=>({t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]}));
    } catch(e){ console.warn('Binance REST failed', e); }
  }

  if(!klines || klines.length===0){
    setStatus('Failed to fetch klines. Configure backend or pick supported coin.');
    document.getElementById('forecastSummary').innerText = 'No data available.'; return;
  }

  // Draw chart
  const labels = klines.map(k=>new Date(k.t));
  const closes = klines.map(k=>k.c);
  priceChart.data.labels = labels; priceChart.data.datasets[0].data = closes; priceChart.update();
  document.getElementById('price').innerText = closes[closes.length-1].toFixed(8);

  // Compute indicators
  const rsi14 = arrLast(rsi(closes,14)) || 0;
  const ema20Val = arrLast(ema(closes,20)) || 0;
  const macdHist = arrLast(macd(closes).hist) || 0;
  const atrVal = arrLast(atr(klines.map(x=>x.h),klines.map(x=>x.l),closes,14)) || 0;

  // Show liquidity via backend if available
  if(BACKEND){
    try{
      const r = await fetch(`${BACKEND}/api/price/${sym.replace(/USDT$/,'').toLowerCase()}`);
      if(r.ok){ const j = await r.json(); document.getElementById('liq').innerText = j.price ? 'ok' : 'n/a'; }
    } catch(e){ console.warn('liquidity fetch failed', e); document.getElementById('liq').innerText='n/a'; }
  } else document.getElementById('liq').innerText = 'fallback';

  // local prediction & AI analysis
  const pred = simpleLinearPredict(closes);
  document.getElementById('forecastSummary').innerText = `Local linear-next prediction: ${pred.toFixed(8)}`;
  const ai = await getAIAnalysis(sym, closes[closes.length-1], { rsi: rsi14, ema: ema20Val, macd: macdHist, atr: atrVal });
  document.getElementById('aiAnalysis').innerText = ai;

  renderPortfolio();
}

// Indicators implementations (SMA, EMA, RSI, MACD, ATR) - trimmed implementations
function ema(values, period){
  const out=[]; const k=2/(period+1); let prev=null;
  for(let i=0;i<values.length;i++){ const v=values[i]; if(prev==null){ prev=v; out.push(prev);} else { prev=v*k + prev*(1-k); out.push(prev);} }
  for(let i=0;i<period-1;i++) out[i]=null; return out;
}
function sma(values, p){ const out=[]; for(let i=0;i<values.length;i++){ if(i<p-1) out.push(null); else out.push(values.slice(i-p+1,i+1).reduce((a,b)=>a+b,0)/p); } return out; }
function rsi(values, period=14){ if(values.length<period+1) return Array(values.length).fill(null); const out=[null]; let gains=0,losses=0; for(let i=1;i<=period;i++){ const d=values[i]-values[i-1]; if(d>0) gains+=d; else losses+=Math.abs(d);} let avgG=gains/period, avgL=losses/period; out.push(100-(100/(1+(avgG/(avgL||1))))); for(let i=period+1;i<values.length;i++){ const d=values[i]-values[i-1]; const g=d>0?d:0; const l=d<0?Math.abs(d):0; avgG=(avgG*(period-1)+g)/period; avgL=(avgL*(period-1)+l)/period; const rs=avgG/(avgL||1); out.push(100-(100/(1+rs))); } while(out.length<values.length) out.unshift(null); return out; }
function macd(values, fast=12, slow=26, sig=9){ const ef=ema(values,fast), es=ema(values,slow); const macdLine=values.map((v,i)=> (ef[i]!=null&&es[i]!=null)?ef[i]-es[i]:null); const signal=ema(macdLine.map(v=>v==null?0:v),sig); const hist=macdLine.map((v,i)=> (v!=null&&signal[i]!=null)? v-signal[i]:null); return {macdLine,signal,hist}; }
function atr(highs,lows,closes,p=14){ const trs=[null]; for(let i=1;i<closes.length;i++){ const tr=Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1])); trs.push(tr);} const out=[]; let sum=0; for(let i=0;i<trs.length;i++){ if(i<p){ sum += trs[i]||0; out.push(null);} else { sum = sum - (trs[i-p]||0) + (trs[i]||0); out.push(sum/p);} } return out; }
function arrLast(a){ if(!a) return null; for(let i=a.length-1;i>=0;i--) if(a[i]!=null) return a[i]; return null; }

// Simple linear log predictor
function simpleLinearPredict(closes){
  const n = Math.min(30, closes.length); const slice = closes.slice(-n); const x = slice.map((v,i)=>i); const y = slice.map(v=>Math.log(v)); const xAvg = x.reduce((a,b)=>a+b,0)/n; const yAvg = y.reduce((a,b)=>a+b,0)/n; let num=0,den=0; for(let i=0;i<n;i++){ num += (x[i]-xAvg)*(y[i]-yAvg); den += (x[i]-xAvg)*(x[i]-xAvg); } const slope = den===0?0:num/den; const intercept = yAvg - slope*xAvg; return Math.exp(intercept + slope*(n)); }

// Lightweight AI text analysis (client-side rules)
async function getAIAnalysis(symbol, price, indicators){
  const rsi = indicators.rsi, emaVal = indicators.ema, macdHist = indicators.macd, atr = indicators.atr;
  let out = `AI analysis for ${symbol.toUpperCase()}: `;
  if(rsi > 70) out += 'RSI in overbought zone — caution for pullback. '; else if(rsi < 30) out += 'RSI oversold — possible buying opportunity. ';
  if(macdHist > 0) out += 'Momentum (MACD) looks positive. '; else out += 'Momentum weakening. ';
  if(price > emaVal) out += 'Price above EMA → trend bias up. '; else out += 'Price below EMA → trend bias down. ';
  const buyZone = emaVal * 0.98, sellZone = emaVal * 1.02;
  out += `Buy zone ~ ${buyZone.toFixed(6)}, Sell zone ~ ${sellZone.toFixed(6)}.`;
  return out;
}

// init
window.addEventListener('load', ()=>{ setBackendField(); loadSymbols(); makeChart(); renderPortfolio(); setStatus('Ready'); });

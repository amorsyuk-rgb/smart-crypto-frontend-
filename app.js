// app.js — Netlify frontend (revised)
// - Uses backend if configured (Render). Otherwise falls back to CoinGecko for history and price.
// - Uses Binance WebSocket for live trades when symbol is on Binance (no API key).
// - Symbol list editable and stored in localStorage; attempts to sync to backend if available.

const $ = id => document.getElementById(id);
let backendUrl = localStorage.getItem('BACKEND_URL') || '';
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
let priceChart = null;
let currentWS = null;

// basic known mapping for common tickers to CoinGecko ids
const coinMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  BNB: 'binancecoin',
  ADA: 'cardano',
  SOL: 'solana',
  HOLO: 'holoworld-ai',
  USDT: null
};

function setStatus(t){ $('status').innerText = 'Status: ' + t; }
function saveBackend(url){
  backendUrl = url.replace(/\/+$/,'');
  localStorage.setItem('BACKEND_URL', backendUrl);
  setStatus('Backend saved: ' + backendUrl);
  loadSymbols();
}

$('saveBackend').addEventListener('click', ()=> {
  const u = $('backendUrl').value.trim();
  if(!u) return alert('Enter backend URL or clear to use fallback');
  saveBackend(u);
});

// SYMBOLS — try backend, otherwise localStorage
async function loadSymbols(){
  $('backendUrl').value = backendUrl;
  let list = [];
  if(backendUrl){
    try{
      const r = await fetch(backendUrl + '/api/symbols');
      if(r.ok){
        const data = await r.json();
        list = data.map(x => x.symbol);
      }
    } catch(e){ console.warn('Backend symbols fetch failed', e); }
  }
  if(!list || list.length === 0){
    list = JSON.parse(localStorage.getItem('SYMBOLS') || '["BTCUSDT","ETHUSDT","HOLOUSDT"]');
  }
  renderSymbolList(list);
}

function renderSymbolList(list){
  const ul = $('symbolList'); ul.innerHTML = '';
  const sel = $('symbolSelect'); sel.innerHTML = '';
  list.forEach(s=>{
    const li = document.createElement('li');
    const btnSel = document.createElement('button');
    btnSel.textContent = s;
    btnSel.onclick = ()=> { selectSymbol(s); };
    const rm = document.createElement('button'); rm.textContent='Remove';
    rm.onclick = ()=> removeSymbol(s);
    li.appendChild(btnSel);
    li.appendChild(rm);
    ul.appendChild(li);
    const opt = document.createElement('option'); opt.value = s; opt.text = s; sel.appendChild(opt);
  });
  localStorage.setItem('SYMBOLS', JSON.stringify(list));
}

async function addSymbol(){
  const s = $('newSymbol').value.trim().toUpperCase();
  if(!s) return alert('Enter symbol');
  if(backendUrl){
    try{
      await fetch(backendUrl + '/api/symbols', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({symbol:s})});
    } catch(e){ console.warn('backend save failed', e); }
  }
  const arr = JSON.parse(localStorage.getItem('SYMBOLS') || '[]');
  if(!arr.includes(s)) arr.unshift(s);
  localStorage.setItem('SYMBOLS', JSON.stringify(arr));
  renderSymbolList(arr);
  $('newSymbol').value = '';
}
$('addSymbolBtn').addEventListener('click', addSymbol);

async function removeSymbol(sym){
  if(backendUrl){
    try{ await fetch(backendUrl + '/api/symbols/' + encodeURIComponent(sym), {method:'DELETE'}); } catch(e){}
  }
  const arr = JSON.parse(localStorage.getItem('SYMBOLS') || '[]').filter(x=>x!==sym);
  localStorage.setItem('SYMBOLS', JSON.stringify(arr));
  renderSymbolList(arr);
}

// SELECT & ANALYZE
function selectSymbol(sym){
  $('symbolSelect').value = sym;
  // auto click analyze
  analyzeSelected();
}

$('analyzeBtn').addEventListener('click', analyzeSelected);

function makeChart(){
  const ctx = $('priceChart').getContext('2d');
  if(priceChart) priceChart.destroy();
  priceChart = new Chart(ctx, {type:'line', data:{labels:[], datasets:[{label:'Close', data:[], borderColor:'#00ffb3'}]}, options:{animation:false, responsive:true}});
}

async function analyzeSelected(){
  const sym = $('symbolSelect').value;
  const interval = $('intervalSelect').value;
  if(!sym) return alert('Select symbol');
  makeChart();
  setStatus('Fetching data for ' + sym);

  // 1) Try backend klines (recommended)
  let klines = null;
  if(backendUrl){
    try{
      const r = await fetch(backendUrl + `/api/klines?symbol=${sym}&interval=${interval}&limit=500`);
      if(r.ok) klines = await r.json();
    } catch(e){ console.warn('backend klines failed', e); }
  }

  // 2) If backend not available, try CoinGecko OHLC (fallback)
  if(!klines || klines.length === 0){
    const base = sym.replace(/USDT$/,'');
    const coin = coinMap[base] || base.toLowerCase();
    if(coin){
      setStatus('Using CoinGecko fallback (' + coin + ')');
      try{
        // CoinGecko OHLC supports days param: 1,7,14,30,90,180,365,max
        // We choose days based on interval
        const days = interval==='1d' ? 30 : 7;
        const url = `${COINGECKO_API}/coins/${coin}/ohlc?vs_currency=usd&days=${days}`;
        const r = await fetch(url);
        if(r.ok){
          const data = await r.json(); // [ [timestamp, open, high, low, close], ... ]
          klines = data.map(d=>({t:d[0], o:+d[1], h:+d[2], l:+d[3], c:+d[4], v:0}));
        } else {
          console.warn('CoinGecko OHLC not available', r.status);
        }
      } catch(e){ console.warn('CoinGecko fetch failed', e); }
    } else {
      setStatus('No fallback mapping for symbol ' + sym);
    }
  }

  // 3) As last resort try Binance REST (may have CORS issues on Netlify)
  if(!klines || klines.length===0){
    try{
      setStatus('Trying Binance REST (may be blocked by CORS)');
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=500`);
      const data = await r.json();
      klines = data.map(k=>({t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]}));
    } catch(e){ console.warn('Binance REST failed', e); }
  }

  if(!klines || klines.length===0){
    setStatus('Failed to fetch klines. Configure backend or pick a supported coin.');
    $('forecastSummary').innerText = 'No data available.';
    return;
  }

  // Render chart
  const labels = klines.map(k=>new Date(k.t));
  const closes = klines.map(k=>k.c);
  priceChart.data.labels = labels;
  priceChart.data.datasets[0].data = closes;
  priceChart.update();
  $('price').innerText = closes[closes.length-1].toFixed(8);
  setStatus('Data loaded. Attempting live updates (WebSocket) and forecast.');

  // start Binance trade websocket (best-effort; no API key)
  startTradeSocket(sym);

  // fetch backend predict if available
  if(backendUrl){
    try{
      const r = await fetch(backendUrl + '/api/predict/' + encodeURIComponent(sym));
      if(r.ok){
        const j = await r.json();
        $('forecastSummary').innerText = JSON.stringify(j,null,2);
      }
    } catch(e){ console.warn('predict fetch failed', e); }
  } else {
    // local simple linear predict (short)
    const pred = simpleLinearPredict(closes);
    $('forecastSummary').innerText = `Local linear-next prediction: ${pred.toFixed(8)} (use backend for advanced forecasts)`;
  }

  renderPortfolio(); // update portfolio table prices
}

// SIMPLE LOCAL PREDICTOR (lightweight)
function simpleLinearPredict(closes){
  const n = closes.length;
  // linear on last 20 closes
  const m = Math.min(20, n);
  const slice = closes.slice(-m);
  const x = slice.map((v,i)=>i);
  const y = slice.map(v=>Math.log(v));
  const xMean = x.reduce((a,b)=>a+b,0)/m;
  const yMean = y.reduce((a,b)=>a+b,0)/m;
  let num=0, den=0;
  for(let i=0;i<m;i++){ num += (x[i]-xMean)*(y[i]-yMean); den += (x[i]-xMean)*(x[i]-xMean); }
  const slope = den===0?0:num/den;
  const intercept = yMean - slope*xMean;
  const nextLog = intercept + slope*(m);
  return Math.exp(nextLog);
}

// TRADE WEBSOCKET
function startTradeSocket(sym){
  // close previous
  if(currentWS){ try{ currentWS.close(); }catch(e){} currentWS = null; }
  const s = sym.toLowerCase();
  // some symbols may not exist on Binance (CoinGecko-only) — guard
  if(!s.endsWith('usdt')){
    setStatus('Live WebSocket only available for USDT pairs on Binance');
    return;
  }
  try{
    const url = `wss://stream.binance.com:9443/ws/${s}@trade`;
    currentWS = new WebSocket(url);
    currentWS.onopen = ()=> setStatus('Live socket open for ' + sym);
    currentWS.onmessage = (evt)=>{
      const msg = JSON.parse(evt.data);
      const price = parseFloat(msg.p);
      $('price').innerText = price.toFixed(8);
      // append to chart as a small live tick (don't re-render whole klines)
      appendLivePrice(price);
    };
    currentWS.onerror = (e)=> console.warn('ws err', e);
    currentWS.onclose = ()=> setStatus('WebSocket closed');
  } catch(e){ console.warn('ws failed', e); setStatus('WebSocket unsupported'); }
}

function appendLivePrice(p){
  if(!priceChart) return;
  const labels = priceChart.data.labels;
  const data = priceChart.data.datasets[0].data;
  const now = new Date();
  // keep length <= 500
  labels.push(now);
  data.push(p);
  if(labels.length > 500){ labels.shift(); data.shift(); }
  priceChart.update('none');
  renderPortfolio();
}

// Portfolio local simple
$('addAssetBtn').addEventListener('click', ()=>{
  const sym = $('assetSym').value.trim().toUpperCase();
  const qty = Number($('assetQty').value);
  const cost = Number($('assetCost').value);
  if(!sym || !qty || !cost) return alert('Fill fields');
  const pf = JSON.parse(localStorage.getItem('PORTFOLIO')||'[]');
  pf.push({symbol:sym, qty, cost});
  localStorage.setItem('PORTFOLIO', JSON.stringify(pf));
  renderPortfolio();
});

function renderPortfolio(){
  const pf = JSON.parse(localStorage.getItem('PORTFOLIO')||'[]');
  const tbody = $('portfolioTable').querySelector('tbody');
  tbody.innerHTML = '';
  const last = priceChart && priceChart.data.datasets[0].data.length ? priceChart.data.datasets[0].data.slice(-1)[0] : 0;
  pf.forEach(a=>{
    const cur = last || 0;
    const value = a.qty * cur;
    const cost = a.qty * a.cost;
    const pl = value - cost;
    tbody.innerHTML += `<tr><td>${a.symbol}</td><td>${a.qty}</td><td>${a.cost}</td><td>${cur.toFixed(6)}</td><td>${pl.toFixed(6)}</td></tr>`;
  });
}

// init
window.addEventListener('load', ()=>{ loadSymbols(); makeChart(); renderPortfolio(); setStatus('Ready'); });

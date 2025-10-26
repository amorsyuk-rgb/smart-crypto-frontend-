// Frontend logic for Netlify static site
// Stores symbol list in backend when available, otherwise localStorage fallback.
// Connects to backend API for klines/predict endpoints.

const $ = id => document.getElementById(id);
let backendUrl = localStorage.getItem('BACKEND_URL') || '';

function setBackendUrl(url){
  backendUrl = url.replace(/\/+$/, '');
  localStorage.setItem('BACKEND_URL', backendUrl);
  alert('Saved backend URL: ' + backendUrl);
  loadSymbols();
}

$('saveBackend').addEventListener('click', ()=>{
  const url = $('backendUrl').value.trim();
  if(!url) return alert('Enter backend URL (Render)');
  setBackendUrl(url);
});

// Symbol management: try backend first, fallback to localStorage
async function loadSymbols(){
  $('backendUrl').value = backendUrl;
  let list = [];
  if(backendUrl){
    try{
      const res = await fetch(backendUrl + '/api/symbols');
      if(res.ok) list = await res.json();
      list = list.map(r=>r.symbol);
    } catch(e){ console.warn('Backend fetch failed, using local'); }
  }
  if(list.length === 0){
    list = JSON.parse(localStorage.getItem('SYMBOLS') || '["BTCUSDT","ETHUSDT","HOLOUSDT"]');
  }
  renderSymbolList(list);
}

function renderSymbolList(list){
  const ul = $('symbolList'); ul.innerHTML = '';
  const sel = $('symbolSelect'); sel.innerHTML = '';
  list.forEach(s=>{
    const li = document.createElement('li');
    li.textContent = s;
    const rm = document.createElement('button'); rm.textContent='Remove'; rm.onclick = ()=> removeSymbol(s);
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
      await fetch(backendUrl + '/api/symbols', {
        method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({symbol:s})
      });
    } catch(e){ console.warn('Save to backend failed'); }
  }
  const arr = JSON.parse(localStorage.getItem('SYMBOLS') || '[]'); arr.unshift(s);
  localStorage.setItem('SYMBOLS', JSON.stringify(arr));
  renderSymbolList(arr);
  $('newSymbol').value='';
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

// Analysis flow
$('analyzeBtn').addEventListener('click', analyzeSelected);

let priceChart = null;
function makeChart(){
  const ctx = $('priceChart').getContext('2d');
  if(priceChart) priceChart.destroy();
  priceChart = new Chart(ctx, {type:'line', data:{labels:[], datasets:[{label:'Close', data:[], borderColor:'#00ffb3'}]}, options:{animation:false}});
}

async function analyzeSelected(){
  const sym = $('symbolSelect').value;
  const interval = $('intervalSelect').value;
  if(!sym) return alert('Select symbol');
  $('price').innerText = 'loading...';
  // fetch klines from backend if configured, otherwise use Binance REST directly (CORS may block)
  let klines = null;
  if(backendUrl){
    try{
      const res = await fetch(backendUrl + `/api/klines?symbol=${sym}&interval=${interval}&limit=500`);
      klines = await res.json();
    } catch(e){
      console.warn('Backend klines fetch failed', e);
    }
  }
  if(!klines){
    // try direct Binance (may be blocked by CORS when hosted on Netlify)
    try{
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${sym}&interval=${interval}&limit=500`);
      const data = await r.json();
      klines = data.map(k=>({t:k[0], o:+k[1], h:+k[2], l:+k[3], c:+k[4], v:+k[5]}));
    } catch(e){ alert('Failed to fetch klines. Configure backend on Render for reliable operation.'); return; }
  }
  // draw chart
  makeChart();
  const labels = klines.map(k=>new Date(k.t));
  const closes = klines.map(k=>k.c);
  priceChart.data.labels = labels;
  priceChart.data.datasets[0].data = closes;
  priceChart.update();
  $('price').innerText = closes[closes.length-1].toFixed(8);
  // fetch forecast from backend if available
  if(backendUrl){
    try{
      const res = await fetch(backendUrl + `/api/predict/${sym}`);
      const p = await res.json();
      $('forecastSummary').innerHTML = `<pre>${JSON.stringify(p, null, 2)}</pre>`;
    } catch(e){ console.warn('Predict fetch failed', e); }
  }
}

// Portfolio simple local implementation
$('addAssetBtn').addEventListener('click', ()=>{
  const sym = $('assetSym').value.trim().toUpperCase();
  const qty = Number($('assetQty').value);
  const cost = Number($('assetCost').value);
  if(!sym||!qty||!cost) return alert('Fill fields');
  const pf = JSON.parse(localStorage.getItem('PORTFOLIO')||'[]');
  pf.push({symbol:sym, qty, cost});
  localStorage.setItem('PORTFOLIO', JSON.stringify(pf));
  renderPortfolio();
});

function renderPortfolio(){
  const pf = JSON.parse(localStorage.getItem('PORTFOLIO')||'[]');
  const tbody = $('portfolioTable').querySelector('tbody');
  tbody.innerHTML='';
  const last = priceChart && priceChart.data.datasets[0].data.length ? priceChart.data.datasets[0].data.slice(-1)[0] : 0;
  pf.forEach(a=>{
    const cur = last||0;
    const value = a.qty * cur;
    const cost = a.qty * a.cost;
    const pl = value - cost;
    tbody.innerHTML += `<tr><td>${a.symbol}</td><td>${a.qty}</td><td>${a.cost}</td><td>${cur.toFixed(6)}</td><td>${pl.toFixed(6)}</td></tr>`;
  });
}

window.addEventListener('load', ()=>{ loadSymbols(); makeChart(); renderPortfolio(); });

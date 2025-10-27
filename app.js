// Frontend app.js - v4 Pro (simplified)
// Uses API endpoint from localStorage or default
const DEFAULT_API = "https://smart-crypto-backend.onrender.com";
let API_BASE = localStorage.getItem('apiEndpoint') || DEFAULT_API;

let favorites = JSON.parse(localStorage.getItem('favorites')||'["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT"]');

// DOM elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsDrawer = document.getElementById('settingsDrawer');
const apiEndpointInput = document.getElementById('apiEndpoint');
const saveEndpointBtn = document.getElementById('saveEndpoint');
const saveFavsBtn = document.getElementById('saveFavs');
const favInput = document.getElementById('favInput');
const refreshBtn = document.getElementById('refreshBtn');
const marketOverview = document.getElementById('marketOverview');

apiEndpointInput.value = API_BASE;
favInput.value = favorites.join(',');

settingsBtn.addEventListener('click', ()=>{ settingsDrawer.style.transform = 'translateX(0)'; });
saveEndpointBtn.addEventListener('click', ()=>{ const v=apiEndpointInput.value.trim(); if(!v) return alert('Enter endpoint'); localStorage.setItem('apiEndpoint', v); location.reload(); });
saveFavsBtn.addEventListener('click', ()=>{ const v=favInput.value.trim(); if(!v) return alert('Enter favorites'); favorites = v.split(',').map(s=>s.trim().toUpperCase()); localStorage.setItem('favorites', JSON.stringify(favorites)); alert('Favorites saved'); loadOverview(); });

refreshBtn.addEventListener('click', ()=>{ loadOverview(); loadAI(favorites[0]); });

async function fetchJSON(url){ try{ const r=await fetch(url); return await r.json(); }catch(e){ console.warn('fetch failed',url,e); return null; } }

async function loadOverview(){
  marketOverview.innerHTML = '';
  const list = favorites;
  for(const s of list.slice(0,4)){
    const base = s.replace(/USDT$/,'').toLowerCase();
    const p = await fetchJSON(`${API_BASE}/api/price/${base}`);
    const div = document.createElement('div');
    div.className = 'p-2 bg-gray-800 rounded flex flex-col items-center text-xs';
    if(p && p.price){
      const change = p.change_24h !== undefined ? (p.change_24h).toFixed(2) : '-';
      const color = (p.change_24h||0) >=0 ? 'text-green-400' : 'text-red-400';
      div.innerHTML = `<div class="font-medium">${s.replace('USDT','')}</div><div>${Number(p.price).toFixed(4)}</div><div class="${color}">${change}%</div>`;
    } else {
      div.innerHTML = `<div class="font-medium">${s.replace('USDT','')}</div><div>—</div><div>—</div>`;
    }
    marketOverview.appendChild(div);
  }
}

function loadTradingView(symbol){
  document.getElementById('tradingview_chart').innerHTML = '';
  new TradingView.widget({
    container_id: "tradingview_chart",
    autosize: true,
    symbol: "BINANCE:" + symbol,
    interval: "60",
    timezone: "Etc/UTC",
    theme: "dark",
    style: "1",
    locale: "en",
    enable_publishing: false
  });
}

function drawGauge(score){
  const el = document.getElementById('sentimentGauge');
  el.innerHTML = '';
  const svg = `<svg viewBox="0 0 200 100" width="100%" height="100%">
    <defs><linearGradient id="g" x1="0" x2="1">
      <stop offset="0%" stop-color="#f6465d"/><stop offset="50%" stop-color="#f0b90b"/><stop offset="100%" stop-color="#0ecb81"/>
    </linearGradient></defs>
    <path d="M10 90 A80 80 0 0 1 190 90" fill="none" stroke="#222" stroke-width="18"/>
    <path d="M10 90 A80 80 0 0 1 ${10 + (180*50/100)} 90" fill="none" stroke="url(#g)" stroke-width="14" stroke-linecap="round"/>
    <text x="100" y="60" text-anchor="middle" font-size="18" fill="#fff">${50}</text>
  </svg>`;
  el.innerHTML = svg;
}

function populateAI(data){
  document.getElementById('aiSentiment').innerText = data.sentiment || '-';
  document.getElementById('aiTechnical').innerText = data.technical || '-';
  document.getElementById('aiFair').innerText = data.fair_value || '-';
  document.getElementById('aiZones').innerText = data.zones || '-';
  document.getElementById('aiRisk').innerText = data.risk || '-';
  document.getElementById('confidenceBadge').innerText = 'Conf: ' + (data.confidence||0) + '%';
  drawGauge(data.index || 50);
}

async function loadAI(symWithUSDT){
  const base = symWithUSDT.replace(/USDT$/,'').toLowerCase();
  const ai = await fetchJSON(`${API_BASE}/api/ai_analysis/${base}`);
  if(!ai){ console.warn('AI load failed'); return; }
  populateAI(ai);
  // mini charts based on historical array if present
  const hist = ai.historical || [];
  try{
    const rsiCtx = document.getElementById('miniRsi').getContext('2d');
    const macdCtx = document.getElementById('miniMacd').getContext('2d');
    new Chart(rsiCtx, {type:'line', data:{labels:hist.map((v,i)=>i), datasets:[{data:hist, borderColor:'#f0b90b'}]}, options:{maintainAspectRatio:false}});
    new Chart(macdCtx, {type:'bar', data:{labels:hist.map((v,i)=>i), datasets:[{data:hist.map(v=>v*0.01), backgroundColor:'#0ecb81'}]}, options:{maintainAspectRatio:false}});
  }catch(e){ console.warn(e); }
}

window.addEventListener('load', ()=>{
  loadOverview();
  loadAI(favorites[0]);
  loadTradingView(favorites[0]);
  drawGauge(50);
});

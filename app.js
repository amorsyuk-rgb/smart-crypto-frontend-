const API_BASE = "https://smart-crypto-backend.onrender.com";
const symbols = ['bitcoin', 'ethereum', 'bnb', 'solana', 'dogecoin'];
const select = document.getElementById('symbolSelect');
const refreshBtn = document.getElementById('refreshBtn');

function populateSymbols() {
  select.innerHTML = '';
  symbols.forEach(sym => {
    const opt = document.createElement('option');
    opt.value = sym;
    opt.textContent = sym.toUpperCase();
    select.appendChild(opt);
  });
}

async function loadAIAnalysis(symbol) {
  try {
    const res = await fetch(`${API_BASE}/api/ai_analysis/${symbol}`);
    const data = await res.json();
    updateAIUI(data);
  } catch (err) {
    console.error('AI fetch error:', err);
    document.getElementById('aiSummary').textContent = 'Error loading analysis.';
  }
}

function updateAIUI(data) {
  const sentiment = document.querySelector('#aiSentiment span');
  const rec = document.querySelector('#aiRecommendation span');
  const indicators = document.getElementById('aiIndicators');
  const summary = document.getElementById('aiSummary');
  const valueBar = document.getElementById('valueIndex');

  sentiment.textContent = data.sentiment || 'Neutral';
  rec.textContent = data.recommendation || 'Hold';
  indicators.textContent = `RSI: ${data.rsi || '-'} | EMA: ${data.ema || '-'} | MACD: ${data.macd || '-'}`;
  summary.textContent = data.summary || 'No AI data available.';

  const score = data.index || 50;
  valueBar.style.width = score + '%';
  valueBar.style.background = score < 40 ? '#0ecb81' : score < 70 ? '#f0b90b' : '#f6465d';
}

function loadTradingView(symbol) {
  const container = document.getElementById('tradingview_chart');
  container.innerHTML = '';
  new TradingView.widget({
    container_id: 'tradingview_chart',
    autosize: true,
    symbol: symbol.toUpperCase() + 'USD',
    interval: '60',
    timezone: 'Etc/UTC',
    theme: 'dark',
    style: '1',
    locale: 'en',
    toolbar_bg: '#0b0e11',
    enable_publishing: false
  });
}

select.addEventListener('change', () => {
  const sym = select.value;
  loadTradingView(sym);
  loadAIAnalysis(sym);
});

refreshBtn.addEventListener('click', () => {
  const sym = select.value;
  loadTradingView(sym);
  loadAIAnalysis(sym);
});

populateSymbols();
loadTradingView(symbols[0]);
loadAIAnalysis(symbols[0]);

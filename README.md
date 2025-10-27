Smart Crypto Advisor — Frontend (Netlify)

This package is a GitHub-ready frontend for the Smart Crypto Advisor. It expects a Render backend (configured in config.js) but also works with CoinGecko fallback for data.

Files:
- index.html — main UI
- app.js — frontend logic (Chart.js, AI analysis, CoinGecko fallback)
- style.css — styling
- config.js — backend URL configuration (edit this before deploy)
- README.md — this file

Deploy to Netlify:
1. Create a new GitHub repo and upload these files (or use Working Copy on iPhone).
2. In Netlify, create a new site from Git and select this repo.
3. Edit config.js to point BACKEND_BASE to your Render backend (default already set).
4. Deploy. Open site and use UI. The site will use backend for klines/predict when available, otherwise CoinGecko fallback.

Notes:
- TradingView widget integration is included as a toggle (requires internet, no API key for basic widget embedding).
- AI commentary uses client-side heuristics. To enable server-side OpenAI commentary, set OPENAI_API_KEY in your Render backend and use /api/predict endpoint.

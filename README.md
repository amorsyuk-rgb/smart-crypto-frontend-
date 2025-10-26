Smart Crypto Advisor — Frontend (Netlify)

How to deploy to Netlify:
1. Edit `app.js` and set your backend URL or save it in the UI when the site is opened.
2. Push the `frontend_netlify` folder to GitHub.
3. In Netlify, create a new site from GitHub and point it to this repository/folder.
4. Publish — the site will be live at https://your-site.netlify.app

Notes:
- If you don't configure a backend, the frontend will try Binance REST directly (may face CORS). Use backend for reliable operation.
- `netlify.toml` includes a placeholder rewrite to proxy /api/* to your backend — update the URL.
- Optional: enable Netlify Identity and redirects for authentication.

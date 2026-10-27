# shadowslave_translaitor

Dark-mode responsive web app for reading and translating chapters from https://shadowslave.space/.

## Features
- Load a chapter URL directly from `shadowslave.space`
- Fetch recent chapter links from the homepage
- Translate chapter text to Arabic using an OpenAI-compatible AI model (high-quality literary prompt)
- Save reading progress and last chapter across refresh/close (localStorage)
- Responsive layout for phone, tablet, and desktop

## How to use
1. Open `index.html` in a browser (or serve the folder with any static server).
2. Enter a chapter URL and click **Load Chapter**.
3. In **AI translator settings**, add your API key and model configuration.
4. Click **Translate loaded chapter**.
5. Re-open or refresh later to continue from your last position.

## Notes
- Chapter fetching uses fallback proxies when direct CORS requests are blocked.
- API keys are only saved if you enable **Remember API key on this device**.

# Penguin Logistics

## Editing interface text

The interface is available in English.

- Edit interface text and release notes in `js/locales/en.js`.
- Add new UI strings to that file and reference them with the lookup in `js/i18n.js`.

The text lookup is handled by `js/i18n.js`.

## Run locally

The app uses browser modules and local WebAssembly assets, so open it through a local web server instead of opening `index.html` directly.

1. Install Python 3 if it is not already available.
2. Open a terminal in this folder and run `python3 -m http.server 8000`.
3. Visit `http://localhost:8000` in a browser.

No tool is selected when the app opens. Use **Q** and **E** to select the previous or next tool. Press **F** or select **ALL TOOLS** to open the tool library. Press **F** or **Esc** to close it.

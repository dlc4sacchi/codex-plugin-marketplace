# Saint Codex Plugins

A personal Codex plugin marketplace. Add this marketplace once, then install any plugins published here.

## Add The Marketplace

In the Codex app, open **Plugins**, choose **More** > **Add marketplace**, then use:

```text
Source: dlc4sacchi/codex-plugin-marketplace
Git ref: main
Sparse paths: leave blank
```

You can also use the CLI:

```bash
codex plugin marketplace add dlc4sacchi/codex-plugin-marketplace
```

## Available Plugins

- `zerogpt-codex-plugin`: Check text with ZeroGPT, including compact score output and detected line snippets.

## Local Development

```bash
cd /home/saint/Dev/codex-plugin-marketplace/plugins/zerogpt-codex-plugin
npm install
npx playwright install chromium
npm test
```

Web Control Plus
===

Web UI to control Lego Boost/PoweredUp/Control+ hubs
---

https://aileo.github.io/web-control-plus/

### Disclaimer

This project is very WIP and does not handle all devices.
Supported for now :
- Boost color and distance sensor in distance mode
- Any motor controlled by speed.
- Boost built-in tilt sensor in angle mode.

### Usage

Click on the "plus" button on the left bar to scan for hub and associate one.

The hub should appear in a list on the left bar and its built-in LED should take
the UI associated color.

It should detect available features from built-in and connected devices

Click on any feature/device to create a new control by selecting type and size, it will be added to the main board.

### Contributing

Feel free to report [issues](https://github.com/aileo/web-control-plus/issues) or create pull request.

Ensure to satisfy linter before creating pull request by running `npm run lint`.

### Development

With Docker and Docker Compose installed, start the development server with:

```sh
docker compose up --build --watch
```

Open http://localhost:8000/. Compose synchronizes source changes for live
reload and rebuilds the image when dependencies change. Stop it with Ctrl+C;
run `docker compose down` to remove the container.

Alternatively, use Node.js 24:

```sh
npm ci --ignore-scripts
npm run dev
```

Install scripts are skipped because the browser client does not use the native
Bluetooth bindings pulled in by `node-poweredup`. Bluetooth runs in the browser,
not inside Docker. Use a Web Bluetooth-compatible browser and a secure context:
localhost works over HTTP, but access from another machine requires HTTPS.
Configure optional development proxies in `dev/proxies.json`.

### Build

Run `npm run build`

### Deploy

Run `npm run publish` to build and deploy built sources to the repository gh-pages.

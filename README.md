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

Choose the hub in the browser's Bluetooth dialog after clicking the plus button;
pairing it in the operating system alone does not add it to the app. Connection
failures and timeouts are reported in the browser. The precise hub and its
firmware may affect compatibility.

The Technic Move Hub 88019 requires encrypted Bluetooth pairing and is not
currently supported by `node-poweredup` 10.1.0; pairing alone will not make it
work with this app.

It should detect available features from built-in and connected devices

Click on any feature/device to create a new control by selecting type and size, it will be added to the main board.

For the Boost color and distance sensor, add a distance control to start
distance updates; connecting the hub alone does not subscribe to distance
measurements. Move an object toward or away from the sensor to change the
proximity arcs. A zero-distance reading activates the closest warning.
The sensor LED color alone does not indicate whether distance updates are active.

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

The development, build, and test commands apply a version-specific patch to
`node-poweredup` for browser compatibility and discovery timing. Review or
remove that patch when upgrading the dependency. Run `npm test` for the
simulated Bluetooth regression tests.

### Build

Run `npm run build`

### Deploy

Run `npm run publish` to build and deploy built sources to the repository gh-pages.

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

Start dev server by running `npm run dev` and open your browser at http://127.0.0.1:8000/

### Build

Run `npm run build`

### Deploy

Run `npm run publish` to build and deploy built sources to the repository gh-pages.

const { createProxyMiddleware } = require('http-proxy-middleware');
const proxies = require('./dev/proxies.json');

module.exports = app => {
  Object.entries(proxies).forEach(([route, target]) => {
    app.use(`/${route}`, createProxyMiddleware({ target, changeOrigin: true }));
  });
};

const { resolve } = require('path');

const express =require('express');
const proxy =require('http-proxy-middleware');
const Bundler =require('parcel-bundler');
const _ = require('lodash');

const bundler = new Bundler(resolve(__dirname, '../index.html'), {});
const app = express();

const proxies = require('./proxies.json');
/**
 * proxies.json :
 * {
 *   "[ROUTE]":"[URL/TARGET]"
 * }
 */
_.each(proxies, (target, route) => {
  app.use(`/${ route }`, proxy({ target, changeOrigin: true }));
})

app.use(bundler.middleware());
app.listen(process.env.PORT || 8000);
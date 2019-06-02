"use strict";

const merge = require('webpack-merge');
const common = require('./webpack.config.js');

module.exports = merge(common, {
    mode: 'production',
    optimization: {
        minimize: true
      }
});
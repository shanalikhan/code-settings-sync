//@ts-check
/** @typedef {import('webpack').Configuration} WebpackOptions **/

"use strict";

const path = require("path");
const CleanWebpackPlugin = require("clean-webpack-plugin");

/** @type WebpackOptions */
const config = {
  mode: "none",
  target: "node",
  entry: "./src/extension.ts",
  output: {
    filename: "extension.js",
    path: path.resolve(__dirname, "out"),
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "file:///[absolute-resource-path]"
  },
  resolve: {
    extensions: [".ts", ".js"],
    alias: {
      deepmerge$: path.resolve(__dirname, "node_modules/deepmerge/dist/umd.js")
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader"
      }
    ]
  },
  externals: {
    vscode: "commonjs vscode",
    fsevents: "commonjs fsevents",
    "original-fs": "commonjs original-fs"
  },
  devtool: "source-map",
  plugins: [new CleanWebpackPlugin(["out"])]
};

module.exports = config;

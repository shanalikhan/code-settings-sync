const path = require('path')
const config = {
 target: 'node',
 entry: './src/extension.ts',
 output: {
   path: path.resolve(__dirname, 'out'),
   filename: 'extension.js',
   libraryTarget: 'commonjs2',
   devtoolModuleFilenameTemplate: 'file:///[absolute-resource-path]'
 },
 devtool: 'source-map',
 externals: {
   vscode: 'commonjs vscode',
   fsevents: 'commonjs fsevents',
   'utf-8-validate': 'utf-8-validate',
   'bufferutil': 'bufferutil'
 },
 resolve: {
   extensions: ['tsx', '.ts', '.jsx', '.js']
 },
 node: {
   __dirname: false,
   __filename: false,
 },
 module: {
   rules: [
     {
       test: /\.ts$/,
       exclude: /node_modules/,
       use: [
         {
           loader: 'ts-loader'
         }
       ]
     },
     {
        type: 'javascript/auto',
        test: /\.mjs$/,
        use: []
     }
   ]
 }
}
module.exports = config

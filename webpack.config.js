const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/background.ts',
      content: './src/content/content.ts',
      popup: './src/popup/popup.ts',
      options: './src/options/options.ts',
      vocabulary: './src/options/vocabulary.ts',
      review: './src/options/review.ts'
    },
    
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      clean: true,
      // Service Worker 兼容性设置
      globalObject: 'self'
    },
    
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader'
          ]
        }
      ]
    },
    
    resolve: {
      extensions: ['.ts', '.js']
    },
    
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].css'
      }),
      
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'manifest.json',
            to: 'manifest.json'
          },
          {
            from: 'src/popup/popup.html',
            to: 'popup.html'
          },
          {
            from: 'src/popup/popup.css',
            to: 'popup.css'
          },
          {
            from: 'src/options/options.html',
            to: 'options.html'
          },
          {
            from: 'src/options/options.css',
            to: 'options.css'
          },
          {
            from: 'src/options/vocabulary.html',
            to: 'vocabulary.html'
          },
          {
            from: 'src/options/vocabulary.css',
            to: 'vocabulary.css'
          },
          {
            from: 'src/options/review.html',
            to: 'review.html'
          },
          {
            from: 'src/options/review.css',
            to: 'review.css'
          },
          {
            from: 'src/content/content.css',
            to: 'content.css'
          },
          {
            from: 'icons',
            to: 'icons',
            noErrorOnMissing: true
          },
          {
            from: 'src/data/vocabularies',
            to: 'data/vocabularies',
            noErrorOnMissing: true
          }
        ]
      })
    ],
    
    devtool: isProduction ? false : 'source-map',
    
    optimization: {
      minimize: isProduction
    },
    
    // Chrome扩展特定配置
    target: 'web',
    
    // 避免在Chrome扩展中使用eval
    devtool: isProduction ? false : 'cheap-module-source-map'
  };
};
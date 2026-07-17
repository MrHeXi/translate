const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
const tesseractRoot = path.dirname(require.resolve('tesseract.js/package.json'));
const tesseractCoreRoot = path.dirname(require.resolve('tesseract.js-core/package.json'));
const ocrLanguagePackages = ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor'];

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: {
      background: './src/background/background.ts',
      content: './src/content/content.ts',
      popup: './src/popup/popup.ts',
      options: './src/options/options.ts',
      vocabulary: './src/options/vocabulary.ts',
      review: './src/options/review.ts',
      document: './src/options/document.ts',
      sidepanel: './src/sidepanel/sidepanel.ts',
      subtitles: './src/subtitles/subtitles.ts'
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
            from: 'src/options/document.html',
            to: 'document.html'
          },
          {
            from: 'src/options/document.css',
            to: 'document.css'
          },
          {
            from: 'src/sidepanel/sidepanel.html',
            to: 'sidepanel.html'
          },
          {
            from: 'src/sidepanel/sidepanel.css',
            to: 'sidepanel.css'
          },
          {
            from: 'src/subtitles/subtitles.html',
            to: 'subtitles.html'
          },
          {
            from: 'src/subtitles/subtitles.css',
            to: 'subtitles.css'
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
          },
          {
            from: path.join(pdfjsRoot, 'legacy/build/pdf.worker.min.js'),
            to: 'pdfjs/pdf.worker.min.js'
          },
          {
            from: path.join(pdfjsRoot, 'cmaps'),
            to: 'pdfjs/cmaps'
          },
          {
            from: path.join(pdfjsRoot, 'standard_fonts'),
            to: 'pdfjs/standard_fonts'
          },
          {
            from: path.join(tesseractRoot, 'dist/worker.min.js'),
            to: 'ocr/worker.min.js'
          },
          {
            from: path.join(tesseractRoot, 'LICENSE.md'),
            to: 'ocr/licenses/tesseract-js.txt'
          },
          {
            from: path.join(tesseractCoreRoot, 'LICENSE'),
            to: 'ocr/licenses/tesseract-core.txt'
          },
          ...[
            'tesseract-core-lstm.wasm.js',
            'tesseract-core-lstm.wasm',
            'tesseract-core-simd-lstm.wasm.js',
            'tesseract-core-simd-lstm.wasm'
          ].map(fileName => ({
            from: path.join(tesseractCoreRoot, fileName),
            to: `ocr/core/${fileName}`
          })),
          ...ocrLanguagePackages.map(language => ({
            from: path.join(
              path.dirname(require.resolve(`@tesseract.js-data/${language}/package.json`)),
              `4.0.0_best_int/${language}.traineddata.gz`
            ),
            to: `ocr/lang/${language}.traineddata.gz`
          }))
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

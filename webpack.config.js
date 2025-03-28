const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ZipPlugin = require('zip-webpack-plugin');
const package = require('./package.json');

const DIST_DIR = path.resolve('dist');
const SOURCE_DIR = 'extension';

const SOURCES = [
    'manifest.json',        // Extension manifest
    'popup.html',           // Popup page
    'service.js',           // The service worker/background script
    'content/style.css',    // The injected css style
    'content/script.js',    // The injected content script
    'content/settings.html',// The configuration page
];

module.exports = (env, argv) => {
    const plugins = [
        // Add all html files using HtmlWebpackPlugin
        ...SOURCES.filter(src => src.endsWith('.html')).map(src => new HtmlWebpackPlugin({
            inject: false,
            filename: src,
            template: path.resolve(SOURCE_DIR, src),
        }))
    ];

    if (argv.mode === 'production') {
        // Create a zip of the extension in prduction
        plugins.push(new ZipPlugin({
            filename: package.name,
            path: '../',
        }));
    }

    return {
        output: {
            filename: '[name]',
            path: DIST_DIR,
            clean: true,
        },
        optimization: {
            removeEmptyChunks: false,
        },
        entry: Object.fromEntries(SOURCES.filter(src => src.endsWith('.html') == false).map(src => [src, path.resolve(SOURCE_DIR, src)])),
        module: {
            rules: [
                {
                    test: /\.html/,
                    loader: 'html-loader',
                },
                {
                    test: /\.json/,
                    type: 'asset/resource',
                    generator: {
                        filename: '[base]',
                    }
                },
                {
                    // specifically overwrite style.css to be in the content folder. TODO: figure out a better way to do this
                    test: /style\.css/,
                    type: 'asset/resource',
                    generator: {
                        filename: 'content/[base]'
                    }
                },
                {
                    // default filename [hash] generated for js files breaks in production environments. TODO: why?
                    test: /.js$/,
                    generator: {
                        filename: '[base]'
                    }
                }
            ]
        },
        plugins,
    }
};

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
        // Add all html files using HtmlWebpackPlugin, always inject <filename>.js into it
        ...SOURCES.filter(src => src.endsWith('.html')).map(src => new HtmlWebpackPlugin({
            inject: 'head',
            filename: src,
            scriptLoading: 'blocking',
            chunks: [ src.replace('.html', '.js') ],
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
        // All .html files have a js entry with the same filename, html files themselves are generated using HtmlWebpackPlugin
        entry: Object.fromEntries(SOURCES.map(src => [src.replace('.html', '.js'), path.resolve(SOURCE_DIR, src.replace('.html', '.js'))])),
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
                    test: /\.css/,
                    type: 'asset/resource',
                },
            ],
        },
        plugins,
    }
};

'use strict';

const path = require('path');
const ExtractCssChunks = require('extract-css-chunks-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, options) => {
    const isProd = (options.mode !== 'development');
    const contextBase = path.resolve(__dirname, 'build', isProd ? 'PROD' : 'DEV');
    const res = {
        devtool: 'cheap-module-source-map',
        devServer: {
            static : {
                directory: contextBase,
            },
            port: 9000,
            https: true,
        },
        resolve: {
            extensions: ['.js', '.json', '.wasm', '.jsx'],
        },
        entry: {
            demo: './src/app.jsx',
        },
        output: {
            path: contextBase,
            filename: "assets/[name].[contenthash].js",
            clean: true,
            crossOriginLoading: 'anonymous',
        },
        module: {
            rules: [
                {
                    test: /\.css$/i,
                    use: [
                        {
                            loader: ExtractCssChunks.loader,
                            options: {
                                hmr: false,
                                publicPath: '/',
                            }
                        },
                        {
                            loader: 'css-loader',
                            options: {
                                url: true,
                                sourceMap: true
                            }
                        },
                    ],
                },
                {
                    test: /\.(gif)$/i,
                    type: 'asset/inline'
                },
                {
                    test: /\.(png|svg|jpg|jpeg)$/i,
                    type: 'asset/resource',
                    generator: {
                        filename: 'images/[name]-[contenthash][ext][query]',
                    },
                },
                {
                    test: /\.(woff|woff2|eot|ttf|otf)$/i,
                    type: 'asset/resource',
                    generator: {
                        filename: 'fonts/[name]-[contenthash][ext][query]',
                    },
                },
                {
                    test: /\.jsx$/,
                    exclude: /node_modules/,
                    use: {
                        loader: "babel-loader",
                        options: {
                            presets: [
                                '@babel/preset-env',
                                '@babel/preset-react',
                            ],
                            plugins: [
                                // "effector/babel-plugin",
                                "@babel/transform-runtime",
                                // "@babel/plugin-proposal-class-properties",
                            ]
                        }
                    }
                },
                {
                    test: /\.scss$/i,
                    use: [
                        {
                            loader: ExtractCssChunks.loader,
                            options: {
                                hmr: false,
                                publicPath: '/',
                            }
                        },
                        {
                            loader: 'css-loader',
                            options: {
                                url: true,
                                sourceMap: true
                            }
                        },
                        { loader: 'sass-loader', options: { sourceMap: true } }
                    ],
                },
            ],
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: 'index.html',
                filename: 'index.html',
                inject: "body",
                minify: true,
                hash: false,
                scriptLoading: 'blocking',
                chunks: ['demo'],
            }),
            new HtmlWebpackPlugin({
                template: 'policy/iframe.html',
                filename: 'policy-iframe.html',
                inject: "body",
                minify: true,
                hash: false,
                scriptLoading: 'blocking',
                chunks: [],
            }),
            new ExtractCssChunks({
                filename: 'styles/[name]-[contenthash].css',
            }),
        ]
    };

    return res;
};

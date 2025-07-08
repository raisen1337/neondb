// webpack.config.js
const path = require('path');

module.exports = {
    entry: './src/server.js',
    target: 'node',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'server.js',
        libraryTarget: 'commonjs2'
    },
    externals: {
        'pg-native': 'commonjs pg-native'
    },
    resolve: {
        extensions: ['.js']
    },
    mode: 'production',
    optimization: {
        minimize: false
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: [
                            ['@babel/preset-env', {
                                targets: {
                                    node: '16'
                                }
                            }]
                        ]
                    }
                }
            }
        ]
    },
    plugins: []
};

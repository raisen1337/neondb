const path = require('path');

module.exports = {
    entry: './src/server.js',   // Your server entry point
    target: 'node',             // Bundle for Node.js runtime
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'server.js',
        libraryTarget: 'commonjs2', // So Node can consume exports properly
    },
    externals: {
        // Exclude pg-native because it’s a native binding,
        // must be present in node_modules at runtime
        'pg-native': 'commonjs pg-native',
    },
    resolve: {
        extensions: ['.js'],       // Add '.ts' here if you use TS
    },
    mode: 'production',
    optimization: {
        minimize: false,          // No minification for easier debugging
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
                                    node: '16',  // Target Node 16+ environment
                                },
                            }],
                        ],
                    },
                },
            },
        ],
    },
    plugins: [],
};

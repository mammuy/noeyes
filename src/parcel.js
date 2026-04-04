const Bundler = require('parcel-bundler');
const path = require('path');

const isDev = process.argv.indexOf('--mode') >= 0 && process.argv.indexOf('dev') > process.argv.indexOf('--mode') || process.argv.indexOf('dev') >= 0;

const entryFiles = [
    path.join(__dirname, './html/index.html'),
    path.join(__dirname, './html/settings.html')
];

const options = {
    outDir: path.join(__dirname, '../build'),
    publicUrl: './',
    watch: isDev,
    cache: true,
    minify: !isDev,
    target: 'electron',
    https: false,
    logLevel: 3,
    hmr: isDev,
    hmrPort: 3000,
    sourceMaps: isDev,
    detailedReport: !isDev
};

async function runBundle() {
    const bundler = new Bundler(entryFiles, options);
    if(isDev) {
        await bundler.serve(3000);
    } else {
        await bundler.bundle();
        process.exit(0);
    }
}

runBundle();

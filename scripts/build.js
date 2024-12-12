const esbuild = require("esbuild");

const LOG_LEVEL = 'debug';
const MODULE_BUNDLE_BLOCK_LIST = [
    'esbuild',
    'vscode',
];

const buildConfig = {
    entryPoints: [
        './extension.ts'
    ],
    bundle: true,
    external: MODULE_BUNDLE_BLOCK_LIST,
    format: 'cjs',
    logLevel: LOG_LEVEL,
    minify: false,
    sourcemap: true,
    sourcesContent: true,
    platform: 'node',
    outfile: './build/dist/index.js',
};

async function main() {
    const buildContext = await esbuild.context(buildConfig);
    await buildContext.rebuild();
    await buildContext.dispose();
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});

const fs = require('fs');
let d = fs.readFileSync('vite.config.ts', 'utf8');
d = d.replace(/registerType:\s*[\"']autoUpdate[\"']/, 'strategies: \"injectManifest\", srcDir: \"src\", filename: \"sw.ts\", registerType: \"autoUpdate\"');
d = d.replace(/workbox:\s*\{/, 'injectManifest: {');
fs.writeFileSync('vite.config.ts', d);


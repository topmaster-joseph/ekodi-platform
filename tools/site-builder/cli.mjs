#!/usr/bin/env node
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'vite';
import { EKODI_SERVICES } from '@ekodi/ecosystem-catalog';

const command = process.argv[2] || 'build';
const appDirectory = resolve(process.cwd());
const runtimeDirectory = resolve(import.meta.dirname, '../../packages/site-runtime');
const config = JSON.parse(await readFile(resolve(appDirectory, 'site.config.json'), 'utf8'));
const service = EKODI_SERVICES.find(item => item.id === config.siteId);

if (!service) throw new Error(`Unknown EKODI siteId: ${config.siteId}`);
if (config.targetDomain !== service.targetDomain) throw new Error(`Domain mismatch for ${config.siteId}`);
if (command === 'check') {
  console.log(`Validated ${service.id} -> ${config.targetDomain}`);
  process.exit(0);
}
if (command !== 'build') throw new Error(`Unknown command: ${command}`);

const siteConfigId = 'virtual:ekodi-site-config';
const resolvedSiteConfigId = `\0${siteConfigId}`;
const siteConfig = {
  siteId: service.id,
  siteName: service.name,
  targetDomain: config.targetDomain,
  legacyUrl: config.legacyUrl || service.url,
  access: service.access || 'public'
};
const canonicalUrl = `https://${config.targetDomain}/`;
const siteDescription = `${service.name} 공식 EKODI 사이트`;
const isPrivate = service.access === 'private';
const robotsPolicy = isPrivate ? 'noindex, nofollow, noarchive' : 'index, follow';

await build({
  root: runtimeDirectory,
  publicDir: resolve(runtimeDirectory, 'public'),
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'ekodi-site-config',
      resolveId(id) {
        return id === siteConfigId ? resolvedSiteConfigId : null;
      },
      load(id) {
        return id === resolvedSiteConfigId ? `export default ${JSON.stringify(siteConfig)}` : null;
      },
      transformIndexHtml(html) {
        return html
          .replaceAll('{{SITE_NAME}}', service.name)
          .replaceAll('{{SITE_DESCRIPTION}}', siteDescription)
          .replaceAll('{{ROBOTS_POLICY}}', robotsPolicy)
          .replaceAll('{{CANONICAL_URL}}', canonicalUrl);
      },
      generateBundle() {
        if (isPrivate) {
          this.emitFile({ type: 'asset', fileName: 'robots.txt', source: 'User-agent: *\nDisallow: /\n' });
          return;
        }
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\nSitemap: ${canonicalUrl}sitemap.xml\n` });
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${canonicalUrl}</loc></url></urlset>\n` });
      }
    }
  ],
  build: {
    outDir: resolve(appDirectory, 'dist'),
    emptyOutDir: true,
    sourcemap: false
  }
});

console.log(`Built ${service.name} React application for ${config.targetDomain}`);

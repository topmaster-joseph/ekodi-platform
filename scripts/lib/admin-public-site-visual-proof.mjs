// Issue #6532: read-only, genuine authenticated production visual proof for
// the public-site publication console. Never submit a publication PUT.
// Screenshots are cropped to the console and redact text/selected values.
import fs from 'node:fs/promises';
import path from 'node:path';

export const PUBLIC_SITE_VISUAL_WIDTHS = Object.freeze([320, 390, 768, 1366, 1440]);

export async function verifyPublicationVisualProof(page, artifactsDir) {
  const base = '#publicSiteControlsPanel';
  const panel = page.locator(base);
  const search = panel.locator('[data-psc-search]');
  const filter = panel.locator('[data-psc-filter]');
  const form = panel.locator('form[data-psc-form][data-public-site-id="cgma"]');
  const changes = [];
  const watchWrite = request => {
    try {
      const url = new URL(request.url());
      if (url.origin === 'https://ekodi.kr' &&
          url.pathname.startsWith('/api/control/public-sites') &&
          !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) changes.push(request.method());
    } catch {}
  };
  page.on('request', watchWrite);
  try {
    await form.waitFor({state:'visible', timeout:8000});
    // Exercise public search, empty state, status filtering, and selection
    // using browser controls only, without touching the mutation endpoint.
    await search.fill('__ekodi_visual_no_such_site_6532__');
    if (await panel.locator('[data-psc-select]').count() !== 0 ||
        !await panel.locator('.psc-empty').first().isVisible())
      throw new Error('public-site visual: empty search must show no list rows');
    await search.fill('cgma');
    await panel.locator('[data-psc-select="cgma"]').waitFor({state:'visible',timeout:5000});
    await panel.locator('[data-psc-select="cgma"]').click();
    await search.fill('');
    await filter.selectOption('public');
    const statuses = await panel.locator('[data-psc-select] .psc-status').evaluateAll(nodes =>
      nodes.map(node => node.getAttribute('data-status')));
    if (statuses.some(status => status !== 'public'))
      throw new Error('public-site visual: public filter leaked another status');
    await filter.selectOption('all');
    await panel.locator('[data-psc-select="cgma"]').click().catch(async error => {
      if (await form.count() === 0) throw error;
    });

    const original = await form.locator('select[name="publicStatus"]').inputValue();
    await form.locator('select[name="publicStatus"]').selectOption(original === 'private' ? 'public' : 'private');
    if (!await form.locator('[data-psc-dirty]').isVisible() ||
        !await form.locator('[data-psc-save]').isEnabled())
      throw new Error('public-site visual: unsaved-change protection did not activate');
    await form.locator('[data-psc-reset]').click();
    if (await form.locator('select[name="publicStatus"]').inputValue() !== original ||
        await form.locator('[data-psc-save]').isEnabled() ||
        await form.locator('[data-psc-dirty]').isVisible())
      throw new Error('public-site visual: cancel did not restore saved read-only state');

    const measurements = [];
    for (const width of PUBLIC_SITE_VISUAL_WIDTHS) {
      await page.setViewportSize({width, height: width <= 390 ? 900 : 1000});
      if (width <= 390) await page.keyboard.press('Escape');
      await panel.scrollIntoViewIfNeeded();
      const sample = await page.evaluate(() => {
        const root = document.querySelector('#publicSiteControlsPanel');
        const grid = root?.querySelector('.psc-workspace');
        const list = root?.querySelector('.psc-pane');
        const editor = root?.querySelector('[data-psc-editor]');
        const form = editor?.querySelector('[data-psc-form]');
        const rect = node => node?.getBoundingClientRect();
        const box = rect(root), l = rect(list), e = rect(editor);
        const visible = node => Boolean(node && !node.hidden && getComputedStyle(node).display !== 'none' &&
          getComputedStyle(node).visibility !== 'hidden' && rect(node)?.width > 0);
        return {
          width:innerWidth, documentOverflow:document.documentElement.scrollWidth-innerWidth,
          panelFits:Boolean(box && box.left>=-2 && box.right<=innerWidth+2),
          listFits:Boolean(l && l.left>=-2 && l.right<=innerWidth+2),
          editorFits:Boolean(e && e.left>=-2 && e.right<=innerWidth+2),
          listVisible:visible(list), editorVisible:visible(editor), formVisible:visible(form),
          trackCount:grid?getComputedStyle(grid).gridTemplateColumns.split(/\s+/).filter(Boolean).length:0,
          selected:form?.getAttribute('data-public-site-id')==='cgma',
          pageRoute:location.pathname.startsWith('/admin/')
        };
      });
      if (sample.width !== width || sample.documentOverflow > 2 ||
          !sample.panelFits || !sample.listFits || !sample.editorFits ||
          !sample.listVisible || !sample.editorVisible || !sample.formVisible ||
          !sample.selected || !sample.pageRoute ||
          sample.trackCount !== (width <= 900 ? 1 : 2))
        throw new Error('public-site visual viewport failed: '+JSON.stringify(sample));
      // Never attach account/identity data to CI screenshot artifacts.
      await panel.screenshot({
        path:path.join(artifactsDir, 'public-site-controls-'+width+'.png'),
        animations:'disabled',
        mask:[
          panel.locator('.psc-row-name, .psc-row-domain, .psc-editor-header'),
          panel.locator('input, textarea, select'),
          panel.locator('[data-psc-message]')
        ],
        maskColor:'#d1d5db',
        timeout:15000
      });
      measurements.push(sample);
    }
    if (changes.length !== 0) throw new Error('public-site visual: attempted production write');
    const report = {
      passed:true, readOnly:true, productionMutation:false,
      url:'https://ekodi.kr/admin/settings/public-site-controls',
      widths:measurements.map(item=>item.width), measurements, screenshotCount:measurements.length,
      searchVerified:true, filterVerified:true, resetVerified:true
    };
    await fs.writeFile(path.join(artifactsDir,'public-site-controls-geometry.json'),JSON.stringify(report,null,2));
    return report;
  } finally {
    page.off('request',watchWrite);
    await page.setViewportSize({width:1440,height:1100}).catch(()=>{});
  }
}

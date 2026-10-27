/* Run: PLAYWRIGHT_MODULE=/absolute/path/to/playwright npm run test:browser */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
    await page.route('https://zeta-ai.io/**', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body style="background:#0b1220;color:white;font:18px system-ui;padding:40px">
      <nav><button>Home</button><button>Discover</button></nav>
      <main><h1>Story preview</h1><div data-sentry-component="ChatBubbleContainer"><p>Hello, traveler.</p><p>Home</p></div></main>
      <textarea placeholder="Your reply">Do not translate me</textarea><div contenteditable="true">Editable draft</div>
      <script>window.fakeRequests=[];window.chrome={runtime:{sendMessage:async m=>{if(m.type==='settings')return {provider:'api',uiEnabled:true};if(m.type==='translate'){fakeRequests.push(m.text);return {text:'中文译文：'+m.text+' <img src=x onerror=alert(1)>'}}}},storage:{onChanged:{addListener(){}}}};</script>
      </body></html>` }));
    await page.goto('https://zeta-ai.io/en/rooms/test');
    await page.addScriptTag({ path: path.join(root, 'extension/dictionary.js') });
    await page.addScriptTag({ path: path.join(root, 'extension/content.js') });
    await page.waitForFunction(() => document.querySelector('nav button').textContent === '首页');
    assert.equal(await page.locator('[data-sentry-component] p').nth(1).innerText(), 'Home');
    await page.evaluate(() => { const b=document.createElement('button');b.textContent='Settings';document.querySelector('nav').append(b); });
    await page.waitForFunction(() => document.querySelector('nav button:last-child').textContent === '设置');
    assert.equal(await page.locator('textarea').inputValue(), 'Do not translate me');
    await page.locator('#visible').click();
    await page.waitForFunction(() => document.querySelector('[data-zeta-zh="panel"]').shadowRoot.querySelector('output').textContent.includes('已翻译'));
    const requests = await page.evaluate(() => window.fakeRequests);
    assert(requests.includes('Hello, traveler.'));
    assert(!requests.includes('Do not translate me'));
    assert(!requests.includes('Editable draft'));
    assert.equal(await page.locator('[data-zeta-zh="translation"] img').count(), 0);
    assert((await page.locator('[data-zeta-zh="translation"]').first().innerText()).includes('<img'));
    const count = requests.length;
    await page.locator('#visible').click();
    await page.waitForFunction(() => !document.querySelector('[data-zeta-zh="panel"]').shadowRoot.querySelector('#visible').disabled);
    assert.equal((await page.evaluate(() => fakeRequests)).length, count);
    fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
    await page.screenshot({ path: path.join(root, 'test-results/reading.png') });
    await page.locator('#restore').click();
    assert.equal(await page.locator('[data-zeta-zh="translation"]').count(), 0);
    await page.locator('#toggle').click();
    assert.equal(await page.locator('nav button').first().innerText(), 'Home');
    await page.locator('#toggle').click();
    assert.equal(await page.locator('nav button').first().innerText(), '首页');
    // Selecting a passage translates only that passage into the isolated panel.
    await page.evaluate(() => { const range = document.createRange();range.selectNodeContents(document.querySelector('p'));const s=getSelection();s.removeAllRanges();s.addRange(range);document.dispatchEvent(new Event('selectionchange')); });
    await page.locator('#selected').click();
    await page.waitForFunction(() => document.querySelector('[data-zeta-zh="panel"]').shadowRoot.querySelector('#result').textContent.includes('中文译文'));
    // Route changes clear old translations and stale selected text.
    await page.evaluate(() => { history.pushState({}, '', '/en/rooms/next');document.body.append(document.createElement('div')); });
    await page.waitForFunction(() => !document.querySelector('[data-zeta-zh="panel"]').shadowRoot.querySelector('#result').textContent);
    console.log('Browser checks passed: dynamic UI, prose/edit isolation, visible/selection translation, XSS, duplicate prevention, restore and route cleanup.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

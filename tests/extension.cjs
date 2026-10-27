// Test-only manifest copy pre-grants loopback permission because native permission prompts cannot be accepted headlessly.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const http=require('node:http');const assert=require('node:assert/strict');
(async()=>{
 const requests=[];const server=http.createServer((req,res)=>{let s='';req.on('data',b=>s+=b);req.on('end',()=>{requests.push(JSON.parse(s));res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:'你好，旅人。'}}]}))})});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'zeta-api-fixture-'));const ext=path.join(fixture,'extension');fs.cpSync(path.resolve(__dirname,'../extension'),ext,{recursive:true});const manifestPath=path.join(ext,'manifest.json');const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));manifest.host_permissions=['http://127.0.0.1/*'];fs.writeFileSync(manifestPath,JSON.stringify(manifest));
 const context=await chromium.launchPersistentContext('',{channel:'chromium',headless:true,args:[`--disable-extensions-except=${ext}`,`--load-extension=${ext}`]});
 try {
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const id=worker.url().split('/')[2];
  const options=await context.newPage();await options.goto(`chrome-extension://${id}/options.html`);await options.locator('#provider').selectOption('api');
  await options.locator('#endpoint').fill(`http://127.0.0.1:${server.address().port}/v1/chat/completions`);await options.locator('#model').fill('mock');await options.locator('button[type=submit]').click();
  await options.waitForFunction(()=>document.querySelector('output').textContent.length>0);console.log('options:',await options.locator('output').innerText());
  const granted=await worker.evaluate(()=>chrome.permissions.getAll());console.log('granted:',granted.origins);
  if(!granted.origins?.length)throw new Error('Optional permission was not granted in test browser');
  const page=await context.newPage();await page.route('https://zeta-ai.io/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<html><body><nav>Home</nav><p>Hello, traveler.</p></body></html>'}));
  await page.goto('https://zeta-ai.io/en');await page.locator('#visible').waitFor();await page.locator('#visible').click();
  await page.waitForFunction(()=>document.querySelector('[data-zeta-zh=translation]')?.textContent.includes('你好'));
  assert.equal(requests[0].messages[1].content,'Hello, traveler.');
  console.log('PASS: real extension → background → local mock API → bilingual DOM (test fixture pre-grants loopback permission)');
 }finally {await context.close();await new Promise(r=>server.close(r));fs.rmSync(fixture,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

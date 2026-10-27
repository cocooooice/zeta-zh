(() => {
  "use strict";
  const OWN = "[data-zeta-zh]";
  const SKIP = `script,style,noscript,svg,input,textarea,select,option,pre,code,[contenteditable]:not([contenteditable="false"]),${OWN}`;
  const PROSE = '[data-sentry-component*="Bubble"],[data-sentry-component*="Message"],[data-sentry-component="PlotDetail"],[data-sentry-component="PlotCharacter"]';
  const originals = new Map();
  let settings = { provider: "local", uiEnabled: true };
  let translating = false;
  let selection = "";
  let generation = 0;
  let pageURL = location.href;
  const translators = new Map();

  const host = document.createElement("div");
  host.dataset.zetaZh = "panel";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      :host{all:initial;position:fixed;right:18px;bottom:90px;z-index:2147483647;font:14px/1.6 system-ui,sans-serif;color:#e9edf7}
      *{box-sizing:border-box} details{width:310px;background:#151b2a;border:1px solid #34425e;border-radius:16px;box-shadow:0 10px 35px #0005}
      summary{cursor:pointer;padding:12px 16px;font-weight:650;list-style:none}summary::after{content:' ⇅';color:#81dece}
      section{padding:0 16px 16px}p{margin:0 0 10px;color:#b9c5d9;font-size:12px}nav{display:flex;gap:8px;flex-wrap:wrap}
      button,select{font:inherit;border-radius:8px;border:1px solid #42516c;padding:7px 10px;background:#242f46;color:#eef3ff;cursor:pointer}
      button.primary{background:#91e2d0;color:#112a27;border-color:#91e2d0}button:disabled{opacity:.5;cursor:wait}
      label{display:block;margin:10px 0;font-size:12px}select{padding:3px;font-size:12px}output{display:block;margin-top:10px;font-size:12px;color:#a9eddf}
      article{white-space:pre-wrap;overflow-wrap:anywhere;max-height:40vh;overflow:auto;margin-top:10px}
      @media(max-width:400px){details{width:280px}:host{right:8px}}
    </style>
    <details open><summary>Zeta 中文助手</summary><section>
      <p id="privacy"></p>
      <nav><button id="selected" class="primary">翻译选中文字</button><button id="visible">翻译当前可见内容</button></nav>
      <label>本地翻译原文语言 <select id="source"><option value="en">英语</option><option value="ko">韩语</option><option value="ja">日语</option></select></label>
      <nav><button id="restore">清除译文</button><button id="toggle">关闭界面汉化</button><button id="settings">设置</button></nav>
      <output role="status" aria-live="polite">选择文字后点击翻译，或翻译当前屏幕。</output><article id="result"></article>
    </section></details>`;
  document.documentElement.append(host);
  const $ = id => shadow.getElementById(id);
  const status = text => { shadow.querySelector("output").textContent = text; };
  $("source").value = /^\/(ko|ja)(\/|$)/.exec(location.pathname)?.[1] || "en";
  document.addEventListener("selectionchange", () => {
    const current = getSelection();
    if (current?.toString().trim() && current.anchorNode?.getRootNode() === document && !current.anchorNode?.parentElement?.closest(OWN)) selection = current.toString();
  });

  function paintSettings() {
    $("privacy").textContent = settings.provider === "api"
      ? "API 模式：点击翻译才会把选中文字或可见内容发送到你配置的服务，可能计费。"
      : "本地模式：文字由浏览器翻译；首次使用可能需要下载语言模型。";
    $("toggle").textContent = settings.uiEnabled ? "关闭界面汉化" : "开启界面汉化";
  }

  function localize() {
    for (const [node] of originals) if (!node.isConnected) originals.delete(node);
    if (!settings.uiEnabled) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || parent.closest(`${SKIP},${PROSE}`)) continue;
      const text = node.nodeValue.trim();
      const translated = globalThis.ZETA_ZH_DICTIONARY[text];
      if (translated && translated !== text && Object.hasOwn(globalThis.ZETA_ZH_DICTIONARY, text)) {
        originals.set(node, { source: node.nodeValue, translated });
        node.nodeValue = node.nodeValue.replace(text, translated);
      }
    }
  }

  function clearTranslations() {
    generation++;
    document.querySelectorAll('[data-zeta-zh="translation"]').forEach(el => el.remove());
    $("result").textContent = "";
  }

  async function translate(text) {
    if (text.length > 12000) throw new Error("单次最多 12,000 字符，请缩小选择范围。");
    if (settings.provider === "api") {
      const response = await chrome.runtime.sendMessage({ type: "translate", text });
      if (response?.error) throw new Error(response.error);
      if (!response?.text) throw new Error("扩展连接中断，请刷新页面重试。");
      return response.text;
    }
    if (!("Translator" in globalThis)) throw new Error("此浏览器无法使用本地翻译。请在设置中切换到 API 模式，或使用支持 Translator API 的桌面 Chrome。");
    const sourceLanguage = $("source").value;
    if (!translators.has(sourceLanguage)) {
      const options = { sourceLanguage, targetLanguage: "zh" };
      if (await Translator.availability(options) === "unavailable") throw new Error("浏览器暂不支持这个语言对，请切换语言或使用 API 模式。");
      status("正在准备本地翻译模型，首次下载可能需要一些时间…");
      translators.set(sourceLanguage, await Translator.create(options));
    }
    return translators.get(sourceLanguage).translate(text);
  }

  function visibleBlocks() {
    const blocks = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim() || parent.closest(SKIP)) continue;
      const el = parent.closest("p,li,blockquote") || parent;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!rect.width || !rect.height || rect.top >= innerHeight || rect.bottom <= 0 || rect.left >= innerWidth || rect.right <= 0 || style.visibility !== "visible" || style.display === "none" || Number(style.opacity) === 0) continue;
      const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
      const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && el.contains(hit)) blocks.add(el);
    }
    return [...blocks].filter(el => {
      if ([...blocks].some(other => other !== el && el.contains(other))) return false;
      if (el.nextElementSibling?.matches('[data-zeta-zh="translation"]')) return false;
      const text = el.innerText?.trim();
      return text?.length >= 3 && /[A-Za-z\u3040-\u30ff\uac00-\ud7af]/.test(text);
    });
  }

  async function run(selected) {
    if (translating) return;
    translating = true;
    const token = generation;
    const url = location.href;
    $("selected").disabled = $("visible").disabled = true;
    try {
      if (selected) {
        if (!selection.trim()) throw new Error("请先在网页上选择需要翻译的文字。");
        status("正在翻译选中文字…");
        const text = await translate(selection);
        if (token !== generation || location.href !== url) return;
        $("result").textContent = text;
        status("翻译完成，原文保留在网页中。");
      } else {
        const blocks = visibleBlocks();
        let count = 0;
        let characters = 0;
        for (const block of blocks) {
          const source = block.innerText.trim();
          if (count >= 30 || characters + source.length > 12000) break;
          status(`正在翻译第 ${count + 1} 段…`);
          const text = await translate(source);
          if (token !== generation || location.href !== url) return;
          if (!block.isConnected || block.innerText.trim() !== source) continue;
          const output = document.createElement("div");
          output.dataset.zetaZh = "translation";
          output.lang = "zh-CN";
          output.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;padding:8px 12px;margin:6px 0;border-left:3px solid #71cdb7;background:#16372f;color:#defff5;font:14px/1.7 system-ui,sans-serif;";
          output.textContent = text;
          block.after(output);
          count++;
          characters += source.length;
        }
        status(`已翻译 ${count} 段。每次最多 30 段 / 12,000 字符，滚动后可继续。`);
      }
    } catch (error) { status(error.message); }
    finally { translating = false; $("selected").disabled = $("visible").disabled = false; }
  }

  $("selected").onclick = event => { if (event.isTrusted) run(true); };
  $("visible").onclick = event => { if (event.isTrusted) run(false); };
  $("restore").onclick = () => { clearTranslations(); status("已清除译文，进行中的结果也会忽略。"); };
  $("settings").onclick = () => chrome.runtime.sendMessage({ type: "options" });
  $("toggle").onclick = () => {
    settings.uiEnabled = !settings.uiEnabled;
    if (!settings.uiEnabled) {
      for (const [node, record] of originals) {
        if (node.isConnected && node.nodeValue.trim() === record.translated) node.nodeValue = record.source;
      }
      originals.clear();
    }
    paintSettings();
    localize();
  };
  let timer;
  new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (pageURL !== location.href) { pageURL = location.href; clearTranslations(); selection = ""; }
      localize();
    }, 180);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  chrome.runtime.sendMessage({ type: "settings" }).then(value => {
    if (value) settings = value;
    paintSettings(); localize();
  }).catch(() => status("扩展已更新，请刷新页面。"));
  chrome.storage.onChanged.addListener(() => {
    chrome.runtime.sendMessage({ type: "settings" }).then(value => {
      if (value) { settings.provider = value.provider; paintSettings(); }
    });
  });
})();

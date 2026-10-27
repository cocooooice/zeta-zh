import { DEFAULTS, endpointURL, translateAPI, validateText } from "./provider.js";

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
let busy = false;

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!sender.tab || !/^https:\/\/(www\.)?zeta-ai\.io\//.test(sender.url || "")) return;
  if (message.type === "settings") {
    chrome.storage.local.get(DEFAULTS).then(({ provider, uiEnabled }) => respond({ provider, uiEnabled }));
    return true;
  }
  if (message.type === "options") { chrome.runtime.openOptionsPage(); return; }
  if (message.type !== "translate") return;
  (async () => {
    if (busy) throw new Error("另一段文字正在翻译，请稍后重试。");
    busy = true;
    try {
      validateText(message.text);
      const settings = await chrome.storage.local.get(DEFAULTS);
      if (settings.provider !== "api") throw new Error("请先选择 API 翻译并保存设置。");
      const url = endpointURL(settings.endpoint);
      if (!await chrome.permissions.contains({ origins: [`${url.origin}/*`] })) throw new Error("尚未授权此 API 地址，请打开设置重新保存。");
      return await translateAPI(message.text, settings);
    } finally { busy = false; }
  })().then(text => respond({ text }), error => respond({ error: error.name === "TimeoutError" ? "翻译超时，请稍后重试。" : error.message }));
  return true;
});

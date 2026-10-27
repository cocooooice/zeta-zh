import { DEFAULTS, endpointURL } from "./provider.js";
const ids = ["provider", "endpoint", "model", "apiKey", "uiEnabled"];
const $ = id => document.getElementById(id);
const output = document.querySelector("output");
let savedOrigin;
function showProvider() { $("api").hidden = $("provider").value !== "api"; }
async function load() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  for (const id of ids) {
    if (id === "uiEnabled") $(id).checked = settings[id];
    else $(id).value = settings[id];
  }
  try { savedOrigin = endpointURL(settings.endpoint).origin; } catch { savedOrigin = undefined; }
  showProvider();
}
$("provider").onchange = showProvider;
$("settings").onsubmit = async event => {
  event.preventDefault();
  try {
    const settings = Object.fromEntries(ids.map(id => [id, id === "uiEnabled" ? $(id).checked : $(id).value.trim()]));
    let origin;
    if (settings.provider === "api") {
      origin = endpointURL(settings.endpoint).origin;
      if (!settings.model) throw new Error("请填写模型名称。");
      // Request inside the explicit Save click; only this configured origin is granted.
      if (!await chrome.permissions.request({ origins: [`${origin}/*`] })) throw new Error("未获得接口访问权限，设置未保存。");
    }
    await chrome.storage.local.set(settings);
    if (savedOrigin && savedOrigin !== origin) await chrome.permissions.remove({ origins: [`${savedOrigin}/*`] });
    savedOrigin = origin;
    output.textContent = "已保存。Zeta 页面会使用新翻译方式；默认汉化开关需刷新页面生效。";
  } catch (error) { output.textContent = error.message; }
};
$("clear").onclick = async () => {
  await chrome.storage.local.set({ apiKey: "", endpoint: "", model: "", provider: "local" });
  if (savedOrigin) await chrome.permissions.remove({ origins: [`${savedOrigin}/*`] });
  await load();
  output.textContent = "API 配置与密钥已删除，已切回本地模式。";
};
load().catch(error => { output.textContent = error.message; });

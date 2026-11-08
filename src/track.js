/**
 * 极轻量、隐私友好的匿名统计。
 * - 不收集 IP、不写 cookie、不存个人标识
 * - 只记录：事件名 + 市场 + 页面路径
 * - 使用 GoatCounter（开源、可自建、免费额度足够）；未配置 endpoint 时完全静默
 *
 * 配置：在 index.html 里把 data-endpoint 改成你自己的 GoatCounter 站点即可；
 * 留空则不发送任何请求（默认行为，开发/本地不产生流量）。
 */
(function (root) {
  "use strict";

  var endpoint = null; // 例如 "https://landed.goatcounter.com/count"
  var enabled = false;

  function init(cfg) {
    if (!cfg || !cfg.endpoint) return;
    endpoint = cfg.endpoint;
    enabled = true;
  }

  function send(path) {
    if (!enabled) return;
    try {
      var url =
        endpoint +
        "?p=" +
        encodeURIComponent(path) +
        "&t=" +
        encodeURIComponent("pageview");
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url);
      } else {
        var img = new Image();
        img.src = url;
      }
    } catch (e) {
      /* 统计失败绝不影响功能 */
    }
  }

  function event(name, market) {
    if (!enabled) return;
    var path = "/event/" + name + (market ? "/" + market : "");
    send(path);
  }

  root.Track = {
    init: init,
    event: event,
    enabled: function () {
      return enabled;
    },
  };
})(typeof window !== "undefined" ? window : globalThis);

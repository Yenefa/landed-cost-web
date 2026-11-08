(function () {
  "use strict";
  var D = window.APP_DATA,
    Calc = window.Calc;

  var marketCode = "NG";
  var country = D.getMarket(marketCode);
  var channel = D.getChannel(marketCode);

  function $(id) {
    return document.getElementById(id);
  }
  function num(el, d) {
    var v = parseFloat(el.value);
    return isFinite(v) ? v : d;
  }
  function fmt(v, digits) {
    if (!isFinite(v)) return "—";
    var d = digits == null ? 0 : digits;
    return v.toLocaleString("en-US", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });
  }
  function money(v, digits) {
    return country.currencySymbol + fmt(v, digits);
  }
  function pct(v, d) {
    return (v * 100).toFixed(d == null ? 1 : d) + "%";
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function fillSelect(el, entries, sel) {
    el.innerHTML = "";
    entries.forEach(function (e) {
      var o = document.createElement("option");
      o.value = e.value;
      o.textContent = e.label;
      if (e.value === sel) o.selected = true;
      el.appendChild(o);
    });
  }

  function buildSelects() {
    fillSelect(
      $("f_freightMode"),
      Object.keys(D.freight).map(function (k) {
        var f = D.freight[k];
        return {
          value: k,
          label:
            f.name +
            " · " +
            f.value +
            " " +
            f.unit +
            " · " +
            f.transitDays +
            "天",
        };
      }),
      D.defaults.freightMode,
    );
    fillSelect(
      $("f_dutyCat"),
      Object.keys(country.import.dutyByCategory).map(function (k) {
        var c = country.import.dutyByCategory[k];
        return { value: k, label: c.label + " · " + c.rate * 100 + "%" };
      }),
      D.defaults.dutyCategory,
    );
    fillSelect(
      $("f_commCat"),
      Object.keys(channel.commissionByCategory).map(function (k) {
        var c = channel.commissionByCategory[k];
        return { value: k, label: c.label + " · " + c.rate * 100 + "%" };
      }),
      D.defaults.commissionCategory,
    );
  }

  function setDefaults() {
    $("f_unitCost").value = D.defaults.unitCostCNY;
    $("f_qty").value = D.defaults.qty;
    $("f_unitWeight").value = D.defaults.unitWeightKg;
    $("f_unitVolume").value = D.defaults.unitVolumeCbm;
    $("f_margin").value = Math.round(D.defaults.desiredMargin * 100);
    $("f_return").value = Math.round(D.defaults.returnRate * 100);
    $("f_ad").value = Math.round(D.defaults.adRate * 100);
    $("f_price").value = "";
    $("f_fx").value = country.fx.local.value;
    $("f_cny").value = country.fx.CNY_per_USD.value;
    $("f_cert").value = country.certification.rules[0]
      ? country.certification.rules[0].perShipmentUSD || 600
      : 600;
    $("f_clearance").value = country.clearances.perShipmentUSD.value;
    $("f_domestic").value = D.defaults.domesticFixedCNY;
    $("f_freightMode").value = D.defaults.freightMode;
    $("f_dutyCat").value = D.defaults.dutyCategory;
    $("f_commCat").value = D.defaults.commissionCategory;
  }

  function readInput() {
    return {
      unitCostCNY: num($("f_unitCost"), 0),
      qty: num($("f_qty"), 1),
      unitWeightKg: num($("f_unitWeight"), 0),
      unitVolumeCbm: num($("f_unitVolume"), 0),
      freightMode: $("f_freightMode").value,
      dutyCategory: $("f_dutyCat").value,
      commissionCategory: $("f_commCat").value,
      desiredMargin: num($("f_margin"), 20) / 100,
      returnRate: num($("f_return"), 12) / 100,
      adRate: num($("f_ad"), 5) / 100,
      targetPriceNGN: num($("f_price"), 0),
      fxNGNperUSD: num($("f_fx"), country.fx.local.value),
      fxCNYperUSD: num($("f_cny"), country.fx.CNY_per_USD.value),
      certUSDOverride: num($("f_cert"), null),
      clearanceUSD: num(
        $("f_clearance"),
        country.clearances.perShipmentUSD.value,
      ),
      domesticFixedCNY: num($("f_domestic"), D.defaults.domesticFixedCNY),
      insuranceRate: D.defaults.insuranceRate,
    };
  }

  function renderMarketChrome() {
    $("mFlag").textContent = country.flag;
    $("mName").textContent = country.name + " · " + country.platform;
    $("eyebrowText").textContent =
      country.nameEn + " · " + country.platform.toUpperCase() + " · 2026";
    $("statVat").textContent = pct(
      country.import.vatOnImport.value,
      (country.import.vatOnImport.value * 100) % 1 === 0 ? 0 : 1,
    );
    var rates = Object.keys(channel.commissionByCategory).map(function (k) {
      return channel.commissionByCategory[k].rate;
    });
    var lo = Math.round(Math.min.apply(null, rates) * 100),
      hi = Math.round(Math.max.apply(null, rates) * 100);
    $("statComm").textContent = lo === hi ? lo + "%" : lo + "–" + hi + "%";
    var cycle =
      D.defaults.leadTime.productionDays +
      D.freight.sea_lcl.transitDays +
      D.defaults.leadTime.clearanceDays +
      D.defaults.leadTime.sellThroughDays +
      channel.payoutDays.value;
    $("statCycle").textContent = cycle + "+ 天";
    $("fxUnit").textContent = country.fx.local.label;
    $("priceUnit").textContent = country.currencySymbol + " · 留空自动";
    $("tblCur").textContent = country.currencySymbol;
    document.title = "落地价 · " + country.name + "落地成本计算器";
  }

  function render() {
    var input = readInput();
    var freight = D.freight[input.freightMode] || D.freight.sea_lcl;
    var res = Calc.compute(input, {
      country: country,
      channel: channel,
      freight: freight,
      leadTime: D.defaults.leadTime,
    });

    $("heroLanded").innerHTML =
      "<small>" +
      esc(country.currencySymbol) +
      "</small>" +
      fmt(res.landed.unitNGN);
    $("heroSub").innerHTML =
      "≈ ¥" +
      fmt(res.landed.unitCNY, 2) +
      " · 含关税 " +
      pct(res.inputs.dutyRate, 0) +
      " · 增值税 " +
      pct(res.meta.vatRate, 0) +
      " · 认证与清关";

    $("rPrice").textContent = money(res.pricing.priceNGN);
    var profitEl = $("rProfit");
    profitEl.innerHTML =
      money(res.unit.netProfitNGN) +
      "<small>" +
      pct(res.unit.netMargin, 1) +
      "</small>";
    profitEl.className = res.unit.netProfitNGN >= 0 ? "pos" : "neg";

    var beEl = $("rBe");
    beEl.textContent = isFinite(res.batch.recoverRatio)
      ? pct(res.batch.recoverRatio, 0)
      : "无法回本";
    beEl.className =
      res.batch.recoverRatio > 1
        ? "neg"
        : res.batch.recoverRatio > 0.85
          ? "amb"
          : "pos";

    $("rBatch").innerHTML =
      money(res.landed.batchTotalNGN) +
      "<small>≈ ¥" +
      fmt(
        (res.landed.batchTotalNGN / res.inputs.ngnPerUsd) *
          res.inputs.cnyPerUsd,
      ) +
      "</small>";
    $("rCycle").innerHTML =
      res.cash.cycleDays +
      " 天" +
      "<small>占用 " +
      money(res.cash.capitalLockedNGN) +
      "</small>";

    var total = res.landed.totalUSD;
    var bar = $("stackbar"),
      legend = $("legend");
    bar.innerHTML = "";
    legend.innerHTML = "";
    res.stack.forEach(function (s) {
      if (s.usd <= 0) return;
      var seg = document.createElement("div");
      seg.className = "seg";
      seg.style.flexGrow = String(s.usd);
      seg.style.background = s.color;
      seg.title =
        s.label +
        " " +
        money(s.usd * res.inputs.ngnPerUsd) +
        "（" +
        pct(s.usd / total, 1) +
        "）";
      bar.appendChild(seg);
      var li = document.createElement("div");
      li.className = "li";
      li.innerHTML =
        '<span class="sw" style="background:' +
        s.color +
        '"></span><span class="nm">' +
        esc(s.label) +
        '</span><span class="vl">' +
        pct(s.usd / total, 1) +
        "</span>";
      legend.appendChild(li);
    });

    var tb = $("costTable");
    tb.innerHTML = "";
    res.stack
      .filter(function (s) {
        return s.usd > 0;
      })
      .forEach(function (s) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td>" +
          esc(s.label) +
          "</td><td class='num'>" +
          money(s.usd * res.inputs.ngnPerUsd) +
          "</td><td class='num'>" +
          pct(s.usd / total, 1) +
          "</td>";
        tb.appendChild(tr);
      });
    var trT = document.createElement("tr");
    trT.className = "total";
    trT.innerHTML =
      "<td>落地总成本</td><td class='num'>" +
      money(res.landed.batchTotalNGN) +
      "</td><td class='num'>100%</td>";
    tb.appendChild(trT);

    var st = $("sensTable");
    var head = "<tr><th class='rowh'>汇率 \\ 退货率</th>";
    res.sensitivity[0].cells.forEach(function (c) {
      head += "<th>" + pct(c.returnRate, 0) + "</th>";
    });
    head += "</tr>";
    var body = "";
    res.sensitivity.forEach(function (row) {
      var label =
        row.fxShock === 0
          ? "基准 · " + Math.round(row.fx)
          : row.fxShock > 0
            ? "本币贬值 15% ↓"
            : "本币升值 15% ↑";
      body += "<tr><td class='rowh'>" + label + "</td>";
      row.cells.forEach(function (c) {
        var cls = c.netMargin < 0 ? "neg" : c.netMargin < 0.08 ? "amb" : "pos";
        body += "<td class='" + cls + "'>" + fmt(c.netProfit) + "</td>";
      });
      body += "</tr>";
    });
    st.innerHTML = head + body;
    $("sensNote").textContent =
      "格内为单件净利（" +
      country.currencySymbol +
      "）。基准售价 " +
      money(res.pricing.priceNGN) +
      "，单件落地 " +
      money(res.landed.unitNGN) +
      "。本币贬值时你的美元成本折成本币更贵，售价却未必能同步涨。";

    renderRisks(res, input);

    var srcEl = $("sourcesList");
    srcEl.innerHTML = "";
    []
      .concat(country.sources || [], channel.sources || [])
      .forEach(function (s) {
        if (!s.url) return;
        var li = document.createElement("li");
        li.innerHTML =
          '<a href="' +
          s.url +
          '" target="_blank" rel="noopener">' +
          esc(s.label) +
          "</a>";
        srcEl.appendChild(li);
      });
    var liNote = document.createElement("li");
    liNote.textContent =
      country.note +
      "。汇率、运费、认证费为参考值，左侧可直接改；改动后所有结果实时重算。";
    srcEl.appendChild(liNote);

    $("foot").textContent =
      D.meta.disclaimer +
      " · v" +
      D.meta.version +
      " · 数据更新 " +
      D.meta.updated;
  }

  function renderRisks(res, input) {
    var out = [];
    var m = res.unit.netMargin;
    if (res.batch.recoverRatio > 1)
      out.push([
        "high",
        "整批卖完也回不了本",
        "按当前售价需卖出 " +
          fmt(Math.ceil(res.batch.breakEvenUnits)) +
          " 件才能覆盖成本，而本批只有 " +
          fmt(res.inputs.qty) +
          " 件。要么涨价，要么压落地成本。",
      ]);
    if (m < 0)
      out.push([
        "high",
        "单件亏损",
        "扣完平台费、广告和退货后，每件亏 " +
          money(-res.unit.netProfitNGN) +
          "。",
      ]);
    else if (m < 0.08)
      out.push([
        "mid",
        "净利率偏薄（" + pct(m, 1) + "）",
        "本币再贬 10% 就可能转亏，建议把售价锚定美元成本做动态调价。",
      ]);
    if (input.returnRate >= 0.2)
      out.push([
        "high",
        "退货 / 妥投失败率 ≥ 20%",
        country.name +
          "电商（尤其货到付款）未妥投会产生往返运费与仓储，实际损失常高于账面。",
      ]);
    else if (input.returnRate >= 0.15)
      out.push([
        "mid",
        "退货率偏高",
        "按 " +
          pct(input.returnRate, 0) +
          " 计，每件已摊入 " +
          money(res.unit.returnCostNGN) +
          " 退货成本。",
      ]);
    if (res.inputs.dutyRate >= 0.2)
      out.push([
        "mid",
        "高税品类（关税 " + pct(res.inputs.dutyRate, 0) + "）",
        "关税 + 增值税占落地价大头，低值重货尤其容易被运费和税吃穿。",
      ]);
    if (res.certSchemes.length && res.meta.certUSD <= 0)
      out.push([
        "high",
        "该品类需要 " + res.certSchemes.join(" / ") + "，但认证费为 0",
        "没有认证无法清关 / 上架，请把认证费补进高级参数。",
      ]);
    if (res.cash.cycleDays > 150)
      out.push([
        "mid",
        "资金周转约 " + res.cash.cycleDays + " 天",
        "资金占用约 " +
          money(res.cash.capitalLockedNGN) +
          "，备货前先确认能撑多久。",
      ]);
    if (input.adRate > 0.15)
      out.push([
        "mid",
        "广告占比 > 15%",
        "独立站 / 新店常见，但会直接吃掉净利，先测自然转化。",
      ]);
    if (!out.length)
      out.push([
        "ok",
        "主要风险可控",
        "按当前参数，净利率与回本率都在安全区，仍建议小批量试单验证真实退货率与运费。",
      ]);

    var el = $("risks");
    el.innerHTML = "";
    out.forEach(function (r) {
      var div = document.createElement("div");
      div.className =
        "risk lvl-" +
        (r[0] === "high" ? "high" : r[0] === "mid" ? "mid" : "ok");
      div.innerHTML =
        '<div class="bd"></div><div class="tx"><b>' +
        esc(r[1]) +
        "</b><span>" +
        esc(r[2]) +
        "</span></div>";
      el.appendChild(div);
    });
  }

  // ---- 市场切换 ----
  function buildMarketMenu() {
    var menu = $("marketMenu");
    menu.innerHTML = "";
    D.marketOrder.forEach(function (code) {
      var m = D.getMarket(code);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "market-item" + (code === marketCode ? " on" : "");
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", code === marketCode ? "true" : "false");
      btn.dataset.code = code;
      btn.innerHTML =
        '<span class="flag">' +
        m.flag +
        "</span><span><b>" +
        esc(m.name) +
        " · " +
        esc(m.platform) +
        "</b><em>" +
        m.currency +
        " · VAT " +
        pct(m.import.vatOnImport.value, 0) +
        "</em></span>";
      btn.addEventListener("click", function () {
        switchMarket(code);
      });
      menu.appendChild(btn);
    });
  }

  function switchMarket(code) {
    if (code === marketCode) {
      closeMenu();
      return;
    }
    marketCode = code;
    country = D.getMarket(code);
    channel = D.getChannel(code);
    closeMenu();
    buildSelects();
    setDefaults();
    renderMarketChrome();
    buildMarketMenu();
    render();
    try {
      history.replaceState(null, "", "?market=" + code);
    } catch (e) {}
    if (window.Track) window.Track.event("switch-market", code);
  }

  function openMenu() {
    $("marketMenu").hidden = false;
    $("marketPill").setAttribute("aria-expanded", "true");
  }
  function closeMenu() {
    $("marketMenu").hidden = true;
    $("marketPill").setAttribute("aria-expanded", "false");
  }

  function shareText(res) {
    return [
      "落地价 · " + country.name + " · " + country.platform,
      "单件落地 " +
        money(res.landed.unitNGN) +
        "（≈¥" +
        fmt(res.landed.unitCNY, 2) +
        "）",
      "建议售价 " +
        money(res.pricing.priceNGN) +
        " · 净利率 " +
        pct(res.unit.netMargin, 1),
      "关税 " +
        pct(res.inputs.dutyRate, 0) +
        " · 增值税 " +
        pct(res.meta.vatRate, 0) +
        " · 回本率 " +
        pct(res.batch.recoverRatio, 0),
      "资金周转 " + res.cash.cycleDays + " 天",
      "",
      "自己算一遍：" + location.href,
    ].join("\n");
  }

  function doShare() {
    var input = readInput();
    var freight = D.freight[input.freightMode] || D.freight.sea_lcl;
    var res = Calc.compute(input, {
      country: country,
      channel: channel,
      freight: freight,
      leadTime: D.defaults.leadTime,
    });
    var text = shareText(res);
    var btn = $("btnShare");
    var restore = function () {
      btn.textContent = btn.dataset.label;
      setTimeout(function () {
        btn.innerHTML = btn.dataset.html;
      }, 1600);
    };
    btn.dataset.html = btn.innerHTML;
    btn.dataset.label = "已复制";
    if (window.Track) window.Track.event("share", marketCode);
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      navigator
        .share({
          title: "落地价 · " + country.name,
          text: text,
          url: location.href,
        })
        .catch(function () {});
      return;
    }
    var done = function () {
      btn.textContent = "✓ 已复制结果";
      restore();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(done)
        .catch(function () {
          window.prompt("复制这段结果：", text);
        });
    } else {
      window.prompt("复制这段结果：", text);
    }
  }

  function boot() {
    var q = /[?&]market=(NG|KE|ZA)/.exec(location.search);
    if (q) marketCode = q[1];
    country = D.getMarket(marketCode);
    channel = D.getChannel(marketCode);

    buildSelects();
    setDefaults();
    renderMarketChrome();
    buildMarketMenu();
    render();

    $("marketPill").addEventListener("click", function (e) {
      e.stopPropagation();
      if ($("marketMenu").hidden) openMenu();
      else closeMenu();
    });
    document.addEventListener("click", function (e) {
      if (!$("marketMenu").hidden && !$("marketSwitch").contains(e.target))
        closeMenu();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMenu();
    });

    var ids = [
      "f_unitCost",
      "f_qty",
      "f_unitWeight",
      "f_unitVolume",
      "f_freightMode",
      "f_dutyCat",
      "f_commCat",
      "f_margin",
      "f_return",
      "f_ad",
      "f_price",
      "f_fx",
      "f_cny",
      "f_cert",
      "f_clearance",
      "f_domestic",
    ];
    ids.forEach(function (id) {
      var el = $(id);
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });
    $("btnReset").addEventListener("click", function () {
      setDefaults();
      render();
    });
    $("btnShare").addEventListener("click", doShare);
    if (window.Track) window.Track.event("visit", marketCode);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

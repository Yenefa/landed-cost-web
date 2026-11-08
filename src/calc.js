/**
 * 计算内核（纯函数，无 DOM，可在 Node 里测）
 * 所有金额：内部先统一到 USD，再按汇率转 NGN / CNY。
 */
(function (root) {
  "use strict";

  function n(v, d) {
    var x = typeof v === "number" ? v : parseFloat(v);
    return isFinite(x) ? x : d;
  }
  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }
  function r2(v) {
    return Math.round(v * 100) / 100;
  }

  function val(x, d) {
    if (x && typeof x === "object" && "value" in x) return x.value;
    return x == null ? d : x;
  }

  /** 进口税费：关税 / 附加费 / CISS / ETLS / IDF / RDL / VAT（按市场参数） */
  function computeImport(
    goodsValueUSD,
    freightUSD,
    rules,
    dutyRate,
    insuranceRate,
  ) {
    var cif = goodsValueUSD + freightUSD + goodsValueUSD * insuranceRate;
    var duty = cif * dutyRate;
    var surcharge = duty * val(rules.surchargeOnDuty, 0);
    var ciss = goodsValueUSD * val(rules.cissOnFob, 0); // FOB ≈ 货值
    var etls = cif * val(rules.etlsOnCif, 0);
    var idf = cif * val(rules.idfOnCif, 0);
    var rdl = cif * val(rules.rdlOnCif, 0);
    var vatBase = cif + duty + surcharge + ciss + etls + idf + rdl;
    var vat = vatBase * val(rules.vatOnImport, 0);
    var total = duty + surcharge + ciss + etls + idf + rdl + vat;
    return {
      cif: cif,
      duty: duty,
      surcharge: surcharge,
      ciss: ciss,
      etls: etls,
      idf: idf,
      rdl: rdl,
      vatBase: vatBase,
      vat: vat,
      total: total,
    };
  }

  function certCost(country, categories, perShipment) {
    // perShipment: true 表示按批次计；false 表示按 SKU 一次性分摊（这里简化为按批次摊销）
    var cost = 0,
      schemes = [];
    var rules = (country.certification && country.certification.rules) || [];
    for (var i = 0; i < rules.length; i++) {
      var hit = rules[i].categories.some(function (c) {
        return categories.indexOf(c) !== -1;
      });
      if (!hit) continue;
      schemes.push(rules[i].scheme);
      if (rules[i].perShipmentUSD) cost += rules[i].perShipmentUSD;
      // perSku 视为一次性投入，按 3 批摊销
      if (rules[i].perSkuUSD) cost += rules[i].perSkuUSD / 3;
    }
    return { cost: cost, schemes: schemes };
  }

  /**
   * 主计算
   * @param {object} input 用户输入
   * @param {object} ctx  {country, channel, freight}
   */
  function compute(input, ctx) {
    var country = ctx.country,
      channel = ctx.channel,
      freight = ctx.freight;
    var fx = country.fx;

    var qty = Math.max(1, Math.round(n(input.qty, 1)));
    var unitCostCNY = Math.max(0, n(input.unitCostCNY, 0));
    var unitW = Math.max(0, n(input.unitWeightKg, 0));
    var unitV = Math.max(0, n(input.unitVolumeCbm, 0));
    var desiredMargin = clamp(n(input.desiredMargin, 0.2), 0, 0.9);
    var returnRate = clamp(n(input.returnRate, 0.12), 0, 0.6);
    var adRate = clamp(n(input.adRate, 0.05), 0, 0.5);
    var returnLossRate = clamp(n(input.returnLossRate, 0.5), 0, 1);
    var insuranceRate = clamp(n(input.insuranceRate, 0.003), 0, 0.1);
    var domesticFixedCNY = Math.max(0, n(input.domesticFixedCNY, 0));
    var ngnPerUsd = Math.max(1, n(input.fxNGNperUSD, val(fx.local, 1500)));
    var cnyPerUsd = Math.max(1, n(input.fxCNYperUSD, fx.CNY_per_USD.value));

    var dutyEntry =
      country.import.dutyByCategory[input.dutyCategory] ||
      country.import.dutyByCategory.other;
    var dutyRate = dutyEntry.rate;

    // 货值 & 运费
    var goodsValueCNY = unitCostCNY * qty;
    var goodsValueUSD = goodsValueCNY / cnyPerUsd;

    var freightUSD;
    if (freight.code === "air") {
      freightUSD = unitW * qty * freight.value;
    } else {
      freightUSD = unitV * qty * freight.value;
    }
    if (!isFinite(freightUSD) || freightUSD < 0) freightUSD = 0;

    var imp = computeImport(
      goodsValueUSD,
      freightUSD,
      country.import,
      dutyRate,
      insuranceRate,
    );

    var cert = certCost(
      country,
      [input.dutyCategory, input.commissionCategory],
      true,
    );
    var certUSD = Math.max(0, n(input.certUSDOverride, cert.cost));
    var clearanceUSD = Math.max(
      0,
      n(input.clearanceUSD, country.clearances.perShipmentUSD.value),
    );
    var domesticFixedUSD = domesticFixedCNY / cnyPerUsd;

    // 落地总成本（USD）：CIF + 进口税费 + 认证 + 清关 + 国内固定
    var landedTotalUSD =
      imp.cif + imp.total + certUSD + clearanceUSD + domesticFixedUSD;
    var landedUnitUSD = landedTotalUSD / qty;
    var landedUnitNGN = landedUnitUSD * ngnPerUsd;
    var landedUnitCNY = landedUnitUSD * cnyPerUsd;

    // 平台费率
    var commEntry = (channel.commissionByCategory &&
      channel.commissionByCategory[input.commissionCategory]) || {
      rate: 0.12,
      label: "默认",
    };
    var commission = commEntry.rate;
    var procFee = channel.paymentProcessing.value;
    var feeVat = (commission + procFee) * val(channel.vatOnFees, 0);
    var feeRate = commission + procFee + feeVat; // 占售价比例

    // 售价：用户指定优先，否则按目标净利率反推
    var autoPrice =
      landedUnitNGN / Math.max(0.01, 1 - feeRate - adRate - desiredMargin);
    var price =
      n(input.targetPriceNGN, 0) > 0 ? n(input.targetPriceNGN, 0) : autoPrice;

    // 单件经济
    var commissionNGN = price * commission;
    var procNGN = price * procFee;
    var feeVatNGN = (commissionNGN + procNGN) * val(channel.vatOnFees, 0);
    var adNGN = price * adRate;
    var platformCostNGN = commissionNGN + procNGN + feeVatNGN + adNGN;

    // 退货成本：退货率 ×（退回处理 + 货值损失部分）
    var outbound = val(channel.outboundPerItemLocal, 350);
    var returnCostPerUnit =
      returnRate * (outbound + landedUnitNGN * returnLossRate);

    var netProfitUnit =
      price - platformCostNGN - landedUnitNGN - returnCostPerUnit;
    var netMargin = price > 0 ? netProfitUnit / price : -1;

    // 回本：整批成本 / 单件"不含退货"的贡献
    var contributionPerUnit = price - platformCostNGN - returnCostPerUnit;
    var batchTotalNGN = landedTotalUSD * ngnPerUsd;
    var breakEvenUnits =
      contributionPerUnit > 0 ? batchTotalNGN / contributionPerUnit : Infinity;
    var recoverRatio = breakEvenUnits / qty; // <1 说明按此价卖完全部可回本
    var sellableUnits = qty * (1 - returnRate);
    var batchProfitNGN = contributionPerUnit * sellableUnits - batchTotalNGN;
    var batchProfitCNY = (batchProfitNGN / ngnPerUsd) * cnyPerUsd;

    // 盈亏平衡售价（卖完全部、扣退货与平台费后不亏）
    var breakEvenPrice =
      (landedUnitNGN + returnRate * outbound) /
      Math.max(0.01, (1 - returnRate) * (1 - feeRate - adRate));

    // 现金流：生产 + 头程 + 清关 + 周转 + 回款
    var lt = ctx.leadTime || {
      productionDays: 15,
      clearanceDays: 10,
      sellThroughDays: 60,
    };
    var cycleDays =
      lt.productionDays +
      freight.transitDays +
      lt.clearanceDays +
      lt.sellThroughDays +
      val(channel.payoutDays, 21);
    var capitalLockedNGN = batchTotalNGN + (certUSD + clearanceUSD) * ngnPerUsd;

    // 成本结构（用于堆叠图）
    var stack = [
      { key: "goods", label: "采购成本", usd: goodsValueUSD, color: "#1F4B3F" },
      { key: "freight", label: "头程运费", usd: freightUSD, color: "#3B7A63" },
      {
        key: "insurance",
        label: "保险",
        usd: goodsValueUSD * insuranceRate,
        color: "#7BA18E",
      },
      { key: "duty", label: "关税", usd: imp.duty, color: "#C57E1C" },
      {
        key: "surcharge",
        label: "附加费",
        usd: imp.surcharge,
        color: "#E9A13B",
      },
      { key: "ciss", label: "CISS", usd: imp.ciss, color: "#F0BE6A" },
      { key: "etls", label: "ETLS", usd: imp.etls, color: "#F4D9A8" },
      { key: "idf", label: "IDF 进口申报费", usd: imp.idf, color: "#D9A15A" },
      { key: "rdl", label: "RDL 铁路发展税", usd: imp.rdl, color: "#C98A7A" },
      { key: "vat", label: "进口增值税", usd: imp.vat, color: "#C2412B" },
      { key: "cert", label: "认证", usd: certUSD, color: "#8C5B3F" },
      {
        key: "clearance",
        label: "清关杂费",
        usd: clearanceUSD,
        color: "#B07C5A",
      },
      {
        key: "domestic",
        label: "国内杂费",
        usd: domesticFixedUSD,
        color: "#D2B79E",
      },
    ];

    // 敏感性：NGN 贬值 × 退货率
    var shocks = [-0.15, 0, 0.15];
    var rets = [
      Math.max(0, returnRate - 0.07),
      returnRate,
      Math.min(0.6, returnRate + 0.08),
    ];
    var sensitivity = shocks.map(function (s) {
      var fx2 = ngnPerUsd * (1 + s);
      var landed2 = landedUnitUSD * fx2;
      var row = rets.map(function (rr) {
        var rc = rr * (outbound + landed2 * returnLossRate);
        var np = price - platformCostNGN - landed2 - rc;
        return {
          returnRate: rr,
          netProfit: np,
          netMargin: price > 0 ? np / price : -1,
        };
      });
      return { fxShock: s, fx: fx2, cells: row };
    });

    return {
      inputs: {
        qty: qty,
        unitCostCNY: unitCostCNY,
        dutyRate: dutyRate,
        commissionRate: commission,
        returnRate: returnRate,
        adRate: adRate,
        desiredMargin: desiredMargin,
        ngnPerUsd: ngnPerUsd,
        cnyPerUsd: cnyPerUsd,
      },
      volume: { weightTotalKg: unitW * qty, volumeTotalCbm: unitV * qty },
      importCost: imp,
      landed: {
        totalUSD: landedTotalUSD,
        unitUSD: landedUnitUSD,
        unitNGN: landedUnitNGN,
        unitCNY: landedUnitCNY,
        batchTotalNGN: batchTotalNGN,
      },
      pricing: {
        autoPriceNGN: autoPrice,
        priceNGN: price,
        breakEvenPriceNGN: breakEvenPrice,
      },
      unit: {
        commissionNGN: commissionNGN,
        procNGN: procNGN,
        feeVatNGN: feeVatNGN,
        adNGN: adNGN,
        platformCostNGN: platformCostNGN,
        returnCostNGN: returnCostPerUnit,
        netProfitNGN: netProfitUnit,
        netMargin: netMargin,
      },
      batch: {
        breakEvenUnits: breakEvenUnits,
        recoverRatio: recoverRatio,
        sellableUnits: sellableUnits,
        profitNGN: batchProfitNGN,
        profitCNY: batchProfitCNY,
      },
      cash: {
        cycleDays: cycleDays,
        capitalLockedNGN: capitalLockedNGN,
        payoutDays: val(channel.payoutDays, 21),
      },
      stack: stack,
      certSchemes: cert.schemes,
      sensitivity: sensitivity,
      meta: {
        country: country.name,
        channel: channel.name,
        freight: freight.name,
        currency: country.currency || "NGN",
        currencySymbol: country.currencySymbol || "₦",
        marketCode: country.code || "NG",
        vatRate: val(country.import.vatOnImport, 0),
        freightUSD: freightUSD,
        freightUnit: freight.unit,
        freightValue: freight.value,
        certUSD: certUSD,
        clearanceUSD: clearanceUSD,
        domesticFixedUSD: domesticFixedUSD,
        dutyLabel: dutyEntry.label,
        commissionLabel: commEntry.label,
      },
    };
  }

  /**
   * 三国对比：同一批货 / 同一套输入，分别落在不同市场的结果。
   *
   * 语义：
   *  - 当前正在编辑的市场（currentCode）用**用户改过的**汇率/认证/清关；
   *  - 其他市场用各自默认值（否则拿尼日利亚的汇率去算肯尼亚会算错）。
   */
  function compareMarkets(input, ctxs, currentCode) {
    var base = {};
    for (var k in input) {
      if (!Object.prototype.hasOwnProperty.call(input, k)) continue;
      if (
        k === "fxNGNperUSD" ||
        k === "fxCNYperUSD" ||
        k === "certUSDOverride" ||
        k === "clearanceUSD"
      )
        continue;
      base[k] = input[k];
    }
    return ctxs.map(function (ctx) {
      var useInput =
        currentCode && ctx.country.code === currentCode ? input : base;
      var r = compute(useInput, ctx);
      return {
        code: ctx.country.code,
        name: ctx.country.name,
        nameEn: ctx.country.nameEn,
        flag: ctx.country.flag,
        platform: ctx.country.platform,
        currencySymbol: r.meta.currencySymbol,
        dutyRate: r.inputs.dutyRate,
        vatRate: r.meta.vatRate,
        landedUnit: r.landed.unitNGN,
        landedUnitCNY: r.landed.unitCNY,
        price: r.pricing.priceNGN,
        netProfit: r.unit.netProfitNGN,
        netMargin: r.unit.netMargin,
        cycleDays: r.cash.cycleDays,
        recoverRatio: r.batch.recoverRatio,
        isCurrent: !!currentCode && ctx.country.code === currentCode,
      };
    });
  }

  var api = {
    compute: compute,
    computeImport: computeImport,
    certCost: certCost,
    compareMarkets: compareMarkets,
    clamp: clamp,
    r2: r2,
  };
  root.Calc = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);

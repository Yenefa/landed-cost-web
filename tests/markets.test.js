/**
 * 多市场计算内核测试（与 Android 版 CalcTest 对齐）
 */
const DATA = require("../src/data.js");
const Calc = require("../src/calc.js");

let pass = 0,
  fail = 0;
function ok(name, cond, extra) {
  if (cond) {
    pass++;
    console.log("ok   - " + name);
  } else {
    fail++;
    console.log("FAIL - " + name + (extra !== undefined ? " :: " + extra : ""));
  }
}
function near(a, b, eps) {
  return Math.abs(a - b) <= (eps == null ? 1e-6 : eps);
}

function run(code, overrides) {
  const market = DATA.getMarket(code);
  const channel = DATA.getChannel(code, Object.keys(market.channels)[0]);
  const freight = DATA.freight[DATA.defaults.freightMode];
  const input = Object.assign(
    {},
    DATA.defaults,
    {
      fxNGNperUSD: market.fx.local.value,
      certUSDOverride: market.clearances ? null : null,
      clearanceUSD: market.clearances.perShipmentUSD.value,
    },
    overrides || {},
  );
  return Calc.compute(input, {
    country: market,
    channel,
    freight,
    leadTime: DATA.defaults.leadTime,
  });
}

// 1. 三市场都能算且币种正确
["NG", "KE", "ZA"].forEach((code) => {
  const m = DATA.getMarket(code);
  const r = run(code);
  ok(code + " 落地成本 > 0", r.landed.unitNGN > 0, r.landed.unitNGN);
  ok(
    code + " 币种=" + m.currency,
    r.meta.currency === m.currency,
    r.meta.currency,
  );
  ok(
    code + " 符号=" + m.currencySymbol,
    r.meta.currencySymbol === m.currencySymbol,
    r.meta.currencySymbol,
  );
  ok(
    code + " 净利率在合理区间",
    r.unit.netMargin > -1 && r.unit.netMargin < 1,
    r.unit.netMargin,
  );
});

// 2. 肯尼亚 IDF/RDL/VAT16
{
  const m = DATA.getMarket("KE");
  const c = Calc.computeImport(1000, 0, m.import, 0.25, 0);
  ok("KE IDF = CIF×3.5%", near(c.idf, 35), c.idf);
  ok("KE RDL = CIF×2%", near(c.rdl, 20), c.rdl);
  ok("KE 无 CISS", near(c.ciss, 0), c.ciss);
  ok(
    "KE VAT = (CIF+关税+IDF+RDL)×16%",
    near(c.vat, (1000 + 250 + 35 + 20) * 0.16),
    c.vat,
  );
}

// 3. 南非 VAT15，无尼日利亚税费
{
  const m = DATA.getMarket("ZA");
  const c = Calc.computeImport(1000, 0, m.import, 0.2, 0);
  ok("ZA 无 IDF", near(c.idf, 0), c.idf);
  ok("ZA 无 RDL", near(c.rdl, 0), c.rdl);
  ok("ZA 无 CISS", near(c.ciss, 0), c.ciss);
  ok("ZA VAT = (CIF+关税)×15%", near(c.vat, (1000 + 200) * 0.15), c.vat);
}

// 4. 尼日利亚公式保持不变（回归）
{
  const m = DATA.getMarket("NG");
  const c = Calc.computeImport(1000, 0, m.import, 0.2, 0);
  ok("NG 关税 200", near(c.duty, 200), c.duty);
  ok("NG 附加费 14", near(c.surcharge, 14), c.surcharge);
  ok("NG CISS 10", near(c.ciss, 10), c.ciss);
  ok("NG ETLS 5", near(c.etls, 5), c.etls);
  ok("NG VAT 92.175", near(c.vat, 92.175), c.vat);
}

// 5. 成本结构按市场裁剪
{
  const keys = (code) =>
    run(code)
      .stack.filter((s) => s.usd > 0)
      .map((s) => s.key);
  const ng = keys("NG");
  const ke = keys("KE");
  const za = keys("ZA");
  ok("NG 结构含 CISS/ETLS", ng.includes("ciss") && ng.includes("etls"));
  ok(
    "KE 结构含 IDF/RDL 且无 CISS",
    ke.includes("idf") && ke.includes("rdl") && !ke.includes("ciss"),
  );
  ok(
    "ZA 结构无 IDF/RDL/CISS",
    !za.includes("idf") && !za.includes("rdl") && !za.includes("ciss"),
  );
}

// 6. 逻辑单调性
{
  const lo = run("NG", { targetPriceNGN: 12000 });
  const hi = run("NG", { targetPriceNGN: 20000 });
  ok("售价越高净利越高", hi.unit.netProfitNGN > lo.unit.netProfitNGN);
  const lowRet = run("NG", { returnRate: 0.05 });
  const highRet = run("NG", { returnRate: 0.3 });
  ok("退货率高成本高", highRet.unit.returnCostNGN > lowRet.unit.returnCostNGN);
  const base = run("NG", { fxNGNperUSD: 1500 });
  const deval = run("NG", { fxNGNperUSD: 1800 });
  ok("本币贬值落地价上涨", deval.landed.unitNGN > base.landed.unitNGN);
}

// 7. 认证按市场
{
  ok("NG 电子触发 SONCAP", run("NG").certSchemes.includes("SONCAP"));
  ok("KE 电子触发 KEBS", run("KE").certSchemes.includes("KEBS PVoC"));
  ok("ZA 电子触发 NRCS", run("ZA").certSchemes.includes("NRCS LOA"));
}

console.log(
  "\n" +
    (fail === 0 ? `ALL PASS (${pass})` : `FAILED: ${fail} / ${pass + fail}`),
);
process.exit(fail === 0 ? 0 : 1);

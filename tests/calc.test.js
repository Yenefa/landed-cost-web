/* 纯逻辑测试：node tests/calc.test.js */
const assert = require("assert");
const DATA = require("../src/data.js");
const Calc = require("../src/calc.js");

let pass = 0;
function ok(name, cond, extra) {
  if (!cond) {
    console.error("FAIL:", name, extra || "");
    process.exitCode = 1;
  } else {
    pass++;
    console.log("ok  -", name);
  }
}
function near(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

// 1) 尼日利亚进口税费公式
const imp = Calc.computeImport(1000, 0, DATA.countries.NG.import, 0.2, 0);
ok("CIF = 货值+运费+保险", near(imp.cif, 1000));
ok("关税 = CIF × 20%", near(imp.duty, 200));
ok("附加费 = 关税 × 7%", near(imp.surcharge, 14));
ok("CISS = FOB × 1%", near(imp.ciss, 10));
ok("ETLS = CIF × 0.5%", near(imp.etls, 5));
ok("VAT 基数 = CIF+关税+附加费+CISS+ETLS", near(imp.vatBase, 1229));
ok("VAT = 基数 × 7.5%", near(imp.vat, 92.175));
ok("税费合计", near(imp.total, 321.175));

// 2) 默认参数能算出一套自洽结果
const country = DATA.countries.NG;
const channel = DATA.channels.jumia;
const freight = DATA.freight[DATA.defaults.freightMode];
const res = Calc.compute(
  Object.assign({}, DATA.defaults, {
    targetPriceNGN: 0,
    fxNGNperUSD: country.fx.NGN_per_USD.value,
    fxCNYperUSD: country.fx.CNY_per_USD.value,
    certUSDOverride: 600,
    clearanceUSD: 450,
    insuranceRate: DATA.defaults.insuranceRate,
  }),
  { country, channel, freight, leadTime: DATA.defaults.leadTime },
);

ok("落地单价 > 0", res.landed.unitNGN > 0);
ok(
  "落地单价(NGN) ≈ USD × 汇率",
  near(res.landed.unitNGN, res.landed.unitUSD * res.inputs.ngnPerUsd, 1e-3),
);
ok(
  "成本堆叠之和 = 落地总成本",
  near(
    res.stack.reduce((s, x) => s + x.usd, 0),
    res.landed.totalUSD,
    1e-6,
  ),
);
ok(
  "整批 = 单件 × 数量",
  near(res.landed.batchTotalNGN, res.landed.unitNGN * res.inputs.qty, 1e-3),
);
ok("默认售价下每件有利润", res.unit.netProfitNGN > 0, res.unit.netProfitNGN);
ok("默认回本率 < 100%", res.batch.recoverRatio < 1, res.batch.recoverRatio);
ok(
  "敏感性为 3×3",
  res.sensitivity.length === 3 && res.sensitivity[0].cells.length === 3,
);

// 3) 售价越高，净利越高
const hi = Calc.compute(
  Object.assign({}, DATA.defaults, {
    targetPriceNGN: 20000,
    fxNGNperUSD: 1500,
    fxCNYperUSD: 7.1,
    certUSDOverride: 600,
    clearanceUSD: 450,
    insuranceRate: 0.003,
  }),
  { country, channel, freight, leadTime: DATA.defaults.leadTime },
);
const lo = Calc.compute(
  Object.assign({}, DATA.defaults, {
    targetPriceNGN: 12000,
    fxNGNperUSD: 1500,
    fxCNYperUSD: 7.1,
    certUSDOverride: 600,
    clearanceUSD: 450,
    insuranceRate: 0.003,
  }),
  { country, channel, freight, leadTime: DATA.defaults.leadTime },
);
ok("售价越高净利越高", hi.unit.netProfitNGN > lo.unit.netProfitNGN);

// 4) 退货率越高，退货成本越高
const r1 = Calc.compute(
  Object.assign({}, DATA.defaults, {
    returnRate: 0.05,
    targetPriceNGN: 0,
    fxNGNperUSD: 1500,
    fxCNYperUSD: 7.1,
    certUSDOverride: 600,
    clearanceUSD: 450,
    insuranceRate: 0.003,
  }),
  { country, channel, freight, leadTime: DATA.defaults.leadTime },
);
const r2 = Calc.compute(
  Object.assign({}, DATA.defaults, {
    returnRate: 0.3,
    targetPriceNGN: 0,
    fxNGNperUSD: 1500,
    fxCNYperUSD: 7.1,
    certUSDOverride: 600,
    clearanceUSD: 450,
    insuranceRate: 0.003,
  }),
  { country, channel, freight, leadTime: DATA.defaults.leadTime },
);
ok("退货率高 → 退货成本高", r2.unit.returnCostNGN > r1.unit.returnCostNGN);

// 5) 奈拉贬值 → 落地成本上涨
const dep = Calc.compute(
  Object.assign({}, DATA.defaults, {
    targetPriceNGN: 0,
    fxNGNperUSD: 1800,
    fxCNYperUSD: 7.1,
    certUSDOverride: 600,
    clearanceUSD: 450,
    insuranceRate: 0.003,
  }),
  { country, channel, freight, leadTime: DATA.defaults.leadTime },
);
ok("奈拉贬值 → 落地单价(₦)上涨", dep.landed.unitNGN > res.landed.unitNGN);

// 6) 需要认证的品类应识别出 SONCAP
const cert = Calc.certCost(country, ["electronics", "electronics"], true);
ok(
  "电子品类触发 SONCAP",
  cert.schemes.indexOf("SONCAP") !== -1,
  JSON.stringify(cert),
);
const cert2 = Calc.certCost(country, ["cosmetics", "cosmetics"], true);
ok(
  "美妆品类触发 SONCAP+NAFDAC",
  cert2.schemes.indexOf("NAFDAC") !== -1,
  JSON.stringify(cert2),
);

console.log("\n" + pass + " checks passed.");

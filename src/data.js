/**
 * 数据层：市场（国家 + 渠道）参数
 * 每个字段带 confidence，便于后续核对与更新。
 * 原则：默认值只是"可编辑的参考值"，页面上必须显示来源和更新日期。
 * v0.2：多市场（NG / KE / ZA），与 Android 版 Calc.Markets 口径一致。
 */
(function (root) {
  // 品类定义（三国共用同一套 key，税率各自覆盖）
  var DUTY_DEFS = {
    apparel: "服装鞋帽",
    electronics: "消费电子（手机/电脑/电视）",
    white_goods: "白色家电（冰箱/洗衣机/空调）",
    furniture: "家具家居",
    processed_food: "加工食品饮料",
    cosmetics: "美妆个护",
    auto_parts: "汽车配件",
    medical: "医疗用品",
    machinery: "工业机械",
    books: "图书教具",
    other: "其他（默认税率）",
  };

  var COMM_DEFS = {
    phones: "手机",
    electronics: "消费电子",
    computing: "电脑办公",
    fashion: "服饰鞋包",
    beauty: "美妆个护",
    home: "家居生活",
    baby: "母婴",
    groceries: "食品杂货",
    other: "其他（默认费率）",
  };

  function dutyTable(rates, fallback) {
    var out = {};
    Object.keys(DUTY_DEFS).forEach(function (k) {
      out[k] = {
        rate: rates[k] != null ? rates[k] : fallback,
        label: DUTY_DEFS[k],
        confidence: "high",
      };
    });
    return out;
  }

  function commTable(rates, fallback) {
    var out = {};
    Object.keys(COMM_DEFS).forEach(function (k) {
      out[k] = {
        rate: rates[k] != null ? rates[k] : fallback,
        label: COMM_DEFS[k],
      };
    });
    return out;
  }

  var DATA = {
    meta: {
      version: "0.2.0",
      updated: "2026-11",
      disclaimer:
        "本工具为估算器，不构成报价或法律/税务意见。税率、费率、汇率以官方与合同为准。",
    },

    markets: {
      NG: {
        code: "NG",
        flag: "🇳🇬",
        name: "尼日利亚",
        nameEn: "NIGERIA",
        platform: "Jumia",
        currency: "NGN",
        currencySymbol: "₦",
        capitalPort: "拉各斯 Apapa / Tin Can",
        fx: {
          local: {
            value: 1500,
            label: "NGN / USD",
            confidence: "med",
            note: "2026-11 参考区间，实际以清关日 NCS 汇率为准",
          },
          CNY_per_USD: {
            value: 7.1,
            confidence: "med",
            note: "人民币/美元参考",
          },
        },
        import: {
          dutyByCategory: dutyTable(
            {
              apparel: 0.2,
              electronics: 0.1,
              white_goods: 0.2,
              furniture: 0.2,
              processed_food: 0.2,
              cosmetics: 0.2,
              auto_parts: 0.1,
              medical: 0.05,
              machinery: 0.05,
              books: 0,
              other: 0.2,
            },
            0.2,
          ),
          surchargeOnDuty: {
            value: 0.07,
            label: "附加费（关税的 7%）",
            confidence: "high",
          },
          cissOnFob: {
            value: 0.01,
            label: "CISS 进口监督费（FOB 的 1%）",
            confidence: "high",
          },
          etlsOnCif: {
            value: 0.005,
            label: "ETLS 西共体税（CIF 的 0.5%）",
            confidence: "high",
          },
          idfOnCif: { value: 0, label: "—", confidence: "high" },
          rdlOnCif: { value: 0, label: "—", confidence: "high" },
          vatOnImport: {
            value: 0.075,
            label: "进口增值税（7.5%）",
            confidence: "high",
          },
        },
        certification: {
          rules: [
            {
              categories: [
                "electronics",
                "white_goods",
                "auto_parts",
                "machinery",
                "medical",
              ],
              scheme: "SONCAP",
              perShipmentUSD: 600,
              note: "产品证书 + 每批 SONCAP 证书",
            },
            {
              categories: ["cosmetics", "processed_food", "medical"],
              scheme: "NAFDAC",
              perSkuUSD: 1500,
              note: "按 SKU 注册，周期长",
            },
          ],
        },
        clearances: {
          perShipmentUSD: {
            value: 450,
            confidence: "med",
            note: "LCL 清关代理 + 港口杂费",
          },
        },
        channels: {
          jumia: {
            code: "jumia",
            name: "Jumia（海外仓 FBJ）",
            commissionByCategory: commTable(
              {
                phones: 0.05,
                electronics: 0.06,
                computing: 0.07,
                fashion: 0.18,
                beauty: 0.18,
                home: 0.15,
                baby: 0.15,
                groceries: 0.1,
                other: 0.12,
              },
              0.12,
            ),
            paymentProcessing: {
              value: 0.015,
              label: "回款/结汇手续费 1.5%",
              confidence: "med",
            },
            vatOnFees: {
              value: 0.075,
              label: "对佣金与物流费征 7.5% VAT",
              confidence: "high",
            },
            outboundPerItemLocal: {
              value: 350,
              label: "出库处理费（约 ₦350/件）",
              confidence: "low",
            },
            payoutDays: {
              value: 21,
              label: "回款周期（约 21 天）",
              confidence: "med",
            },
            sources: [
              {
                label: "Jumia 开店及运营费用列表（2026 版，佣金 5%–20%）",
                url: "https://vendor.jumia.com/shop-onboarding-and-related-operating-fees-in-chinese/",
              },
              {
                label: "Jumia 官方在线定价计算",
                url: "https://www.jumia-global.com.cn/static/JumiaPrice.html",
              },
            ],
          },
          standalone: {
            code: "standalone",
            name: "独立站 / 自营（广告驱动）",
            commissionByCategory: commTable({}, 0),
            paymentProcessing: {
              value: 0.032,
              label: "支付通道 3.2%",
              confidence: "med",
            },
            vatOnFees: { value: 0, label: "—", confidence: "med" },
            outboundPerItemLocal: {
              value: 900,
              label: "尾程派送（约 ₦900/件）",
              confidence: "low",
            },
            payoutDays: {
              value: 7,
              label: "回款周期（约 7 天）",
              confidence: "med",
            },
            sources: [
              {
                label: "行业经验值，需以实际支付通道与服务商报价覆盖",
                url: "",
              },
            ],
          },
        },
        sources: [
          {
            label:
              "Nigeria Import Duty Calculator 2026（Precebol，含附加费/CISS/ETLS/VAT 公式）",
            url: "https://www.precebollogistics.co.uk/nigeria-import-duty-calculator",
          },
        ],
        note: "尼日利亚：关税 + 7% 附加费 + CISS 1% + ETLS 0.5% + VAT 7.5%",
      },

      KE: {
        code: "KE",
        flag: "🇰🇪",
        name: "肯尼亚",
        nameEn: "KENYA",
        platform: "Jumia",
        currency: "KES",
        currencySymbol: "KSh",
        capitalPort: "蒙巴萨 Mombasa",
        fx: {
          local: {
            value: 129,
            label: "KES / USD",
            confidence: "med",
            note: "2026-11 参考区间",
          },
          CNY_per_USD: {
            value: 7.1,
            confidence: "med",
            note: "人民币/美元参考",
          },
        },
        import: {
          dutyByCategory: dutyTable(
            {
              apparel: 0.25,
              electronics: 0.25,
              white_goods: 0.25,
              furniture: 0.25,
              processed_food: 0.25,
              cosmetics: 0.25,
              auto_parts: 0.25,
              medical: 0,
              machinery: 0,
              books: 0,
              other: 0.25,
            },
            0.25,
          ),
          surchargeOnDuty: { value: 0, label: "—", confidence: "high" },
          cissOnFob: { value: 0, label: "—", confidence: "high" },
          etlsOnCif: { value: 0, label: "—", confidence: "high" },
          idfOnCif: {
            value: 0.035,
            label: "IDF 进口申报费（CIF 的 3.5%）",
            confidence: "high",
          },
          rdlOnCif: {
            value: 0.02,
            label: "RDL 铁路发展税（CIF 的 2%）",
            confidence: "high",
          },
          vatOnImport: {
            value: 0.16,
            label: "进口增值税（16%）",
            confidence: "high",
          },
        },
        certification: {
          rules: [
            {
              categories: [
                "electronics",
                "white_goods",
                "auto_parts",
                "machinery",
                "medical",
                "cosmetics",
                "processed_food",
              ],
              scheme: "KEBS PVoC",
              perShipmentUSD: 600,
              note: "出口前符合性认证，每批证书",
            },
          ],
        },
        clearances: {
          perShipmentUSD: {
            value: 500,
            confidence: "med",
            note: "蒙巴萨清关代理 + 港口杂费",
          },
        },
        channels: {
          jumia: {
            code: "jumia",
            name: "Jumia Kenya",
            commissionByCategory: commTable(
              {
                phones: 0.05,
                electronics: 0.06,
                computing: 0.07,
                fashion: 0.18,
                beauty: 0.18,
                home: 0.15,
                baby: 0.15,
                groceries: 0.1,
                other: 0.12,
              },
              0.12,
            ),
            paymentProcessing: {
              value: 0.02,
              label: "回款手续费 2%",
              confidence: "med",
            },
            vatOnFees: {
              value: 0.16,
              label: "对佣金与物流费征 16% VAT",
              confidence: "high",
            },
            outboundPerItemLocal: {
              value: 200,
              label: "出库处理费（约 KSh200/件）",
              confidence: "low",
            },
            payoutDays: {
              value: 14,
              label: "回款周期（约 14 天）",
              confidence: "med",
            },
            sources: [
              {
                label:
                  "Kenya Revenue Authority · Import Duty / VAT（CIF、IDF 3.5%、RDL 2%、VAT 16%）",
                url: "https://www.kra.go.ke/individual/individual-life-cycle/importation",
              },
              {
                label: "Jumia Kenya 卖家费用（佣金 5%–20%）",
                url: "https://sellercenter.jumia.com.ke/",
              },
              {
                label: "KEBS · PVoC 出口前符合性认证",
                url: "https://www.kebs.org/",
              },
            ],
          },
        },
        sources: [],
        note: "肯尼亚：关税 + IDF 3.5% + RDL 2% + VAT 16%（参考税率，实际以 KRA 税则为准）",
      },

      ZA: {
        code: "ZA",
        flag: "🇿🇦",
        name: "南非",
        nameEn: "SOUTH AFRICA",
        platform: "Takealot",
        currency: "ZAR",
        currencySymbol: "R",
        capitalPort: "德班 Durban / 开普敦",
        fx: {
          local: {
            value: 18.2,
            label: "ZAR / USD",
            confidence: "med",
            note: "2026-11 参考区间",
          },
          CNY_per_USD: {
            value: 7.1,
            confidence: "med",
            note: "人民币/美元参考",
          },
        },
        import: {
          dutyByCategory: dutyTable(
            {
              apparel: 0.45,
              electronics: 0.15,
              white_goods: 0.2,
              furniture: 0.2,
              processed_food: 0.2,
              cosmetics: 0.2,
              auto_parts: 0.2,
              medical: 0,
              machinery: 0,
              books: 0,
              other: 0.2,
            },
            0.2,
          ),
          surchargeOnDuty: { value: 0, label: "—", confidence: "high" },
          cissOnFob: { value: 0, label: "—", confidence: "high" },
          etlsOnCif: { value: 0, label: "—", confidence: "high" },
          idfOnCif: { value: 0, label: "—", confidence: "high" },
          rdlOnCif: { value: 0, label: "—", confidence: "high" },
          vatOnImport: {
            value: 0.15,
            label: "进口增值税（15%）",
            confidence: "high",
          },
        },
        certification: {
          rules: [
            {
              categories: [
                "electronics",
                "white_goods",
                "auto_parts",
                "medical",
                "machinery",
              ],
              scheme: "NRCS LOA",
              perShipmentUSD: 700,
              note: "NRCS Letter of Authority",
            },
          ],
        },
        clearances: {
          perShipmentUSD: {
            value: 550,
            confidence: "med",
            note: "德班/开普敦清关代理 + 港口杂费",
          },
        },
        channels: {
          takealot: {
            code: "takealot",
            name: "Takealot（平台仓）",
            commissionByCategory: commTable(
              {
                phones: 0.08,
                electronics: 0.08,
                computing: 0.08,
                fashion: 0.12,
                beauty: 0.12,
                home: 0.1,
                baby: 0.1,
                groceries: 0.08,
                other: 0.1,
              },
              0.1,
            ),
            paymentProcessing: {
              value: 0.025,
              label: "回款手续费 2.5%",
              confidence: "med",
            },
            vatOnFees: {
              value: 0.15,
              label: "对佣金与物流费征 15% VAT",
              confidence: "high",
            },
            outboundPerItemLocal: {
              value: 65,
              label: "出库处理费（约 R65/件）",
              confidence: "low",
            },
            payoutDays: {
              value: 15,
              label: "回款周期（约 15 天）",
              confidence: "med",
            },
            sources: [
              {
                label: "SARS · Customs & Excise / VAT 15%",
                url: "https://www.sars.gov.za/customs-and-excise/",
              },
              {
                label: "Takealot 卖家佣金与费用",
                url: "https://seller.takealot.com/",
              },
              {
                label: "NRCS · Letter of Authority（LOA）",
                url: "https://www.nrcs.org.za/",
              },
            ],
          },
        },
        sources: [],
        note: "南非：关税 + VAT 15%（参考税率，实际以 SARS 税则为准）",
      },
    },

    marketOrder: ["NG", "KE", "ZA"],

    freight: {
      sea_lcl: {
        code: "sea_lcl",
        name: "海运拼箱 LCL",
        unit: "USD/CBM",
        value: 130,
        transitDays: 38,
        confidence: "med",
        note: "中国→非洲主要港口，90–180 USD/CBM",
      },
      air: {
        code: "air",
        name: "空运",
        unit: "USD/kg",
        value: 7.5,
        transitDays: 9,
        confidence: "med",
        note: "中国→非洲，5.5–9.5 USD/kg",
      },
    },

    defaults: {
      unitCostCNY: 45,
      qty: 500,
      unitWeightKg: 0.6,
      unitVolumeCbm: 0.004,
      freightMode: "sea_lcl",
      dutyCategory: "electronics",
      commissionCategory: "electronics",
      desiredMargin: 0.2,
      returnRate: 0.12,
      adRate: 0.05,
      returnLossRate: 0.5,
      domesticFixedCNY: 800,
      insuranceRate: 0.003,
      leadTime: { productionDays: 15, clearanceDays: 10, sellThroughDays: 60 },
    },
  };

  // 便捷访问
  DATA.getMarket = function (code) {
    return DATA.markets[code] || DATA.markets.NG;
  };
  DATA.getChannel = function (code, channelCode) {
    var m = DATA.getMarket(code);
    return m.channels[channelCode] || m.channels[Object.keys(m.channels)[0]];
  };
  // 兼容 v0.1：旧代码读 country.fx.NGN_per_USD.value
  Object.keys(DATA.markets).forEach(function (code) {
    var fx = DATA.markets[code].fx;
    if (!fx.NGN_per_USD) fx.NGN_per_USD = fx.local;
  });
  // 兼容 v0.1 调用
  DATA.countries = DATA.markets;
  DATA.channels = DATA.markets.NG.channels;

  root.APP_DATA = DATA;
  if (typeof module !== "undefined" && module.exports) module.exports = DATA;
})(typeof window !== "undefined" ? window : globalThis);

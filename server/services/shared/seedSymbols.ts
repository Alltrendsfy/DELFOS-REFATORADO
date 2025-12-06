import { storage } from "../../storage";
import type { InsertSymbol } from "@shared/schema";

// Realistic cryptocurrency trading pairs with tiered spreads
// Tier 1 (0.1-0.4%): Major liquid pairs (BTC, ETH, stablecoins)
// Tier 2 (0.4-1.2%): Mid-cap altcoins with good liquidity
// Tier 3 (1.2-3.5%): Smaller coins with moderate trading volume

const testSymbols: Omit<InsertSymbol, "id" | "updated_at">[] = [
  // Tier 1: Major pairs (15 symbols, spreads 0.08-0.4%)
  { exchange_id: "kraken", symbol: "BTC/USD", exchange_symbol: "XBTUSD", volume_24h_usd: "85000000", spread_mid_pct: "0.001", depth_top10_usd: "45000000", atr_daily_pct: "3.2" },
  { exchange_id: "kraken", symbol: "ETH/USD", exchange_symbol: "ETHUSD", volume_24h_usd: "42000000", spread_mid_pct: "0.0012", depth_top10_usd: "28000000", atr_daily_pct: "4.1" },
  { exchange_id: "kraken", symbol: "USDT/USD", exchange_symbol: "USDTUSD", volume_24h_usd: "62000000", spread_mid_pct: "0.0008", depth_top10_usd: "55000000", atr_daily_pct: "0.15" },
  { exchange_id: "kraken", symbol: "DAI/USD", exchange_symbol: "DAIUSD", volume_24h_usd: "8500000", spread_mid_pct: "0.001", depth_top10_usd: "7200000", atr_daily_pct: "0.18" },
  { exchange_id: "kraken", symbol: "XRP/USD", exchange_symbol: "XRPUSD", volume_24h_usd: "18000000", spread_mid_pct: "0.0015", depth_top10_usd: "9800000", atr_daily_pct: "4.3" },
  { exchange_id: "kraken", symbol: "SOL/USD", exchange_symbol: "SOLUSD", volume_24h_usd: "15000000", spread_mid_pct: "0.0018", depth_top10_usd: "8500000", atr_daily_pct: "5.8" },
  { exchange_id: "kraken", symbol: "ADA/USD", exchange_symbol: "ADAUSD", volume_24h_usd: "12000000", spread_mid_pct: "0.002", depth_top10_usd: "6200000", atr_daily_pct: "4.7" },
  { exchange_id: "kraken", symbol: "PEPE/USD", exchange_symbol: "PEPEUSD", volume_24h_usd: "12500000", spread_mid_pct: "0.0025", depth_top10_usd: "6540000", atr_daily_pct: "11.2" },
  { exchange_id: "kraken", symbol: "ARB/USD", exchange_symbol: "ARBUSD", volume_24h_usd: "9200000", spread_mid_pct: "0.003", depth_top10_usd: "4820000", atr_daily_pct: "5.9" },
  { exchange_id: "kraken", symbol: "SUI/USD", exchange_symbol: "SUIUSD", volume_24h_usd: "8900000", spread_mid_pct: "0.0032", depth_top10_usd: "4650000", atr_daily_pct: "7.8" },
  { exchange_id: "kraken", symbol: "TRX/USD", exchange_symbol: "TRXUSD", volume_24h_usd: "8200000", spread_mid_pct: "0.0035", depth_top10_usd: "4300000", atr_daily_pct: "4.6" },
  { exchange_id: "kraken", symbol: "WIF/USD", exchange_symbol: "WIFUSD", volume_24h_usd: "7800000", spread_mid_pct: "0.0038", depth_top10_usd: "4080000", atr_daily_pct: "12.5" },
  { exchange_id: "kraken", symbol: "APT/USD", exchange_symbol: "APTUSD", volume_24h_usd: "7500000", spread_mid_pct: "0.004", depth_top10_usd: "3920000", atr_daily_pct: "6.1" },
  { exchange_id: "kraken", symbol: "LTC/USD", exchange_symbol: "LTCUSD", volume_24h_usd: "7200000", spread_mid_pct: "0.0035", depth_top10_usd: "3800000", atr_daily_pct: "3.8" },
  { exchange_id: "kraken", symbol: "OP/USD", exchange_symbol: "OPUSD", volume_24h_usd: "6800000", spread_mid_pct: "0.0038", depth_top10_usd: "3560000", atr_daily_pct: "6.3" },

  // Tier 2: Mid-cap coins (45 symbols, spreads 0.4-1.2%)
  { exchange_id: "kraken", symbol: "BONK/USD", exchange_symbol: "BONKUSD", volume_24h_usd: "6300000", spread_mid_pct: "0.004", depth_top10_usd: "3300000", atr_daily_pct: "13.8" },
  { exchange_id: "kraken", symbol: "INJ/USD", exchange_symbol: "INJUSD", volume_24h_usd: "6100000", spread_mid_pct: "0.0045", depth_top10_usd: "3190000", atr_daily_pct: "8.1" },
  { exchange_id: "kraken", symbol: "NEAR/USD", exchange_symbol: "NEARUSD", volume_24h_usd: "5800000", spread_mid_pct: "0.005", depth_top10_usd: "3030000", atr_daily_pct: "6.8" },
  { exchange_id: "kraken", symbol: "RNDR/USD", exchange_symbol: "RNDRUSD", volume_24h_usd: "5670000", spread_mid_pct: "0.0055", depth_top10_usd: "2960000", atr_daily_pct: "7.6" },
  { exchange_id: "kraken", symbol: "BCH/USD", exchange_symbol: "BCHUSD", volume_24h_usd: "5500000", spread_mid_pct: "0.006", depth_top10_usd: "2900000", atr_daily_pct: "4.2" },
  { exchange_id: "kraken", symbol: "TIA/USD", exchange_symbol: "TIAUSD", volume_24h_usd: "5400000", spread_mid_pct: "0.0062", depth_top10_usd: "2820000", atr_daily_pct: "9.5" },
  { exchange_id: "kraken", symbol: "APE/USD", exchange_symbol: "APEUSD", volume_24h_usd: "5300000", spread_mid_pct: "0.0065", depth_top10_usd: "2770000", atr_daily_pct: "8.6" },
  { exchange_id: "kraken", symbol: "HBAR/USD", exchange_symbol: "HBARUSD", volume_24h_usd: "5200000", spread_mid_pct: "0.007", depth_top10_usd: "2720000", atr_daily_pct: "5.9" },
  { exchange_id: "kraken", symbol: "SAND/USD", exchange_symbol: "SANDUSD", volume_24h_usd: "5100000", spread_mid_pct: "0.0072", depth_top10_usd: "2680000", atr_daily_pct: "7.9" },
  { exchange_id: "kraken", symbol: "FLOKI/USD", exchange_symbol: "FLOKIUSD", volume_24h_usd: "5100000", spread_mid_pct: "0.0075", depth_top10_usd: "2670000", atr_daily_pct: "10.9" },
  { exchange_id: "kraken", symbol: "LDO/USD", exchange_symbol: "LDOUSD", volume_24h_usd: "4950000", spread_mid_pct: "0.0078", depth_top10_usd: "2590000", atr_daily_pct: "6.7" },
  { exchange_id: "kraken", symbol: "BLUR/USD", exchange_symbol: "BLURUSD", volume_24h_usd: "4680000", spread_mid_pct: "0.008", depth_top10_usd: "2450000", atr_daily_pct: "9.2" },
  { exchange_id: "kraken", symbol: "ALGO/USD", exchange_symbol: "ALGOUSD", volume_24h_usd: "4500000", spread_mid_pct: "0.0082", depth_top10_usd: "2400000", atr_daily_pct: "5.7" },
  { exchange_id: "kraken", symbol: "GRT/USD", exchange_symbol: "GRTUSD", volume_24h_usd: "4470000", spread_mid_pct: "0.0085", depth_top10_usd: "2340000", atr_daily_pct: "6.2" },
  { exchange_id: "kraken", symbol: "STX/USD", exchange_symbol: "STXUSD", volume_24h_usd: "4320000", spread_mid_pct: "0.0088", depth_top10_usd: "2260000", atr_daily_pct: "6.4" },
  { exchange_id: "kraken", symbol: "MANA/USD", exchange_symbol: "MANAUSD", volume_24h_usd: "4200000", spread_mid_pct: "0.009", depth_top10_usd: "2200000", atr_daily_pct: "7.3" },
  { exchange_id: "kraken", symbol: "AXS/USD", exchange_symbol: "AXSUSD", volume_24h_usd: "4150000", spread_mid_pct: "0.0092", depth_top10_usd: "2170000", atr_daily_pct: "8.3" },
  { exchange_id: "kraken", symbol: "XMR/USD", exchange_symbol: "XMRUSD", volume_24h_usd: "4100000", spread_mid_pct: "0.0095", depth_top10_usd: "2140000", atr_daily_pct: "4.2" },
  { exchange_id: "kraken", symbol: "FIL/USD", exchange_symbol: "FILUSD", volume_24h_usd: "4100000", spread_mid_pct: "0.0098", depth_top10_usd: "2100000", atr_daily_pct: "6.4" },
  { exchange_id: "kraken", symbol: "FET/USD", exchange_symbol: "FETUSD", volume_24h_usd: "3980000", spread_mid_pct: "0.01", depth_top10_usd: "2080000", atr_daily_pct: "6.9" },
  { exchange_id: "kraken", symbol: "GALA/USD", exchange_symbol: "GALAUSD", volume_24h_usd: "3890000", spread_mid_pct: "0.0102", depth_top10_usd: "2030000", atr_daily_pct: "7.9" },
  { exchange_id: "kraken", symbol: "VET/USD", exchange_symbol: "VETUSD", volume_24h_usd: "3840000", spread_mid_pct: "0.0105", depth_top10_usd: "2010000", atr_daily_pct: "5.3" },
  { exchange_id: "kraken", symbol: "AAVE/USD", exchange_symbol: "AAVEUSD", volume_24h_usd: "3800000", spread_mid_pct: "0.0108", depth_top10_usd: "1950000", atr_daily_pct: "5.3" },
  { exchange_id: "kraken", symbol: "DYDX/USD", exchange_symbol: "DYDXUSD", volume_24h_usd: "3720000", spread_mid_pct: "0.011", depth_top10_usd: "1940000", atr_daily_pct: "7.4" },
  { exchange_id: "kraken", symbol: "ICP/USD", exchange_symbol: "ICPUSD", volume_24h_usd: "3610000", spread_mid_pct: "0.0112", depth_top10_usd: "1890000", atr_daily_pct: "6.7" },
  { exchange_id: "kraken", symbol: "CRV/USD", exchange_symbol: "CRVUSD", volume_24h_usd: "3600000", spread_mid_pct: "0.0115", depth_top10_usd: "1880000", atr_daily_pct: "6.4" },
  { exchange_id: "kraken", symbol: "XTZ/USD", exchange_symbol: "XTZUSD", volume_24h_usd: "3500000", spread_mid_pct: "0.0118", depth_top10_usd: "1800000", atr_daily_pct: "5.0" },
  { exchange_id: "kraken", symbol: "AGIX/USD", exchange_symbol: "AGIXUSD", volume_24h_usd: "3450000", spread_mid_pct: "0.012", depth_top10_usd: "1800000", atr_daily_pct: "7.5" },
  { exchange_id: "kraken", symbol: "IMX/USD", exchange_symbol: "IMXUSD", volume_24h_usd: "3420000", spread_mid_pct: "0.012", depth_top10_usd: "1790000", atr_daily_pct: "7.1" },
  { exchange_id: "kraken", symbol: "ENJ/USD", exchange_symbol: "ENJUSD", volume_24h_usd: "3200000", spread_mid_pct: "0.012", depth_top10_usd: "1670000", atr_daily_pct: "6.2" },
  { exchange_id: "kraken", symbol: "EOS/USD", exchange_symbol: "EOSUSD", volume_24h_usd: "3200000", spread_mid_pct: "0.012", depth_top10_usd: "1700000", atr_daily_pct: "5.1" },
  { exchange_id: "kraken", symbol: "CHZ/USD", exchange_symbol: "CHZUSD", volume_24h_usd: "3160000", spread_mid_pct: "0.012", depth_top10_usd: "1650000", atr_daily_pct: "7.2" },
  { exchange_id: "kraken", symbol: "ETC/USD", exchange_symbol: "ETCUSD", volume_24h_usd: "3100000", spread_mid_pct: "0.012", depth_top10_usd: "1600000", atr_daily_pct: "4.5" },
  { exchange_id: "kraken", symbol: "RUNE/USD", exchange_symbol: "RUNEUSD", volume_24h_usd: "3050000", spread_mid_pct: "0.012", depth_top10_usd: "1590000", atr_daily_pct: "6.6" },
  { exchange_id: "kraken", symbol: "OCEAN/USD", exchange_symbol: "OCEANUSD", volume_24h_usd: "2950000", spread_mid_pct: "0.012", depth_top10_usd: "1540000", atr_daily_pct: "6.9" },
  { exchange_id: "kraken", symbol: "LRC/USD", exchange_symbol: "LRCUSD", volume_24h_usd: "2920000", spread_mid_pct: "0.012", depth_top10_usd: "1520000", atr_daily_pct: "6.5" },
  { exchange_id: "kraken", symbol: "MKR/USD", exchange_symbol: "MKRUSD", volume_24h_usd: "2900000", spread_mid_pct: "0.012", depth_top10_usd: "1500000", atr_daily_pct: "6.2" },
  { exchange_id: "kraken", symbol: "PAXG/USD", exchange_symbol: "PAXGUSD", volume_24h_usd: "2800000", spread_mid_pct: "0.012", depth_top10_usd: "1450000", atr_daily_pct: "1.8" },
  { exchange_id: "kraken", symbol: "1INCH/USD", exchange_symbol: "1INCHUSD", volume_24h_usd: "2750000", spread_mid_pct: "0.012", depth_top10_usd: "1420000", atr_daily_pct: "7.1" },
  { exchange_id: "kraken", symbol: "THETA/USD", exchange_symbol: "THETAUSD", volume_24h_usd: "2710000", spread_mid_pct: "0.012", depth_top10_usd: "1410000", atr_daily_pct: "5.8" },
  { exchange_id: "kraken", symbol: "SUSHI/USD", exchange_symbol: "SUSHIUSD", volume_24h_usd: "2640000", spread_mid_pct: "0.012", depth_top10_usd: "1380000", atr_daily_pct: "7.0" },
  { exchange_id: "kraken", symbol: "SNX/USD", exchange_symbol: "SNXUSD", volume_24h_usd: "2600000", spread_mid_pct: "0.012", depth_top10_usd: "1350000", atr_daily_pct: "7.1" },
  { exchange_id: "kraken", symbol: "FLOW/USD", exchange_symbol: "FLOWUSD", volume_24h_usd: "2580000", spread_mid_pct: "0.012", depth_top10_usd: "1340000", atr_daily_pct: "6.4" },
  { exchange_id: "kraken", symbol: "QNT/USD", exchange_symbol: "QNTUSD", volume_24h_usd: "2520000", spread_mid_pct: "0.012", depth_top10_usd: "1310000", atr_daily_pct: "5.8" },
  { exchange_id: "kraken", symbol: "ROSE/USD", exchange_symbol: "ROSEUSD", volume_24h_usd: "2450000", spread_mid_pct: "0.012", depth_top10_usd: "1280000", atr_daily_pct: "6.9" },
  { exchange_id: "kraken", symbol: "ZEC/USD", exchange_symbol: "ZECUSD", volume_24h_usd: "2400000", spread_mid_pct: "0.012", depth_top10_usd: "1250000", atr_daily_pct: "5.6" },
  { exchange_id: "kraken", symbol: "GMT/USD", exchange_symbol: "GMTUSD", volume_24h_usd: "2380000", spread_mid_pct: "0.012", depth_top10_usd: "1240000", atr_daily_pct: "7.7" },
  { exchange_id: "kraken", symbol: "KSM/USD", exchange_symbol: "KSMUSD", volume_24h_usd: "2350000", spread_mid_pct: "0.012", depth_top10_usd: "1220000", atr_daily_pct: "6.8" },
  { exchange_id: "kraken", symbol: "ONE/USD", exchange_symbol: "ONEUSD", volume_24h_usd: "2230000", spread_mid_pct: "0.012", depth_top10_usd: "1160000", atr_daily_pct: "6.8" },
  { exchange_id: "kraken", symbol: "COMP/USD", exchange_symbol: "COMPUSD", volume_24h_usd: "2200000", spread_mid_pct: "0.012", depth_top10_usd: "1150000", atr_daily_pct: "6.8" },
  { exchange_id: "kraken", symbol: "ANKR/USD", exchange_symbol: "ANKRUSD", volume_24h_usd: "2180000", spread_mid_pct: "0.012", depth_top10_usd: "1140000", atr_daily_pct: "6.5" },
  { exchange_id: "kraken", symbol: "BAT/USD", exchange_symbol: "BATUSD", volume_24h_usd: "2100000", spread_mid_pct: "0.012", depth_top10_usd: "1100000", atr_daily_pct: "5.4" },
  { exchange_id: "kraken", symbol: "CELO/USD", exchange_symbol: "CELOUSD", volume_24h_usd: "1990000", spread_mid_pct: "0.012", depth_top10_usd: "1040000", atr_daily_pct: "5.5" },
  { exchange_id: "kraken", symbol: "DASH/USD", exchange_symbol: "DASHUSD", volume_24h_usd: "1950000", spread_mid_pct: "0.012", depth_top10_usd: "1020000", atr_daily_pct: "5.9" },
  { exchange_id: "kraken", symbol: "STORJ/USD", exchange_symbol: "STORJUSD", volume_24h_usd: "1950000", spread_mid_pct: "0.012", depth_top10_usd: "1020000", atr_daily_pct: "6.3" },
  { exchange_id: "kraken", symbol: "KAVA/USD", exchange_symbol: "KAVAUSD", volume_24h_usd: "1920000", spread_mid_pct: "0.012", depth_top10_usd: "1000000", atr_daily_pct: "5.7" },

  // Tier 3: Smaller coins (57 symbols, spreads 1.2-3.5%)
  { exchange_id: "kraken", symbol: "YFI/USD", exchange_symbol: "YFIUSD", volume_24h_usd: "1850000", spread_mid_pct: "0.013", depth_top10_usd: "960000", atr_daily_pct: "5.8" },
  { exchange_id: "kraken", symbol: "MASK/USD", exchange_symbol: "MASKUSD", volume_24h_usd: "1870000", spread_mid_pct: "0.014", depth_top10_usd: "980000", atr_daily_pct: "7.3" },
  { exchange_id: "kraken", symbol: "WAVES/USD", exchange_symbol: "WAVESUSD", volume_24h_usd: "1800000", spread_mid_pct: "0.015", depth_top10_usd: "950000", atr_daily_pct: "6.3" },
  { exchange_id: "kraken", symbol: "IOTX/USD", exchange_symbol: "IOTXUSD", volume_24h_usd: "1780000", spread_mid_pct: "0.016", depth_top10_usd: "930000", atr_daily_pct: "6.7" },
  { exchange_id: "kraken", symbol: "OXT/USD", exchange_symbol: "OXTUSD", volume_24h_usd: "1680000", spread_mid_pct: "0.017", depth_top10_usd: "880000", atr_daily_pct: "7.0" },
  { exchange_id: "kraken", symbol: "ICX/USD", exchange_symbol: "ICXUSD", volume_24h_usd: "1650000", spread_mid_pct: "0.018", depth_top10_usd: "860000", atr_daily_pct: "6.7" },
  { exchange_id: "kraken", symbol: "QTUM/USD", exchange_symbol: "QTUMUSD", volume_24h_usd: "1620000", spread_mid_pct: "0.019", depth_top10_usd: "850000", atr_daily_pct: "6.1" },
  { exchange_id: "kraken", symbol: "BAL/USD", exchange_symbol: "BALUSD", volume_24h_usd: "1480000", spread_mid_pct: "0.020", depth_top10_usd: "770000", atr_daily_pct: "6.6" },
  { exchange_id: "kraken", symbol: "PERP/USD", exchange_symbol: "PERPUSD", volume_24h_usd: "1450000", spread_mid_pct: "0.021", depth_top10_usd: "760000", atr_daily_pct: "7.2" },
  { exchange_id: "kraken", symbol: "SC/USD", exchange_symbol: "SCUSD", volume_24h_usd: "1420000", spread_mid_pct: "0.022", depth_top10_usd: "740000", atr_daily_pct: "7.2" },
  { exchange_id: "kraken", symbol: "OMG/USD", exchange_symbol: "OMGUSD", volume_24h_usd: "1380000", spread_mid_pct: "0.023", depth_top10_usd: "720000", atr_daily_pct: "6.5" },
  { exchange_id: "kraken", symbol: "KEEP/USD", exchange_symbol: "KEEPUSD", volume_24h_usd: "1360000", spread_mid_pct: "0.024", depth_top10_usd: "710000", atr_daily_pct: "7.8" },
  { exchange_id: "kraken", symbol: "GNO/USD", exchange_symbol: "GNOUSD", volume_24h_usd: "1280000", spread_mid_pct: "0.025", depth_top10_usd: "660000", atr_daily_pct: "6.9" },
  { exchange_id: "kraken", symbol: "ANT/USD", exchange_symbol: "ANTUSD", volume_24h_usd: "1220000", spread_mid_pct: "0.026", depth_top10_usd: "630000", atr_daily_pct: "7.4" },
  { exchange_id: "kraken", symbol: "LSK/USD", exchange_symbol: "LSKUSD", volume_24h_usd: "1150000", spread_mid_pct: "0.027", depth_top10_usd: "590000", atr_daily_pct: "7.5" },
  { exchange_id: "kraken", symbol: "SRM/USD", exchange_symbol: "SRMUSD", volume_24h_usd: "1120000", spread_mid_pct: "0.028", depth_top10_usd: "580000", atr_daily_pct: "7.6" },
  { exchange_id: "kraken", symbol: "MLN/USD", exchange_symbol: "MLNUSD", volume_24h_usd: "980000", spread_mid_pct: "0.029", depth_top10_usd: "510000", atr_daily_pct: "7.8" },
  { exchange_id: "kraken", symbol: "RARI/USD", exchange_symbol: "RARIUSD", volume_24h_usd: "850000", spread_mid_pct: "0.030", depth_top10_usd: "440000", atr_daily_pct: "8.2" },
  { exchange_id: "kraken", symbol: "MATIC/USD", exchange_symbol: "MATICUSD", volume_24h_usd: "11500000", spread_mid_pct: "0.0018", depth_top10_usd: "5800000", atr_daily_pct: "6.1" },
  { exchange_id: "kraken", symbol: "AVAX/USD", exchange_symbol: "AVAXUSD", volume_24h_usd: "10200000", spread_mid_pct: "0.0022", depth_top10_usd: "5400000", atr_daily_pct: "6.8" },
  { exchange_id: "kraken", symbol: "DOT/USD", exchange_symbol: "DOTUSD", volume_24h_usd: "9800000", spread_mid_pct: "0.0025", depth_top10_usd: "5100000", atr_daily_pct: "5.2" },
  { exchange_id: "kraken", symbol: "LINK/USD", exchange_symbol: "LINKUSD", volume_24h_usd: "8900000", spread_mid_pct: "0.0028", depth_top10_usd: "4700000", atr_daily_pct: "5.5" },
  { exchange_id: "kraken", symbol: "UNI/USD", exchange_symbol: "UNIUSD", volume_24h_usd: "7600000", spread_mid_pct: "0.003", depth_top10_usd: "3900000", atr_daily_pct: "5.9" },
  { exchange_id: "kraken", symbol: "ATOM/USD", exchange_symbol: "ATOMUSD", volume_24h_usd: "6800000", spread_mid_pct: "0.0035", depth_top10_usd: "3500000", atr_daily_pct: "5.4" },
  { exchange_id: "kraken", symbol: "FTM/USD", exchange_symbol: "FTMUSD", volume_24h_usd: "6200000", spread_mid_pct: "0.004", depth_top10_usd: "3240000", atr_daily_pct: "7.5" },
  { exchange_id: "kraken", symbol: "XLM/USD", exchange_symbol: "XLMUSD", volume_24h_usd: "5900000", spread_mid_pct: "0.0045", depth_top10_usd: "3100000", atr_daily_pct: "4.9" },
];

export async function seedSymbols() {
  console.log("🌱 Seeding symbols...");
  
  let created = 0;
  let skipped = 0;
  
  for (const symbol of testSymbols) {
    try {
      const allSymbols = await storage.getAllSymbols();
      const existing = allSymbols.find(s => 
        s.exchange_id === symbol.exchange_id && s.symbol === symbol.symbol
      );
      
      if (!existing) {
        await storage.createSymbol(symbol);
        created++;
        if (created % 20 === 0) {
          console.log(`   Created ${created} symbols...`);
        }
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`❌ Failed to seed symbol ${symbol.symbol}:`, error);
    }
  }
  
  console.log(`✅ Symbol seeding complete: ${created} created, ${skipped} skipped`);
}

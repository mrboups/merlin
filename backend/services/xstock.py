"""
xStock Token Registry and Fuzzy Matching Service.

Maintains a canonical registry of all xStock tokens (tokenized tracker
certificates on Ethereum via Backed Finance / xStocks.fi) and provides
fuzzy resolution from user input (company names, ticker symbols, partial
matches) to the exact xStock token.

Ticker conventions:
  - xStocks.fi uses "TICKERx" format (e.g. TSLAx, AAPLx)
  - Merlin internally uses "xTICKER" format (e.g. xTSLA, xAAPL)
  Both are stored so the system can interact with either convention.
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Optional

# ---------------------------------------------------------------------------
# Token Registry
# ---------------------------------------------------------------------------
# Contract addresses are placeholders — replace with verified addresses from
# xstocks.fi or Etherscan before production launch.
# The "xstocks_ticker" field is the on-chain ticker (e.g. TSLAx).
# The "symbol" field is Merlin's internal format (e.g. xTSLA).
# ---------------------------------------------------------------------------

_PLACEHOLDER = "0x" + "0" * 40  # 0x0000000000000000000000000000000000000000

XSTOCK_REGISTRY: list[dict] = [
    # ── V1 Priority Stocks ────────────────────────────────────────────────
    {"symbol": "xTSLA", "xstocks_ticker": "TSLAx", "name": "Tesla", "ticker": "TSLA", "type": "stock", "address": "0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0"},
    {"symbol": "xAAPL", "xstocks_ticker": "AAPLx", "name": "Apple", "ticker": "AAPL", "type": "stock", "address": "0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a"},
    {"symbol": "xGOOG", "xstocks_ticker": "GOOGLx", "name": "Alphabet", "ticker": "GOOGL", "type": "stock", "address": "0xe92f673ca36c5e2efd2de7628f815f84807e803f"},
    {"symbol": "xAMZN", "xstocks_ticker": "AMZNx", "name": "Amazon", "ticker": "AMZN", "type": "stock", "address": "0x3557ba345b01efa20a1bddc61f573bfd87195081"},
    {"symbol": "xMSFT", "xstocks_ticker": "MSFTx", "name": "Microsoft", "ticker": "MSFT", "type": "stock", "address": "0x5621737f42dae558b81269fcb9e9e70c19aa6b35"},

    # ── Extended Stocks ───────────────────────────────────────────────────
    {"symbol": "xNVDA", "xstocks_ticker": "NVDAx", "name": "NVIDIA", "ticker": "NVDA", "type": "stock", "address": "0xc845b2894dbddd03858fd2d643b4ef725fe0849d"},
    {"symbol": "xMETA", "xstocks_ticker": "METAx", "name": "Meta Platforms", "ticker": "META", "type": "stock", "address": "0x96702be57cd9777f835117a809c7124fe4ec989a"},
    {"symbol": "xNFLX", "xstocks_ticker": "NFLXx", "name": "Netflix", "ticker": "NFLX", "type": "stock", "address": "0xa6a65ac27e76cd53cb790473e4345c46e5ebf961"},
    {"symbol": "xCOIN", "xstocks_ticker": "COINx", "name": "Coinbase", "ticker": "COIN", "type": "stock", "address": "0x364f210f430ec2448fc68a49203040f6124096f0"},
    {"symbol": "xPLTR", "xstocks_ticker": "PLTRx", "name": "Palantir", "ticker": "PLTR", "type": "stock", "address": "0x6d482cec5f9dd1f05ccee9fd3ff79b246170f8e2"},
    {"symbol": "xGME", "xstocks_ticker": "GMEx", "name": "GameStop", "ticker": "GME", "type": "stock", "address": "0xe5f6d3b2405abdfe6f660e63202b25d23763160d"},
    {"symbol": "xAMD", "xstocks_ticker": "AMDx", "name": "AMD", "ticker": "AMD", "type": "stock", "address": "0x3522513e5f146a2006e2901b05f16b2821485e19"},
    {"symbol": "xORCL", "xstocks_ticker": "ORCLx", "name": "Oracle", "ticker": "ORCL", "type": "stock", "address": "0x548308e91ec9f285c7bff05295badbd56a6e4971"},
    {"symbol": "xCRM", "xstocks_ticker": "CRMx", "name": "Salesforce", "ticker": "CRM", "type": "stock", "address": "0x4a4073f2eaf299a1be22254dcd2c41727f6f54a2"},
    {"symbol": "xAVGO", "xstocks_ticker": "AVGOx", "name": "Broadcom", "ticker": "AVGO", "type": "stock", "address": "0x38bac69cbbd28156796e4163b2b6dcb81e336565"},
    {"symbol": "xINTC", "xstocks_ticker": "INTCx", "name": "Intel", "ticker": "INTC", "type": "stock", "address": "0xf8a80d1cb9cfd70d03d655d9df42339846f3b3c8"},
    {"symbol": "xJPM", "xstocks_ticker": "JPMx", "name": "JPMorgan Chase", "ticker": "JPM", "type": "stock", "address": "0xd9fc3e075d45254a1d834fea18af8041207dea0a"},
    {"symbol": "xV", "xstocks_ticker": "Vx", "name": "Visa", "ticker": "V", "type": "stock", "address": "0x2363fd1235c1b6d3a5088ddf8df3a0b3a30c5293"},
    {"symbol": "xMA", "xstocks_ticker": "MAx", "name": "Mastercard", "ticker": "MA", "type": "stock", "address": "0xb365cd2588065f522d379ad19e903304f6b622c6"},
    {"symbol": "xBAC", "xstocks_ticker": "BACx", "name": "Bank of America", "ticker": "BAC", "type": "stock", "address": "0x314938c596f5ce31c3f75307d2979338c346d7f2"},
    {"symbol": "xGS", "xstocks_ticker": "GSx", "name": "Goldman Sachs", "ticker": "GS", "type": "stock", "address": "0x3ee7e9b3a992fd23cd1c363b0e296856b04ab149"},
    {"symbol": "xMSTR", "xstocks_ticker": "MSTRx", "name": "MicroStrategy", "ticker": "MSTR", "type": "stock", "address": "0xae2f842ef90c0d5213259ab82639d5bbf649b08e"},
    {"symbol": "xHOOD", "xstocks_ticker": "HOODx", "name": "Robinhood", "ticker": "HOOD", "type": "stock", "address": "0xe1385fdd5ffb10081cd52c56584f25efa9084015"},
    {"symbol": "xLLY", "xstocks_ticker": "LLYx", "name": "Eli Lilly", "ticker": "LLY", "type": "stock", "address": "0x19c41ea77b34bbdee61c3a87a75d1abda2ed0be4"},
    {"symbol": "xADBE", "xstocks_ticker": "ADBEx", "name": "Adobe", "ticker": "ADBE", "type": "stock", "address": "0x16e0b579be45baae54ceddd52e742b6457a7fe12"},
    {"symbol": "xCRWD", "xstocks_ticker": "CRWDx", "name": "CrowdStrike", "ticker": "CRWD", "type": "stock", "address": "0x214151022c2a5e380ab80cdac31f23ae554a7345"},
    {"symbol": "xPANW", "xstocks_ticker": "PANWx", "name": "Palo Alto Networks", "ticker": "PANW", "type": "stock", "address": "0xe12bb32d77be4db10ddc82088b230d35d097e9c5"},
    {"symbol": "xTSM", "xstocks_ticker": "TSMx", "name": "TSMC", "ticker": "TSM", "type": "stock", "address": "0x9e3bf4ecfc44eedd624f26656b6736a3f093b073"},
    {"symbol": "xKO", "xstocks_ticker": "KOx", "name": "Coca-Cola", "ticker": "KO", "type": "stock", "address": "0xdcc1a2699441079da889b1f49e12b69cc791129b"},
    {"symbol": "xPEP", "xstocks_ticker": "PEPx", "name": "PepsiCo", "ticker": "PEP", "type": "stock", "address": "0x36c424a6ec0e264b1616102ad63ed2ad7857413e"},
    {"symbol": "xWMT", "xstocks_ticker": "WMTx", "name": "Walmart", "ticker": "WMT", "type": "stock", "address": "0x7aefc9965699fbea943e03264d96e50cd4a97b21"},
    {"symbol": "xHD", "xstocks_ticker": "HDx", "name": "Home Depot", "ticker": "HD", "type": "stock", "address": "0x766b0cd6ed6d90b5d49d2c36a3761e9728501ba9"},
    {"symbol": "xMCD", "xstocks_ticker": "MCDx", "name": "McDonald's", "ticker": "MCD", "type": "stock", "address": "0x80a77a372c1e12accda84299492f404902e2da67"},
    {"symbol": "xXOM", "xstocks_ticker": "XOMx", "name": "Exxon Mobil", "ticker": "XOM", "type": "stock", "address": "0xeedb0273c5af792745180e9ff568cd01550ffa13"},
    {"symbol": "xCVX", "xstocks_ticker": "CVXx", "name": "Chevron", "ticker": "CVX", "type": "stock", "address": "0xad5cdc3340904285b8159089974a99a1a09eb4c0"},
    {"symbol": "xPFE", "xstocks_ticker": "PFEx", "name": "Pfizer", "ticker": "PFE", "type": "stock", "address": "0x1ac765b5bea23184802c7d2d497f7c33f1444a9e"},
    {"symbol": "xMRK", "xstocks_ticker": "MRKx", "name": "Merck", "ticker": "MRK", "type": "stock", "address": "0x17d8186ed8f68059124190d147174d0f6697dc40"},
    {"symbol": "xJNJ", "xstocks_ticker": "JNJx", "name": "Johnson & Johnson", "ticker": "JNJ", "type": "stock", "address": "0xdb0482cfad4789798623e64b15eeba01b16e917c"},
    {"symbol": "xUNH", "xstocks_ticker": "UNHx", "name": "UnitedHealth", "ticker": "UNH", "type": "stock", "address": "0x167a6375da1efc4a5be0f470e73ecefd66245048"},
    {"symbol": "xABT", "xstocks_ticker": "ABTx", "name": "Abbott", "ticker": "ABT", "type": "stock", "address": "0x89233399708c18ac6887f90a2b4cd8ba5fedd06e"},
    {"symbol": "xABBV", "xstocks_ticker": "ABBVx", "name": "AbbVie", "ticker": "ABBV", "type": "stock", "address": "0xfbf2398df672cee4afcc2a4a733222331c742a6a"},
    {"symbol": "xNVO", "xstocks_ticker": "NVOx", "name": "Novo Nordisk", "ticker": "NVO", "type": "stock", "address": "0xf9523e369c5f55ad72dbaa75b0a9b92b3d8b147e"},
    {"symbol": "xRBLX", "xstocks_ticker": "RBLXx", "name": "Roblox", "ticker": "RBLX", "type": "stock", "address": "0x5d8da1417e3565eb02c9ca8cc588be5d8f65b1c5"},
    {"symbol": "xAPP", "xstocks_ticker": "APPx", "name": "AppLovin", "ticker": "APP", "type": "stock", "address": "0x50a1291f69d9d3853def8209cfb1af0b46927be1"},
    {"symbol": "xRIOT", "xstocks_ticker": "RIOTx", "name": "Riot Platforms", "ticker": "RIOT", "type": "stock", "address": "0x6ac47387f0a2798df4c4ee5bb31ab9517ac97cb8"},
    {"symbol": "xOKLO", "xstocks_ticker": "OKLOx", "name": "Oklo", "ticker": "OKLO", "type": "stock", "address": "0x4b0ee7c047d43ca403239f28f42115bedb7c0076"},
    {"symbol": "xIBM", "xstocks_ticker": "IBMx", "name": "IBM", "ticker": "IBM", "type": "stock", "address": "0xd9913208647671fe0f48f7f260076b2c6f310aac"},
    {"symbol": "xCSCO", "xstocks_ticker": "CSCOx", "name": "Cisco", "ticker": "CSCO", "type": "stock", "address": "0x053c784cd87b74f42e0c089f98643e79c1a3ff16"},
    {"symbol": "xBRKB", "xstocks_ticker": "BRK.Bx", "name": "Berkshire Hathaway", "ticker": "BRKB", "type": "stock", "address": "0x12992613fdd35abe95dec5a4964331b1ee23b50d"},
    {"symbol": "xPG", "xstocks_ticker": "PGx", "name": "Procter & Gamble", "ticker": "PG", "type": "stock", "address": "0xa90424d5d3e770e8644103ab503ed775dd1318fd"},
    {"symbol": "xPM", "xstocks_ticker": "PMx", "name": "Philip Morris", "ticker": "PM", "type": "stock", "address": "0x02a6c1789c3b4fdb1a7a3dfa39f90e5d3c94f4f9"},
    {"symbol": "xTMUS", "xstocks_ticker": "TMUSx", "name": "T-Mobile", "ticker": "TMUS", "type": "stock", "address": "0x68f3ddee8bae33691e7cd0372984fd857e842760"},
    {"symbol": "xAZN", "xstocks_ticker": "AZNx", "name": "AstraZeneca", "ticker": "AZN", "type": "stock", "address": "0x5d642505fe1a28897eb3baba665f454755d8daa2"},
    {"symbol": "xACN", "xstocks_ticker": "ACNx", "name": "Accenture", "ticker": "ACN", "type": "stock", "address": "0x03183ce31b1656b72a55fa6056e287f50c35bbeb"},

    # ── Additional Backed Finance Stocks ───────────────────────────────────
    {"symbol": "xMARA", "xstocks_ticker": "MARAx", "name": "MARA Holdings", "ticker": "MARA", "type": "stock", "address": "0x9d692bffef6f6bedf4274053ff9998efe3b2539e"},
    {"symbol": "xMRVL", "xstocks_ticker": "MRVLx", "name": "Marvell", "ticker": "MRVL", "type": "stock", "address": "0xeaad46f4146ded5a47b55aa7f6c48c191deaec88"},
    {"symbol": "xUBER", "xstocks_ticker": "UBERx", "name": "Uber", "ticker": "UBER", "type": "stock", "address": "0xdb9783ca04bbd64fe2c6d7b9503a979b3de30729"},
    {"symbol": "xPYPL", "xstocks_ticker": "PYPLx", "name": "PayPal", "ticker": "PYPL", "type": "stock", "address": "0xf706585e7e8900be0267bee3b9a2f70835ec6628"},
    {"symbol": "xCLSK", "xstocks_ticker": "CLSKx", "name": "CleanSpark", "ticker": "CLSK", "type": "stock", "address": "0xd0194f0f077968da8ca59811e9407f54ae6c9432"},
    {"symbol": "xWBD", "xstocks_ticker": "WBDx", "name": "Warner Bros Discovery", "ticker": "WBD", "type": "stock", "address": "0xc435b3c41ae56d9bc57b8525f4d522c978f168e8"},
    {"symbol": "xMU", "xstocks_ticker": "MUx", "name": "Micron", "ticker": "MU", "type": "stock", "address": "0xf6a873bae4ba1b304e45df52a4b7d176e1c6a8c4"},
    {"symbol": "xLIN", "xstocks_ticker": "LINx", "name": "Linde", "ticker": "LIN", "type": "stock", "address": "0x15059c599c16fd8f70b633ade165502d6402cd49"},
    {"symbol": "xTMO", "xstocks_ticker": "TMOx", "name": "Thermo Fisher", "ticker": "TMO", "type": "stock", "address": "0xaf072f109a2c173d822a4fe9af311a1b18f83d19"},
    {"symbol": "xDHR", "xstocks_ticker": "DHRx", "name": "Danaher", "ticker": "DHR", "type": "stock", "address": "0xdba228936f4079daf9aa906fd48a87f2300405f4"},
    {"symbol": "xCMCSA", "xstocks_ticker": "CMCSAx", "name": "Comcast", "ticker": "CMCSA", "type": "stock", "address": "0xbc7170a1280be28513b4e940c681537eb25e39f4"},
    {"symbol": "xHON", "xstocks_ticker": "HONx", "name": "Honeywell", "ticker": "HON", "type": "stock", "address": "0x62a48560861b0b451654bfffdb5be6e47aa8ff1b"},
    {"symbol": "xMDT", "xstocks_ticker": "MDTx", "name": "Medtronic", "ticker": "MDT", "type": "stock", "address": "0x0588e851ec0418d660bee81230d6c678daf21d46"},
    {"symbol": "xGLXY", "xstocks_ticker": "GLXYx", "name": "Galaxy Digital", "ticker": "GLXY", "type": "stock", "address": "0xf7f4fac56f012de7dd6adff54c761986b9e0655a"},
    {"symbol": "xTONX", "xstocks_ticker": "TONXx", "name": "TON", "ticker": "TONX", "type": "stock", "address": "0xe95ab205e333443d7970336d5fd827ef9ed97608"},
    {"symbol": "xHUT", "xstocks_ticker": "HUTx", "name": "Hut 8", "ticker": "HUT", "type": "stock", "address": "0x560deb3d70ac90064ff809349cdf9a771a06fd36"},
    {"symbol": "xCORZ", "xstocks_ticker": "CORZx", "name": "Core Scientific", "ticker": "CORZ", "type": "stock", "address": "0x51ed5b74a05f256dbd9ebb4e4f68bb41ba10160b"},
    {"symbol": "xBTBT", "xstocks_ticker": "BTBTx", "name": "Bit Digital", "ticker": "BTBT", "type": "stock", "address": "0x22e1991e5f82736a2a990322a46aac0e95826c5b"},
    {"symbol": "xWULF", "xstocks_ticker": "WULFx", "name": "TeraWulf", "ticker": "WULF", "type": "stock", "address": "0xc0c2150cf0870e2d7abc7cde17c20a542fafbb9b"},
    {"symbol": "xASTS", "xstocks_ticker": "ASTSx", "name": "AST SpaceMobile", "ticker": "ASTS", "type": "stock", "address": "0x89b2607878ae19bab8020b8140ed550ef3e953bb"},
    {"symbol": "xPL", "xstocks_ticker": "PLx", "name": "Planet Labs", "ticker": "PL", "type": "stock", "address": "0x536825370f1159cba953055f5c2f16ddc7b5a348"},
    {"symbol": "xSPCE", "xstocks_ticker": "SPCEx", "name": "Virgin Galactic", "ticker": "SPCE", "type": "stock", "address": "0x7f8ba411ecbc0a135d669d5eae5d15b0ca0b0ea1"},

    # ── ETFs & Index Funds ────────────────────────────────────────────────
    {"symbol": "xSPY", "xstocks_ticker": "SPYx", "name": "S&P 500 ETF", "ticker": "SPY", "type": "etf", "address": "0x90a2a4c76b5d8c0bc892a69ea28aa775a8f2dd48"},
    {"symbol": "xQQQ", "xstocks_ticker": "QQQx", "name": "Nasdaq 100 ETF", "ticker": "QQQ", "type": "etf", "address": "0xa753a7395cae905cd615da0b82a53e0560f250af"},
    {"symbol": "xGLD", "xstocks_ticker": "GLDx", "name": "Gold ETF", "ticker": "GLD", "type": "commodity_etf", "address": "0x2380f2673c640fb67e2d6b55b44c62f0e0e69da9"},
    {"symbol": "xSLV", "xstocks_ticker": "SLVx", "name": "Silver ETF", "ticker": "SLV", "type": "commodity_etf", "address": "0x4833e7f4f0460f4b72a3a5879a6c9841bcc5b58b"},
    {"symbol": "xIWM", "xstocks_ticker": "IWMx", "name": "Russell 2000 ETF", "ticker": "IWM", "type": "etf", "address": "0xdadfb355c6110eda0908740d52c834d6c2bcddc7"},
    {"symbol": "xVTI", "xstocks_ticker": "VTIx", "name": "Vanguard Total Stock Market", "ticker": "VTI", "type": "etf", "address": "0xbd730e618bcd88c82ddee52e10275cf2f88a4777"},
    {"symbol": "xTQQQ", "xstocks_ticker": "TQQQx", "name": "ProShares UltraPro QQQ", "ticker": "TQQQ", "type": "etf", "address": "0xfdddb57878ef9d6f681ec4381dcb626b9e69ac86"},
    {"symbol": "xIJR", "xstocks_ticker": "IJRx", "name": "S&P Small Cap ETF", "ticker": "IJR", "type": "etf", "address": "0xaa28cb97d7f7e172f54dee950743886d2d65447d"},
    {"symbol": "xIEMG", "xstocks_ticker": "IEMGx", "name": "Core MSCI Emerging Markets", "ticker": "IEMG", "type": "etf", "address": "0x6a668332825450acd2e449372057d31b3de16a1e"},
    {"symbol": "xSCHF", "xstocks_ticker": "SCHFx", "name": "Schwab International Equity", "ticker": "SCHF", "type": "etf", "address": "0xf6d87e523512704c29e9b7ca3e9e6226bdce3ea1"},
    {"symbol": "xVT", "xstocks_ticker": "VTx", "name": "Vanguard Total World", "ticker": "VT", "type": "etf", "address": "0x6d5edeebbc6a4099eb8bb289eb3b80d799f7b28c"},

    # ── Commodities & Alternatives ─────────────────────────────────────────
    {"symbol": "xPPLT", "xstocks_ticker": "PPLTx", "name": "Platinum ETF", "ticker": "PPLT", "type": "commodity_etf", "address": "0x8e9e4a8d7f1c65dcb42d9103832b27e75946055d"},
    {"symbol": "xPALL", "xstocks_ticker": "PALLx", "name": "Palladium ETF", "ticker": "PALL", "type": "commodity_etf", "address": "0x05473cea3774d898c7b6dda21e1876d6bca7277b"},
    {"symbol": "xCOPX", "xstocks_ticker": "COPXx", "name": "Global X Copper Miners", "ticker": "COPX", "type": "commodity_etf", "address": "0x89bab39d627a9e34f0dc782c53457e80ee8fb9d9"},

    # ── Additional Stocks ──────────────────────────────────────────────────
    {"symbol": "xAMBR", "xstocks_ticker": "AMBRx", "name": "Amber", "ticker": "AMBR", "type": "stock", "address": "0x2f9a35ab5ddfbc49927bfdeab98a86c53dc6e763"},
    {"symbol": "xBTGO", "xstocks_ticker": "BTGOx", "name": "Bitgo", "ticker": "BTGO", "type": "stock", "address": "0x60ae7d760a1c7b528c0384bc945fadf1438f47a5"},
    {"symbol": "xBMNR", "xstocks_ticker": "BMNRx", "name": "Bitmine", "ticker": "BMNR", "type": "stock", "address": "0xaeb681b69e5094e04d11bcef51a71358a374c3ed"},
    {"symbol": "xKRAQ", "xstocks_ticker": "KRAQx", "name": "KRAQ", "ticker": "KRAQ", "type": "stock", "address": "0x0ebe5fad0998765187fc695b75d4115c27c953a1"},
    {"symbol": "xSTRC", "xstocks_ticker": "STRCx", "name": "Strategy PP Variable", "ticker": "STRC", "type": "stock", "address": "0x1aad217b8f78dba5e6693460e8470f8b1a3977f3"},
    {"symbol": "xTBLL", "xstocks_ticker": "TBLLx", "name": "TBLL", "ticker": "TBLL", "type": "stock", "address": "0x4cbf89ed7bb30b8a860fa86d3c96e9c72931299b"},
    {"symbol": "xOPEN", "xstocks_ticker": "OPENx", "name": "OPEN", "ticker": "OPEN", "type": "stock", "address": "0xbee6b69345f376598fe16abd5592c6f844825e66"},
    {"symbol": "xDFDV", "xstocks_ticker": "DFDVx", "name": "DFDV", "ticker": "DFDV", "type": "stock", "address": "0x521860bb5df5468358875266b89bfe90d990c6e7"},
    {"symbol": "xCRCL", "xstocks_ticker": "CRCLx", "name": "Circle", "ticker": "CRCL", "type": "stock", "address": "0xfebded1b0986a8ee107f5ab1a1c5a813491deceb"},
]

# Legacy ticker aliases (e.g. "FB" -> "META", "GOOG" -> "GOOGL")
_TICKER_ALIASES: dict[str, str] = {
    "FB": "META",
    "GOOG": "GOOGL",
    "GOOGLE": "GOOGL",
    "BRK.B": "BRKB",
    "BRK-B": "BRKB",
}

# Common name aliases for fuzzy matching
_NAME_ALIASES: dict[str, str] = {
    "google": "Alphabet",
    "facebook": "Meta Platforms",
    "fb": "Meta Platforms",
    "jnj": "Johnson & Johnson",
    "j&j": "Johnson & Johnson",
    "microstrategy": "MicroStrategy",
    "strategy": "MicroStrategy",
    "novo": "Novo Nordisk",
    "coca cola": "Coca-Cola",
    "coke": "Coca-Cola",
    "pepsi": "PepsiCo",
    "mc donalds": "McDonald's",
    "mcdonalds": "McDonald's",
    "exxon": "Exxon Mobil",
    "jp morgan": "JPMorgan Chase",
    "jpmorgan": "JPMorgan Chase",
    "p&g": "Procter & Gamble",
    "procter": "Procter & Gamble",
    "gamble": "Procter & Gamble",
    "berkshire": "Berkshire Hathaway",
    "philip morris": "Philip Morris",
    "palo alto": "Palo Alto Networks",
    "crowdstrike": "CrowdStrike",
    "united health": "UnitedHealth",
    "unitedhealth": "UnitedHealth",
    "s&p": "S&P 500 ETF",
    "s&p 500": "S&P 500 ETF",
    "sp500": "S&P 500 ETF",
    "nasdaq": "Nasdaq 100 ETF",
    "nasdaq 100": "Nasdaq 100 ETF",
    "gold": "Gold ETF",
    "silver": "Silver ETF",
    "russell": "Russell 2000 ETF",
    "russell 2000": "Russell 2000 ETF",
    "tmobile": "T-Mobile",
    "t mobile": "T-Mobile",
    "home depot": "Home Depot",
    "homedepot": "Home Depot",
    "bank of america": "Bank of America",
    "bofa": "Bank of America",
    "goldman": "Goldman Sachs",
}

# Build lookup indices at module load time
_by_symbol: dict[str, dict] = {}       # "xTSLA" -> token
_by_ticker: dict[str, dict] = {}       # "TSLA" -> token
_by_name_lower: dict[str, dict] = {}   # "tesla" -> token

for _token in XSTOCK_REGISTRY:
    _by_symbol[_token["symbol"].upper()] = _token
    _by_ticker[_token["ticker"].upper()] = _token
    _by_name_lower[_token["name"].lower()] = _token


# ---------------------------------------------------------------------------
# Supported crypto (non-xStock) assets
# ---------------------------------------------------------------------------

CRYPTO_ASSETS: list[dict] = [
    {"symbol": "ETH", "name": "Ethereum", "ticker": "ETH", "type": "crypto", "address": "native"},
    {"symbol": "USDC", "name": "USD Coin", "ticker": "USDC", "type": "crypto", "address": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"},
    {"symbol": "USDT", "name": "Tether", "ticker": "USDT", "type": "crypto", "address": "0xdAC17F958D2ee523a2206206994597C13D831ec7"},
    {"symbol": "WETH", "name": "Wrapped Ether", "ticker": "WETH", "type": "crypto", "address": "0xC02aaA39b223FE8D0A0e5695F863489fa5693b42"},
]

_crypto_by_symbol: dict[str, dict] = {a["symbol"].upper(): a for a in CRYPTO_ASSETS}
_crypto_by_name: dict[str, dict] = {a["name"].lower(): a for a in CRYPTO_ASSETS}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def list_tokens() -> list[dict]:
    """Return the full xStock registry."""
    return list(XSTOCK_REGISTRY)


def list_all_assets() -> list[dict]:
    """Return all tradable assets (xStocks + crypto)."""
    return list(XSTOCK_REGISTRY) + list(CRYPTO_ASSETS)


def get_token_by_symbol(symbol: str) -> Optional[dict]:
    """Exact lookup by Merlin symbol (e.g. 'xTSLA')."""
    return _by_symbol.get(symbol.upper())


def resolve_token(query: str) -> dict:
    """
    Fuzzy-match a user query to an xStock or crypto token.

    Returns a dict with:
      - "match": the token dict, or None
      - "confidence": float 0-1
      - "alternatives": list of other possible matches (if ambiguous)

    Resolution order:
      1. Exact xStock symbol match (xTSLA)
      2. Exact ticker match (TSLA)
      3. Exact crypto match (ETH, USDC)
      4. Name alias match (Google -> Alphabet)
      5. Exact company name match (Tesla)
      6. Prefix match on name/ticker
      7. Fuzzy substring / similarity match
    """
    raw = query.strip()
    if not raw:
        return {"match": None, "confidence": 0.0, "alternatives": [], "raw": query}

    normalized = raw.lower()

    # Strip leading "x" for symbol check, and also try with "x" prefix
    upper = raw.upper()

    # 1. Exact xStock symbol match
    if upper in _by_symbol:
        return _hit(_by_symbol[upper], 1.0, query)

    # Also try adding "x" prefix
    if f"X{upper}" in _by_symbol:
        return _hit(_by_symbol[f"X{upper}"], 1.0, query)

    # 2. Exact ticker match (resolve aliases first)
    resolved_ticker = _TICKER_ALIASES.get(upper, upper)
    if resolved_ticker in _by_ticker:
        return _hit(_by_ticker[resolved_ticker], 1.0, query)

    # 3. Exact crypto match
    if upper in _crypto_by_symbol:
        return _hit(_crypto_by_symbol[upper], 1.0, query)
    if normalized in _crypto_by_name:
        return _hit(_crypto_by_name[normalized], 1.0, query)

    # 4. Name alias match
    if normalized in _NAME_ALIASES:
        alias_name = _NAME_ALIASES[normalized].lower()
        if alias_name in _by_name_lower:
            return _hit(_by_name_lower[alias_name], 0.95, query)

    # 5. Exact company name match (case-insensitive)
    if normalized in _by_name_lower:
        return _hit(_by_name_lower[normalized], 1.0, query)

    # 6. Prefix match on name
    prefix_matches = []
    for name_lower, token in _by_name_lower.items():
        if name_lower.startswith(normalized) and len(normalized) >= 2:
            prefix_matches.append(token)

    # Prefix match on ticker
    for ticker_upper, token in _by_ticker.items():
        if ticker_upper.startswith(upper) and len(upper) >= 2:
            if token not in prefix_matches:
                prefix_matches.append(token)

    if len(prefix_matches) == 1:
        return _hit(prefix_matches[0], 0.9, query)
    if len(prefix_matches) > 1:
        return _ambiguous(prefix_matches, query)

    # 7. Fuzzy similarity match
    candidates: list[tuple[float, dict]] = []

    for token in XSTOCK_REGISTRY:
        best_score = 0.0
        # Match against name
        name_score = SequenceMatcher(None, normalized, token["name"].lower()).ratio()
        best_score = max(best_score, name_score)
        # Match against ticker
        ticker_score = SequenceMatcher(None, upper, token["ticker"]).ratio()
        best_score = max(best_score, ticker_score)
        # Substring containment bonus
        if normalized in token["name"].lower() or token["name"].lower() in normalized:
            best_score = max(best_score, 0.85)
        if best_score >= 0.6:
            candidates.append((best_score, token))

    # Also check crypto
    for token in CRYPTO_ASSETS:
        name_score = SequenceMatcher(None, normalized, token["name"].lower()).ratio()
        ticker_score = SequenceMatcher(None, upper, token["ticker"]).ratio()
        best_score = max(name_score, ticker_score)
        if best_score >= 0.6:
            candidates.append((best_score, token))

    if not candidates:
        return {"match": None, "confidence": 0.0, "alternatives": [], "raw": query}

    candidates.sort(key=lambda x: x[0], reverse=True)

    top_score, top_token = candidates[0]

    # If the top match is clearly ahead, return it
    if len(candidates) == 1 or (len(candidates) > 1 and top_score - candidates[1][0] > 0.15):
        confidence = min(top_score, 0.85)  # Cap fuzzy matches at 0.85
        return _hit(top_token, confidence, query)

    # Multiple close matches — ambiguous
    return _ambiguous([c[1] for c in candidates[:3]], query)


def is_supported_asset(symbol: str) -> bool:
    """Check if a symbol is a known xStock or crypto asset."""
    upper = symbol.upper()
    return (
        upper in _by_symbol
        or upper in _by_ticker
        or upper in _crypto_by_symbol
        or f"X{upper}" in _by_symbol
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _hit(token: dict, confidence: float, raw: str) -> dict:
    return {
        "match": token,
        "confidence": confidence,
        "alternatives": [],
        "raw": raw,
    }


def _ambiguous(tokens: list[dict], raw: str) -> dict:
    return {
        "match": tokens[0] if tokens else None,
        "confidence": 0.5,
        "alternatives": [t["symbol"] for t in tokens[:5]],
        "raw": raw,
    }

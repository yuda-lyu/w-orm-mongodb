# 規則帳本:診斷輸出與對外錯誤值之遮罩(R-DIAG-01 之細節)

本檔為 `sgud/rule/rulebook.md` 之 R-DIAG-01 節之搬出部分(規則帳本過長之整理;節號與內容不變):規格來源、宣告與規則句 1~6 見主檔該節。

**站點全集與處置**(函數名為準;`Grep` 重跑見盤點指令)

| # | 站點 | 值之來源 | 處置 |
|---|---|---|---|
| S1 | 11 個公開函數之批次 `catch`:`select`、`selectByPk`、`insert`、`insertBulk`、`save`、`del`、`delAll`、`insertGfs`、`selectByPkGfs`(`else` 分支;`ENOENT` 判定用原值)、`delGfs`、`delAllGfs` | 驅動、後端、使用端存取器(外來);`procPk`/`procDocs`/`cvFind` 之固定詞彙(自身) | `res = outErr(err)`:外來→`diag.err`、自身→原樣(`error` 事件與 `Promise.reject` 同一值) |
| S2 | 逐筆 `err`:`saveOne` catch、`del` 逐筆 catch、`delGfs` 逐筆 catch | 驅動(外來) | `err: outMsg(err)` → `diag.mask`;`error` 事件之訊息為同一字串 |
| S2' | 逐筆 `err: msgBad`/`msgBads[k]`(`saveOne` 不合格早退、`del`、`delGfs`) | 本套件固定詞彙 | 原樣(刻意不包) |
| S3 | `finally` 內 `closeClient`(11 處) | 驅動(外來) | `diag.err` |
| S4 | `cloneData`(`insert`、`insertBulk`、`save`、`del`,`try` 之外) | 使用端輸入之存取器/Proxy(外來) | `diag.err` |
| S5 | `genClient()`(11 呼叫點,皆在 `try` 內) | 驅動解析連線字串(外來) | 經 S1;樣式 `mongoHostEcho` 遮回顯之主機位址項 |
| S6 | 內部轉手:`_uploadGfs` 之 `pm.reject(err)`(2 處)、`selectByPkGfs` 之 `pm.reject(err)`、`insert` 內層 `throw err`、`_insertBulkByCompensate` 之 `throw errIns`、`_findGfs` 之 `Promise.reject(res)` | 驅動 | 不遮(原值供 `isDupKeyError`、`ENOENT` 判定與 `delGfs` 逐筆使用),由接住處之 S1/S2 遮罩後才對外 |
| S7 | 建構期 `throw new Error('invalid opt.<名>: …')` | 本套件固定詞彙 | 原樣(不包) |
| S8 | `emitChange`/`emitError` 之 catch → `diag(…, 'log')`(2 處) | 使用端訂閱函數(外來) | 經 `getDiag`(預設只輸出標籤與摘要) |
| S9 | `console`/`process.stdout|stderr`/`emitWarning`(src) | — | 0 處(除 wsemi 內之 `getDiag`) |
| S10 | 驅動自身日誌(`MONGODB_LOG_*`、`mongodbLogPath`)與 `process.emitWarning` | 驅動 | 預設關閉,環境變數明示開啟,不經本套件出口;README 載明(不改) |

**盤點指令**(重跑;結果須與上表一致;皆由 `test/unit-diagwire.test.mjs`「站點盤點」案鎖定)

- `Grep "res = outErr\(err\)" src/` → 11 處;`Grep "res = err\b" src/` → 1 處(`_findGfs` 內)。
- `Grep "err: outMsg\(err\)" src/` → 3 處;`Grep "err: getErrMsg\(" src/` → 0 處。
- `Grep "await closeClient\(client\)|client\.close\(\)" src/` → 11 處與 1 處(`closeClient` 內);`Grep "data = cloneData\(data\)|cloneDeep\(" src/` → 4 處與 1 處。
- `Grep "cvOrmFind\(|find = cvFind\(find\)" src/` → 1 處與 4 處;`Grep "throw ownErr\(|new Error\(" src/` → 4 處與 2 處(建構期 throw、`ownErr` 內)。
- `Grep "new MongoClient\(|client = genClient\(\)" src/` → 1 處與 11 處;`Grep "\bdiag\(" src/` → 2 處且皆 `'log'` 結尾。
- `Grep "console\.|process\.(stdout|stderr)|emitWarning" src/` → 0 處;`src/` 只有 `WOrmMongodb.mjs`;驅動端:`Grep "emitWarning|process\.(stdout|stderr)|console\." node_modules/mongodb/lib`(見 `sgud/exp/experience.md`)。

**對應測試**(`npm test` 即全跑;單檔:`npx mocha test/unit-diagwire.test.mjs --timeout 60000`)

| 測試檔 | 內容 |
|---|---|
| `test/unit-diagwire.test.mjs`(不連線,假驅動 `test/tools/fakeMongo.mjs`) | **接線測試**:①wsemi 共用語料(`wsemi/src/_diagCases.mjs`)wire 子集(20 案)之處置表(`DISPOSITION`,語料新增 wire 案時「分類完整」案轉紅)× 真實呼叫點:`error`/`change` 兩站之 `funLog` detail、11 函數 × 驅動接縫外來值之 reject(語料 9 案 `detail+reject`)、C01/O01/O15/R01/R02/R04/R11/R12 之接線版;②固定詞彙原樣:本套件自身之固定詞彙錯誤全集 12 型(整批 reject 與逐筆 err、`error` 事件)× 9 個為其子字串之密碼,與對照組(密碼非子字串)逐項相同;③S2(save、del、delGfs 逐筆,含字串值與無憑證)、S3(11 函數 `close` reject)、S4(4 函數 cloneDeep 存取器)、S5(11 函數 `new MongoClient` 拋錯);④站點盤點(原始碼掃描) |
| `test/unit-diaglog.test.mjs`(不連線) | 單一出口掃描(無 `console`、無 `src/getDiag.mjs`、無內建模組);11 函數 × `error` 訂閱函數拋錯、`change` 站點(皆 `console.log`,stdout)、非 Error 值、`logDetail`/`funLog` 與選項型別/getter/快照、診斷輸出不使操作之 reject 變例外、`funLog` 回傳 reject 之 promise |
| `test/unit-urlerr.test.mjs`(不連線,真驅動) | 37 種連線字串形態 × 11 函數(真驅動產生之錯誤,非語料所能代替):reject 為遮罩後同類別(原型相同)之錯誤、訊息逐字等於預期、message/stack/cause/inspect 無憑證、`error` 事件 payload;建構函式固定詞彙;非字串 url;固定詞彙(find 白名單外)原樣;spy 驗 `MongoClient` 仍以原 url 建立;子行程未捕獲 reject 之 stderr |
| `test/api-diaglog.test.mjs`(自建 docker 容器) | 8 個會發 `change` 之函數 + `error` 站點之預設輸出;`logDetail`(label 加遮罩副本);`funLog`;選項型別/快照;回傳契約對照 HEAD golden;驅動執行期連線錯誤不含帳密 |
| `test/tools/fakeMongo.mjs`、`diagScenario.mjs`、`diagGoldenGen.mjs`、`diagGolden.json`、`urlerrWorker.mjs` | 假驅動(`ctor`/`connect`/`db`/`close`/`col` 接縫注入外來值)、共用情境、golden 產生器、golden(HEAD 產生)、子行程腳本 |

**變異**(須轉紅;於 `./tmp/diagmut/work/<名>/` 之複本執行,不動 `src/`;執行器 `test/tools/diagMutRun.mjs`〔入庫〕,`node C:/opensrcOper/tools/quiet-run.mjs --lock --name <名> -- node test/tools/diagMutRun.mjs [名稱子字串…]`,離開碼 0 表全數殺死;用法見 `sgud/exp/experience.md`):漏包批次 catch(11 函數各一)、誤包固定詞彙(`outErr` 恆包、`ownErr` 不登記、`cvFind` 不登記、4 處 `ownErr` 退回裸 `new Error`、4 處 `cvFind` 退回 `cvOrmFind`)、逐筆 err 未遮(`outMsg` 不遮、3 站各退回 `getErrMsg`)、`closeClient`/`cloneData` 不遮與 11+4 站旁路、宣告退化(秘密為空、無 `patterns`/`codes`/`safeKeys`、`opt` 未傳)、level 改 `'error'`、摘要移除、自寫遮罩。結果見 mig-mongo 報告與 `sgud/exp/experience.md`。

**已知限制**

1. wsemi 之已知限制(dspec §5):載入前已掛同名 `Error.prepareStackTrace` hook、私有欄位無法複製、Node < 20.16 或瀏覽器無 `util.types` 時 Proxy 不可偵測、reject 清單之短密碼(< 4 字元)不遮、未走訪之捨棄子樹內之 rejected Promise 不標記等;驅動自身日誌與 `process.emitWarning` 不經出口(S10)。
2. 第三方原生層直接寫 stderr 者不在 JS 層可攔範圍(本套件無此類相依)。
3. **摘要 `errType` 對驅動錯誤恆為 `Error`**(`MongoServerError`、`MongoNetworkError` 等不在 wsemi 內建類別名,本套件未宣告 `types`):摘要只用於「訂閱函數拋出之值」(`diag.brief` 之唯一呼叫點為 `emitChange`/`emitError` 之 catch),驅動錯誤不經此;若需列驅動類別名,於 `cfg.types` 宣告(待裁示,不影響遮罩)。`errCode` 對 `MongoServerError` 之整數 `code`(`11000`、`13`、`18`、`59` 等)依 `mongoServer` 集合收錄,集合外(如 `40324`、`73`)不收。
4. **P8(`getDiagBriefErr` 是否另讀 `codeName`)結論:不需要**。2026-10-29 以真驅動(mongodb 7.5.0、`mongo:8` 容器)24 種錯誤形態實測:`MongoServerError` 與 `MongoBulkWriteError` 之 `code` 恆為**整數**(`codeName` 為字串且僅部分錯誤帶自有資料屬性),`mongoServer` 集合內之 `codeName` 字串從不命中(`code` 非字串);凡 `codeName` 在集合內者其整數 `code` 亦在集合內(0 例僅 `codeName` 命中),集合外者(`40324`/`Location40324`、`73`/`InvalidNamespace`)兩者皆不在;網路類錯誤(`MongoServerSelectionError`、`MongoNetworkError`)無 `code`。證據:`C:\opensrcOper\dnow\20261029002013\agent-out\mig-mongo-p8-證據.json`(逐項 `code`/`codeName`/摘要)。
5. 單獨帳號於對外錯誤值不遮(D3/Q3):如查詢參數 `proxyUsername` 之值被驅動回顯時原樣(修改前遮罩);`帳號:密碼` 並列形式與 `proxyPassword` 之值照遮。`/` 分段:`CORP/帳號` 遮為 `***/***`。
6. 含憑證之對外錯誤為**同類別之副本**(非同一物件,非原地改寫);不含憑證者為原物件。下游若以錯誤物件之身分比較(`===`)含憑證之 reject,身分不同。

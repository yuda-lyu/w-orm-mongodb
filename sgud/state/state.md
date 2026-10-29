# 現況(state)

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`)。藍圖(規則)見 `sgud/rule/rulebook.md`(R-DIAG-01 之細節見 `sgud/rule/rulebook_diag.md`)。

- 套件版本:`package.json` 1.2.11(2026-10-29 mig-mongo 未改 `version`;發布由使用者/主控負責)。相依:`wsemi` ≥ 1.9.31(診斷輸出與遮罩之共用模組)、`mongodb` ^7.5.0。
- 本檔於 2026-10-28(mongo-run01)首次建立;更早之功能現況請以 `sgud/rule/rulebook.md` 之 R-FIND-01、R-ORMSTR-01 與〈破壞性變更紀錄〉為準。

## 功能現況

| 功能 | 規則帳本 | 測試檔 | 現況 |
|---|---|---|---|
| 條件(find)系列白名單(`select`、`delAll`、`delAllGfs`、`_findGfs`) | R-FIND-01 | `api-find-whitelist`、`api-find-whitelist-gfs`、`api-basic` | 完成 |
| 字串良構檢核(主鍵、資料字串值與鍵名、`opt.url/db/cl`)、`new MongoClient` 於 `try` 內 | R-ORMSTR-01 | `api-wellformed`、`api-basic`、`api-gfs`、`api-find-whitelist-gfs` | 完成 |
| 基本操作、事件(`change`/`error`)、`autoGenPk`、GridFS、跨行程併發 | (README) | `api-basic`、`api-gfs`、`api-insertbulk-rs` | 完成 |
| **診斷輸出與對外錯誤值之遮罩(遷移至 wsemi 共用模組,mig-mongo)** | R-DIAG-01(依 dspec〈診斷輸出與遮罩〉) | `unit-diagwire`、`unit-diaglog`、`unit-urlerr`、`api-diaglog` | 完成(見下) |

### R-DIAG-01 診斷輸出與遮罩(2026-10-29,mig-mongo;原 mongo-run01 之自寫 `src/getDiag.mjs` 已刪)

- 實作:`src/WOrmMongodb.mjs` 建構段 `getDiag(opt, { secrets: getDiagSecrets({ urls: [url] }), codes: ['mongoServer'], patterns: ['mongoHostEcho'], safeKeys: ['mode'] })`(wsemi);`ours`/`ownErr`/`cvFind`/`outErr`/`outMsg`/`closeClient`/`cloneData` 為本套件之接縫;`src/` 只有 `WOrmMongodb.mjs`。
- 站點:11 函數之批次 `catch` 皆 `res = outErr(err)`(外來值經 `diag.err`、固定詞彙錯誤原樣);逐筆 `err`(save、del、delGfs)經 `outMsg` → `diag.mask`;`finally` 內關閉連線與 `try` 外 `cloneDeep` 之外來值經 `diag.err`;`emitChange`/`emitError` 之訂閱函數拋錯 → `diag(…, 'log')`(stdout)。全表見 `sgud/rule/rulebook_diag.md`。
- 對外行為變化(README〈破壞性變更〉):`logDetail` 輸出多標籤且為遮罩副本;含憑證之對外錯誤值為同類別副本(不再原地改寫),擴及全部外來值;單獨帳號不遮(`proxyUsername` 之值原樣、`CORP/帳號` → `***/***`);固定詞彙錯誤不遮。resolve 內容與事件 payload 不變(`test/tools/diagGolden.json` 對照 HEAD)。
- 已知缺口/待辦:
  1. 摘要 `errType` 對驅動錯誤類別恆為 `Error`(未宣告 `types`;待主控裁示是否宣告驅動類別名,不影響遮罩)。
  2. P8:`getDiagBriefErr` 不需另讀 `codeName`(真驅動 24 種錯誤形態實測,證據在主控證據夾 `agent-out/mig-mongo-p8-證據.json`)。
  3. 驅動自身日誌(`MONGODB_LOG_*`、`mongodbLogPath`)與 `process.emitWarning` 不經出口(預設關閉;文件化,不改)。
  4. `dist/`、`docs/` 未重新建置(發布流程自動產製);已於暫存目錄打包驗證:UMD 工廠相依仍只有 `mongodb`、`stream`(`require("util")` 來自 lodash,修前同),UMD +33.8 KB。
  5. 發布與版號由主控/使用者決定;`package-lock.json` 因 Verdaccio 不寫 `resolved` 而有大量噪音 diff(見 experience)。
  6. 下游:凡以含憑證之 reject 做 `===` 身分比較、或依賴 `logDetail` 裸輸出格式者受影響;依賴本套件之 `w-orm-*` 上層(如 w-serv-orm 之 mongo 後端)請留意 reject 副本與單獨帳號不遮。

## 最近一次驗證

- 2026-10-29 mig-mongo(未發布;發布版本由主控決定):全套 `npm test`(`quiet-run --lock`)**4093 passing / 0 failing / 0 pending**(5m,exit 0)。診斷輸出相關:`unit-diagwire` 93 + `unit-diaglog` 24 + `unit-urlerr` 471 + `api-diaglog` 25(自建 docker 容器)。修前紅(以 `git archive HEAD src` 之舊碼跑新三個單元檔):588 案中 88 紅(其餘為「固定詞彙原樣」等守護案,修前綠屬正常);變異 53 個全數殺死、0 存活、0 未套用。細節與證據見 `C:\opensrcOper\dnow\20261029002013\agent-out\mig-mongo-修正報告.md`。
- 前一次(2026-10-28 mongo-run01,自寫 `getDiag.mjs` 版):全套 4055 passing。

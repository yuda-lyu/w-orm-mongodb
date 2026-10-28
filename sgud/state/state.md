# 現況(state)

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`)。藍圖(規則)見 `sgud/rule/rulebook.md`。

- 套件版本:`package.json` 1.2.10(本檔建立時〔2026-10-28〕;發布由使用者/主控負責)。
- 本檔於 2026-10-28(mongo-run01)首次建立;更早之功能現況請以 `sgud/rule/rulebook.md` 之 R-FIND-01、R-ORMSTR-01 與〈破壞性變更紀錄〉為準。

## 功能現況

| 功能 | 規則帳本 | 測試檔 | 現況 |
|---|---|---|---|
| 條件(find)系列白名單(`select`、`delAll`、`delAllGfs`、`_findGfs`) | R-FIND-01 | `api-find-whitelist`、`api-find-whitelist-gfs`、`api-basic` | 完成 |
| 字串良構檢核(主鍵、資料字串值與鍵名、`opt.url/db/cl`)、`new MongoClient` 於 `try` 內 | R-ORMSTR-01 | `api-wellformed`、`api-basic`、`api-gfs`、`api-find-whitelist-gfs` | 完成 |
| 基本操作、事件(`change`/`error`)、`autoGenPk`、GridFS、跨行程併發 | (README) | `api-basic`、`api-gfs`、`api-insertbulk-rs` | 完成 |
| **診斷輸出之單一出口與預設安全、連線設定錯誤不回顯帳密(mongo-run01)** | R-DIAG-01 | `unit-diaglog`、`unit-urlerr`、`api-diaglog` | 完成(見下) |

### R-DIAG-01 診斷輸出(2026-10-28,mongo-run01)

- 實作:`src/getDiag.mjs`(新;`getOptLog`、`getSecrets`、`maskText`、`cpMask`、`maskErr`、`getDiag`、`getBriefErr`;無 import、不用 Node 內建模組);`src/WOrmMongodb.mjs`:`diag` 建於建構時(`:98`)、`genClient()`(`:134`)取代 11 處 `new MongoClient(url)`、`emitChange`/`emitError` catch 改經 `diag`(`:177`、`:199`)。選項 `opt.logDetail`(僅 `true` 生效)、`opt.funLog(label, safe, detail)`(僅函數生效),型別錯誤忽略用預設(同 `autoGenPk`),建構時快照。
- 預設輸出:`change handler threw { mode, errType, errCode? }`、`error handler threw { … }`;連線憑證於預設/`logDetail`/`funLog` 皆 `***`;驅動 `new MongoClient(url)` 解析失敗之錯誤(缺 `@主機` 時回顯 `帳號:密碼`)於往外拋前原地遮罩(類別、原型、前綴不變)。
- 回傳契約:各操作 resolve/reject 內容與事件 payload 對照 HEAD 產生之 `test/tools/diagGolden.json` 逐一相同;該檔**不得以現行程式重產**。
- 文件:README 〈破壞性變更〉新增〈診斷輸出〉;`WOrmMongodb` 類別 JSDoc 與 `@param opt.logDetail`、`opt.funLog`。
- 驗證:見〈最近一次驗證〉。
- 已知缺口/待辦:
  1. 驅動自身日誌(`MONGODB_LOG_*`、`mongodbLogPath`)與 `process.emitWarning` 不經本套件出口(預設關閉,環境變數明示開啟;文件化,不改)。
  2. 反向筆誤 `host:port@帳號:純數字≤5位密碼` 之殘留邊界(rulebook R-DIAG-01 已知限制 3)。
  3. 發布與版號由主控/使用者決定(本輪未改 `version`、未 commit)。
  4. `dist/` 未重新建置(發布流程自動產製);已以暫存目錄打包驗證 `getDiag.mjs` 隨之打包且外部相依與修前相同(`mongodb`、`stream`、`util`)。

## 最近一次驗證

- 2026-10-28 mongo-run01(未發布;發布版本由主控決定):全套 `npm test` **4055 passing / 0 failing / 0 pending**(5m44s,exit 0;修改前基準 3792 為本輪中途〔外審前〕之全套)。新測試 `unit-diaglog`(91)+`unit-urlerr`(459)+`api-diaglog`(25)=575 案;修前(HEAD `WOrmMongodb.mjs` + 新 `getDiag.mjs`)紅:`unit-diaglog` 20 紅/47 綠、`unit-urlerr` 108 紅/111 綠、`api-diaglog` 16 紅/9 綠;外審後新增之案對送審版本(v1)紅 206 案;變異(最終碼)121 個全數殺死、0 存活、0 未套用。細節與證據見 `C:\opensrcOper\dnow\20261028054319\agent-out\mongo-run01-修正報告.md`。
- 外審:terra 額度用盡未審;Argon 額度中途用盡(未成文,留下之探測腳本逐格核對);agy-opus 額度用盡;agy gemini-3.8-flash-high 完成 9 條。屬實之遮罩漏洞形態與修法見 `sgud/exp/experience.md`〈診斷輸出〉。

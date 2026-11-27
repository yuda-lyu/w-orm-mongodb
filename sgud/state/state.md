# 現況(state)

本檔記當前已開發功能之最新狀態(各功能做到哪裡、對應之規則帳本條目與測試檔、已知缺口與待辦、最近一次驗證或發布之版本),只記現況、不寫過程(過程見 `sgud/exp/experience.md`)。藍圖(規則)見 `sgud/rule/rulebook.md`(R-DIAG-01 之細節見 `sgud/rule/rulebook_diag.md`)。

- 套件版本:`package.json` 1.2.42(2026-11-20 第 569 項 omg569 未改 `version`;發布由使用者/主控負責)。相依:`wsemi` ^1.9.70(診斷輸出與遮罩、字串良構檢核、`chkReadable` 可讀性探針之共用模組;2026-11-20 起新引用 `wsemi/src/chkReadable.mjs`、`wsemi/src/isobj.mjs`)、`mongodb` ^7.9.1(非自有套件;2026-11-27 第 679 項由 7.9.0 升 7.9.1,見下〈驅動 7.9.1 調適〉)。
- 本檔於 2026-10-28(mongo-run01)首次建立;更早之功能現況請以 `sgud/rule/rulebook.md` 之 R-FIND-01、R-ORMSTR-01 與〈破壞性變更紀錄〉為準。

## 功能現況

| 功能 | 規則帳本 | 測試檔 | 現況 |
|---|---|---|---|
| 條件(find)系列白名單(`select`、`delAll`、`delAllGfs`、`_findGfs`) | R-FIND-01 | `api-find-whitelist`、`api-find-whitelist-gfs`、`api-basic` | 完成 |
| 字串良構檢核(主鍵、資料字串值與鍵名、`opt.url/db/cl`)、`new MongoClient` 於 `try` 內 | R-ORMSTR-01 | `api-wellformed`、`api-basic`、`api-gfs`、`api-find-whitelist-gfs` | 完成 |
| 基本操作、事件(`change`/`error`)、`autoGenPk`、GridFS、跨行程併發 | (README) | `api-basic`、`api-gfs`、`api-insertbulk-rs` | 完成 |
| **診斷輸出與對外錯誤值之遮罩(遷移至 wsemi 共用模組,mig-mongo)** | R-DIAG-01(依 dspec〈診斷輸出與遮罩〉) | `unit-diagwire`、`unit-diaglog`、`unit-urlerr`、`api-diaglog` | 完成(見下) |
| **連線於操作空檔被中斷,行程不終止(第 209 項,查證結論:不屬實,`src` 未改)** | R-CLIENTERR-01 | `api-clienterr`(+`test/tools/clientErrScenario.mjs`) | 完成(見下) |
| **主鍵「未帶」與「給了而不合格」之分界(2026-11-19 omg492i;wsemi 1.9.69 連動修正)**:只有 `undefined`、`null`、`''` 視為未帶(`autoGenPk` 開自動產生/關整批 reject);給了而非字串(數字、布林、物件、陣列、包裝物件、`Symbol`、`BigInt`、`Proxy` 等)一律 `invalid id: not a string`,不補值、不隨 `autoGenPk` 改變 | R-PKGIVEN-01 | `api-pk-given`(247 案;oro557d3 將 `selectByPk`/`selectByPkGfs` 之不可讀 `pk` 兩案由「回 `null`」改為 reject,各拆為 2 入口)、`api-wellformed`(〈String 包裝物件之 id 應 reject〉) | 完成(見下) |
| **讀取即拋錯(不可讀)之輸入依原失敗通道拒絕,改用 wsemi `chkReadable`(2026-11-20 oro557d、oro557d3,第 557 項)**:6 個收資料容器之入口之 `data`、`insert`/`save` 之 `option` 與 `option.returnList`/`option.autoInsert`、`insertGfs` 之 `u8a`、`selectByPk`/`selectByPkGfs` 之 `pk`、建構 `opt`/`opt.autoGenPk`/`opt.url`/`opt.db`/`opt.cl` 為不可讀者,整批 reject(`error` 事件恰一次)或建構同步 throw,固定詞彙 `invalid <名稱>: must be a readable value`;容器可讀而成員為拋錯之存取器者亦轉固定詞彙(讀取處見帳本);可讀而型別不符者不變(`pk` 為 `5`、包裝物件等仍回 `null`) | R-READABLE-01 | `api-readable`(825 案;含 S9 之 A1~A6 逐代號)、`api-pk-given`(247 案)、`unit-diagwire`(97 案;`new Error(` 計數 3) | 完成(見下;2026-11-20 oro557d4 起複製階段之巢狀不可讀值亦轉固定詞彙,A3、A4) |
| **主鍵只認自有可列舉之資料屬性(2026-11-20 omg569,第 569 項全族)**:列之 `id` 為繼承(原型鏈上,不論值之型別)或自有不可列舉者視為未帶:`insert`/`insertBulk`/`save` 於 `autoGenPk` 開補新 `id`(`Object.defineProperty` 設為自有可列舉資料屬性)、關整批 reject `invalid data[<k>].id, autoGenPk is false`;`del`/`delGfs` 該筆 `ok:0` `invalid id: not a string`,不刪除庫內同值之列/檔案;`insertGfs` 修前即合規 | R-PKOWN-01 | `api-pk-own`(408 案) | 完成(見下) |

### 驅動 7.9.1 調適(2026-11-27,第 679 項,R-DIAG-01)

- 現況:外部依賴 `mongodb` 由 7.9.0 升 7.9.1(`package.json` `^7.9.1`,由主控改好);`src/` **未改**、防護(`diag.err`、`getDiagSecrets`、`mongoHostEcho`)不拆。驅動 7.9.1 對連線字串解析失敗之訊息不再回顯片段(35 種形態全數不含憑證),僅**整數值**(`maxPoolSize`/`heartbeatFrequencyMS` 之負值、`family`)仍回顯;形態對照見帳本 `sgud/rule/rulebook_diag.md`〈驅動版本與回顯〉。
- `test/unit-urlerr.test.mjs` 依驅動新行為改寫為三組(922 案,修改前於 7.9.1 為 288 紅):①真驅動不回顯 37 形態(輸出與驅動原錯誤逐字相同、不含憑證、不過度遮罩);②真驅動整數回顯 8 形態(遮除整數憑證、非憑證原樣);③替身驅動(新增 `test/tools/urlerrLegacy.mjs`,經 `fakeMongo` 之 `ctor` 接縫)重現 7.9.0 之 29 種回顯形態;`urlerrWorker.mjs` 加環境變數 `LEGACY`;`diagMutRun.mjs` 加 `DIAGMUT_TESTS`、`TOOLS` 補 `urlerrLegacy.mjs`。
- 驗證:單檔 922 passing(連跑 4 次);全套(`npm test`,`quiet-run --lock`)6046 passing / 0 failing / 0 pending(7m21s);「拿掉本庫遮罩」之變異於新檔 334 紅(整數回顯組 55、替身組 253、stderr 26),不回顯組 0(設計如此);新測試(7.9.1)與舊測試(7.9.0 鏡像)對既有 53 個變異之殺死名單逐項相同(各 13 殺死、40 存活〔由 `unit-diagwire`/`unit-diaglog` 殺死〕);細節見 `sgud/exp/experience.md`〈驅動 7.9.1 調適〉。
- 已知缺口/待辦:`no-patterns`(拿掉 `mongoHostEcho`)變異於 `unit-urlerr` 新舊兩版皆存活(URL 導出之秘密已涵蓋主機位址項,樣式為備援),未補案;驅動日後再升版時依帳本〈驅動版本與回顯〉步驟重測各形態之回顯。

### R-PKOWN-01 主鍵只認自有可列舉之資料屬性(2026-11-20,omg569,第 569 項)

- 實作(`src/WOrmMongodb.mjs`):`isOwnPk(v)`(`Object.prototype.propertyIsEnumerable.call(v, 'id')`,不呼叫 getter)、`setPk(v, id)`(物件之列一律 `defineProperty`,非物件之列賦值)、`getDelPk(v)`(`get` 取值,有效字串才查 `isOwnPk`,繼承者回 `undefined`)、`procPk`(`id` 為未帶或 `!isOwnPk(v)` → 補值/整批 reject)、`del`/`delGfs` 之取值改 `getDelPk`。判定先取值、值為未帶即短路,只有值為給了才查描述子。站點全集、修前/修後與盤點指令見帳本 R-PKOWN-01。
- 不相容變更(README〈破壞性變更〉、JSDoc、帳本〈破壞性變更紀錄〉第 6 項已同步;`version` 未改):見上表列。
- 已知缺口/待辦(待主控裁示,見帳本 R-PKOWN-01 已知限制):①自有可列舉 `id` 而原型上有 frozen/僅 getter 之同名 `id` 時 `cloneDeep` 拋 `TypeError`(修前即有,`insert`/`insertBulk`/`save`/`del` 整批 reject `invalid data: must be a readable value`,`insertGfs`/`delGfs` 正常),非本規則所引入,未改;②`delGfs` 之 `Proxy` 列僅以 `get` 陷阱虛擬 `id` 者視為未帶。

### R-PKGIVEN-01 主鍵「給了而不合格」(2026-11-19,omg492i)

- 修正:`src/WOrmMongodb.mjs` `procPk` 由 `!isestr(v.id)` 改為 `=== undefined || null || ''`(`v.id` 只取一次);其餘入口(`chkPk`、`del`、`delGfs`、`selectByPk`、`selectByPkGfs`)程式未改,以測試釘住。不相容變更(`insert({ id: 5 })` 由靜默換新 id 寫入改為拒絕;`save` 於 `autoGenPk:false` 對非字串 id 由整批 reject 改為該筆 `ok:0`),README〈破壞性變更〉、JSDoc、帳本 R-PKGIVEN-01 與〈破壞性變更紀錄〉第 4 項已同步;`version` 未改。
- 已知缺口/待辦(待主控裁示):①`id: ''` 於 `autoGenPk:true` 仍視為未帶而自動產生(README 既有行為,`api-basic` 案釘住),是否改為拒絕 `string is empty` 屬另一次不相容變更;②(**已解除**,2026-11-20 oro557d,見下節 R-READABLE-01)資料容器(`data`)為已撤銷或 `Symbol.toStringTag` 拋錯之物件時原視為「無數據」正常結果,現整批 reject `invalid data: must be a readable value`。

### R-READABLE-01 讀取即拋錯(不可讀)之輸入(2026-11-20,oro557d,第 557 項)

- 實作:`src/WOrmMongodb.mjs` 之 `isUnreadable(data)`(`chkReadable(data, { ownKeys: isobj(data), elements: 'first' })` + 陣列 `[0]` 存取器自讀)、`rejectUnreadable(mode, name)`(`error` 事件恰一次、數據參數 `null`,後 reject `ownErr` 固定詞彙)、建構段 `readKey`/`throwUnreadable`;探針只放判斷函數回 `false` 之分支內(6 入口之 `!iseobj(data) && !isearr(data)`、`!isbol(returnList)`、`!isbol(autoInsert)`、`!isbol(autoGenPk)`、`!isu8arr(u8a)`、`selectByPk`/`selectByPkGfs` 之 `!isestr(pk)`、建構 `typeof v === 'string'` 之 else)。站點全集與判準見帳本 R-READABLE-01。
- 不相容變更(README〈破壞性變更〉、JSDoc、帳本〈破壞性變更紀錄〉第 5 項已同步;`version` 未改):`data` 不可讀由「無數據之正常結果」改 reject;`option`/`opt` 不可讀由原生錯誤(或靜默取預設)改固定詞彙;`u8a` 不可讀訊息加 `: must be a readable value`;`selectByPk`/`selectByPkGfs` 之 `pk` 不可讀由回 `null` 改 reject `invalid pk: must be a readable value`(oro557d3)。
- oro557d3(2026-11-20 接續,主控裁定):①`selectByPk`/`selectByPkGfs` 之 `pk` 於 `!isestr(pk)` 分支內 `chkReadable(pk)`(預設,只讀標籤),不可讀者 reject `invalid pk: must be a readable value`(`error` 事件恰一次、數據參數 `null`、不連線),可讀而非字串仍 `null`(`src` 另有 `selectByPk`/`selectByPkGfs` 各 1 處新探針,`chkReadable(` 共 11 處);②存取器核對:建構 `opt` 四鍵、`option.returnList`/`option.autoInsert`、長度為 1 之陣列 `[0]` 之讀取處交件時即為固定詞彙,不需改碼,由 S3、S8 釘住;`opt.logDetail`/`opt.funLog` 存取器維持(wsemi `getDiag`);③前一輪(oro557d2)被終止所留之 `rejectIn`/`chkUnreadable`(存取器維持原例外文字,違反規則四第 2 點更正)已整批還原。
- **oro557d4(2026-11-20,第 557 項全族對齊輪 A1~A6;主控更正規則四第 3 點)**:逐代號實測(探針 724 格,修前 = 本輪開始之工作樹)A1、A2、A5、A6 與頂層之 A4 已合(0 格差異),**A3 不合 → 已改**:①`cloneData` 之 catch 回 `null`(不再 `throw diag.err(err)`),`insert`/`insertBulk`/`save`/`del` 之 `if (data === null) { return rejectUnreadable(<入口>, 'data') }`(4 處);②`insertGfs`:展開(含陣列元素讀取)包 `try` → `mkReadErr('data')`,再 `each(rows)` 掃 `id` 值(`!== undefined/null` 且非字串者 `isUnreadable(id)`)與 `u8a` 值(`chkReadable`)先於逐筆檢核,`u8aOks` 記 `isu8arr` 判定供逐筆檢核沿用(wsemi 1.9.78 以前有效 `u8a` 標籤只讀一次;1.9.79 起以內部槽判定、標籤讀 0 次,「判定一次或兩次」已不可觀察,見帳本 R-READABLE-01 規則句 10);③`delGfs`:`data`/`ids` 之讀取包 `try` → `mkReadErr('data')`,`id` 值不可讀(`chkPk` 回非 `null` 之分支內 `isUnreadable(id)`)整批 reject;④**A4**:`mkReadErr` 登記於 `readErrs`(WeakSet),`emitError` 對其傳 `null`(`insertGfs` 之 `u8a` 不可讀之數據參數由原值改 `null`)。全部走固定詞彙 `invalid data: must be a readable value`、`error` 事件恰一次、不連線、不寫入、不刪除;複製處不分辨原因(原型為 `null` 之 `Date`、50000 層巢狀亦同)。GFS 系只讀實際用到之欄位(`insertGfs`:展開之自有存取器、`id`/`u8a` 之值;`delGfs`:`id`),其餘欄位不被讀取而維持成功;範圍只到複製處(複製之後讀取原型上之存取器所拋者維持外來錯誤診斷出口)。不相容變更(README〈破壞性變更〉、JSDoc、帳本〈破壞性變更紀錄〉第 5 項、R-DIAG-01 S4 已同步;`version` 未改)。
- 已知缺口/待辦(詳見帳本 R-READABLE-01 已知限制):①複製**之後**才讀取之原型上之存取器等(`Object.create({ get id() { throw … } })`)維持外來錯誤診斷出口(經 `outErr` 遮除憑證,`error` 事件數據參數不變;主控 07:5x 裁,不擴大);`id` 為物件而其內部成員不可讀者,doc 4 入口 `invalid data: …`、GFS 兩入口為 `invalid id: not a string`/`ok:0`(無深拷貝階段之自然差異,待主控確認);`insertGfs` 之 `u8a` 為已撤銷之 `Proxy` 之訊息為 `invalid data[<k>].u8a: must be a readable value`(沿用 oro557d 之 V19 詞彙,非 `invalid data: …`,待主控確認是否統一);②`option.autoInsert` 可讀而非布林值之處理不變(**主控已裁維持**);③wsemi `chkReadable` 之 `ownKeys` 讀取範圍缺口(繼承鍵之 receiver 描述子)與讀鍵成本,已併入 wsemi 批 10(不發 issue,主控裁定),列回饋。

### R-CLIENTERR-01 連線空檔中斷(2026-10-31,第 209 項)

- 結論:本套件 `src` 之 2 處 `.on('error'` 皆為 GridFS 串流(Node 串流,驅動不預掛);`MongoClient`、`Connection`、`ConnectionPool`、`Server`、`Monitor`、`Topology`、`ClientSession`、cursor、`GridFSBucket` 皆由驅動於建構時預掛 noop `error` 監聽(7.5.0 與 7.8.0 同),空檔中斷不會使行程終止,**不須自掛**,`src`/README/`version` 未改。逐物件表見帳本。
- 實測(自建 docker 容器,standalone 帶認證與 replica set 各一;每情境獨立子行程;代理切斷):11 函數 × 2 容器 × 每個連線池取用位置之 RST、FIN、`killAllSessions`、對照組(語句進行中被切斷)與 `docker restart`(真實重啟 mongod),共 600 餘案 0 終止(證據在主控證據夾與 `sgud/exp/experience.md`)。
- 新增守護測試:`test/api-clienterr.test.mjs`(driver contract、11 函數 RST/FIN/對照組、`insertBulk` 交易路徑、拿掉 GridFS 串流 `error` 監聽之變異須使行程終止)+ `test/tools/clientErrScenario.mjs`;驅動升版後之第一道防線(驅動不再預掛某物件之監聽時 driver contract 案先紅)。
- 已知缺口/待辦:無須處理之缺陷;注入點為驅動內部檔,升版移位時須改接縫(帳本已知限制 1)。

### R-DIAG-01 診斷輸出與遮罩(2026-10-29,mig-mongo;原 mongo-run01 之自寫 `src/getDiag.mjs` 已刪)

- 實作:`src/WOrmMongodb.mjs` 建構段 `getDiag(opt, { secrets: getDiagSecrets({ urls: [url] }), codes: ['mongoServer'], patterns: ['mongoHostEcho'], safeKeys: ['mode'] })`(wsemi);`ours`/`ownErr`/`cvFind`/`outErr`/`outMsg`/`closeClient`/`cloneData` 為本套件之接縫;`src/` 只有 `WOrmMongodb.mjs`。
- 站點:11 函數之批次 `catch` 皆 `res = outErr(err)`(外來值經 `diag.err`、固定詞彙錯誤原樣);逐筆 `err`(save、del、delGfs)經 `outMsg` → `diag.mask`;`finally` 內關閉連線之外來值經 `diag.err`(`try` 外 `cloneDeep` 之外來值自 2026-11-20 oro557d4 起不再轉出、不經 `diag.err`,改固定詞彙 `invalid data: must be a readable value`,見 R-READABLE-01);`emitChange`/`emitError` 之訂閱函數拋錯 → `diag(…, 'log')`(stdout)。全表見 `sgud/rule/rulebook_diag.md`。
- 對外行為變化(README〈破壞性變更〉):`logDetail` 輸出多標籤且為遮罩副本;含憑證之對外錯誤值為同類別副本(不再原地改寫),擴及全部外來值;單獨帳號不遮(`proxyUsername` 之值原樣、`CORP/帳號` → `***/***`);固定詞彙錯誤不遮。resolve 內容與事件 payload 不變(`test/tools/diagGolden.json` 對照 HEAD)。
- 已知缺口/待辦:
  1. 摘要 `errType` 對驅動錯誤類別恆為 `Error`(未宣告 `types`;待主控裁示是否宣告驅動類別名,不影響遮罩)。
  2. P8:`getDiagBriefErr` 不需另讀 `codeName`(真驅動 24 種錯誤形態實測,證據在主控證據夾 `agent-out/mig-mongo-p8-證據.json`)。
  3. 驅動自身日誌(`MONGODB_LOG_*`、`mongodbLogPath`)與 `process.emitWarning` 不經出口(預設關閉;文件化,不改)。
  4. `dist/`、`docs/` 未重新建置(發布流程自動產製);已於暫存目錄打包驗證:UMD 工廠相依仍只有 `mongodb`、`stream`(`require("util")` 來自 lodash,修前同),UMD +33.8 KB。
  5. 發布與版號由主控/使用者決定;`package-lock.json` 因 Verdaccio 不寫 `resolved` 而有大量噪音 diff(見 experience)。
  6. 下游:凡以含憑證之 reject 做 `===` 身分比較、或依賴 `logDetail` 裸輸出格式者受影響;依賴本套件之 `w-orm-*` 上層(如 w-serv-orm 之 mongo 後端)請留意 reject 副本與單獨帳號不遮。

## 最近一次驗證

- 2026-11-26 omg492k(wsemi 1.9.79 型別判斷改內部槽判定之下游連動,排程第 492 項批 10;未發布,`src`/`package.json`/`version` 未改):`api-readable` S5 〈標籤僅讀一次〉案於 wsemi 1.9.79 讀 0 次而紅(全庫連動跟跑 5592 綠/1 紅),改寫為 2 案(覆寫標籤之真 `Uint8Array` 標籤存取器讀 0 次、照常寫入、取回位元組相同)並於 S4 加偽造標籤之一般物件被拒 1 案;全套 `npm test`(`quiet-run --lock`)**5595 passing / 0 failing / 0 pending**(11m05s,exit 0);eslint 對 `src/WOrmMongodb.mjs`、`test/api-readable.test.mjs` 0 錯誤;`private-guard` CLEAN。鑑別力(鏡像根植入,不動 `src`):把 wsemi `isu8arr` 退回讀標籤,新案 3 案全紅(讀 1 次/拒收覆寫標籤之真 `Uint8Array`/收下偽造標籤之物件)、舊案綠(讀 1 次)、疊「逐筆檢核重判」則舊案紅(讀 2 次);「重判」變異搭 1.9.79 對 4 檔 3638 案全綠(等價變異,原意②不可觀察);「判定恆 `true`」變異 S4 14 案紅。證據在主控任務 `20261116102625` 之 `agent-out/omg492k-修正報告.md`。
- 已知缺口/待辦(待主控裁示):`src/WOrmMongodb.mjs` `insertGfs` 內一則註解(`u8aOks` 處)仍寫「u8a之標籤僅讀一次, 同修改前」,wsemi 1.9.79 起已不成立(程式行為無誤、`u8aOks` 沿用判定結果屬無觀察差異之寫法);本輪不得改 `src`,待下一次改 `src` 時更正註解。

- 2026-11-20 第 569 項 omg569(主鍵只認自有可列舉之資料屬性,未發布;`version` 未改):全套 `npm test`(`quiet-run --lock`)**5593 passing / 0 failing / 0 pending**(13m,exit 0;較 oro557d4 之 5185 增 408 案,皆為 `api-pk-own`)。`api-pk-own`(408 案,單檔約 2 分鐘)修前(`git archive HEAD src`)142 紅/266 綠、修後 408 綠;探針 288 格(入口 6 × 形狀 12 × seed 2 × `autoGenPk` 2)修前/修後 120 格不同、168 格相同;變異 22 項(含 M18 雙重)中 20 項轉紅、2 項等價存活(`insertGfs` 兩道防線之一單獨移除);eslint 對 `src/WOrmMongodb.mjs`、`test/api-pk-own.test.mjs` 0 錯誤;`audit-own-pkg` 必修 0、待判讀 0;sonnet 唯讀複審 1 項採納(`setPk` 不查描述子)、測試補強 3 處、規則外既有缺陷 1 項(帳本 R-PKOWN-01 已知限制 4,待主控裁示)(主控任務 `20261120123046` 之 `agent-out/omg569-修正報告.md`、`omg569-evidence/`)。

- 2026-11-20 第 557 項 oro557d4(全族對齊輪 A1~A6,未發布;`version` 未改):全套 `npm test`(`quiet-run --lock`)**5185 passing / 0 failing / 0 pending**(12m22s,exit 0;較 oro557d3 之 4808 增 377 案:`api-readable` 452 → 825、`unit-diagwire` 93 → 97、`api-pk-given` 247 不變)。修前(oro557d3 交件版 `src` + 本輪 3 個測試檔)1169 案 859 綠/310 紅、修後 1169 綠;探針 724 格修前/修後 316 格不同(皆 A3、A4)、408 格相同(A1、A2、A5、A6 與 A4 頂層修前已合)。變異新增 21 項(A3 15、A4 4、`u8a` 標籤 2)、前兩輪 51 項重跑、`diagMutRun` 53 項,共 125 項全轉紅;1 項等價變異預期存活。eslint 對 `src/WOrmMongodb.mjs`、`test/api-readable.test.mjs`、`test/api-pk-given.test.mjs` 0 錯誤(`unit-diagwire` 16、`diagMutRun` 4 為 HEAD 既有);`audit-own-pkg` 必修 0、待判讀 0;sonnet 唯讀複審 1 中(`u8a` 標籤多讀,已修)1 工具(`diagMutRun` 變異失效,已修)3 註解(已修)(主控任務 `20261120043625` 之 `agent-out/oro557d4-修正報告.md`、`oro557d4-evidence/`)。

- 2026-11-20 第 557 項 oro557d3(接續修正,未發布;`version` 未改):全套 `npm test`(`quiet-run --lock`)**4808 passing / 0 failing / 0 pending**(11m52s,exit 0;較 oro557d 之 4726 增 82 案:`api-readable` 372 → 452〔S6 改寫、S7 +2、S8 +29〕、`api-pk-given` 245 → 247)。首次全套 4804 綠/2 紅(`api-pk-given` 原釘住不可讀 `pk` 回 `null`,已改釘 reject)。`api-readable` 修前(oro557d 交件時之 `src`)439 綠/13 紅、修後 452 綠;`api-pk-given` 修前 243 綠/4 紅、修後 247 綠;對 oro557d2 半成品跑新測試 44 紅。變異新增 18 項(`pk` reject 10、存取器 6、`chkOrmStr` 拆出 2)全轉紅,oro557d 既有 33 項重跑全轉紅,0 存活;行為表 350 格修前/修後 4 格不同(皆 `pk`)(主控任務 `20261120043625` 之 `agent-out/oro557d3-修正報告.md`、`oro557d3-evidence/`)。eslint 對 `src/WOrmMongodb.mjs` 與 `test/api-readable.test.mjs` 0 錯誤;`audit-own-pkg` 必修 0、待判讀 0。

- 2026-11-20 第 557 項 oro557d(未發布;`version` 未改):全套 `npm test`(`quiet-run --lock`)**4726 passing / 0 failing / 0 pending**(11m21s,exit 0;較 4354 增 372 案,皆為 `api-readable`)。`api-readable`(372 案,單檔約 50 秒)修前(`git archive HEAD src`)147 紅/225 綠(綠者為對照案)、修後 372 綠;變異 33 項(規則二 25、規則一 8)全轉紅、0 存活;行為表 320 格修前/修後 37 格不同(主控任務 `20261120043625` 之 `agent-out/oro557d-修正報告.md`、`oro557d-evidence/`)。eslint 對 `src/WOrmMongodb.mjs` 與 `test/api-readable.test.mjs` 0 錯誤。獨立複審(sonnet 唯讀)1 中已修、4 低記入帳本已知限制。

- 2026-10-31 第 209 項(未發布;`version` 未改):全套 `npm test`(`quiet-run --lock`)**4109 passing / 0 failing**(4m48s,exit 0;較 mig-mongo 之 4093 增 16 案,皆為 `api-clienterr`)。`api-clienterr` 16 案:driver contract 2、11 函數 standalone 各 1、`insertBulk` replica set 交易路徑 1、變異 2(拿掉上傳/下載串流 `error` 監聽,行程須終止)。探測(非常駐測試,證據在主控證據夾 `agent-out/mongo-evidence/`):11 函數 × standalone/replica set × 每個連線池取用位置之 RST 89+FIN 89+`killAllSessions` 84(序列)+語句進行中 53+`docker restart` 44,共 359 案 0 行程終止;另 1 案(並行時 `killAllSessions` 互擾種子寫入)判為情境互擾。`unit-diagwire` 之 `DISPOSITION` 表因 wsemi 1.9.33 新增 `A11`、`C14`、`U22` 補 n/a 後全綠。
- 2026-10-29 mig-mongo(未發布;發布版本由主控決定):全套 `npm test`(`quiet-run --lock`)**4093 passing / 0 failing / 0 pending**(5m,exit 0)。診斷輸出相關:`unit-diagwire` 93 + `unit-diaglog` 24 + `unit-urlerr` 471 + `api-diaglog` 25(自建 docker 容器)。修前紅(以 `git archive HEAD src` 之舊碼跑新三個單元檔):588 案中 88 紅(其餘為「固定詞彙原樣」等守護案,修前綠屬正常);變異 53 個全數殺死、0 存活、0 未套用。細節與證據見 主控任務 `20261029002013` 之 `agent-out/mig-mongo-修正報告.md`。
- 前一次(2026-10-28 mongo-run01,自寫 `getDiag.mjs` 版):全套 4055 passing。

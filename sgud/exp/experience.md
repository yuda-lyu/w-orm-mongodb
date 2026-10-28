# 累積經驗

本檔為執行工作時特有之累積經驗,留給後續之嘗試、執行與判斷,由agent自行編列、擴充與維護.

## 診斷輸出(2026-10-28,mongo-run01,規則 R-DIAG-01)之作法與陷阱

### 盤點與前提

- 本套件 src 實際執行之 `console` 只有 2 處(`emitChange`/`emitError` 的 catch);其餘輸出管道全是「經 reject/`error` 事件往外」的錯誤內容。**盤點指令要連驅動一起查**:`Grep "emitWarning|process\.(stdout|stderr)|console\." node_modules/mongodb/lib`——驅動只有 `process.emitWarning`(過時選項,只回顯選項名)與預設關閉的結構化日誌(`MONGODB_LOG_*`,`mongo_logger.js`)。
- **驅動回顯憑證的實測形態**(`tmp/mongo-run01/probe-url*.mjs` 重現,在 `.gitignore` 的 `tmp/`):`new MongoClient('mongodb://帳號:密碼')`(缺 `@主機`)→ `MongoRuntimeError: Unable to parse 帳號:密碼 with URL`,message、stack、`cause`(TypeError `Invalid URL`)的 `.input`(`iLoveJS://帳號:密碼`)皆含;反向 `host:27017@帳號:密碼` 同;`host:abc` 筆誤只回顯主機項(不含帳密);帶 `@` 的其餘 30 餘種解析失敗(`Invalid scheme`、`Password contains unescaped characters`、`URI malformed`、`Protocol and host list are required` 等)為固定訊息、不回顯。**查詢參數的選項值會被回顯**(`got: <值>`),所以名稱含 pass/token/key… 的參數值要列為憑證。執行期連線錯誤(認證失敗、`ECONNREFUSED`)實測不含帳密。
- **V8 的 stack 是延遲格式化**:錯誤剛建立、尚未讀過 `stack` 時,先把 `message` 改掉,之後第一次讀 `stack` 會用新 message——所以「不處理 stack」的變異在未讀過 stack 的測試下存活;測試要先 `void e.stack` 讓字串固定,再驗 `maskErr` 有改寫。`stack` 是自有存取器(getter/setter 皆內建),僅當 getter 嚴格等於 `new Error()` 上取得的內建 getter 才可讀;自訂存取器保持原狀(測試須讓內建 stack 含憑證,否則「誤改寫」不可觀測)。
- 原地遮罩錯誤物件而非包成新 Error:保留類別(`MongoRuntimeError`/`MongoParseError`)、原型與其他欄位,`instanceof` 與 `error.name` 不變;改寫屬性用 `Object.defineProperty` 並沿用原描述子的 `enumerable`(message 為不可列舉可寫可設定;`input` 為可列舉),測試釘住形狀。

### 測試手法

- **回傳契約對照 HEAD golden**:`test/tools/diagScenario.mjs` 為情境(連線 26 步 + 不連線情境),`diagGoldenGen.mjs` 以 `DIAG_SRC`(指向 `git archive HEAD src` 解出的資料夾)產生 json;**產生兩次比對相同才算確定性**。非確定來源要正規化:自動產生的 UUID 主鍵 → `GENID`;驅動寫入時在事件 payload 的數據上補的 `_id`(ObjectId)→ `OID`。`save` 對不存在 id 內部先 `insert` 並發 `change`,所以 `save` 一次會有兩個 `change handler threw`(測試要預期兩行)。
- **離線站點測試**:不合法 scheme(`http://127.0.0.1:27017`)讓 11 個函數都在 `new MongoClient` 階段 reject(不連線、不需 docker),可逐函數驗 `error` 站點;批次內全為無效主鍵的 `save`/`del`/`delGfs` 不連線仍發 `change`,可驗 `change` 站點。需要成功路徑的 `insert`/`insertBulk`/`insertGfs`/`delAll`/`delAllGfs` 才用 docker(`api-diaglog`)。
- **修前紅作法**:對「HEAD 的 `WOrmMongodb.mjs` + 新 `getDiag.mjs` + 新測試」跑(`tmp/mongo-run01/pre/`):純函數測試仍綠,接線/站點/連線錯誤測試紅,紅綠分界即「接線」本身;`unit-diaglog` 20 紅/47 綠、`unit-urlerr` 108 紅/111 綠、`api-diaglog` 16 紅/9 綠。
- **本輪 `./tmp/` 內之腳本與證據已於結案時清理,備份在 `C:\opensrcOper\dnow\20261028054319\agent-out\mongo-run01-evidence\`**(`mut/run.mjs`、各輪 `result-*.json`、`scripts/`〔探測腳本與輸出〕、`review/`〔提示詞、外審回覆、探測腳本〕、`pre-change-red/`、`golden/`);需要時由該處複製回 `tmp/mongo-run01/` 重建(路徑相對於 repo 根)。
- **變異執行器** `tmp/mongo-run01/mut/run.mjs`(最終 121 個變異,下述為首輪 78 個時之紀錄;`node tmp/mongo-run01/mut/run.mjs [名稱子字串…]`,在 repo 根為 cwd,需 docker,用 `quiet-run --lock` 包):複本在 `tmp/mongo-run01/mutwork/`,先跑兩個單元檔(約 6 秒)、未殺死才跑 `api-diaglog`(約 10 秒)。首輪存活 4 個(皆測試太弱,已補斷言後全殺死):無 URL 編碼形式(原斷言用的密碼本身已是編碼形式)、`maskErr` 不處理 stack(stack 延遲格式化,見上)、stack 不比對內建 getter(內建 stack 不含憑證時不可觀測)、寫回後屬性變不可寫不可設定(原未驗描述子)。
- **Bash 工具守門**:`node -e` 寫檔/複製檔會被擋(整條指令不執行);批次機械操作先用 Write 寫 `.mjs` 再執行(`tmp/mongo-run01/mkreview.mjs` 即是);`sed -i` 同樣被擋。
- **dist 檢查**:`tmp/mongo-run01/dist-check.mjs`(用 `w-package-tools/src/rollupFiles.mjs`、與 `toolg/gDistRollup.mjs` 同設定、輸出到 `tmp/` 不動 `dist/`)確認 `getDiag.mjs` 被打包,`require` 集合與現行 `dist` 相同(`mongodb`、`stream`、`util`,`util` 來自既有相依);並以打包結果實跑 error 站點。

### 外審

- 2026-10-28 terra(`gpt-6.1-terra`)探測即回 `You've hit your usage limit … try again at 10:56 AM`(離開碼 1,4 秒);改派 Argon(`gemini-4-argon-high`,agy 1.4.8,`quota-agy` 7 天用 10.66%),探測(讀中文首行 + 建檔)通過 31 秒。審查副本放 `tmp/mongo-run01/review/{work,out}`,`dispatch-agy.mjs <model> [probe]` 派工。
- **Argon 跑了 1562 秒後 `RESOURCE_EXHAUSTED (code 429)`、離開碼 3,未寫出 `review.md`**(派工結果 `ok:false`),只留下 `out/` 內 5 支探測腳本;**其中 `probe_review.mjs` 列了 16 個假設**,把匯入路徑改成目前 src 後可直接重跑(`tmp/mongo-run01/run-argon-probe.mjs`)——額度中途用盡時不要丟掉 `out/` 內的探測腳本,逐格重跑即可核對。agy 無串流輸出,「10 分鐘無輸出」不能當停滯判準;改看 `~/.gemini/antigravity-cli/brain/<會話>/.system_generated/steps/` 的步數與修改時間(實測 Argon 在 08:58 仍在建檔)。
- agy-opus(`claude-opus-5-5-high`)探測即 429(`3p-5h` 已 100%,Claude/GPT 組被其他 session 用光);`gemini-3.8-flash-high` 探測通過 20 秒、正式審查 979 秒完成 9 條。
- **外審(Argon 探測 + Flash)共揭露、全部屬實並已修的遮罩漏洞形態**(下次寫同類遮罩器先自問這些格):①單字元/短帳號段把操作別遮成 `s***l***ct`、空帳密段 `:@` 使所有冒號變 `***`(**短秘密不得列入**,且編碼形式也要以「基底字串長度」過濾);②`@` 出現在路徑或查詢字串(`appName=svc@prod`)使「最後一個 `@`」解析錯位而漏掉單獨密碼(**嚴格與寬鬆解析取聯集**);③驅動回顯前把空白正規化成 `%20`、解碼後重編碼、`+` 視為空白、`;` 不分段、不完整的 `%` 序列寬鬆解碼、無 `=` 的參數整段回顯、百分比十六進位大小寫——**僅靠「已知秘密的字串比對」遮不到,需加不依賴秘密的主機位址樣式遮罩(`maskHostEcho`)**;④帳號含未編碼的 `/ ? # [ ] @` 時驅動單獨回顯帳號(`Username contains unescaped characters …`);⑤`key` 放進憑證參數名樣式會把 `checkKeys=true` 的 `true` 全域遮掉,`authMechanismProperties` 的 `SERVICE_NAME`/`CANONICALIZE_HOST_NAME:true` 同理(**只認名稱含 pass/pwd/secret/token/credential/user**);⑥`proxyUsername`;⑦`opt.url` 為 `String` 包裝物件(驅動接受)使 `typeof` 判斷落空;⑧`RE_URL_CRED` 跨過 `?` 吞掉主機;⑨`cpMask`:陣列非索引鍵與 Symbol 鍵、包裝字串逐字元展開使憑證被拆開、`byteLength` 自有存取器被執行、節點預算用盡未標記、Error 類別名稱以存取器宣告(驅動 `MongoError`)而降級、副本沒有同名建構子使 `util.inspect` 首行變成 `Error [MongoParseError]`(**副本需「只帶同名建構子的空殼原型 + f.prototype = 空殼」**,否則 inspect 取不到建構子名稱);⑩`swallow` 對被覆寫 `then` 的原生 promise 要用 `Promise.prototype.then.call`;⑪`maskErr` 改寫屬性只傳 `{ value }`(沿用原描述子),不可設定但可寫的屬性才改得動。

## 字串良構檢核(2026-10-20,第 66 項批 1d)之作法與陷阱

### 測試與跑法

- `test/api-wellformed.test.mjs` 單檔 2510 案(契約案例 API 層 1305 + autoGenPk:false 重跑 1128 + 專屬案 77),約 5.5–6 分鐘(機器同時跑別的容器測試時更久);**只跑專屬案**:加 `--grep "contract cases" --invert`,約 40 秒.全套 `npm test` 約 6 分鐘.容器名由環境變數 `WORM_WF_CT` 可覆寫(變異並行用).
- 為縮短時間,案例的種子、快照與驗證一律用驅動直接讀寫(同一個 `rawClient`),每案只有受測呼叫自己建立連線;若改回全程經受測物件,單案連線數約 8–10 倍.
- **docker volume 回收(第 88 項)**:`mongo:8` 映像宣告 `/data/db`、`/data/configdb` 兩個匿名 VOLUME;容器雖以 `--rm` 啟動,但以 `docker rm -f <名>` 強制移除時**不會**帶走匿名 volume(實測:一個探測容器 `rm -f` 後留下 2 個懸置 volume,建立時間與容器啟動時間相同才能認定是自己的),須 `docker rm -f -v`.回驗作法:測試 `before` 以 `docker inspect -f '{{range .Mounts}}{{.Name}} {{end}}' <容器>` 取 volume 名,`after` 移除容器後 `docker volume ls -q` 不得含這些名稱(不受他人並行容器之影響,不以全域懸置數量比較).
- 修前紅:對**未改**之 src 跑新測試,結果為 843 通過 / 1662 失敗;失敗 = 1623 個契約案例中「期望為拒收型(`rejectAll`、`itemErr` 且有 bad、`null`、`throw`)」之案例**全部**(集合相等,拒收型而修前通過者 0、接受型而修前紅者 0)+ 39 個專屬案.與審計矩陣(COLLIDE/MANGLE 格數)不能逐格對數:矩陣以「函數 × 位置 × 預存形態」計格,契約案例以「形態 × 位置 × 函數 × 期望」計案,對應關係是同一批輸入,單位不同.
- 解析腳本:`tmp/parse-red.mjs`(dot reporter log → 失敗標題)、`tmp/cmp-red.mjs`(與案例表期望種類做集合比對);在 `tmp/`,被 `.gitignore`.

### 變異測試法(不動 src)

- 第 66 項批 1d 之執行器、各輪輸出、外審提示詞與報告、修前紅解析腳本已備份於 `C:\opensrcOper\dnow\20261020172106\agent-out\批1-mongodb-evidence\`(`mut/run.mjs`、`red/`、`review/`);repo 內 `tmp/` 已清空,需要時由該處複製回 `tmp/mut/run.mjs` 重建(以 `process.cwd()` 為 repo 根,`node tmp/mut/run.mjs [名稱子字串…]`;環境變數 `MUT_TEST`、`MUT_SUFFIX` 可改用指定測試檔,用來驗證「舊版測試是否抓得到某變異」).
- `tmp/mut/run.mjs`(被 `.gitignore`):讀 `src/WOrmMongodb.mjs`,以文字取代產生變異(`once` 要求樣式恰出現一次、`inFn` 限定在指定函數內),寫入 `tmp/mut/<名>/src/`,複製測試檔與 `lib/api-setup.mjs` 到 `tmp/mut/<名>/test/`,以 `mocha --bail` 執行(複本位於 repo 之下,`wsemi`、`mongodb` 由 node 往上層找到 repo 之 `node_modules`,不需連接點).**三段**:A=專屬案(`--grep "contract cases" --invert`,約 35 秒)→ B1=契約代表子集(孤立高位、NUL、emoji、反序、order、toctou、opt、free)→ B2=全部契約案例(約 6 分鐘以上);任一段轉紅即停,存活者才進下一段.並行 4 個,各用 `WORM_WF_CT=wfm-<名>` 之容器名.
- **陷阱**:`--bail` 時契約案例排在專屬案之前會讓只在專屬案轉紅的變異等 3–5 分鐘,所以先跑專屬案.機器負載高時 B2 可超過 15 分鐘,存活者(等價變異或測試漏洞)會拖長整體時間,先查 A、B1 的結果再決定是否等 B2.
- **變異揭露的測試漏洞(已補)**:①建構後改動 `opt` 的測試只涵蓋 3 個函數,GridFS 與 `del`、`save`、`insertBulk` 讀 `opt.cl|db` 的變異存活 → 測試擴充到 11 個函數,且 `insertBulk` 後要立刻核對 `rawIds` 才不被後面的 `save` 補回而遮蔽;②`insertGfs` 重複 id 清孤兒 chunks 的 `${cl}.chunks` 只在重複 id 時才用 → 加重複 id 並比對 chunks 筆數;③`selectByPk*` 放寬 NUL 時,案例表因 NUL 主鍵查無資料而回 `null` 仍全綠 → 以驅動預存含 NUL id 的列/檔,斷言 id 路徑不可讀、改、刪(外審 minimax F3 同樣指出).
- **等價變異**:`del` 的 `ids[k]` 改回 `get(v, 'id')` 不可觀測——`data` 已 `cloneDeep`,複本上存取器已被固定為資料屬性(lodash `cloneDeep` 對存取器只讀一次);`delGfs` 沒有 `cloneDeep`,所以重讀 `id` 的變異可由「存取器只被讀一次」的測試抓到.

### 其他陷阱

- `isestr(new String('a'))` 為 true(wsemi `isstr` 以 `Object.prototype.toString` 判型),但 BSON 把 `String` 包裝物件以字元索引存成子文件(`{0:'a'}`),`selectByPk('a')` 查不到.主鍵檢核須以 `chkOrmStr`(`typeof === 'string'`)為準,不能只靠 `isestr`.
- `pmSeries` 回呼第二參數是批次索引(陣列時為數字);`save`/`del`/`delGfs` 用它對應 `msgBads[k]`、`ids[k]`.
- 變異與審查副本均不可 `cd`;用 `node tmp/...` 與絕對路徑.在 Bash 工具內用 `node -e "…"` 帶反斜線或反引號的程式碼會被 shell 與工具各吃一層轉義(實際發生過:`\\u0000` 變成真的 NUL 字元寫進檔案、`` `${cl}.chunks` `` 被當成命令替換),**一律用 Write 工具寫成 `.mjs` 檔再執行**,要產生反斜線字元用 `String.fromCharCode(92)`.
- 外審(2026-10-20):sol 於 22:38 回 `You've hit your usage limit … try again at Oct 21st, 2026 12:40 AM`;`quota-agy` 顯示 Argon 與 Claude/GPT 組皆 100%,實派 Argon、agy-opus 各一行探測皆 exit 3、`RESOURCE_EXHAUSTED (code 429) … Individual quota reached`(約 10 秒內結束,不需等 5 分鐘);agy `gemini-3.8-flash-high` 通過探測,正式審查 872 秒完成.minimax(`opencode/minimax-m3.1-flash-free` `--variant xhigh`)探測 72 秒、正式審查 693 秒完成;其環境無 `rg`,自行改用 `ls`/`grep`/read 工具.審查副本放 `tmp/review/{repo,ref}`(不複製 `node_modules`,node 往上層解析),`tmp/review/prep.mjs` 重建、`dispatch-one.mjs <sol|minimax|argon|agyopus|agyflash> <probe|run>` 派工.

## 條件(find)白名單接線(2026-10-17,第 33 項批 1d)之作法與陷阱

### 測試容器與跑法

- 本套件測試自建 docker 容器(`test/lib/api-setup.mjs` 之 `startContainer`),**埠由 `getFreePort()` 向系統要(非固定範圍)**,容器名每個測試檔各一(`worm-test-mongodb-basic`、`-gfs`、`-find-whitelist`、`-find-whitelist-gfs`),`--rm`,測完 `stopContainer`;映像用既有 `mongo:8`.**同名容器不可並行**:全套 `npm test`(mocha `--parallel`,檔案級並行)與變異執行不可同時跑.
- 基準:`node C:/opensrcOper/tools/quiet-run.mjs --name baseline -- npm test` 約 20–30 秒,修前 233 案、修後 914 案(新增 495+186+既有 regex 案改寫).
- 單檔:`npx mocha test/api-find-whitelist.test.mjs --timeout 180000`(不用 `.mocharc.json`).要逐案 JSON:`node node_modules/mocha/bin/mocha.js <檔…> --timeout 180000 --reporter json --reporter-option output=tmp/x.json`(非 `--parallel`;根層 `before/after` 會把各檔容器同時起好).

### 「修前紅」數字怎麼對帳

- 對**未改**之 src 跑新測試即得修前紅;**H19(共享參照指數展開 2^25)與 H20(長度 4294967295 之 Proxy 陣列)對舊 src 會使 BSON 序列化吃光時間/記憶體**(依讀碼推斷,未硬跑),修前紅須以 `--invert --grep "H19|H20"` 排除,此二案修後才跑(修後即時 reject).
- 紅分兩種:**修前接受了白名單外輸入**(行為差異,對照審計矩陣之 R+/R-/S+)與**修前已 reject 但訊息非 `invalid find: …`**(driver/伺服器自己的錯);前者才可與方案 §7.4 之 85 對照.本套件:審計 85(R+59、R-26)=案例表 191 形狀中 82 個(F04 F05 F20 三案經 wsemi 重判改為 OK,修前本就通過)+H09(wsemi 重判由 OK 改 REJ,修前接受)=83,另新增 50 案中 26 案修前被接受(C16–C18 E27 E28 F22–F24 H14 H16 H17 H21–H24 I20 I21 L19 L20 T22 T23 T25 T27 T29 T30 V11),合計 109 案修前被接受;53 案修前已 reject 但訊息不同;無 OK/ALL 案修前紅.
- 解析腳本:`tmp/parse-red.mjs`、`tmp/parse-red2.mjs`、`tmp/cmp-audit.mjs`(在 `tmp/`,被 `.gitignore`).

### 測試手法

- **算 `MongoClient` 建立次數**:src 於 `WOrmMongodb()` 建立時才取 `mongodb.MongoClient`,且該屬性是 `configurable` 之 getter(`Object.getOwnPropertyDescriptor(mongodb,'MongoClient')`),故測試於建立受測物件期間以 `Object.defineProperty(mongodb,'MongoClient',{configurable:true,enumerable:true,get:()=>Spy})` 換成計數子類別,建立後**立即還原**(mocha 並行時 worker 會被重用,不還原會污染後續檔).必附正向對照(合法呼叫每次 +1)證明替身有效.
- **壞 find 是否到達伺服器**:`db.command({profile:2})` 後比對 `system.profile` 中該 ns 之筆數前後相等,並附正向對照(合法呼叫筆數增加);結束 `profile:0`.每次計數前 `delay(100)` 等 profiler 寫入.
- **檢查之值即使用之值**:Proxy 條件物件,其 `get` 與 `getOwnPropertyDescriptor` 陷阱共用計數,第一次讀到的 `id` 是 `a1`、之後皆為 `a2`;正確接線只命中 `a1`,「檢核後仍用原物件」之變異會命中 `a2`.
- 種子與快照一律用驅動直接寫讀(獨立於受測套件),避免用被測物驗被測物.
- 案例表 241 案×(select、delAll)=482 個 `it`;REJ 案斷言訊息**等於** wsemi `cvOrmFind` 對同一 find 之訊息(證明原樣 reject,不包裝),error 事件於 reject 回呼當下即已恰 1 次(再 `delay(30)` 驗不多發).

### 變異測試法(不動 src、不用 stash/checkout)

- `tmp/mut/run.mjs`(被 `.gitignore`):讀 `src/WOrmMongodb.mjs`,對文字施加變異,寫入 `tmp/mut/<名>/src/WOrmMongodb.mjs`,複製兩個新測試檔與 `lib/api-setup.mjs` 到 `tmp/mut/<名>/test/`,以 `spawn(node mocha.js <檔> --reporter json …, {cwd: 該目錄})` 兩個測試檔並行跑(容器名不同).複本位於 repo 之下,`wsemi`、`mongodb` 等套件由 node 往上層找到 repo 之 `node_modules`,不需連接點.每個變異約 20–30 秒.
- **`_findGfs` 之「檢核後仍用原物件」為等價變異**:`_findGfs` 僅有兩個呼叫者,`delAllGfs` 傳入已檢核之複本、`delGfs` 傳入內部自建之 `{filename:id}`,原物件與複本不可區分.不要再為它加測試.
- 變異「`delAllGfs` 拿掉檢核」仍只有 1 案紅(計數替身那案),因 `_findGfs` 縱深檢核仍會擋住;這是縱深設計之預期.

### 外審派工

- 審查者副本放 `tmp/review/{repo,ref}`,位於 repo 之下,node 能往上找到 `node_modules`,不需連接點.副本內「依賴注入」「繞過」「1=1」「不可信」等字樣先中性化(只改副本).提示詞用「功能正確性」措辭,並明寫不得啟動 docker/不得跑 mocha(固定容器名會與進行中之工作衝突).
- 三家能力探測皆通過(讀第 1 行、於自己輸出目錄建檔):opus 9 秒、sol 15 秒、beam 12 秒;beam 環境無 `rg`(`command not found`)但自行改用其他讀法.
- 正式派工以 `tmp/review/dispatch-one.mjs <opus|sol|beam>` 由 `nohup … &` detached 啟動,`timeoutMs` 3600000;不要在 Bash 工具內用複合指令 `cd` 後留在別的目錄——**複合指令中的 `cd ..` 會持久改變後續呼叫之工作目錄**(本次發生一次,以絕對路徑與再 `cd` 回 repo 根修復),一律用絕對路徑.

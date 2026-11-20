# 規則帳本

本檔為套件設計與開發階段之規則帳本,為要求程式碼須長成什麼樣,或由規格產出之測試(項目/說明/流程)有哪些,包含軸、單一擁有者、已知限制、破壞性變更紀錄,以及對應是哪些測試檔案或指令等,由agent自行編列、擴充與維護.

## 〔條件(find)之支援範圍〕(主控 2026-10-16 依使用者交辦寫入;2026-10-17 第 33 項實作後改寫)

- 系列盤點與處置原則:`C:\opensrcOper\dspec\w-orm系列條件語法支援盤點.md`(〈一之一〉頂層語意、〈一之三〉白名單與定案細節).
- 轉譯路徑:**不轉譯**.`select`、`delAll`、`delAllGfs`、`_findGfs` 先以 wsemi 之 `cvOrmFind` 檢核並取得全新 null 原型複本(R-FIND-01),再以 `collection.find(複本)`、`collection.deleteMany(複本)`、`bucket.find(複本)` 交 MongoDB driver 7.5.0.
- 支援範圍:**系列條件白名單**(欄位等值純量、`$eq $ne $gt $gte $lt $lte`、`$in $nin`、文件層 `$and $or`;細節見〈系列條件白名單〉).MongoDB 伺服器之其餘運算子(`$regex $options $exists $not $nor $where $expr $text $jsonSchema $comment $type $mod $elemMatch $size $all` 與地理空間等)、點路徑、欄位層 `$and/$or`、RegExp 值、陣列值等**一律不支援**,於到達伺服器之前 reject.
- 不支援之處置:本套件於入口 reject(整批性錯誤,`invalid find: <原因> at [<路徑>]`),**不再**交由伺服器判定.
- 語意:伺服器原生語意(MongoDB 式).`$ne`(比較值非 null)/`$nin` 會命中欄位為 null 或缺欄之數據,`$ne:null` 僅命中欄位存在且非 null 者;欄位值以 BSON 型別比對(`{age:'20'}` 不命中數字 20);字串區分大小寫;陣列欄位之元素包含仍為伺服器行為,但因白名單不收陣列值/點路徑,實務上僅限純量等值對陣列欄元素之命中.可攜寫法:排除 NULL `{$and:[{f:{$ne:null}},{f:{$ne:x}}]}`、含 NULL `{$or:[{f:null},{f:{$ne:x}}]}`.
- **非缺陷聲明**:本套件之值語意差異(NULL、大小寫、型別比對)屬設計.**不得**僅因「其他 w-orm 套件之語意不同」而視為缺陷、撰寫建議書或自行改變;改變語意須主控同意.白名單外之輸入是否被拒收,則屬系列最低要求(見下).
- **系列最低要求(違反者才屬缺陷)**:①同一 find 於 select 命中之數據即 delAll 刪除之數據;②不支援之運算子與無法轉譯之值必須 reject,不得靜默忽略、改變語意或擴大刪除範圍;③不得因條件清單恰為空或值為 `undefined` 而刪全表.

## 〔delAll 與 find 之頂層語意〕(主控 2026-10-16 依使用者裁示寫入;全系列規格)

- **`delAll()` 不給條件就是全刪;給條件才是部分刪除.**「不給條件」指:未傳 find、傳 `undefined`、或傳空物件 `{}`——三者皆為全部(select 亦同).
- **傳了值但不是條件物件者一律 reject**(使用者裁示 B):`null`、陣列、字串、數值、布林、函數、Date、RegExp、Map、Set、類別實例等,以整批性錯誤 reject,不得視同 `{}` 而全刪.適用於所有接受 find 之函數.
- 規格出處:`C:\opensrcOper\dspec\w-orm系列條件語法支援盤點.md` 〈一之一〉.
- 狀態:**已實作**(2026-10-17,R-FIND-01);案例 T01–T31 逐案對公開 `select`/`delAll` 執行.

## 〔系列條件白名單〕(使用者 2026-10-17 裁示;主控寫入,定案細節以 dspec〈一之三〉6. 為準)

- 全文與定案細節在 `C:\opensrcOper\dspec\w-orm系列條件語法支援盤點.md`〈一之三〉;本節為摘要,兩者不一致時以 dspec 為準.
- **只支援白名單,其他一律不支援(reject,整批性錯誤,不得靜默忽略)**:
  1. 頂層:未給、`undefined`、`{}` 為全部;其餘須為條件物件,否則 reject(〈delAll 與 find 之頂層語意〉).
  2. 欄位直接等值 `{欄: 純量}`,多欄隱含 AND.純量=字串、有限數字(含 `-0`)、布林、有效 Date;`null` 僅可作欄位直接等值、`$eq`、`$ne` 之值.
  3. 欄位運算子 `$eq $ne $gt $gte $lt $lte`(純量)、`$in $nin`(純量陣列;`$in:[]` 恆假允許,`$nin:[]` reject).
  4. 文件層 `$and`、`$or`(非空條件物件之非空陣列).
  5. 其餘(`$not $nor $regex $options $exists $where $expr $function $like $ilike $custom`、子查詢、欄位層 `$and/$or`、sequelize `Op` Symbol、函數值、`undefined` 值、點路徑、含 `-` 或空白之欄名等)一律 reject.
  6. 欄名 `^[\p{L}_][\p{L}\p{M}\p{N}_]*$`、1–128 字元、禁 `__proto__`;上限:邏輯深度 32、`$and/$or` 長度 1000、`$in/$nin` 長度 10000、節點 100000;本套件不下調(傳 `cvOrmFind` 之預設).
- **delAll 之 JSDoc 須載明使用須知**(使用者 2026-10-17):不給條件(未給、`undefined`、`{}`)即刪除全部;傳非條件物件會 reject;白名單外運算子會 reject;delAll 須審慎使用、非必要不用.經 w-serv-webdata 資料通道呼叫者語意與本套件一致,不另加限制.已套於 `delAll`、`delAllGfs`.
- 狀態:**已實作**(見 R-FIND-01).

## R-FIND-01 條件(find)之入口檢核(2026-10-17,第 33 項批 1d)

**單一擁有者**:規則本體在 wsemi `cvOrmFind`(`wsemi/src/cvOrmFind.mjs`),契約案例表在 `wsemi/src/_cvOrmFindCases.mjs`(純資料).本套件只負責「接線」:於正確之位置呼叫、其後只用複本;**不得**在本套件內自行放寬運算子/欄名、自行補丁檢核規則、或另寫形狀檢核.後端專屬之值限制(本套件無:MongoDB 以 BSON 型別比對,不需欄位型別檢核)才可留在本套件.

**規則句**

1. `select`、`delAll`、`delAllGfs` 於建立 `MongoClient` **之前**呼叫 `find = cvOrmFind(find)`;`_findGfs` 於呼叫 `bucket.find` 之前亦呼叫(縱深;其餘呼叫者 `delGfs` 逐筆之 `{filename:id}` 亦經此).此後函數內一律只用 `find` 複本(`collection.find`、`deleteMany`、`bucket.find` 皆不得收到呼叫端原物件——「檢查之值即使用之值」).
2. 檢核失敗為整批性錯誤:於函數既有之 `try` 內拋出,走既有之 `catch → isErr → emitError(mode, null, err) → Promise.reject(err)`;`emitError` 於 reject 之前**恰一次**;`change` 不發;`invalid find: <原因> at [<路徑>]` 原樣 reject(不包裝、不回顯值);不建立 `MongoClient`、不連線、不達伺服器、不讀取、不刪除.
3. 空條件:複本無自有鍵 → 以該空複本交 driver(全部).`delAll()`、`delAll(undefined)`、`delAll({})`、`delAll(Object.create(null))` 皆刪全部(最低要求③之例外,見〈delAll 與 find 之頂層語意〉).
4. 本套件無 `close`/`isClosed`,故無「closed 先於檢核」之順序問題.
5. 本套件不轉譯條件;白名單內之形狀,值語意為 MongoDB 伺服器原生(〈條件(find)之支援範圍〉).
6. `select` 回傳仍以 `omit(v,'_id')` 去除資料庫內部欄位;檢核不影響此行為.
7. `delGfs` 之逐筆條件 `{ filename: id }` 經 `_findGfs` 檢核(縱深).**第 66 項起**(R-ORMSTR-01):`id` 含 NUL 或孤立代理字元者已由 `delGfs` 入口之主鍵檢核先拒收(該筆 `n:0`、`ok:0`、`err:'invalid id: … at [data[<k>].id]'`,尚未查找、不建立 `bucket`),不再走到 `_findGfs` 之 `invalid find: …`;`delGfs` 不再以訊息前綴判別 `n`(查找/刪除途中失敗恆為 `n:1`).

**站點全集與判準**(行號為 2026-10-17 實作後)

| 站點 | 檔案:行 | 入口檢核 | 判準 |
|---|---|---|---|
| `select` | `src/WOrmMongodb.mjs:416`(檢核 :427;第 66 項後行號,日後以函數名為準) | `find = cvOrmFind(find)` 在 `new MongoClient` 之前 | 已套 |
| `delAll` | 同 :1340(檢核 :1351) | 同上 | 已套 |
| `_findGfs` | 同 :1650(檢核 :1658) | `bucket.find` 之前 `find = cvOrmFind(find)`(對 `delAllGfs` 已檢核之複本為冪等) | 已套 |
| `delAllGfs` | 同 :1873(檢核 :1884) | 同 `select`,並將複本交 `_findGfs` | 已套 |
| `deleteMany({ _id: { $in: idDels } })`(`insertBulk`)、`deleteMany({ files_id })`、`findOne({ id: pk })`、`updateOne({ id })`、`deleteOne({ id })` | 同 | 無(條件為本套件內部自建、非呼叫端之 find) | 刻意不套 |

**盤點指令**(重跑;結果須與上表一致)

- 入口全集:`Grep "find = cvOrmFind\(find\)" src/WOrmMongodb.mjs` → 4 處(`select`、`delAll`、`_findGfs`、`delAllGfs`,檔內出現順序);`Grep "cvOrmFind" src/WOrmMongodb.mjs` 另有 1 行 import 與 1 行說明註解.
- 呼叫端 find 之使用點:`Grep "\.find\(|deleteMany\(|bucket\.find" src/WOrmMongodb.mjs` → 每一處不是收「檢核後複本」,就是內部自建條件(上表末列).新增任何 `find`/`deleteMany`/`bucket.find` 而其參數來自函數參數者,必須先過 `cvOrmFind`.
- 舊式遺留:`Grep "iseobj\(find\)" src/WOrmMongodb.mjs` 須 0 處;`Grep "\$regex|\$where" src README.md g-basic.mjs` 之命中只可是「不支援」之說明文字(JSDoc、README 破壞性變更/白名單節、`g-basic.mjs` 之改寫註解),不得出現於可執行程式碼.

**對應測試**(`npm test` 即全跑;單檔:`npx mocha test/api-find-whitelist.test.mjs --timeout 180000`)

| 測試檔 | 內容 |
|---|---|
| `test/api-find-whitelist.test.mjs` | 契約案例表(`wsemi/src/_cvOrmFindCases.mjs`)241 案逐案對公開 `select` 與 `delAll`:OK/ALL 比對 `ids.mongo`、`delAll` 刪除集合=`select` 命中集合、`n=nDeleted`;REJ 則兩函數皆 reject、訊息以 `invalid find: ` 開頭、資料不變、`error` 事件於 reject 前恰一次、`change` 不發.本套件專屬:壞 find 不建立 `MongoClient`(以 `MongoClient` 計數替身)、壞 find 不達伺服器(profiler 無任何該集合之操作;正向對照 select、delAll 各一)、`$where` 字串/函數 立即 reject 且不執行、檢查之值即使用之值(翻轉式 Proxy 6 處:頂層欄、運算子物件、`$in` 元素、`$and` 元素、`$or` 元素內欄位、Date 值;並斷言原物件僅被描述子讀取 1 次、未被 get 讀取)、`select` 之 `_id` 排除維持、`delAll()`/`delAll({})`/`delAll(undefined)` 全刪、`_bsontype` 欄名安全性(reject 或無命中,不命中/不刪任何數據) |
| `test/api-find-whitelist-gfs.test.mjs` | `delAllGfs` 同規則:REJ 案 reject 且檔案不變、error 一次/change 不發、`delAllGfs()`/`{}` 全刪、`{filename}` 等值與白名單內運算子命中集合、翻轉式 Proxy 4 處;壞 find 不建立 `MongoClient`、不達伺服器;`delGfs` 逐筆 `{filename:id}` 之 NUL/孤立代理 id(存在與不存在)逐筆失敗 `n:0 ok:0`、error 每失敗筆一次、change 一次 |
| `test/api-basic.test.mjs`(既有,已改) | 原「select by regex」改為斷言 `$regex` 被 reject(白名單外) |

**變異(須轉紅;於 `./tmp/mut/<名>/` 之複本執行,不動 `src/`;執行器 `tmp/mut/run.mjs`,tmp 被 `.gitignore`,重建法見 `sgud/exp/experience.md`)**:M1×4 四個入口(`select`、`delAll`、`_findGfs`、`delAllGfs`)各自拿掉 `cvOrmFind`;M2×4 各入口檢核後仍用原物件;M3×3 `select`/`delAll`/`delAllGfs` 檢核移到 `new MongoClient` 之後;M4×3 失敗時不發 `emitError`;M5×3 `emitError` 發兩次;M6×2 `delAll`/`delAllGfs` 失敗時 `emitChange`;M7 `select` 去掉 `omit(_id)`;M8×2 `select`/`delAll` 把壞 find 吞掉改當 `{}`;M9 `select` 包裝錯誤訊息;M11×3 `select`/`delAll`/`delAllGfs` 檢核後額外讀一次原物件;M12×3 同三者檢核後把複本內物件值換回原巢狀參照(M11/M12 為外審後補強翻轉式 Proxy 與讀取計數後新增).2026-10-17 結果:基準(未變異)全綠;29 個相異變異中 28 轉紅(執行器另含 1 個與 M1-`_findGfs` 重複者);唯一存活者 `M2-_findGfs`(`_findGfs` 檢核後用原物件)為**等價變異**——`_findGfs` 只有兩個呼叫者(`delAllGfs` 傳入已檢核之複本、`delGfs` 傳入內部自建之 `{ filename: id }`),原物件與複本不可區分,無法以輸出觀測.

**已知限制**

1. 值語意(NULL、大小寫、型別)依 MongoDB 伺服器,與 SQL 式後端不同,屬設計(dspec〈一之三〉7.).
2. 因白名單不收點路徑,GridFS 檔案文件之 `metadata.*` 巢狀欄不可作為 `delAllGfs` 條件;庫內僅用 `{ filename: id }`.
3. `delGfs`:`id` 含 NUL/孤立代理字元之檔案(舊版可由 `insertGfs` 寫入),`delGfs` 逐筆回 `ok:0`(見規則句 7);仍可用 `delAllGfs()` 全刪.第 66 項起 `insertGfs` 同樣拒收此類 `id`,不再有新增.
4. `cvOrmFind` 之 `invalid opt` 屬程式設定錯誤,本套件不傳 `opt`,故不會出現.
5. **`_bsontype` 欄名**:符合系列欄名文法(底線開頭),白名單收;但 BSON 以自有欄 `_bsontype` 辨識型別,driver 序列化含此欄之條件會拋 `Unsupported BSON version…`(`select({_bsontype:'ObjectId'})` 另會被 `FindOperation` 改寫為 `{_id: …}`),故此欄名實務上不可查詢,結果為 reject 或無命中,不會命中或刪除任何數據(測試釘住此安全性,不釘住訊息).屬 MongoDB 後端專屬限制,留在本套件文件,不回頭要求 wsemi 修改共用文法;若日後要 `invalid find:` 格式之錯誤,可於 `cvOrmFind` 之後加後端專屬欄名檢查(只收緊,不放寬).
7. **主鍵參數之孤立代理字元**:已於第 66 項(R-ORMSTR-01)處理——主鍵入口以 wsemi `chkOrmStr` 拒收孤立代理字元與 NUL(使用者裁示 D1、D2).本條原為「另案」,現留作歷史.
8. `delGfs` 與 `insertGfs`/`selectByPkGfs` 對 NUL id 之不對稱:已於第 66 項(R-ORMSTR-01)消除(主鍵一律拒收 NUL,使用者裁示 D2),舊版寫入之 NUL id 檔案仍可由 `delAllGfs()` 或帶白名單內條件(如 `{length:…}`)刪除.
9. 外審(sol)指出 `_findGfs` 之「檢核後仍用原物件」與「檢核移到 `bucket.find` 之後」兩種變異無法以公開介面觀測:前者為等價變異(見變異節),後者因 `bucket.find` 只建立惰性游標、`toArray` 前不連伺服器,檢核仍先於任何 I/O,輸出無差別;不另抽 helper 以求可觀測.

## R-ORMSTR-01 字串良構(孤立代理字元、NUL)之接線(2026-10-20,第 66 項批 1d)

規格:`C:\opensrcOper\dspec\w-orm系列條件語法支援盤點.md`〈一之三〉9.(使用者裁示 D1、D2、D4,主控裁示 D3、D5–D8);共通要求 `C:\opensrcOper\dnow\20261020172106\review\批1共通要求.md`.

**成因**:BSON 以 UTF-8 存字串,孤立代理碼元(`String.prototype.isWellFormed()` 為 false)被無聲改寫為 U+FFFD,使不同主鍵寫成同一鍵(`insert` 誤判已存在、`save` 覆寫他筆、`del` 誤刪、`selectByPk` 命中他筆)、文件內不同鍵名撞鍵(值被覆蓋)、寫入值與讀回值不同;`opt.cl` 兩個不同名稱共用同一資料表.

**單一擁有者**:規則本體在 wsemi 之 `chkOrmStr`(字串)、`chkOrmData`(資料之鍵名與字串值,含巢狀物件、陣列元素、Map/Set 等),契約案例表 `wsemi/src/_cvOrmStrCases.mjs`(1553 案;wsemi 帳本 R-ORMSTR-01).本套件只負責**接線**:於正確位置呼叫、其後只用被檢核之值;**不得**自行寫孤立代理判斷(正規式、`isWellFormed`、`charCodeAt` 等)、不得自行放寬或加嚴.本套件唯一在 wsemi 詞彙之外自訂之原因為 `string is empty`(主控 2026-10-21 統一為與 lmdb/level/lowdb 相同之詞彙,原為 `empty string`)(`isestr('')` 為 false 之空字串主鍵;wsemi 的 `chkOrmStr('')` 回合格).

**規則句**

1. **主鍵**(`chkPk`):須為原始字串,不得為空字串、含 NUL 或孤立代理字元;`String` 包裝物件視為非字串(wsemi 1.9.69 前 `isestr` 認為它是字串,但 BSON 會把它以字元索引存成子文件;**「未帶」與「給了而不合格」之分界見 R-PKGIVEN-01**)——訊息 `invalid id: <原因> at [data[<k>].id]`,原因 ∈ {`not a string`、`string is empty`、`string contains NUL`、`string contains lone surrogate`}.
2. **寫入資料**(`chkDoc`:先 `chkPk` 再 `chkOrmData(v, { root: 'data[<k>]' })`):字串值與鍵名(含巢狀、陣列元素、Map/Set、RegExp.source、Error.message 等 `chkOrmData` 走訪者)不得含孤立代理字元,值之 NUL 不檢查(`chkOrmData` 預設)——訊息 `invalid data: <原因> at [data[<k>].<路徑>]`.同一文件主鍵先於資料;同一物件鍵名先於值;同批以索引最小者為準.
3. **位址**:`opt.url`、`opt.db`、`opt.cl` 為字串且含孤立代理字元者建構時 throw `invalid opt.<名>: string contains lone surrogate`(不檢查 NUL;非字串維持既有行為).**建構時即取值為區域變數 `url`/`db`/`cl`**,其後一律使用該值(檢查之值即使用之值),建構後改動 `opt` 不影響本實例(行為變更,README 載明).
4. **處置(與既有「無效主鍵」同形)**:`insert`/`insertBulk`/`insertGfs` 於建立 `MongoClient` 與任何寫入**之前**整批檢核,任一筆不合格即整批 reject(`emitError` 於 reject 前恰一次、`change` 不發、不連線、不寫任何一筆);`save`/`del`/`delGfs` 該筆 `{ok:0, err}`(`save` 為 `n:1`、`nInserted:0`、`nModified:0`,`del`/`delGfs` 為 `n:0`、`nDeleted:0`——沿用規格與既有形狀),同批其他筆照常,每個失敗筆各發一次 `error`(`data` 為 `[v]`),整批仍發一次 `change`;**同批皆不合格時不建立 `MongoClient`**;`selectByPk`/`selectByPkGfs` 回 `null`(不連線、不發事件;`pk` 讀取即拋錯者自 2026-11-20 oro557d3 起例外,整批 reject `invalid pk: must be a readable value`,見 R-READABLE-01);`select`/`delAll`/`delAllGfs` 之條件依 R-FIND-01(`invalid find`).
5. **檢查之值即使用之值**:`insert`/`insertBulk`/`save`/`del` 於 `cloneDeep` 複本上檢核與使用;`insertGfs` 於淺拷貝 `{ ...v }` 上檢核與使用(只寫入 `id` 與 `u8a`,不深拷貝大型位元組);`delGfs` 先複製為普通陣列再僅取一次 `id`(`ids[k]`);`del` 同樣只取一次 `ids[k]`;`selectByPk`/`selectByPkGfs` 之 `pk` 為原始字串.以上皆在第一個 `await` 之前同步完成(呼叫後立即改動原輸入不影響).
6. **訊息**:固定詞彙、不回顯值;`save`/`del`/`delGfs` 逐筆迴圈取批次索引(`pmSeries` 回呼第二參數 `k`);原 `invalid id[<回顯值>]` 一併去回顯(主控裁示 D6).`autoGenPk:false` 而**未帶** `id`(定義見 R-PKGIVEN-01:`undefined`、`null`、空字串)之既有訊息 `invalid data[<k>].id, autoGenPk is false` 不變(整批 reject,先於同一筆之良構檢核);**給了而不合格**(非字串等)者不再歸此訊息,一律 `invalid id: … at [data[<k>].id]`.
7. **不隨 `autoGenPk` 改變**:`autoGenPk:false` 時同樣檢核.
8. **`client = genClient()`(原 `new MongoClient(url)`,R-DIAG-01-5 起經 `genClient`;連線設定錯誤由各函數批次 `catch` 之 `outErr`〔`diag.err`〕遮罩)一律在 `try` 內**(11 個函數):`url` 解析失敗(`Invalid scheme`、`Protocol and host list are required`)時同步拋錯,須走 `catch → emitError → reject`,`error` 事件於 reject 前恰一次(審計 §3.9;修前 8 函數於 `try` 外,reject 而不發 `error`).`finally` 以 `client !== null` 防護 `close()`.

**站點全集與判準**(行號為 2026-10-20 實作後;日後以函數名為準,行號請以盤點指令重算)

| 站點 | 檔案:行 | 檢核 | 判準 |
|---|---|---|---|
| 建構 `url/db/cl` | `src/WOrmMongodb.mjs:70-82`(`chkOrmStr` :79) | `chkOrmStr(v, { nul: false })` → throw;取值為區域變數 | 已套 |
| `insert` | :563(`procDocs` :600,`new MongoClient` :603) | `procDocs` = `procPk` + `chkDoc`,先於連線 | 已套 |
| `insertBulk` | :822(`procDocs` :850,`new MongoClient` :853) | 同上 | 已套 |
| `save` | :1064(`chkDoc` :1095,條件連線 :1104,`saveOne` :927) | 逐筆 `msgBads[k]`;不合格筆 `saveOne` 直接回報 | 已套 |
| `del` | :1168(`chkPk` :1198,條件連線 :1206) | `ids[k]` 一次取值;逐筆 `msgBads[k]` | 已套 |
| `insertGfs` | :1417(`chkPk` :1448,`new MongoClient` :1459) | 淺拷貝後 `chkPk`;**不套 `chkDoc`**(只寫 `id`、`u8a`,其餘欄位不寫入) | 已套 / 資料檢核刻意不套 |
| `selectByPk` | :485(檢核 :489) | `!isestr(pk)` → 可讀者 `null`、不可讀者 reject `invalid pk: must be a readable value`(2026-11-20 oro557d3,R-READABLE-01);其後 `chkOrmStr(pk) !== null` → `null` | 已套 |
| `selectByPkGfs` | :1540(檢核 :1544) | 同上 | 已套 |
| `delGfs` | :1688(`chkPk` :1715,條件連線 :1723) | `ids[k]` 一次取值;逐筆 `msgBads[k]`;不再以訊息前綴判別 `n` | 已套 |
| `select`/`delAll`/`_findGfs`/`delAllGfs` | :416/:1340/:1650/:1873 | `cvOrmFind`(R-FIND-01) | 已套(既有) |
| `deleteMany({ _id: { $in } })`、`deleteMany({ files_id })`、`createIndex`、`hello` | — | 內部自建,不含呼叫端字串 | 刻意不套 |
| `findOne({ id: pk })`、`updateOne({ id: v.id }, { $set: v })`、`deleteOne({ id })`、`openUploadStream(id)`、`openDownloadStreamByName(pk)` | — | 其值皆為上列已檢核之值 | 刻意不套(已受上游檢核) |

**盤點指令**(重跑;結果須與上表一致)

- 接線點:`Grep "chkOrmStr\(|chkOrmData\(|chkPk\(|chkDoc\(|procDocs\(" src/WOrmMongodb.mjs`;每個公開函數之呼叫端字串/資料入口須有一處(`insert`/`insertBulk` 經 `procDocs`、`save` 經 `chkDoc`、`del`/`delGfs`/`insertGfs` 經 `chkPk`、`selectByPk`/`selectByPkGfs` 經 `chkOrmStr`、建構經 `chkOrmStr`).
- `new MongoClient`:R-DIAG-01-5 起 `Grep "client = genClient\(\)" src/WOrmMongodb.mjs` → 恆為 11 處且皆形如 `client = genClient()`(賦值,在 `try` 內),`new MongoClient(url)` 只在 `genClient` 內 1 處;出現 `let client = genClient(` 或 `let client = new MongoClient(` 即退回修前缺陷.
- 運行期不得讀 `opt.url|db|cl`:`Grep "opt\.(url|db|cl)\b" src/WOrmMongodb.mjs` 只可命中 JSDoc 與建構段(預設值與取值).
- 不得自寫孤立代理判斷:`Grep "isWellFormed|charCodeAt" src/WOrmMongodb.mjs` 只可命中類別 JSDoc 之說明文字(約第 34 行),不得出現於可執行程式碼.

**對應測試**(`npm test` 即全跑;單檔:`npx mocha test/api-wellformed.test.mjs --timeout 180000`,約 6 分鐘〔機器負載高時更久〕;只跑本套件專屬案:加 `--grep "contract cases" --invert`,約 40 秒)

| 測試檔 | 內容 |
|---|---|
| `test/api-wellformed.test.mjs` | ①契約案例表 API 層 1305 案逐案對公開 API 執行(排除單元層 `str` 74 案、`data` 174 案,由 wsemi 自測;`need` 之 `doc`、`gfs` 皆支援故略過 0 案),另以 `autoGenPk:false` 重跑 `id`/`single`/`val`/`order`/`gfs` 組 1128 案;每案全新資料表,種子、快照與驗證一律由驅動直接讀寫(GridFS 預存除外);除案例表斷言外加:`error` 事件次數與 `err` 訊息/`data` 形狀、`change` 次數、`MongoClient` 建立次數(rejectAll、`null`、同批皆不合格者須為 0).②`opt.url` 無效(`bad_scheme`、`not_url`、`empty_host`、不可達)× 11 函數:reject 且 `error` 恰一次、`change` 不發.③良構名稱(emoji、U+FFFD、CJK 擴充 B)可建構;建構後改動 `opt` 不影響實例(11 個函數皆走一遍,含 GridFS 重複 id 清孤兒 chunks).④同批皆不合格不建立 `MongoClient`(`save`/`del`/`delGfs`)與對照.⑤去回顯(非字串、空字串、Symbol、BigInt、物件、陣列、`String` 包裝物件)與 `autoGenPk:false` 之索引最小優先.⑥檢查之值即使用之值(`id` 存取器第一次/其後翻轉 × `insert`/`insertBulk`/`save`/`del`/`delGfs`/`insertGfs`;`delGfs` 輸入陣列於呼叫後清空).⑦良構值原樣往返、BSON 型別值(ObjectId、Long、Decimal128、Binary、Date、RegExp、Int32、Double)不受影響、值之 NUL 可寫入.⑧舊列(U+FFFD、NUL id)不被孤立代理/NUL id 路徑命中、仍可由他欄條件或 `delAll` 清除.⑨容器收尾 `docker rm -f -v` 後其匿名 volume 不得殘留(第 88 項). |
| `test/lib/api-setup.mjs` | `docker rm -f -v`(第 88 項) |
| `test/api-basic.test.mjs`、`test/api-gfs.test.mjs`、`test/api-find-whitelist-gfs.test.mjs`(既有,已改) | `invalid id[<回顯值>]` → `invalid id: … at [data[k].id]`;`delGfs` 含 NUL/孤立代理 id 之預存改以驅動直接寫入(`insertGfs` 已拒收) |

**變異**(須轉紅;於 `./tmp/mut/<名>/` 之複本執行,不動 `src/`;執行器 `tmp/mut/run.mjs`,tmp 被 `.gitignore`,重建法見 `sgud/exp/experience.md`):拿掉/退化各接線點——建構檢核(throw、只檢 url、不檢 db、不檢 cl)、`chkPk`(不檢 NUL、不分空字串、恆合格、索引固定為 0)、`chkDoc`(不檢資料、根路徑索引固定為 0、資料 NUL、資料先於主鍵)、`procDocs`(不 throw、`autoGenPk:false` 時略過)、`insert`/`insertBulk`(退回 `procPk`、檢核移到連線後)、`insert` 不 `cloneDeep`、`finally` 不防護 `client === null`、`save`(忽略 `msgBads`、恆連線、不檢核、`saveOne` 不早退/不發事件/事件 `data` 為 null)、`del`(忽略 `msgBads`、恆連線、不檢核、回顯)、`selectByPk`/`selectByPkGfs`(不檢核、放寬 NUL)、`insertGfs`(不檢核、u8a 先於 id、不淺拷貝)、`delGfs`(忽略 `msgBads`、重讀 `id`、恆連線、`n:1`、不複製輸入陣列、不檢核)、8 函數 `new MongoClient` 移出 `try`、運行期重讀 `opt.url|db|cl`(11 函數 × 3,逐站點)、測試基礎設施 `docker rm -f` 不帶 `-v`.結果見實作報告與 `sgud/exp/experience.md`.

**已知限制**

1. `String` 包裝物件含成對代理(作為資料值):`chkOrmData` 只檢其字串值;BSON 以字元索引存成子文件會把成對代理拆成孤立碼元——本批不解包、不改存放形式(主控裁示 ②),實務上資料不會使用 `String` 包裝物件.作為主鍵則一律拒收.
2. 自訂 `toJSON`/序列化函式之輸出不在檢核範圍.
3. `insertGfs` 只檢核 `id`;其餘欄位不寫入故不檢核;`u8a` 內容為位元組,不屬字串.
4. 資料鍵名含 NUL 不由本套件檢核(D2),由驅動拒收,驅動訊息會含鍵名片段;值之 NUL 可寫入.
5. 既有資料不遷移(D8):舊版寫入之孤立代理字元**已被 BSON 改寫為 U+FFFD**,無法還原亦無法以 `isWellFormed()` 檢出;README 載明以「含 U+FFFD」為候選列出,再以良構同形 id 或他欄條件清除.舊版寫入之 NUL id 列/檔案,id 路徑一律拒收(`selectByPk` 回 `null`、`del`/`delGfs` `ok:0`),可由他欄條件、`delAll`/`delAllGfs` 清除(測試釘住).
6. 繼承自原型之可列舉存取器:`cloneDeep` 保留原型,`chkOrmData` 對它呼叫 getter 一次;BSON 序列化(`insertMany`、`updateOne` 之 `$set`)只寫自有鍵、不再讀它(2026-10-20 以 `mongodb.BSON.serialize` 實測:getter 讀取次數維持 1、寫出之文件不含該鍵),故本套件無「檢查之值≠寫入之值」之缺口,不另將存取器固定為資料屬性(帳本規則 15 建議非強制).
7. 排序規則弱相等(mssql/Jet)與本套件無關(MongoDB 以 BSON 位元組比對,D4 只文件化).
8. 建構後改動 `opt` 不再影響實例(行為變更,檢查之值即使用之值);須改位址請重新建構.

## R-PKGIVEN-01 主鍵「未帶」與「給了而不合格」之分界(2026-11-19,omg492i;wsemi 1.9.69 連動之修正)

**成因**:wsemi 第 8 批(1.9.69)使判斷函數不收 `String` 包裝物件(使用者 2026-11-16 W-20:`isestr(new String('x'))` 為 `false`)、並以 `typeof`/`tagOf`(內含 `try`)判定,使原以 `!isestr(v.id)` 判「未帶主鍵」之 `procPk` 把**所有**非字串之 `id`(含包裝物件、`Proxy`)視為未帶而靜默換成 `genIDSeq()` 後寫入;`insert({ id: 5 })` 等非字串於修前即同樣被靜默替換(README 原文「其餘非字串依 autoGenPk 補值或拒收」)。主鍵為資料之身分,呼叫端給了錯值而換成新 id 寫入,事後無從對應。

**規則句**

1. **未帶主鍵**僅 `id` 為 `undefined`、`null`(含鍵不存在)與空字串(`''`,既有文件化行為,README〈字串良構檢核〉訊息表;見已知限制 1)。`autoGenPk:true` 時自動產生;`false` 時整批 reject `invalid data[<k>].id, autoGenPk is false`(`save` 亦整批 reject,既有)。判定以 `===` 比對,**不得**改用 `isestr` 等語意隨 wsemi 版本變動之判斷函數,且不呼叫被檢測值之任何方法或陷阱(`Proxy` 值不得因判定而拋錯)。
2. **給了而非字串**(數字、布林、物件、陣列、`String`/`Number`/`Boolean` 包裝物件、`Symbol`、`BigInt`、`Date`、函式、讀取即拋錯或已撤銷之 `Proxy` 等)一律依 `chkPk` 拒絕 `invalid id: not a string at [data[<k>].id]`(固定詞彙、不回顯值),**不補值、不替換**,**不隨 `autoGenPk` 改變**(`autoGenPk:false` 時亦為此訊息,不再是 `autoGenPk is false`)。
3. **通道依入口既有之失敗通道**:`insert`/`insertBulk`/`insertGfs` 於連線與寫入之前整批 reject(`error` 事件恰一次、`change` 不發、同批有效筆不寫入);`save` 該筆 `ok:0` 附 `err`(同批其他筆照常,每個失敗筆各一次 `error`;同批皆不合格不連線);`del`/`delGfs` 該筆 `ok:0`;`selectByPk`/`selectByPkGfs` 回 `null`(不連線、不發事件;`pk` 讀取即拋錯者例外,見 R-READABLE-01 規則句 7)。
4. **執行參數**(`opt.autoGenPk`、`insert` 之 `option.returnList`)給了非布林值(含 `Boolean` 包裝物件)依 K3 取預設(`true`/`false`),不拒絕。
5. 單一包裝套到多個呼叫點:`procPk` 之呼叫點 3 處(`procDocs`〔`insert`、`insertBulk` 共用〕、`save`、`insertGfs`),`chkPk` 之獨立呼叫點 2 處(`del`、`delGfs`),`selectByPk`/`selectByPkGfs` 為各自之內聯檢核;測試逐點接線(見變異)。

**入口全集與修前/修後**(修前＝工作樹乾淨之本庫現行版+wsemi 1.9.69;探測 `./tmp/omg492i/probe*.mjs` 為一次性,結果見 2026-11-19 omg492i 修正報告)

| 入口 | 通道 | 給了非字串:修前 | 給了非字串:修後 | 未帶(`undefined`/`null`/`''`) |
|---|---|---|---|---|
| `insert`(`procDocs`) | 整批 reject | `autoGenPk` 開:靜默換新 id 寫入;關:`autoGenPk is false` | `invalid id: not a string` | 不變 |
| `insertBulk`(`procDocs`) | 整批 reject | 同上 | 同上 | 不變 |
| `insertGfs` | 整批 reject | 同上(含 `Proxy`) | 同上 | 不變 |
| `save` | 逐筆 | 開:靜默換新 id 並寫入;關:整批 reject `autoGenPk is false` | 該筆 `ok:0`,`err` 同上 | 不變(關:整批 reject) |
| `del`、`delGfs` | 逐筆 | `ok:0 not a string` | 不變 | `ok:0`(不補值) |
| `selectByPk`、`selectByPkGfs` | `null`(`pk` 讀取即拋錯者 oro557d3 起整批 reject `invalid pk: must be a readable value`,見 R-READABLE-01) | `null` | 不變(可讀而非字串仍 `null`) | `null` |

**wsemi 1.9.69 後語意改變之其餘站點**(`Grep "isestr\(|isbol\(|isnum\(|isarr\(|isearr\(|iseobj\(|isu8arr\(" src/WOrmMongodb.mjs`;1.9.68 與 1.9.69 之 `isestr/isstr/isnbr/isbol` 由 `Object.prototype.toString`/lodash 改 `typeof`,`isobj/isarr/isu8arr` 之標籤判定加 `try`〔拋錯者回 `false`〕)

| 站點 | 呼叫端給的值? | 語意改變 | 處置 |
|---|---|---|---|
| `procPk` 之 `isestr(v.id)` | 是(資料身分) | 包裝物件、`Proxy` 由「字串/拋錯」變「未帶」 | **已修**(規則句 1、2) |
| `selectByPk`、`selectByPkGfs` 之 `!isestr(pk) \|\| chkOrmStr(pk) !== null` | 是(`pk`) | 包裝物件:兩版皆回 `null`;`Proxy`:1.9.68 reject(陷阱拋錯),1.9.69 回 `null` | oro557d 維持(回 `null`);**2026-11-20 oro557d3 已改(R-READABLE-01)**:可讀而非字串者仍 `null`(`isestr` 兼負空字串之判定,不可移除),不可讀者(`!isestr` 之分支內 `chkReadable(pk) !== ''`)整批 reject `invalid pk: must be a readable value`(`error` 事件恰一次) |
| `isbol(autoGenPk)`(建構) | 是(執行參數) | `Boolean` 包裝物件:1.9.68 視為布林(其真值恆真,`new Boolean(false)` 亦開),1.9.69 起非布林 → 預設 `true` | 依 K3 取預設(規則句 4;`new Boolean(false)` 之實際效果不變:開) |
| `isbol(returnList)`(`insert`) | 是(執行參數) | `Boolean` 包裝物件:1.9.68 恆為真值而回逐筆陣列,1.9.69 起 → 預設 `false`(聚合物件) | 依 K3 取預設(規則句 4;`new Boolean(true)` 之結果由陣列變聚合物件) |
| `iseobj(data)`/`isearr(data)`(`insert`、`insertBulk`、`save`、`del`、`insertGfs`、`delGfs` 之輸入容器) | 是(資料容器,非身分) | 包裝物件:兩版皆非容器;**已撤銷或 `Symbol.toStringTag` 拋錯之物件**:1.9.68 reject(陷阱拋錯),1.9.69 起非容器 | **已改(2026-11-20 oro557d,R-READABLE-01)**:可讀而型別不符者維持「無數據」之正常結果(`insert(5)`、`insert('abc')`、`insert(null)`),不可讀者(已撤銷之 Proxy、`Symbol.toStringTag`/`ownKeys` 陷阱拋錯等)整批 reject `invalid data: must be a readable value`(原已知限制 2 已解除) |
| `isu8arr(v.u8a)`(`insertGfs`) | 是(資料) | 已撤銷或拋錯之 `Proxy`:1.9.68 拋錯,1.9.69 回 `false` → `invalid data[<k>].u8a` | 拒絕通道不變;不可讀者訊息改為 `invalid data[<k>].u8a: must be a readable value`(R-READABLE-01),可讀而非 `Uint8Array` 仍為 `invalid data[<k>].u8a` |
| `isestr(message)`(`getErrMsg`) | 否(外來錯誤之 `message`) | `message` 為 `String` 包裝物件者改走 `String(err)` | 不改(輸出整形,非呼叫端之資料身分) |
| `isestr(get(hello, 'setName'))`、`isestr(msgBad)` ×3、`isearr(writeErrors)`、`isnum(k)`、`iseobj(v)`(`selectByPk` 讀回)、`isbol(_canUseTx)` | 否(驅動回應、內部旗標) | 無 | 不適用 |
| 建構 `typeof v === 'string'`(`opt.url/db/cl`)、`get(option, 'autoInsert', true)` | 是 | 無(不經 wsemi 判斷函數) | 不適用;其「不可讀」之處置見 R-READABLE-01(2026-11-20) |

**盤點指令**

- `Grep "procPk\(" src/WOrmMongodb.mjs` → 恆為 1 處定義 + 3 處呼叫(`procDocs`〔供 `insert`/`insertBulk` 共用〕、`save`、`insertGfs`),呼叫端不得內聯另一份「未帶」判定。
- `Grep "isestr\(v\.id\)|isestr\(id\)" src/WOrmMongodb.mjs` → 0 處(主鍵之「未帶」判定不得用 `isestr`)。
- `Grep "isbol\(" src/WOrmMongodb.mjs` → `autoGenPk`、`returnList`、`_canUseTx` 共 3 處(執行參數,K3);2026-11-20 起另有 `save` 之 `!isbol(autoInsert)` 1 處(僅供不可讀之探針判斷,不改 `autoInsert` 之取值,R-READABLE-01),共 4 處。

**對應測試**(單檔:`npx mocha --no-parallel test/api-pk-given.test.mjs --timeout 180000`,約 30 秒):`test/api-pk-given.test.mjs` 247 案(oro557d3 起;原 245)——`insert`/`insertBulk`/`insertGfs` × `autoGenPk` 開關 × 16 類非字串 `id`(整批 reject、不寫入、不連線、`error` 恰一次、`change` 不發、不回顯值);`save` 同矩陣(`ok:0`、同批其他筆照常);讀取即拋錯或已撤銷之 `Proxy` 值與自有存取器拋錯 × `insert`/`insertBulk`/`save`/`del`(複製階段 reject、無事件、既有列原樣)、`insertGfs`、`delGfs`、`selectByPk`/`selectByPkGfs`;`del`/`delGfs`/`selectByPk`/`selectByPkGfs` × `autoGenPk` 開關 × 16 類對既有列不誤中且不連線;未帶(鍵不存在、`undefined`、`null`、`''`)× 4 入口 × `autoGenPk` 開關(生成 UUIDv7/整批 reject);單一物件輸入(索引 0)與 `returnList:true`;批次內最小索引與有效筆不寫入;`opt.autoGenPk`/`option.returnList` 非布林取預設;合法字串 id 原樣(對照)。另 `api-wellformed` 〈String 包裝物件之 id 應 reject〉(`test/api-wellformed.test.mjs:571`)為本修正之原紅燈。

**變異**(須轉紅;於 `./tmp/omg492i/mut/<名>/` 之複本執行,執行器為一次性腳本,不動 `src/`):修前碼與 15 項變異全數轉紅、0 存活——判定還原為 `!isestr`(m1)、改為 `typeof !== 'string'`(m2)、拿掉空字串/`null`/`undefined` 之一(m3、m4、m5)、`chkPk` 放行數字(m6)、`procPk` 之 3 個呼叫點逐點改回舊寫法(`procDocs`、`save`、`insertGfs`;m7a、m7b、m7c)、`del`/`delGfs` 之 `chkPk` 放行數字(m8、m9)、`selectByPk`/`selectByPkGfs` 不檢核(m10、m11)、`opt.autoGenPk`/`option.returnList` 之布林判定改為只擋 `undefined`/`null`(m12、m13)。各案 passing/failing 數見 2026-11-19 omg492i 修正報告。

**已知限制**

1. 空字串(`''`)作為 `id` 於 `autoGenPk:true` 時仍視為「未帶」而自動產生(README 既有文件化行為,`api-basic` 既有案釘住);若要改為「給了而為空字串 → `invalid id: string is empty`」屬另一次不相容變更,需主控裁示。
2. (**已解除**,2026-11-20 oro557d,見 R-READABLE-01)原:`insert`/`insertBulk`/`save`/`del`/`insertGfs`/`delGfs` 之輸入容器(`data`)為已撤銷或拋錯之物件時,於 wsemi 1.9.69 起視為「無數據」之正常結果(1.9.68 為 reject);現改為整批 reject `invalid data: must be a readable value`,包裝物件、數字、字串、`null` 等可讀而型別不符者維持「無數據」。
3. (**已解除**,2026-11-20 oro557d4,第 557 項全族對齊輪 A3,見 R-READABLE-01 規則句 10)原:`insert`/`insertBulk`/`save`/`del` 對讀取即拋錯或已撤銷之 `Proxy` 作為 `id`、或 `id` 為會拋錯之自有存取器,於資料複製階段(`cloneData`)reject 該物件所拋之原例外(不發 `error` 事件);`insertGfs` 對 `Proxy` 值為 `invalid id: not a string`、對自有存取器為原例外;`delGfs` 對 `Proxy` 值為該筆 `ok:0`、對自有存取器為原例外。**現行**:6 個入口一律走與頂層不可讀相同之通道——整批 reject 固定詞彙 `invalid data: must be a readable value`(不含原例外文字,`error` 事件恰一次、數據參數 `null`,不補值、不連線、不寫入、不刪除);`insertGfs`/`delGfs` 之 `id` 為不可讀之值(非自有存取器)於「`id` 給了而非字串」之分支內探針(`isUnreadable(id)`),未改動「檢查之值即使用之值」之單次讀取設計;可讀而非字串者仍 `invalid id: not a string`(測試 `api-pk-given` 〈given unreadable id …〉改釘)。
4. (**已解除**,2026-11-20 omg569,第 569 項,見 R-PKOWN-01)原:`id` 須為**自有可列舉之資料屬性**(2026-11-19 omg492i 實測,修前即如此,非 omg492i 引入):不可列舉之自有 `id` 被 `cloneDeep` 與淺拷貝丟掉而視為未帶,`del`/`delGfs` 以 `get` 讀得而拒絕;定義於原型上之 `id`,`insertGfs` 之 `{ ...v }` 丟掉而視為未帶,其餘入口讀得其值(原型上為字串者寫入無 `id` 欄之列、`save` 以其覆寫或新增同值之列、`del`/`delGfs` 刪除同值之列;非字串者拒絕)。**現行**:繼承者與自有不可列舉者全入口一律視為未帶(R-PKOWN-01)。

## R-PKOWN-01 主鍵只認自有可列舉之資料屬性,繼承者視為未帶(2026-11-20,omg569,排程第 569 項全族;依 w-serv-orm R-OBJ-01 規則 7 ①與共同規則一)

**成因**:`cloneDeep` 保留原型、只複製自有可列舉鍵;`procPk` 以 `v.id` 讀得原型上之值而判「已帶」,而 BSON 只序列化自有可列舉之屬性。`del`/`delGfs`(`delGfs` 不複製)以 `get(v, 'id')` 沿原型讀得其值。實測(真 MongoDB 容器 `mongo:8`,standalone,入口 6 × 形狀 12 × 有無同值既有列 2 × `autoGenPk` 2 = 288 格):繼承字串 → `insert`/`insertBulk` 寫入**無 `id` 欄**之列(`resolve` 成功,與庫內同值之列不衝突)、`save` 以繼承值為查詢條件**覆寫同值之既有列**(`nModified:1`)或以該值新增、`del`/`delGfs` **刪除庫內同值之列/檔案**;繼承非字串(數字、物件)→ 既有拒絕(`invalid id: not a string`);`insertGfs` 因 `{ ...v }` 只展開自有可列舉屬性而修前即合規。

**規則句**

1. **主鍵只認自有可列舉之資料屬性**:列之 `id` 為**繼承**(原型鏈上,不論值之型別)或**自有不可列舉**者視為未帶:`autoGenPk` 開則補新主鍵(`setPk`:物件(含函式)之列一律以 `Object.defineProperty` 設為自有可列舉資料屬性〔`writable`/`enumerable`/`configurable` 皆真,同賦值所建〕,**不用賦值**——原型之 `id` 為 frozen 或只有 getter 時,嚴格模式賦值拋 `TypeError`;`setPk` 內不查描述子〔呼叫端已判定未帶〕;非物件之列維持賦值,使 `insert([5])` 之原生 `TypeError` 訊息不變)、關則照既有之「未帶」處置(整批 reject `invalid data[<k>].id, autoGenPk is false`,`save` 亦同)。
2. **判定不得多讀有效輸入**:先以既有路徑取值(`v.id`、`get(v, 'id')`),值為未帶即短路;只有值為「給了」才查描述子(`Object.prototype.propertyIsEnumerable.call(v, 'id')`,不呼叫 getter)。`procPk`:`id === undefined || null || '' || !isOwnPk(v)`;`getDelPk`:`chkPk(id, 0) === null && !isOwnPk(v)`(有效字串才查,已為無效之值〔繼承空字串、數字〕沿用原訊息)。
3. **`del`/`delGfs`**:繼承之主鍵(含自有不可列舉)視為未給主鍵,該筆 `ok:0` 附既有之無效主鍵訊息 `invalid id: not a string at [data[<k>].id]`,每筆一次 `error` 事件,同批皆不合格不連線,**不得刪除庫內同值之列/檔案**;`save` 不得以繼承值覆寫或 upsert 同值之列;`insert`/`insertBulk` 不得因繼承值而寫入無 `id` 欄之列。
4. `selectByPk`/`selectByPkGfs` 收純量,不適用(測試釘住傳列物件回 `null`、不連線、不發事件)。
5. **非主鍵欄之繼承可列舉欄位**:既有處置不變(BSON 只存自有可列舉屬性,繼承欄位不寫入;不在本規則範圍,測試釘住)。
6. `delGfs` 不複製 `data`:列為 `Proxy` 而僅以 `get` 陷阱虛擬 `id`、目標物件無該自有屬性者視為未帶(描述子查詢經 `getOwnPropertyDescriptor` 陷阱);查描述子拋錯者與元素讀取同通道(`invalid data: must be a readable value`,於 `getDelPk` 所在之 `try` 內)。

**站點全集**(盤點指令見下;判準:已套/不適用)

| 站點 | 取值 | 處置 |
|---|---|---|
| `procPk` ← `procDocs`(`insert`、`insertBulk` 共用)、`save`、`insertGfs`(3 個呼叫點) | `v.id` → `isOwnPk` | 已套(`setPk` 補值);`insertGfs` 之 `{ ...v }` 展開使繼承值不可見,`procPk` 為縱深 |
| `getDelPk` ← `del`(複製後之複本)、`delGfs`(原物件) | `get(v,'id')` → `isOwnPk` | 已套 |
| `chkDoc`/`chkPk(v.id)`、`saveOne` 之 `{ id: v.id }`、`_uploadGfs(v.id)` | 作用於 `procPk` 之後之複本(`id` 已為自有) | 不適用(下游) |
| `selectByPk`、`selectByPkGfs`、`select`/`delAll`/`delAllGfs`(條件) | 純量 `pk`/條件白名單 | 不適用 |

**修前/修後**(入口 × 形狀,seed 含與繼承值同值之既有列;探針 `probe-before/after` 共 288 格,修前後差異 120 格,皆為下列繼承形狀之 `autoGenPk` 真假分支)

| 入口 | 繼承字串/類別 getter/frozen 原型/自有不可列舉(有繼承值者) | 繼承數字、物件 |
|---|---|---|
| `insert`、`insertBulk` | 修前:寫入無 `id` 欄之列。修後:`autoGenPk` 開補新 UUIDv7、關整批 reject `autoGenPk is false`,既有同值之列原封不動 | 修前:整批 reject `not a string`。修後:同左(視為未帶) |
| `save` | 修前:同值列則覆寫(`nModified:1`)、無則以該值新增。修後:同上(補新 id/整批 reject),同值列不動 | 修前:該筆 `ok:0`。修後:視為未帶 |
| `del`、`delGfs` | 修前:刪除同值之列/檔案。修後:該筆 `ok:0`,`not a string`,不刪除 | 不變(`not a string`) |
| `insertGfs` | 不變(修前即補新 id/reject) | 不變 |

自有可列舉(含自有遮蔽繼承、自有存取器)、`id` 為 `undefined`/`null`/`''`/鍵不存在:全入口不變。繼承空字串:修前即未帶,不變(`del`/`delGfs` 仍 `string is empty`)。

**盤點指令**

- `Grep "propertyIsEnumerable" src/WOrmMongodb.mjs` → 恆為 1 處(`isOwnPk`);`Grep "isOwnPk\(" src/WOrmMongodb.mjs` → 1 處定義 + 3 處呼叫(`setPk`、`procPk`、`getDelPk`)。
- `Grep "getDelPk\(" src/WOrmMongodb.mjs` → 1 處定義 + 2 處呼叫(`del`、`delGfs`);`Grep "get\(v, 'id'\)" src/WOrmMongodb.mjs` → 僅 `getDelPk` 內 1 處(呼叫端不得內聯另一份取值)。
- `Grep "procPk\(" src/WOrmMongodb.mjs` → 1 處定義 + 3 處呼叫(同 R-PKGIVEN-01);`Grep "\.id = " src/WOrmMongodb.mjs` → 僅 `setPk` 內 1 處賦值(補值不得以賦值,見規則句 1)。

**對應測試**(單檔:`npx mocha --no-parallel test/api-pk-own.test.mjs --timeout 180000`,約 1.5 分鐘,自建 docker 容器 `worm-test-mongodb-pkown`,環境變數 `WORM_PKOWN_CT` 可覆寫容器名):`test/api-pk-own.test.mjs` 408 案——入口 6(`insert`、`insertBulk`、`save`、`insertGfs`、`del`、`delGfs`)× 形狀 15(繼承字串/數字/物件/空字串、類別 getter〔字串、數字〕、frozen 原型、自有不可列舉〔無繼承、下有繼承字串〕、無 `id` 鍵、無原型且無 `id`;對照:自有可列舉、自有遮蔽繼承、自有欄位名為 `propertyIsEnumerable`/`hasOwnProperty`、無原型之自有 `id`)× seed 2(`same`:與繼承值同值之既有列〔字串 `a9`、字串 `123`、文件另有數字 `123`〕、`other`)× `autoGenPk` 2 = 360 案;`change` 事件資料之新 `id` 為自有可列舉可寫可設定之資料屬性 20 案;批次(逐筆各自判定、同批兩筆繼承不撞鍵、最小索引、同批之有效 `del`)、單一物件輸入、鍵全在原型上之單一物件(`iseobj` 早退之既有契約)、S2(`delGfs` 之 `Proxy` 陷阱記錄:未帶/無效值不查描述子、有效字串查一次、`get` 虛擬值與原型繼承值不刪;自有存取器僅讀一次;`null`/原始值列之既有訊息;`insert([{…}, null])` 之原生讀取錯誤、`insert([5])` 之原生賦值錯誤)、`selectByPk`/`selectByPkGfs`(純量)、非主鍵欄之繼承欄位。修前(`git archive HEAD src`)408 案 142 紅/266 綠(綠者為自有 id 對照、繼承數字/物件之 `del`/`delGfs`、`insertGfs` 全部、`null`/原始值列之既有訊息等),修後 408 綠。

**變異**(須轉紅;於 `./tmp/omg569/mut/<名>/` 之複本執行,執行器為一次性腳本,不動 `src/`;基準 408/408 綠):21 項中 19 項轉紅、2 項等價存活——`procPk` 拿掉 `!isOwnPk`(101 紅)、`isOwnPk` 改 `in`(=修前行為,142 紅)、`isOwnPk` 改 `hasOwnProperty`(8 紅)、`isOwnPk` 改呼叫列物件自身方法 `v.propertyIsEnumerable('id')`(28 紅)、`procPk` 先查描述子再取值(1 紅)、`procPk` 只對字串查描述子(39 紅);`setPk` 改賦值(26 紅)、補值不可列舉(68 紅)、補值不可寫不可設定(20 紅);`getDelPk` 不查自有(42 紅)、先查描述子再取值(7 紅)、對任何字串即查(10 紅)、對任何給了之值即查(11 紅)、回 `''` 而非 `undefined`(41 紅);`del`、`delGfs` 兩站點各改回舊寫法 `get(v, 'id')`(18、24 紅);`procPk` 之 3 個呼叫點逐點改回舊寫法(`insert`、`insertBulk`、`save`;35、33、34 紅)。**等價存活 2 項**:`insertGfs` 之呼叫點改回舊 `procPk`、`insertGfs` 之展開改為保留原型——二者之一失效時另一道(展開只取自有可列舉屬性/`procPk`)仍擋住繼承值,故不可觀測(縱深);兩道同時移除(M18)則 33 案轉紅。

**已知限制**

1. `delGfs` 之 `Proxy` 列:僅以 `get` 陷阱虛擬 `id`、目標物件無該自有屬性者視為未帶(規則句 6;`del`、`insert` 系因複製後為普通物件,無此情形)。
2. 非主鍵欄之繼承可列舉欄位:各庫既有處置不變(本庫為不寫入),不在本規則範圍(規則句 5)。
3. 單一物件鍵全在原型上(`insert(Object.create({ id: 'a9' }))`,無自有鍵)為 wsemi `iseobj` 判無數據之早退(`{ n: 0, nInserted: 0, ok: 1 }`,`save`/`del` 為 `[]`),不在本規則範圍(測試釘住)。
4. **自有可列舉 `id` 而原型上有 frozen(唯讀)或僅 getter 之同名 `id`**(`Object.defineProperty(Object.create(Object.freeze({ id: 'zz' })), 'id', { value: 'a1', enumerable: true, writable: true, configurable: true })`):`cloneDeep` 複製時以賦值寫入而拋 `TypeError`,`insert`/`insertBulk`/`save`/`del` 整批 reject `invalid data: must be a readable value`;`insertGfs`(展開)、`delGfs`(不複製)正常處理。**修前即如此**(對 HEAD 實測),屬複製階段(R-READABLE-01)與本規則之交界,非本規則所引入,未改;是否改為以 `Object.defineProperty` 複製(自寫複製)需主控裁示。

## R-READABLE-01 讀取即拋錯(不可讀)之輸入依原失敗通道拒絕,改用 wsemi `chkReadable`(2026-11-20,oro557d,排程第 557 項;依 dspec〈輸入參數之檢測機制〉V11、V17、V19、V20)

**成因**:wsemi 1.9.69 起判斷函數(`iseobj`、`isearr`、`isbol`、`isu8arr` 等)對「讀取即拋錯」之值(已撤銷之 `Proxy`、`Symbol.toStringTag` 拋錯、陷阱拋錯、陣列 `length`/`[0]` 讀取拋錯)一律回 `false` 而不拋錯(wsemi C2),呼叫端無從分辨「型別不符」與「不可讀」:`data` 為已撤銷之 `Proxy` 被當成「無數據」而正常 resolve(1.9.68 為 reject,R-PKGIVEN-01 已知限制 2 / omg492i 需裁示 4),`option.returnList`、`opt.autoGenPk` 之不可讀值被靜默換成預設。wsemi 1.9.70 之 `chkReadable(v, opt)`(單一擁有者,R-READABLE-01)提供探針:回 `''` 可讀、固定原因字串不可讀,永不拋錯,不呼叫存取器,讀取範圍與判斷函數同源。

**規則句**

1. **探針置於判斷函數回 `false` 之分支內**(有效輸入不經探針、不多讀,不自造回歸):`!iseobj(data) && !isearr(data)`(6 入口)、`!isbol(returnList)`、`!isbol(autoInsert)`、`!isbol(autoGenPk)`、`!isu8arr(u8a)`、`!isestr(pk)`(`selectByPk`、`selectByPkGfs`)、建構之 `typeof v === 'string'` 之 else。**不得**於判斷之前先探(測試 `S5` 以 Proxy 陷阱計數釘住:有效陣列容器之 `ownKeys` 陷阱 0 次、有效 `option` 只讀其單一鍵、有效 `opt` 不被讀標籤)。
2. **容器(`data`)**:`isUnreadable(data)` = `chkReadable(data, { ownKeys: isobj(data), elements: 'first' }) !== ''`(`ownKeys` 只對標籤為 `[object Object]` 者讀,= `iseobj` 讀自有鍵與原型鏈之超集;`elements:'first'` = `isearr` 之 `length` 與 `[0]`;**不得**無條件 `ownKeys: true`——對 `Buffer`、型別陣列、`String` 包裝物件等 `iseobj` 本不讀鍵者,`Reflect.ownKeys` 須展開全部索引鍵,`Uint8Array(1e7)` 約 8 秒、多占數百 MB,獨立複審實測為回歸,測試 S5〈…is not enumerated by the probe〉以偽稱 `Map`/`Uint8Array`/`String`/`Array` 標籤之 Proxy 計數 `ownKeys` 陷阱釘住)**或**陣列 `length === 1` 時自讀 `Reflect.get(data, '0')` 拋錯(`chkReadable` 不呼叫存取器,陣列 `[0]` 為拋錯之存取器時 `isearr` 以 `v[0]` 讀取而回 `false`,須於呼叫端自讀)。不可讀者 6 入口(`insert`、`insertBulk`、`save`、`del`、`insertGfs`、`delGfs`)走**整批失敗通道**:`rejectUnreadable(mode, 'data')` = `error` 事件於 reject 前恰一次(數據參數 `null`,不把不可讀之輸入交給訂閱函數)後 reject `ownErr('invalid data: must be a readable value')`;先於連線、複製與任何寫入/刪除(V17)。可讀而型別不符(`5`、字串、`null`、`undefined`、`{}`、`[]`、`Map`、`Date`、`Symbol`、`BigInt`、函式、包裝物件、`[null]` 等)維持既有:「無數據」之正常結果,無事件。
3. **選項**:`insert` 之 `option` 與 `option.returnList`、`save` 之 `option` 與 `option.autoInsert`:`get(option, 鍵)` 拋錯 → `chkReadable(option) !== '' ? 'option' : 'option.<鍵>'`(容器本身不可讀或僅該鍵之存取器拋錯),走整批通道(同第 2 點);鍵值回 `isbol` 為 `false` 時 `chkReadable(值) !== ''`(只讀標籤,同 `isbol` 之前置讀取源)→ `invalid option.returnList: must be a readable value`;可讀而非布林值:`returnList` 取預設 `false`(K3,不變)、`autoInsert` 之原值交驅動(**不變**,見已知限制 3)。`option` 容器之標籤/自有鍵拋錯而其單一鍵可讀者視為可讀(本套件只讀該鍵,「檢查之值即使用之值」)。
4. **建構 `opt`**(失敗通道為同步 `throw new Error`,先於任何 `MongoClient`):`readKey(key)` 包 `opt[key]`:拋錯且 `opt` 為物件/函式 → `chkReadable(opt) !== ''` 則 `invalid opt: must be a readable value`,否則 `invalid opt.<鍵>: must be a readable value`;`opt` 為 `null`/原始值(可讀而型別不符)**原樣**拋出原生 `TypeError`(不改寫)。`opt.autoGenPk` 值回 `isbol` 為 `false` 時 `chkReadable` 不可讀 → `invalid opt.autoGenPk: …`,可讀 → 預設 `true`(K3,不變)。`opt.url/db/cl` 非字串且不可讀 → `invalid opt.<名>: …`,可讀之非字串維持不檢核(R-ORMSTR-01 不變)。`opt.logDetail`、`opt.funLog` 由 wsemi `getDiag` 擁有(不可讀者視為未給;`unit-diaglog` 〈讀取選項拋錯(getter)…建構不拋錯〉釘住),不在本規則。
5. **`insertGfs` 之 `u8a`**:`!isu8arr(u8a)` 內 `chkReadable(u8a) !== ''` → `mkReadErr('data[k].u8a')` = `invalid data[k].u8a: must be a readable value`(整批 reject,`error` 事件恰一次,**數據參數 `null`**〔oro557d4 起,A4〕),可讀而非 `Uint8Array` 維持 `invalid data[k].u8a`(整批 reject,`error` 事件恰一次,數據參數不變,既有通道)。u8a 值不可讀與「u8a 為拋錯之存取器」之訊息不同(前者 `invalid data[k].u8a: …`,後者於展開時拋錯 → 規則句 10 之 `invalid data: …`),皆為固定詞彙、`error` 恰一次、數據參數 `null`。
6. **訊息**為固定詞彙(V19 `invalid <名稱>: must be a readable value`),不含原例外文字、不回顯值(V20);`mkReadErr`(= `ownErr` 登記 + `readErrs` 登記,oro557d4 起;`ownErr` 登記令其不經 `diag.err` 遮罩,`readErrs` 登記令 `emitError` 對其一律以 `null` 為數據參數)。
7. **主鍵參數**(2026-11-20 oro557d3,主控規則四第 5 點):`selectByPk`/`selectByPkGfs` 之 `pk` 於 `!isestr(pk)` 分支內 `chkReadable(pk) !== ''` → `rejectUnreadable('selectByPk'|'selectByPkGfs', 'pk')` = `error` 事件恰一次(操作別為該入口,數據參數 `null`)後 reject `ownErr('invalid pk: must be a readable value')`,不連線;可讀而非字串者(`5`、`String` 包裝物件、`{}`、`null`、`undefined`、空字串、`ownKeys` 陷阱拋錯之物件〔只讀標籤〕等)與含 NUL/孤立代理字元之字串維持 `null`(不連線、不發事件)。探針用預設 `chkReadable(pk)`(只讀標籤,`isestr` 對非字串不讀任何鍵,不加 `ownKeys`)。oro557d 時此項曾列「不在本規則」(回 `null`),主控 05:5x 規則四第 5 點改為 reject。
8. **存取器**(容器可讀而其成員為拋錯之 getter;主控規則四第 2 點,2026-11-20 05:5x 更正:轉**固定詞彙**,不維持原例外文字——V20:存取器拋出之文字由呼叫端之物件決定,可能含機敏字串):`chkReadable` 不呼叫存取器,故讀取處自行 try 捕捉並轉固定詞彙,走該入口之原失敗通道。本庫之讀取處全集與現況(已核對,oro557d 交件時即為固定詞彙,本輪不需改碼):建構 `opt.url/db/cl/autoGenPk`(`readKey` catch 內 `chkReadable(opt)` 分 `invalid opt` 與 `invalid opt.<鍵>`)、`insert` 之 `option.returnList`、`save` 之 `option.autoInsert`(各自 try 內 `get(option, 鍵)` catch 分 `invalid option` 與 `invalid option.<鍵>`)、長度為 1 之陣列 `data` 而 `[0]` 為存取器(`isUnreadable` 內 `Reflect.get(data,'0')` 自讀 → `invalid data`);`find` 成員為存取器 → wsemi `cvOrmFind` 之 `invalid find: accessor property is not allowed at [find.<鍵>]`(固定詞彙,wsemi 擁有);`opt.logDetail`/`opt.funLog` 為存取器 → wsemi `getDiag` 視為未給、建構不拋錯(dspec C15,已知限制 2)。測試 S3(鍵存取器)、S8(存取器、`Proxy` 單鍵陷阱、`[0]` × 6 入口)釘住,變異 `r2a-*` 轉紅。
9. **不在本規則(維持,有測試釘住)**:`select`/`delAll`/`delAllGfs` 之 `find` 不可讀 → `invalid find: an exception was thrown while reading the condition at [find]`(R-FIND-01,wsemi `cvOrmFind`;主控裁:第 560 項另議);`opt.logDetail`/`opt.funLog` 之不可讀(wsemi `getDiag`,dspec C15)。**資料元素/巢狀值之不可讀已於 oro557d4 納入本規則(規則句 10)**,不再屬「不在本規則」。
10. **複製階段之巢狀不可讀值(2026-11-20 oro557d4,第 557 項全族對齊輪 A3;主控更正規則四第 3 點:原定「維持複製處拋出之原訊息」,改轉固定詞彙)**:資料內部之值(`id`、欄位、巢狀值、列之成員、長度大於 1 之陣列其後之元素、`u8a` 欄)為已撤銷之 `Proxy`、陷阱拋錯之物件或拋錯之存取器,於複製處(下列)拋錯者,與頂層不可讀走**同一通道**:整批 reject 固定詞彙 `invalid data: must be a readable value`、`error` 事件於 reject 前恰一次且數據參數 `null`、不連線、不補值、不寫入、不刪除;複製處之 catch **不分辨拋錯之原因**(可讀而無法複製者,如原型為 `null` 之 `Date`、50000 層巢狀,亦同),拋出之原例外(外來值,其文字由呼叫端之物件決定)不轉出、不經 `diag.err`。實作:
    - **doc 4 入口**(`insert`、`insertBulk`、`save`、`del`):`cloneData(data)` 之 catch 回 `null`(不再 `throw diag.err(err)`),呼叫端 `if (data === null) { return rejectUnreadable(<入口>, 'data') }`(4 處,`unit-diagwire`〈複製使用端輸入一律 cloneData〉掃描釘住);`save` 之讀取順序不變(先複製 `data`,後讀 `option`)。
    - **`insertGfs`**(不深拷貝,複製處 = 陣列元素之讀取與 `{ ...v }` 展開,僅用 `id`、`u8a`):`rows = map(data, v => ({ ...v }))` 包 `try`,catch → `throw mkReadErr('data')`(元素為已撤銷之 `Proxy`、`ownKeys` 陷阱拋錯、`id`/`u8a`/其他自有欄位為拋錯之存取器、陣列元素讀取拋錯);其後 `each(rows)`(先於逐筆檢核,令「不可讀先於任何逐筆拒絕」與 doc 入口之複製先於檢核一致):`id` 給了而非字串(`!== undefined && !== null && typeof !== 'string'`)且 `isUnreadable(id)` → `mkReadErr('data')`(**消除「`id` 不可讀於 insert 系走複製階段原訊息、於 `insertGfs` 為 `invalid id: not a string`」之不一致**,探針只在 `id` 給了而非字串之分支內,有效字串 `id` 不探針);`!isu8arr(v.u8a)` 且 `chkReadable(v.u8a) !== ''` → `mkReadErr('data[k].u8a')`(規則句 5);其後逐筆檢核同前。
    - **`delGfs`**(不複製,複製處 = 陣列元素之讀取與 `get(v, 'id')`,僅用 `id`):`data`/`ids` 之建立包 `try`,catch → `throw mkReadErr('data')`(元素為已撤銷之 `Proxy`、`get` 陷阱拋錯、`id` 為拋錯之存取器);`id` 之值不可讀(非自有存取器)於 `chkPk` 回非 `null` 之分支內 `isUnreadable(id)` → `mkReadErr('data')`,整批 reject,不再為該筆 `ok:0`。
    - **GFS 系刻意不套**(讀取範圍 = 實際用到之欄位,與規則句 2「讀取範圍與判斷函數同源」一致):`insertGfs` 之 `id`/`u8a` 以外之欄位、`delGfs` 之 `id` 以外之欄位為不可讀者不被讀取(展開之存取器除外:展開執行自有可列舉之 getter,故 `insertGfs` 之其他欄位為拋錯之存取器**會**拒絕;已撤銷之 `Proxy` 值、巢狀值不被讀取而維持成功);`delGfs` 之元素為標籤拋錯或 `ownKeys` 陷阱拋錯之物件而 `id` 讀得者維持逐筆結果;**`id` 為物件而其內部成員不可讀**(如 `{ id: { get x() { throw … } } }`)者,doc 4 入口於深拷貝處即拒 `invalid data: …`,GFS 因不深拷貝、`id` 本身可讀而非字串,維持 `invalid id: not a string`(`insertGfs` 整批)/該筆 `ok:0`(`delGfs`)——此為「複製處只到實際讀取之處」之自然差異(2026-11-20 複審提出,維持,見需裁示)。`insertGfs` 之 `isu8arr(v.u8a)` 判定結果記於 `u8aOks` 供逐筆檢核沿用,有效 `u8a` 之標籤僅讀一次(S5 〈a valid Uint8Array has its tag read exactly once〉釘住;複審實測曾為 2 次)。
    - **範圍**(主控 07:5x 裁):只到複製處為止;複製**之後**讀取原型上之存取器、繼承之存取器、`Error` 值之 `message` 等所拋者(如 `insert`/`insertBulk`/`save`/`del` 之資料物件 `Object.create({ get id() { throw … } })`,複製保留原型,`procPk`/`get(v,'id')` 讀得而拋)屬外來錯誤之診斷出口(V20 ⑥ 不保證),維持原例外經 `outErr` 遮除憑證、`error` 事件數據參數不變,記入已知限制 1;測試 S9 〈an id accessor on the prototype …〉釘住邊界。
11. **A4 error 事件數據參數**(2026-11-20 oro557d4,主控規則四第 4 點):入口階段(選項與資料之讀取、判定與複製)之不可讀拒絕之 `error` 事件數據參數一律 `null`:`mkReadErr` 建立之錯誤登記於 `readErrs`(WeakSet),`emitError(mode, data, err)` 於 `readErrs.has(err)` 時傳 `null`(單點,不論該錯誤由 try 內外拋出或 `rejectUnreadable` 回傳);入口階段之後之整批拒絕(`invalid id`、`autoGenPk` 假而缺 `id`、`invalid data: string contains lone surrogate`、`invalid data[k].u8a`〔可讀而非 `Uint8Array`〕)與逐筆失敗(`save`/`del`/`delGfs` 每筆一次 `[v]`)之數據參數**不變**(S9 A4 對照案釘住)。

**站點全集**(`Grep "isbol\(|iseobj\(|isearr\(|isu8arr\(|chkReadable\(" src/WOrmMongodb.mjs`;wsemi 判斷函數判定「呼叫端給的值」者)

| 站點 | 值 | 判斷函數 | 探針 | 失敗通道 |
|---|---|---|---|---|
| 建構 `opt` 之 `opt[key]` | `opt` 容器 | 無(直接讀鍵) | `readKey` 之 catch 內 `chkReadable(opt)` | 同步 throw |
| 建構 `isbol(autoGenPk)` | `opt.autoGenPk` | `isbol` | false 分支內 | 同步 throw |
| 建構 `typeof v === 'string'`(url/db/cl) | `opt.url/db/cl` | `typeof` | else 分支內 | 同步 throw |
| `insert` 之 `get(option, 'returnList')`、`isbol(returnList)` | `option`、`option.returnList` | `isbol` | catch 內/false 分支內 | 整批 reject + error 事件 |
| `save` 之 `get(option, 'autoInsert', true)`、`isbol(autoInsert)` | `option`、`option.autoInsert` | `isbol`(僅供探針判斷) | catch 內/false 分支內 | 整批 reject + error 事件 |
| `insert`、`insertBulk`、`save`、`del`、`insertGfs`、`delGfs` 之 `!iseobj(data) && !isearr(data)` | `data` | `iseobj`、`isearr` | `isUnreadable(data)`(false 分支內) | 整批 reject + error 事件 |
| `insertGfs` 之 `isu8arr(u8a)` | `v.u8a` | `isu8arr` | false 分支內 | 整批 reject + error 事件(數據參數 `null`,oro557d4) |
| `insert`、`insertBulk`、`save`、`del` 之 `cloneData(data)`(深拷貝) | `data` 內之巢狀值(`id`、欄位、列之成員、陣列其後之元素、`u8a` 欄等) | 無(`cloneDeep` 之拋錯) | 複製處之 catch 不分辨原因(oro557d4,A3) | 整批 reject `invalid data: must be a readable value` + error 事件恰一次(數據參數 `null`) |
| `insertGfs` 之 `{ ...v }` 展開與陣列元素讀取 | 元素、`id`/`u8a`/其他自有欄位之存取器 | 無(展開之拋錯) | try 之 catch(oro557d4,A3) | 同上 |
| `insertGfs` 之 `id` 值 | `v.id`(給了而非字串者) | `chkPk` | 回非 `null` 之分支內 `isUnreadable(id)`(oro557d4,A3) | 同上(原 `invalid id: not a string`) |
| `delGfs` 之元素與 `get(v, 'id')` 讀取 | 元素、`id` 為存取器 | 無(讀取之拋錯) | try 之 catch(oro557d4,A3) | 同上 |
| `delGfs` 之 `id` 值 | `ids[k]`(給了而非字串者) | `chkPk` | 回非 `null` 之分支內 `isUnreadable(id)`(oro557d4,A3) | 同上(原該筆 `ok:0`) |
| `selectByPk`、`selectByPkGfs` 之 `!isestr(pk)` | `pk` | `isestr` | false 分支內(oro557d3) | 不可讀:整批 reject + error 事件;可讀而非字串:`null` |
| `select`、`delAll`、`delAllGfs` 之 `cvFind(find)` | `find` | `cvOrmFind`(wsemi) | wsemi 自有 | `invalid find`(不變) |
| `procPk`/`chkPk`(`id`) | `id` | `===`/`chkOrmStr` | 不探針(R-PKGIVEN-01) | 不變 |
| `getErrMsg`、`isDupKeyError`、`canUseTx`、`saveOne`/`del`/`delGfs` 之 `isestr(msgBad)`、`isnum(k)`、`iseobj(v)`(`selectByPk` 讀回)、`_canUseTx` | 外來錯誤/驅動回應/內部旗標 | — | 不適用 | — |

**盤點指令**:`Grep "chkReadable\(" src/WOrmMongodb.mjs` → 11 處(`isUnreadable` 1;`insert` 2〔option 容器、returnList 值〕;`save` 2〔option 容器、autoInsert 值〕;`insertGfs` 1;`selectByPk` 1、`selectByPkGfs` 1〔`pk`〕;建構 3〔`readKey`、`autoGenPk`、url/db/cl〕);`Grep "isUnreadable\(data\)" src/WOrmMongodb.mjs` → 6 處呼叫(各在 `!iseobj(data) && !isearr(data)` 之區塊內)+ 1 處定義;`isUnreadable(` 另有 `insertGfs`/`delGfs` 之 `id` 值探針各 1 處(oro557d4;共 9 處〔定義 1 + data 6 + id 2〕,以去註解之程式碼計);`Grep "rejectUnreadable\(" src/WOrmMongodb.mjs`(去註解)→ 1 處定義 + 16 處呼叫(6 個 `data` + 4 個複製處〔`insert`/`insertBulk`/`save`/`del` 之 `if (data === null)`,oro557d4〕 + `insert` 之 option 容器/`option.returnList` 值 2 + `save` 之 option 容器/`option.autoInsert` 值 2 + `selectByPk`/`selectByPkGfs` 之 `pk` 2);`Grep "mkReadErr\(" src/WOrmMongodb.mjs`(去註解)→ 7 處(定義 1 + `rejectUnreadable` 1 + `insertGfs` 3〔展開之 catch、`id` 值、`u8a` 值〕 + `delGfs` 2〔元素與 `id` 讀取之 catch、`id` 值〕);`Grep "readErrs" src/WOrmMongodb.mjs`(去註解)→ 3 處(宣告、`mkReadErr` 內 `add`、`emitError` 內 `has`);`Grep "must be a readable value" src/WOrmMongodb.mjs`(去註解)→ 2 處(`mkReadErr`、`throwUnreadable`;oro557d4 起 `insertGfs` 之 `u8a` 亦經 `mkReadErr`);`Grep "cloneData\(" src/WOrmMongodb.mjs` → 1 處定義 + 4 處呼叫(`data = cloneData(data)` 後皆接 `if (data === null)`);`ownErr(` 6 處(定義 1 + `procPk`、`procDocs`、`insertGfs` 之 `chkPk`/`u8a` 各 1〔`invalid id`、`invalid data[k].u8a`〕+ `mkReadErr` 內 1)。

**對應測試**(單檔:`npx mocha --no-parallel test/api-readable.test.mjs --timeout 180000`,約 45 秒;環境變數 `WORM_READABLE_CT` 僅供變異並行時取不同容器名):`test/api-readable.test.mjs` 452 案(oro557d 時 372 案,oro557d3 改 S6、增 S7 之 pk 掃描 2 案與 S8)——S1 容器 × 6 入口 × 8 種不可讀 × `autoGenPk` 開關(整批 reject、固定詞彙、`error` 恰一次且數據參數 `null`、無 `change`、不連線、資料庫與種子不變)+ `returnList:true` + 同一實例拒絕後續可用;S2 可讀而型別不符 20 種(含 `Buffer`、`Uint8Array`、`ownKeys` 陷阱拋錯之陣列/`Map` Proxy)× 6 入口(無數據之正常結果、無事件、不連線);S3 選項(`option` 容器 3 種、鍵存取器、值 3 種不可讀、8 種可讀非布林取預設)× `insert`/`save`、建構(`opt` 容器 3 種、4 鍵之存取器、3 種不可讀值 × `autoGenPk`/`url`/`db`/`cl`、可讀非布林/非字串不拋錯、`null`/`5`/`''` 原生 `TypeError` 不改寫、標籤拋錯但鍵可讀之 `opt` 可用、`logDetail` 存取器拋錯仍可建構);S4 `u8a`(3 種不可讀 × 索引 0/1、7 種可讀非 `Uint8Array` 維持原訊息);S5 有效輸入不多讀(6 入口之有效陣列容器 `ownKeys` 與 `getOwnPropertyDescriptor` 陷阱 0 次、偽稱 `Map`/`Uint8Array`/`String`/`Array` 標籤之容器 `ownKeys` 陷阱 0 次、有效 `option` 只讀單一鍵、有效 `opt` 不讀標籤);S6(oro557d3 改寫)`selectByPk`/`selectByPkGfs` 之 `pk`:4 種不可讀(已撤銷之 Proxy、`Symbol.toStringTag` 拋錯、`get` 陷阱全拋錯、`get` 陷阱拋錯)× 2 入口 → reject `invalid pk: must be a readable value`、不含 `TRAP`、不連線、`error` 事件恰一次且操作別為該入口、數據參數 `null`、無其他事件、資料庫不變;可讀而非字串(`readable` 清單 19 種〔不含有效字串〕、`ownKeys` 陷阱拋錯之物件、含 NUL、含孤立代理字元)× 2 入口 → `null`、不連線、無事件;拒絕後同一實例仍可查(有效 `pk` 找得到、不存在者 `null`);`select`/`delAll`/`delAllGfs` 不可讀 `find` → `invalid find`(不變);S8(oro557d3 新增)存取器:`option.returnList`/`option.autoInsert` 以 `Proxy` 單鍵陷阱、`option` 另有可讀鍵而僅 `returnList` 拋錯、建構 `opt.<4 鍵>` 以 `Proxy` 單鍵陷阱與存取器(訊息不含 `TRAP`)、`data = [x]` 唯一元素為存取器 × 6 入口(固定詞彙 `invalid data`),及巢狀值維持複製階段原訊息(欄位、`id`、`u8a`、長度大於 1 之陣列第二個元素;拒絕、訊息為 `TRAP`、不寫入不刪除);S7 原始碼掃描(探針在 false 分支內、`isUnreadable` 之讀取範圍、`selectByPk`/`selectByPkGfs` 之 `pk` 探針在 `if (!isestr(pk))` 區塊內且先於 `genClient(`、`chkReadable(` 11 處、固定詞彙 3 處)。規則一之既有測試 `test/api-pk-given.test.mjs` 247 案(oro557d3 僅將 `selectByPk`/`selectByPkGfs` 之不可讀 `pk` 兩案由「回 `null`」改釘 reject `invalid pk: must be a readable value` 並拆為 2 入口〔原 2 案 → 4 案〕,其餘不變)。**oro557d4**(第 557 項全族對齊輪)`api-readable` 增至 **825 案**(452 → 825):S3 `expectRejected` 加 `data === null`(A4)、S4 u8a 不可讀加 `data === null`、S5 加 `insertGfs` 有效 `Uint8Array` 標籤僅讀一次 1 案、S8 〈nested values …〉12 案由斷言 `msg === TRAP` 改釘固定詞彙 + `error` 恰一次 + `data === null`、新增 **S9**(A1~A6 逐代號:A2 拋出值 6 種型別 × 〔建構 4 鍵、`option.returnList`/`option.autoInsert`、`[0]` × 6 入口〕+ 診斷選項例外 2、A3 doc 4 入口 × 〔4 種值 × 5 位置 + 6 種拋出值 × 5 位置 + 不可複製 2〕+ `insertGfs`/`delGfs` 之 `id` 值/存取器/元素/展開 + GFS 範圍對照 + 範圍外(原型存取器)對照 + 同一實例仍可用、A4 入口階段之後之拒絕與逐筆失敗之數據參數不變之對照等 13 案〔S9 共 372 案:A2 74、A3 285、A4 13〕;A1 → S3、A5 → S6、A6 → `api-pk-given`);`api-pk-given` 247 案(案數不變,〈given unreadable id〉3 種 × 6 入口改釘固定詞彙 + `error` 恰一次 + `data === null`);`unit-diagwire` 93 → 97 案(S4 4 案改釘固定詞彙、新增「複製之後讀取原型上之存取器」遮罩 4 案、複製掃描加 `if (data === null)` 4 處之斷言);工具 `test/tools/diagMutRun.mjs` 之 `cloneData-no-mask` 改為 `cloneData-foreign-rethrown`。

**修前紅/修後綠**(修前 = `git archive HEAD src` 之舊碼 + 新測試檔):372 案中 147 紅、225 綠(綠者為對照案:S2、S5、S6 與 S3/S4 之可讀對照案,修前綠為正常);修後 372 綠。**oro557d3**(「修前」= oro557d 交件時之 `src`):新測試 452 案,修前 439 綠/13 紅(S6 不可讀 pk 8、S6 拒絕後同一實例可用 2、S7 pk 掃描 2、S7 盤點數 1),修後 452 綠;`api-pk-given` 247 案修前 243 綠/4 紅(不可讀 pk 改釘 reject 之 4 案),修後 247 綠。**oro557d4**(「修前」= 本輪開始時之工作樹 `src`,即 oro557d3 交件版,搭本輪之 3 個測試檔於複本目錄):`api-readable` 825 + `api-pk-given` 247 + `unit-diagwire` 97 = 1169 案,修前 859 綠/**310 紅**、修後 1169 綠(紅:A3 矩陣 267、S8 巢狀值 12、`api-pk-given` 〈given unreadable id〉18、S4 `u8a` 不可讀之 `data === null` 6、`unit-diagwire` S4 4 + 複製掃描 1、S7 詞彙計數 1、S9 A4 `u8a` 對照 1;綠者為 A1/A2/A5/A6 與 A4 之入口階段之後之對照案——證明該代號修前已合,與探針 724 格〔修前 316 格不同、408 格相同〕一致)。全套 `npm test` 見 `sgud/state/state.md`〈最近一次驗證〉。

**變異**(須轉紅;於 `tmp/oro557d/mut/<名>/` 之複本執行,執行器為一次性腳本,不動 `src/`):33 項全數轉紅、0 存活、0 未套用——規則二 25 項(6 入口之容器探針逐點拿掉、`rejectUnreadable` 不發事件、事件數據參數非 `null`、`save`/`insertGfs` 探針先於判斷〔S5 抓〕、探針拿掉 `ownKeys`/拿掉 `elements:'first'`/拿掉 `[0]` 自讀/`ownKeys` 無條件為 true〔S2、S5 抓〕、`insert` option catch/名稱/returnList 值、`save` option catch/autoInsert 值、`u8a`、建構 autoGenPk/url-db-cl/opt 容器/opt 鍵/`null` opt 被改寫);規則一 8 項(`procPk` 改回 `!isestr`、`''` 視為給了、`chkPk` 放行數字、`del`/`delGfs`/`insertGfs` 之 `chkPk` 拿掉、`selectByPk`/`selectByPkGfs` 不檢核,由 `api-pk-given` 抓)。**oro557d3 增 16 項全轉紅、0 存活**(於 `tmp/oro557d3/mut/<名>/`,執行器 `mut.mjs`;規則 1〔pk〕10 項:探針拿掉 × 2、操作別寫錯 × 2、名稱寫成 `data`、探針提前 × 2〔S7 掃描抓〕、可讀非字串亦 reject × 2、探針加 `ownKeys: true`;規則 2〔存取器〕6 項:`insert` option 存取器改原例外 × 2〔無/有 `error` 事件〕、`save` option 存取器改原例外、`[0]` 存取器改 `throw err`、建構 opt 鍵存取器改 `throw err`/名稱寫成 `opt`);另 `selectByPk`/`selectByPkGfs` 之 `chkOrmStr` 拆出判斷之拿掉 2 項由 S6 抓(`api-pk-given` 不抓);oro557d 既有 33 項(規則二 25、規則一 8)對新碼重跑仍全轉紅。**oro557d4 增 21 項全轉紅、0 存活**(於 `tmp/oro557d4/mut/<名>/`,執行器 `mut.mjs`;A3 15 項:4 個複製處之 `if (data === null)` 各拿掉、`cloneData` 改回轉出外來值、複製處之名稱/操作別寫錯各 1、`insertGfs` 展開之 catch 拿掉/`id` 探針拿掉/`u8a` 探針拿掉/`u8a` 名稱寫成 `data`/`id` 探針誤拒可讀非字串、`delGfs` 讀取之 catch 拿掉/`id` 探針拿掉、`unit-diagwire` 之複製處轉出外來值;A4 4 項:`emitError` 不換 `null`、`mkReadErr` 不登記、其後之拒絕被過度套用、`u8a` 之錯誤改不登記;`u8a` 標籤多讀 2 項:逐筆檢核改回再判一次 `isu8arr`〔S5 標籤計數案抓〕、判定結果寫成恆 `true`)。前兩輪 51 項(規則二 25、規則一 10、`pk` 10、存取器 6;文字依新碼調整)對新碼重跑全轉紅;另 1 項為**等價變異**(`rejectUnreadable` 明傳 `[]` 給 `emitError`,因 `emitError` 對 `readErrs` 一律傳 `null` 而結果不變,預期存活,以 `a4-emitError-ignores-readErrs` 取代之);`test/tools/diagMutRun.mjs` 53 項(`cloneData-no-mask` 因該站點不再有 `diag.err` 而失效,改為 `cloneData-foreign-rethrown`)全轉紅、0 存活、0 未套用。

**已知限制**

1. (**已解除**,2026-11-20 oro557d4,見規則句 10)原:資料元素/巢狀值不可讀不在本規則,於複製階段 reject 該物件所拋之原例外且多數入口不發 `error` 事件(oro557d3 時主控依規則四第 3 點裁維持原訊息);oro557d4 起主控更正為轉固定詞彙 `invalid data: must be a readable value`、`error` 恰一次(數據參數 `null`)。**本限制現改記其範圍**:①複製處只到 `cloneData`(`cloneDeep`)/`{ ...v }` 展開/陣列元素與 `id` 之讀取為止,**複製之後**讀取原型上之存取器、繼承之存取器、`Error` 值之 `message` 等所拋者(例:資料物件為 `Object.create({ get id() { throw … } })`,`cloneDeep` 保留原型,其後 `procPk`/`get(v,'id')` 讀得而拋)屬外來錯誤之診斷出口(V20 ⑥「使用端注入物自拋之文字不在保證內」),維持原例外經 `outErr` 遮除連線憑證、`error` 事件數據參數不變(測試 S9 〈an id accessor on the prototype …〉與 `unit-diagwire` S4 第二組釘住);②GFS 系只讀實際用到之欄位(`insertGfs`:`id`、`u8a` 與展開;`delGfs`:`id`),其餘欄位為已撤銷之 `Proxy` 或巢狀值不可讀者不被讀取而維持成功(S9 對照案釘住);`delGfs` 元素為標籤拋錯/`ownKeys` 陷阱拋錯之物件而 `id` 讀得者維持逐筆結果;③複製處之 catch 不分辨原因,故可讀而無法複製者(原型為 `null` 之 `Date`、過深之巢狀)之訊息亦為 `invalid data: must be a readable value`(不再為原生 `Cannot convert object to primitive value`、`Maximum call stack size exceeded`)。
2. `opt.logDetail`、`opt.funLog` 不可讀者由 wsemi `getDiag` 視為未給(診斷出口永不失敗,dspec C15),本套件不另拒絕。
3. `save` 之 `option.autoInsert` 可讀而非布林值之處理**不變**(原值交給驅動之 `upsert`:`null`、`''`、`5`、包裝物件等皆不插入,`undefined` 取預設 `true`),與 `option.returnList`/`opt.autoGenPk` 之 K3「非布林取預設」不一致;屬既有行為,本次不改(「上列以外之行為不變」),**主控已裁維持(2026-11-20 oro557d3,〈需你決定〉2 A)**。
4. 探針之讀取範圍與判斷函數**逐項同源**(`ownKeys` 只對標籤 `[object Object]` 者、陣列只讀標籤/`length`/`[0]`),故 `ownKeys` 陷阱拋錯之陣列 `Proxy`、`Map` 之 `Proxy` 等(`iseobj`/`isearr` 本不讀鍵)視為可讀而型別不符,維持「無數據」(測試 S2);而 `[object Object]` 標籤者(含 `ownKeys` 陷阱拋錯之物件 `Proxy`)才依 `ownKeys` 判定。與 wsemi `chkReadable` 之 `ownKeys` 超集語意(讀所有型別之自有鍵)相比較窄,為避免對大型位元組容器之讀鍵成本與誤拒。
5. wsemi `chkReadable` 之 `ownKeys` 於 `[object Object]` 對原型鏈各層只讀該層物件之描述子,不對 receiver(`Proxy`)讀描述子,而 `iseobj` 之 `for…in` 找到繼承之可列舉鍵時會對 receiver 觸發 `getOwnPropertyDescriptor` 陷阱(獨立複審實測:`new Proxy(Object.create({ a: 1 }), { getOwnPropertyDescriptor() { throw … } })` 使 `iseobj` 回 `false` 而 `chkReadable(…, { ownKeys: true })` 回 `''`,故 6 入口仍視為「無數據」之正常結果)。屬 wsemi 之讀取範圍缺口(「超集」不成立之一格),本套件不另補自寫探針,已列回饋(`sgud/feedback/feedback.md`),待 wsemi 處置。
6. **事件之數據參數**:`rejectUnreadable` 發出之 `error` 事件數據參數恆為 `null`(含 `option`/`option.returnList`/`option.autoInsert` 不可讀而 `data` 可讀者;與 `select`、`delAll` 之整批失敗事件同為 `null`,與同入口其他整批失敗帶 `data` 陣列者不同);`insertGfs` 之 `u8a` 不可讀走既有通道,事件之數據參數為輸入之 `data` 陣列(含該不可讀值,與同入口其他驗證失敗一致,不改)。
7. `insert` 先讀 `option.returnList` 再判 `data`、`save` 先判 `data` 再讀 `option.autoInsert`:`insert(5, <已撤銷之 Proxy>)` 因先讀 option 而 reject `invalid option: …`,`save(5, <已撤銷之 Proxy>)` 因 `data` 非容器先回 `[]` 而從未讀 option(舊碼同順序,舊碼 `insert` 為原生 `TypeError`);建構時 `opt.autoGenPk` 不可讀而 throw 前,預設之 `url`/`db`/`cl` 已寫入呼叫端之 `opt`(既有之 V9 缺口:建構改寫呼叫端 opt,不在本規則)。

## R-DIAG-01 診斷輸出與對外錯誤值之遮罩(依 dspec〈診斷輸出與遮罩〉;2026-10-29 mig-mongo 遷移至 wsemi 共用模組)

**規格與單一擁有者**:跨套件規格為主控 `C:\opensrcOper\dspec\診斷輸出與遮罩.md`(原則 D1~D5、裁定 Q1~Q4 與 P1~P9;設計 `dnow\20261029002013\agent-out\diag-run01-設計.md` §6);遮罩、摘要、診斷出口之實作與形態規則由 **wsemi** 擁有(`getDiag`、`getDiagSecrets`、`maskDiagText`、`maskDiagCopy`、`maskDiagErr`、`maskDiagUrl`、`getDiagBriefErr`、`genDiagFunLog`;wsemi 之規則帳本 `sgud/rule/rulebook_diag.md` R-DIAG-01 為準,各函數 JSDoc 為用法之準)。本套件**只宣告**秘密來源、代碼集合、具名樣式、`safeKeys` 與呼叫點,**不得另寫等價遮罩**(D1);mongo-run01(2026-10-28)自寫之 `src/getDiag.mjs` 已刪。

**本套件之宣告與規則句**

1. **宣告**(`src/WOrmMongodb.mjs` 建構段,唯一一處):`getDiag(opt, { secrets: getDiagSecrets({ urls: [url] }), codes: ['mongoServer'], patterns: ['mongoHostEcho'], safeKeys: ['mode'] })`。選項(`opt.logDetail` 僅 `=== true`、`opt.funLog` 僅函數)由 `getDiag` 於建構時取快照,其後改動 `opt` 不影響實例;秘密由建構時之 `url` 導出(wsemi 已處理連線字串之複合認證參數、寬鬆百分比解碼、無 `@` 之反向筆誤等)。不宣告 `types`、`nested`、`paths`、`values`(見已知限制 3)。
2. **外來值之 catch 站點包 `diag.err`;套件自身以固定詞彙組成之 reject 不包**(D3、設計 §6.5-1,固定字串被挖空即可反推短密碼)。實作:`ours`(WeakSet)登記本套件自身之錯誤——`ownErr(msg)`(`procPk`、`procDocs`、`insertGfs` 共 4 處 throw;另 `rejectUnreadable` 內 1 處,R-READABLE-01)與 `cvFind`(`cvOrmFind` 之接縫,其 `invalid find: …` 為固定詞彙,使用端存取器拋錯亦被其轉為固定詞彙);`outErr(err)` = `ours.has(err) ? err : diag.err(err)`,各函數批次 `catch` 以 `res = outErr(err)` 取得對外之值(reject 與 `error` 事件之訊息同源)。建構期之 `invalid opt.<名>` throw 為固定詞彙,不包。
3. **逐筆 `err` 於建立時 `diag.mask`**:`save`/`del`/`delGfs` 逐筆失敗(驅動呼叫之外來值)以 `outMsg(err)` = `diag.mask(getErrMsg(err))`;本套件自身之逐筆 `err: msgBad`(`invalid id: …`、`invalid data: …`)原樣。
4. **其餘外來值接縫**:`closeClient`(`finally` 內關閉連線,驅動拋錯經 `diag.err`)、`cloneData`(`insert`/`insertBulk`/`save`/`del` 於 `try` 之外複製使用端輸入;**2026-11-20 oro557d4 起**複製處拋錯者〔存取器與 Proxy 陷阱拋出之外來值〕不再轉出、不經 `diag.err`,一律回 `null` 並由呼叫端 `rejectUnreadable` 走固定詞彙 `invalid data: must be a readable value` + `error` 事件恰一次〔R-READABLE-01 規則句 10〕;複製**之後**才讀取之外來值〔原型上之存取器〕仍於批次 `catch` 經 `outErr` 遮罩)、`genClient`(`new MongoClient(url)` 之同步拋錯,各呼叫點皆在 `try` 內,由批次 `catch` 遮罩;**不再原地遮罩**)。
5. **`emitChange`/`emitError` 之訂閱函數拋錯**:`diag('change handler threw' | 'error handler threw', { mode, ...diag.brief(err) }, () => err, 'log')`:預設只輸出標籤與 `{ mode, errType, errCode? }`,不取細節;`logDetail` 為 `console.log(label, 遮罩副本)`(**level 為 `'log'`**——舊版為 `console.log(err)`,維持 stdout;無 `bare` 參數,logDetail 之標籤不再省略);`funLog(label, safe, detail)` 取代 console。`emitError` 不再遮罩(其同時收自身之固定詞彙錯誤;外來值已於站點遮罩);`data` 為呼叫端輸入,屬回傳契約,不在規則內。
6. **回傳契約**:各操作 resolve 內容、`change`/`error` 事件之 payload 與時機不變(`test/tools/diagGolden.json` 由修改前之 git HEAD 程式產生,**不得以現行程式重產**,見 `test/tools/diagGoldenGen.mjs` 檔頭);改變者僅列於 README〈破壞性變更〉:`logDetail` 輸出格式、對外錯誤值之遮罩範圍(含憑證者為同類別之副本、不再原地改寫;單獨帳號不遮;`***/***`)。

**索引**:站點全集與處置(S1~S10)、盤點指令、對應測試、變異、已知限制(含 P8 結論)見 `sgud/rule/rulebook_diag.md`(節號 R-DIAG-01 不變)。

## R-CLIENTERR-01 連線於操作空檔被中斷時,行程不得因未被監聽之 error 事件而終止(2026-10-31,第 209 項;查證結論:不屬實,src 未改)

**起因**:姊妹套件 w-orm-postgresql(第 162 項)實測「驅動只在無進行中語句時於 client 發 `error` 事件,無人監聽即終止行程」;依共通要求查證本套件 `src` 之 2 處 `.on('error'`(皆為 GridFS 串流,**無任何 `MongoClient` 監聽**)是否涵蓋全部連線物件。

**結論(逐物件,mongodb 驅動 7.5.0〔`node_modules`〕與 7.8.0〔`npm pack` 解包〕讀碼+實測)**:本套件**不需**自掛 `MongoClient` 之 `error` 監聽。驅動於其自建之每個 `EventEmitter` 建構時皆預掛空操作監聽 `this.on('error', noop)`,Node 之「無監聽之 `error` 事件拋出」不會發生;socket 與訊息串流之 `error` 由 `Connection` 自掛(`onSocketError`/`onTransformError` → `cleanup`,只發 `close`,並使在途指令以 `MongoNetworkError` reject)。**唯一不預掛者為 GridFS 之讀/寫串流**(Node `Readable`/`Writable`,驅動以 `destroy(err)`/`callback(err)` 發 `error`),本套件已各自掛 1 處(`_uploadGfs`、`selectByPkGfs`)。

| 物件 | 建立處(src) | 驅動預掛(7.5.0 / 7.8.0 同) | 本套件自掛 | 判準 |
|---|---|---|---|---|
| `MongoClient` | `genClient`(11 站點) | `mongo_client.js:66` noop | 無 | 免(驅動已掛) |
| `Topology`/`Server`/`Monitor`/`ConnectionPool`/`Connection` | 驅動內部 | `topology.js:60`、`server.js:45`、`monitor.js:40`、`connection_pool.js:83`、`connection.js:67` noop;socket 自掛 | 無 | 免 |
| `ClientSession` | `insertBulk` 交易路徑 `client.startSession()` | `sessions.js:41` noop | 無 | 免 |
| `FindCursor`(`toArray`) | `select`、`_findGfs`、`delAll` | `abstract_cursor.js:72` noop | 無 | 免 |
| `GridFSBucket` | `new mongodb.GridFSBucket` 4 處 | `gridfs/index.js:31` noop | 無 | 免 |
| `GridFSBucketWriteStream` | `_uploadGfs`(`openUploadStream`) | **無**(Node `Writable`) | `sm.pipe(ws).on('error')` | 已套 |
| `GridFSBucketReadStream` | `selectByPkGfs`(`openDownloadStreamByName`) | **無**(Node `Readable`) | `sm.on('error')` | 已套 |
| `stream.Readable`(`_uploadGfs` 內 `sm`) | `_uploadGfs` | — | 無(只 `push` 一包資料、不會自發 `error`) | 刻意不掛 |
| `ChangeStream` | 本套件未用 | — | — | 不適用 |

**規則句**

1. 11 個公開函數於「連線池取用連線之前」(操作空檔,含 `connect()` 之後、各指令之間、`close()` 之前)連線被切斷(RST、FIN),行程不終止(離開碼 0、stderr 無未處理之 `error`/reject),該次操作以既有 resolve/reject 回報,不新增通道。
2. 對照組:指令送出後、回應被扣住時被切斷,行程亦不終止。
3. GridFS 上傳/下載串流之 `error` 必由本套件監聽(驅動不預掛);`src` 中 `openUploadStream(`、`openDownloadStream*(` 各恰 1 處且皆緊接 `.on('error'`。
4. `MongoClient` 只在 `genClient` 內建立(R-ORMSTR-01 第 8 點),新增任何自建之驅動物件(如 `ChangeStream`、自建串流)須先確認其 `error` 是否由驅動預掛,未預掛者本套件自掛並經 `diag`(R-DIAG-01)輸出安全摘要。
5. 驅動升版後須重跑本節測試:`api-clienterr` 之「driver contract」案若失敗,表示驅動不再預掛某物件之 `error` 監聽,須補掛(此時本規則由「免」改「須套」)。

**盤點指令**(重跑;結果須與上表一致)

- 本套件之 `error` 監聽:`Grep "\.on\('error'" src/WOrmMongodb.mjs` → 恆為 2 處(`_uploadGfs`、`selectByPkGfs`),皆為 GridFS 串流。
- 驅動預掛:`Grep "this\.on\('error', (utils_1\.)?noop\)" node_modules/mongodb/lib` → 須含 `mongo_client.js`、`sessions.js`、`abstract_cursor.js`、`gridfs/index.js`、`cmap/connection.js`、`cmap/connection_pool.js`、`sdam/topology.js`、`sdam/server.js`、`sdam/monitor.js`。
- 驅動發 `error` 事件之處:`Grep "emit\((\w+\.)?ERROR|emit\('error'" node_modules/mongodb/lib` → 7.5.0 只有 `change_stream.js`(3 處,本套件未用)與 `sdam/topology.js:405`(相容性錯誤,Topology 已預掛,並經 `mongo_client.js:252-253` 之 `MONGO_CLIENT_EVENTS` 轉送至 `MongoClient`,其亦已預掛)。
- 驅動物件之建立:`Grep "new mongodb\.|new MongoClient|openUploadStream|openDownloadStream|\.watch\(|startSession" src/WOrmMongodb.mjs` → 只可命中 `genClient`、`GridFSBucket`(4)、`openUploadStream`(1)、`openDownloadStreamByName`(1)、`startSession`(1)。

**對應測試**(單檔:`npx mocha --no-parallel test/api-clienterr.test.mjs --timeout 180000`)

| 測試檔 | 內容 |
|---|---|
| `test/api-clienterr.test.mjs` + `test/tools/clientErrScenario.mjs` | ①driver contract:驅動物件預掛 `error` 監聽、GridFS 串流為 0、對預掛者發 `error` 不拋;`src` 之 GridFS 串流皆掛監聽、`MongoClient` 單一接縫。②自建容器(standalone 帶認證、replica set 各一)上,每個情境於獨立子行程,經 TCP 代理於**每一個**連線池取用之前以 RST 切斷全部連線(含監控連線)、第 1 個位置另以 FIN 切斷、另有指令送出後回應被扣住再切斷之對照組:11 函數(standalone)+`insertBulk` 交易路徑(replica set),斷言離開碼 0、無未處理之 `error`、有 RESULT、注入確實發生。③變異:拿掉上傳/下載串流之 `error` 監聽(`test/_tmp/clienterr/` 之 src 副本,取代點須恰 1 次),重複鍵/查無檔案及語句進行中之中斷須使行程終止,本套件版同情境不終止。 |

**已知限制**

1. 注入點為驅動內部檔(`lib/cmap/connection_pool.js` 之 `checkOut`、`lib/cmap/connection.js` 之 `command`),僅於子行程內修補;驅動升版移位時子行程以離開碼 4 回報而使測試失敗,須改接縫而非放寬。
2. 未涵蓋:伺服端永久不可用(`serverSelectionTimeoutMS` 預設 30 秒後 reject,屬既有失敗通道)、`docker pause` 之凍結(無 socket 事件,靠驅動心跳逾時)、TLS/代理(`proxyHost`)連線;這些路徑之 socket `error` 同樣由 `Connection` 自掛。
3. 伺服端全域動作之情境(`killAllSessions`、`docker restart`)只在探測期以序列方式實測,未納入 `api-clienterr`(會波及同容器上並行之子行程);其結果與重現法見 `sgud/exp/experience.md`。

## 破壞性變更紀錄

1. **2026-10-17 條件(find)白名單**(第 33 項批 1d;版號由發布流程決定,本次未改 `version`):
   - 白名單外運算子/形狀由「交伺服器」改為本套件入口 reject:`$regex $options $exists $not $nor $where(字串)$expr $text $jsonSchema $comment $type $mod $elemMatch $size $all $bitsAllSet`、地理空間運算子、點路徑(`'a.b'`)、欄位層 `$and/$or`、含 `-`/空白/`$` 開頭之欄名、RegExp 值、陣列值、巢狀物件等值.README/`g-basic.mjs`/`api-basic.test.mjs` 之 `{ name: { $regex: 'PeT', $options: 'i' } }` 改寫(改為 `select` 後於記憶體過濾,或以 `$in`/`$gte` 等白名單內寫法).
   - 現況「靜默放行」改為 reject(修正):`Map`/`Set`/類別實例/僅 Symbol 鍵/條件在原型上之物件/`new String` 頂層;函數值與 Symbol 值(原被 BSON 略過致條件消失→全表)、`undefined` 值(原序列化為 null,命中 null/缺欄列)、稀疏陣列、不可列舉鍵、存取器;`$nin:[]`、`$and:[{}]`、`$or:[{}]`、`$expr:true`(原為恆真,使 `delAll` 刪光全表).`$and:[]`、`$or:[]` 原由伺服器拒收,現改為連線前拒收;`{f:{}}`、`{f:{$ne:[20]}}` 原依文件值/陣列值等值比對(非恆真,視資料而定),現一律 reject.
   - 純量收斂:BigInt、Buffer、NaN、±Infinity、無效 Date、包裝物件、含 NUL 或孤立代理字元之字串 reject(原依 BSON 表示交伺服器比對,多半無命中);`$gt…$lte`、`$in/$nin` 元素不收 `null`.
   - `delAllGfs`/`_findGfs`(含 `delGfs` 逐筆條件)同一白名單;`metadata.*` 點路徑條件不再可用.
   - 不變:`{}`/未給/`undefined` 為全部;白名單內形狀之命中集合(MongoDB 式語意);`select` 回傳去除 `_id`.
   - 無過渡期(fail-closed,dspec〈一之三〉D11).庫外專案若依賴被移除之運算子,改為 `select` 後在記憶體過濾.
2. **2026-10-28 診斷輸出**(R-DIAG-01,mongo-run01;版號由發布流程決定,本次未改 `version`):
   - `change`/`error` 訂閱函數拋錯時,console 預設改為只輸出 `change handler threw { mode, errType, errCode? }` / `error handler threw { … }`,不再輸出整個錯誤(訊息、堆疊、其中的資料值與 id);要還原舊輸出加 `logDetail: true`,或以 `funLog(label, safe, detail)` 接收。連線憑證於所有管道以 `***` 遮罩。
   - 驅動在連線字串無法解析時所拋之錯誤(`Unable to parse 帳號:密碼 with URL` 等,含 `cause.input` 與 stack)中的憑證改為 `***`;類別、原型、訊息前綴不變;不含憑證之訊息不變。
   - 不變:各操作 resolve/reject 內容、`change`/`error` 事件 payload 與時機(對照 HEAD golden)。
3. **2026-10-29 診斷輸出與遮罩改由 wsemi 共用模組擁有**(R-DIAG-01,mig-mongo;需 `wsemi` ≥ 1.9.31;版號由發布流程決定,本次未改 `version`;不保留舊行為):
   - `opt.logDetail` 為 `true` 之輸出由舊版 `console.log(err)` 裸輸出改為 `console.log(label, 錯誤之遮罩副本)`(多標籤、副本不沿用使用端原型,仍為 stdout);預設輸出與 `funLog` 引數不變。
   - 對外之錯誤值(各函數 reject、`error` 事件之訊息、逐筆 `err`):由「只原地遮罩 `new MongoClient` 解析失敗之錯誤」擴及**全部外來錯誤值**(驅動與後端之錯誤、關閉連線之錯誤、使用端輸入存取器於複製時拋出之值);含憑證者為**同類別之副本**(非同一物件、不原地改寫),不含憑證者為原物件;單獨之帳號不遮(`proxyUsername` 之值被回顯時原樣;`CORP/帳號` 遮為 `***/***`);本套件自身以固定詞彙組成之錯誤(`invalid id/data/find/opt…`)不經遮罩。
   - 不變:各操作 resolve 內容、`change`/`error` 事件 payload 與時機(對照 HEAD golden)。
4. **2026-11-19 主鍵「給了而不合格」一律拒絕**(R-PKGIVEN-01,omg492i;wsemi 1.9.69 連動;版號由發布流程決定,本次未改 `version`;不保留舊行為):
   - `insert`/`insertBulk`/`insertGfs`/`save` 之 `id` 為給了而非字串(數字、布林、物件、陣列、`String`/`Number`/`Boolean` 包裝物件、`Symbol`、`BigInt`、`Date`、函式、`Proxy` 等):由「`autoGenPk` 開時靜默換成新 id 寫入;關時 `autoGenPk is false`」改為 `invalid id: not a string at [data[<k>].id]`(`insert`/`insertBulk`/`insertGfs` 整批 reject,`save` 該筆 `ok:0`;不隨 `autoGenPk` 改變)。`save` 於 `autoGenPk:false` 時由整批 reject 改為該筆 `ok:0`。
   - 不變:未帶(`undefined`/`null`/鍵不存在/`''`)之行為;`del`/`delGfs`/`selectByPk`/`selectByPkGfs`;合法字串 id;`opt.autoGenPk`/`option.returnList` 給非布林值取預設(1.9.69 起 `Boolean` 包裝物件不再被視為布林)。
5. **2026-11-20 讀取即拋錯(不可讀)之輸入依原失敗通道拒絕**(R-READABLE-01,oro557d,排程第 557 項;改用 wsemi 1.9.70 之 `chkReadable`;版號由發布流程決定,本次未改 `version`;不保留舊行為):
   - `insert`/`insertBulk`/`save`/`del`/`insertGfs`/`delGfs` 之 `data` 為不可讀(已撤銷之 Proxy、`Symbol.toStringTag`/`ownKeys` 陷阱拋錯、陣列 `length`/`[0]` 讀取拋錯等):由「視為無數據而正常 resolve(`{ n: 0, … }` 或 `[]`)」改為整批 reject `invalid data: must be a readable value`(`error` 事件於 reject 前恰一次,數據參數為 `null`,不連線、不寫入、不刪除)。
   - `insert` 之 `option`/`option.returnList`、`save` 之 `option`/`option.autoInsert` 不可讀:由「reject 原生錯誤(無事件)」或「靜默取預設/交驅動」改為整批 reject `invalid option: …`/`invalid option.returnList: …`/`invalid option.autoInsert: must be a readable value`(`error` 事件恰一次)。
   - `insertGfs` 之 `u8a` 不可讀:訊息由 `invalid data[<k>].u8a` 改為 `invalid data[<k>].u8a: must be a readable value`。
   - 建構 `opt` 容器/鍵不可讀:由同步 throw 原生錯誤/原例外改為 `invalid opt: …`/`invalid opt.<鍵>: must be a readable value`;`opt.autoGenPk` 之不可讀值由「取預設 `true`」改為同步 throw;`opt.url/db/cl` 之不可讀非字串值由「不檢核」改為同步 throw。
   - `selectByPk`/`selectByPkGfs` 之 `pk` 不可讀(已撤銷之 Proxy、`Symbol.toStringTag` 拋錯、`get` 陷阱拋錯等;2026-11-20 oro557d3,主控規則四第 5 點):由「回 `null`」改為整批 reject `invalid pk: must be a readable value`(`error` 事件恰一次,數據參數 `null`,不連線);可讀而非字串(`5`、包裝物件、`{}`、`ownKeys` 陷阱拋錯之物件等)仍回 `null`。
   - 存取器(容器可讀而其成員為拋錯之 getter;oro557d3 核對,不需改碼):建構 `opt.url/db/cl/autoGenPk`、`option.returnList`、`option.autoInsert`、長度為 1 之陣列 `data` 之 `[0]` 於 oro557d 即為固定詞彙,不含存取器所拋之原例外文字(由「原例外/原生錯誤」改固定詞彙已含於上列各項);oro557d4 對拋出值之 6 種型別(Error、字串、`null`、`undefined`、數字、物件)補測釘住。
   - **複製階段之巢狀不可讀值(2026-11-20 oro557d4,第 557 項全族對齊輪 A3;主控更正規則四第 3 點)**:資料內部之 `id`、欄位、列之成員、陣列其後之元素、`u8a` 欄為已撤銷之 `Proxy`、陷阱拋錯之物件或拋錯之存取器,於複製處(`insert`/`insertBulk`/`save`/`del` 之 `cloneDeep`;`insertGfs` 之展開與元素讀取;`delGfs` 之元素與 `id` 讀取)拋錯者:由「reject 該物件所拋之原例外(`insert`/`insertBulk`/`save`/`del` 不發 `error` 事件;`insertGfs`/`delGfs` 發一次且數據參數為呼叫端原值)」改為整批 reject 固定詞彙 `invalid data: must be a readable value`(`error` 事件恰一次、數據參數 `null`,不連線、不寫入、不刪除);可讀而無法複製者(原型為 `null` 之 `Date`、過深之巢狀)之訊息由原生錯誤文字改同一固定詞彙。`insertGfs`/`delGfs` 之 `id` 為不可讀之值(非自有存取器)由「`insertGfs`:`invalid id: not a string`;`delGfs`:該筆 `ok:0` 附 `invalid id: not a string`」改為同上整批 reject(消除與 `insert` 系之不一致)。
   - **A4(同輪)**:`insertGfs` 之 `u8a` 不可讀之 `error` 事件數據參數由呼叫端原值改 `null`(訊息 `invalid data[<k>].u8a: must be a readable value` 不變);入口階段之後之拒絕與逐筆失敗之數據參數不變。
   - 不變:可讀而型別不符(`data` 為 `5`/字串/`null`/`{}`/`[]` 等視為無數據;`returnList`、`autoGenPk` 非布林取預設;`url/db/cl` 非字串不檢核;`opt` 為 `null`/`5` 之原生 `TypeError`);`select`/`delAll`/`delAllGfs` 之 `find` 不可讀 `invalid find`;複製**之後**讀取原型上之存取器等所拋者之診斷出口(已知限制 1);`opt.logDetail`/`opt.funLog` 之讀取(wsemi `getDiag`)。
6. **2026-11-20 主鍵只認自有可列舉之資料屬性,繼承者視為未帶**(R-PKOWN-01,omg569,排程第 569 項全族;版號由發布流程決定,本次未改 `version`;不保留舊行為):
   - `insert`/`insertBulk`/`save` 之列 `id` 為繼承(原型鏈上,如 `Object.create({ id })`、類別原型上之 getter、frozen 原型,不論繼承值之型別)或自有不可列舉(下有繼承值者):`insert`/`insertBulk` 由「寫入無 `id` 欄之列」(繼承字串)或「整批 reject `not a string`」(繼承數字、物件)改為視為未帶——`autoGenPk` 開補新 `id`(UUIDv7,自有可列舉資料屬性,庫內同值之列原封不動)、關整批 reject `invalid data[<k>].id, autoGenPk is false`;`save` 由「以繼承值為查詢條件覆寫同值之列或以該值新增」(繼承字串)或「該筆 `ok:0`」(繼承數字、物件)改為同上。
   - `del`/`delGfs` 之列 `id` 為繼承字串(`delGfs` 另含自有不可列舉者):由「刪除庫內同值之列/檔案」改為該筆 `ok:0` 附 `invalid id: not a string at [data[<k>].id]`,不刪除、每筆一次 `error` 事件。
   - 不變:自有可列舉之 `id`(含自有遮蔽繼承、自有存取器)、`id` 為 `undefined`/`null`/`''`/鍵不存在、繼承空字串(修前即未帶)、繼承數字/物件於 `del`/`delGfs`(`not a string`);`insertGfs`(展開複本只含自有可列舉屬性,修前即合規);`selectByPk`/`selectByPkGfs`(純量);非主鍵欄之繼承欄位(BSON 不寫入);鍵全在原型上之單一物件(無數據早退)。

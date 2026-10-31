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

1. **主鍵**(`chkPk`):須為原始字串,不得為空字串、含 NUL 或孤立代理字元;`String` 包裝物件視為非字串(`isestr` 認為是字串,但 BSON 會把它以字元索引存成子文件)——訊息 `invalid id: <原因> at [data[<k>].id]`,原因 ∈ {`not a string`、`string is empty`、`string contains NUL`、`string contains lone surrogate`}.
2. **寫入資料**(`chkDoc`:先 `chkPk` 再 `chkOrmData(v, { root: 'data[<k>]' })`):字串值與鍵名(含巢狀、陣列元素、Map/Set、RegExp.source、Error.message 等 `chkOrmData` 走訪者)不得含孤立代理字元,值之 NUL 不檢查(`chkOrmData` 預設)——訊息 `invalid data: <原因> at [data[<k>].<路徑>]`.同一文件主鍵先於資料;同一物件鍵名先於值;同批以索引最小者為準.
3. **位址**:`opt.url`、`opt.db`、`opt.cl` 為字串且含孤立代理字元者建構時 throw `invalid opt.<名>: string contains lone surrogate`(不檢查 NUL;非字串維持既有行為).**建構時即取值為區域變數 `url`/`db`/`cl`**,其後一律使用該值(檢查之值即使用之值),建構後改動 `opt` 不影響本實例(行為變更,README 載明).
4. **處置(與既有「無效主鍵」同形)**:`insert`/`insertBulk`/`insertGfs` 於建立 `MongoClient` 與任何寫入**之前**整批檢核,任一筆不合格即整批 reject(`emitError` 於 reject 前恰一次、`change` 不發、不連線、不寫任何一筆);`save`/`del`/`delGfs` 該筆 `{ok:0, err}`(`save` 為 `n:1`、`nInserted:0`、`nModified:0`,`del`/`delGfs` 為 `n:0`、`nDeleted:0`——沿用規格與既有形狀),同批其他筆照常,每個失敗筆各發一次 `error`(`data` 為 `[v]`),整批仍發一次 `change`;**同批皆不合格時不建立 `MongoClient`**;`selectByPk`/`selectByPkGfs` 回 `null`(不連線、不發事件);`select`/`delAll`/`delAllGfs` 之條件依 R-FIND-01(`invalid find`).
5. **檢查之值即使用之值**:`insert`/`insertBulk`/`save`/`del` 於 `cloneDeep` 複本上檢核與使用;`insertGfs` 於淺拷貝 `{ ...v }` 上檢核與使用(只寫入 `id` 與 `u8a`,不深拷貝大型位元組);`delGfs` 先複製為普通陣列再僅取一次 `id`(`ids[k]`);`del` 同樣只取一次 `ids[k]`;`selectByPk`/`selectByPkGfs` 之 `pk` 為原始字串.以上皆在第一個 `await` 之前同步完成(呼叫後立即改動原輸入不影響).
6. **訊息**:固定詞彙、不回顯值;`save`/`del`/`delGfs` 逐筆迴圈取批次索引(`pmSeries` 回呼第二參數 `k`);原 `invalid id[<回顯值>]` 一併去回顯(主控裁示 D6).`autoGenPk:false` 而未帶有效 `id` 之既有訊息 `invalid data[<k>].id, autoGenPk is false` 不變(整批 reject,先於同一筆之良構檢核).
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
| `selectByPk` | :485(檢核 :489) | `!isestr(pk) \|\| chkOrmStr(pk) !== null` → `null` | 已套 |
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

## R-DIAG-01 診斷輸出與對外錯誤值之遮罩(依 dspec〈診斷輸出與遮罩〉;2026-10-29 mig-mongo 遷移至 wsemi 共用模組)

**規格與單一擁有者**:跨套件規格為主控 `C:\opensrcOper\dspec\診斷輸出與遮罩.md`(原則 D1~D5、裁定 Q1~Q4 與 P1~P9;設計 `dnow\20261029002013\agent-out\diag-run01-設計.md` §6);遮罩、摘要、診斷出口之實作與形態規則由 **wsemi** 擁有(`getDiag`、`getDiagSecrets`、`maskDiagText`、`maskDiagCopy`、`maskDiagErr`、`maskDiagUrl`、`getDiagBriefErr`、`genDiagFunLog`;wsemi 之規則帳本 `sgud/rule/rulebook_diag.md` R-DIAG-01 為準,各函數 JSDoc 為用法之準)。本套件**只宣告**秘密來源、代碼集合、具名樣式、`safeKeys` 與呼叫點,**不得另寫等價遮罩**(D1);mongo-run01(2026-10-28)自寫之 `src/getDiag.mjs` 已刪。

**本套件之宣告與規則句**

1. **宣告**(`src/WOrmMongodb.mjs` 建構段,唯一一處):`getDiag(opt, { secrets: getDiagSecrets({ urls: [url] }), codes: ['mongoServer'], patterns: ['mongoHostEcho'], safeKeys: ['mode'] })`。選項(`opt.logDetail` 僅 `=== true`、`opt.funLog` 僅函數)由 `getDiag` 於建構時取快照,其後改動 `opt` 不影響實例;秘密由建構時之 `url` 導出(wsemi 已處理連線字串之複合認證參數、寬鬆百分比解碼、無 `@` 之反向筆誤等)。不宣告 `types`、`nested`、`paths`、`values`(見已知限制 3)。
2. **外來值之 catch 站點包 `diag.err`;套件自身以固定詞彙組成之 reject 不包**(D3、設計 §6.5-1,固定字串被挖空即可反推短密碼)。實作:`ours`(WeakSet)登記本套件自身之錯誤——`ownErr(msg)`(`procPk`、`procDocs`、`insertGfs` 共 4 處 throw)與 `cvFind`(`cvOrmFind` 之接縫,其 `invalid find: …` 為固定詞彙,使用端存取器拋錯亦被其轉為固定詞彙);`outErr(err)` = `ours.has(err) ? err : diag.err(err)`,各函數批次 `catch` 以 `res = outErr(err)` 取得對外之值(reject 與 `error` 事件之訊息同源)。建構期之 `invalid opt.<名>` throw 為固定詞彙,不包。
3. **逐筆 `err` 於建立時 `diag.mask`**:`save`/`del`/`delGfs` 逐筆失敗(驅動呼叫之外來值)以 `outMsg(err)` = `diag.mask(getErrMsg(err))`;本套件自身之逐筆 `err: msgBad`(`invalid id: …`、`invalid data: …`)原樣。
4. **其餘外來值接縫**:`closeClient`(`finally` 內關閉連線,驅動拋錯經 `diag.err`)、`cloneData`(`insert`/`insertBulk`/`save`/`del` 於 `try` 之外複製使用端輸入,存取器與 Proxy 陷阱拋出之值經 `diag.err`;拋出位置在 `try` 外故仍不發 `error` 事件,同修改前)、`genClient`(`new MongoClient(url)` 之同步拋錯,各呼叫點皆在 `try` 內,由批次 `catch` 遮罩;**不再原地遮罩**)。
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

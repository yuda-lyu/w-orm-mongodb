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
8. **`client = genClient()`(原 `new MongoClient(url)`,R-DIAG-01-5 起經 `genClient` 遮罩連線設定錯誤)一律在 `try` 內**(11 個函數):`url` 解析失敗(`Invalid scheme`、`Protocol and host list are required`)時同步拋錯,須走 `catch → emitError → reject`,`error` 事件於 reject 前恰一次(審計 §3.9;修前 8 函數於 `try` 外,reject 而不發 `error`).`finally` 以 `client !== null` 防護 `close()`.

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

## R-DIAG-01 診斷輸出之單一出口與預設安全(2026-10-28,mongo-run01)

規格:主控任務書(第 153 項同型之個資輸出;`C:\opensrcOper\dnow\20261028054319`)。選項名稱與語意比照 w-serv-orm 1.1.20(`opt.logDetail`、`opt.funLog(label, safe, detail)`),同批 w-orm-reladb 1.1.16、w-serv-webdata 1.1.18 已完成;各套件自行實作,不抽到 wsemi。

**成因**:服務的 console 常被收進日誌系統,`emitChange`/`emitError` 內 catch 原以 `console.log(err)` 輸出訂閱函數所拋之整個錯誤(其訊息可含主鍵、資料值、連線字串);另驅動在 `new MongoClient(url)` 解析失敗時所拋之錯誤(訊息、stack、`cause.input`)會回顯連線字串中的 `帳號:密碼` 片段(缺 `@主機` 時被當成 host:port,實測 `Unable to parse 帳號:密碼 with URL`)。

**單一擁有者**:`src/getDiag.mjs`(`getOptLog`、`getSecrets`、`maskText`、`cpMask`、`maskErr`、`getDiag`、`getBriefErr`)。`WOrmMongodb.mjs` 內**不得**直接呼叫 `console`、寫 `process.stdout/stderr`、`emitWarning`;不得使用 Node 內建模組於 `getDiag.mjs`(dist 由 rollup 打包,`toolg/gDistRollup.mjs` 之 external 只列 events、stream、mongodb)。

**規則句**

1. **單一出口**:src 內所有診斷輸出經 `diag(label, safe, getDetail, bare)`。`diag` 於建構時由 `getDiag(getOptLog(opt), getSecrets(url))` 建立,選項取值為建構時快照(其後改動 `opt` 不影響實例),憑證由建構時之 `url` 導出。
2. **預設只輸出標籤與不含個資之摘要**:`change handler threw { mode, errType, errCode? }`、`error handler threw { mode, errType, errCode? }`。`mode` 為函數名(固定詞彙);`errType` 為錯誤建構子名稱(須合 `^[A-Za-z][A-Za-z0-9_]{0,39}$`,否則 `Error`;非 Error 值為 `string`/`object`/`null`/`number` 等型別名);`errCode` 僅放行機器代碼(絕對值至 99999 之整數、`E…`/`ERR_…` 字串)。不輸出訊息、堆疊、資料值、id。摘要值若恰等於已知憑證(如數字密碼同時為代碼)以 `***` 取代(`maskSafe`)。預設時不取細節(`getDetail` 不被呼叫)。
3. **`opt.logDetail`**:僅 `=== true` 生效,其餘值(含字串 `'true'`、`1`)忽略並用預設,與本套件其他選項(`autoGenPk` 型別錯誤即用預設)一致;`true` 時 console 裸輸出遮罩後之錯誤(`bare=true`,與舊版 `console.log(err)` 同格式)。
4. **`opt.funLog(label, safe, detail)`**:僅函數生效;給予時診斷輸出只交給它、不寫 console;`detail` 為 `cpMask` 遮罩拷貝(不改動原物件、不沿用原型、不執行 getter 與 `inspect.custom`、深度 6/節點 2000 為界);它拋錯或回傳 reject 之 promise/thenable 皆被吞下。
5. **連線字串與帳密於任何輸出管道一律 `***`**:`getSecrets(url)` 列出整串連線字串、帳密段(嚴格解析〔第一個 `/ ? #` 之前,最後一個 `@` 為界〕與寬鬆解析〔整串最後一個 `@`〕取聯集,故路徑/查詢字串含 `@` 不漏)、單獨密碼、單獨帳號、`@` 後不合主機樣式之項(無 `@` 時全部主機項)、查詢參數中名稱含 `pass|pwd|secret|token|credential|user` 者之值(不含單獨之 `key`:`checkKeys` 為布林選項)與 `authMechanismProperties` 內名稱含上列字樣之屬性值(`SERVICE_NAME`、`CANONICALIZE_HOST_NAME` 為一般設定值,不遮),各取原樣、寬鬆百分比解碼、URL 編碼、空白換 `%20`、`+` 視為空白、`;` 分段等驅動可能回顯之形式;**所有項目短於 3 字元(`SECRET_MIN`)者一律不列**(列入會把標籤、訊息、堆疊、路徑中的同字元一併吞掉,如操作別 `select` 變 `s***l***ct`;其本身也無保密價值);`maskText` 另遮罩 `scheme://帳密@`(取至最後一個 `@`,不跨 `? #`);`cpMask` 遮罩字串值、屬性鍵(含陣列之非索引鍵)、Symbol 描述與同值數字(≥4 位);摘要(`safe`)中固定詞彙之鍵 `mode` 不經遮罩。`opt.url` 為 `String` 包裝物件(驅動接受)時同字串處理。
6. **R-DIAG-01-5 連線設定錯誤之遮罩**:`new MongoClient(url)` 一律經 `genClient()`(11 處),其 `catch` 以 `maskErr(err, secretsConn)` **原地**遮罩同一錯誤物件之 message、stack(僅內建 getter 才讀取並改為資料屬性)、自有字串欄位與 `cause` 鏈,再往外拋;錯誤類別、原型、訊息前綴不變;改寫只變更 `value`(沿用原屬性的 writable/enumerable/configurable),不可設定但可寫者改以賦值。`secretsConn = getSecrets(url, true)`:不含單獨帳號——**除非帳號含驅動拒收之未編碼字元 `/ ? # [ ] @`**(驅動於 `Username contains unescaped characters <帳號>` 回顯);不含短於 4 字元之單獨密碼與查詢值。另**不依賴已知秘密**:`maskHostEcho` 對驅動回顯之 `Unable to parse <主機位址> with URL` 與 `cause.input`(`iLoveJS://<主機位址>`)中不合主機樣式者(`^[A-Za-z0-9._-]+|[IPv6]` 加最多 5 位數字之 port,逗號分隔)一律取代——驅動回顯前會把空白等字元正規化(如 `%20`),與連線字串原文不同,僅靠字串比對遮罩不到。不含憑證之解析失敗訊息與驅動原訊息逐字相同。建構函式自身之訊息(`invalid opt.<名>: string contains lone surrogate`)為固定詞彙,不回顯,無需遮罩。
7. **回傳契約不變**:各操作 resolve/reject 內容、`change`/`error` 事件 payload 與時機不變(僅診斷輸出;及第 6 點在錯誤本就含憑證時之訊息)。固定預期值 `test/tools/diagGolden.json` 由**修改前之 git HEAD** 程式執行 `test/tools/diagScenario.mjs` 產生,**不得以現行程式重產**(重現法見 `test/tools/diagGoldenGen.mjs` 檔頭)。

**站點全集與判準**(行號為 2026-10-28 實作後;日後以函數名為準)

| 站點 | 檔案:行 | 修前輸出 | 判準 |
|---|---|---|---|
| `emitChange` catch | `src/WOrmMongodb.mjs:177` | `console.log(err)` | 須改 → `diag('change handler threw', …, true)` |
| `emitError` catch | `:199` | `console.log(errEmit)` | 須改 → `diag('error handler threw', …, true)` |
| `new MongoClient(url)` 驅動解析錯誤 | `:134 genClient`;呼叫點 `:466 :538 :639 :889 :1143 :1245 :1390 :1495 :1638 :1762 :1923` | 經 reject 與 `error` 事件往外(非 console),含帳密片段 | 須改 → `maskErr`(R-DIAG-01-5) |
| 其餘 `console`/`process.stdout|stderr`/`emitWarning`(src) | — | 0 處 | — |
| 已註解之 console | `src/` 0 處 | — | — |
| 驅動自身日誌(`MONGODB_LOG_*`、`mongodbLogPath`)與 `process.emitWarning`(過時選項) | `node_modules/mongodb/lib/mongo_logger.js`、`utils.js:794` | 預設關閉;開啟後輸出指令與資料 | 可留(由環境變數明示開啟,不經本套件出口;README 載明) |
| 驅動執行期連線錯誤(認證失敗、連不上) | 驅動 | 實測只含位址或固定文字 | 可留(`api-diaglog` 觀察案釘住不含帳密) |
| 範例/工具 `g-basic.mjs`、`g-gfs.mjs`、`g-unique.mjs`、`toolg/*` | repo 根 | 示範程式 console | 非 src,不計 |

**盤點指令**(重跑;結果須與上表一致)

- `Grep "console\.|process\.(stdout|stderr)|emitWarning" src/` → 只可命中 `src/getDiag.mjs`(`getDiag` 內 `console.log`)。
- `Grep "new MongoClient|genClient" src/WOrmMongodb.mjs` → `new MongoClient` 恆為 1 處(`genClient` 內);`client = genClient()` 恆為 11 處。
- `Grep "^import" src/getDiag.mjs` → 0 處(不使用內建模組)。
- `Grep "diag\(" src/WOrmMongodb.mjs` → 2 處(`emitChange`、`emitError`)。

**對應測試**(`npm test` 即全跑;單檔:`npx mocha test/unit-diaglog.test.mjs --timeout 60000`)

| 測試檔 | 內容 |
|---|---|
| `test/unit-diaglog.test.mjs`(不連線) | 單一出口掃描;`getOptLog`;`getSecrets`(各形態、`isConn`、不丟例外);`maskText`;`cpMask`(鍵、Symbol、數值、原型、getter、Error、循環、上限);`getDiag`(預設/logDetail/funLog/吞錯/防禦遮罩);`getBriefErr`;`maskErr`;11 個公開函數 × `error` 訂閱函數拋錯、`change` 站點(離線)、非 Error 值、選項型別錯誤、快照 |
| `test/unit-urlerr.test.mjs`(不連線) | 36 種連線字串形態(含外審揭露之:帳號含未編碼字元、`@` 在查詢字串、空白/`+`/`;`/不完整 `%`、無 `=` 參數、`proxyUsername`、`String` 包裝物件、`checkKeys`/`SERVICE_NAME` 不得被遮、單字元帳號不得吞同字元)× 11 個公開函數:reject 為遮罩後同一類別之錯誤、訊息逐字等於預期、message/stack/cause/inspect 無憑證、`error` 事件 payload;建構函式固定詞彙;非字串 url;spy 驗 `MongoClient` 仍以原 url 建立;子行程未捕獲 reject 之 stderr |
| `test/api-diaglog.test.mjs`(自建 docker 容器) | 8 個會發 `change` 之函數 + `error` 站點之預設輸出;`logDetail`(含舊版格式);`funLog`;選項型別/快照;回傳契約對照 HEAD golden(連線情境 11 函數成功與失敗路徑 + 事件 payload;不連線情境);驅動執行期連線錯誤不含帳密 |
| `test/tools/diagScenario.mjs`、`diagGoldenGen.mjs`、`diagGolden.json`、`urlerrWorker.mjs` | 共用情境、golden 產生器、golden(HEAD 產生)、子行程腳本 |

**變異**(須轉紅;於 `./tmp/mongo-run01/mutwork/` 複本執行,不動 `src/`;執行器 `tmp/mongo-run01/mut/run.mjs`,tmp 被 `.gitignore`):見 `sgud/exp/experience.md`〈mongo-run01〉。

**已知限制**

1. 驅動自身日誌(`MONGODB_LOG_*`)與 `process.emitWarning` 不經本套件出口(預設關閉,環境變數明示開啟)。
2. 短於 3 字元之單獨帳號或密碼不遮罩(`SECRET_MIN`);連線設定錯誤之遮罩不含一般的單獨帳號(驅動僅在帳號含未編碼字元時回顯,該情形已遮罩);`logDetail`/`funLog` 細節中單獨帳號 ≥3 字元才遮罩。
3. 反向筆誤 `host:port@帳號:純數字且 ≤5 位之密碼`:`@` 後之 `帳號:密碼` 合主機樣式而被視為主機位址保留(僅在驅動因其他原因拋出解析錯誤並回顯該項時才會出現)。
4. 摘要之 `errType` 為建構子名稱:程式識別字不能證明無個資(樣式白名單),不要把個資放進自訂錯誤類別名稱。
5. `cpMask` 副本對自訂 Error 類別只保留類別名稱(`name` 取原型上之資料屬性或建構子名稱)與同名空殼建構子(副本原型為「只帶同名建構子之空殼」,其上層為內建 `Error.prototype`,使 `util.inspect` 首行與原錯誤一致),不沿用使用端原型;`Map`/`Set` 以 `'[Object]'` 代替;節點預算用盡時其餘鍵不複製並加 `'[Truncated]': true` 標記鍵。
6. 不使用 `util.types`(不引入內建模組),故**無法偵測 Proxy**:使用端拋出 Proxy 物件時,摘要與拷貝可能觸發其 trap(拋錯一律被吞下);README 已載明。
7. 摘要之 `errCode` 僅放行 `E[A-Z_]{2,30}`(不含數字)與 `ERR_…`、絕對值 ≤99999 之整數;`errType` 為程式識別字樣式——樣式不能證明無個資,勿把個資放進自訂錯誤類別名稱或 `code`。

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

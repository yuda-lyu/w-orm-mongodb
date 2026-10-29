# w-orm-mongodb
An operator for mongodb in nodejs.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![license](https://img.shields.io/npm/l/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![npm download](https://img.shields.io/npm/dt/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![npm download](https://img.shields.io/npm/dm/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-orm-mongodb.svg)](https://www.jsdelivr.com/package/npm/w-orm-mongodb)

## 破壞性變更

### 字串良構檢核(`w-orm-*`系列一致，詳見下方「字串良構檢核」)

MongoDB的BSON會把孤立代理字元(UTF-16代理對被拆開後只剩一半，`String.prototype.isWellFormed()`為`false`者)無聲改寫為`U+FFFD`，使不同的`id`寫成同一個`id`(`insert`誤判已存在、`save`覆寫他筆、`del`誤刪他筆、`selectByPk`命中他筆)，文件內不同鍵名撞成同一鍵(值被覆蓋)，寫入值與讀回值不同。本版起於到達MongoDB之前檢核並拒收，不設過渡期：

| 項目 | 原行為 | 現行為 |
|---|---|---|
| 主鍵`id`含孤立代理字元或NUL | 被BSON改寫為`U+FFFD`(NUL則照存)而命中或覆寫他筆 | `insert`/`insertBulk`/`insertGfs`整批`reject`且不寫入任何一筆；`save`/`del`/`delGfs`該筆`ok: 0`附`err`，同批其他筆照常；`selectByPk`/`selectByPkGfs`回`null` |
| 寫入資料(`insert`/`insertBulk`/`save`)之字串值、鍵名(含巢狀物件、陣列元素、`Map`/`Set`內容)含孤立代理字元 | 被BSON改寫為`U+FFFD`，鍵名撞鍵時值被覆蓋 | `insert`/`insertBulk`整批`reject`；`save`該筆`ok: 0`附`err`。值與鍵名之NUL不檢查(鍵名含NUL仍由驅動拒收) |
| `opt.url`、`opt.db`、`opt.cl`含孤立代理字元 | 兩個不同名稱改寫後共用同一資料表 | 建構時`throw` |
| 非字串、空字串之`id`的`del`/`delGfs`錯誤訊息 | `invalid id[<回顯值>]` | 固定詞彙、不回顯值：`invalid id: not a string at [data[<k>].id]`、`invalid id: string is empty at [data[<k>].id]` |
| `String`包裝物件(`new String('a')`)作為`id` | 被BSON以字元索引存成子文件(`{ 0: 'a' }`)，`selectByPk('a')`查不到 | 視為非字串而拒收(`invalid id: not a string …`) |
| `delGfs`之`id`含NUL或孤立代理字元 | 該筆`ok: 0`，`err`為`invalid find: …` | 該筆`ok: 0`，`err`為`invalid id: … at [data[<k>].id]`，且`insertGfs`同樣拒收，不再有「可寫入卻刪不掉」之不對稱 |
| 建構後改動`opt.url`/`opt.db`/`opt.cl` | 每次呼叫皆重讀`opt`，改動即時生效 | 建構時即取值並檢核，其後一律使用該值(檢查之值即使用之值)，建構後改動`opt`不影響已建立之實例，須重新建構 |
| `opt.url`無效(如`http://…`、`mongodb://`、`not a url`) | `selectByPk`、`insert`、`insertBulk`、`save`、`del`、`insertGfs`、`selectByPkGfs`、`delGfs`同步`reject`但**不發`error`事件** | 11個函數一致：`reject`，且`error`事件於`reject`前恰發一次 |

錯誤訊息一律為固定詞彙、不回顯值，與`select`/`delAll`之`invalid find`同一系列詞彙(見下方「字串良構檢核」)。

### 條件(find)白名單

`select(find)`、`delAll(find)`、`delAllGfs(find)`之條件(find)改為**系列條件白名單**(`w-orm-*`系列一致，詳見下方「條件(find)白名單」)，白名單外之輸入一律於到達MongoDB之前以`invalid find: 原因 at [路徑]`整批`reject`，不設過渡期：

| 項目 | 原行為 | 現行為 |
|---|---|---|
| `$regex`、`$options`、`$exists`、`$not`、`$nor`、`$where`、`$expr`、`$text`、`$jsonSchema`、`$comment`、`$type`、`$mod`、`$elemMatch`、`$size`、`$all`、地理空間等運算子 | 交由MongoDB伺服器處理(`$where`字串會於伺服器執行) | `reject` |
| 點路徑(`{ 'a.b': 1 }`)、含連字號或空白之欄名、欄位層`$and`/`$or`、RegExp值、陣列值、巢狀物件等值 | 交由MongoDB伺服器處理 | `reject` |
| 頂層為`null`、陣列、字串、數字、布林、函數、`Date`、`Map`、`Set`、類別實例等非條件物件 | 部分被驅動拒收；`Map`、`Set`、類別實例、僅Symbol鍵之物件被放行 | 一律`reject`，不視為`{}` |
| 函數值、Symbol值、不可列舉鍵、稀疏陣列之洞 | 被BSON序列化略過，條件消失(`delAll`刪光全表) | `reject` |
| 存取器(getter)屬性、Symbol鍵 | 存取器於序列化時被執行；Symbol鍵被忽略 | `reject` |
| `undefined`值 | 被序列化為`null`，命中欄位為`null`或缺欄之數據 | `reject` |
| NaN、±Infinity、無效`Date`、BigInt、Buffer、字串含NUL或孤立代理字元 | 依BSON表示交由MongoDB伺服器比對(多半無命中) | `reject` |
| `$nin: []`、`$and: [{}]`、`$or: [{}]`、`$expr: true` | 條件為恆真，`delAll`刪光全表 | `reject` |
| `$and: []`、`$or: []` | 由MongoDB伺服器拒收 | `reject`(改為連線前拒收，訊息為`invalid find: ...`) |
| `{ f: {} }`、`{ f: { $ne: [20] } }` 等文件值或陣列值之等值比對 | 交由MongoDB伺服器依文件值或陣列值比對 | `reject` |
| `$gt`、`$gte`、`$lt`、`$lte`之`null`值，`$in`、`$nin`元素含`null` | 交由MongoDB伺服器處理 | `reject`(`null`僅可用於欄位等值、`$eq`、`$ne`) |
| `delAllGfs`之GridFS條件 | `metadata.*`等點路徑可用 | 同一白名單，點路徑不可用(`delGfs`之`id`含NUL或孤立代理字元者改由主鍵檢核拒收，見上方「字串良構檢核」) |

未變：`{}`、未給、`undefined`皆代表全部；白名單內之條件，命中集合不變(MongoDB式語意)；`select`回傳仍不含`_id`。需要被移除之功能者(如模糊比對)，請改為`select`後於記憶體過濾。

### 診斷輸出與對外錯誤值之遮罩(`opt.logDetail`、`opt.funLog`，`w-orm-*`系列一致)

本套件自行輸出的只有一種情形：`change`或`error`事件的訂閱函數拋錯(該錯誤不影響操作結果，故僅被吞下並輸出)。所有輸出皆經**單一出口**：[wsemi](https://github.com/yuda-lyu/wsemi)之`getDiag`(遮罩、摘要、輸出規則皆由wsemi之共用模組`getDiag`、`getDiagSecrets`、`maskDiagText`、`maskDiagCopy`、`maskDiagErr`、`getDiagBriefErr`擁有，各函數之用法與已知限制見其說明；本套件只宣告秘密來源、代碼集合與具名樣式，不另寫遮罩)。服務的console常被收進日誌系統，訂閱函數所拋錯誤的訊息可能帶有主鍵(下游系統中可能是使用者識別或電子郵件)、資料值或連線字串，不應預設落入日誌，故**預設只輸出固定標籤與不含個資之摘要**。連線字串與帳密(`opt.url`整串、帳密段、密碼、URL編碼與解碼形式、查詢參數中名稱含`pass`/`pwd`/`secret`/`token`/`credential`/`user`者之值，如`tlsCertificateKeyFilePassword`、`proxyPassword`、`proxyUsername`與`authMechanismProperties`內的`AWS_SESSION_TOKEN`)於**診斷輸出之任何管道**(預設、`logDetail`、`funLog`)一律以`***`取代。

| 選項 | 預設 | 說明 |
|---|---|---|
| `opt.logDetail` | `false` | 為`true`時於console輸出標籤與遮罩後之細節(`console.log(label, 訂閱函數所拋之錯誤之遮罩副本)`)。可能含資料值與id，**僅供除錯**。非`true`之值一律忽略並用預設(型別錯誤處理同`opt.autoGenPk`)。 |
| `opt.funLog` | 無 | 函數`(label, safe, detail)`。給予時診斷輸出**只**交給它、不寫console。`label`為固定標籤，`safe`為不含個資之摘要(只含`mode`、`errType`、`errCode`)，`detail`為完整細節(無細節時不帶此引數)，其中連線憑證已以`***`取代，供使用端自行遮罩或轉送至自己的日誌。`detail`是**遮罩拷貝**且有大小與深度上限(規則見wsemi之`maskDiagCopy`)，不會執行使用端的getter、自訂`inspect`等程式，不改動原物件。非函數之值忽略；`funLog`拋錯、回傳reject之原生promise，皆不影響操作。 |

兩個選項皆於建構時取值，其後改動`opt`不影響已建立之實例。

預設輸出：

| 位置 | 舊版 | 現在 |
|---|---|---|
| `change`訂閱函數拋錯 | `console.log(err)`：整個錯誤，含訂閱函數自行放入訊息的任何內容 | `change handler threw { mode: 'insert', errType: 'Error' }`：操作別、錯誤類別，以及(有時)機器代碼(`ECONNREFUSED`類、`ERR_`開頭、不大於99999的整數) |
| `error`訂閱函數拋錯 | `console.log(errEmit)` | `error handler threw { mode: 'select', errType: 'Error' }` |

```alias
// 正式環境: console上只有標籤與摘要
let wo = WOrm({ url, db, cl })

// 除錯: 輸出標籤與遮罩後細節(連線憑證仍遮罩)
let wd = WOrm({ url, db, cl, logDetail: true })

// 轉送至自己的日誌，自行遮罩
let wf = WOrm({
    url, db, cl,
    funLog: (label, safe, detail) => {
        logger.info({ label, safe }) // safe不含個資
        // detail含完整文字、鍵與值(僅連線憑證已遮罩)，離開行程前請自行遮罩
    },
})
```

**破壞性變更**(診斷輸出與遮罩改由wsemi之共用模組擁有，需`wsemi`≥1.9.31，不保留舊行為)：各函數 resolve 之內容、`change`與`error`事件之 payload 與時機皆與舊版相同(有固定預期值測試逐一比對)，改變的是下列輸出與錯誤值：

- **`opt.logDetail`為`true`之輸出格式**：由舊版的`console.log(err)`裸輸出，改為`console.log(label, 錯誤之遮罩副本)`——多了標籤(`change handler threw`或`error handler threw`)，細節為遮罩後之**副本**(不沿用使用端之原型)，仍輸出至stdout。預設輸出(只有標籤與摘要)與`funLog`之引數不變。
- **對外之錯誤值(各函數之`reject`、`error`事件之訊息引數、`save`/`del`/`delGfs`逐筆結果之`err`)**：舊版只對`new MongoClient(url)`解析連線字串失敗之錯誤做**原地**遮罩；本版起擴及**全部**外來錯誤值(驅動與後端拋出之錯誤、關閉連線之錯誤、使用端輸入之存取器於複製時拋出之值)：含連線憑證者(整串連線字串、帳密段、`帳號:密碼`並列形式、密碼(4字元以上)、查詢參數中名稱含`pass`/`pwd`/`secret`/`token`/`credential`/`user`者之值、`authMechanismProperties`內之秘密屬性值、畸形連線字串之片段，含其百分比解碼、URL編碼等驅動可能回顯之形式，另含驅動回顯之`Unable to parse <主機位址> with URL`中不合主機樣式者)以`***`取代，如`Unable to parse *** with URL`。
  - **含憑證者改為「同類別之副本」，不再原地改寫**：副本與原錯誤同類別(`instanceof`成立、原型與`code`等非憑證欄位保留)但不是同一個物件；不含憑證者仍為驅動原物件(身分不變)。
  - **單獨之帳號不取代**(只遮憑證，與儲存路徑同)：例如查詢參數`proxyUsername`之值被驅動回顯時原樣(修改前會遮罩)；`帳號:密碼`並列形式、`proxyPassword`之值照遮。帳號段含`/`者，驅動回顯之`CORP/帳號`改為`***/***`(`/`兩側之片段各自遮罩；修改前為單一`***`)。
  - **本套件自身以固定詞彙組成之錯誤不經遮罩**(`invalid id: …`、`invalid data: …`、`invalid find: …`、`invalid opt.<名>: …`)，即使密碼恰為其中之字樣也原樣(遮罩固定字串會讓缺口反推密碼)。
  - 不含憑證之解析失敗(如`Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"`)訊息與驅動原訊息完全相同。`opt.url`為`String`包裝物件(驅動接受)時同字串處理。
- 摘要(`safe`)只含`mode`(本套件填入之固定操作別)、`errType`與`errCode`：`errType`為內建錯誤類別名(驅動之`MongoServerError`等類別一律列為`Error`)，`errCode`依wsemi宣告之集合(系統錯誤名、Node與TLS代碼，及MongoDB伺服端錯誤碼與其`codeName`，如`11000`)。
- 未涵蓋：①驅動執行期的連線錯誤(認證失敗、連不上)由驅動產生，實測其訊息只含位址(`connect ECONNREFUSED 127.0.0.1:27017`)或固定文字(`Authentication failed.`)，不含帳密；若日後含憑證，同樣會被上列規則遮罩；②MongoDB驅動自身的日誌(`MONGODB_LOG_*`環境變數或`mongodbLogPath`選項，預設關閉，開啟後驅動會輸出指令與資料)與`process.emitWarning`(如過時選項警告)不經本套件的出口，也不受`funLog`控制；③短於4字元之密碼於對外錯誤值不取代(取代會把訊息中之同字樣一併吞掉，其本身也無保密價值；診斷輸出之細節不設下限，單獨帳號至少3字元)；其餘已知限制見wsemi之`getDiag`、`getDiagSecrets`、`maskDiagErr`說明。

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-orm-mongodb/WOrmMongodb.html).

## Installation

### Using npm(ES6 module):
```alias
npm i w-orm-mongodb
```

#### Example for collection
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-basic.mjs)]
```alias
import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'

let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'users',
}

let rs = [
    {
        id: 'id-peter',
        name: 'peter',
        value: 123,
    },
    {
        id: 'id-rosemary',
        name: 'rosemary',
        value: 123.456,
    },
    {
        id: '',
        name: 'kettle',
        value: 456,
    },
]

let rsm = [
    {
        id: 'id-peter',
        name: 'peter(modify)'
    },
    {
        id: 'id-rosemary',
        name: 'rosemary(modify)'
    },
    {
        id: '',
        name: 'kettle(modify)'
    },
]

async function test() {

    //wo
    let wo = WOrm(opt)

    //on change, 資料實際異動成功後發出
    wo.on('change', function(mode, data, res) {
        console.log('change', mode)
    })

    //on error, 操作發生錯誤時發出, 整批性錯誤於reject前、逐筆失敗於該筆定案後
    //註: 事件僅為附加通知, 錯誤仍可由reject或逐筆之err欄位取得; 正常結果不會發出
    wo.on('error', function(mode, data, err) {
        console.log('error', mode, err)
    })

    //delAll
    await wo.delAll()
        .then(function(msg) {
            console.log('delAll then', msg)
        })
        .catch(function(msg) {
            console.log('delAll catch', msg)
        })

    //insert
    await wo.insert(rs)
        .then(function(msg) {
            console.log('insert then', msg)
        })
        .catch(function(msg) {
            console.log('insert catch', msg)
        })

    //save
    await wo.save(rsm, { autoInsert: false })
        .then(function(msg) {
            console.log('save then', msg)
        })
        .catch(function(msg) {
            console.log('save catch', msg)
        })

    //select all
    let ss = await wo.select()
    console.log('select all', ss)

    //select
    let so = await wo.select({ id: 'id-rosemary' })
    console.log('select', so)

    //select by $and, $gt, $lt
    let spa = await wo.select({ '$and': [{ value: { '$gt': 123 } }, { value: { '$lt': 200 } }] })
    console.log('select by $and, $gt, $lt', spa)

    //select by $or, $gte, $lte
    let spb = await wo.select({ '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 200 } }] })
    console.log('select by $or, $gte, $lte', spb)

    //select by $or, $and, $ne, $in, $nin
    let spc = await wo.select({ '$or': [{ '$and': [{ value: { '$ne': 123 } }, { value: { '$in': [123, 321, 123.456, 456] } }, { value: { '$nin': [456, 654] } }] }, { '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 400 } }] }] })
    console.log('select by $or, $and, $ne, $in, $nin', spc)

    //select by regex, $regex與$options不在條件(find)白名單內(會reject), 需要模糊比對時改為select後於記憶體過濾
    let sr = ss.filter(function(v) {
        return /PeT/i.test(v.name)
    })
    console.log('selectReg', sr)

    //selectByPk, 由id直接查找單筆, 不需如select提取全部符合數據再處理
    let sbi = await wo.selectByPk('id-rosemary')
    console.log('selectByPk', sbi)

    //selectByPk by id not existed
    let sbn = await wo.selectByPk('id-not-existed')
    console.log('selectByPk by id not existed', sbn)

    //del
    let d = ss.filter(function(v) {
        return v.name === 'kettle'
    })
    await wo.del(d)
        .then(function(msg) {
            console.log('del then', msg)
        })
        .catch(function(msg) {
            console.log('del catch', msg)
        })

}
test()
// change delAll
// delAll then { n: 0, nDeleted: 0, ok: 1 }
// change insert
// insert then { n: 3, nInserted: 3, ok: 1 }
// change save
// save then [
//   { n: 1, nInserted: 0, nModified: 1, ok: 1 },
//   { n: 1, nInserted: 0, nModified: 1, ok: 1 },
//   { n: 0, nInserted: 0, nModified: 0, ok: 1 }
// ]
// select all [
//   { id: 'id-peter', name: 'peter(modify)', value: 123 },
//   { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
//   {
//     id: {random id},
//     name: 'kettle',
//     value: 456
//   }
// ]
// select [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]
// select by $and, $gt, $lt [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]
// select by $or, $gte, $lte [
//   {
//     id: {random id},
//     name: 'kettle',
//     value: 456
//   }
// ]
// select by $or, $and, $ne, $in, $nin [
//   {
//     id: 'id-rosemary',
//     name: 'rosemary(modify)',
//     value: 123.456
//   },
//   {
//     id: {random id},
//     name: 'kettle',
//     value: 456
//   }
// ]
// selectReg [ { id: 'id-peter', name: 'peter(modify)', value: 123 } ]
// selectByPk { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }
// selectByPk by id not existed null
// change del
// del then [ { n: 1, nDeleted: 1, ok: 1 } ]
```

## Return values

本套件屬`w-orm-*`系列，七個函數`select`、`selectByPk`、`insert`、`insertBulk`、`save`、`del`、`delAll`之回傳結構依系列統一規格：

```alias
select(find)        → [ {...}, {...} ]                    無符合為 []
selectByPk(pk)      → {...} | null

insert(data, option)              → { n, nInserted, ok }
insert(data, {returnList: true})  → [ { n, nInserted, ok }, ... ]   與輸入等長保序
insertBulk(data)                  → { n, nInserted, ok }            衝突即整批reject且不寫入任何一筆
save(data, option)  → [ { n, nInserted, nModified, ok }, ... ]
del(data)           → [ { n, nDeleted, ok }, ... ]
delAll(find)        → { n, nDeleted, ok }

單筆失敗            → { ..., ok: 0, err: '...' }          僅 save、del
整批失敗            → Promise.reject(err)
```

各計數欄位之語義：

| 欄位 | 語義 |
|---|---|
| `n` | `insert`為輸入筆數；`save`與`del`為id命中筆數(`0`或`1`)；`delAll`為實際刪除筆數 |
| `nInserted` | 實際插入筆數 |
| `nModified` | 實際更新筆數。合併後內容與現值相同而未寫入者為`0` |
| `nDeleted` | 實際刪除筆數 |
| `ok` | `1`成功、`0`該筆失敗 |
| `err` | 失敗訊息，僅於`ok`為`0`時出現 |

判讀準則：

| 要判斷什麼 | 看什麼 |
|---|---|
| 這批有沒有撞到既有主鍵 | `insertBulk`是否`reject` |
| 這批有幾筆是新資料 | `insert`之`nInserted` |
| 這批**是哪幾筆**是新資料 | `insert(data, {returnList: true})`之各元素`nInserted === 1` |
| 這筆是不是新資料 | `save`之`nInserted === 1` |
| 這筆內容有沒有實際寫入 | `save`之`nModified === 1` |
| 這筆有沒有真的被刪 | `nDeleted` |
| 整批有沒有失敗 | Promise是否`reject` |
| 個別筆有沒有失敗 | 逐筆之`ok === 0`，訊息取`err` |

`save`之「內容相同」判定基準為**將待儲存物件合併進現值之後，結果與現值相同**，由MongoDB於伺服器端逐欄位比對。故僅給部份欄位且該些欄位值皆與現值相同時，`nModified`亦為`0`。

`del`對未帶有效`id`者不送查詢條件，直接回`ok: 0`並附`err`，以免`undefined`經序列化為`null`而誤刪`id`為`null`之數據。

## 條件(find)白名單

`select(find)`、`delAll(find)`、`delAllGfs(find)`之`find`只支援下列系列白名單(`w-orm-*`系列一致)，其餘一律整批`reject`，訊息為`invalid find: 原因 at [路徑]`(不回顯值)，且不建立連線、不讀取、不刪除。檢核由`wsemi`之`cvOrmFind`負責，檢核後之條件副本才交給MongoDB(檢查之值即使用之值)。

| 項目 | 說明 |
|---|---|
| 全部 | 未給、`undefined`、`{}`皆為全部數據。除此之外`find`須為一般物件(原型為`Object.prototype`或`null`)，`null`、陣列、字串、數值、布林、函數、`Date`、`RegExp`、`Map`、`Set`、類別實例等一律`reject`，不視為`{}` |
| 欄位等值 | `{ 欄: 純量 }`，多欄為AND |
| 欄位運算子 | `$eq $ne $gt $gte $lt $lte`(值為純量)、`$in $nin`(值為純量陣列) |
| 文件層邏輯 | `$and`、`$or`(值為條件物件之非空陣列) |
| 純量 | 字串、有限數字、布林、有效`Date`；`null`僅可用於欄位等值、`$eq`、`$ne`；字串不得含NUL與孤立代理字元 |
| 空集合 | `$in: []`恆假(命中0筆)；`$nin: []`、`$and: []`、`$or: []`、`$and`/`$or`之元素為`{}`、運算子物件為`{}`一律`reject` |
| 欄名 | 1~128個UTF-16碼元(以字串`length`計)，符合`^[\p{L}_][\p{L}\p{M}\p{N}_]*$`，禁`__proto__`；點路徑、`$`開頭、含連字號/空白/引號者`reject`。`_bsontype`為BSON保留欄名，雖符合文法，MongoDB driver無法將其作為一般欄位送出而會`reject`(不會命中或刪除任何數據) |
| 上限 | 邏輯巢狀深度32、`$and`/`$or`長度1000、`$in`/`$nin`長度10000、節點總數100000 |
| 其餘 | `$not $nor $regex $options $exists $type $where $expr $function $text $elemMatch $size $all $mod`、地理空間、欄位層`$and`/`$or`、`undefined`值、函數值、Symbol鍵與值等白名單外輸入一律`reject` |

語意為MongoDB伺服器原生行為(MongoDB式)：

- 欄位值以BSON型別比對，`{ age: '20' }`不命中數字`20`；字串區分大小寫。
- `{ f: null }`、`{ f: { $eq: null } }`會命中欄位為`null`或缺欄之數據；因此欄名拼錯時，`delAll({ 拼錯之欄: null })`、`$ne`、`$nin`會命中全部數據，呼叫`delAll`前須確認欄名。
- `$ne`(比較值非`null`)、`$nin`會命中欄位為`null`或缺欄之數據，`$ne: null`則僅命中欄位存在且非`null`者。需明確表達時可用可攜寫法(與`w-orm-*`其他套件之結果一致)：排除null為`{ $and: [{ f: { $ne: null } }, { f: { $ne: x } }] }`，含null為`{ $or: [{ f: null }, { f: { $ne: x } }] }`。
- 同一`find`，`select`命中之數據即`delAll`刪除之數據。

`delAll`/`delAllGfs`使用須知：

- 不給條件(未給、`undefined`、`{}`)即刪除全部數據，不另行確認；給了條件才是部分刪除。經資料通道(如`w-serv-webdata`)呼叫者語意與本套件一致，不另加限制。
- 傳了值卻不是條件物件(`null`、陣列、字串等)會整批`reject`，不會視為`{}`。
- 條件須審慎：`undefined`值會`reject`而非被忽略，`$nin: []`會`reject`，`$in: []`為恆假(刪除0筆)；條件值若來自可能為`undefined`、`null`或空陣列之變數，呼叫端須先自行判斷。建議先以`select(find)`確認命中範圍再刪除。
- `delAll`須審慎使用，非必要不用；刪除單筆請用`del`。

## insert 的 returnList

聚合的`nInserted`回答「有幾筆是新的」，回答不了「**是哪幾筆**」——而後者正是去重的產出物（下游只對新資料做昂貴動作）。`option.returnList`把函數內部本就算出的逐筆判定交出來，免得呼叫端為了知道哪幾筆而把批次退化成單筆呼叫。

| `option.returnList` | 回傳 |
|---|---|
| `false`（預設） | `{ n, nInserted, ok }` |
| `true` | 與輸入**等長且保序**之陣列，元素為`{ n, nInserted, ok }` |

逐筆元素：已插入者`nInserted`為`1`，主鍵已存在而跳過者（含同批重複之非首筆）為`0`；`n`與`ok`恆為`1`——`insert`的任何錯誤都是整批性錯誤而`reject`，故逐筆元素不出現`ok: 0`與`err`。

```alias
let rs = await wo.insert([
    { id: 'a', name: 'x' },
    { id: 'b', name: 'y' },  //假設b已存在
    { id: 'c', name: 'z' },
], { returnList: true })
// => [ {n:1,nInserted:1,ok:1}, {n:1,nInserted:0,ok:1}, {n:1,nInserted:1,ok:1} ]

//取出本次真正新增的那幾筆
let rsNew = data.filter((v, k) => rs[k].nInserted === 1)
```

不變式：陣列長度等於輸入筆數，且`rs.filter(v => v.nInserted === 1).length`等於預設模式的`nInserted`。輸入無效時回`[]`。

回傳形式的切換是**靜態**的——呼叫點寫死取值即知回傳形狀。兩種取值是兩份契約，共用的結果處理程式碼不要跨不同取值的呼叫點混用。

`save`與`del`不提供此選項，因為它們本來就回等長保序的逐筆陣列，資訊已經在裡面（`rs[i].nInserted === 1`、`rs[i].nModified === 1`）；`insertBulk`也不提供，因為成功時逐筆恆為已插入（零資訊量）、失敗時整批`reject`而無部分結果。

## insert vs insertBulk

兩者**衝突政策不同，不是同一個操作的加速版**：

| 情形 | `insert` | `insertBulk` |
|---|---|---|
| 主鍵已存在 | 跳過該筆，整批`ok: 1` | **整批`reject`，且不寫入任何一筆** |
| 同批重複主鍵 | 僅首筆計入`nInserted` | 視為衝突，整批`reject` |
| `nInserted` | 實際插入筆數，`0 ≤ nInserted ≤ n` | 成功時恆等於`n` |
| 適用場景 | 一般寫入，資料表可能已有既有資料 | 批次匯入，本即預期無衝突 |

確無衝突時兩者的可觀察結果完全相同（皆回`{ n, nInserted: n, ok: 1 }`），差異只在有衝突時顯現。需要逐筆處置者用`insert`；`insertBulk`不提供逐筆結果，故不出現`ok: 0`與`err`。

**本套件的`insertBulk`不會比`insert`快**——`insert`本來就是一次往返且計數精確。提供它是為了語義（全有全無）與跨套件的可替換性。

### 全有全無的達成方式

依部署而異，由套件於執行期以`hello`回應自動判定（`setName`或`msg`為`isdbgrid`），每個實例判定一次：

| 部署 | 作法 |
|---|---|
| replica set / 分片叢集 | 以交易包覆`insertMany`，失敗即回滾 |
| standalone | **無交易可用**，改以補償動作：偵測到衝突後刪除本次已寫入者，再`reject` |

補償動作刪除的依據是**本次由驅動在用戶端產生的`_id`**，與呼叫前既有資料的`_id`必不相同，故縱使該筆的`id`已存在也不會誤刪既有資料。

> **standalone 的限制**：補償動作於正常運作下可使狀態回復如初，但**行程若於補償途中中止（斷電、強制終止），已寫入的部分可能殘留**。這是無交易可用的固有限制。需要嚴格保證者請部署 replica set（單成員即可啟用交易）。

## Events

操作物件為`EventEmitter`，發出`change`與`error`兩種事件，供於單一處集中觀察資料異動與失敗，不必在每個呼叫點各自包裝。

```alias
change  (mode, data, res)   資料實際異動成功後，整批一次
error   (mode, data, err)   整批性錯誤於 reject 前；逐筆失敗於該筆定案後，每筆一次

mode    函數名稱，如 'insert'、'save'、'del'、'delAll'、'select'、'selectByPk'、'insertGfs' 等
data    輸入數據，無輸入數據者（如 delAll、select、selectByPk）為 null
err     錯誤訊息字串
```

```alias
let wo = WOrm(opt)

wo.on('change', function(mode, data, res) {
    console.log('change', mode, res)
})

wo.on('error', function(mode, data, err) {
    console.log('error', mode, err)
})
```

**事件僅為附加通知，不承擔任何回傳義務。** 凡經由事件送出之資訊，必同時經由正規管道送達——整批性錯誤經`Promise.reject`，逐筆失敗經該筆之`err`欄位，操作結果經 resolve 值。把全部事件移除之後，呼叫端仍能取得完整資訊。

**操作行為不因監聽者之有無而改變。** 同一份程式碼、同一組輸入，於有註冊監聽與未註冊監聽兩種情況下，回傳值與 resolve／reject 之選擇完全相同。本套件之`EventEmitter`採`eventemitter3`（`wsemi`之`evem()`），其於`'error'`無監聽者時僅回傳`false`而不拋出；Node 內建之`events.EventEmitter`具「`'error'`無監聽者時將錯誤拋出」之語義，故不採用。

訂閱函數自身拋錯亦不影響本次操作之結果——每一處`emit`皆以 try/catch 包覆；該錯誤預設只輸出標籤與摘要，不輸出其訊息(見上方「診斷輸出」，`opt.logDetail`、`opt.funLog`)。

**正常結果不發出`error`。** `insert`全數已存在、`save`合併後內容相同而未寫入、`del`主鍵未命中、`delAll`條件無命中、`selectByPk`查無數據，皆為正常結果而非錯誤。

**收到`error`不表示該次呼叫失敗。** 逐筆失敗時整批仍 resolve，欲判斷整批成敗仍依上方「判讀準則」。

`save`於逐筆插入時另發出`mode`為`'insert'`之`change`事件，供區辨新增與更新。讀取函數（`select`、`selectByPk`、`selectByPkGfs`）不發出`change`。

## Primary key

本套件之主鍵欄位固定為`id`，尚未支援由呼叫端指定。`id`為無業務語義之識別碼。

主鍵由誰產生，由建構設定`opt.autoGenPk`決定：

| `opt.autoGenPk` | 行為 |
|---|---|
| `true`（預設） | `insert`、`save`、`insertGfs`於輸入未帶有效`id`時，由套件以`genIDSeq()`自動產生（UUIDv7，時間有序） |
| `false` | 套件一律不產生`id`，`id`須由呼叫端於寫入前自備 |

`autoGenPk: false`之定位為**依賴注入**：`id`的產生規則改由呼叫端掌握（如採用外部發號器、以業務欄位組合、沿用上游系統既有識別碼），套件不介入。採用此設定後，**`id`之唯一性、格式與是否與既有資料衝突，皆由呼叫端自負**。

`autoGenPk`為建構層設定，**不得於`insert`與`save`之`option`逐次覆寫**——主鍵由誰產生是整個資料表的政策，若逐次可改，同一資料表將混入兩種來源之`id`而難以追溯。

`autoGenPk: false`而輸入未帶有效`id`時，以`Promise.reject`拋出，屬整批性錯誤而不進入逐筆結果。主鍵檢查於任何寫入之前一次完成，故整批`reject`時**同批之有效筆數亦不會被寫入**。

`del`不受`autoGenPk`影響，於任一設定下皆不補值——未帶有效`id`者視為該筆無法處理，回`ok: 0`並附`err`。

```alias
//預設: 未帶id者自動產生
let wo = WOrm({ url, db: 'worm', cl: 'users' })
await wo.insert({ name: 'peter' }) // => { n: 1, nInserted: 1, ok: 1 }

//關閉: id須自備
let woOff = WOrm({ url, db: 'worm', cl: 'users', autoGenPk: false })
await woOff.insert({ id: 'id-peter', name: 'peter' }) // => { n: 1, nInserted: 1, ok: 1 }
await woOff.insert({ name: 'peter' })                 // => reject: invalid data[0].id, autoGenPk is false
```

## 字串良構檢核

BSON以UTF-8存放字串，**孤立代理字元**(高代理後無低代理，或低代理前無高代理，`String.prototype.isWellFormed()`為`false`)無法編碼而被改寫為`U+FFFD`，且不同的孤立字元(`'\uD800'`、`'\uDC00'`)與`U+FFFD`改寫後完全相同。若不檢核，`'a\uD800'`會與`'a�'`成為同一個`id`，造成覆寫、誤刪、命中他筆。本套件於到達MongoDB之前檢核並拒收(`U+FFFD`本身與成對代理，如emoji、CJK擴充B區字，為良構，照常接受)：

| 檢核對象 | 規則 |
|---|---|
| 主鍵`id`(各函數之`id`/`pk`參數與資料之`id`欄) | 須為字串，不得為空字串，不得含孤立代理字元，**亦不得含NUL**(與`find`同標準) |
| 寫入資料之字串值與鍵名(`insert`、`insertBulk`、`save`；含巢狀物件、陣列元素、`Map`/`Set`內容、`RegExp`之`source`、`Error`之`message`等) | 不得含孤立代理字元；值之NUL不檢查 |
| 儲存位址`opt.url`、`opt.db`、`opt.cl` | 不得含孤立代理字元，建構時即`throw` |

各函數之處置(與既有「無效主鍵」同形)：

| 函數 | 處置 |
|---|---|
| `insert`、`insertBulk`、`insertGfs` | 寫入前檢核整批，任一筆不合格即整批`reject`、不連線、不寫入任何一筆；`error`事件於`reject`前發一次，`change`不發；以索引最小之不合格筆為準，同一筆內主鍵先於資料，同一物件內鍵名先於值 |
| `save`、`del`、`delGfs` | 該筆回`ok: 0`並附`err`，同批其他筆照常；每個失敗筆各發一次`error`事件；同批皆不合格時不連線 |
| `selectByPk`、`selectByPkGfs` | 回`null`(不`reject`、不發事件、不連線) |
| `select`、`delAll`、`delAllGfs` | 條件值與欄名依「條件(find)白名單」(`invalid find: …`) |
| 建構 `WOrm(opt)` | `opt.url`/`opt.db`/`opt.cl`不合格即`throw` |

錯誤訊息為固定詞彙、不回顯值(路徑中之鍵名若不合格以`<invalid key>`標示)：

```alias
invalid id: string contains lone surrogate at [data[1].id]
invalid id: string contains NUL at [data[1].id]
invalid id: not a string at [data[1].id]            // del、delGfs：非字串；insert、insertBulk、insertGfs、save：String包裝物件(其餘非字串依autoGenPk補值或拒收，見上)
invalid id: string is empty at [data[1].id]            // del、delGfs：空字串(insert、save於autoGenPk為true時會自動產生id)
invalid data: string contains lone surrogate at [data[1].meta.tags[0]]
invalid opt.cl: string contains lone surrogate
```

`[data[<k>]…]`之`<k>`為該筆在輸入陣列內之索引(單一物件為`0`)。`autoGenPk: false`而輸入未帶`id`時之既有訊息`invalid data[<k>].id, autoGenPk is false`不變。

檢核**不隨`autoGenPk`改變**：`autoGenPk: false`時同樣檢核。檢核作用於套件已複製之數據(`insertGfs`、`delGfs`為取一次`id`)，檢查之值即寫入或查找之值。

### 已知限制

- `insertGfs`只寫入`id`(檔名)與`u8a`(內容為位元組)，其餘欄位不寫入，故不檢核資料之其他欄位；`u8a`內容不屬字串。
- `String`包裝物件(`new String(...)`)作為**資料值**時，其字串值受檢核，但BSON以字元索引存成子文件，成對代理會被拆成孤立碼元，本套件不解包、不改存放形式；實務上資料不會使用`String`包裝物件。
- 自訂`toJSON`/序列化函式之輸出不在檢核範圍。
- 資料鍵名含NUL不由本套件檢核(值之NUL亦不檢查)，鍵名含NUL者由MongoDB驅動拒收，其錯誤訊息為驅動所產生，會含鍵名片段；本套件自身之訊息一律不回顯值。
- 不合格筆之`n`：`save`為`1`(沿用既有逐筆失敗之形狀`{ n: 1, nInserted: 0, nModified: 0, ok: 0, err }`)，`del`/`delGfs`為`0`(`{ n: 0, nDeleted: 0, ok: 0, err }`)；判斷是否真的寫入或刪除請一律看`ok`、`nInserted`、`nModified`、`nDeleted`。

### 既有資料

本套件不自動遷移既有資料。舊版寫入之孤立代理字元**已被BSON改寫為`U+FFFD`**，內容已損且無從還原；因`U+FFFD`為良構字串，`isWellFormed()`無法檢出，只能以「含`U+FFFD`」作候選，再人工確認是否為被改寫之舊列(正常使用`U+FFFD`者同樣會被列出)：

```alias
let rs = await wo.select()
let cand = rs.filter(r => typeof r.id === 'string' && r.id.includes('�'))

//以良構之U+FFFD同形id清除候選舊列
await wo.del(cand.map(r => ({ id: r.id })))

//或依其他欄位條件清除，或以delAll()清空全表(審慎使用)
```

以孤立代理字元定址舊列(`del({ id: 'a\uD800' })`、`selectByPk('a\uD800')`)已被拒收，不會再命中以`U+FFFD`存放之他筆。

## Upgrading

本套件會於`id`欄位建立唯一索引，此為`insert`之「已存在則跳過」與`save`之「不遺失更新」所必需，無法關閉。**若既有資料表內已存在重複`id`，建立索引會失敗，`insert`與`save`會直接`reject`。** 升級前請先清除重複數據：

```alias
// 找出重複id
db.users.aggregate([
    { $group: { _id: '$id', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
])
```

清除重複數據後即可正常使用。索引僅於首次寫入時建立一次，已存在同樣索引時MongoDB不會重建亦不報錯。

GridFS同理，`insertGfs`會於`<cl>.files`之`filename`欄位建立唯一索引：

```alias
// 找出重複id
db['usersGfs.files'].aggregate([
    { $group: { _id: '$filename', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
])
```

`selectByPkGfs`、`delGfs`、`delAllGfs`皆不建立索引，故既有數據縱使尚存重複`id`亦可正常查詢與清除，`delGfs`會將同一`id`之多筆一併刪除並如實回報`nDeleted`。

#### Example for unique id and concurrency
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-unique.mjs)]

```alias
import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'

let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersUnique',
}

async function test() {

    //wo
    let wo = WOrm(opt)

    //delAll
    await wo.delAll()

    //insert, 同批含重複id時僅首筆成功
    let ri = await wo.insert([
        { id: 'id-dup', name: 'dup-1' },
        { id: 'id-dup', name: 'dup-2' },
        { id: 'id-uniq', name: 'uniq' },
    ])
    console.log('insert with duplicated id', ri)
    console.log('selectByPk(id-dup)', await wo.selectByPk('id-dup'))

    //insert, 對已存在id再插入則跳過而不覆寫
    let re = await wo.insert({ id: 'id-dup', name: 'dup-3' })
    console.log('insert existed id', re)
    console.log('selectByPk(id-dup)', await wo.selectByPk('id-dup'))

    //insert, 併發對同一id插入10次, nInserted總和為1
    let rc = await Promise.all(Array.from({ length: 10 }, (v, k) => {
        return wo.insert({ id: 'id-race', k })
    }))
    console.log('sum of nInserted by 10 concurrent insert', rc.reduce((sum, v) => sum + v.nInserted, 0))
    console.log('records of id-race', (await wo.select({ id: 'id-race' })).length)

    //save, 併發對同一全新id儲存不同欄位, 僅一次為插入, 各欄位皆保留
    let rs = await Promise.all(Array.from({ length: 5 }, (v, k) => {
        return wo.save({ id: 'id-new', [`f${k}`]: k })
    }))
    console.log('count of nInserted===1 by 5 concurrent save', rs.filter((v) => v[0].nInserted === 1).length)
    console.log('records of id-new', (await wo.select({ id: 'id-new' })).length)
    console.log('selectByPk(id-new)', await wo.selectByPk('id-new'))

}
test()
// insert with duplicated id { n: 3, nInserted: 2, ok: 1 }
// selectByPk(id-dup) { id: 'id-dup', name: 'dup-1' }
// insert existed id { n: 1, nInserted: 0, ok: 1 }
// selectByPk(id-dup) { id: 'id-dup', name: 'dup-1' }
// sum of nInserted by 10 concurrent insert 1
// records of id-race 1
// count of nInserted===1 by 5 concurrent save 1
// records of id-new 1
// selectByPk(id-new) { id: 'id-new', f0: 0, f1: 1, f2: 2, f4: 4, f3: 3 }
// 註: 併發儲存之各欄位皆會保留, 惟欄位順序取決於各次儲存之完成順序, 故每次執行不盡相同
```

#### Example for GridFS
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-gfs.mjs)]

GridFS函數之參數與回傳形狀比照一般操作，數據物件為`{ id, u8a }`：

| GridFS函數 | 對應一般函數 | 回傳 |
|---|---|---|
| `selectByPkGfs(id)` | `selectByPk` | `{ id, u8a }` 或 `null` |
| `insertGfs(data)` | `insert` | `{ n, nInserted, ok }` |
| `delGfs(data)` | `del` | `[ { n, nDeleted, ok }, ... ]` |
| `delAllGfs(find)` | `delAll` | `{ n, nDeleted, ok }` |

`delAllGfs(find)`之`find`適用上方「條件(find)白名單」(`<cl>.files`之欄位如`filename`、`length`、`uploadDate`可用，`metadata.*`等點路徑不可用)，不給條件即刪除全部檔案。

`insertGfs`同樣具備「已存在則跳過」語義，以`<cl>.files`之`filename`唯一索引達成，升級前提與一般操作相同。GridFS無法於單一原子操作內取代既有內容，故不提供`saveGfs`，更新請以`delGfs`後再`insertGfs`完成。

```alias
import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'


//GridFS函數之參數與回傳形狀比照一般操作:
//數據物件為{ id, u8a }, insertGfs收物件或陣列, delGfs收物件或陣列並回傳等長陣列
let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersGfs',
}

//genU8a, 產生內容可複現之測試數據
function genU8a(n) {
    let u8a = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
        u8a[i] = i % 256
    }
    return u8a
}

async function test() {

    //wo
    let wo = WOrm(opt)

    //on change, 資料實際異動成功後發出
    wo.on('change', function(mode, data, res) {
        console.log('change', mode)
    })

    //on error, 操作發生錯誤時發出, 整批性錯誤於reject前、逐筆失敗於該筆定案後
    //註: 事件僅為附加通知, 錯誤仍可由reject或逐筆之err欄位取得; 正常結果不會發出
    wo.on('error', function(mode, data, err) {
        console.log('error', mode, err)
    })

    //u8a, 亦可為瀏覽器或nodejs取得之任何Uint8Array
    let u8a = genU8a(1000)

    //delAllGfs
    await wo.delAllGfs()
        .then(function(msg) {
            console.log('delAllGfs then', msg)
        })
        .catch(function(msg) {
            console.log('delAllGfs catch', msg)
        })

    //insertGfs
    let gi = await wo.insertGfs({ id: 'id-file', u8a })
    console.log('insertGfs', gi)

    //insertGfs, 已存在id者跳過且不覆寫
    let gr = await wo.insertGfs({ id: 'id-file', u8a: genU8a(50) })
    console.log('insertGfs existed id', gr)

    //selectByPkGfs
    let gs = await wo.selectByPkGfs('id-file')
    console.log('selectByPkGfs id', gs.id)
    console.log('selectByPkGfs u8a.length', gs.u8a.length)
    console.log('selectByPkGfs u8a[0..3]', gs.u8a[0], gs.u8a[1], gs.u8a[2], gs.u8a[3])

    //selectByPkGfs by id not existed
    let gn = await wo.selectByPkGfs('id-not-existed')
    console.log('selectByPkGfs by id not existed', gn)

    //insertGfs, 一次插入多筆
    let gm = await wo.insertGfs([
        { id: 'id-a', u8a: genU8a(10) },
        { id: 'id-b', u8a: genU8a(20) },
    ])
    console.log('insertGfs multi', gm)

    //delGfs
    let gd = await wo.delGfs({ id: 'id-file' })
    console.log('delGfs', gd)

    //delGfs by id not existed
    let gdn = await wo.delGfs({ id: 'id-not-existed' })
    console.log('delGfs by id not existed', gdn)

    //delAllGfs
    let gda = await wo.delAllGfs()
    console.log('delAllGfs', gda)

}
test()
// change delAllGfs
// delAllGfs then { n: 0, nDeleted: 0, ok: 1 }
// change insertGfs
// insertGfs { n: 1, nInserted: 1, ok: 1 }
// change insertGfs
// insertGfs existed id { n: 1, nInserted: 0, ok: 1 }
// selectByPkGfs id id-file
// selectByPkGfs u8a.length 1000
// selectByPkGfs u8a[0..3] 0 1 2 3
// selectByPkGfs by id not existed null
// change insertGfs
// insertGfs multi { n: 2, nInserted: 2, ok: 1 }
// change delGfs
// delGfs [ { n: 1, nDeleted: 1, ok: 1 } ]
// change delGfs
// delGfs by id not existed [ { n: 0, nDeleted: 0, ok: 1 } ]
// change delAllGfs
// delAllGfs { n: 2, nDeleted: 2, ok: 1 }

```

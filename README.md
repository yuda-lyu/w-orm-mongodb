# w-orm-mongodb
An operator for mongodb in nodejs.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![license](https://img.shields.io/npm/l/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![npm download](https://img.shields.io/npm/dt/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![npm download](https://img.shields.io/npm/dm/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-orm-mongodb.svg)](https://www.jsdelivr.com/package/npm/w-orm-mongodb)

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

    //select by regex, $options之合法flag僅有i、m、x、s
    let sr = await wo.select({ name: { $regex: 'PeT', $options: 'i' } })
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

訂閱函數自身拋錯亦不影響本次操作之結果——每一處`emit`皆以 try/catch 包覆。

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

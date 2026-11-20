import assert from 'assert'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


//主鍵(id)只認自有可列舉之資料屬性, 規則見sgud/rule/rulebook.md R-PKOWN-01(第569項)
//規格(主控 2026-11-20, 第569項全族):
//  S1 列之id為繼承(原型鏈上, 不論值之型別)或自有不可列舉者視為未帶: autoGenPk為true補新主鍵(自有可列舉之資料屬性, 補值不得以賦值: 原型之id為frozen或僅有getter時賦值會拋TypeError),
//     為false照既有「未帶」處置(insert、insertBulk、save、insertGfs整批reject invalid data[k].id, autoGenPk is false)
//  S2 判定不得多讀有效輸入: 先以既有路徑取值, 值為未帶即短路, 只有值為給了才查描述子(propertyIsEnumerable, 不呼叫getter)
//  S3 del、delGfs: 繼承之主鍵視為未給(該筆ok為0附既有之無效主鍵訊息), 不得刪除庫內同值之列; save: 不得以繼承值覆寫或upsert同值之列; insert系: 不得因繼承值而跳過、撞鍵或寫入缺主鍵之列
//  S4 selectByPk、selectByPkGfs收純量, 不適用, 以測試釘住傳列物件之既有回傳(null)
//  S5 非主鍵欄之繼承可列舉欄位: 既有處置不變(BSON只存自有可列舉屬性, 繼承欄位不寫入), 不在本項範圍, 以測試釘住
//每案使用全新資料表; 種子與驗證一律由驅動直接讀寫(GridFS之種子除外)


let ctName = process.env.WORM_PKOWN_CT || 'worm-test-mongodb-pkown' //環境變數僅供變異測試並行時各取不同容器名
let ctDb = 'worm'
let ctPort = null
let rawClient = null
let nCl = 0


//genOpt
let genOpt = (cl, extra) => {
    return {
        url: genUrl(ctPort),
        db: ctDb,
        cl,
        ...extra,
    }
}

//genCl, 每案全新資料表名
let genCl = () => {
    nCl++
    return `po${nCl}`
}

//getCl, 以驅動直接取資料表物件
let getCl = (cl) => {
    return rawClient.db(ctDb).collection(cl)
}

//dropCl, 以驅動移除資料表(含GridFS之files與chunks)
let dropCl = async (cl) => {
    for (let n of [cl, `${cl}.files`, `${cl}.chunks`]) {
        await getCl(n).drop().catch(() => {})
    }
}

//snapDocs, 以驅動取資料表全部列(不含_id), 每列表為`id:name`字串(無id欄者id為NOID, id以JSON表示以分辨數字與字串), 升冪排序
let snapDocs = async (cl) => {
    let rs = await getCl(cl).find({}, { projection: { _id: 0 } }).toArray()
    return rs.map((v) => `${Object.prototype.hasOwnProperty.call(v, 'id') ? JSON.stringify(v.id) : 'NOID'}:${v.name}`).sort()
}

//snapGfs, 以驅動取GridFS全部檔名並升冪排序
let snapGfs = async (cl) => {
    let rs = await getCl(`${cl}.files`).find({}, { projection: { _id: 0, filename: 1 } }).toArray()
    return rs.map((v) => v.filename).sort()
}

//msgOf
let msgOf = (err) => {
    return err instanceof Error ? err.message : String(err)
}

//collect, 蒐集事件(依發生順序)
let collect = (wo) => {
    let evs = []
    wo.on('error', function(mode, data, err) {
        evs.push({ type: 'error', mode, data, err })
    })
    wo.on('change', function(mode, data, res) {
        evs.push({ type: 'change', mode, data, res })
    })
    return evs
}

//nType, 事件陣列內指定類型(與操作別)之筆數
let nType = (evs, type, mode) => {
    return evs.filter((v) => v.type === type && (mode === undefined || v.mode === mode)).length
}

//withSpyClient, 於建立受測物件期間以計數替身取代MongoClient(受測套件於建立時取用MongoClient), 完成即還原
let withSpyClient = (fn) => {
    let Orig = mongodb.MongoClient
    let desc = Object.getOwnPropertyDescriptor(mongodb, 'MongoClient')
    let count = { n: 0 }
    class Spy extends Orig {
        constructor(...args) {
            super(...args)
            count.n++
        }
    }
    Object.defineProperty(mongodb, 'MongoClient', { configurable: true, enumerable: true, get: () => Spy })
    let wo = null
    try {
        wo = fn()
    }
    finally {
        Object.defineProperty(mongodb, 'MongoClient', desc)
    }
    return { wo, count }
}

//reUuid, genIDSeq產生之主鍵(UUIDv7)
let reUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

//u8a
let u8a = () => new Uint8Array([1, 2, 3])

//isGfsApi
let isGfsApi = (api) => api === 'insertGfs' || api === 'delGfs'

//callApi, 呼叫各入口(rows為輸入列陣列)
let callApi = (wo, api, rows) => {
    if (api === 'insert') {
        return wo.insert(rows)
    }
    if (api === 'insertBulk') {
        return wo.insertBulk(rows)
    }
    if (api === 'save') {
        return wo.save(rows, { autoInsert: true })
    }
    if (api === 'del') {
        return wo.del(rows)
    }
    if (api === 'insertGfs') {
        return wo.insertGfs(rows)
    }
    if (api === 'delGfs') {
        return wo.delGfs(rows)
    }
    throw new Error(`unknown api: ${api}`)
}

//snap, 依入口取庫內快照
let snap = (cl, api) => {
    return isGfsApi(api) ? snapGfs(cl) : snapDocs(cl)
}

//extraOf, 各入口之列之自有非主鍵欄: 資料列帶name, GridFS列帶u8a
let extraOf = (api) => {
    return isGfsApi(api) ? { u8a: u8a() } : { name: 'n' }
}

//seedCl, 植入既有列(皆以驅動或自有id寫入, 與受測實例分離使其MongoClient計數只計受測入口)
//same: 與繼承值同值之列(字串a9、字串123, 文件另有數字123), 供顯出跳過/覆寫/刪除; other: 另一不相干之列(zz9)
let seedCl = async (cl, api, seed) => {
    if (isGfsApi(api)) {
        let woSeed = WOrm(genOpt(cl))
        for (let id of seed === 'same' ? ['a9', '123'] : ['zz9']) {
            await woSeed.insertGfs([{ id, u8a: u8a() }])
        }
        return
    }
    let c = getCl(cl)
    if (seed === 'same') {
        await c.insertOne({ id: 'a9', name: 'orig' })
        await c.insertOne({ id: '123', name: 'orig-str' })
        await c.insertOne({ id: 123, name: 'orig-num' })
    }
    else {
        await c.insertOne({ id: 'zz9', name: 'orig' })
    }
}


//繼承之主鍵值來源
class CGetStr {
    get id() {
        return 'a9'
    }
}
class CGetNum {
    get id() {
        return 123
    }
}

//shapes, 列之形狀; make(extra)回傳全新之列物件(自有欄位為extra), kind為未帶(unbrought)或給了(given), delErr為del、delGfs對該形狀之無效主鍵訊息原因
let shapes = [
    { name: 'inherited string', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(Object.create({ id: 'a9' }), e) },
    { name: 'inherited number', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(Object.create({ id: 123 }), e) },
    { name: 'inherited object', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(Object.create({ id: { x: 1 } }), e) },
    { name: 'inherited empty string', kind: 'unbrought', delErr: 'string is empty', make: (e) => Object.assign(Object.create({ id: '' }), e) },
    { name: 'class getter (string)', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(new CGetStr(), e) },
    { name: 'class getter (number)', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(new CGetNum(), e) },
    { name: 'frozen prototype', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(Object.create(Object.freeze({ id: 'a9' })), e) },
    {
        name: 'own non-enumerable (no inherited)',
        kind: 'unbrought',
        delErr: 'not a string',
        make: (e) => Object.assign(Object.defineProperty({}, 'id', { value: 'a9', enumerable: false, writable: true, configurable: true }), e),
    },
    {
        name: 'own non-enumerable over inherited string',
        kind: 'unbrought',
        delErr: 'not a string',
        make: (e) => Object.assign(Object.defineProperty(Object.create({ id: 'a9' }), 'id', { value: 'b7', enumerable: false, writable: true, configurable: true }), e),
    },
    { name: 'no id key', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign({}, e) },
    { name: 'own enumerable (control)', kind: 'given', make: (e) => Object.assign({ id: 'a9' }, e) },
    { name: 'own enumerable shadowing inherited (control)', kind: 'given', make: (e) => Object.assign(Object.create({ id: 'zz' }), { id: 'a9' }, e) },
    //判定不得呼叫列物件自身之方法(列可自有同名欄位或無原型): 以Object.prototype.propertyIsEnumerable.call判定
    { name: 'own enumerable with own fields named propertyIsEnumerable and hasOwnProperty (control)', kind: 'given', make: (e) => Object.assign({ id: 'a9', propertyIsEnumerable: 1, hasOwnProperty: 1 }, e) },
    { name: 'null-prototype with own enumerable id (control)', kind: 'given', make: (e) => Object.assign(Object.create(null), { id: 'a9' }, e) },
    { name: 'null-prototype without id', kind: 'unbrought', delErr: 'not a string', make: (e) => Object.assign(Object.create(null), e) },
]

//runCell, 植入種子後以單筆列呼叫入口, 回傳前後快照與結果
let runCell = async (api, shape, seed, autoGenPk) => {
    let cl = genCl()
    await seedCl(cl, api, seed)
    let before = await snap(cl, api)
    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl, { autoGenPk })))
    let evs = collect(wo)
    let rej = null
    let r = null
    try {
        r = await callApi(wo, api, [shape.make(extraOf(api))])
    }
    catch (err) {
        rej = err
    }
    let after = await snap(cl, api)
    await dropCl(cl)
    return { before, after, rej, r, evs, count }
}

//onlyAdded, after相對before: before各列皆原封不動且恰多一列, 回傳該多出之列
let onlyAdded = (before, after) => {
    assert.ok(before.every((v) => after.includes(v)), `existing rows must be untouched: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`)
    let added = after.filter((v) => !before.includes(v))
    assert.strictEqual(added.length, 1, `exactly one row added: ${JSON.stringify(added)}`)
    assert.strictEqual(after.length, before.length + 1)
    return added[0]
}

//isUuidRow, 多出之列為新產生之主鍵(自有id欄, UUIDv7), 文件列另驗name為n
let isUuidRow = (row, api) => {
    if (isGfsApi(api)) {
        return reUuid.test(row)
    }
    let m = /^"([^"]+)":n$/.exec(row)
    return m !== null && reUuid.test(m[1])
}


describe('pk own', function() {


    before(async function() {
        ctPort = await startContainer(ctName)
        rawClient = new mongodb.MongoClient(genUrl(ctPort))
        await rawClient.connect()
    })


    after(async function() {
        if (rawClient !== null) {
            await rawClient.close().catch(() => {})
            rawClient = null
        }
        await stopContainer(ctName)
    })


    //S1、S3: 入口 x 形狀 x 有無同值既有列 x autoGenPk
    for (let api of ['insert', 'insertBulk', 'save', 'insertGfs', 'del', 'delGfs']) {
        describe(`${api}: shapes x seed x autoGenPk`, function() {
            for (let shape of shapes) {
                for (let seed of ['same', 'other']) {
                    for (let autoGenPk of [true, false]) {
                        it(`${shape.name}, seed ${seed}, autoGenPk ${autoGenPk}`, async function() {
                            let { before, after, rej, r, evs, count } = await runCell(api, shape, seed, autoGenPk)

                            if (api === 'del' || api === 'delGfs') {

                                if (shape.kind === 'unbrought') {
                                    //S3: 繼承(或自有不可列舉)之主鍵視為未給, 該筆ok為0附既有之無效主鍵訊息, 庫內同值之列不被刪除, 不連線(同批皆不合格)
                                    assert.strictEqual(rej, null)
                                    assert.deepStrictEqual(r, [{ n: 0, nDeleted: 0, ok: 0, err: `invalid id: ${shape.delErr} at [data[0].id]` }])
                                    assert.deepStrictEqual(after, before)
                                    assert.strictEqual(count.n, 0)
                                    assert.strictEqual(nType(evs, 'error', api), 1)
                                }
                                else if (seed === 'same') {
                                    //對照: 自有可列舉者照常刪除同值之列
                                    assert.strictEqual(rej, null)
                                    assert.deepStrictEqual(r, [{ n: 1, nDeleted: 1, ok: 1 }])
                                    assert.deepStrictEqual(after, before.filter((v) => v !== (api === 'del' ? '"a9":orig' : 'a9')))
                                    assert.strictEqual(nType(evs, 'error'), 0)
                                }
                                else {
                                    assert.strictEqual(rej, null)
                                    assert.deepStrictEqual(r, [{ n: 0, nDeleted: 0, ok: 1 }])
                                    assert.deepStrictEqual(after, before)
                                    assert.strictEqual(nType(evs, 'error'), 0)
                                }
                                return
                            }

                            //insert系與save
                            if (shape.kind === 'unbrought') {

                                if (autoGenPk) {
                                    //S1: 補新主鍵(自有可列舉之資料屬性, UUIDv7), 既有之列(含同值者)原封不動, 不寫入缺主鍵之列
                                    assert.strictEqual(rej, null, rej === null ? '' : msgOf(rej))
                                    assert.ok(isUuidRow(onlyAdded(before, after), api), `added row is new uuid: ${JSON.stringify(after)}`)
                                    if (api === 'save') {
                                        assert.deepStrictEqual(r, [{ n: 1, nInserted: 1, nModified: 0, ok: 1 }])
                                    }
                                    else {
                                        assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
                                    }
                                    assert.strictEqual(nType(evs, 'error'), 0)
                                    assert.strictEqual(nType(evs, 'change', api), 1)
                                }
                                else {
                                    //S1: 照既有之未帶處置, 整批reject, 不連線不寫入, error事件於reject前恰一次
                                    assert.strictEqual(rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej), 'invalid data[0].id, autoGenPk is false')
                                    assert.deepStrictEqual(after, before)
                                    assert.strictEqual(count.n, 0)
                                    assert.strictEqual(nType(evs, 'error', api), 1)
                                    assert.strictEqual(nType(evs, 'change'), 0)
                                }

                            }
                            else {

                                //對照: 自有可列舉之id='a9'照既有行為(不隨autoGenPk改變)
                                if (seed === 'same') {
                                    if (api === 'insertBulk') {
                                        assert.ok(rej !== null && /duplicate key/.test(msgOf(rej)), rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej))
                                        assert.deepStrictEqual(after, before)
                                    }
                                    else if (api === 'save') {
                                        assert.strictEqual(rej, null)
                                        assert.deepStrictEqual(r, [{ n: 1, nInserted: 0, nModified: 1, ok: 1 }])
                                        assert.deepStrictEqual(after, before.map((v) => v === '"a9":orig' ? '"a9":n' : v).sort())
                                    }
                                    else {
                                        assert.strictEqual(rej, null)
                                        assert.deepStrictEqual(r, { n: 1, nInserted: 0, ok: 1 })
                                        assert.deepStrictEqual(after, before)
                                    }
                                }
                                else {
                                    assert.strictEqual(rej, null)
                                    let added = onlyAdded(before, after)
                                    assert.strictEqual(added, isGfsApi(api) ? 'a9' : '"a9":n')
                                    if (api === 'save') {
                                        assert.deepStrictEqual(r, [{ n: 1, nInserted: 1, nModified: 0, ok: 1 }])
                                    }
                                    else {
                                        assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
                                    }
                                }

                            }
                        })
                    }
                }
            }
        })
    }


    describe('batches: each row is decided by its own id', function() {

        //mkRows, 一批列: 繼承字串a9、自有b1、繼承數字、無id、繼承字串a9(第二筆)
        let mkRows = (api) => {
            return [
                shapes[0].make(extraOf(api)),
                { id: 'b1', ...extraOf(api) },
                shapes[1].make(extraOf(api)),
                shapes[9].make(extraOf(api)),
                shapes[0].make(extraOf(api)),
            ]
        }

        for (let api of ['insert', 'insertBulk', 'save', 'insertGfs']) {

            it(`${api}: autoGenPk true, inherited and missing rows get distinct new ids, own id kept, existing a9 untouched`, async function() {
                let cl = genCl()
                await seedCl(cl, api, 'same')
                let before = await snap(cl, api)
                let wo = WOrm(genOpt(cl, { autoGenPk: true }))
                let r = await callApi(wo, api, mkRows(api))
                let after = await snap(cl, api)
                assert.ok(before.every((v) => after.includes(v))) //既有之a9、123等原封不動
                let added = after.filter((v) => !before.includes(v))
                assert.strictEqual(added.length, 5) //五筆皆寫入: 自有b1一筆, 其餘四筆(繼承字串兩筆、繼承數字、無id)各補新主鍵
                let b1 = isGfsApi(api) ? 'b1' : '"b1":n'
                assert.strictEqual(added.filter((v) => v === b1).length, 1)
                let news = added.filter((v) => v !== b1)
                assert.strictEqual(news.length, 4)
                assert.ok(news.every((v) => isUuidRow(v, api)))
                assert.strictEqual(new Set(news).size, 4) //四個新主鍵互異
                if (api === 'save') {
                    assert.deepStrictEqual(r.map((v) => [v.ok, v.nInserted, v.nModified]), [[1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0], [1, 1, 0]])
                }
                else {
                    assert.deepStrictEqual(r, { n: 5, nInserted: 5, ok: 1 })
                }
                await dropCl(cl)
            })

            it(`${api}: autoGenPk false, whole batch rejected at the smallest index of the unbrought row, nothing written`, async function() {
                let cl = genCl()
                await seedCl(cl, api, 'other')
                let before = await snap(cl, api)
                let wo = WOrm(genOpt(cl, { autoGenPk: false }))
                let rows = [{ id: 'b1', ...extraOf(api) }, shapes[0].make(extraOf(api)), { id: 'b2', ...extraOf(api) }]
                let rej = null
                try {
                    await callApi(wo, api, rows)
                }
                catch (err) {
                    rej = err
                }
                assert.strictEqual(rej === null ? 'resolved' : msgOf(rej), 'invalid data[1].id, autoGenPk is false')
                assert.deepStrictEqual(await snap(cl, api), before) //有效之b1、b2亦不寫入
                await dropCl(cl)
            })

        }

        for (let api of ['del', 'delGfs']) {
            it(`${api}: inherited row is ok 0, valid own row beside it is deleted, the same-valued existing row stays`, async function() {
                let cl = genCl()
                await seedCl(cl, api, 'same')
                await (async () => {
                    //另植zz9, 供同批之自有主鍵列刪除
                    if (api === 'del') {
                        await getCl(cl).insertOne({ id: 'zz9', name: 'orig' })
                    }
                    else {
                        await WOrm(genOpt(cl)).insertGfs([{ id: 'zz9', u8a: u8a() }])
                    }
                })()
                let wo = WOrm(genOpt(cl))
                let r = await callApi(wo, api, [shapes[0].make(extraOf(api)), { id: 'zz9', ...extraOf(api) }, shapes[1].make(extraOf(api))])
                assert.deepStrictEqual(r, [
                    { n: 0, nDeleted: 0, ok: 0, err: 'invalid id: not a string at [data[0].id]' },
                    { n: 1, nDeleted: 1, ok: 1 },
                    { n: 0, nDeleted: 0, ok: 0, err: 'invalid id: not a string at [data[2].id]' },
                ])
                let after = await snap(cl, api)
                assert.ok(isGfsApi(api) ? after.includes('a9') && after.includes('123') : after.includes('"a9":orig') && after.includes('"123":orig-str') && after.includes('123:orig-num'))
                assert.ok(isGfsApi(api) ? !after.includes('zz9') : !after.includes('"zz9":orig'))
                await dropCl(cl)
            })
        }

        it('insert: two rows both inheriting the same id do not collide with each other or with the existing row', async function() {
            let cl = genCl()
            await seedCl(cl, 'insert', 'same')
            let wo = WOrm(genOpt(cl))
            let r = await wo.insert([shapes[0].make({ name: 'n' }), shapes[4].make({ name: 'n' })])
            assert.deepStrictEqual(r, { n: 2, nInserted: 2, ok: 1 })
            let after = await snapDocs(cl)
            assert.strictEqual(after.filter((v) => /^"[0-9a-f-]{36}":n$/.test(v)).length, 2)
            assert.ok(!after.some((v) => v.startsWith('NOID')))
            await dropCl(cl)
        })

    })


    describe('new id is an ordinary own enumerable data property (S1), seen by the change event data', function() {

        //S1: 補值以defineProperty定義為自有可列舉之資料屬性(同賦值所建者: enumerable、writable、configurable皆真), 原型上之id被遮蔽
        for (let api of ['insert', 'insertBulk', 'save', 'insertGfs']) {
            for (let shape of [shapes[0], shapes[4], shapes[6], shapes[7], shapes[9]]) {
                it(`${api}: ${shape.name}`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl))
                    let evs = collect(wo)
                    await callApi(wo, api, [shape.make(extraOf(api))])
                    let ch = evs.filter((v) => v.type === 'change' && v.mode === api)
                    assert.strictEqual(ch.length, 1)
                    let row = ch[0].data[0]
                    let desc = Object.getOwnPropertyDescriptor(row, 'id')
                    assert.ok(desc !== undefined && 'value' in desc, 'own data property')
                    assert.strictEqual(desc.enumerable, true)
                    assert.strictEqual(desc.writable, true)
                    assert.strictEqual(desc.configurable, true)
                    assert.ok(reUuid.test(desc.value))
                    assert.ok(Object.keys(row).includes('id'))
                    await dropCl(cl)
                })
            }
        }

    })


    describe('single object whose keys are all inherited (no own key) is no data, as before (outside this rule)', function() {

        it('insert, save, del: the early return is unchanged and nothing is written or deleted', async function() {
            let cl = genCl()
            await seedCl(cl, 'insert', 'same')
            let before = await snapDocs(cl)
            let wo = WOrm(genOpt(cl))
            assert.deepStrictEqual(await wo.insert(Object.create({ id: 'a9' })), { n: 0, nInserted: 0, ok: 1 })
            assert.deepStrictEqual(await wo.save(Object.create({ id: 'a9' })), [])
            assert.deepStrictEqual(await wo.del(Object.create({ id: 'a9' })), [])
            assert.deepStrictEqual(await snapDocs(cl), before)
            await dropCl(cl)
        })

    })


    describe('single object input (not wrapped in an array)', function() {

        it('insert, save: autoGenPk true gives the inherited row a new id; del: ok 0 and existing row stays', async function() {
            let cl = genCl()
            await seedCl(cl, 'insert', 'same')
            let before = await snapDocs(cl)
            let wo = WOrm(genOpt(cl))

            let r = await wo.insert(shapes[0].make({ name: 'n' }))
            assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
            r = await wo.save(shapes[4].make({ name: 'n' }), { autoInsert: true })
            assert.deepStrictEqual(r, [{ n: 1, nInserted: 1, nModified: 0, ok: 1 }])
            r = await wo.del(shapes[0].make({ name: 'n' }))
            assert.deepStrictEqual(r, [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id: not a string at [data[0].id]' }])

            let after = await snapDocs(cl)
            assert.ok(before.every((v) => after.includes(v)))
            let added = after.filter((v) => !before.includes(v))
            assert.strictEqual(added.length, 2)
            assert.ok(added.every((v) => isUuidRow(v, 'insert')))
            await dropCl(cl)
        })

    })


    describe('judgement does not over-read valid input (S2): value first, descriptor only when a value is given', function() {

        //mkProxyRow, 記錄替身: 依發生順序記錄get陷阱與getOwnPropertyDescriptor陷阱對id之讀取(seq)
        //註: 入口之判斷函數(isearr、iseobj)對首筆元素會列舉其自有鍵(經getOwnPropertyDescriptor陷阱), 故各案之列皆帶自有欄name(否則入口視為無數據而不處理),
        //且以[首次get(id)之後]之getOwnPropertyDescriptor(id)次數為準(排除入口判斷函數之列舉)
        let mkProxyRow = (target, getId) => {
            let log = { seq: [] }
            let p = new Proxy(target, {
                get(t, k, rcv) {
                    if (k === 'id') {
                        log.seq.push('get')
                        if (getId !== undefined) {
                            return getId
                        }
                    }
                    return Reflect.get(t, k, rcv)
                },
                getOwnPropertyDescriptor(t, k) {
                    if (k === 'id') {
                        log.seq.push('gopd')
                    }
                    return Reflect.getOwnPropertyDescriptor(t, k)
                },
            })
            return { p, log }
        }

        //delGfs不複製data(元素原物件直接讀取), 故可由陷阱觀察讀取次序與次數; 先以既有路徑取值(get陷阱一次), 值為未帶或無效者不查描述子(S2)
        let cases = [
            { name: 'missing id', target: () => ({ name: 'n' }), getId: undefined, gopd: 0, err: 'not a string' },
            { name: 'id undefined', target: () => ({ id: undefined, name: 'n' }), getId: undefined, gopd: 0, err: 'not a string' },
            { name: 'id empty string', target: () => ({ id: '', name: 'n' }), getId: undefined, gopd: 0, err: 'string is empty' },
            { name: 'invalid id (number)', target: () => ({ id: 5, name: 'n' }), getId: undefined, gopd: 0, err: 'not a string' },
            { name: 'invalid id (NUL string)', target: () => ({ id: 'a\u0000b', name: 'n' }), getId: undefined, gopd: 0, err: 'string contains NUL' },
            { name: 'valid own string, existing file deleted', target: () => ({ id: 'a9', name: 'n' }), getId: undefined, gopd: 1, del: true },
            { name: 'valid value only from the get trap (no own property), not deleted', target: () => ({ name: 'n' }), getId: 'a9', gopd: 1, err: 'not a string' },
            { name: 'valid value inherited through the target prototype, not deleted', target: () => Object.assign(Object.create({ id: 'a9' }), { name: 'n' }), getId: undefined, gopd: 1, err: 'not a string' },
        ]
        for (let c of cases) {
            it(`delGfs: ${c.name}`, async function() {
                let cl = genCl()
                await seedCl(cl, 'delGfs', 'same')
                let { p, log } = mkProxyRow(c.target(), c.getId)
                let wo = WOrm(genOpt(cl))
                let r = await wo.delGfs([p])
                assert.strictEqual(log.seq.filter((v) => v === 'get').length, 1) //id僅取一次
                let nGopd = log.seq.slice(log.seq.indexOf('get') + 1).filter((v) => v === 'gopd').length
                assert.strictEqual(nGopd, c.gopd) //值為未帶或無效者不查描述子, 給了而有效者查一次
                if (c.del) {
                    assert.deepStrictEqual(r, [{ n: 1, nDeleted: 1, ok: 1 }])
                    assert.deepStrictEqual(await snapGfs(cl), ['123'])
                }
                else {
                    assert.deepStrictEqual(r, [{ n: 0, nDeleted: 0, ok: 0, err: `invalid id: ${c.err} at [data[0].id]` }])
                    assert.deepStrictEqual(await snapGfs(cl), ['123', 'a9'])
                }
                await dropCl(cl)
            })
        }

        it('delGfs: own enumerable accessor id is read exactly once and works as a given id (descriptor lookup does not call the getter)', async function() {
            let cl = genCl()
            await seedCl(cl, 'delGfs', 'same')
            let n = 0
            let row = Object.defineProperty({}, 'id', {
                enumerable: true,
                configurable: true,
                get() {
                    n++
                    return 'a9'
                },
            })
            let wo = WOrm(genOpt(cl))
            let r = await wo.delGfs([row])
            assert.deepStrictEqual(r, [{ n: 1, nDeleted: 1, ok: 1 }])
            assert.strictEqual(n, 1)
            await dropCl(cl)
        })

        //非物件與null之列: 取值為未帶即短路, 不得對其查描述子(propertyIsEnumerable.call(null)會拋TypeError)
        let oddRows = () => [null, undefined, 5, 'str', {}, { id: undefined }, { id: null }, { id: '' }]
        let oddErrs = [
            'invalid id: not a string at [data[0].id]',
            'invalid id: not a string at [data[1].id]',
            'invalid id: not a string at [data[2].id]',
            'invalid id: not a string at [data[3].id]',
            'invalid id: not a string at [data[4].id]',
            'invalid id: not a string at [data[5].id]',
            'invalid id: not a string at [data[6].id]',
            'invalid id: string is empty at [data[7].id]',
        ]
        for (let api of ['del', 'delGfs']) {
            it(`${api}: null, undefined, primitive and missing-id rows keep their existing ok 0 messages`, async function() {
                let cl = genCl()
                await seedCl(cl, api, 'same')
                let before = await snap(cl, api)
                let wo = WOrm(genOpt(cl))
                let r = await callApi(wo, api, oddRows())
                assert.deepStrictEqual(r.map((v) => [v.ok, v.nDeleted, v.err]), oddErrs.map((v) => [0, 0, v]))
                assert.deepStrictEqual(await snap(cl, api), before)
                await dropCl(cl)
            })
        }

        it('insert: a null row after a valid row keeps the native read error, nothing written (value is read before any descriptor lookup)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let rej = null
            try {
                await wo.insert([{ name: 'n' }, null])
            }
            catch (err) {
                rej = err
            }
            assert.ok(rej !== null && /Cannot read properties of null \(reading 'id'\)/.test(msgOf(rej)), rej === null ? 'resolved' : msgOf(rej))
            assert.deepStrictEqual(await snapDocs(cl), [])
            await dropCl(cl)
        })

        it('insert: a number row keeps the native assignment error (non-object rows still use assignment)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let rej = null
            try {
                await wo.insert([5])
            }
            catch (err) {
                rej = err
            }
            assert.ok(rej !== null && /Cannot create property 'id' on number '5'/.test(msgOf(rej)), rej === null ? 'resolved' : msgOf(rej))
            await dropCl(cl)
        })

    })


    describe('selectByPk, selectByPkGfs take a scalar (S4): passing a row object is not a lookup', function() {

        it('row object with inherited id returns null without event; the scalar finds the row', async function() {
            let cl = genCl()
            await getCl(cl).insertOne({ id: 'a9', name: 'orig' })
            await WOrm(genOpt(cl)).insertGfs([{ id: 'a9', u8a: u8a() }])
            let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
            let evs = collect(wo)
            assert.strictEqual(await wo.selectByPk(shapes[0].make({ name: 'n' })), null)
            assert.strictEqual(await wo.selectByPkGfs(shapes[0].make({ name: 'n' })), null)
            assert.strictEqual(count.n, 0) //不連線
            assert.strictEqual(evs.length, 0)
            let r = await wo.selectByPk('a9')
            assert.strictEqual(r.name, 'orig')
            let g = await wo.selectByPkGfs('a9')
            assert.strictEqual(g.id, 'a9')
            await dropCl(cl)
        })

    })


    describe('inherited non-id fields are outside this rule (S5): existing handling unchanged', function() {

        it('insert, save: only own enumerable fields are stored, the inherited non-id field is not', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let mk = (id) => Object.assign(Object.create({ tag: 'T' }), { id, name: 'n' })
            await wo.insert([mk('x1')])
            await wo.save([mk('x2')], { autoInsert: true })
            let rs = await getCl(cl).find({}, { projection: { _id: 0 } }).toArray()
            rs.sort((a, b) => a.id < b.id ? -1 : 1)
            assert.deepStrictEqual(rs, [{ id: 'x1', name: 'n' }, { id: 'x2', name: 'n' }])
            await dropCl(cl)
        })

    })


})

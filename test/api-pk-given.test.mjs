import assert from 'assert'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


//主鍵(id)之「未帶」與「給了而不合格」之判定, 規則見sgud/rule/rulebook.md R-PKGIVEN-01
//規格(主控裁示, wsemi 1.9.69起判斷函數不收String包裝物件而使procPk之isestr判定改變):
//  S1 只有undefined、null(及既有文件化之空字串)視為未帶主鍵: autoGenPk為true自動產生, 為false拋invalid data[k].id, autoGenPk is false
//  S2 給了而非字串(數字、布林、物件、陣列、String包裝物件、Symbol、BigInt等)一律依chkPk拒絕invalid id: not a string at [data[k].id], 不回顯值, 不得靜默替換為新id
//  S3 涵蓋所有收主鍵之入口(insert、insertBulk、save、insertGfs、del、delGfs、selectByPk、selectByPkGfs), 依各入口既有之失敗通道: 整批reject、逐筆ok為0附err、查無回傳null
//  S4 執行參數(opt.autoGenPk、option.returnList)給了非布林值者依K3取預設, 不拒絕
//每案使用全新資料表; 種子與驗證一律由驅動直接讀寫(GridFS之種子除外)


let ctName = process.env.WORM_PK_CT || 'worm-test-mongodb-pkgiven' //環境變數僅供變異測試並行時各取不同容器名
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
    return `pk${nCl}`
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

//rawIds, 以驅動取資料表全部id並升冪排序
let rawIds = async (cl) => {
    let rs = await getCl(cl).find({}, { projection: { _id: 0, id: 1 } }).toArray()
    return rs.map((v) => v.id).sort()
}

//rawGfsIds, 以驅動取GridFS全部檔名並升冪排序
let rawGfsIds = async (cl) => {
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

//mkDoc, mkGfs, hasId為false時不帶id鍵
let mkDoc = (hasId, id, extra) => {
    return hasId ? { id, name: 'n', ...extra } : { name: 'n', ...extra }
}
let mkGfs = (hasId, id) => {
    return hasId ? { id, u8a: u8a() } : { u8a: u8a() }
}

//callApi, 以單筆數據呼叫各寫入入口, 回傳該入口之Promise
let callApi = (wo, api, hasId, id) => {
    if (api === 'insert') {
        return wo.insert([mkDoc(hasId, id)])
    }
    if (api === 'insertBulk') {
        return wo.insertBulk([mkDoc(hasId, id)])
    }
    if (api === 'save') {
        return wo.save([mkDoc(hasId, id)], { autoInsert: true })
    }
    if (api === 'insertGfs') {
        return wo.insertGfs([mkGfs(hasId, id)])
    }
    throw new Error(`unknown api: ${api}`)
}

//stored, 取該入口寫入之主鍵全集
let stored = async (cl, api) => {
    return api === 'insertGfs' ? rawGfsIds(cl) : rawIds(cl)
}


//給了而非字串之id(S2)與其不得被回顯之標記; 以工廠函數取值使每案皆為全新值
let badIds = [
    { name: 'number 5', make: () => 5 },
    { name: 'number 0', make: () => 0 },
    { name: 'NaN', make: () => NaN },
    { name: 'boolean true', make: () => true },
    { name: 'boolean false', make: () => false },
    { name: 'plain object', make: () => ({ a: 'SECRET-OBJ' }), secret: 'SECRET-OBJ' },
    {
        name: 'object with toString',
        make: () => ({
            toString() {
                return 'SECRET-TS'
            }
        }),
        secret: 'SECRET-TS',
    },
    { name: 'array', make: () => ['SECRET-ARR'], secret: 'SECRET-ARR' },
    { name: 'empty array', make: () => [] },
    { name: 'String wrapper', make: () => new String('wrap'), secret: 'wrap' }, // eslint-disable-line no-new-wrappers
    { name: 'Number wrapper', make: () => new Number(5) }, // eslint-disable-line no-new-wrappers
    { name: 'Boolean wrapper', make: () => new Boolean(true) }, // eslint-disable-line no-new-wrappers
    { name: 'Symbol', make: () => Symbol('SYM-ID'), secret: 'SYM-ID' },
    { name: 'BigInt', make: () => 10n },
    { name: 'function', make: () => () => 'f' },
    { name: 'Date', make: () => new Date(0) },
]

//讀取即拋錯或已撤銷之物件(S2之特例: 於複製階段即被拒收之入口見下方專案)
let genThrower = () => {
    let trap = () => {
        throw new Error('TRAP-SECRET')
    }
    return new Proxy({}, new Proxy({}, { get: () => trap }))
}
let genRevoked = () => {
    let r = Proxy.revocable({}, {})
    r.revoke()
    return r.proxy
}


describe('pk given', function() {


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


    for (let autoGenPk of [true, false]) {

        describe(`given non-string id is rejected, never replaced (autoGenPk: ${autoGenPk})`, function() {

            //S2、S3: insert、insertBulk、insertGfs於連線與寫入之前整批reject, 不寫入, error事件於reject前恰一次, change不發
            for (let api of ['insert', 'insertBulk', 'insertGfs']) {
                for (let c of badIds) {
                    it(`${api}: ${c.name}`, async function() {
                        let cl = genCl()
                        let { wo, count } = withSpyClient(() => WOrm(genOpt(cl, { autoGenPk })))
                        let evs = collect(wo)
                        let rej = null
                        let r = null
                        try {
                            r = await callApi(wo, api, true, c.make())
                        }
                        catch (err) {
                            rej = err
                        }
                        assert.strictEqual(rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej), 'invalid id: not a string at [data[0].id]') //S2
                        assert.deepStrictEqual(await stored(cl, api), []) //不得以新id寫入
                        assert.strictEqual(count.n, 0) //拒絕於連線之前
                        assert.strictEqual(nType(evs, 'error', api), 1)
                        assert.strictEqual(nType(evs, 'change'), 0)
                        assert.strictEqual(evs[0].err, 'invalid id: not a string at [data[0].id]')
                        if (c.secret) {
                            assert.ok(JSON.stringify(evs.map((v) => v.err)).indexOf(c.secret) < 0 && msgOf(rej).indexOf(c.secret) < 0) //不回顯值
                        }
                        await dropCl(cl)
                    })
                }
            }

            //S2、S3: save該筆ok為0附err(逐筆通道, 不隨autoGenPk改變而改為整批reject), 不寫入
            for (let c of badIds) {
                it(`save: ${c.name}`, async function() {
                    let cl = genCl()
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl, { autoGenPk })))
                    let evs = collect(wo)
                    let r = await wo.save([mkDoc(true, c.make())], { autoInsert: true })
                    assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[0, 'invalid id: not a string at [data[0].id]']]) //S2
                    assert.deepStrictEqual(await rawIds(cl), [])
                    assert.strictEqual(count.n, 0) //同批皆不合格不連線
                    assert.strictEqual(nType(evs, 'error', 'save'), 1)
                    if (c.secret) {
                        assert.ok(JSON.stringify(evs.map((v) => v.err)).indexOf(c.secret) < 0 && JSON.stringify(r).indexOf(c.secret) < 0)
                    }
                    await dropCl(cl)
                })
            }

        })

    }


    describe('given unreadable id (throwing or revoked Proxy value, throwing own getter) is never replaced', function() {

        //genGetterItem, id為自有存取器且讀取即拋錯
        let genGetterItem = () => {
            let o = { name: 'n', u8a: u8a() }
            Object.defineProperty(o, 'id', {
                get() {
                    throw new Error('TRAP-SECRET')
                },
                enumerable: true,
                configurable: true,
            })
            return o
        }

        //kinds, mk為單筆數據之工廠; reCopy為於資料複製階段(cloneDeep)被拒收者之錯誤訊息; reGfs為insertGfs之錯誤訊息;
        //isValue為true者id「值」為Proxy(insertGfs、delGfs不深拷貝而走到主鍵檢核, selectByPk與selectByPkGfs回傳null)
        let kinds = [
            { nm: 'throwing Proxy value', mk: () => ({ id: genThrower(), name: 'n', u8a: u8a() }), isValue: true, reCopy: /^TRAP-SECRET$/, reGfs: /^invalid id: not a string at \[data\[0\]\.id\]$/ },
            { nm: 'revoked Proxy value', mk: () => ({ id: genRevoked(), name: 'n', u8a: u8a() }), isValue: true, reCopy: /revoked/, reGfs: /^invalid id: not a string at \[data\[0\]\.id\]$/ },
            { nm: 'throwing own getter', mk: genGetterItem, isValue: false, reCopy: /^TRAP-SECRET$/, reGfs: /^TRAP-SECRET$/ },
        ]

        //callItem, 以單筆已備妥之數據呼叫入口
        let callItem = (wo, api, item) => {
            if (api === 'insert') {
                return wo.insert([item])
            }
            if (api === 'insertBulk') {
                return wo.insertBulk([item])
            }
            if (api === 'save') {
                return wo.save([item], { autoInsert: true })
            }
            if (api === 'del') {
                return wo.del([item])
            }
            if (api === 'insertGfs') {
                return wo.insertGfs([item])
            }
            return wo.delGfs([item])
        }

        for (let k of kinds) {

            //S2特例: 此值於資料複製階段(cloneDeep)即拋錯, 屬既有行為(R-DIAG-01, 拋出位置在try之外故不發error事件, 錯誤為該物件所拋之值), 仍為reject而非補值, 不寫入亦不刪除
            for (let api of ['insert', 'insertBulk', 'save', 'del']) {
                it(`${api}: ${k.nm} rejects at the copy stage, writes and deletes nothing`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl))
                    let evs = collect(wo)
                    await getCl(cl).insertOne({ id: 'good', name: 'g' })
                    let rej = null
                    let r = null
                    try {
                        r = await callItem(wo, api, k.mk())
                    }
                    catch (err) {
                        rej = err
                    }
                    assert.ok(rej !== null, `must reject, resolved ${JSON.stringify(r)}`)
                    assert.ok(k.reCopy.test(msgOf(rej)), msgOf(rej))
                    assert.strictEqual(nType(evs, 'error'), 0)
                    assert.strictEqual(nType(evs, 'change'), 0)
                    assert.deepStrictEqual(await rawIds(cl), ['good']) //既有列原樣, 無新id列
                    await dropCl(cl)
                })
            }

            //insertGfs只淺拷貝而不深拷貝: 值為Proxy者走到主鍵檢核, 自有存取器拋錯者於展開時即拋
            it(`insertGfs: ${k.nm} rejects and nothing is written`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                await assert.rejects(() => callItem(wo, 'insertGfs', k.mk()), (err) => k.reGfs.test(msgOf(err)))
                assert.deepStrictEqual(await rawGfsIds(cl), [])
                await dropCl(cl)
            })

            //delGfs不複製: 值為Proxy者該筆ok為0; 自有存取器拋錯者於取id時即整批reject
            it(`delGfs: ${k.nm} is not deleted`, async function() {
                let cl = genCl()
                let woSeed = WOrm(genOpt(cl))
                await woSeed.insertGfs([{ id: 'good', u8a: u8a() }])
                let wo = WOrm(genOpt(cl))
                if (k.isValue) {
                    let r = await callItem(wo, 'delGfs', k.mk())
                    assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[0, 'invalid id: not a string at [data[0].id]']])
                }
                else {
                    await assert.rejects(() => callItem(wo, 'delGfs', k.mk()), (err) => /^TRAP-SECRET$/.test(msgOf(err)))
                }
                assert.deepStrictEqual(await rawGfsIds(cl), ['good'])
                await dropCl(cl)
            })

            //selectByPk、selectByPkGfs之參數為id值本身, 僅值為Proxy者適用, 回傳null
            if (k.isValue) {
                it(`selectByPk and selectByPkGfs: ${k.nm} is invalid, not an error`, async function() {
                    let cl = genCl()
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    assert.strictEqual(await wo.selectByPk(k.mk().id), null)
                    assert.strictEqual(await wo.selectByPkGfs(k.mk().id), null)
                    assert.strictEqual(count.n, 0)
                    await dropCl(cl)
                })
            }

        }

    })


    describe('single object input and returnList (index 0, whole-batch channel unchanged)', function() {

        //S2、S3: 輸入為單一物件(非陣列)時索引為0, 與陣列輸入同
        for (let api of ['insert', 'insertBulk', 'insertGfs']) {
            it(`${api}: a single object with a non-string id rejects at index 0`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let item = api === 'insertGfs' ? mkGfs(true, 5) : mkDoc(true, 5)
                await assert.rejects(() => wo[api](item), (err) => msgOf(err) === 'invalid id: not a string at [data[0].id]')
                assert.deepStrictEqual(await stored(cl, api), [])
                await dropCl(cl)
            })
        }

        it('save: a single object with a non-string id gives ok 0 at index 0', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let r = await wo.save(mkDoc(true, 5), { autoInsert: true })
            assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[0, 'invalid id: not a string at [data[0].id]']])
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

        //option.returnList為true時整批性錯誤仍為reject, 不回逐筆陣列
        it('insert with returnList true still rejects the whole batch for a non-string id', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await assert.rejects(() => wo.insert([mkDoc(true, 'a'), mkDoc(true, 5)], { returnList: true }), (err) => msgOf(err) === 'invalid id: not a string at [data[1].id]')
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

    })


    describe('del, delGfs, selectByPk, selectByPkGfs: given non-string id never hits an existing row', function() {

        //S3: 此四入口修前即不補值, 本組釘住其行為不隨判斷函數語意改變且不隨autoGenPk改變; 以既有之'good'列證明不誤中
        for (let [c, autoGenPk] of badIds.flatMap((v) => [[v, true], [v, false]])) {
            it(`${c.name} (autoGenPk: ${autoGenPk})`, async function() {
                let cl = genCl()

                //種子, 以另一實例寫入, 使下方受測實例之MongoClient建立次數只計該四入口
                let woSeed = WOrm(genOpt(cl))
                await getCl(cl).insertOne({ id: 'good', name: 'g' })
                await woSeed.insertGfs([{ id: 'good', u8a: u8a() }])

                let { wo, count } = withSpyClient(() => WOrm(genOpt(cl, { autoGenPk })))
                let evs = collect(wo)

                let r = await wo.del([{ id: c.make() }])
                assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[0, 'invalid id: not a string at [data[0].id]']])
                r = await wo.delGfs([{ id: c.make() }])
                assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[0, 'invalid id: not a string at [data[0].id]']])
                assert.strictEqual(await wo.selectByPk(c.make()), null)
                assert.strictEqual(await wo.selectByPkGfs(c.make()), null)

                //四入口皆不連線(selectByPk、selectByPkGfs: 回null不連線不發事件; del、delGfs: 同批皆不合格不連線)
                assert.strictEqual(count.n, 0)

                //既有列未被誤刪、未被誤讀
                assert.deepStrictEqual(await rawIds(cl), ['good'])
                assert.deepStrictEqual(await rawGfsIds(cl), ['good'])
                assert.strictEqual(nType(evs, 'error', 'del'), 1)
                assert.strictEqual(nType(evs, 'error', 'delGfs'), 1)
                assert.strictEqual(nType(evs, 'error', 'selectByPk'), 0)
                assert.strictEqual(nType(evs, 'error', 'selectByPkGfs'), 0)
                await dropCl(cl)
            })
        }

    })


    describe('missing id (absent key, undefined, null, empty string) is not given', function() {

        let missings = [
            { name: 'key absent', has: false },
            { name: 'undefined', has: true, v: undefined },
            { name: 'null', has: true, v: null },
            { name: 'empty string (documented)', has: true, v: '' },
        ]

        for (let api of ['insert', 'insertBulk', 'save', 'insertGfs']) {
            for (let m of missings) {

                //S1: autoGenPk為true自動產生(UUIDv7)
                it(`${api}: ${m.name} gets a generated id when autoGenPk is true`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl, { autoGenPk: true }))
                    let r = await callApi(wo, api, m.has, m.v)
                    assert.ok(api === 'save' ? r.every((v) => v.ok === 1) : r.ok === 1)
                    let ids = await stored(cl, api)
                    assert.strictEqual(ids.length, 1)
                    assert.ok(reUuid.test(ids[0]), ids[0])
                    await dropCl(cl)
                })

                //S1: autoGenPk為false整批reject(save亦同, 屬整批性錯誤), 不寫入
                it(`${api}: ${m.name} rejects the batch when autoGenPk is false`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl, { autoGenPk: false }))
                    let evs = collect(wo)
                    await assert.rejects(() => callApi(wo, api, m.has, m.v), (err) => msgOf(err) === 'invalid data[0].id, autoGenPk is false')
                    assert.deepStrictEqual(await stored(cl, api), [])
                    assert.strictEqual(nType(evs, 'error', api), 1)
                    await dropCl(cl)
                })

            }
        }

        //S1: 同批多筆未帶者各得相異之新id, 與帶有效id者並存且有效id原樣
        it('a batch mixing missing ids and a valid id generates distinct ids and keeps the valid id', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await wo.insert([{ name: 'a' }, { id: undefined, name: 'b' }, { id: null, name: 'c' }, { id: '', name: 'd' }, { id: 'good', name: 'e' }])
            let ids = await rawIds(cl)
            assert.strictEqual(ids.length, 5)
            assert.strictEqual(new Set(ids).size, 5)
            assert.strictEqual(ids.filter((v) => reUuid.test(v)).length, 4)
            assert.ok(ids.includes('good'))
            await dropCl(cl)
        })

    })


    describe('batches: smallest bad index first, nothing written on whole-batch rejection', function() {

        for (let autoGenPk of [true, false]) {

            //S2、S3: 同批之有效筆數亦不寫入
            for (let api of ['insert', 'insertBulk', 'insertGfs']) {
                it(`${api}: [valid, non-string, valid] rejects at index 1 and writes nothing (autoGenPk: ${autoGenPk})`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl, { autoGenPk }))
                    let mk = (id) => (api === 'insertGfs' ? mkGfs(true, id) : mkDoc(true, id))
                    await assert.rejects(() => wo[api]([mk('a'), mk(5), mk('b')]), (err) => msgOf(err) === 'invalid id: not a string at [data[1].id]')
                    assert.deepStrictEqual(await stored(cl, api), [])
                    await dropCl(cl)
                })
            }

            //S2: save逐筆, 其餘筆照常, 不得有補值之新id列
            it(`save: [valid, non-string, valid] gives ok 1, 0, 1 and stores only the valid ids (autoGenPk: ${autoGenPk})`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl, { autoGenPk }))
                let r = await wo.save([mkDoc(true, 'a'), mkDoc(true, 5), mkDoc(true, 'b')], { autoInsert: true })
                assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[1, undefined], [0, 'invalid id: not a string at [data[1].id]'], [1, undefined]])
                assert.deepStrictEqual(await rawIds(cl), ['a', 'b'])
                await dropCl(cl)
            })

        }

        //同一批內非字串與孤立代理字元皆不合格時以索引最小者為準
        it('insert: the smallest index wins between a non-string and a lone surrogate', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await assert.rejects(() => wo.insert([mkDoc(true, 5), mkDoc(true, 'x\uD800')]), (err) => msgOf(err) === 'invalid id: not a string at [data[0].id]')
            await assert.rejects(() => wo.insert([mkDoc(true, 'x\uD800'), mkDoc(true, 5)]), (err) => msgOf(err) === 'invalid id: string contains lone surrogate at [data[0].id]')
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

    })


    describe('execution parameters given as non-boolean take the default (K3), not rejected', function() {

        //S4: opt.autoGenPk非布林值忽略並用預設true(README: 非布林之值一律忽略)
        for (let [nm, v] of [['Boolean wrapper false', new Boolean(false)], ['Boolean wrapper true', new Boolean(true)], ['string false', 'false'], ['number 0', 0], ['null', null]]) { // eslint-disable-line no-new-wrappers
            it(`opt.autoGenPk ${nm} uses the default (true): a missing id is generated`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl, { autoGenPk: v }))
                let r = await wo.insert([{ name: 'noid' }])
                assert.strictEqual(r.ok, 1)
                let ids = await rawIds(cl)
                assert.strictEqual(ids.length, 1)
                assert.ok(reUuid.test(ids[0]))
                await dropCl(cl)
            })
        }

        //S4: option.returnList非布林值忽略並用預設false(回傳聚合物件)
        for (let [nm, v] of [['Boolean wrapper true', new Boolean(true)], ['Boolean wrapper false', new Boolean(false)], ['string true', 'true'], ['number 1', 1]]) { // eslint-disable-line no-new-wrappers
            it(`option.returnList ${nm} uses the default (false): the aggregate object is returned`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let r = await wo.insert([{ id: 'a', name: 'n' }], { returnList: v })
                assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
                await dropCl(cl)
            })
        }

        it('option.returnList true still returns the per-item array (control)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let r = await wo.insert([{ id: 'a', name: 'n' }], { returnList: true })
            assert.deepStrictEqual(r, [{ n: 1, nInserted: 1, ok: 1 }])
            await dropCl(cl)
        })

    })


    describe('valid string ids are unchanged (control)', function() {

        for (let autoGenPk of [true, false]) {
            for (let api of ['insert', 'insertBulk', 'save', 'insertGfs']) {
                it(`${api}: a valid id is stored as given (autoGenPk: ${autoGenPk})`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl, { autoGenPk }))
                    await callApi(wo, api, true, 'good-id')
                    assert.deepStrictEqual(await stored(cl, api), ['good-id'])
                    await dropCl(cl)
                })
            }
        }

    })


})

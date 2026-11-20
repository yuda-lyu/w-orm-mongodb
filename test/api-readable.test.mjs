import assert from 'assert'
import fs from 'fs'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


//讀取即拋錯(不可讀)之輸入, 規則見sgud/rule/rulebook.md R-READABLE-01
//規格(主控共同規則二, 第557項; 依dspec〈輸入參數之檢測機制〉V11、V17、V19、V20):
//  S1 資料容器(data)讀取即拋錯(已撤銷之Proxy、Symbol.toStringTag拋錯、ownKeys陷阱拋錯、陣列[0]或length讀取拋錯等)者, 於判斷函數(iseobj、isearr)回false之分支內以wsemi之chkReadable辨識,
//     走該入口之整批失敗通道: error事件恰一次後reject, 訊息固定詞彙invalid data: must be a readable value(不含原例外文字), 不連線、不寫入、不刪除
//  S2 可讀而型別不符之容器(5、'abc'、null、{}、[]、Map等)維持既有: 視為無數據, 正常結果, 無事件
//  S3 選項(insert與save之option、option.returnList、option.autoInsert; 建構opt、opt.autoGenPk、opt.url、opt.db、opt.cl)讀取即拋錯者依各自之失敗通道
//     (寫入入口: error事件恰一次後reject; 建構: 同步拋錯), 訊息invalid <名稱>: must be a readable value; 可讀而非預期型別者維持既有(K3取預設)
//  S4 insertGfs之u8a不可讀: invalid data[k].u8a: must be a readable value; 可讀而非Uint8Array維持invalid data[k].u8a
//  S5 探針只於判斷函數回false之後執行: 有效輸入不因探針多讀
//  S6 selectByPk與selectByPkGfs之pk讀取即拋錯: reject固定詞彙invalid pk: must be a readable value(error事件恰一次, 數據參數null, 不連線); 可讀而非字串者(5、包裝物件、{}等)維持回null;
//     select、delAll、delAllGfs之find不可讀依R-FIND-01(invalid find), 不變
//  S8 存取器(容器可讀而成員為拋錯之getter, 主控規則四第2點): 讀取處捕捉並轉固定詞彙(不含存取器所拋之原例外文字); 資料內部之巢狀不可讀值(複製階段)與頂層不可讀同一通道(A3, 2026-11-20 oro557d4, 規則四第3點更正)
//  S9 第557項全族對齊輪A1~A6逐代號釘住(align-rules.md): A1選項容器、A2存取器(各種拋出值)、A3複製階段之巢狀不可讀值(6入口 x 位置 x 種類 + 範圍之對照)、A4入口階段拒絕之error事件數據參數null(及其後之拒絕之對照)、A5 pk、A6主鍵給了而無效
//每案使用全新資料表; 種子與驗證一律由驅動直接讀寫(GridFS之種子除外)


let ctName = process.env.WORM_READABLE_CT || 'worm-test-mongodb-readable' //環境變數僅供變異測試並行時各取不同容器名
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
    return `rd${nCl}`
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

//u8a
let u8a = () => new Uint8Array([1, 2, 3])

//reUuid, genIDSeq產生之主鍵(UUIDv7)
let reUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/


//TRAP, 敵意輸入之陷阱拋出之文字, 對外之訊息不得含有
let TRAP = 'TRAP-SECRET'
let boom = () => {
    throw new Error(TRAP)
}

//genTagThrower, Symbol.toStringTag為拋錯之存取器之物件(Object.prototype.toString讀取其標籤即拋錯), extra為其餘自有資料屬性
let genTagThrower = (extra) => {
    let o = { ...extra }
    Object.defineProperty(o, Symbol.toStringTag, { get: boom, configurable: true })
    return o
}

//hostile, 讀取即拋錯之資料容器(以工廠函數取值使每案皆為全新值)
//各案之元素內容為有效數據, 若被誤當成有效輸入即會寫入/刪除而被資料庫狀態抓到
let hostile = [
    {
        name: 'revoked Proxy',
        make: () => {
            let r = Proxy.revocable({ id: 'a' }, {})
            r.revoke()
            return r.proxy
        },
    },
    {
        name: 'Symbol.toStringTag getter throws',
        make: () => genTagThrower({ id: 'a', u8a: u8a() }),
    },
    {
        name: 'ownKeys trap throws',
        make: () => new Proxy({ id: 'a', u8a: u8a() }, { ownKeys: boom }),
    },
    {
        name: 'all traps throw',
        make: () => new Proxy({}, new Proxy({}, { get: () => boom })),
    },
    {
        name: 'array whose [0] getter throws',
        make: () => {
            let a = [{ id: 'a', u8a: u8a() }]
            Object.defineProperty(a, '0', { get: boom, enumerable: true, configurable: true })
            return a
        },
    },
    {
        name: 'array Proxy whose get trap throws for [0]',
        make: () => new Proxy([{ id: 'a', u8a: u8a() }], {
            get(t, k, r) {
                if (k === '0') {
                    throw new Error(TRAP)
                }
                return Reflect.get(t, k, r)
            }
        }),
    },
    {
        name: 'array Proxy whose get trap throws for length',
        make: () => new Proxy([{ id: 'a', u8a: u8a() }], {
            get(t, k, r) {
                if (k === 'length') {
                    throw new Error(TRAP)
                }
                return Reflect.get(t, k, r)
            }
        }),
    },
    {
        name: 'array Proxy (empty first element) whose getOwnPropertyDescriptor trap throws for [0]',
        make: () => new Proxy([null], {
            getOwnPropertyDescriptor(t, k) {
                if (k === '0') {
                    throw new Error(TRAP)
                }
                return Reflect.getOwnPropertyDescriptor(t, k)
            }
        }),
    },
]

//readable, 可讀而型別不符之資料容器(既有: 視為無數據)
let readable = [
    { name: 'undefined', make: () => undefined },
    { name: 'null', make: () => null },
    { name: 'empty string', make: () => '' },
    { name: 'number 5', make: () => 5 },
    { name: 'string', make: () => 'abc' },
    { name: 'boolean', make: () => true },
    { name: 'Symbol', make: () => Symbol('s') },
    { name: 'BigInt', make: () => 10n },
    { name: 'function', make: () => () => 'f' },
    { name: 'String wrapper', make: () => new String('abc') }, // eslint-disable-line no-new-wrappers
    { name: 'Number wrapper', make: () => new Number(5) }, // eslint-disable-line no-new-wrappers
    { name: 'empty object', make: () => ({}) },
    { name: 'empty array', make: () => [] },
    { name: 'array of one empty element', make: () => [null] },
    { name: 'Map', make: () => new Map([['id', 'a']]) },
    { name: 'Date', make: () => new Date(0) },
    { name: 'Buffer', make: () => Buffer.from('abc') },
    { name: 'Uint8Array', make: () => new Uint8Array([1, 2, 3]) },
    { name: 'array Proxy whose ownKeys trap throws (judged by tag, length and [0] only, like isearr: keys are never read)', make: () => new Proxy([], { ownKeys: boom }) },
    { name: 'Map Proxy whose ownKeys trap throws (tag [object Map]: keys are never read)', make: () => new Proxy(new Map(), { ownKeys: boom }) },
]

//ENTRIES, 6個收資料容器之入口; noData為輸入為可讀而型別不符時之既有結果
let aggr = { n: 0, nInserted: 0, ok: 1 }
let ENTRIES = [
    { api: 'insert', call: (wo, x) => wo.insert(x), noData: aggr, kind: 'doc' },
    { api: 'insertBulk', call: (wo, x) => wo.insertBulk(x), noData: aggr, kind: 'doc' },
    { api: 'save', call: (wo, x) => wo.save(x), noData: [], kind: 'doc' },
    { api: 'del', call: (wo, x) => wo.del(x), noData: [], kind: 'doc', seed: true },
    { api: 'insertGfs', call: (wo, x) => wo.insertGfs(x), noData: aggr, kind: 'gfs' },
    { api: 'delGfs', call: (wo, x) => wo.delGfs(x), noData: [], kind: 'gfs', seed: true },
]

//seedCl, 種入既有列(資料表與GridFS), 供刪除類入口證明不被誤刪
let seedCl = async (cl) => {
    await getCl(cl).insertOne({ id: 'good', name: 'g' })
    await WOrm(genOpt(cl)).insertGfs([{ id: 'good', u8a: u8a() }])
}

//expectState, 驗證資料庫狀態: 種入者原樣、無新增(寫入類入口不得有任何一筆)
let expectState = async (cl, seeded) => {
    assert.deepStrictEqual(await rawIds(cl), seeded ? ['good'] : [])
    assert.deepStrictEqual(await rawGfsIds(cl), seeded ? ['good'] : [])
}


describe('readable', function() {


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


    //S1: 資料容器讀取即拋錯
    for (let autoGenPk of [true, false]) {

        describe(`S1 unreadable data container is rejected via the whole-batch channel (autoGenPk: ${autoGenPk})`, function() {

            for (let e of ENTRIES) {
                for (let c of hostile) {
                    it(`${e.api}: ${c.name}`, async function() {
                        let cl = genCl()
                        if (e.seed) {
                            await seedCl(cl)
                        }
                        let { wo, count } = withSpyClient(() => WOrm(genOpt(cl, { autoGenPk })))
                        let evs = collect(wo)
                        let rej = null
                        let r = null
                        try {
                            r = await e.call(wo, c.make())
                        }
                        catch (err) {
                            rej = err
                        }
                        assert.strictEqual(rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej), 'invalid data: must be a readable value') //S1
                        assert.ok(rej instanceof Error)
                        assert.strictEqual(msgOf(rej).indexOf(TRAP), -1) //不含原例外文字
                        assert.strictEqual(count.n, 0) //於連線之前拒絕
                        assert.strictEqual(nType(evs, 'error', e.api), 1) //error事件恰一次
                        assert.strictEqual(evs.length, 1) //且無其他事件(含change)
                        assert.strictEqual(evs[0].err, 'invalid data: must be a readable value')
                        assert.strictEqual(evs[0].data, null) //不把不可讀之輸入交給訂閱函數
                        await expectState(cl, e.seed === true) //資料庫不變
                        await dropCl(cl)
                    })
                }
            }

        })

    }

    it('S1 insert: option.returnList true does not turn the unreadable container into an empty list', async function() {
        let cl = genCl()
        let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
        let evs = collect(wo)
        for (let c of hostile) {
            await assert.rejects(() => wo.insert(c.make(), { returnList: true }), (err) => msgOf(err) === 'invalid data: must be a readable value', c.name)
        }
        assert.strictEqual(count.n, 0)
        assert.strictEqual(nType(evs, 'error', 'insert'), hostile.length)
        assert.deepStrictEqual(await rawIds(cl), [])
        await dropCl(cl)
    })

    it('S1 the same instance keeps working after an unreadable container was rejected (no state left behind)', async function() {
        let cl = genCl()
        let wo = WOrm(genOpt(cl))
        await assert.rejects(() => wo.insert(hostile[0].make()), (err) => msgOf(err) === 'invalid data: must be a readable value')
        let r = await wo.insert([{ id: 'a', name: 'n' }])
        assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
        assert.deepStrictEqual(await rawIds(cl), ['a'])
        await dropCl(cl)
    })


    //S2: 可讀而型別不符者維持既有
    describe('S2 readable but not a container stays "no data" (unchanged)', function() {

        for (let e of ENTRIES) {
            for (let c of readable) {
                it(`${e.api}: ${c.name}`, async function() {
                    let cl = genCl()
                    if (e.seed) {
                        await seedCl(cl)
                    }
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let evs = collect(wo)
                    let r = await e.call(wo, c.make())
                    assert.deepStrictEqual(r, e.noData)
                    assert.strictEqual(count.n, 0)
                    assert.strictEqual(evs.length, 0)
                    await expectState(cl, e.seed === true)
                    await dropCl(cl)
                })
            }
        }

        it('insert: option.returnList true gives the empty list for a readable non-container (unchanged)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            assert.deepStrictEqual(await wo.insert(5, { returnList: true }), [])
            await dropCl(cl)
        })

    })


    //S3: 選項讀取即拋錯
    describe('S3 unreadable options', function() {

        //optHostile, option容器本身不可讀(讀取其鍵即拋錯)
        let optHostile = [
            {
                name: 'revoked Proxy',
                make: () => {
                    let r = Proxy.revocable({}, {})
                    r.revoke()
                    return r.proxy
                },
            },
            { name: 'all traps throw', make: () => new Proxy({}, new Proxy({}, { get: () => boom })) },
            { name: 'get trap throws', make: () => new Proxy({}, { get: boom }) },
        ]

        //valHostile, 單一選項值不可讀
        let valHostile = [
            {
                name: 'revoked Proxy value',
                make: () => {
                    let r = Proxy.revocable({}, {})
                    r.revoke()
                    return r.proxy
                },
            },
            { name: 'Symbol.toStringTag getter throws', make: () => genTagThrower() },
            { name: 'all traps throw', make: () => new Proxy({}, new Proxy({}, { get: () => boom })) },
        ]

        //valReadable, 單一選項值可讀而非布林值(K3: 取預設, 不拒絕)
        let valReadable = [
            { name: 'number 5', make: () => 5 },
            { name: 'string true', make: () => 'true' },
            { name: 'String wrapper', make: () => new String('true') }, // eslint-disable-line no-new-wrappers
            { name: 'Boolean wrapper true', make: () => new Boolean(true) }, // eslint-disable-line no-new-wrappers
            { name: 'Boolean wrapper false', make: () => new Boolean(false) }, // eslint-disable-line no-new-wrappers
            { name: 'empty object', make: () => ({}) },
            { name: 'array', make: () => [true] },
            { name: 'ownKeys trap throws (only keys unreadable; judged by its tag like a boolean is)', make: () => new Proxy({}, { ownKeys: boom }) },
        ]

        //getterOpt, 選項之某鍵為拋錯之存取器
        let getterOpt = (key) => {
            let o = {}
            Object.defineProperty(o, key, { get: boom, enumerable: true, configurable: true })
            return o
        }

        //expectRejected, 驗證寫入入口之整批失敗: 固定詞彙、error事件恰一次、不連線、不寫入
        let expectRejected = async (api, call, msg) => {
            let cl = genCl()
            let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
            let evs = collect(wo)
            let rej = null
            let r = null
            try {
                r = await call(wo)
            }
            catch (err) {
                rej = err
            }
            assert.strictEqual(rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej), msg)
            assert.strictEqual(msgOf(rej).indexOf(TRAP), -1)
            assert.strictEqual(count.n, 0)
            assert.strictEqual(nType(evs, 'error', api), 1)
            assert.strictEqual(evs.length, 1)
            assert.strictEqual(evs[0].err, msg)
            assert.strictEqual(evs[0].data, null) //A4: 入口階段拒絕之error事件數據參數null(不把不可讀之選項連同data交給訂閱函數)
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        }

        //insert
        for (let c of optHostile) {
            it(`insert: option container ${c.name}`, async function() {
                await expectRejected('insert', (wo) => wo.insert([{ id: 'a', name: 'n' }], c.make()), 'invalid option: must be a readable value')
            })
        }
        it('insert: option.returnList getter throws', async function() {
            await expectRejected('insert', (wo) => wo.insert([{ id: 'a', name: 'n' }], getterOpt('returnList')), 'invalid option.returnList: must be a readable value')
        })
        for (let c of valHostile) {
            it(`insert: option.returnList ${c.name}`, async function() {
                await expectRejected('insert', (wo) => wo.insert([{ id: 'a', name: 'n' }], { returnList: c.make() }), 'invalid option.returnList: must be a readable value')
            })
        }
        for (let c of valReadable) {
            it(`insert: option.returnList ${c.name} takes the default (aggregate result), not rejected`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let r = await wo.insert([{ id: 'a', name: 'n' }], { returnList: c.make() })
                assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
                assert.deepStrictEqual(await rawIds(cl), ['a'])
                await dropCl(cl)
            })
        }
        for (let [nm, v] of [['undefined', undefined], ['null', null], ['number 5', 5], ['string', 'x'], ['Symbol.toStringTag getter throws (the option object itself is never tagged: only returnList is read)', genTagThrower()]]) {
            it(`insert: option container ${nm} is readable (only option.returnList is read from it)`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let r = await wo.insert([{ id: 'a', name: 'n' }], v)
                assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
                await dropCl(cl)
            })
        }

        //save
        for (let c of optHostile) {
            it(`save: option container ${c.name}`, async function() {
                await expectRejected('save', (wo) => wo.save([{ id: 'a', name: 'n' }], c.make()), 'invalid option: must be a readable value')
            })
        }
        it('save: option.autoInsert getter throws', async function() {
            await expectRejected('save', (wo) => wo.save([{ id: 'a', name: 'n' }], getterOpt('autoInsert')), 'invalid option.autoInsert: must be a readable value')
        })
        for (let c of valHostile) {
            it(`save: option.autoInsert ${c.name}`, async function() {
                await expectRejected('save', (wo) => wo.save([{ id: 'a', name: 'n' }], { autoInsert: c.make() }), 'invalid option.autoInsert: must be a readable value')
            })
        }
        for (let c of valReadable) {
            it(`save: option.autoInsert ${c.name} is not rejected as unreadable (value handling unchanged)`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let r = await wo.save([{ id: 'a', name: 'n' }], { autoInsert: c.make() })
                assert.ok(Array.isArray(r) && r.length === 1 && r[0].ok === 1, JSON.stringify(r))
                await dropCl(cl)
            })
        }
        for (let [nm, v] of [['undefined', undefined], ['null', null], ['number 5', 5]]) {
            it(`save: option container ${nm} is readable`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let r = await wo.save([{ id: 'a', name: 'n' }], v)
                assert.ok(Array.isArray(r) && r.length === 1 && r[0].ok === 1, JSON.stringify(r))
                assert.deepStrictEqual(await rawIds(cl), ['a'])
                await dropCl(cl)
            })
        }
        it('save: option.autoInsert true and false keep their meaning (control)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            assert.deepStrictEqual((await wo.save([{ id: 'a', name: 'n' }], { autoInsert: false })).map((v) => [v.ok, v.nInserted]), [[1, 0]])
            assert.deepStrictEqual(await rawIds(cl), [])
            assert.deepStrictEqual((await wo.save([{ id: 'a', name: 'n' }], { autoInsert: true })).map((v) => [v.ok, v.nInserted]), [[1, 1]])
            assert.deepStrictEqual(await rawIds(cl), ['a'])
            await dropCl(cl)
        })

    })


    //S3: 建構opt
    describe('S3 unreadable constructor opt (synchronous throw)', function() {

        let boomObj = () => new Proxy({}, new Proxy({}, { get: () => boom }))
        let revokedObj = () => {
            let r = Proxy.revocable({}, {})
            r.revoke()
            return r.proxy
        }
        let tagObj = () => genTagThrower()

        //expectThrows, 建構同步拋錯(非reject), 固定詞彙, 先於任何MongoClient之建立
        let expectThrows = (makeOpt, msg) => {
            let threw = null
            let { count } = withSpyClient(() => {
                try {
                    return WOrm(makeOpt())
                }
                catch (err) {
                    threw = err
                    return null
                }
            })
            assert.ok(threw instanceof Error, 'must throw synchronously')
            assert.strictEqual(msgOf(threw), msg)
            assert.strictEqual(msgOf(threw).indexOf(TRAP), -1)
            assert.strictEqual(count.n, 0)
        }

        for (let [nm, mk] of [['revoked Proxy', revokedObj], ['all traps throw', boomObj], ['get trap throws', () => new Proxy({}, { get: boom })]]) {
            it(`opt container ${nm}`, function() {
                expectThrows(mk, 'invalid opt: must be a readable value')
            })
        }

        for (let key of ['url', 'db', 'cl', 'autoGenPk']) {
            it(`opt.${key} getter throws (the opt container itself is readable)`, function() {
                expectThrows(() => {
                    let o = genOpt('rdctor')
                    Object.defineProperty(o, key, { get: boom, enumerable: true, configurable: true })
                    return o
                }, `invalid opt.${key}: must be a readable value`)
            })
        }

        for (let [nm, mk] of [['revoked Proxy', revokedObj], ['Symbol.toStringTag getter throws', tagObj], ['all traps throw', boomObj]]) {
            it(`opt.autoGenPk ${nm}`, function() {
                expectThrows(() => genOpt('rdctor', { autoGenPk: mk() }), 'invalid opt.autoGenPk: must be a readable value')
            })
            for (let key of ['url', 'db', 'cl']) {
                it(`opt.${key} ${nm}`, function() {
                    expectThrows(() => ({ ...genOpt('rdctor'), [key]: mk() }), `invalid opt.${key}: must be a readable value`)
                })
            }
        }

        //可讀而型別不符: opt.autoGenPk非布林值取預設true(K3); opt.url、opt.db、opt.cl非字串維持既有(建構不拋錯, 不檢核)
        for (let [nm, mk] of [['number 5', () => 5], ['string false', () => 'false'], ['String wrapper', () => new String('false')], ['Boolean wrapper false', () => new Boolean(false)], ['empty object', () => ({})], ['null', () => null], ['ownKeys trap throws (only keys unreadable)', () => new Proxy({}, { ownKeys: boom })]]) { // eslint-disable-line no-new-wrappers
            it(`opt.autoGenPk ${nm} takes the default (true): a missing id is generated`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl, { autoGenPk: mk() }))
                let r = await wo.insert([{ name: 'noid' }])
                assert.strictEqual(r.ok, 1)
                let ids = await rawIds(cl)
                assert.strictEqual(ids.length, 1)
                assert.ok(reUuid.test(ids[0]), ids[0])
                await dropCl(cl)
            })
        }
        for (let key of ['url', 'db', 'cl']) {
            for (let [nm, mk] of [['number 5', () => 5], ['ownKeys trap throws (only keys unreadable)', () => new Proxy({}, { ownKeys: boom })]]) {
                it(`opt.${key} ${nm} does not throw at construction (non-strings are not checked, unchanged)`, function() {
                    assert.doesNotThrow(() => WOrm({ ...genOpt('rdctor'), [key]: mk() }))
                })
            }
        }

        //可讀而型別不符之opt容器: 原生錯誤維持(不被改寫為固定詞彙)
        for (let [nm, v] of [['null', null], ['number 5', 5], ['empty string', '']]) {
            it(`opt container ${nm} is readable: the native TypeError is unchanged (not rewritten to the unreadable message)`, function() {
                let threw = null
                try {
                    WOrm(v)
                }
                catch (err) {
                    threw = err
                }
                assert.ok(threw instanceof TypeError, String(threw))
                assert.notStrictEqual(msgOf(threw), 'invalid opt: must be a readable value')
            })
        }

        it('opt container whose tag throws but whose keys are readable constructs and works (only opt.url/db/cl/autoGenPk/logDetail/funLog are read)', async function() {
            let cl = genCl()
            let o = genOpt(cl)
            Object.defineProperty(o, Symbol.toStringTag, { get: boom, configurable: true })
            let wo = WOrm(o)
            let r = await wo.insert([{ id: 'a', name: 'n' }])
            assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
            await dropCl(cl)
        })

        it('opt.logDetail getter throws still constructs (diagnostic options are owned by wsemi getDiag, unchanged)', function() {
            let o = genOpt('rdctor')
            Object.defineProperty(o, 'logDetail', { get: boom, enumerable: true, configurable: true })
            assert.doesNotThrow(() => WOrm(o))
        })

    })


    //S4: insertGfs之u8a
    describe('S4 insertGfs u8a', function() {

        let u8aHostile = [
            {
                name: 'revoked Proxy',
                make: () => {
                    let r = Proxy.revocable({}, {})
                    r.revoke()
                    return r.proxy
                },
            },
            { name: 'Symbol.toStringTag getter throws', make: () => genTagThrower() },
            { name: 'all traps throw', make: () => new Proxy({}, new Proxy({}, { get: () => boom })) },
        ]
        let u8aReadable = [
            { name: 'undefined', make: () => undefined },
            { name: 'null', make: () => null },
            { name: 'number 5', make: () => 5 },
            { name: 'string', make: () => 'abc' },
            { name: 'plain array', make: () => [1, 2, 3] },
            { name: 'ArrayBuffer', make: () => new ArrayBuffer(3) },
            { name: 'ownKeys trap throws (only keys unreadable)', make: () => new Proxy({}, { ownKeys: boom }) },
        ]

        for (let c of u8aHostile) {
            for (let k of [0, 1]) {
                it(`${c.name} at data[${k}]`, async function() {
                    let cl = genCl()
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let evs = collect(wo)
                    let data = [{ id: 'a', u8a: u8a() }, { id: 'b', u8a: u8a() }]
                    data[k].u8a = c.make()
                    let msg = `invalid data[${k}].u8a: must be a readable value`
                    await assert.rejects(() => wo.insertGfs(data), (err) => msgOf(err) === msg)
                    assert.strictEqual(count.n, 0)
                    assert.strictEqual(nType(evs, 'error', 'insertGfs'), 1)
                    assert.strictEqual(evs[0].err, msg)
                    assert.strictEqual(evs[0].data, null) //A4: u8a不可讀屬入口階段之拒絕, 數據參數null(可讀而非Uint8Array者之數據參數不變, 見A4對照)
                    assert.deepStrictEqual(await rawGfsIds(cl), []) //同批有效筆亦不寫入
                    await dropCl(cl)
                })
            }
        }

        for (let c of u8aReadable) {
            it(`${c.name}: readable but not a Uint8Array keeps the existing message`, async function() {
                let cl = genCl()
                let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                await assert.rejects(() => wo.insertGfs([{ id: 'a', u8a: c.make() }]), (err) => msgOf(err) === 'invalid data[0].u8a')
                assert.strictEqual(count.n, 0)
                assert.deepStrictEqual(await rawGfsIds(cl), [])
                await dropCl(cl)
            })
        }

        it('a valid Uint8Array is stored (control)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let r = await wo.insertGfs([{ id: 'a', u8a: u8a() }])
            assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
            assert.deepStrictEqual(await rawGfsIds(cl), ['a'])
            await dropCl(cl)
        })

    })


    //S5: 有效輸入不多讀(探針只於判斷函數回false之後)
    describe('S5 valid inputs are not read by the probe', function() {

        //counter, 於Proxy之陷阱計數
        let genCounter = () => {
            let cnt = { ownKeys: 0, gopd: [], get: [] }
            let handler = {
                ownKeys(t) {
                    cnt.ownKeys++
                    return Reflect.ownKeys(t)
                },
                getOwnPropertyDescriptor(t, k) {
                    cnt.gopd.push(typeof k === 'symbol' ? k.toString() : k)
                    return Reflect.getOwnPropertyDescriptor(t, k)
                },
                get(t, k, r) {
                    cnt.get.push(typeof k === 'symbol' ? k.toString() : k)
                    return Reflect.get(t, k, r)
                },
            }
            return { cnt, handler }
        }

        //有效陣列(Proxy)之ownKeys與getOwnPropertyDescriptor陷阱: 原判斷(isearr以v.length與v[0]之[[Get]]讀取)與複製(cloneDeep)皆不觸發, 探針(chkReadable以描述子讀length與[0])若先於判斷執行即會觸發
        for (let e of ENTRIES) {
            it(`${e.api}: a valid array container is not touched by the probe (no ownKeys or getOwnPropertyDescriptor trap)`, async function() {
                let cl = genCl()
                if (e.seed) {
                    await seedCl(cl)
                }
                let wo = WOrm(genOpt(cl))
                let { cnt, handler } = genCounter()
                let item = e.kind === 'gfs' ? { id: 'a', u8a: u8a() } : { id: 'a', name: 'n' }
                if (e.api === 'del') {
                    item = { id: 'good' }
                }
                if (e.api === 'delGfs') {
                    item = { id: 'good' }
                }
                let data = new Proxy([item], handler)
                let r = await e.call(wo, data)
                assert.ok(r !== undefined)
                assert.strictEqual(cnt.ownKeys, 0, `${e.api}: ownKeys trap was fired ${cnt.ownKeys} times`)
                assert.deepStrictEqual(cnt.gopd, [], `${e.api}: getOwnPropertyDescriptor trap was fired for ${cnt.gopd.join(',')}`)
                await dropCl(cl)
            })
        }

        //insertGfs之有效u8a(Uint8Array)之標籤僅讀一次(判定結果沿用, 同修改前): 第557項A3之重構(展開 -> 不可讀掃描 -> 逐筆檢核)曾使isu8arr判定兩次(複審實測2次), 此案以計數標籤讀取之Uint8Array子類釘住
        it('insertGfs: a valid Uint8Array has its tag read exactly once (the isu8arr verdict is reused by the per-item check)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let nTag = 0
            class CountedU8a extends Uint8Array {
                get [Symbol.toStringTag]() {
                    nTag++
                    return 'Uint8Array'
                }
            }
            let r = await wo.insertGfs([{ id: 'a', u8a: new CountedU8a([1, 2, 3]) }])
            assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
            assert.strictEqual(nTag, 1, `the u8a tag was read ${nTag} times`)
            assert.deepStrictEqual(await rawGfsIds(cl), ['a'])
            await dropCl(cl)
        })

        //自有鍵只對標籤為[object Object]者讀取(iseobj所讀者): Buffer、型別陣列、String包裝物件等讀自有鍵須展開全部索引鍵, 判斷函數本即不讀;
        //以偽稱標籤為Map之Proxy計數ownKeys陷阱(Proxy之標籤取自get陷阱之Symbol.toStringTag): 須為0次
        for (let tag of ['Map', 'Uint8Array', 'String', 'Array']) {
            for (let e of ENTRIES) {
                it(`${e.api}: a container tagged [object ${tag}] that is not a data container is not enumerated by the probe`, async function() {
                    let cl = genCl()
                    if (e.seed) {
                        await seedCl(cl)
                    }
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let cnt = { ownKeys: 0 }
                    let data = new Proxy(tag === 'Array' ? [] : {}, {
                        get(t, k, r) {
                            if (k === Symbol.toStringTag) {
                                return tag === 'Array' ? undefined : tag
                            }
                            return Reflect.get(t, k, r)
                        },
                        ownKeys(t) {
                            cnt.ownKeys++
                            return Reflect.ownKeys(t)
                        },
                    })
                    let r = await e.call(wo, data)
                    assert.deepStrictEqual(r, e.noData)
                    assert.strictEqual(cnt.ownKeys, 0, `${e.api}: ownKeys trap was fired ${cnt.ownKeys} times for a [object ${tag}] container`)
                    assert.strictEqual(count.n, 0)
                    await dropCl(cl)
                })
            }
        }

        it('insert: a valid option object is read only at option.returnList', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let { cnt, handler } = genCounter()
            let r = await wo.insert([{ id: 'a', name: 'n' }], new Proxy({ returnList: false }, handler))
            assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
            assert.deepStrictEqual(cnt.get, ['returnList'])
            await dropCl(cl)
        })

        it('save: a valid option object is read only at option.autoInsert', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let { cnt, handler } = genCounter()
            let r = await wo.save([{ id: 'a', name: 'n' }], new Proxy({ autoInsert: true }, handler))
            assert.ok(Array.isArray(r) && r[0].ok === 1)
            assert.deepStrictEqual(cnt.get, ['autoInsert'])
            await dropCl(cl)
        })

        it('constructor: a valid opt object is not tag-probed (its Symbol.toStringTag is never read)', async function() {
            let cl = genCl()
            let { cnt, handler } = genCounter()
            let wo = WOrm(new Proxy(genOpt(cl), handler))
            assert.ok(typeof wo.insert === 'function')
            assert.ok(!cnt.get.includes('Symbol(Symbol.toStringTag)'), cnt.get.join(','))
            await dropCl(cl)
        })

    })


    //S6: 主鍵(pk)讀取即拋錯 reject; 可讀而非字串回null; 查詢條件(find)不變
    describe('S6 selectByPk / selectByPkGfs pk and the unchanged find entries', function() {

        //pkUnreadable, 讀取即拋錯之pk(chkReadable辨識為不可讀)
        let pkUnreadable = [
            {
                name: 'revoked Proxy',
                make: () => {
                    let r = Proxy.revocable({}, {})
                    r.revoke()
                    return r.proxy
                },
            },
            { name: 'Symbol.toStringTag getter throws', make: () => genTagThrower() },
            { name: 'all traps throw', make: () => new Proxy({}, new Proxy({}, { get: () => boom })) },
            { name: 'get trap throws', make: () => new Proxy({}, { get: boom }) },
        ]

        //pkReadable, 可讀而非有效字串之pk(維持: 無效主鍵值, 回傳null, 不連線, 無事件)
        let pkReadable = [
            ...readable.filter((v) => v.name !== 'string'),
            { name: 'ownKeys trap throws (only keys unreadable: pk is judged by its tag like any non-string)', make: () => new Proxy({}, { ownKeys: boom }) },
            { name: 'string with NUL', make: () => 'a\u0000b' },
            { name: 'string with lone surrogate', make: () => 'a\uD800b' },
        ]

        for (let api of ['selectByPk', 'selectByPkGfs']) {
            for (let c of pkUnreadable) {
                it(`${api}: pk ${c.name} is rejected with the fixed vocabulary, error event exactly once, without connecting`, async function() {
                    let cl = genCl()
                    await seedCl(cl)
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let evs = collect(wo)
                    let rej = null
                    let r = null
                    try {
                        r = await wo[api](c.make())
                    }
                    catch (err) {
                        rej = err
                    }
                    let msg = 'invalid pk: must be a readable value'
                    assert.strictEqual(rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej), msg) //S6: 不可讀之pk reject, 不回null
                    assert.ok(rej instanceof Error)
                    assert.strictEqual(msgOf(rej).indexOf(TRAP), -1) //不含原例外文字
                    assert.strictEqual(count.n, 0) //不連線
                    assert.strictEqual(nType(evs, 'error', api), 1) //error事件恰一次(操作別為該入口)
                    assert.strictEqual(evs.length, 1) //無其他事件
                    assert.strictEqual(evs[0].err, msg)
                    assert.strictEqual(evs[0].data, null) //數據參數null: 不把不可讀之值交給訂閱函數
                    await expectState(cl, true) //資料庫不變
                    await dropCl(cl)
                })
            }

            for (let c of pkReadable) {
                it(`${api}: pk ${c.name} is readable but not a valid string: returns null without connecting (unchanged)`, async function() {
                    let cl = genCl()
                    await seedCl(cl)
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let evs = collect(wo)
                    assert.strictEqual(await wo[api](c.make()), null)
                    assert.strictEqual(count.n, 0)
                    assert.strictEqual(evs.length, 0)
                    await dropCl(cl)
                })
            }

            it(`${api}: the same instance keeps working after an unreadable pk was rejected (valid pk still finds the row)`, async function() {
                let cl = genCl()
                await seedCl(cl)
                let wo = WOrm(genOpt(cl))
                await assert.rejects(() => wo[api](pkUnreadable[0].make()), (err) => msgOf(err) === 'invalid pk: must be a readable value')
                let r = await wo[api]('good')
                assert.ok(r !== null && r.id === 'good', JSON.stringify(r)) //有效主鍵(含字串)不被探針影響
                assert.strictEqual(await wo[api]('absent'), null)
                await dropCl(cl)
            })
        }

        for (let api of ['select', 'delAll', 'delAllGfs']) {
            for (let c of [...pkUnreadable, { name: 'ownKeys trap throws', make: () => new Proxy({}, { ownKeys: boom }) }]) {
                it(`${api}: find ${c.name} rejects with invalid find (R-FIND-01), once, without connecting`, async function() {
                    let cl = genCl()
                    await seedCl(cl)
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let evs = collect(wo)
                    await assert.rejects(() => wo[api](c.make()), (err) => /^invalid find: /.test(msgOf(err)) && msgOf(err).indexOf(TRAP) === -1)
                    assert.strictEqual(count.n, 0)
                    assert.strictEqual(nType(evs, 'error', api), 1)
                    await expectState(cl, true)
                    await dropCl(cl)
                })
            }
        }

    })


    //S8: 存取器(accessor)拋錯: 容器可讀而其成員為拋錯之getter(wsemi之chkReadable不呼叫存取器, 由讀取處之try捕捉)
    describe('S8 accessor throws', function() {

        //getter, 於o之key定義拋錯之存取器
        let getter = (o, key) => {
            Object.defineProperty(o, key, { get: boom, enumerable: true, configurable: true })
            return o
        }

        //trapKey, 僅讀取指定鍵時拋錯之Proxy(容器之標籤可讀, 僅該鍵不可讀; 同存取器之性質)
        let trapKey = (target, key) => new Proxy(target, {
            get(t, k, r) {
                if (k === key) {
                    throw new Error(TRAP)
                }
                return Reflect.get(t, k, r)
            }
        })

        //expectRejectedFixed, 寫入入口之整批失敗: 固定詞彙、不含存取器所拋之原例外文字、error事件恰一次(數據參數null)、不連線、不寫入
        let expectRejectedFixed = async (api, call, msg) => {
            let cl = genCl()
            let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
            let evs = collect(wo)
            let rej = null
            let r = null
            try {
                r = await call(wo)
            }
            catch (err) {
                rej = err
            }
            assert.strictEqual(rej === null ? `resolved ${JSON.stringify(r)}` : msgOf(rej), msg) //規則四第2點: 轉固定詞彙
            assert.strictEqual(msgOf(rej).indexOf(TRAP), -1)
            assert.strictEqual(count.n, 0)
            assert.strictEqual(nType(evs, 'error', api), 1)
            assert.strictEqual(evs.length, 1)
            assert.strictEqual(evs[0].err, msg)
            assert.strictEqual(evs[0].data, null)
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        }

        it('insert: option.returnList read by a Proxy get trap that throws only for that key', async function() {
            await expectRejectedFixed('insert', (wo) => wo.insert([{ id: 'a', name: 'n' }], trapKey({}, 'returnList')), 'invalid option.returnList: must be a readable value')
        })

        it('save: option.autoInsert read by a Proxy get trap that throws only for that key', async function() {
            await expectRejectedFixed('save', (wo) => wo.save([{ id: 'a', name: 'n' }], trapKey({}, 'autoInsert')), 'invalid option.autoInsert: must be a readable value')
        })

        it('insert: option.returnList accessor throws while another key of option is a readable value (the unreadable key names the failure)', async function() {
            await expectRejectedFixed('insert', (wo) => wo.insert([{ id: 'a', name: 'n' }], getter({ other: 1 }, 'returnList')), 'invalid option.returnList: must be a readable value')
        })

        for (let key of ['url', 'db', 'cl', 'autoGenPk']) {
            it(`constructor: opt.${key} read by a Proxy get trap that throws only for that key`, function() {
                let threw = null
                let { count } = withSpyClient(() => {
                    try {
                        return WOrm(trapKey(genOpt('rdctor'), key))
                    }
                    catch (err) {
                        threw = err
                        return null
                    }
                })
                assert.ok(threw instanceof Error)
                assert.strictEqual(msgOf(threw), `invalid opt.${key}: must be a readable value`)
                assert.strictEqual(msgOf(threw).indexOf(TRAP), -1)
                assert.strictEqual(count.n, 0)
            })
        }

        for (let key of ['url', 'db', 'cl', 'autoGenPk']) {
            it(`constructor: opt.${key} accessor message does not carry the accessor's own exception text`, function() {
                let o = getter(genOpt('rdctor'), key)
                assert.throws(() => WOrm(o), (err) => err.message === `invalid opt.${key}: must be a readable value` && err.message.indexOf(TRAP) === -1)
            })
        }

        for (let e of ENTRIES) {
            it(`${e.api}: data=[x] whose only element is an accessor that throws is the unreadable container (fixed vocabulary)`, async function() {
                let a = [{ id: 'a', u8a: u8a() }]
                getter(a, '0')
                await expectRejectedFixed(e.api, (wo) => e.call(wo, a), 'invalid data: must be a readable value')
            })
        }

        //A3(第557項全族對齊輪, 2026-11-20 oro557d4; 主控規則四第3點更正): 資料內部之巢狀不可讀值(複製階段)與頂層不可讀走同一通道:
        //固定詞彙invalid data: must be a readable value(不含存取器所拋之原例外文字), error事件恰一次且數據參數null, 不連線, 不寫入不刪除(原: 維持複製階段拋出之原訊息, 多數入口不發error事件)
        describe('nested values at the copy stage are rejected like an unreadable container (A3: fixed vocabulary, error once with null data)', function() {

            let nested = [
                { api: 'insert', name: 'field accessor', make: () => [getter({ id: 'a' }, 'name')] },
                { api: 'insertBulk', name: 'field accessor', make: () => [getter({ id: 'a' }, 'name')] },
                { api: 'save', name: 'field accessor', make: () => [getter({ id: 'a' }, 'name')] },
                { api: 'insert', name: 'id accessor', make: () => [getter({}, 'id')] },
                { api: 'insertBulk', name: 'id accessor', make: () => [getter({}, 'id')] },
                { api: 'save', name: 'id accessor', make: () => [getter({}, 'id')] },
                { api: 'del', name: 'id accessor', make: () => [getter({}, 'id')], seed: true },
                { api: 'insertGfs', name: 'id accessor', make: () => [getter({ u8a: u8a() }, 'id')] },
                { api: 'delGfs', name: 'id accessor', make: () => [getter({}, 'id')], seed: true },
                { api: 'insertGfs', name: 'u8a accessor', make: () => [getter({ id: 'a' }, 'u8a')] },
                { api: 'insert', name: 'second element accessor (isearr reads only [0] of a longer array)', make: () => getter([{ id: 'a', name: 'n' }, { id: 'b', name: 'n' }], '1') },
                { api: 'del', name: 'second element accessor (isearr reads only [0] of a longer array)', make: () => getter([{ id: 'good' }, { id: 'x' }], '1'), seed: true },
            ]

            for (let c of nested) {
                it(`${c.api}: ${c.name} is rejected (fixed vocabulary, not the thrown text), error event once with null data, nothing written or deleted`, async function() {
                    let cl = genCl()
                    if (c.seed) {
                        await seedCl(cl)
                    }
                    let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
                    let evs = collect(wo)
                    let rej = null
                    try {
                        await wo[c.api](c.make())
                    }
                    catch (err) {
                        rej = err
                    }
                    assert.ok(rej instanceof Error, 'must reject')
                    assert.strictEqual(msgOf(rej), 'invalid data: must be a readable value') //A3: 複製處拋錯者轉固定詞彙
                    assert.strictEqual(msgOf(rej).indexOf(TRAP), -1) //不轉出存取器所拋之原例外文字
                    assert.strictEqual(count.n, 0)
                    assert.strictEqual(nType(evs, 'error', c.api), 1) //error事件恰一次
                    assert.strictEqual(evs.length, 1)
                    assert.strictEqual(evs[0].err, 'invalid data: must be a readable value')
                    assert.strictEqual(evs[0].data, null) //A4: 數據參數null
                    await expectState(cl, c.seed === true)
                    await dropCl(cl)
                })
            }

        })

    })


    //S9: 第557項全族對齊輪(2026-11-20 oro557d4)A1~A6逐代號釘住; 對應條款align-rules.md
    //  A1選項容器本身不可讀 -> S3(insert/save之option 3種、建構opt 3種; 另S3 expectRejected釘error事件數據參數null)
    //  A2存取器拋錯 -> S3(鍵存取器)、S8(Proxy單鍵陷阱、[0]存取器)、本節A2(拋出值之6種型別: Error、字串、null、undefined、數字、物件)
    //  A3複製階段之巢狀不可讀值 -> S8 nested、api-pk-given 〈given unreadable id〉、本節A3(入口 x 位置 x 種類)
    //  A4入口階段拒絕之error事件數據參數null -> S1、S3、S4、S6、S8與本節(含其後之拒絕之數據參數不變之對照)
    //  A5 selectByPk/selectByPkGfs之不可讀pk -> S6; A6主鍵給了而無效 -> api-pk-given(insert/insertBulk/insertGfs整批reject、save/del/delGfs逐筆ok為0)
    describe('S9 family alignment A1-A6', function() {

        let FIXED = 'invalid data: must be a readable value'
        let revokedP = () => {
            let r = Proxy.revocable({ x: 1 }, {})
            r.revoke()
            return r.proxy
        }
        let tagThrow = () => genTagThrower({ z: 1 })
        let ownKeysThrow = () => new Proxy({ z: 1 }, { ownKeys: boom })
        let getTrapAll = () => new Proxy({}, { get: boom })
        let valueKinds = [['revoked Proxy', revokedP], ['Symbol.toStringTag throws', tagThrow], ['ownKeys trap throws', ownKeysThrow], ['get trap throws', getTrapAll]]

        //thrown, 存取器拋出之值之各型別(其文字一律不得轉出)
        let thrown = [
            ['Error', () => new Error(TRAP)],
            ['string', () => TRAP],
            ['null', () => null],
            ['undefined', () => undefined],
            ['number', () => 42],
            ['object with message', () => ({ message: TRAP })],
        ]

        //accessor, 於o之key定義拋錯之存取器(拋出tv()之值)
        let accessor = (o, key, tv) => {
            Object.defineProperty(o, key, {
                get() {
                    throw tv()
                },
                enumerable: true,
                configurable: true,
            })
            return o
        }

        //row, 各入口之有效單筆
        let rowOf = (e, id = 'a0') => (e.kind === 'gfs' ? { id, u8a: u8a() } : { id, name: 'n' })

        //expectRejected, 驗證入口階段之拒絕: 固定詞彙、不含拋出之文字、error事件恰一次且數據參數null、無change、不連線、種子與資料庫不變
        let expectRejected = async (e, make, msg) => {
            let cl = genCl()
            await seedCl(cl)
            let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
            let evs = collect(wo)
            let rej = null
            let r = null
            try {
                r = await e.call(wo, make())
            }
            catch (err) {
                rej = err
            }
            assert.ok(rej instanceof Error, `must reject, resolved ${JSON.stringify(r)}`)
            assert.strictEqual(msgOf(rej), msg)
            assert.strictEqual(msgOf(rej).indexOf(TRAP), -1)
            assert.strictEqual(count.n, 0)
            assert.strictEqual(nType(evs, 'error', e.api), 1)
            assert.strictEqual(evs.length, 1)
            assert.strictEqual(evs[0].err, msg)
            assert.strictEqual(evs[0].data, null)
            await expectState(cl, true)
            await dropCl(cl)
        }

        //A2: 存取器拋出之值型別不影響結果(不轉出其文字)
        describe('A2 accessor throws (every thrown value type)', function() {

            for (let key of ['url', 'db', 'cl', 'autoGenPk']) {
                for (let [tn, tv] of thrown) {
                    it(`constructor: opt.${key} accessor throws ${tn}`, function() {
                        let o = accessor(genOpt('rdctor'), key, tv)
                        assert.throws(() => WOrm(o), (err) => err instanceof Error && err.message === `invalid opt.${key}: must be a readable value`)
                    })
                }
            }

            for (let key of ['logDetail', 'funLog']) {
                it(`constructor: opt.${key} accessor throws is not rejected (diagnostic options are owned by wsemi getDiag; exception of the family caliber)`, function() {
                    let o = accessor(genOpt('rdctor'), key, thrown[0][1])
                    assert.doesNotThrow(() => WOrm(o))
                })
            }

            for (let [tn, tv] of thrown) {
                it(`insert: option.returnList accessor throws ${tn}`, async function() {
                    await expectRejected({ api: 'insert', kind: 'doc', call: (wo, x) => wo.insert([{ id: 'a0', name: 'n' }], x) }, () => accessor({}, 'returnList', tv), 'invalid option.returnList: must be a readable value')
                })
                it(`save: option.autoInsert accessor throws ${tn}`, async function() {
                    await expectRejected({ api: 'save', kind: 'doc', call: (wo, x) => wo.save([{ id: 'a0', name: 'n' }], x) }, () => accessor({}, 'autoInsert', tv), 'invalid option.autoInsert: must be a readable value')
                })
                for (let e of ENTRIES) {
                    it(`${e.api}: data=[x] whose [0] accessor throws ${tn}`, async function() {
                        await expectRejected(e, () => accessor([rowOf(e)], '0', tv), FIXED)
                    })
                }
            }

        })

        //A3: 複製階段之巢狀不可讀值與頂層不可讀同一通道(固定詞彙、error恰一次且數據參數null、不連線、種子與資料庫不變)
        describe('A3 nested unreadable values at the copy stage', function() {

            //insert、insertBulk、save、del: 深拷貝, 任何位置之不可讀值(含可讀而無法複製者)皆拒絕
            for (let e of ENTRIES.filter((v) => v.kind === 'doc')) {
                for (let [vn, vmk] of valueKinds) {
                    it(`${e.api}: id = ${vn}`, async function() {
                        await expectRejected(e, () => ({ ...rowOf(e), id: vmk() }), FIXED)
                    })
                    it(`${e.api}: field = ${vn}`, async function() {
                        await expectRejected(e, () => ({ ...rowOf(e), f: vmk() }), FIXED)
                    })
                    it(`${e.api}: array element nested in a field = ${vn}`, async function() {
                        await expectRejected(e, () => ({ ...rowOf(e), f: { g: [vmk()] } }), FIXED)
                    })
                    it(`${e.api}: second element of the array = ${vn}`, async function() {
                        await expectRejected(e, () => [rowOf(e), vmk()], FIXED)
                    })
                    it(`${e.api}: first element of a two-element array = ${vn}`, async function() {
                        await expectRejected(e, () => [vmk(), rowOf(e, 'a1')], FIXED)
                    })
                }
                for (let [tn, tv] of thrown) {
                    it(`${e.api}: id accessor throws ${tn}`, async function() {
                        await expectRejected(e, () => accessor({ name: 'n' }, 'id', tv), FIXED)
                    })
                    it(`${e.api}: field accessor throws ${tn}`, async function() {
                        await expectRejected(e, () => accessor(rowOf(e), 'f', tv), FIXED)
                    })
                    it(`${e.api}: u8a field accessor throws ${tn}`, async function() {
                        await expectRejected(e, () => accessor(rowOf(e), 'u8a', tv), FIXED)
                    })
                    it(`${e.api}: array element nested in a field accessor throws ${tn}`, async function() {
                        await expectRejected(e, () => ({ ...rowOf(e), f: { g: accessor([1], '0', tv) } }), FIXED)
                    })
                    it(`${e.api}: second element accessor throws ${tn}`, async function() {
                        await expectRejected(e, () => accessor([rowOf(e), rowOf(e, 'a1')], '1', tv), FIXED)
                    })
                }
                it(`${e.api}: a readable value that cannot be copied (Date with a null prototype) is rejected the same way (the copy stage does not tell causes apart)`, async function() {
                    await expectRejected(e, () => ({ ...rowOf(e), f: Object.setPrototypeOf(new Date(0), null) }), FIXED)
                })
                it(`${e.api}: a 50000-level nesting that cannot be copied is rejected the same way`, async function() {
                    await expectRejected(e, () => {
                        let o = {}
                        let c = o
                        for (let i = 0; i < 50000; i++) {
                            c.a = {}
                            c = c.a
                        }
                        return { ...rowOf(e), f: o }
                    }, FIXED)
                })
            }

            //insertGfs: 不深拷貝, 複製處為陣列元素之讀取與展開, 僅寫id與u8a: id之值不可讀(非自有存取器)於id給了而非字串之分支內探針
            let gfsIns = ENTRIES.find((v) => v.api === 'insertGfs')
            for (let [vn, vmk] of valueKinds) {
                it(`insertGfs: id = ${vn} (was invalid id: not a string)`, async function() {
                    await expectRejected(gfsIns, () => ({ ...rowOf(gfsIns), id: vmk() }), FIXED)
                })
            }
            for (let [tn, tv] of thrown) {
                it(`insertGfs: id accessor throws ${tn}`, async function() {
                    await expectRejected(gfsIns, () => accessor({ u8a: u8a() }, 'id', tv), FIXED)
                })
                it(`insertGfs: u8a accessor throws ${tn}`, async function() {
                    await expectRejected(gfsIns, () => accessor({ id: 'a0' }, 'u8a', tv), FIXED)
                })
                it(`insertGfs: another field accessor throws ${tn} (the spread runs the getter)`, async function() {
                    await expectRejected(gfsIns, () => accessor(rowOf(gfsIns), 'f', tv), FIXED)
                })
                it(`insertGfs: second element accessor throws ${tn}`, async function() {
                    await expectRejected(gfsIns, () => accessor([rowOf(gfsIns), rowOf(gfsIns, 'a1')], '1', tv), FIXED)
                })
            }
            for (let [vn, vmk] of [['revoked Proxy', revokedP], ['ownKeys trap throws (the spread reads the keys)', ownKeysThrow]]) {
                it(`insertGfs: second element = ${vn}`, async function() {
                    await expectRejected(gfsIns, () => [rowOf(gfsIns), vmk()], FIXED)
                })
                it(`insertGfs: first element of two = ${vn}`, async function() {
                    await expectRejected(gfsIns, () => [vmk(), rowOf(gfsIns, 'a1')], FIXED)
                })
            }

            //delGfs: 不複製, 複製處為陣列元素與其id之讀取, 僅讀id
            let gfsDel = ENTRIES.find((v) => v.api === 'delGfs')
            for (let [vn, vmk] of valueKinds) {
                it(`delGfs: id = ${vn} (was ok 0 with invalid id: not a string)`, async function() {
                    await expectRejected(gfsDel, () => ({ id: vmk() }), FIXED)
                })
            }
            for (let [tn, tv] of thrown) {
                it(`delGfs: id accessor throws ${tn}`, async function() {
                    await expectRejected(gfsDel, () => accessor({}, 'id', tv), FIXED)
                })
                it(`delGfs: second element accessor throws ${tn}`, async function() {
                    await expectRejected(gfsDel, () => accessor([{ id: 'good' }, { id: 'x' }], '1', tv), FIXED)
                })
                it(`delGfs: first element accessor throws ${tn}`, async function() {
                    await expectRejected(gfsDel, () => accessor([{ id: 'good' }, { id: 'x' }], '0', tv), FIXED)
                })
            }
            for (let [vn, vmk] of [['revoked Proxy', revokedP], ['get trap throws (reading id throws)', getTrapAll]]) {
                it(`delGfs: second element = ${vn}`, async function() {
                    await expectRejected(gfsDel, () => [{ id: 'good' }, vmk()], FIXED)
                })
                it(`delGfs: first element of two = ${vn}`, async function() {
                    await expectRejected(gfsDel, () => [vmk(), { id: 'good' }], FIXED)
                })
            }

            //對照(範圍): GFS入口只讀實際用到之欄位, 其餘欄位(含不可讀者)不讀取而維持成功
            for (let [vn, vmk] of valueKinds) {
                it(`insertGfs: an unused field = ${vn} is not read (control: stored)`, async function() {
                    let cl = genCl()
                    let wo = WOrm(genOpt(cl))
                    let r = await wo.insertGfs([{ ...rowOf(gfsIns), f: vmk() }])
                    assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
                    assert.deepStrictEqual(await rawGfsIds(cl), ['a0'])
                    await dropCl(cl)
                })
                it(`delGfs: an unused field = ${vn} is not read (control: deleted)`, async function() {
                    let cl = genCl()
                    await seedCl(cl)
                    let wo = WOrm(genOpt(cl))
                    let r = await wo.delGfs([{ id: 'good', f: vmk() }])
                    assert.deepStrictEqual(r.map((v) => [v.ok, v.nDeleted]), [[1, 1]])
                    assert.deepStrictEqual(await rawGfsIds(cl), [])
                    await dropCl(cl)
                })
            }
            for (let [tn, tv] of thrown) {
                it(`delGfs: an unused field accessor throws ${tn} is not read (control: deleted)`, async function() {
                    let cl = genCl()
                    await seedCl(cl)
                    let wo = WOrm(genOpt(cl))
                    let r = await wo.delGfs([accessor({ id: 'good' }, 'f', tv)])
                    assert.deepStrictEqual(r.map((v) => [v.ok, v.nDeleted]), [[1, 1]])
                    assert.deepStrictEqual(await rawGfsIds(cl), [])
                    await dropCl(cl)
                })
            }

            //對照(範圍): 範圍只到複製處為止; 複製之後才讀取之原型上之存取器所拋者仍為外來錯誤(原例外), 不在A3(帳本已知限制, 經outErr遮除憑證)
            for (let e of ENTRIES.filter((v) => v.kind === 'doc')) {
                it(`${e.api}: an id accessor on the prototype (read after the copy) keeps the foreign exception, out of A3`, async function() {
                    let cl = genCl()
                    await seedCl(cl)
                    let wo = WOrm(genOpt(cl))
                    let evs = collect(wo)
                    let proto = {
                        get id() {
                            throw new Error(TRAP)
                        },
                    }
                    let x = Object.create(proto, { name: { value: 'n', enumerable: true } })
                    let rej = null
                    try {
                        await e.call(wo, x)
                    }
                    catch (err) {
                        rej = err
                    }
                    assert.ok(rej instanceof Error)
                    assert.strictEqual(msgOf(rej), TRAP)
                    assert.strictEqual(nType(evs, 'error', e.api), 1)
                    await expectState(cl, true)
                    await dropCl(cl)
                })
            }

            it('the same instance keeps working after a nested unreadable value was rejected (no state left behind)', async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                await assert.rejects(() => wo.insert([{ id: 'a0', name: 'n' }, revokedP()]), (err) => msgOf(err) === FIXED)
                assert.deepStrictEqual(await wo.insert([{ id: 'a0', name: 'n' }]), { n: 1, nInserted: 1, ok: 1 })
                assert.deepStrictEqual(await rawIds(cl), ['a0'])
                await dropCl(cl)
            })

        })

        //A4: 入口階段(選項與資料之讀取、判定、複製)之不可讀拒絕之數據參數為null(見A1~A3、S1、S6); 入口階段之後之整批拒絕與逐筆失敗之數據參數不變
        describe('A4 error event data: null only for the unreadable rejections of the entry stage', function() {

            let run = async (e, x, extraOpt, seed) => {
                let cl = genCl()
                if (seed) {
                    await seedCl(cl)
                }
                let wo = WOrm(genOpt(cl, extraOpt))
                let evs = collect(wo)
                let rej = null
                let r = null
                try {
                    r = await e.call(wo, x)
                }
                catch (err) {
                    rej = err
                }
                await dropCl(cl)
                return { rej, r, evs }
            }

            for (let api of ['insert', 'insertBulk']) {
                let e = ENTRIES.find((v) => v.api === api)
                it(`${api}: invalid id (given and not a string) keeps the data of the event`, async function() {
                    let x = [{ id: 'a0', name: 'n' }, { id: 5, name: 'n' }]
                    let { rej, evs } = await run(e, x)
                    assert.strictEqual(msgOf(rej), 'invalid id: not a string at [data[1].id]')
                    assert.strictEqual(nType(evs, 'error', api), 1)
                    assert.deepStrictEqual(evs[0].data, [{ id: 'a0', name: 'n' }, { id: 5, name: 'n' }])
                })
                it(`${api}: a missing id with autoGenPk false keeps the data of the event`, async function() {
                    let { rej, evs } = await run(e, [{ name: 'n' }], { autoGenPk: false })
                    assert.strictEqual(msgOf(rej), 'invalid data[0].id, autoGenPk is false')
                    assert.deepStrictEqual(evs[0].data, [{ name: 'n' }])
                })
                it(`${api}: a lone surrogate in a field keeps the data of the event`, async function() {
                    let { rej, evs } = await run(e, [{ id: 'a0', f: '\ud800' }])
                    assert.strictEqual(msgOf(rej), 'invalid data: string contains lone surrogate at [data[0].f]')
                    assert.deepStrictEqual(evs[0].data, [{ id: 'a0', f: '\ud800' }])
                })
            }

            let gfsIns = ENTRIES.find((v) => v.api === 'insertGfs')
            it('insertGfs: invalid id (given and not a string) keeps the data of the event', async function() {
                let { rej, evs } = await run(gfsIns, [{ id: 'a0', u8a: u8a() }, { id: 5, u8a: u8a() }])
                assert.strictEqual(msgOf(rej), 'invalid id: not a string at [data[1].id]')
                assert.strictEqual(nType(evs, 'error', 'insertGfs'), 1)
                assert.deepStrictEqual(evs[0].data, [{ id: 'a0', u8a: u8a() }, { id: 5, u8a: u8a() }])
            })
            it('insertGfs: a readable value that is not a Uint8Array (invalid data[k].u8a) keeps the data of the event', async function() {
                let { rej, evs } = await run(gfsIns, [{ id: 'a0', u8a: 5 }])
                assert.strictEqual(msgOf(rej), 'invalid data[0].u8a')
                assert.deepStrictEqual(evs[0].data, [{ id: 'a0', u8a: 5 }])
            })
            it('insertGfs: an unreadable u8a value is an entry-stage rejection: data is null (the readable counterpart above keeps it)', async function() {
                let { rej, evs } = await run(gfsIns, [{ id: 'a0', u8a: revokedP() }])
                assert.strictEqual(msgOf(rej), 'invalid data[0].u8a: must be a readable value')
                assert.strictEqual(evs[0].data, null)
            })
            it('insertGfs: a missing id with autoGenPk false keeps the data of the event', async function() {
                let { rej, evs } = await run(gfsIns, [{ u8a: u8a() }], { autoGenPk: false })
                assert.strictEqual(msgOf(rej), 'invalid data[0].id, autoGenPk is false')
                assert.deepStrictEqual(evs[0].data, [{ u8a: u8a() }])
            })

            for (let api of ['save', 'del', 'delGfs']) {
                let e = ENTRIES.find((v) => v.api === api)
                it(`${api}: a failing item (id 5) keeps the per-item data of the event (the unreadable rejections of the entry stage are the only ones with null)`, async function() {
                    let { rej, r, evs } = await run(e, [{ id: 'a0', name: 'n' }, { id: 5, name: 'n' }], undefined, true)
                    assert.strictEqual(rej, null)
                    assert.strictEqual(r[1].ok, 0)
                    assert.strictEqual(r[1].err, 'invalid id: not a string at [data[1].id]')
                    assert.strictEqual(nType(evs, 'error', api), 1)
                    let evErr = evs.filter((v) => v.type === 'error') //save之已寫入筆另發change事件(insert), 故取error事件
                    assert.deepStrictEqual(evErr[0].data, [{ id: 5, name: 'n' }])
                })
            }

        })

    })


    //S7: 原始碼掃描(站點盤點; 與rulebook R-READABLE-01之站點表一致)
    describe('S7 source scan', function() {

        let src = fs.readFileSync('./src/WOrmMongodb.mjs', 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ''))
        let code = src.join('\n')

        //bodyOf, 取函數本體(自 function 名稱起至下一個同縮排之函數宣告前)
        let bodyOf = (name) => {
            let i = code.indexOf(`async function ${name}(`)
            assert.ok(i >= 0, name)
            let j = code.indexOf('\n    async function ', i + 10)
            let j2 = code.indexOf('\n    function ', i + 10)
            let ends = [j, j2, code.length].filter((v) => v > i)
            return code.slice(i, Math.min(...ends))
        }

        //blockOf, 取自startIdx起第一個 { 之配對區塊
        let blockOf = (text, startIdx) => {
            let i = text.indexOf('{', startIdx)
            let depth = 0
            for (let k = i; k < text.length; k++) {
                if (text[k] === '{') {
                    depth++
                }
                else if (text[k] === '}') {
                    depth--
                    if (depth === 0) {
                        return text.slice(i, k + 1)
                    }
                }
            }
            throw new Error('unbalanced')
        }

        it('chkReadable is imported from wsemi (no local probe)', function() {
            assert.ok(/import chkReadable from 'wsemi\/src\/chkReadable\.mjs'/.test(code))
            assert.ok(!/probeReadable|function chkReadable/.test(code))
        })

        for (let e of ENTRIES) {
            it(`${e.api}: isUnreadable(data) is called only inside the branch where iseobj/isearr returned false, before any copy or connection`, function() {
                let body = bodyOf(e.api)
                let m = body.indexOf('if (!iseobj(data) && !isearr(data))')
                assert.ok(m >= 0, 'judge branch')
                let blk = blockOf(body, m)
                assert.strictEqual((body.match(/isUnreadable\(data\)/g) || []).length, 1)
                assert.ok(blk.indexOf('isUnreadable(data)') >= 0, 'probe must sit inside the false branch')
                assert.ok(/rejectUnreadable\('/.test(blk))
            })
        }

        it('isUnreadable probes the own keys (only for [object Object], where iseobj reads them) and the first element (the superset of iseobj / isearr reads)', function() {
            let i = code.indexOf('function isUnreadable(')
            assert.ok(i >= 0)
            let blk = blockOf(code, i)
            assert.ok(/chkReadable\(data, \{ ownKeys: isobj\(data\), elements: 'first' \}\)/.test(blk))
            //存取器不由chkReadable呼叫: 陣列[0]由呼叫端自讀(同isearr之讀取)
            assert.ok(/Reflect\.get\(data, '0'\)/.test(blk))
        })

        for (let api of ['selectByPk', 'selectByPkGfs']) {
            it(`${api}: the pk probe sits only inside the branch where isestr(pk) returned false, before any connection (a valid string is never probed)`, function() {
                let body = bodyOf(api)
                assert.strictEqual((body.match(/chkReadable\(pk\)/g) || []).length, 1)
                let m = body.indexOf('if (!isestr(pk))')
                assert.ok(m >= 0, 'judge branch')
                let blk = blockOf(body, m)
                assert.ok(blk.indexOf('chkReadable(pk)') >= 0, 'probe must sit inside the false branch')
                assert.ok(blk.indexOf(`rejectUnreadable('${api}', 'pk')`) >= 0)
                assert.ok(blk.indexOf('return null') >= 0, 'readable non-string keeps returning null')
                assert.ok(body.indexOf('genClient(') > m + blk.length, 'the probe is decided before the client is created')
            })
        }

        it('chkReadable call inventory (11): isUnreadable 1, insert 2 (option container / returnList), save 2 (option container / autoInsert), insertGfs 1 (u8a), selectByPk 1 and selectByPkGfs 1 (pk), constructor 3 (readKey / autoGenPk / url-db-cl loop)', function() {
            let n = (code.match(/chkReadable\(/g) || []).length
            assert.strictEqual(n, 11, `chkReadable( 應為11處, 實為${n}`)
        })

        it('the fixed vocabulary is built in one place per channel: mkReadErr (operations, incl. the insertGfs u8a name and the copy stage) and throwUnreadable (constructor)', function() {
            assert.strictEqual((code.match(/must be a readable value/g) || []).length, 2, 'mkReadErr、throwUnreadable各1處(第557項A3起insertGfs之u8a亦經mkReadErr)')
        })

    })


})

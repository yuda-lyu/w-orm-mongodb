import assert from 'assert'
import net from 'net'
import mongodb from 'mongodb'
import { execFile } from 'child_process'
import { promisify } from 'util'
import WOrm from '../src/WOrmMongodb.mjs'
import cvOrmStrCases from 'wsemi/src/_cvOrmStrCases.mjs'
import { delay, genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


//字串良構檢核(孤立代理字元、NUL)之接線測試, 規則見CLAUDE_rulebook.md R-ORMSTR-01
//契約案例表(wsemi/src/_cvOrmStrCases.mjs)逐案對公開API執行, 每案使用全新資料表; 種子、快照與驗證一律由驅動直接讀寫, 不經受測套件(GridFS之預存與比對除外)
//另含本套件專屬案: opt.url無效之8函數error事件、整批不合格不建立MongoClient、檢查之值即使用之值、去回顯、BSON型別值、既有資料檢出與清除、容器volume回收


let execFileAsync = promisify(execFile)


let ctName = process.env.WORM_WF_CT || 'worm-test-mongodb-wellformed' //環境變數僅供變異測試並行時各取不同容器名
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainer動態取得
let rawClient = null
let nCl = 0
let mountNames = []


//本套件對案例表各能力之支援: doc=資料可帶任意欄位名與巢狀結構, gfs=GridFS, 皆支援故不略過任何案例
let caps = { doc: true, gfs: true }


let mk = (id, extra) => {
    return { id, name: 'n', ...extra }
}
let mkGfs = (id, extra) => {
    return { id, u8a: new Uint8Array([1, 2, 3]), ...extra }
}


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
    return `wf${nCl}`
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

//rawIds, 以驅動取資料表全部id並升冪排序(UTF-16碼元序)
let rawIds = async (cl) => {
    let rs = await getCl(cl).find({}, { projection: { _id: 0, id: 1 } }).toArray()
    return rs.map((v) => v.id).sort()
}

//rawOne, 以驅動取單筆(去除_id), 查無回傳null
let rawOne = async (cl, id) => {
    return getCl(cl).findOne({ id }, { projection: { _id: 0 } })
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

//assertPartial, 預期之每個鍵須存在且深度相等, 其餘鍵不論
let assertPartial = (actual, part) => {
    assert.ok(actual !== null && actual !== undefined, 'actual must exist')
    for (let [k, v] of Object.entries(part)) {
        assert.ok(Object.prototype.hasOwnProperty.call(actual, k), `key must exist: ${k}`)
        assert.deepStrictEqual(actual[k], v)
    }
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

//getFreePort
let getFreePort = () => {
    return new Promise((resolve, reject) => {
        let srv = net.createServer()
        srv.on('error', reject)
        srv.listen(0, () => {
            let port = srv.address().port
            srv.close(() => {
                resolve(port)
            })
        })
    })
}


//案例表(API層), 另排除單元層str與data(由wsemi自身測試執行)
let apiCases = cvOrmStrCases.cases.filter((v) => v.group !== 'str' && v.group !== 'data')
//以autoGenPk:false再跑一輪之組別(檢核不隨autoGenPk改變, dspec〈一之三〉9.)
let groupsOff = ['id', 'single', 'val', 'order', 'gfs']


describe('wellformed', function() {


    before(async function() {
        ctPort = await startContainer(ctName)
        mountNames = await getMountNames()
        rawClient = new mongodb.MongoClient(genUrl(ctPort))
        await rawClient.connect()
    })


    after(async function() {
        if (rawClient !== null) {
            await rawClient.close().catch(() => {})
            rawClient = null
        }
        await stopContainer(ctName)
        //volume回收(第88項): 容器移除後其匿名volume須一併消失, 否則每次測試皆遺留懸置volume
        let { stdout } = await execFileAsync('docker', ['volume', 'ls', '-q'])
        let left = stdout.split(/\r?\n/).filter((v) => mountNames.includes(v))
        assert.deepStrictEqual(left, [])
    })


    //getMountNames, 取容器掛載之匿名volume名稱(映像宣告之VOLUME)
    async function getMountNames() {
        let { stdout } = await execFileAsync('docker', ['inspect', '-f', '{{range .Mounts}}{{.Name}} {{end}}', ctName])
        let r = stdout.trim().split(/\s+/).filter((v) => v !== '')
        assert.ok(r.length > 0, 'container should have anonymous volumes')
        return r
    }


    //runCase, 逐案對公開API執行(依案例表檔頭之後端套用方式)
    async function runCase(c, autoGenPk) {

        let cl = genCl()
        let opt = genOpt(cl, { autoGenPk })
        let mkx = c.need.includes('gfs') ? mkGfs : mk
        let isGfs = c.need.includes('gfs')
        let e = c.expect

        try {

            //throw, 建構設定
            if (e.kind === 'throw') {
                let args = c.args(mkx, opt)
                assert.throws(() => WOrm(...args), (err) => msgOf(err) === e.msg)
                return
            }

            //wo, 以計數替身建立, 供計算本次呼叫所建立之MongoClient數
            let { wo, count } = withSpyClient(() => WOrm(opt))
            let evs = collect(wo)

            //pre, 預存列(皆良構): 一般資料以驅動預存, GridFS以受測物件預存
            let pre = c.pre(mkx)
            if (isGfs) {
                await wo.insertGfs(pre)
            }
            else if (pre.length > 0) {
                await getCl(cl).insertMany(pre)
            }

            //args
            let args = c.args(mkx, opt)

            //before, 失敗之呼叫前後文件須全等
            let before = {}
            for (let id of (e.unchanged || [])) {
                before[id] = isGfs ? await wo.selectByPkGfs(id) : await rawOne(cl, id)
            }

            //nItems, 本次呼叫之項目數
            let nItems = Array.isArray(args[0]) ? args[0].length : 1

            //call
            evs.length = 0
            let n0 = count.n
            let r, rej
            try {
                let p = wo[c.api](...args)
                if (c.afterCall) {
                    c.afterCall(args)
                }
                r = await p
            }
            catch (err) {
                rej = err
            }
            let nClient = count.n - n0
            await delay(20)

            if (e.kind === 'free') {
                //資料值與鍵名含NUL不屬共用檢核, 後端自身限制拒收者訊息不得為共用檢核之詞彙
                let re = new RegExp(e.notMsg)
                if (rej !== undefined) {
                    assert.ok(!re.test(msgOf(rej)), `free: reject message must not be shared vocabulary: ${msgOf(rej)}`)
                }
                else if (Array.isArray(r)) {
                    for (let x of r) {
                        if (x.ok === 0) {
                            assert.ok(!re.test(x.err), `free: item err must not be shared vocabulary: ${x.err}`)
                        }
                    }
                }
            }
            else if (e.kind === 'rejectAll') {
                assert.ok(rej !== undefined, 'must reject')
                assert.strictEqual(msgOf(rej), e.msg)
                //error事件於reject當下即恰一次, change不發, 不建立MongoClient(檢核先於連線)
                assert.strictEqual(nType(evs, 'error', c.api), 1)
                assert.strictEqual(nType(evs, 'change'), 0)
                assert.strictEqual(nClient, 0)
                //事件之err為同一訊息字串, data為輸入數據陣列
                let ev = evs.find((v) => v.type === 'error')
                assert.strictEqual(ev.err, e.msg)
                assert.ok(Array.isArray(ev.data))
            }
            else {
                assert.ok(rej === undefined, `must not reject: ${rej === undefined ? '' : msgOf(rej)}`)
                if (e.kind === 'null') {
                    assert.strictEqual(r, null)
                    assert.strictEqual(evs.length, 0)
                    assert.strictEqual(nClient, 0)
                }
                if (e.kind === 'itemErr') {
                    assert.strictEqual(r.length, nItems)
                    r.forEach((x, i) => {
                        if (e.bad.includes(i)) {
                            assert.deepStrictEqual([x.ok, x.err], [0, e.msgs ? e.msgs[e.bad.indexOf(i)] : e.msg])
                        }
                        else {
                            assert.strictEqual(x.ok, 1)
                        }
                    })
                    //逐筆失敗每筆一次error事件, 整批仍發一次change
                    assert.strictEqual(nType(evs, 'error', c.api), e.bad.length)
                    assert.strictEqual(nType(evs, 'change', c.api), 1)
                    //每個error事件之err為該筆訊息(依索引序), data為僅含該筆之陣列
                    evs.filter((v) => v.type === 'error' && v.mode === c.api).forEach((ev, j) => {
                        assert.strictEqual(ev.err, e.msgs ? e.msgs[j] : e.msg)
                        assert.ok(Array.isArray(ev.data) && ev.data.length === 1)
                    })
                    //同批皆不合格時不建立MongoClient
                    if (e.bad.length === nItems) {
                        assert.strictEqual(nClient, 0)
                    }
                }
                if (e.kind === 'ok' && /^insert/.test(c.api)) {
                    assert.strictEqual(r.ok, 1)
                    assert.strictEqual(nType(evs, 'error'), 0)
                    assert.strictEqual(nType(evs, 'change', c.api), 1)
                }
            }

            //狀態
            if (e.ids) {
                assert.deepStrictEqual(await rawIds(cl), e.ids)
            }
            if (e.gfsIds) {
                assert.deepStrictEqual(await rawGfsIds(cl), e.gfsIds)
            }
            for (let id of (e.unchanged || [])) {
                let after = isGfs ? await wo.selectByPkGfs(id) : await rawOne(cl, id)
                assert.deepStrictEqual(after, before[id])
            }
            if (e.kind === 'ok' && e.result) {
                assertPartial(r, e.result)
            }
            for (let [id, part] of Object.entries(e.rows || {})) {
                assertPartial(await rawOne(cl, id), part)
            }

        }
        finally {
            await dropCl(cl)
        }

    }


    describe('contract cases: default autoGenPk', function() {
        for (let c of apiCases) {
            it(`${c.id} ${c.label}`, async function() {
                if (c.need.includes('doc') && !caps.doc) {
                    return this.skip()
                }
                if (c.need.includes('gfs') && !caps.gfs) {
                    return this.skip()
                }
                await runCase(c, undefined)
            })
        }
    })


    describe('contract cases: autoGenPk false', function() {
        for (let c of apiCases.filter((v) => groupsOff.includes(v.group))) {
            it(`${c.id} ${c.label}`, async function() {
                if (c.need.includes('doc') && !caps.doc) {
                    return this.skip()
                }
                if (c.need.includes('gfs') && !caps.gfs) {
                    return this.skip()
                }
                await runCase(c, false)
            })
        }
    })


    describe('opt.url invalid: 11 functions reject with one error event', function() {

        let urls = {
            bad_scheme: 'http://127.0.0.1:27017',
            not_url: 'not a url',
            empty_host: 'mongodb://',
        }

        //calls, 11個公開函數(皆帶合法引數, 使失敗只來自url)
        let calls = {
            select: (wo) => wo.select(),
            selectByPk: (wo) => wo.selectByPk('a1'),
            insert: (wo) => wo.insert({ id: 'a1', name: 'n' }),
            insertBulk: (wo) => wo.insertBulk({ id: 'a1', name: 'n' }),
            save: (wo) => wo.save({ id: 'a1', name: 'n' }),
            del: (wo) => wo.del({ id: 'a1' }),
            delAll: (wo) => wo.delAll(),
            selectByPkGfs: (wo) => wo.selectByPkGfs('a1'),
            insertGfs: (wo) => wo.insertGfs({ id: 'a1', u8a: new Uint8Array([1]) }),
            delGfs: (wo) => wo.delGfs({ id: 'a1' }),
            delAllGfs: (wo) => wo.delAllGfs(),
        }

        let genCase = (label, genUrlx) => {
            for (let [name, fn] of Object.entries(calls)) {
                it(`${label} ${name}`, async function() {
                    let url = await genUrlx()
                    let wo = WOrm({ url, db: ctDb, cl: genCl() })
                    let evs = collect(wo)
                    let rej
                    try {
                        await fn(wo)
                    }
                    catch (err) {
                        rej = err
                    }
                    assert.ok(rej !== undefined, 'must reject')
                    //error事件須於reject當下即已恰一次(整批性錯誤於reject之前發出), 其後不再增加, change不發
                    assert.strictEqual(nType(evs, 'error', name), 1)
                    await delay(30)
                    assert.strictEqual(nType(evs, 'error'), 1)
                    assert.strictEqual(nType(evs, 'change'), 0)
                    assert.strictEqual(evs.find((v) => v.type === 'error').err, msgOf(rej))
                })
            }
        }

        for (let [label, url] of Object.entries(urls)) {
            genCase(label, async () => url)
        }
        genCase('unreachable', async () => {
            let port = await getFreePort()
            return `mongodb://127.0.0.1:${port}/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500`
        })

        it('should still work with valid url (control)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let evs = collect(wo)
            let r = await wo.insert({ id: 'a1', name: 'n' })
            assert.deepStrictEqual(r, { n: 1, nInserted: 1, ok: 1 })
            assert.strictEqual(nType(evs, 'error'), 0)
            await dropCl(cl)
        })

    })


    describe('opt names well-formed are accepted', function() {

        it('should construct and use emoji, U+FFFD and CJK extension B names for cl and db', async function() {
            for (let cl of ['c\u{1F600}x', 'c�x', 'c\u{20BB7}x']) {
                let wo = WOrm(genOpt(cl, { db: 'worm_wf_names' }))
                await wo.insert({ id: 'a1', name: 'n' })
                assert.deepStrictEqual(await wo.select(), [{ id: 'a1', name: 'n' }])
                await rawClient.db('worm_wf_names').collection(cl).drop()
            }
            await rawClient.db('worm_wf_names').dropDatabase()
        })

        it('should use the values checked at construction even if opt is changed afterwards', async function() {
            let cl = genCl()
            let opt = genOpt(cl)
            let wo = WOrm(opt)
            let url0 = opt.url
            opt.cl = 'x\uD800'
            opt.db = 'y\uDC00'
            opt.url = 'http://invalid'
            let r = await wo.insert({ id: 'a1', name: 'n' })
            assert.strictEqual(r.nInserted, 1)
            assert.deepStrictEqual(await rawIds(cl), ['a1'])
            assert.deepStrictEqual(await wo.select(), [{ id: 'a1', name: 'n' }])
            assert.deepStrictEqual(await wo.selectByPk('a1'), { id: 'a1', name: 'n' })
            let rb = await wo.insertBulk([{ id: 'a2', name: 'n2' }])
            assert.strictEqual(rb.nInserted, 1)
            assert.deepStrictEqual(await rawIds(cl), ['a1', 'a2'])
            let rs = await wo.save([{ id: 'a2', name: 'n2x' }, { id: 'a3', name: 'n3' }])
            assert.deepStrictEqual(rs.map((v) => v.ok), [1, 1])
            assert.deepStrictEqual(await rawIds(cl), ['a1', 'a2', 'a3'])
            assert.deepStrictEqual((await wo.del({ id: 'a3' }))[0].nDeleted, 1)
            assert.strictEqual((await wo.delAll({ id: 'a2' })).nDeleted, 1)
            assert.deepStrictEqual(await rawIds(cl), ['a1'])
            //GridFS
            let rg = await wo.insertGfs([{ id: 'f1', u8a: new Uint8Array([1, 2, 3]) }, { id: 'f2', u8a: new Uint8Array([4]) }, { id: 'f3', u8a: new Uint8Array([5]) }])
            assert.strictEqual(rg.nInserted, 3)
            assert.deepStrictEqual(await rawGfsIds(cl), ['f1', 'f2', 'f3'])
            assert.deepStrictEqual(Array.from((await wo.selectByPkGfs('f1')).u8a), [1, 2, 3])
            assert.strictEqual((await wo.delGfs({ id: 'f1' }))[0].nDeleted, 1)
            assert.strictEqual((await wo.delAllGfs({ filename: 'f2' })).nDeleted, 1)
            assert.deepStrictEqual(await rawGfsIds(cl), ['f3'])
            //重複id之insertGfs須清除該次所遺留之chunks(使用建構時之cl)
            let nChunks0 = await getCl(`${cl}.chunks`).countDocuments({})
            assert.strictEqual(nChunks0, 1)
            let rdup = await wo.insertGfs({ id: 'f3', u8a: new Uint8Array([9, 9]) })
            assert.strictEqual(rdup.nInserted, 0)
            assert.strictEqual(await getCl(`${cl}.chunks`).countDocuments({}), nChunks0)
            assert.strictEqual(opt.url, 'http://invalid')
            assert.ok(url0.startsWith('mongodb://'))
            await dropCl(cl)
        })

        it('should not throw for default opt', function() {
            assert.doesNotThrow(() => WOrm({ url: genUrl(ctPort) }))
            assert.doesNotThrow(() => WOrm())
        })

    })


    describe('no MongoClient for whole-batch-invalid', function() {

        let L = 'a\uD800'

        it('should create 0 clients for del with all ids invalid and report each', async function() {
            let { wo, count } = withSpyClient(() => WOrm(genOpt(genCl())))
            let evs = collect(wo)
            let r = await wo.del([{ id: L }, { id: 'x\u0000y' }, {}])
            assert.strictEqual(count.n, 0)
            assert.deepStrictEqual(r.map((v) => v.ok), [0, 0, 0])
            assert.strictEqual(nType(evs, 'error', 'del'), 3)
        })

        it('should create 0 clients for save with all ids invalid', async function() {
            let { wo, count } = withSpyClient(() => WOrm(genOpt(genCl())))
            let r = await wo.save([{ id: L, name: 'x' }, { id: 'ok', name: 'a\uDC00' }])
            assert.strictEqual(count.n, 0)
            assert.deepStrictEqual(r.map((v) => v.ok), [0, 0])
        })

        it('should create 0 clients for delGfs with all ids invalid', async function() {
            let { wo, count } = withSpyClient(() => WOrm(genOpt(genCl())))
            let r = await wo.delGfs([{ id: L }, { id: 'x\u0000y' }])
            assert.strictEqual(count.n, 0)
            assert.deepStrictEqual(r.map((v) => v.ok), [0, 0])
        })

        it('should create clients when some items are valid (control)', async function() {
            let cl = genCl()
            let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
            let r = await wo.save([{ id: L, name: 'x' }, { id: 'ok', name: 'a' }])
            assert.ok(count.n >= 1)
            assert.deepStrictEqual(r.map((v) => v.ok), [0, 1])
            await dropCl(cl)
        })

        it('should still resolve empty array for empty input', async function() {
            let wo = WOrm(genOpt(genCl()))
            assert.deepStrictEqual(await wo.save([]), [])
            assert.deepStrictEqual(await wo.del([]), [])
            assert.deepStrictEqual(await wo.delGfs([]), [])
        })

    })


    describe('error messages do not echo values', function() {

        it('should report fixed messages for non-string, empty and exotic ids in del and delGfs without echo', async function() {
            let secret = {
                toString() {
                    return 'SECRET-ID'
                },
            }
            let ids = [undefined, null, 5, '', secret, Symbol('SYM-ID'), { a: 'SECRET2' }, [], 10n]
            for (let api of ['del', 'delGfs']) {
                let wo = WOrm(genOpt(genCl()))
                let evs = collect(wo)
                let r = await wo[api](ids.map((id) => ({ id })))
                assert.strictEqual(r.length, ids.length)
                r.forEach((x, i) => {
                    assert.strictEqual(x.ok, 0)
                    assert.strictEqual(x.n, 0)
                    assert.strictEqual(x.nDeleted, 0)
                    let want = ids[i] === '' ? 'string is empty' : 'not a string'
                    assert.strictEqual(x.err, `invalid id: ${want} at [data[${i}].id]`)
                })
                let all = JSON.stringify(evs.map((v) => v.err || ''))
                assert.ok(all.indexOf('SECRET') < 0 && all.indexOf('SYM-ID') < 0)
            }
        })

        it('should report fixed message for a String wrapper id (stored as sub-document before, rejected now)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let w = new String('wrap') // eslint-disable-line no-new-wrappers
            await assert.rejects(() => wo.insert({ id: w, name: 'n' }), (err) => msgOf(err) === 'invalid id: not a string at [data[0].id]')
            let r = await wo.save({ id: w, name: 'n' })
            assert.deepStrictEqual(r.map((v) => [v.ok, v.err]), [[0, 'invalid id: not a string at [data[0].id]']])
            assert.strictEqual(await wo.selectByPk(w), null)
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

        it('should keep the autoGenPk-false message for missing id and report the smallest index first', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl, { autoGenPk: false }))
            await assert.rejects(() => wo.insert([{ id: 'ok' }, { name: 'noid' }, { id: 'x\uD800' }]), (err) => msgOf(err) === 'invalid data[1].id, autoGenPk is false')
            await assert.rejects(() => wo.insert([{ id: 'ok' }, { id: 'x\uD800' }, { name: 'noid' }]), (err) => msgOf(err) === 'invalid id: string contains lone surrogate at [data[1].id]')
            await assert.rejects(() => wo.insertBulk([{ id: 'ok', a: 'x\uD800' }, { name: 'noid' }]), (err) => msgOf(err) === 'invalid data: string contains lone surrogate at [data[0].a]')
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

        it('should check id before u8a in insertGfs', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await assert.rejects(() => wo.insertGfs([{ id: 'a\uD800', u8a: 'bad' }]), (err) => msgOf(err) === 'invalid id: string contains lone surrogate at [data[0].id]')
            await assert.rejects(() => wo.insertGfs([{ id: 'good', u8a: 'bad' }]), (err) => msgOf(err) === 'invalid data[0].u8a')
            assert.deepStrictEqual(await rawGfsIds(cl), [])
            await dropCl(cl)
        })

    })


    describe('checked value is the used value', function() {

        //genGetter, 回傳id存取器物件, 第一次讀到v1, 其後皆為v2, stat.n記錄讀取次數
        let genGetter = (v1, v2, extra) => {
            let stat = { n: 0 }
            let o = { ...extra }
            Object.defineProperty(o, 'id', {
                get() {
                    stat.n++
                    return stat.n === 1 ? v1 : v2
                },
                enumerable: true,
                configurable: true,
            })
            return { o, stat }
        }

        for (let api of ['insert', 'insertBulk', 'save', 'del']) {
            it(`${api}: id read first as bad and later as good is rejected on the first read`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let g = genGetter('a\uD800', 'good', { name: 'n' })
                let r, rej
                try {
                    r = await wo[api]([g.o])
                }
                catch (err) {
                    rej = err
                }
                if (api === 'del' || api === 'save') {
                    assert.deepStrictEqual(r.map((v) => v.ok), [0])
                }
                else {
                    assert.strictEqual(msgOf(rej), 'invalid id: string contains lone surrogate at [data[0].id]')
                }
                assert.deepStrictEqual(await rawIds(cl), [])
                await dropCl(cl)
            })
            it(`${api}: id read first as good and later as bad uses the first read only`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                let g = genGetter('good', 'a\uD800', { name: 'n' })
                await wo[api]([g.o])
                if (api === 'del') {
                    assert.deepStrictEqual(await rawIds(cl), [])
                }
                else {
                    assert.deepStrictEqual(await rawIds(cl), ['good'])
                }
                await dropCl(cl)
            })
        }

        it('delGfs: input array emptied right after the call does not change results', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await wo.insertGfs([mkGfs('g1'), mkGfs('g2')])
            let arr = [{ id: 'g1' }, { id: 'a\uD800' }, { id: 'g2' }]
            let p = wo.delGfs(arr)
            arr.length = 0
            let r = await p
            assert.deepStrictEqual(r.map((v) => v.ok), [1, 0, 1])
            assert.deepStrictEqual(await rawGfsIds(cl), [])
            await dropCl(cl)
        })

        for (let api of ['delGfs', 'insertGfs']) {
            it(`${api}: id accessor is read once, bad first is rejected`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                await wo.insertGfs(mkGfs('good'))
                let g = genGetter('a\uD800', 'good', api === 'insertGfs' ? { u8a: new Uint8Array([9]) } : {})
                let r, rej
                try {
                    r = await wo[api]([g.o])
                }
                catch (err) {
                    rej = err
                }
                if (api === 'delGfs') {
                    assert.deepStrictEqual(r.map((v) => v.ok), [0])
                }
                else {
                    assert.strictEqual(msgOf(rej), 'invalid id: string contains lone surrogate at [data[0].id]')
                }
                assert.strictEqual(g.stat.n, 1)
                assert.deepStrictEqual(await rawGfsIds(cl), ['good'])
                await dropCl(cl)
            })
            it(`${api}: id accessor is read once, good first uses the first read only`, async function() {
                let cl = genCl()
                let wo = WOrm(genOpt(cl))
                if (api === 'delGfs') {
                    await wo.insertGfs([mkGfs('good'), mkGfs('a�')])
                }
                let g = genGetter('good', 'a\uD800', api === 'insertGfs' ? { u8a: new Uint8Array([9]) } : {})
                let r = await wo[api]([g.o])
                assert.strictEqual(g.stat.n, 1)
                if (api === 'delGfs') {
                    assert.deepStrictEqual(r.map((v) => v.ok), [1])
                    assert.deepStrictEqual(await rawGfsIds(cl), ['a�'])
                }
                else {
                    assert.strictEqual(r.nInserted, 1)
                    assert.deepStrictEqual(await rawGfsIds(cl), ['good'])
                }
                await dropCl(cl)
            })
        }

    })


    describe('well-formed values pass through unchanged', function() {

        it('should accept emoji, U+FFFD, CJK extension B and combining marks in ids and read back the same', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let ids = ['e\u{1F600}', 'f�', 'g\u{20BB7}', 'h́', 'z\u{1F468}‍\u{1F469}']
            await wo.insertBulk(ids.map((id) => ({ id, name: id })))
            for (let id of ids) {
                assert.deepStrictEqual(await wo.selectByPk(id), { id, name: id })
            }
            let r = await wo.save(ids.map((id) => ({ id, name: `${id}2` })))
            assert.deepStrictEqual(r.map((v) => v.ok), [1, 1, 1, 1, 1])
            assert.deepStrictEqual(r.map((v) => v.nModified), [1, 1, 1, 1, 1])
            let d = await wo.del(ids.map((id) => ({ id })))
            assert.deepStrictEqual(d.map((v) => [v.ok, v.nDeleted]), ids.map(() => [1, 1]))
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

        it('should accept NUL in a string value (NUL is checked for ids only) and read it back unchanged', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let r = await wo.insert({ id: 'nv1', name: 'a\u0000b', nested: { s: '\u0000' }, list: ['x\u0000'] })
            assert.strictEqual(r.nInserted, 1)
            assert.deepStrictEqual(await wo.selectByPk('nv1'), { id: 'nv1', name: 'a\u0000b', nested: { s: '\u0000' }, list: ['x\u0000'] })
            let s = await wo.save({ id: 'nv1', name: 'c\u0000d' })
            assert.deepStrictEqual(s.map((v) => v.ok), [1])
            assert.strictEqual((await rawOne(cl, 'nv1')).name, 'c\u0000d')
            await dropCl(cl)
        })

        it('should keep BSON typed values (ObjectId, Long, Decimal128, Binary, Date, RegExp, Int32, Double) in documents', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            let oid = new mongodb.ObjectId('0123456789abcdef01234567')
            let doc = {
                id: 'bson1',
                oid,
                long: mongodb.Long.fromNumber(2 ** 40),
                dec: mongodb.Decimal128.fromString('1.5'),
                bin: new mongodb.Binary(Buffer.from([1, 2, 3])),
                date: new Date(0),
                re: /ab+c/i,
                i32: new mongodb.Int32(5),
                dbl: new mongodb.Double(2.5),
                nested: { list: [{ s: 'x\u{1F600}', n: 1 }, 'plain'], u8: new Uint8Array([7, 8]) },
            }
            let r = await wo.insert(doc)
            assert.strictEqual(r.nInserted, 1)
            let got = await wo.selectByPk('bson1')
            assert.strictEqual(got.oid.toHexString(), '0123456789abcdef01234567')
            assert.strictEqual(Number(got.long), 2 ** 40)
            assert.strictEqual(got.dec.toString(), '1.5')
            assert.deepStrictEqual(Array.from(got.bin.buffer.subarray(0, got.bin.length())), [1, 2, 3])
            assert.strictEqual(got.date.getTime(), 0)
            assert.strictEqual(got.re.source, 'ab+c')
            assert.strictEqual(got.i32, 5)
            assert.strictEqual(got.dbl, 2.5)
            assert.strictEqual(got.nested.list[0].s, 'x\u{1F600}')
            let s = await wo.save({ id: 'bson1', oid, nested: { list: [{ s: 'y\u{1F600}' }] } })
            assert.strictEqual(s[0].ok, 1)
            await dropCl(cl)
        })

        it('should reject a RegExp value whose source holds a lone surrogate (BSON would rewrite it)', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await assert.rejects(() => wo.insert({ id: 'r1', re: new RegExp('a\uD800') }), (err) => msgOf(err) === 'invalid data: string contains lone surrogate at [data[0].re.source]')
            assert.deepStrictEqual(await rawIds(cl), [])
            await dropCl(cl)
        })

    })


    describe('pre-existing rows with NUL ids are unreachable by id paths', function() {

        let idNul = 'x\u0000y'

        it('should not read, change or delete a row whose id holds NUL via selectByPk, del, save and insert', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await getCl(cl).insertMany([{ id: idNul, name: 'legacy' }, { id: 'k0', name: 'k0' }])
            assert.strictEqual(await wo.selectByPk(idNul), null)
            assert.deepStrictEqual((await wo.del({ id: idNul })).map((v) => [v.ok, v.n]), [[0, 0]])
            assert.deepStrictEqual((await wo.save({ id: idNul, name: 'x' }, { autoInsert: false })).map((v) => v.ok), [0])
            assert.deepStrictEqual((await wo.save({ id: idNul, name: 'x' })).map((v) => v.ok), [0])
            await assert.rejects(() => wo.insert({ id: idNul, name: 'n' }), (err) => msgOf(err) === 'invalid id: string contains NUL at [data[0].id]')
            assert.deepStrictEqual(await rawOne(cl, idNul), { id: idNul, name: 'legacy' })
            //舊列仍可由資料欄條件清除
            assert.strictEqual((await wo.delAll({ name: 'legacy' })).nDeleted, 1)
            assert.deepStrictEqual(await rawIds(cl), ['k0'])
            await dropCl(cl)
        })

        it('should not read, change or delete a GridFS file whose name holds NUL via selectByPkGfs, delGfs and insertGfs', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            await new Promise((resolve, reject) => {
                let up = new mongodb.GridFSBucket(rawClient.db(ctDb), { bucketName: cl }).openUploadStream(idNul)
                up.on('error', reject)
                up.on('finish', resolve)
                up.end(Buffer.from([1, 2, 3]))
            })
            assert.deepStrictEqual(await rawGfsIds(cl), [idNul])
            assert.strictEqual(await wo.selectByPkGfs(idNul), null)
            assert.deepStrictEqual((await wo.delGfs({ id: idNul })).map((v) => [v.ok, v.n]), [[0, 0]])
            await assert.rejects(() => wo.insertGfs({ id: idNul, u8a: new Uint8Array([7]) }), (err) => msgOf(err) === 'invalid id: string contains NUL at [data[0].id]')
            assert.deepStrictEqual(await rawGfsIds(cl), [idNul])
            //舊檔仍可由delAllGfs清除
            assert.strictEqual((await wo.delAllGfs({ length: 3 })).nDeleted, 1)
            assert.deepStrictEqual(await rawGfsIds(cl), [])
            await dropCl(cl)
        })

    })


    describe('legacy rows written before the check', function() {

        it('should find rows rewritten to U+FFFD by candidate filter and remove them with a well-formed id', async function() {
            let cl = genCl()
            let wo = WOrm(genOpt(cl))
            //BSON已於寫入時把孤立代理字元改寫為U+FFFD, 以驅動預存同形之舊列
            await getCl(cl).insertMany([{ id: 'a�', name: 'old' }, { id: 'b\u{1F600}', name: 'emoji' }, { id: 'c', name: 'clean' }])
            let rs = await wo.select()
            //U+FFFD為良構, isWellFormed無法檢出, 以含U+FFFD作為候選
            assert.deepStrictEqual(rs.filter((r) => typeof r.id === 'string' && !r.id.isWellFormed()), [])
            let cand = rs.filter((r) => typeof r.id === 'string' && r.id.includes('�'))
            assert.deepStrictEqual(cand.map((v) => v.id), ['a�'])
            //孤立代理字元定址被拒, 不命中舊列
            assert.strictEqual(await wo.selectByPk('a\uD800'), null)
            let d0 = await wo.del({ id: 'a\uD800' })
            assert.deepStrictEqual(d0.map((v) => v.ok), [0])
            assert.deepStrictEqual(await rawIds(cl), ['a�', 'b\u{1F600}', 'c'])
            //以U+FFFD同形之良構id清除
            let d1 = await wo.del(cand.map((v) => ({ id: v.id })))
            assert.deepStrictEqual(d1.map((v) => [v.ok, v.nDeleted]), [[1, 1]])
            assert.deepStrictEqual(await rawIds(cl), ['b\u{1F600}', 'c'])
            //依他欄條件清除
            let d2 = await wo.delAll({ name: 'emoji' })
            assert.strictEqual(d2.nDeleted, 1)
            assert.deepStrictEqual(await rawIds(cl), ['c'])
            await dropCl(cl)
        })

    })


})

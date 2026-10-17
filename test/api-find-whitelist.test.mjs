import assert from 'assert'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import cvOrmFind from 'wsemi/src/cvOrmFind.mjs'
import cvOrmFindCases from 'wsemi/src/_cvOrmFindCases.mjs'
import { delay, genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


//條件(find)白名單之接線測試, 規則見CLAUDE_rulebook.md R-FIND-01
//契約案例表(wsemi/src/_cvOrmFindCases.mjs)逐案對公開select與delAll執行, 種子與快照一律由驅動直接操作, 不經受測套件


let { seed, cases } = cvOrmFindCases


let ctName = 'worm-test-mongodb-find-whitelist'
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainer動態取得
let rawClient = null


let allIds = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']


//genOpt
let genOpt = (cl) => {
    return {
        url: genUrl(ctPort),
        db: ctDb,
        cl,
    }
}

//getCl, 以驅動直接取資料表物件
let getCl = (cl) => {
    return rawClient.db(ctDb).collection(cl)
}

//reseed, 以驅動重建6列種子(a1~a6)
let reseed = async (cl) => {
    let c = getCl(cl)
    await c.deleteMany({})
    await c.insertMany(seed())
}

//snap, 以驅動取資料表快照(去除_id並依id排序), 用於驗證資料不變
let snap = async (cl) => {
    return getCl(cl).find({}, { projection: { _id: 0 } }).sort({ id: 1 }).toArray()
}

//idsOf, 取id陣列並升冪排序
let idsOf = (rs) => {
    return rs.map((v) => v.id).sort()
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

//nType, 事件陣列內指定類型之筆數
let nType = (evs, type) => {
    return evs.filter((v) => v.type === type).length
}

//getMsg, 取共用檢核對該find之錯誤訊息(本套件須原樣reject該訊息)
let getMsg = (find) => {
    let msg = null
    try {
        cvOrmFind(find)
    }
    catch (err) {
        msg = err.message
    }
    return msg
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

//genFlipSpy, 產生包裝target之Proxy, 其key欄僅第一次被讀取時為v1, 其後(含get陷阱)皆為v2(用於驗證檢查之值即使用之值),
//回傳{ proxy, stat }, stat記錄key被屬性描述子讀取(desc)與被get讀取(get)之次數: 檢核須只以描述子讀取一次, 其後不得再讀取原物件
let genFlipSpy = (target, key, v1, v2) => {
    let stat = { desc: 0, get: 0 }
    let n = 0
    let proxy = new Proxy(target, {
        get(t, k, r) {
            if (k === key) {
                stat.get++
                n++
                return n === 1 ? v1 : v2
            }
            return Reflect.get(t, k, r)
        },
        getOwnPropertyDescriptor(t, k) {
            let d = Reflect.getOwnPropertyDescriptor(t, k)
            if (k === key) {
                stat.desc++
                n++
                d.value = n === 1 ? v1 : v2
            }
            return d
        },
    })
    return { proxy, stat }
}

//genFlips, 翻轉案例: 條件內各層(頂層欄、運算子物件、$in陣列元素、$and陣列元素、$or元素內欄位、Date值)各有一處被翻轉, 檢核後之複本須為第一次讀取之值(皆命中a1)
let genFlips = () => {
    let D1 = new Date(Date.UTC(2026, 0, 1))
    let D2 = new Date(Date.UTC(2026, 1, 1))
    let r = []
    let add = (label, fn) => {
        r.push({ label, gen: fn })
    }
    add('top level field', () => {
        let s = genFlipSpy({ id: 'a1' }, 'id', 'a1', 'a2')
        return { find: s.proxy, stats: [s.stat] }
    })
    add('operator object $in', () => {
        let s = genFlipSpy({ $in: ['a1'] }, '$in', ['a1'], ['a2'])
        return { find: { id: s.proxy }, stats: [s.stat] }
    })
    add('element of $in array', () => {
        let s = genFlipSpy(['a1'], '0', 'a1', 'a2')
        return { find: { id: { $in: s.proxy } }, stats: [s.stat] }
    })
    add('element of $and array', () => {
        let s = genFlipSpy([{ id: 'a1' }], '0', { id: 'a1' }, { id: 'a2' })
        return { find: { $and: s.proxy }, stats: [s.stat] }
    })
    add('field in element of $or array', () => {
        let s = genFlipSpy({ id: 'a1' }, 'id', 'a1', 'a2')
        return { find: { $or: [s.proxy] }, stats: [s.stat] }
    })
    add('Date value', () => {
        let s = genFlipSpy({ d: new Date(0) }, 'd', D1, D2)
        return { find: s.proxy, stats: [s.stat] }
    })
    return r
}


before(async function() {
    this.timeout(600000) //含拉取映像與服務啟動
    ctPort = await startContainer(ctName)
    rawClient = new mongodb.MongoClient(genUrl(ctPort))
    await rawClient.connect()
})

after(async function() {
    this.timeout(120000)
    if (rawClient) {
        await rawClient.close()
    }
    await stopContainer(ctName)
})


describe('find whitelist: cases', function() {
    let cl = 'cases'
    let wo = null
    let evs = null

    before(function() {
        wo = WOrm(genOpt(cl))
        evs = collect(wo)
    })

    it('should get true for count of contract cases not less than 241', function() {
        assert.ok(cases.length >= 241, `contract cases are ${cases.length}`)
    })

    for (let c of cases) {

        if (c.expect === 'REJ') {

            for (let mode of ['select', 'delAll']) {

                it(`should get "invalid find" and keep data for ${mode} ${c.id} ${c.label}`, async function() {
                    this.timeout(180000)
                    await reseed(cl)
                    let before = await snap(cl)
                    let msgExp = getMsg(c.find())
                    evs.length = 0

                    //call
                    let err = null
                    let nErrAtReject = -1
                    let nChgAtReject = -1
                    await wo[mode](c.find())
                        .catch(function(e) {
                            err = e
                            nErrAtReject = nType(evs, 'error')
                            nChgAtReject = nType(evs, 'change')
                        })

                    //reject, 訊息原樣(不包裝)
                    assert.ok(err instanceof Error, `${mode} should reject`)
                    assert.strict.deepStrictEqual(typeof msgExp, 'string')
                    assert.strict.deepStrictEqual(msgExp.indexOf('invalid find: '), 0)
                    assert.strict.deepStrictEqual(err.message, msgExp)

                    //error事件須於reject之前恰發出一次, change不發
                    assert.strict.deepStrictEqual(nErrAtReject, 1)
                    assert.strict.deepStrictEqual(nChgAtReject, 0)
                    await delay(30)
                    assert.strict.deepStrictEqual(nType(evs, 'error'), 1)
                    assert.strict.deepStrictEqual(nType(evs, 'change'), 0)
                    assert.strict.deepStrictEqual(evs[0].mode, mode)
                    assert.strict.deepStrictEqual(evs[0].data, null)
                    assert.strict.deepStrictEqual(evs[0].err, msgExp)

                    //資料不變
                    assert.strict.deepStrictEqual(await snap(cl), before)

                })

            }

        }
        else {

            it(`should get ${JSON.stringify(c.ids.mongo)} for select ${c.id} ${c.label}`, async function() {
                this.timeout(180000)
                await reseed(cl)
                evs.length = 0
                let rs = await wo.select(c.find())
                assert.strict.deepStrictEqual(idsOf(rs), c.ids.mongo)
                assert.strict.deepStrictEqual(rs.every((v) => !('_id' in v)), true)
                assert.strict.deepStrictEqual(evs.length, 0)
            })

            it(`should delete the same ids as select for delAll ${c.id} ${c.label}`, async function() {
                this.timeout(180000)
                await reseed(cl)
                let selected = idsOf(await wo.select(c.find()))
                assert.strict.deepStrictEqual(selected, c.ids.mongo)
                evs.length = 0

                //delAll
                let r = await wo.delAll(c.find())
                let remain = idsOf(await snap(cl))
                let deleted = allIds.filter((v) => !remain.includes(v))

                //刪除集合=select命中集合, n與nDeleted皆為實際刪除筆數
                assert.strict.deepStrictEqual(deleted, selected)
                assert.strict.deepStrictEqual(r, { n: selected.length, nDeleted: selected.length, ok: 1 })
                assert.strict.deepStrictEqual(evs.length, 1)
                assert.strict.deepStrictEqual(evs[0].type, 'change')
                assert.strict.deepStrictEqual(evs[0].mode, 'delAll')
            })

        }

    }

})


describe('find whitelist: top level', function() {
    let cl = 'top'
    let wo = null
    let evs = null

    before(function() {
        wo = WOrm(genOpt(cl))
        evs = collect(wo)
    })

    it('should get all 6 for select() without find', async function() {
        await reseed(cl)
        let rs = await wo.select()
        assert.strict.deepStrictEqual(idsOf(rs), allIds)
    })

    it('should get all 6 deleted for delAll() without find', async function() {
        await reseed(cl)
        let r = await wo.delAll()
        assert.strict.deepStrictEqual(r, { n: 6, nDeleted: 6, ok: 1 })
        assert.strict.deepStrictEqual(await snap(cl), [])
    })

    it('should get all 6 deleted for delAll({}) and delAll(undefined)', async function() {
        await reseed(cl)
        let r1 = await wo.delAll({})
        assert.strict.deepStrictEqual(r1, { n: 6, nDeleted: 6, ok: 1 })
        await reseed(cl)
        let r2 = await wo.delAll(undefined)
        assert.strict.deepStrictEqual(r2, { n: 6, nDeleted: 6, ok: 1 })
        await reseed(cl)
        let r3 = await wo.delAll(Object.create(null))
        assert.strict.deepStrictEqual(r3, { n: 6, nDeleted: 6, ok: 1 })
    })

    it('should get 0 deleted for delAll with no hit', async function() {
        await reseed(cl)
        evs.length = 0
        let r = await wo.delAll({ id: 'not-existed' })
        assert.strict.deepStrictEqual(r, { n: 0, nDeleted: 0, ok: 1 })
        assert.strict.deepStrictEqual(nType(evs, 'error'), 0)
        assert.strict.deepStrictEqual((await snap(cl)).length, 6)
    })

    it('should get row without _id and same fields as seeded for select', async function() {
        await reseed(cl)
        let rs = await wo.select({ id: 'a1' })
        assert.strict.deepStrictEqual(rs, [seed()[0]])
        assert.strict.deepStrictEqual(Object.keys(rs[0]).includes('_id'), false)
        let rsAll = await wo.select({})
        assert.strict.deepStrictEqual(rsAll.some((v) => '_id' in v), false)
    })

    it('should reject $regex and keep working after reject', async function() {
        await reseed(cl)
        let msg = null
        await wo.select({ name: { $regex: 'PeT', $options: 'i' } })
            .catch(function(err) {
                msg = err.toString()
            })
        assert.strict.deepStrictEqual(msg, 'Error: invalid find: unsupported operator [$regex] at [find.name.$regex]')
        let rs = await wo.select({ name: 'Peter' })
        assert.strict.deepStrictEqual(idsOf(rs), ['a1'])
    })

    for (let fl of genFlips()) {

        it(`should use the value that was checked and not read the given object again for select with flipped ${fl.label}`, async function() {
            await reseed(cl)
            let { find, stats } = fl.gen()
            let rs = await wo.select(find)
            assert.strict.deepStrictEqual(idsOf(rs), ['a1'])
            assert.strict.deepStrictEqual(stats.map((v) => [v.desc, v.get]), [[1, 0]])
        })

        it(`should use the value that was checked and not read the given object again for delAll with flipped ${fl.label}`, async function() {
            await reseed(cl)
            let { find, stats } = fl.gen()
            let r = await wo.delAll(find)
            assert.strict.deepStrictEqual(r, { n: 1, nDeleted: 1, ok: 1 })
            assert.strict.deepStrictEqual(idsOf(await snap(cl)), ['a2', 'a3', 'a4', 'a5', 'a6'])
            assert.strict.deepStrictEqual(stats.map((v) => [v.desc, v.get]), [[1, 0]])
        })

    }

    it('should reject BSON reserved field name _bsontype without matching or deleting any data', async function() {
        await reseed(cl)
        let finds = [
            () => ({ _bsontype: 'x' }),
            () => ({ _bsontype: 'ObjectId' }),
            () => ({ _bsontype: 1 }),
            () => ({ $and: [{ _bsontype: 'x' }] }),
            () => ({ _bsontype: { $eq: 'x' } }),
        ]
        for (let fn of finds) {

            //select, 白名單收此欄名(符合欄名文法), 但BSON以_bsontype辨識型別而無法作為一般欄位送出, 須reject或無命中, 不得命中任何數據
            let rs = null
            await wo.select(fn())
                .then(function(v) {
                    rs = v
                })
                .catch(function() {
                    rs = 'rejected'
                })
            assert.ok(rs === 'rejected' || (Array.isArray(rs) && rs.length === 0))

            //delAll
            let r = null
            await wo.delAll(fn())
                .then(function(v) {
                    r = v
                })
                .catch(function() {
                    r = 'rejected'
                })
            assert.ok(r === 'rejected' || r.nDeleted === 0)

        }
        assert.strict.deepStrictEqual((await snap(cl)).length, 6)
    })

    it('should not change the find object given by caller', async function() {
        await reseed(cl)
        let find = { $or: [{ g: 'A' }, { age: { $in: [50] } }], name: { $ne: 'zz' } }
        let txt = JSON.stringify(find)
        let rs = await wo.select(find)
        assert.strict.deepStrictEqual(idsOf(rs), ['a1', 'a2', 'a5'])
        await wo.delAll(find)
        assert.strict.deepStrictEqual(JSON.stringify(find), txt)
        assert.strict.deepStrictEqual(Object.getPrototypeOf(find), Object.prototype)
    })

})


describe('find whitelist: bad find does not reach mongodb', function() {
    let cl = 'noreach'
    let rejs = cases.filter((c) => c.expect === 'REJ')

    it('should get 0 for count of MongoClient created by bad find of select and delAll', async function() {
        this.timeout(180000)
        await reseed(cl)
        let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
        collect(wo)

        //對照: 正常呼叫每次建立1個MongoClient
        await wo.select({})
        assert.strict.deepStrictEqual(count.n, 1)
        await wo.delAll({ id: 'not-existed' })
        assert.strict.deepStrictEqual(count.n, 2)

        //壞find一律不建立MongoClient
        let n0 = count.n
        let nRej = 0
        for (let c of rejs) {
            for (let mode of ['select', 'delAll']) {
                await wo[mode](c.find())
                    .catch(function() {
                        nRej++
                    })
            }
        }
        assert.strict.deepStrictEqual(nRej, rejs.length * 2)
        assert.strict.deepStrictEqual(count.n - n0, 0)

        //對照: 之後正常呼叫仍建立
        await wo.select({ id: 'a1' })
        assert.strict.deepStrictEqual(count.n - n0, 1)
        assert.strict.deepStrictEqual((await snap(cl)).length, 6)

    })

    it('should get 0 for count of operations on server by bad find of select and delAll', async function() {
        this.timeout(180000)
        await reseed(cl)
        let db = rawClient.db(ctDb)
        let ns = `${ctDb}.${cl}`
        let countProf = async () => {
            await delay(100)
            return db.collection('system.profile').countDocuments({ ns })
        }

        //profile level 2, 記錄伺服器收到之全部操作
        await db.command({ profile: 2 })
        try {

            let wo = WOrm(genOpt(cl))
            collect(wo)

            //對照: 正常呼叫伺服器會收到操作(select與delAll各自證明)
            let p00 = await countProf()
            await wo.select({ id: 'a1' })
            let p0 = await countProf()
            assert.ok(p0 > p00, 'profiler should record the operation of normal select')
            await wo.delAll({ id: 'not-existed' })
            let p1 = await countProf()
            assert.ok(p1 > p0, 'profiler should record the operation of normal delAll')

            //壞find不得送達伺服器
            let nRej = 0
            for (let c of rejs) {
                for (let mode of ['select', 'delAll']) {
                    await wo[mode](c.find())
                        .catch(function() {
                            nRej++
                        })
                }
            }
            assert.strict.deepStrictEqual(nRej, rejs.length * 2)
            let p2 = await countProf()
            assert.strict.deepStrictEqual(p2, p1)

            //對照: 之後正常呼叫伺服器仍會收到操作
            await wo.select({ id: 'a1' })
            let p3 = await countProf()
            assert.ok(p3 > p2, 'profiler should record the operation of normal select after rejects')

        }
        finally {
            await db.command({ profile: 0 })
        }

        assert.strict.deepStrictEqual((await snap(cl)).length, 6)
    })

    it('should reject $where string and function at once without running them', async function() {
        this.timeout(180000)
        await reseed(cl)
        let wo = WOrm(genOpt(cl))
        let evs = collect(wo)
        let fnWhere = () => true
        for (let mode of ['select', 'delAll']) {
            for (let find of [{ $where: 'sleep(3000) || true' }, { $where: fnWhere }, { id: 'a1', $where: 'true' }]) {
                evs.length = 0
                let t0 = Date.now()
                let err = null
                await wo[mode](find)
                    .catch(function(e) {
                        err = e
                    })
                let dt = Date.now() - t0
                assert.ok(err instanceof Error)
                assert.strict.deepStrictEqual(err.message.indexOf('invalid find: unsupported operator [$where]'), 0)
                assert.ok(dt < 2000, `${mode} should reject $where at once, but spent ${dt}ms`)
                assert.strict.deepStrictEqual(nType(evs, 'error'), 1)
                assert.strict.deepStrictEqual(nType(evs, 'change'), 0)
            }
        }
        assert.strict.deepStrictEqual((await snap(cl)).length, 6)
    })

})

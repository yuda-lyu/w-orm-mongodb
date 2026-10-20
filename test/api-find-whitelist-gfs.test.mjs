import assert from 'assert'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import cvOrmFind from 'wsemi/src/cvOrmFind.mjs'
import cvOrmFindCases from 'wsemi/src/_cvOrmFindCases.mjs'
import { delay, genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


//GridFS之條件(find)白名單接線測試, 規則見CLAUDE_rulebook.md R-FIND-01
//delAllGfs與_findGfs(含delGfs逐筆之{filename:id})適用同一白名單, 檔案清單一律由驅動直接查詢, 不經受測套件


let { cases } = cvOrmFindCases


let ctName = 'worm-test-mongodb-find-whitelist-gfs'
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainer動態取得
let rawClient = null


let ids = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6']


//genOpt
let genOpt = (cl) => {
    return {
        url: genUrl(ctPort),
        db: ctDb,
        cl,
    }
}

//genU8a, 產生內容可複現之測試數據
let genU8a = (n, seed = 0) => {
    let u8a = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
        u8a[i] = (i + seed) % 256
    }
    return u8a
}

//listNames, 以驅動查files資料表之filename清單(升冪)
let listNames = async (cl) => {
    let rs = await rawClient.db(ctDb).collection(`${cl}.files`).find({}, { projection: { _id: 0, filename: 1 } }).sort({ filename: 1 }).toArray()
    return rs.map((v) => v.filename)
}

//countChunks, 以驅動查chunks資料表筆數
let countChunks = async (cl) => {
    return rawClient.db(ctDb).collection(`${cl}.chunks`).countDocuments({})
}

//reseed, 以驅動清空後經insertGfs寫入6個檔案(g1~g6, 長度10~60)
let reseed = async (cl, wo) => {
    await rawClient.db(ctDb).collection(`${cl}.files`).deleteMany({})
    await rawClient.db(ctDb).collection(`${cl}.chunks`).deleteMany({})
    let r = await wo.insertGfs(ids.map((id, i) => {
        return { id, u8a: genU8a((i + 1) * 10, i) }
    }))
    assert.strict.deepStrictEqual(r.nInserted, 6)
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

//genFlips, 翻轉案例: 條件內各層(頂層欄、運算子物件、$in陣列元素、$or元素內欄位)各有一處被翻轉, 檢核後之複本須為第一次讀取之值(皆只刪除g1)
let genFlips = () => {
    let r = []
    let add = (label, fn) => {
        r.push({ label, gen: fn })
    }
    add('top level field', () => {
        let s = genFlipSpy({ filename: 'g1' }, 'filename', 'g1', 'g2')
        return { find: s.proxy, stats: [s.stat] }
    })
    add('operator object $in', () => {
        let s = genFlipSpy({ $in: ['g1'] }, '$in', ['g1'], ['g2'])
        return { find: { filename: s.proxy }, stats: [s.stat] }
    })
    add('element of $in array', () => {
        let s = genFlipSpy(['g1'], '0', 'g1', 'g2')
        return { find: { filename: { $in: s.proxy } }, stats: [s.stat] }
    })
    add('field in element of $or array', () => {
        let s = genFlipSpy({ filename: 'g1' }, 'filename', 'g1', 'g2')
        return { find: { $or: [s.proxy] }, stats: [s.stat] }
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


describe('find whitelist gfs: reject', function() {
    let cl = 'gfsrej'
    let wo = null
    let evs = null
    let rejs = cases.filter((c) => c.expect === 'REJ')

    before(async function() {
        this.timeout(180000)
        wo = WOrm(genOpt(cl))
        evs = collect(wo)
        await reseed(cl, wo)
    })

    for (let c of rejs) {

        it(`should get "invalid find" and keep files for delAllGfs ${c.id} ${c.label}`, async function() {
            this.timeout(180000)
            let names0 = await listNames(cl)
            let chunks0 = await countChunks(cl)
            let msgExp = getMsg(c.find())
            evs.length = 0

            //call
            let err = null
            let nErrAtReject = -1
            let nChgAtReject = -1
            await wo.delAllGfs(c.find())
                .catch(function(e) {
                    err = e
                    nErrAtReject = nType(evs, 'error')
                    nChgAtReject = nType(evs, 'change')
                })
            await delay(30)

            //檔案須不變, 若被刪則先還原以免影響後續案例
            let names1 = await listNames(cl)
            let chunks1 = await countChunks(cl)
            let same = JSON.stringify(names1) === JSON.stringify(names0) && chunks1 === chunks0
            if (!same) {
                await reseed(cl, wo)
            }

            //reject, 訊息原樣(不包裝)
            assert.ok(err instanceof Error, 'delAllGfs should reject')
            assert.strict.deepStrictEqual(typeof msgExp, 'string')
            assert.strict.deepStrictEqual(msgExp.indexOf('invalid find: '), 0)
            assert.strict.deepStrictEqual(err.message, msgExp)

            //error事件須於reject之前恰發出一次, change不發
            assert.strict.deepStrictEqual(nErrAtReject, 1)
            assert.strict.deepStrictEqual(nChgAtReject, 0)
            assert.strict.deepStrictEqual(nType(evs, 'error'), 1)
            assert.strict.deepStrictEqual(nType(evs, 'change'), 0)
            assert.strict.deepStrictEqual(evs[0].mode, 'delAllGfs')
            assert.strict.deepStrictEqual(evs[0].data, null)
            assert.strict.deepStrictEqual(evs[0].err, msgExp)

            //檔案不變
            assert.strict.deepStrictEqual(same, true)

        })

    }

    it('should reject GridFS specific forms: $regex, dotted path, $where', async function() {
        this.timeout(180000)
        await reseed(cl, wo)
        let finds = [
            { filename: { $regex: '^g' } },
            { 'metadata.owner': 'x' },
            { filename: 'g1', $where: 'true' },
            { filename: /g1/ },
            { $nor: [{ filename: 'g1' }] },
            { length: { $exists: true } },
        ]
        for (let find of finds) {
            let err = null
            await wo.delAllGfs(find)
                .catch(function(e) {
                    err = e
                })
            assert.ok(err instanceof Error)
            assert.strict.deepStrictEqual(err.message.indexOf('invalid find: '), 0)
        }
        assert.strict.deepStrictEqual(await listNames(cl), ids)
    })

})


describe('find whitelist gfs: accept', function() {
    let cl = 'gfsok'
    let wo = null
    let evs = null
    let future = () => new Date(Date.now() + 3600 * 1000)

    before(function() {
        wo = WOrm(genOpt(cl))
        evs = collect(wo)
    })

    let oks = [
        { label: 'no find', find: () => undefined, del: ids, call: 'noarg' },
        { label: 'undefined', find: () => undefined, del: ids },
        { label: '{}', find: () => ({}), del: ids },
        { label: 'null prototype {}', find: () => Object.create(null), del: ids },
        { label: '{filename:g2}', find: () => ({ filename: 'g2' }), del: ['g2'] },
        { label: '{filename:not-existed}', find: () => ({ filename: 'not-existed' }), del: [] },
        { label: '{filename:{$in:[g1,g3]}}', find: () => ({ filename: { $in: ['g1', 'g3'] } }), del: ['g1', 'g3'] },
        { label: '{filename:{$in:[]}} always false', find: () => ({ filename: { $in: [] } }), del: [] },
        { label: '{filename:{$nin:[g1]}}', find: () => ({ filename: { $nin: ['g1'] } }), del: ['g2', 'g3', 'g4', 'g5', 'g6'] },
        { label: '{$or:[{filename:g1},{filename:g6}]}', find: () => ({ $or: [{ filename: 'g1' }, { filename: 'g6' }] }), del: ['g1', 'g6'] },
        { label: '{$and:[{filename:{$ne:g1}},{length:{$gt:30}}]}', find: () => ({ $and: [{ filename: { $ne: 'g1' } }, { length: { $gt: 30 } }] }), del: ['g4', 'g5', 'g6'] },
        { label: '{length:{$gte:40}}', find: () => ({ length: { $gte: 40 } }), del: ['g4', 'g5', 'g6'] },
        { label: '{length:{$lt:30,$gt:10}}', find: () => ({ length: { $lt: 30, $gt: 10 } }), del: ['g2'] },
        { label: '{length:20}', find: () => ({ length: 20 }), del: ['g2'] },
        { label: '{uploadDate:{$lt:future}}', find: () => ({ uploadDate: { $lt: future() } }), del: ids },
        { label: '{uploadDate:{$gt:future}}', find: () => ({ uploadDate: { $gt: future() } }), del: [] },
    ]

    for (let c of oks) {

        it(`should delete ${JSON.stringify(c.del)} for delAllGfs ${c.label}`, async function() {
            this.timeout(180000)
            await reseed(cl, wo)
            evs.length = 0

            //delAllGfs
            let r = null
            if (c.call === 'noarg') {
                r = await wo.delAllGfs()
            }
            else {
                r = await wo.delAllGfs(c.find())
            }

            //命中之檔案(含chunks)皆已刪除, 其餘不變
            let names = await listNames(cl)
            assert.strict.deepStrictEqual(names, ids.filter((v) => !c.del.includes(v)))
            assert.strict.deepStrictEqual(r, { n: c.del.length, nDeleted: c.del.length, ok: 1 })
            assert.strict.deepStrictEqual(await countChunks(cl), names.length)
            assert.strict.deepStrictEqual(nType(evs, 'error'), 0)
            assert.strict.deepStrictEqual(nType(evs, 'change'), 1)
            assert.strict.deepStrictEqual(evs[0].mode, 'delAllGfs')

        })

    }

    for (let fl of genFlips()) {

        it(`should use the value that was checked and not read the given object again for delAllGfs with flipped ${fl.label}`, async function() {
            this.timeout(180000)
            await reseed(cl, wo)
            let { find, stats } = fl.gen()
            let r = await wo.delAllGfs(find)
            assert.strict.deepStrictEqual(r, { n: 1, nDeleted: 1, ok: 1 })
            assert.strict.deepStrictEqual(await listNames(cl), ['g2', 'g3', 'g4', 'g5', 'g6'])
            assert.strict.deepStrictEqual(stats.map((v) => [v.desc, v.get]), [[1, 0]])
        })

    }

    it('should delete by id for delGfs and not be affected by whitelist', async function() {
        this.timeout(180000)
        await reseed(cl, wo)
        let r = await wo.delGfs([{ id: 'g1' }, { id: 'g3' }, { id: 'not-existed' }])
        assert.strict.deepStrictEqual(r, [
            { n: 1, nDeleted: 1, ok: 1 },
            { n: 1, nDeleted: 1, ok: 1 },
            { n: 0, nDeleted: 0, ok: 1 },
        ])
        assert.strict.deepStrictEqual(await listNames(cl), ['g2', 'g4', 'g5', 'g6'])
    })

})


describe('find whitelist gfs: bad find does not reach mongodb', function() {
    let cl = 'gfsnoreach'
    let rejs = cases.filter((c) => c.expect === 'REJ')

    it('should get 0 for count of MongoClient created by bad find of delAllGfs', async function() {
        this.timeout(180000)
        let woRaw = WOrm(genOpt(cl))
        await reseed(cl, woRaw)
        let { wo, count } = withSpyClient(() => WOrm(genOpt(cl)))
        collect(wo)

        //對照: 正常呼叫每次建立1個MongoClient
        await wo.delAllGfs({ filename: 'not-existed' })
        assert.strict.deepStrictEqual(count.n, 1)

        //壞find一律不建立MongoClient
        let n0 = count.n
        let nRej = 0
        for (let c of rejs) {
            await wo.delAllGfs(c.find())
                .catch(function() {
                    nRej++
                })
        }
        assert.strict.deepStrictEqual(nRej, rejs.length)
        assert.strict.deepStrictEqual(count.n - n0, 0)

        //對照: 之後正常呼叫仍建立
        await wo.delAllGfs({ filename: 'not-existed' })
        assert.strict.deepStrictEqual(count.n - n0, 1)
        assert.strict.deepStrictEqual(await listNames(cl), ids)

    })

    it('should get 0 for count of operations on server by bad find of delAllGfs', async function() {
        this.timeout(180000)
        let wo = WOrm(genOpt(cl))
        await reseed(cl, wo)
        collect(wo)
        let db = rawClient.db(ctDb)
        let countProf = async () => {
            await delay(100)
            return db.collection('system.profile').countDocuments({ ns: { $in: [`${ctDb}.${cl}.files`, `${ctDb}.${cl}.chunks`] } })
        }

        //profile level 2, 記錄伺服器收到之全部操作
        await db.command({ profile: 2 })
        try {

            //對照: 正常呼叫伺服器會收到操作
            let p0 = await countProf()
            await wo.delAllGfs({ filename: 'not-existed' })
            let p1 = await countProf()
            assert.ok(p1 > p0, 'profiler should record the operation of normal delAllGfs')

            //壞find不得送達伺服器
            let nRej = 0
            for (let c of rejs) {
                await wo.delAllGfs(c.find())
                    .catch(function() {
                        nRej++
                    })
            }
            assert.strict.deepStrictEqual(nRej, rejs.length)
            let p2 = await countProf()
            assert.strict.deepStrictEqual(p2, p1)

            //對照: 之後正常呼叫伺服器仍會收到操作
            await wo.delAllGfs({ filename: 'not-existed' })
            let p3 = await countProf()
            assert.ok(p3 > p2, 'profiler should record the operation of normal delAllGfs after rejects')

        }
        finally {
            await db.command({ profile: 0 })
        }

        assert.strict.deepStrictEqual(await listNames(cl), ids)
    })

})


describe('find whitelist gfs: delGfs with id out of whitelist', function() {
    let cl = 'gfsnul'

    it('should get n 0 and ok 0 with invalid id for delGfs of ids out of whitelist, other ids not affected', async function() {
        this.timeout(180000)
        let wo = WOrm(genOpt(cl))
        let evs = collect(wo)
        await reseed(cl, wo)
        let idNul = 'x\u0000y'

        //含NUL之檔名(舊版可由insertGfs寫入, 第66項起insertGfs拒收主鍵含NUL, 故以驅動直接寫入舊列)
        await new Promise((resolve, reject) => {
            let up = new mongodb.GridFSBucket(rawClient.db(ctDb), { bucketName: cl }).openUploadStream(idNul)
            up.on('error', reject)
            up.on('finish', resolve)
            up.end(Buffer.from(genU8a(5)))
        })
        assert.strict.deepStrictEqual((await listNames(cl)).includes(idNul), true)
        evs.length = 0

        //delGfs, 主鍵含NUL或孤立代理字元者(第66項起由主鍵檢核拒收, 訊息為invalid id: …且不回顯值)尚未查找, n為0、ok為0, 逐筆失敗不中斷同批其他筆, 不論該id是否存在
        let msgNul = (k) => `invalid id: string contains NUL at [data[${k}].id]`
        let msgLone = (k) => `invalid id: string contains lone surrogate at [data[${k}].id]`
        let r = await wo.delGfs([{ id: idNul }, { id: 'absent\u0000id' }, { id: '\uD800' }, { id: 'ok\uDC00' }, { id: 'g1' }])
        assert.strict.deepStrictEqual(r, [
            { n: 0, nDeleted: 0, ok: 0, err: msgNul(0) },
            { n: 0, nDeleted: 0, ok: 0, err: msgNul(1) },
            { n: 0, nDeleted: 0, ok: 0, err: msgLone(2) },
            { n: 0, nDeleted: 0, ok: 0, err: msgLone(3) },
            { n: 1, nDeleted: 1, ok: 1 },
        ])

        //每個失敗筆各發出一次error, 整批一次change
        assert.strict.deepStrictEqual(nType(evs, 'error'), 4)
        assert.strict.deepStrictEqual(evs.filter((v) => v.type === 'error').map((v) => [v.mode, v.err]), [
            ['delGfs', msgNul(0)],
            ['delGfs', msgNul(1)],
            ['delGfs', msgLone(2)],
            ['delGfs', msgLone(3)],
        ])
        assert.strict.deepStrictEqual(nType(evs, 'change'), 1)
        assert.strict.deepStrictEqual(await listNames(cl), ['g2', 'g3', 'g4', 'g5', 'g6', idNul].sort())

        //仍可用delAllGfs()全刪
        let rAll = await wo.delAllGfs()
        assert.strict.deepStrictEqual(rAll, { n: 6, nDeleted: 6, ok: 1 })
        assert.strict.deepStrictEqual(await listNames(cl), [])
        assert.strict.deepStrictEqual(await countChunks(cl), 0)

    })

})

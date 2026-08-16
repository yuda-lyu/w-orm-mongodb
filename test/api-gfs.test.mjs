import assert from 'assert'
import crypto from 'crypto'
import stream from 'stream'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


let ctName = 'worm-test-mongodb-gfs'
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainer動態取得


//genOpt
let genOpt = (cl) => {
    return {
        url: genUrl(ctPort),
        db: ctDb,
        cl,
    }
}

//genOptPk, 明確指定autoGenPk
let genOptPk = (cl, autoGenPk) => {
    return {
        url: genUrl(ctPort),
        db: ctDb,
        cl,
        autoGenPk,
    }
}

//genKeys, 取回傳物件之鍵集合, 用於驗證鍵集合固定
let genKeys = (v) => {
    return Object.keys(v).sort().join(',')
}

//genU8a, 產生內容可複現之測試數據
let genU8a = (n, seed = 0) => {
    let u8a = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
        u8a[i] = (i + seed) % 256
    }
    return u8a
}

//genHash
let genHash = (u8a) => {
    return crypto.createHash('sha256').update(Buffer.from(u8a)).digest('hex')
}

//countDocs, 直接由驅動查GridFS之files與chunks資料表筆數
let countDocs = async (cl) => {
    let client = new mongodb.MongoClient(genUrl(ctPort))
    let r = null
    try {
        let db = client.db(ctDb)
        r = {
            files: await db.collection(`${cl}.files`).countDocuments({}),
            chunks: await db.collection(`${cl}.chunks`).countDocuments({}),
        }
    }
    finally {
        await client.close()
    }
    return r
}

//uploadByDriver, 直接以驅動上傳指定filename, 用於製造既有數據尚存重複id之情境
//建立唯一索引後insertGfs已無法製造重複, 故須由驅動直接寫入
let uploadByDriver = async (cl, filename, u8a) => {
    let client = new mongodb.MongoClient(genUrl(ctPort))
    try {
        let bucket = new mongodb.GridFSBucket(client.db(ctDb), { bucketName: cl })
        await new Promise((resolve, reject) => {
            let rs = new stream.Readable()
            rs._read = () => {}
            rs.push(Buffer.from(u8a))
            rs.push(null)
            rs.pipe(bucket.openUploadStream(filename))
                .on('error', reject)
                .on('finish', resolve)
        })
    }
    finally {
        await client.close()
    }
}


before(async function() {
    this.timeout(600000) //含拉取映像與服務啟動
    ctPort = await startContainer(ctName)
})

after(async function() {
    this.timeout(120000)
    await stopContainer(ctName)
})


describe('gfs basic', function() {
    let rt = null
    let vans = {}
    let vget = {}

    //nSize, 12mb跨過chunkSizeBytes(10mb)故須分為2塊
    let nSize = 12 * 1024 * 1024

    before(async function () {
        this.timeout(300000)

        let cl = 'usersGfs'
        let wo = WOrm(genOpt(cl))

        //on
        wo.on('change', function(mode, data, res) {
            // console.log('change', mode)
        })

        //u8a
        let u8a = genU8a(nSize)

        //delAllGfs, 無命中屬正常結果
        rt = null
        // vans[1] = { n: 0, nDeleted: 0, ok: 1 }
        await wo.delAllGfs()
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[1] = rt

        //insertGfs
        rt = null
        // vans[2] = { n: 1, nInserted: 1, ok: 1 }
        await wo.insertGfs({ id: 'g-big', u8a })
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[2] = rt

        //chunks, 12mb依chunkSizeBytes(10mb)須分為2塊
        // vans[3] = { files: 1, chunks: 2 }
        vget[3] = await countDocs(cl)

        //selectByPkGfs, 取回內容須與來源逐位元組相同, 且形狀與insertGfs所收之數據物件一致
        rt = null
        // vans[4] = { keys: 'id,u8a', id: 'g-big', length: nSize, hash, b0: 0, b1: 1, b255: 255, b256: 0 }
        await wo.selectByPkGfs('g-big')
            .then(function(msg) {
                rt = {
                    keys: genKeys(msg),
                    id: msg.id,
                    length: msg.u8a.length,
                    hash: genHash(msg.u8a),
                    b0: msg.u8a[0],
                    b1: msg.u8a[1],
                    b255: msg.u8a[255],
                    b256: msg.u8a[256],
                }
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[4] = rt

        //selectByPkGfs by id not existed
        rt = null
        // vans[5] = null
        await wo.selectByPkGfs('id-not-existed')
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = `不應reject: ${msg.toString()}`
            })
        vget[5] = rt

        //selectByPkGfs by id invalid, 未給有效id視為查無數據
        // vans[6] = [null, null, null]
        vget[6] = [
            await wo.selectByPkGfs(''),
            await wo.selectByPkGfs(123),
            await wo.selectByPkGfs(null),
        ]

        //insertGfs未給id時自動產生
        // vans[7] = { n: 1, nInserted: 1, ok: 1 }
        vget[7] = await wo.insertGfs({ u8a: genU8a(100, 1) })

        //insertGfs輸入無效視為空結果
        // vans[8] = { n: 0, nInserted: 0, ok: 1 }
        vget[8] = await wo.insertGfs(null)

        //insertGfs之u8a無效屬呼叫端給值錯誤, 須reject
        rt = null
        // vans[9] = 'Error: invalid data[0].u8a'
        await wo.insertGfs({ id: 'g-bad', u8a: null })
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[9] = rt

        //delGfs
        rt = null
        // vans[10] = [{ n: 1, nDeleted: 1, ok: 1 }]
        await wo.delGfs({ id: 'g-big' })
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[10] = rt

        //delGfs by id not existed, 查無數據屬正常結果
        // vans[11] = [{ n: 0, nDeleted: 0, ok: 1 }]
        vget[11] = await wo.delGfs({ id: 'id-not-existed' })

        //delGfs未帶有效id, 須以ok為0回報
        // vans[12] = [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }]
        vget[12] = await wo.delGfs({ u8a: genU8a(10) })

        //delGfs輸入無效視為空結果
        // vans[13] = []
        vget[13] = await wo.delGfs(null)

        //delGfs混合有效與無效id, 須逐筆回報且長度與輸入相同
        await wo.insertGfs({ id: 'g-mix', u8a: genU8a(100, 2) })
        // vans[14] = [{ n: 1, nDeleted: 1, ok: 1 }, { n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }]
        vget[14] = await wo.delGfs([{ id: 'g-mix' }, { u8a: genU8a(10) }])

        //鍵集合須固定
        // vans[15] = ['n,nDeleted,ok', 'n,nDeleted,ok', 'err,n,nDeleted,ok']
        vget[15] = [genKeys(vget[10][0]), genKeys(vget[11][0]), genKeys(vget[12][0])]

        //delAllGfs, 先插入2筆再全刪
        await wo.insertGfs([
            { id: 'g-a', u8a: genU8a(100, 3) },
            { id: 'g-b', u8a: genU8a(100, 4) },
        ])
        rt = null
        // vans[16] = { n: 3, nDeleted: 3, ok: 1 } //含未給id而自動產生之該筆
        await wo.delAllGfs()
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[16] = rt

        //全刪後files與chunks須一併清除
        // vans[17] = { files: 0, chunks: 0 }
        vget[17] = await countDocs(cl)

        //insertGfs之鍵集合須固定
        // vans[18] = ['n,nInserted,ok', 'n,nInserted,ok']
        vget[18] = [genKeys(vget[2]), genKeys(vget[8])]

    })

    vans[1] = { n: 0, nDeleted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for delAllGfs with no matched data`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[2])} for insertGfs`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = { files: 1, chunks: 2 }
    it(`should get ${JSON.stringify(vans[3])} for chunks of 12mb data by chunkSizeBytes 10mb`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = {
        keys: 'id,u8a',
        id: 'g-big',
        length: nSize,
        hash: genHash(genU8a(nSize)),
        b0: 0,
        b1: 1,
        b255: 255,
        b256: 0,
    }
    it(`should get same content for selectByPkGfs`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = null
    it(`should get ${JSON.stringify(vans[5])} for selectByPkGfs by id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = [null, null, null]
    it(`should get ${JSON.stringify(vans[6])} for selectByPkGfs by id invalid`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[7])} for insertGfs without id`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[8])} for insertGfs with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = 'Error: invalid data[0].u8a'
    it(`should get ${JSON.stringify(vans[9])} for insertGfs with invalid u8a`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[10])} for delGfs`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = [{ n: 0, nDeleted: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[11])} for delGfs by id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }]
    it(`should get ${JSON.stringify(vans[12])} for delGfs without valid id`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = []
    it(`should get ${JSON.stringify(vans[13])} for delGfs with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = [
        { n: 1, nDeleted: 1, ok: 1 },
        { n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }
    ]
    it(`should get ${JSON.stringify(vans[14])} for delGfs with mixed valid and invalid id`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = ['n,nDeleted,ok', 'n,nDeleted,ok', 'err,n,nDeleted,ok']
    it(`should get ${JSON.stringify(vans[15])} for fixed key set of delGfs`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[16] = { n: 3, nDeleted: 3, ok: 1 }
    it(`should get ${JSON.stringify(vans[16])} for delAllGfs`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

    vans[17] = { files: 0, chunks: 0 }
    it(`should get ${JSON.stringify(vans[17])} for files and chunks after delAllGfs`, async function() {
        assert.strict.deepStrictEqual(vget[17], vans[17])
    })

    vans[18] = ['n,nInserted,ok', 'n,nInserted,ok']
    it(`should get ${JSON.stringify(vans[18])} for fixed key set of insertGfs`, async function() {
        assert.strict.deepStrictEqual(vget[18], vans[18])
    })

})


describe('gfs insert', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(300000)

        let cl = 'insertGfs'
        let wo = WOrm(genOpt(cl))
        await wo.delAllGfs()

        //全新3筆
        vget[1] = await wo.insertGfs([
            { id: 'i1', u8a: genU8a(100, 1) },
            { id: 'i2', u8a: genU8a(100, 2) },
            { id: 'i3', u8a: genU8a(100, 3) },
        ])
        let c1 = await countDocs(cl)

        //重複插入同3筆, 全數已存在故皆不插入, 且不得reject
        vget[2] = await wo.insertGfs([
            { id: 'i1', u8a: genU8a(100, 1) },
            { id: 'i2', u8a: genU8a(100, 2) },
            { id: 'i3', u8a: genU8a(100, 3) },
        ])

        //重複插入不得殘留孤兒chunks, 亦不得新增files
        let c2 = await countDocs(cl)
        vget[3] = { files: c2.files - c1.files, chunks: c2.chunks - c1.chunks }

        //已存在id不得被覆寫, 內容須為首次所給
        let vi1 = await wo.selectByPkGfs('i1')
        vget[4] = genHash(vi1.u8a) === genHash(genU8a(100, 1))

        //部份重複, 1筆已存在2筆為新
        vget[5] = await wo.insertGfs([
            { id: 'i2', u8a: genU8a(100, 2) },
            { id: 'i4', u8a: genU8a(100, 4) },
            { id: 'i5', u8a: genU8a(100, 5) },
        ])

        //同批含重複id, 僅首筆成功且保留首筆內容
        vget[6] = await wo.insertGfs([
            { id: 'i-dup', u8a: genU8a(100, 6) },
            { id: 'i-dup', u8a: genU8a(100, 7) },
            { id: 'i-uniq', u8a: genU8a(100, 8) },
        ])
        let vdup = await wo.selectByPkGfs('i-dup')
        vget[7] = genHash(vdup.u8a) === genHash(genU8a(100, 6))

        //併發對同一id插入10次, nInserted總和須為1
        let c3 = await countDocs(cl)
        let rs = await Promise.all(Array.from({ length: 10 }, (v, k) => {
            return wo.insertGfs({ id: 'i-race', u8a: genU8a(100, k) })
        }))
        vget[8] = rs.reduce((sum, v) => sum + v.nInserted, 0)
        vget[9] = rs.filter((v) => v.ok !== 1).length

        //併發後僅新增1筆files, 且失敗者不得殘留孤兒chunks
        let c4 = await countDocs(cl)
        vget[10] = { files: c4.files - c3.files, chunks: c4.chunks - c3.chunks }

        //最終筆數, 3+0+2+2+1=8
        vget[11] = (await countDocs(cl)).files

    })

    vans[1] = { n: 3, nInserted: 3, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insertGfs 3 new records`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { n: 3, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[2])} for insertGfs 3 existed records`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = { files: 0, chunks: 0 }
    it(`should get ${JSON.stringify(vans[3])} for no orphan chunks after insertGfs existed records`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = true
    it(`should get ${JSON.stringify(vans[4])} for not overwriting existed id`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = { n: 3, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[5])} for insertGfs 1 existed and 2 new records`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = { n: 3, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[6])} for insertGfs with duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = true
    it(`should get ${JSON.stringify(vans[7])} for keeping first one of duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = 1
    it(`should get ${JSON.stringify(vans[8])} for sum of nInserted by 10 concurrent insertGfs with same id`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = 0
    it(`should get ${JSON.stringify(vans[9])} for count of ok!==1 in 10 concurrent insertGfs`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = { files: 1, chunks: 1 }
    it(`should get ${JSON.stringify(vans[10])} for no orphan chunks after 10 concurrent insertGfs`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = 8
    it(`should get ${JSON.stringify(vans[11])} for files after all insertGfs`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

})


describe('gfs legacy duplicated id', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(300000)

        //既有數據尚存重複id之情境, 以驅動直接製造, 並於本資料表不呼叫insertGfs以免建立唯一索引
        let cl = 'legacyGfs'
        let wo = WOrm(genOpt(cl))
        await wo.delAllGfs()
        await uploadByDriver(cl, 'l-dup', genU8a(100, 1))
        await uploadByDriver(cl, 'l-dup', genU8a(100, 2))
        vget[1] = (await countDocs(cl)).files

        //delGfs須一併刪除並如實回報nDeleted
        vget[2] = await wo.delGfs({ id: 'l-dup' })
        vget[3] = await countDocs(cl)

    })

    vans[1] = 2
    it(`should get ${JSON.stringify(vans[1])} for files of legacy duplicated id`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = [{ n: 1, nDeleted: 2, ok: 1 }]
    it(`should get ${JSON.stringify(vans[2])} for delGfs with legacy duplicated id`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = { files: 0, chunks: 0 }
    it(`should get ${JSON.stringify(vans[3])} for files and chunks after delGfs with legacy duplicated id`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

})


describe('gfs autoGenPk', function() {
    let rt = null
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(300000)

        //woDef, 未給autoGenPk以驗證其預設值為true
        let clDef = 'pkdefaultGfs'
        let woDef = WOrm(genOpt(clDef))
        await woDef.delAllGfs()

        //預設未帶id者須自動產生
        vget[1] = await woDef.insertGfs({ u8a: genU8a(100, 1) })
        vget[2] = (await countDocs(clDef)).files

        //woOff, 關閉後主鍵須由呼叫端自備
        let clOff = 'pkoffGfs'
        let woOff = WOrm(genOptPk(clOff, false))
        await woOff.delAllGfs()

        //帶id者正常寫入
        vget[3] = await woOff.insertGfs({ id: 'g1', u8a: genU8a(100, 2) })
        vget[4] = genHash((await woOff.selectByPkGfs('g1')).u8a) === genHash(genU8a(100, 2))

        //未帶id者須reject
        rt = null
        // vans[5] = 'Error: invalid data[0].id, autoGenPk is false'
        await woOff.insertGfs({ u8a: genU8a(100, 3) })
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[5] = rt

        //整批reject時, 同批之有效筆數亦不得被寫入
        let cBefore = await countDocs(clOff)
        rt = null
        // vans[6] = 'Error: invalid data[1].id, autoGenPk is false'
        await woOff.insertGfs([
            { id: 'g-ok1', u8a: genU8a(100, 4) },
            { u8a: genU8a(100, 5) },
            { id: 'g-ok2', u8a: genU8a(100, 6) },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[6] = rt
        let cAfter = await countDocs(clOff)
        vget[7] = { files: cAfter.files - cBefore.files, chunks: cAfter.chunks - cBefore.chunks }
        vget[8] = [
            await woOff.selectByPkGfs('g-ok1'),
            await woOff.selectByPkGfs('g-ok2'),
        ]

        //delGfs不受autoGenPk影響, 未帶有效id仍為該筆ok為0而非reject
        vget[9] = await woOff.delGfs({ u8a: genU8a(10) })

        //輸入無效仍依T5回空結果
        vget[10] = await woOff.insertGfs(null)

    })

    vans[1] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insertGfs without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 1
    it(`should get ${JSON.stringify(vans[2])} for files after insertGfs without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[3])} for insertGfs with id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = true
    it(`should get ${JSON.stringify(vans[4])} for content after insertGfs with id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 'Error: invalid data[0].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[5])} for insertGfs without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 'Error: invalid data[1].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[6])} for insertGfs with 1 record without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = { files: 0, chunks: 0 }
    it(`should get ${JSON.stringify(vans[7])} for not writing valid records in rejected insertGfs batch`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = [null, null]
    it(`should get ${JSON.stringify(vans[8])} for records after rejected insertGfs batch`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }]
    it(`should get ${JSON.stringify(vans[9])} for delGfs without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[10])} for insertGfs with invalid data by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

})


describe('gfs change event', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(300000)

        let cl = 'evGfs'
        let wo = WOrm(genOpt(cl))
        await wo.delAllGfs()

        //訂閱函數拋錯不得影響本次操作之結果
        wo.on('change', function() {
            throw new Error('訂閱者拋錯')
        })

        vget[1] = await wo.insertGfs({ id: 'e1', u8a: genU8a(100, 1) })
        vget[2] = genHash((await wo.selectByPkGfs('e1')).u8a) === genHash(genU8a(100, 1))
        vget[3] = await wo.delGfs({ id: 'e1' })
        vget[4] = await wo.delAllGfs()

    })

    vans[1] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insertGfs with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = true
    it(`should get ${JSON.stringify(vans[2])} for content after insertGfs with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[3])} for delGfs with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = { n: 0, nDeleted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[4])} for delAllGfs with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

})

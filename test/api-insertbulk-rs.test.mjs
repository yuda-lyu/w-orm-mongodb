import assert from 'assert'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrlRs, startContainerRs, stopContainer } from './lib/api-setup.mjs'


//insertBulk之全有全無有兩條實作路徑, 依部署而異:
//具replica set或分片叢集者以交易包覆, standalone無交易可用而以補償動作達成
//本檔專測交易路徑, 故另起replica set容器; 補償路徑見api-basic.test.mjs之insertBulk


let ctName = 'worm-test-mongodb-rs'
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainerRs動態取得


//genOpt
let genOpt = (cl) => {
    return {
        url: genUrlRs(ctPort),
        db: ctDb,
        cl,
    }
}

//genKeys
let genKeys = (v) => {
    return Object.keys(v).sort().join(',')
}

//getHello, 直接由驅動取拓樸資訊, 用於確認本容器確為replica set
let getHello = async () => {
    let client = new mongodb.MongoClient(genUrlRs(ctPort))
    let hello = null
    try {
        hello = await client.db(ctDb).admin().command({ hello: 1 })
    }
    finally {
        await client.close()
    }
    return hello
}


before(async function() {
    this.timeout(600000) //含拉取映像、服務啟動與選舉
    ctPort = await startContainerRs(ctName)
})

after(async function() {
    this.timeout(120000)
    await stopContainer(ctName)
})


describe('insertBulk by transaction', function() {
    let rt = null
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(300000)

        //確認本容器確為replica set, 否則以下即非在測交易路徑
        //套件內判定交易可用與否之依據即為hello之setName與msg, 故此處成立即表示套件必走交易路徑
        let hello = await getHello()
        vget[1] = {
            isRs: typeof hello.setName === 'string' && hello.setName.length > 0,
            isWritablePrimary: hello.isWritablePrimary === true,
        }

        let cl = 'bulktx'
        let wo = WOrm(genOpt(cl))
        await wo.delAll()

        //全新3筆, nInserted須等於n
        vget[2] = await wo.insertBulk([
            { id: 't1', name: 'peter' },
            { id: 't2', name: 'rosemary' },
            { id: 't3', name: 'kettle' },
        ])
        vget[3] = (await wo.select()).length

        //撞既有主鍵須整批reject且回滾
        rt = null
        let nBefore = (await wo.select()).length
        await wo.insertBulk([
            { id: 't4', name: 'new1' },
            { id: 't2', name: 'dup' },
            { id: 't5', name: 'new2' },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[4] = rt.indexOf('E11000') >= 0 || rt.indexOf('duplicate key') >= 0

        //回滾後資料表不得有任何新增
        vget[5] = (await wo.select()).length - nBefore
        vget[6] = [
            await wo.selectByPk('t4'),
            await wo.selectByPk('t5'),
        ]

        //撞既有主鍵者本身不得被改動
        vget[7] = (await wo.selectByPk('t2')).name

        //同批含重複主鍵須整批reject且回滾
        rt = null
        nBefore = (await wo.select()).length
        await wo.insertBulk([
            { id: 't6', name: 'a' },
            { id: 't6', name: 'b' },
            { id: 't7', name: 'c' },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[8] = rt.indexOf('E11000') >= 0 || rt.indexOf('duplicate key') >= 0
        vget[9] = (await wo.select()).length - nBefore
        vget[10] = [
            await wo.selectByPk('t6'),
            await wo.selectByPk('t7'),
        ]

        //較大批次亦須全有全無, 用於驗證分批送出時之回滾
        rt = null
        await wo.delAll()
        let rs = Array.from({ length: 200 }, (v, k) => {
            return { id: `m${k}`, name: `n${k}` }
        })
        vget[11] = await wo.insertBulk(rs)
        vget[12] = (await wo.select()).length

        //末筆撞既有主鍵, 前199筆皆不得殘留
        rt = null
        await wo.delAll()
        await wo.insert({ id: 'm199', name: 'pre' })
        nBefore = (await wo.select()).length
        await wo.insertBulk(rs)
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[13] = rt.indexOf('E11000') >= 0 || rt.indexOf('duplicate key') >= 0
        vget[14] = (await wo.select()).length - nBefore

        //輸入無效與單一物件
        let woS = WOrm(genOpt('bulktxmisc'))
        await woS.delAll()
        vget[15] = await woS.insertBulk(null)
        vget[16] = await woS.insertBulk({ id: 's1', name: 'single' })
        vget[17] = [genKeys(vget[15]), genKeys(vget[16])]

        //事件
        let woEv = WOrm(genOpt('bulktxevent'))
        await woEv.delAll()
        let evs = []
        woEv.on('change', function(mode) {
            evs.push(`change:${mode}`)
        })
        woEv.on('error', function(mode) {
            evs.push(`error:${mode}`)
        })
        await woEv.insertBulk({ id: 'e1', name: 'a' })
        await woEv.insertBulk({ id: 'e1', name: 'b' }).catch(() => {})
        vget[18] = evs

        //其餘函數於replica set下行為須與standalone相同
        let woO = WOrm(genOpt('bulktxother'))
        await woO.delAll()
        vget[19] = await woO.insert([{ id: 'o1' }, { id: 'o1' }, { id: 'o2' }])
        vget[20] = await woO.save({ id: 'o1', name: 'x' })
        vget[21] = await woO.del({ id: 'o2' })

    })

    vans[1] = { isRs: true, isWritablePrimary: true }
    it(`should get ${JSON.stringify(vans[1])} for topology being replica set`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { n: 3, nInserted: 3, ok: 1 }
    it(`should get ${JSON.stringify(vans[2])} for insertBulk 3 new records`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = 3
    it(`should get ${JSON.stringify(vans[3])} for records after insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = true
    it(`should get ${JSON.stringify(vans[4])} for reject of insertBulk with existed id`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 0
    it(`should get ${JSON.stringify(vans[5])} for rollback after rejected insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = [null, null]
    it(`should get ${JSON.stringify(vans[6])} for not writing any record in rejected insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 'rosemary'
    it(`should get ${JSON.stringify(vans[7])} for not modifying existed record by rejected insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = true
    it(`should get ${JSON.stringify(vans[8])} for reject of insertBulk with duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = 0
    it(`should get ${JSON.stringify(vans[9])} for rollback after insertBulk with duplicated id`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = [null, null]
    it(`should get ${JSON.stringify(vans[10])} for not writing any record by duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = { n: 200, nInserted: 200, ok: 1 }
    it(`should get ${JSON.stringify(vans[11])} for insertBulk 200 records`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = 200
    it(`should get ${JSON.stringify(vans[12])} for records after insertBulk 200 records`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = true
    it(`should get ${JSON.stringify(vans[13])} for reject of insertBulk 200 records with last one conflicted`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = 0
    it(`should get ${JSON.stringify(vans[14])} for rollback of 200 records batch`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[15])} for insertBulk with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[16] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[16])} for insertBulk with single object`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

    vans[17] = ['n,nInserted,ok', 'n,nInserted,ok']
    it(`should get ${JSON.stringify(vans[17])} for fixed key set of insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[17], vans[17])
    })

    vans[18] = ['change:insertBulk', 'error:insertBulk']
    it(`should get ${JSON.stringify(vans[18])} for events of insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[18], vans[18])
    })

    vans[19] = { n: 3, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[19])} for insert on replica set`, async function() {
        assert.strict.deepStrictEqual(vget[19], vans[19])
    })

    vans[20] = [{ n: 1, nInserted: 0, nModified: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[20])} for save on replica set`, async function() {
        assert.strict.deepStrictEqual(vget[20], vans[20])
    })

    vans[21] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[21])} for del on replica set`, async function() {
        assert.strict.deepStrictEqual(vget[21], vans[21])
    })

})

import assert from 'assert'
import path from 'path'
import { spawn } from 'child_process'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


let ctName = 'worm-test-mongodb-basic'
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

//genKeys, 取回傳物件之鍵集合, 用於驗證鍵集合固定
let genKeys = (v) => {
    return Object.keys(v).sort().join(',')
}

//runProc, 另起行程操作同一資料表, 用於驗證跨行程之原子性
let runProc = (tag, cl, mode, ids) => {
    return new Promise(function(resolve) {
        let code = `
import { pathToFileURL } from 'url'
let { default: WOrm } = await import(pathToFileURL(process.env.SRC).href)
let wo = WOrm({ url: process.env.URL, db: process.env.DB, cl: process.env.CL })
let ids = JSON.parse(process.env.IDS)
let n = 0
for (let id of ids) {
    if (process.env.MODE === 'insert') {
        let r = await wo.insert({ id, from: process.env.TAG })
        n += r.nInserted
    }
    else {
        let r = await wo.save({ id: 'x1', [process.env.TAG + id]: 1 })
        n += r[0].ok
    }
}
console.log(JSON.stringify({ tag: process.env.TAG, n }))
`
        let out = ''
        let p = spawn(process.execPath, ['--input-type=module', '-e', code], {
            shell: false,
            env: {
                ...process.env,
                SRC: path.resolve('./src/WOrmMongodb.mjs'),
                URL: genUrl(ctPort),
                DB: ctDb,
                CL: cl,
                MODE: mode,
                IDS: JSON.stringify(ids),
                TAG: tag,
            },
        })
        p.stdout.on('data', function(d) {
            out += d.toString()
        })
        p.stderr.on('data', function(d) {
            out += d.toString()
        })
        p.on('close', function() {
            let r = null
            try {
                r = JSON.parse(out.trim())
            }
            catch (err) {
                r = { tag, error: out.trim() }
            }
            resolve(r)
        })
    })
}


before(async function() {
    this.timeout(600000) //含拉取映像與服務啟動
    ctPort = await startContainer(ctName)
})

after(async function() {
    this.timeout(120000)
    await stopContainer(ctName)
})


describe('basic', function() {
    let rt = null
    let vans = {}
    let vget = {}

    before(async function () {
        this.timeout(120000)

        let opt = genOpt('users')

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

        //wo
        let wo = WOrm(opt)

        //on
        wo.on('change', function(mode, data, res) {
            // console.log('change', mode)
        })

        //delAll
        rt = null
        // vans[1] = { n: 0, nDeleted: 0, ok: 1 }
        await wo.delAll()
            .then(function(msg) {
                // console.log('delAll then', msg)
                rt = msg
            })
            .catch(function(msg) {
                // console.log('delAll catch', msg)
                rt = msg.toString()
            })
        vget[1] = rt

        //insert
        rt = null
        // vans[2] = { n: 3, nInserted: 3, ok: 1 }
        await wo.insert(rs)
            .then(function(msg) {
                // console.log('insert then', msg)
                rt = msg
            })
            .catch(function(msg) {
                // console.log('insert catch', msg)
                rt = msg.toString()
            })
        vget[2] = rt

        //save, rsm末筆之id為空字串故會自動產生新id, 於資料表內不存在且未開啟autoInsert, 因此不寫入
        rt = null
        // vans[3] = [
        //     { n: 1, nInserted: 0, nModified: 1, ok: 1 },
        //     { n: 1, nInserted: 0, nModified: 1, ok: 1 },
        //     { n: 0, nInserted: 0, nModified: 0, ok: 1 }
        // ]
        await wo.save(rsm, { autoInsert: false })
            .then(function(msg) {
                // console.log('save then', msg)
                rt = msg
            })
            .catch(function(msg) {
                // console.log('save catch', msg)
                rt = msg.toString()
            })
        vget[3] = rt

        //save之逐筆結果鍵集合須固定
        // vans[16] = ['n,nInserted,nModified,ok', 'n,nInserted,nModified,ok', 'n,nInserted,nModified,ok']
        vget[16] = vget[3].map(genKeys)

        //select all
        rt = null
        // vans[4] = [
        //     { id: 'id-peter', name: 'peter(modify)', value: 123 },
        //     { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
        //     { name: 'kettle', value: 456 } //id為隨機產生故不比對
        // ]
        let ssAll = null
        await wo.select()
            .then(function(msg) {
                // console.log('select all then', msg)
                ssAll = msg
                rt = [
                    msg[0],
                    msg[1],
                    {
                        name: msg[2].name,
                        value: msg[2].value,
                    },
                ]
            })
            .catch(function(msg) {
                // console.log('select all catch', msg)
                rt = msg.toString()
            })
        vget[4] = rt

        //select
        rt = null
        // vans[5] = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]
        await wo.select({ id: 'id-rosemary' })
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[5] = rt

        //select by $and, $gt, $lt
        rt = null
        // vans[6] = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]
        await wo.select({ '$and': [{ value: { '$gt': 123 } }, { value: { '$lt': 200 } }] })
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[6] = rt

        //select by $or, $gte, $lte
        rt = null
        // vans[7] = [{ name: 'kettle', value: 456 }] //id為隨機產生故不比對
        await wo.select({ '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 200 } }] })
            .then(function(msg) {
                rt = [
                    {
                        name: msg[0].name,
                        value: msg[0].value,
                    },
                ]
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[7] = rt

        //select by $or, $and, $ne, $in, $nin
        rt = null
        // vans[8] = [
        //     { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
        //     { name: 'kettle', value: 456 } //id為隨機產生故不比對
        // ]
        await wo.select({ '$or': [{ '$and': [{ value: { '$ne': 123 } }, { value: { '$in': [123, 321, 123.456, 456] } }, { value: { '$nin': [456, 654] } }] }, { '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 400 } }] }] })
            .then(function(msg) {
                rt = [
                    msg[0],
                    {
                        name: msg[1].name,
                        value: msg[1].value,
                    },
                ]
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[8] = rt

        //select by regex, $options之合法flag僅有i、m、x、s, 給予無效flag時MongoDB會回MongoServerError
        rt = null
        // vans[9] = [{ id: 'id-peter', name: 'peter(modify)', value: 123 }]
        await wo.select({ name: { $regex: 'PeT', $options: 'i' } })
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[9] = rt

        //select無符合數據須回空陣列
        // vans[17] = []
        vget[17] = await wo.select({ name: 'not-existed' })

        //selectById, 由id直接查找單筆
        rt = null
        // vans[10] = { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }
        await wo.selectById('id-rosemary')
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[10] = rt

        //selectById, 與select(find)取得同一筆之內容須一致
        // vans[11] = true
        let sbi = await wo.selectById('id-peter')
        let sbf = await wo.select({ id: 'id-peter' })
        vget[11] = JSON.stringify(sbi) === JSON.stringify(sbf[0])

        //selectById by id not existed
        rt = null
        // vans[12] = null
        await wo.selectById('id-not-existed')
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[12] = rt

        //selectById by id invalid, 未給有效id視為查無數據
        // vans[13] = [null, null, null]
        vget[13] = [
            await wo.selectById(''),
            await wo.selectById(123),
            await wo.selectById(null),
        ]

        //del
        rt = null
        // vans[14] = [{ n: 1, nDeleted: 1, ok: 1 }]
        let d = ssAll.filter(function(v) {
            return v.name === 'kettle'
        })
        await wo.del(d)
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[14] = rt

        //selectById, 已刪除者須回傳null
        // vans[15] = null
        vget[15] = await wo.selectById(d[0].id)

    })

    vans[1] = { n: 0, nDeleted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for delAll`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { n: 3, nInserted: 3, ok: 1 }
    it(`should get ${JSON.stringify(vans[2])} for insert`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = [
        { n: 1, nInserted: 0, nModified: 1, ok: 1 },
        { n: 1, nInserted: 0, nModified: 1, ok: 1 },
        { n: 0, nInserted: 0, nModified: 0, ok: 1 }
    ]
    it(`should get ${JSON.stringify(vans[3])} for save(autoInsert=false)`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[16] = ['n,nInserted,nModified,ok', 'n,nInserted,nModified,ok', 'n,nInserted,nModified,ok']
    it(`should get ${JSON.stringify(vans[16])} for fixed key set of save`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

    vans[4] = [
        { id: 'id-peter', name: 'peter(modify)', value: 123 },
        { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
        { name: 'kettle', value: 456 }
    ]
    it(`should get ${JSON.stringify(vans[4])} for select all`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]
    it(`should get ${JSON.stringify(vans[5])} for select`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]
    it(`should get ${JSON.stringify(vans[6])} for select by $and, $gt, $lt`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = [{ name: 'kettle', value: 456 }]
    it(`should get ${JSON.stringify(vans[7])} for select by $or, $gte, $lte`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = [
        { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
        { name: 'kettle', value: 456 }
    ]
    it(`should get ${JSON.stringify(vans[8])} for select by $or, $and, $ne, $in, $nin`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = [{ id: 'id-peter', name: 'peter(modify)', value: 123 }]
    it(`should get ${JSON.stringify(vans[9])} for select by regex`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[17] = []
    it(`should get ${JSON.stringify(vans[17])} for select with no matched data`, async function() {
        assert.strict.deepStrictEqual(vget[17], vans[17])
    })

    vans[10] = { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }
    it(`should get ${JSON.stringify(vans[10])} for selectById`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = true
    it(`should get ${JSON.stringify(vans[11])} for same content between selectById and select`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = null
    it(`should get ${JSON.stringify(vans[12])} for selectById by id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = [null, null, null]
    it(`should get ${JSON.stringify(vans[13])} for selectById by id invalid`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[14])} for del`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = null
    it(`should get ${JSON.stringify(vans[15])} for selectById after del`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

})


//insert與save之併發測試, 因各操作皆各自new MongoClient另開連線, 原子性全由MongoDB提供,
//故同行程以Promise.all併發即等價於跨行程併發, 惟仍另以子行程實測以取得跨行程之依據


describe('insert', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //wo
        let wo = WOrm(genOpt('insertcnt'))
        await wo.delAll()

        //全新3筆
        vget[1] = await wo.insert([
            { id: 'i1', name: 'peter', value: 1 },
            { id: 'i2', name: 'rosemary', value: 2 },
            { id: 'i3', name: 'kettle', value: 3 },
        ])

        //重複插入同3筆, 全數已存在故皆不插入, 且不得reject
        vget[2] = await wo.insert([
            { id: 'i1', name: 'peter', value: 1 },
            { id: 'i2', name: 'rosemary', value: 2 },
            { id: 'i3', name: 'kettle', value: 3 },
        ])

        //部份重複, 1筆已存在2筆為新
        vget[3] = await wo.insert([
            { id: 'i2', name: 'rosemary', value: 2 },
            { id: 'i4', name: 'sandler', value: 4 },
            { id: 'i5', name: 'joyce', value: 5 },
        ])

        //同批含重複id, 僅首筆成功
        vget[4] = await wo.insert([
            { id: 'i-dup', name: 'dup-1', value: 6 },
            { id: 'i-dup', name: 'dup-2', value: 7 },
            { id: 'i-uniq', name: 'uniq', value: 8 },
        ])

        //併發對同一id插入10次, nInserted總和須為1
        let rs = await Promise.all(Array.from({ length: 10 }, (v, k) => {
            return wo.insert({ id: 'i-race', name: `race-${k}`, value: k })
        }))
        vget[5] = rs.reduce((sum, v) => sum + v.nInserted, 0)

        //併發皆不得報錯
        vget[6] = rs.filter((v) => v.ok !== 1).length

        //最終筆數, 3+0+2+2+1=8
        vget[7] = (await wo.select()).length

        //同批重複者僅首筆入庫
        vget[8] = (await wo.selectById('i-dup')).name

        //已存在id不得被insert覆寫
        vget[9] = await wo.selectById('i2')

        //併發後僅存單筆
        vget[10] = (await wo.select({ id: 'i-race' })).length

        //回傳鍵集合須固定
        vget[11] = [genKeys(vget[1]), genKeys(vget[2])]

        //輸入無效視為空結果
        vget[12] = await wo.insert(null)

    })

    vans[1] = { n: 3, nInserted: 3, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insert 3 new records`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { n: 3, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[2])} for insert 3 existed records`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = { n: 3, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[3])} for insert 1 existed and 2 new records`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = { n: 3, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[4])} for insert with duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 1
    it(`should get ${JSON.stringify(vans[5])} for sum of nInserted by 10 concurrent insert with same id`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 0
    it(`should get ${JSON.stringify(vans[6])} for count of ok!==1 in 10 concurrent insert`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 8
    it(`should get ${JSON.stringify(vans[7])} for records after all insert`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = 'dup-1'
    it(`should get ${JSON.stringify(vans[8])} for keeping first one of duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = { id: 'i2', name: 'rosemary', value: 2 }
    it(`should get ${JSON.stringify(vans[9])} for not overwriting existed id`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = 1
    it(`should get ${JSON.stringify(vans[10])} for records after 10 concurrent insert with same id`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = ['n,nInserted,ok', 'n,nInserted,ok']
    it(`should get ${JSON.stringify(vans[11])} for fixed key set of insert`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[12])} for insert with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

})


describe('save', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //wo
        let wo = WOrm(genOpt('saverace'))
        await wo.delAll()

        //併發save對既有id之不同欄位, 各欄位皆須保留
        await wo.insert({ id: 'u1', base: 1 })
        await Promise.all(Array.from({ length: 10 }, (v, k) => {
            return wo.save({ id: 'u1', [`f${k}`]: k })
        }))
        let vu1 = await wo.selectById('u1')
        vget[1] = Object.keys(vu1).filter((k) => k.indexOf('f') === 0).length
        vget[2] = vu1.base

        //併發save對全新id, autoInsert僅一次且不得報錯
        let rsn = await Promise.all(Array.from({ length: 5 }, (v, k) => {
            return wo.save({ id: 'w1', [`g${k}`]: k })
        }))
        vget[3] = rsn.filter((v) => v[0].nInserted === 1).length
        vget[4] = rsn.filter((v) => v[0].ok !== 1).length
        vget[5] = (await wo.select({ id: 'w1' })).length
        vget[6] = Object.keys(await wo.selectById('w1')).filter((k) => k.indexOf('g') === 0).length

        //save內容相同不更新, 由MongoDB於伺服器端比對合併後結果與現值
        await wo.insert({ id: 's1', name: 'same', value: 5 })
        vget[7] = await wo.save({ id: 's1', name: 'same', value: 5 })

        //save僅給既有數據之部份欄位且值相同, 合併後等於現值, 故亦不更新
        vget[16] = await wo.save({ id: 's1', name: 'same' })

        //save之巢狀物件與陣列內容相同亦不更新
        await wo.insert({ id: 's2', obj: { k: 1 }, arr: [1, 2] })
        vget[17] = await wo.save({ id: 's2', obj: { k: 1 }, arr: [1, 2] })
        vget[18] = await wo.save({ id: 's2', obj: { k: 2 }, arr: [1, 2] })

        //save內容不同須更新, 未給之欄位須保留
        await wo.insert({ id: 'd1', name: 'diff', value: 5 })
        vget[8] = await wo.save({ id: 'd1', value: 6 })
        vget[9] = await wo.selectById('d1')

        //save(autoInsert=false)對不存在之id不得插入
        vget[10] = await wo.save({ id: 'n1', name: 'none' }, { autoInsert: false })
        vget[11] = await wo.selectById('n1')

        //併發save(autoInsert=false)對既有id之不同欄位, 各欄位皆須保留且不得報錯
        await wo.insert({ id: 'p1', name: 'origin', value: 1 })
        let rsu = await Promise.all([
            wo.save({ id: 'p1', name: 'upd-name' }, { autoInsert: false }),
            wo.save({ id: 'p1', value: 88 }, { autoInsert: false }),
        ])
        vget[12] = rsu.filter((v) => v[0].ok !== 1).length
        vget[13] = await wo.selectById('p1')

        //change事件, autoInsert時仍須發出insert事件
        let woEv = WOrm(genOpt('saveevent'))
        await woEv.delAll()
        let modes = []
        woEv.on('change', function(mode) {
            modes.push(mode)
        })
        await woEv.save({ id: 'e1', name: 'new' }) //不存在, 走autoInsert
        vget[14] = [...modes]
        modes = []
        await woEv.save({ id: 'e1', name: 'modify' }) //已存在, 走更新
        vget[15] = [...modes]

        //輸入無效視為空結果
        vget[19] = await wo.save(null)

        //單一物件輸入亦須回傳長度為1之陣列
        vget[20] = (await wo.save({ id: 'u1', arrlen: 1 })).length

    })

    vans[1] = 10
    it(`should get ${JSON.stringify(vans[1])} for fields after 10 concurrent save with different field`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 1
    it(`should get ${JSON.stringify(vans[2])} for keeping original field after concurrent save`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = 1
    it(`should get ${JSON.stringify(vans[3])} for count of nInserted===1 in 5 concurrent save with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = 0
    it(`should get ${JSON.stringify(vans[4])} for count of ok!==1 in 5 concurrent save with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 1
    it(`should get ${JSON.stringify(vans[5])} for records after 5 concurrent save with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 5
    it(`should get ${JSON.stringify(vans[6])} for fields after 5 concurrent save with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = [{ n: 1, nInserted: 0, nModified: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[7])} for save with same content`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[16] = [{ n: 1, nInserted: 0, nModified: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[16])} for save with part of fields and same content`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

    vans[17] = [{ n: 1, nInserted: 0, nModified: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[17])} for save with same object and array`, async function() {
        assert.strict.deepStrictEqual(vget[17], vans[17])
    })

    vans[18] = [{ n: 1, nInserted: 0, nModified: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[18])} for save with different object`, async function() {
        assert.strict.deepStrictEqual(vget[18], vans[18])
    })

    vans[8] = [{ n: 1, nInserted: 0, nModified: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[8])} for save with different content`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = { id: 'd1', name: 'diff', value: 6 }
    it(`should get ${JSON.stringify(vans[9])} for keeping field not given in save`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = [{ n: 0, nInserted: 0, nModified: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[10])} for save(autoInsert=false) with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = null
    it(`should get ${JSON.stringify(vans[11])} for record after save(autoInsert=false) with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = 0
    it(`should get ${JSON.stringify(vans[12])} for count of ok!==1 in 2 concurrent save(autoInsert=false)`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = { id: 'p1', name: 'upd-name', value: 88 }
    it(`should get ${JSON.stringify(vans[13])} for fields after 2 concurrent save(autoInsert=false) with different field`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = ['insert', 'save']
    it(`should get ${JSON.stringify(vans[14])} for change events of save(autoInsert) with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = ['save']
    it(`should get ${JSON.stringify(vans[15])} for change events of save with id existed`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[19] = []
    it(`should get ${JSON.stringify(vans[19])} for save with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[19], vans[19])
    })

    vans[20] = 1
    it(`should get ${JSON.stringify(vans[20])} for length of save with single object`, async function() {
        assert.strict.deepStrictEqual(vget[20], vans[20])
    })

})


describe('save single failure', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //wo
        let wo = WOrm(genOpt('savefail'))
        await wo.delAll()

        //以$開頭欄位名令MongoDB拒絕該筆更新, 此錯誤僅影響該筆
        await wo.insert([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }])
        let rf = await wo.save([
            { id: 'f1', name: 'ok1' },
            { id: 'f2', $bad: 1 },
            { id: 'f3', name: 'ok3' },
        ])

        //整批仍resolve且長度與輸入相同
        vget[1] = rf.length

        //各筆之ok
        vget[2] = rf.map((v) => v.ok)

        //失敗筆須附err字串
        vget[3] = typeof rf[1].err === 'string' && rf[1].err.length > 0

        //失敗筆之鍵集合, err僅於ok為0時出現
        vget[4] = genKeys(rf[1])
        vget[5] = genKeys(rf[0])

        //失敗筆之計數欄位
        vget[6] = {
            n: rf[1].n,
            nInserted: rf[1].nInserted,
            nModified: rf[1].nModified,
        }

        //單筆失敗不得中斷整批, 後續筆仍須寫入
        vget[7] = (await wo.selectById('f3')).name

        //失敗筆不得被寫入
        vget[8] = await wo.selectById('f2')

    })

    vans[1] = 3
    it(`should get ${JSON.stringify(vans[1])} for length of save with 1 failed record`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = [1, 0, 1]
    it(`should get ${JSON.stringify(vans[2])} for ok of each record`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = true
    it(`should get ${JSON.stringify(vans[3])} for err of failed record`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = 'err,n,nInserted,nModified,ok'
    it(`should get ${JSON.stringify(vans[4])} for key set of failed record`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 'n,nInserted,nModified,ok'
    it(`should get ${JSON.stringify(vans[5])} for key set of succeeded record`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = { n: 1, nInserted: 0, nModified: 0 }
    it(`should get ${JSON.stringify(vans[6])} for counts of failed record`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 'ok3'
    it(`should get ${JSON.stringify(vans[7])} for not breaking batch by single failure`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = { id: 'f2' }
    it(`should get ${JSON.stringify(vans[8])} for not writing failed record`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

})


describe('del', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //wo
        let wo = WOrm(genOpt('delcase'))
        await wo.delAll()

        await wo.insert([{ id: 'k1', name: 'a' }, { id: 'k2', name: 'b' }])

        //id為null之數據, 用於驗證未帶有效id者不得誤中
        await wo.insert({ id: 'k-null-guard', name: 'guard' })

        //命中並刪除
        vget[1] = await wo.del({ id: 'k1' })

        //未命中屬正常結果
        vget[2] = await wo.del({ id: 'k-not-existed' })

        //未帶有效id, 不得送查詢條件, 須以ok為0回報
        vget[3] = await wo.del({ name: '完全沒給id' })
        vget[4] = genKeys(vget[3][0])
        vget[5] = typeof vget[3][0].err === 'string' && vget[3][0].err.length > 0

        //id為空字串亦視為未帶有效id
        vget[6] = await wo.del({ id: '' })

        //未帶有效id者不得刪到任何數據
        vget[7] = (await wo.select()).length

        //混合輸入, 有效與無效並存時須逐筆回報且長度相同
        vget[8] = await wo.del([{ id: 'k2' }, { name: 'no-id' }])

        //輸入無效視為空結果
        vget[9] = await wo.del(null)

        //成功筆之鍵集合
        vget[10] = genKeys(vget[1][0])

        //該筆執行失敗, 以超過BSON上限(16mb)之id令驅動拒絕該筆刪除, 此錯誤僅影響該筆
        await wo.insert({ id: 'k3', name: 'c' })
        let rbig = await wo.del([
            { id: 'x'.repeat(17 * 1024 * 1024) },
            { id: 'k3' },
        ])
        vget[11] = rbig.length
        vget[12] = rbig.map((v) => v.ok)
        vget[13] = {
            n: rbig[0].n,
            nDeleted: rbig[0].nDeleted,
        }
        vget[14] = genKeys(rbig[0])
        vget[15] = typeof rbig[0].err === 'string' && rbig[0].err.length > 0

        //單筆失敗不得中斷整批, 後續筆仍須刪除
        vget[16] = await wo.selectById('k3')

    })

    vans[1] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[1])} for del with id matched`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = [{ n: 0, nDeleted: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[2])} for del with id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }]
    it(`should get ${JSON.stringify(vans[3])} for del without valid id`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = 'err,n,nDeleted,ok'
    it(`should get ${JSON.stringify(vans[4])} for key set of del without valid id`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = true
    it(`should get ${JSON.stringify(vans[5])} for err of del without valid id`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id[]' }]
    it(`should get ${JSON.stringify(vans[6])} for del with empty id`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 2
    it(`should get ${JSON.stringify(vans[7])} for not deleting anything by invalid id`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = [
        { n: 1, nDeleted: 1, ok: 1 },
        { n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }
    ]
    it(`should get ${JSON.stringify(vans[8])} for del with mixed valid and invalid id`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = []
    it(`should get ${JSON.stringify(vans[9])} for del with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = 'n,nDeleted,ok'
    it(`should get ${JSON.stringify(vans[10])} for key set of del succeeded`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = 2
    it(`should get ${JSON.stringify(vans[11])} for length of del with 1 failed record`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = [0, 1]
    it(`should get ${JSON.stringify(vans[12])} for ok of each record in del`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = { n: 1, nDeleted: 0 }
    it(`should get ${JSON.stringify(vans[13])} for counts of failed record in del`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = 'err,n,nDeleted,ok'
    it(`should get ${JSON.stringify(vans[14])} for key set of failed record in del`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = true
    it(`should get ${JSON.stringify(vans[15])} for err of failed record in del`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[16] = null
    it(`should get ${JSON.stringify(vans[16])} for not breaking batch by single failure in del`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

})


describe('delAll', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //wo
        let wo = WOrm(genOpt('delallcase'))
        await wo.delAll()

        await wo.insert([
            { id: 'a1', name: 'peter' },
            { id: 'a2', name: 'rosemary' },
            { id: 'a3', name: 'peter' },
            { id: 'a4', name: 'kettle' },
        ])

        //帶條件且僅部份命中
        vget[1] = await wo.delAll({ name: 'peter' })
        vget[2] = (await wo.select()).length

        //帶條件且無命中屬正常結果
        vget[3] = await wo.delAll({ name: 'not-existed' })

        //未帶條件則刪除全部
        vget[4] = await wo.delAll()
        vget[5] = (await wo.select()).length

        //鍵集合須固定
        vget[6] = [genKeys(vget[1]), genKeys(vget[3])]

    })

    vans[1] = { n: 2, nDeleted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for delAll with find matched partially`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 2
    it(`should get ${JSON.stringify(vans[2])} for records after delAll with find`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = { n: 0, nDeleted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[3])} for delAll with find not matched`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = { n: 2, nDeleted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[4])} for delAll without find`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 0
    it(`should get ${JSON.stringify(vans[5])} for records after delAll without find`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = ['n,nDeleted,ok', 'n,nDeleted,ok']
    it(`should get ${JSON.stringify(vans[6])} for fixed key set of delAll`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

})


describe('change event', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //wo
        let wo = WOrm(genOpt('evthrow'))
        await wo.delAll()

        //訂閱函數拋錯不得影響本次操作之結果
        wo.on('change', function() {
            throw new Error('訂閱者拋錯')
        })

        vget[1] = await wo.insert({ id: 'e1', name: 'a' })
        vget[2] = await wo.selectById('e1')
        vget[3] = await wo.save({ id: 'e1', name: 'b' })
        vget[4] = await wo.del({ id: 'e1' })
        vget[5] = await wo.delAll()

    })

    vans[1] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insert with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { id: 'e1', name: 'a' }
    it(`should get ${JSON.stringify(vans[2])} for record after insert with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = [{ n: 1, nInserted: 0, nModified: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[3])} for save with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[4])} for del with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = { n: 0, nDeleted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[5])} for delAll with throwing listener`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

})


describe('cross process concurrency', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(300000)

        //跨行程併發insert同20個id, nInserted總和須為20且資料表僅20筆
        let clIns = 'xprocins'
        let woIns = WOrm(genOpt(clIns))
        await woIns.delAll()
        let ids = Array.from({ length: 20 }, (v, k) => `x${k}`)
        let rps = await Promise.all([
            runProc('P1', clIns, 'insert', ids),
            runProc('P2', clIns, 'insert', ids),
        ])
        // console.log('跨行程insert結果', rps)
        vget[1] = rps.reduce((sum, v) => sum + (v.n || 0), 0)
        vget[2] = (await woIns.select()).length
        vget[3] = rps.filter((v) => v.error).map((v) => v.error)

        //跨行程併發save對同一既有id之不同欄位, 各欄位皆須保留
        let clSav = 'xprocsav'
        let woSav = WOrm(genOpt(clSav))
        await woSav.delAll()
        await woSav.insert({ id: 'x1', base: 1 })
        let keys = Array.from({ length: 20 }, (v, k) => `k${k}`)
        await Promise.all([
            runProc('P1', clSav, 'save', keys),
            runProc('P2', clSav, 'save', keys),
        ])
        let vx1 = await woSav.selectById('x1')
        vget[4] = Object.keys(vx1).filter((k) => k.indexOf('P1k') === 0 || k.indexOf('P2k') === 0).length
        vget[5] = vx1.base
        vget[6] = (await woSav.select()).length

    })

    vans[3] = []
    it(`should get no error for 2 processes inserting same ids`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[1] = 20
    it(`should get ${JSON.stringify(vans[1])} for sum of nInserted by 2 processes inserting same 20 ids`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 20
    it(`should get ${JSON.stringify(vans[2])} for records after 2 processes inserting same 20 ids`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[4] = 40
    it(`should get ${JSON.stringify(vans[4])} for fields after 2 processes saving different fields`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 1
    it(`should get ${JSON.stringify(vans[5])} for keeping original field after cross process save`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 1
    it(`should get ${JSON.stringify(vans[6])} for records after cross process save`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

})

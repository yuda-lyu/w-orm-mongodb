import assert from 'assert'
import path from 'path'
import { spawn } from 'child_process'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'


let ctName = 'worm-test-mongodb-basic'
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainer動態取得


//genOpt, 不帶autoGenPk以驗證其預設值
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

        //selectByPk, 由id直接查找單筆
        rt = null
        // vans[10] = { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }
        await wo.selectByPk('id-rosemary')
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[10] = rt

        //selectByPk, 與select(find)取得同一筆之內容須一致
        // vans[11] = true
        let sbi = await wo.selectByPk('id-peter')
        let sbf = await wo.select({ id: 'id-peter' })
        vget[11] = JSON.stringify(sbi) === JSON.stringify(sbf[0])

        //selectByPk by id not existed
        rt = null
        // vans[12] = null
        await wo.selectByPk('id-not-existed')
            .then(function(msg) {
                rt = msg
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[12] = rt

        //selectByPk by id invalid, 未給有效id視為查無數據
        // vans[13] = [null, null, null]
        vget[13] = [
            await wo.selectByPk(''),
            await wo.selectByPk(123),
            await wo.selectByPk(null),
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

        //selectByPk, 已刪除者須回傳null
        // vans[15] = null
        vget[15] = await wo.selectByPk(d[0].id)

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
    it(`should get ${JSON.stringify(vans[10])} for selectByPk`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = true
    it(`should get ${JSON.stringify(vans[11])} for same content between selectByPk and select`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = null
    it(`should get ${JSON.stringify(vans[12])} for selectByPk by id not existed`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = [null, null, null]
    it(`should get ${JSON.stringify(vans[13])} for selectByPk by id invalid`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = [{ n: 1, nDeleted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[14])} for del`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = null
    it(`should get ${JSON.stringify(vans[15])} for selectByPk after del`, async function() {
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
        vget[8] = (await wo.selectByPk('i-dup')).name

        //已存在id不得被insert覆寫
        vget[9] = await wo.selectByPk('i2')

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


describe('insert returnList', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        let cl = 'inslist'
        let wo = WOrm(genOpt(cl))
        await wo.delAll()

        //預設不給option時之形狀須為單一聚合物件
        vget[1] = await wo.insert([{ id: 'r1' }, { id: 'r2' }])

        //明確給false時形狀同預設
        vget[2] = await wo.insert({ id: 'r3' }, { returnList: false })

        //開啟後須回與輸入等長且保序之陣列, 全新者nInserted皆為1
        vget[3] = await wo.insert([{ id: 'r4' }, { id: 'r5' }, { id: 'r6' }], { returnList: true })

        //對位正確: 中間那筆已存在, 僅該位置之nInserted為0
        vget[4] = await wo.insert([
            { id: 'r7' },
            { id: 'r5' }, //已存在
            { id: 'r8' },
        ], { returnList: true })

        //同批含重複主鍵, 僅首筆之nInserted為1
        vget[5] = await wo.insert([
            { id: 'r9' },
            { id: 'r9' },
            { id: 'r9' },
        ], { returnList: true })

        //不變式: filter計數須等於聚合模式之nInserted
        await wo.delAll()
        let rsIn = [
            { id: 's1' },
            { id: 's2' },
            { id: 's3' },
            { id: 's4' },
        ]
        await wo.insert([{ id: 's2' }, { id: 's4' }]) //先寫入其中2筆
        let rl = await wo.insert(rsIn, { returnList: true })
        await wo.delAll()
        await wo.insert([{ id: 's2' }, { id: 's4' }])
        let rg = await wo.insert(rsIn)
        vget[6] = rl.filter((v) => v.nInserted === 1).length
        vget[7] = rg.nInserted
        vget[8] = vget[6] === vget[7]

        //逐筆元素之鍵集合須恰為n,nInserted,ok
        vget[9] = rl.map(genKeys)

        //輸入無效時開啟者回空陣列, 未開啟者回聚合物件
        vget[10] = await wo.insert(null, { returnList: true })
        vget[11] = await wo.insert(null)

        //單一物件輸入亦須回長度為1之陣列
        await wo.delAll()
        vget[12] = await wo.insert({ id: 't1' }, { returnList: true })

        //全數已存在時, 各元素之nInserted皆為0且不得reject
        vget[13] = await wo.insert({ id: 't1' }, { returnList: true })

        //change事件之res即本次實際回傳值
        let woEv = WOrm(genOpt('inslistev'))
        await woEv.delAll()
        let resEv = null
        woEv.on('change', function(mode, data, res) {
            resEv = res
        })
        let rEv = await woEv.insert([{ id: 'v1' }, { id: 'v2' }], { returnList: true })
        vget[14] = JSON.stringify(resEv) === JSON.stringify(rEv)

        //autoGenPk為false且未帶id者仍為整批reject, 不因returnList而降為逐筆
        let woOff = WOrm(genOptPk('inslistpkoff', false))
        await woOff.delAll()
        let rtOff = null
        await woOff.insert([{ id: 'w1' }, { name: 'no-id' }], { returnList: true })
            .then(function(msg) {
                rtOff = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rtOff = msg.toString()
            })
        vget[15] = rtOff
        vget[16] = await woOff.selectByPk('w1')

    })

    vans[1] = { n: 2, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insert without option`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[2])} for insert with returnList=false`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = [
        { n: 1, nInserted: 1, ok: 1 },
        { n: 1, nInserted: 1, ok: 1 },
        { n: 1, nInserted: 1, ok: 1 }
    ]
    it(`should get ${JSON.stringify(vans[3])} for insert with returnList=true`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = [
        { n: 1, nInserted: 1, ok: 1 },
        { n: 1, nInserted: 0, ok: 1 },
        { n: 1, nInserted: 1, ok: 1 }
    ]
    it(`should get ${JSON.stringify(vans[4])} for keeping order and position in returnList`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = [
        { n: 1, nInserted: 1, ok: 1 },
        { n: 1, nInserted: 0, ok: 1 },
        { n: 1, nInserted: 0, ok: 1 }
    ]
    it(`should get ${JSON.stringify(vans[5])} for only first one inserted by duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 2
    it(`should get ${JSON.stringify(vans[6])} for count of nInserted===1 in returnList`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 2
    it(`should get ${JSON.stringify(vans[7])} for nInserted in aggregated mode`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = true
    it(`should get ${JSON.stringify(vans[8])} for same count between returnList and aggregated mode`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = ['n,nInserted,ok', 'n,nInserted,ok', 'n,nInserted,ok', 'n,nInserted,ok']
    it(`should get ${JSON.stringify(vans[9])} for key set of returnList element`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = []
    it(`should get ${JSON.stringify(vans[10])} for invalid data with returnList=true`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[11])} for invalid data with returnList=false`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = [{ n: 1, nInserted: 1, ok: 1 }]
    it(`should get ${JSON.stringify(vans[12])} for single object with returnList=true`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = [{ n: 1, nInserted: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[13])} for all existed with returnList=true`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = true
    it(`should get ${JSON.stringify(vans[14])} for res of change event being actual return value`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = 'Error: invalid data[1].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[15])} for autoGenPk=false with returnList=true`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[16] = null
    it(`should get ${JSON.stringify(vans[16])} for not writing valid records in rejected returnList batch`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

})


//insertBulk之語義與insert不同: insert跳過已存在者而整批ok為1, insertBulk則整批reject且不寫入任何一筆
//本檔之容器為standalone, 無交易可用, 故走補償動作路徑; 交易路徑另見api-insertbulk-rs.test.mjs


describe('insertBulk', function() {
    let rt = null
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        let cl = 'bulkcnt'
        let wo = WOrm(genOpt(cl))
        await wo.delAll()

        //全新3筆, nInserted須等於n
        vget[1] = await wo.insertBulk([
            { id: 'b1', name: 'peter' },
            { id: 'b2', name: 'rosemary' },
            { id: 'b3', name: 'kettle' },
        ])
        vget[2] = (await wo.select()).length

        //撞既有主鍵須整批reject
        rt = null
        let nBefore = (await wo.select()).length
        await wo.insertBulk([
            { id: 'b4', name: 'new1' },
            { id: 'b2', name: 'dup' },
            { id: 'b5', name: 'new2' },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[3] = rt.indexOf('E11000') >= 0 || rt.indexOf('duplicate key') >= 0

        //失敗後資料表不得有任何新增
        vget[4] = (await wo.select()).length - nBefore
        vget[5] = [
            await wo.selectByPk('b4'),
            await wo.selectByPk('b5'),
        ]

        //撞既有主鍵者本身不得被改動
        vget[6] = (await wo.selectByPk('b2')).name

        //同批含重複主鍵須整批reject
        rt = null
        nBefore = (await wo.select()).length
        await wo.insertBulk([
            { id: 'b6', name: 'a' },
            { id: 'b6', name: 'b' },
            { id: 'b7', name: 'c' },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[7] = rt.indexOf('E11000') >= 0 || rt.indexOf('duplicate key') >= 0
        vget[8] = (await wo.select()).length - nBefore
        vget[9] = [
            await wo.selectByPk('b6'),
            await wo.selectByPk('b7'),
        ]

        //單一物件輸入亦須可用
        vget[10] = await wo.insertBulk({ id: 'b8', name: 'single' })

        //輸入無效視為空結果
        vget[11] = await wo.insertBulk(null)

        //鍵集合須與insert完全相同
        let ri = await wo.insert({ id: 'b9', name: 'x' })
        vget[12] = [genKeys(vget[1]), genKeys(vget[10]), genKeys(vget[11]), genKeys(ri)]

        //autoGenPk預設為true, 未帶id者自動產生
        vget[13] = await wo.insertBulk([{ name: 'nopk1' }, { name: 'nopk2' }])

        //autoGenPk為false且未帶id者須reject, 且同批之有效筆數不得被寫入
        let woOff = WOrm(genOptPk('bulkpkoff', false))
        await woOff.delAll()
        rt = null
        await woOff.insertBulk([
            { id: 'p-ok1', name: 'ok1' },
            { name: 'no-id' },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[14] = rt
        vget[15] = await woOff.selectByPk('p-ok1')

        //事件, 成功時發change, 失敗時發error且mode為insertBulk
        let woEv = WOrm(genOpt('bulkevent'))
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
        vget[16] = evs

    })

    vans[1] = { n: 3, nInserted: 3, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insertBulk 3 new records`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 3
    it(`should get ${JSON.stringify(vans[2])} for records after insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = true
    it(`should get ${JSON.stringify(vans[3])} for reject of insertBulk with existed id`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = 0
    it(`should get ${JSON.stringify(vans[4])} for no record added after rejected insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = [null, null]
    it(`should get ${JSON.stringify(vans[5])} for not writing any record in rejected insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 'rosemary'
    it(`should get ${JSON.stringify(vans[6])} for not modifying existed record by rejected insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = true
    it(`should get ${JSON.stringify(vans[7])} for reject of insertBulk with duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = 0
    it(`should get ${JSON.stringify(vans[8])} for no record added after insertBulk with duplicated id`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = [null, null]
    it(`should get ${JSON.stringify(vans[9])} for not writing any record by duplicated id in same batch`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[10])} for insertBulk with single object`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[11])} for insertBulk with invalid data`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = ['n,nInserted,ok', 'n,nInserted,ok', 'n,nInserted,ok', 'n,nInserted,ok']
    it(`should get ${JSON.stringify(vans[12])} for same key set between insertBulk and insert`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = { n: 2, nInserted: 2, ok: 1 }
    it(`should get ${JSON.stringify(vans[13])} for insertBulk without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = 'Error: invalid data[1].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[14])} for insertBulk without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = null
    it(`should get ${JSON.stringify(vans[15])} for not writing valid records in rejected insertBulk by autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[16] = ['change:insertBulk', 'error:insertBulk']
    it(`should get ${JSON.stringify(vans[16])} for events of insertBulk`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
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
        let vu1 = await wo.selectByPk('u1')
        vget[1] = Object.keys(vu1).filter((k) => k.indexOf('f') === 0).length
        vget[2] = vu1.base

        //併發save對全新id, autoInsert僅一次且不得報錯
        let rsn = await Promise.all(Array.from({ length: 5 }, (v, k) => {
            return wo.save({ id: 'w1', [`g${k}`]: k })
        }))
        vget[3] = rsn.filter((v) => v[0].nInserted === 1).length
        vget[4] = rsn.filter((v) => v[0].ok !== 1).length
        vget[5] = (await wo.select({ id: 'w1' })).length
        vget[6] = Object.keys(await wo.selectByPk('w1')).filter((k) => k.indexOf('g') === 0).length

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
        vget[9] = await wo.selectByPk('d1')

        //save(autoInsert=false)對不存在之id不得插入
        vget[10] = await wo.save({ id: 'n1', name: 'none' }, { autoInsert: false })
        vget[11] = await wo.selectByPk('n1')

        //併發save(autoInsert=false)對既有id之不同欄位, 各欄位皆須保留且不得報錯
        await wo.insert({ id: 'p1', name: 'origin', value: 1 })
        let rsu = await Promise.all([
            wo.save({ id: 'p1', name: 'upd-name' }, { autoInsert: false }),
            wo.save({ id: 'p1', value: 88 }, { autoInsert: false }),
        ])
        vget[12] = rsu.filter((v) => v[0].ok !== 1).length
        vget[13] = await wo.selectByPk('p1')

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
        vget[7] = (await wo.selectByPk('f3')).name

        //失敗筆不得被寫入
        vget[8] = await wo.selectByPk('f2')

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
        vget[16] = await wo.selectByPk('k3')

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


describe('error event', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //collect, 收集事件
        let collect = (wo) => {
            let evs = []
            wo.on('error', function(mode, data, err) {
                evs.push({ mode, data, err })
            })
            return evs
        }

        //整批性錯誤須於reject前發出, 且err與reject訊息一致
        let woB = WOrm(genOptPk('everrbatch', false))
        await woB.delAll()
        let evsB = collect(woB)
        let msgB = null
        await woB.insert({ name: 'no-id' }).catch((err) => {
            msgB = err.toString()
        })
        vget[1] = evsB.length
        vget[2] = evsB[0].mode
        vget[3] = typeof evsB[0].err
        vget[4] = msgB.indexOf(evsB[0].err) >= 0

        //save之整批性錯誤
        evsB.length = 0
        await woB.save({ name: 'no-id' }).catch(() => {})
        vget[5] = evsB.map((v) => v.mode)

        //逐筆失敗須於該筆定案後發出, 每筆一次, err與該筆err欄位一致
        let woS = WOrm(genOpt('everrsave'))
        await woS.delAll()
        await woS.insert([{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }])
        let evsS = collect(woS)
        let rs = await woS.save([
            { id: 'f1', name: 'ok1' },
            { id: 'f2', $bad: 1 },
            { id: 'f3', name: 'ok3' },
        ])
        vget[6] = evsS.length
        vget[7] = evsS[0].mode
        vget[8] = evsS[0].err === rs[1].err

        //del之逐筆失敗, 未帶有效id者亦須發出
        let woD = WOrm(genOpt('everrdel'))
        await woD.delAll()
        await woD.insert({ id: 'd1' })
        let evsD = collect(woD)
        let rd = await woD.del([{ id: 'd1' }, { name: 'no-id' }])
        vget[9] = evsD.length
        vget[10] = evsD[0].mode
        vget[11] = evsD[0].err === rd[1].err

        //正常結果不得發出error
        let woN = WOrm(genOpt('everrnormal'))
        await woN.delAll()
        let evsN = collect(woN)
        await woN.insert({ id: 'n1', name: 'a' })
        await woN.insert({ id: 'n1', name: 'a' }) //全數已存在
        await woN.save({ id: 'n1', name: 'a' }) //合併後內容相同
        await woN.del({ id: 'n-not-existed' }) //主鍵未命中
        await woN.delAll({ name: 'not-existed' }) //條件無命中
        await woN.selectByPk('n-not-existed') //查無數據
        await woN.selectByPk('') //主鍵值無效
        await woN.select({ name: 'not-existed' }) //無符合數據
        vget[12] = evsN.length

        //同批既有逐筆失敗又整批resolve時, 逐筆error先於整批change
        let woO = WOrm(genOpt('everrorder'))
        await woO.delAll()
        await woO.insert([{ id: 'o1' }, { id: 'o2' }])
        let seq = []
        woO.on('error', function(mode) {
            seq.push(`error:${mode}`)
        })
        woO.on('change', function(mode) {
            seq.push(`change:${mode}`)
        })
        await woO.save([{ id: 'o1', name: 'ok' }, { id: 'o2', $bad: 1 }])
        vget[13] = seq

        //訂閱函數拋錯不得影響本次操作之結果
        let woT = WOrm(genOpt('everrthrow'))
        await woT.delAll()
        woT.on('error', function() {
            throw new Error('訂閱者拋錯')
        })
        await woT.insert({ id: 't1' })
        vget[14] = await woT.del([{ id: 't1' }, { name: 'no-id' }])

    })

    vans[1] = 1
    it(`should get ${JSON.stringify(vans[1])} for count of error event in batch error`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 'insert'
    it(`should get ${JSON.stringify(vans[2])} for mode of error event in batch error`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = 'string'
    it(`should get ${JSON.stringify(vans[3])} for type of err in error event`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = true
    it(`should get ${JSON.stringify(vans[4])} for same err between error event and reject`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = ['save']
    it(`should get ${JSON.stringify(vans[5])} for mode of error event in save batch error`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = 1
    it(`should get ${JSON.stringify(vans[6])} for count of error event in save single failure`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 'save'
    it(`should get ${JSON.stringify(vans[7])} for mode of error event in save single failure`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = true
    it(`should get ${JSON.stringify(vans[8])} for same err between error event and result of save`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = 1
    it(`should get ${JSON.stringify(vans[9])} for count of error event in del single failure`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = 'del'
    it(`should get ${JSON.stringify(vans[10])} for mode of error event in del single failure`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = true
    it(`should get ${JSON.stringify(vans[11])} for same err between error event and result of del`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = 0
    it(`should get ${JSON.stringify(vans[12])} for count of error event in normal results`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = ['error:save', 'change:save']
    it(`should get ${JSON.stringify(vans[13])} for order of error and change`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = [
        { n: 1, nDeleted: 1, ok: 1 },
        { n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }
    ]
    it(`should get ${JSON.stringify(vans[14])} for result with throwing error listener`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

})


describe('error listener does not change behavior', function() {
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //run, 以同一組操作跑兩次, 差別僅在有無註冊error監聽
        //T10.1第2條: 操作行為不得因監聽者之有無而改變
        let run = async (cl, withListener) => {
            let wo = WOrm(genOpt(cl))
            if (withListener) {
                wo.on('error', function() {})
            }
            await wo.delAll()

            let out = []

            //整批性錯誤
            let woOff = WOrm(genOptPk(`${cl}off`, false))
            if (withListener) {
                woOff.on('error', function() {})
            }
            await woOff.delAll()
            await woOff.insert({ name: 'no-id' })
                .then((r) => out.push({ t: 'resolve', r }))
                .catch((e) => out.push({ t: 'reject', e: e.toString() }))

            //逐筆失敗
            await wo.insert([{ id: 'a1' }, { id: 'a2' }])
            let rs = await wo.save([{ id: 'a1', name: 'ok' }, { id: 'a2', $bad: 1 }])
            out.push({ t: 'save', ok: rs.map((v) => v.ok), n: rs.map((v) => v.n) })

            //del逐筆失敗
            let rd = await wo.del([{ id: 'a1' }, { name: 'no-id' }])
            out.push({ t: 'del', r: rd })

            //讀取函數之整批性錯誤
            await wo.selectByPk('not-existed')
                .then((r) => out.push({ t: 'selectByPk', r }))
                .catch((e) => out.push({ t: 'selectByPkReject', e: e.toString() }))

            return out
        }

        let a = await run('evnolisten', false)
        let b = await run('evlisten', true)

        vget[1] = JSON.stringify(a) === JSON.stringify(b)
        vget[2] = a[0].t
        vget[3] = a[1].ok

    })

    vans[1] = true
    it(`should get ${JSON.stringify(vans[1])} for same result with and without error listener`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 'reject'
    it(`should get ${JSON.stringify(vans[2])} for reject without error listener`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = [1, 0]
    it(`should get ${JSON.stringify(vans[3])} for ok of save without error listener`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
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
        vget[2] = await wo.selectByPk('e1')
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


describe('autoGenPk', function() {
    let rt = null
    let vans = {}
    let vget = {}

    before(async function() {
        this.timeout(120000)

        //woDef, 未給autoGenPk以驗證其預設值為true
        let woDef = WOrm(genOpt('pkdefault'))
        await woDef.delAll()

        //預設未帶id者須自動產生, 且產生之id須為有效字串
        vget[1] = await woDef.insert({ name: 'no-id' })
        let ssDef = await woDef.select()
        vget[2] = ssDef.length
        vget[3] = typeof ssDef[0].id === 'string' && ssDef[0].id.length > 0

        //預設之save未帶id者亦須自動產生
        vget[4] = await woDef.save({ name: 'no-id-save' })
        vget[5] = (await woDef.select()).length

        //woOn, 明確開啟
        let woOn = WOrm(genOptPk('pkon', true))
        await woOn.delAll()
        vget[6] = await woOn.insert({ name: 'no-id' })
        vget[7] = (await woOn.select()).length

        //woOff, 關閉後主鍵須由呼叫端自備
        let woOff = WOrm(genOptPk('pkoff', false))
        await woOff.delAll()

        //帶id者正常寫入
        vget[8] = await woOff.insert({ id: 'p1', name: 'given' })
        vget[9] = await woOff.selectByPk('p1')

        //未帶id者須reject, 屬整批性錯誤而不進入逐筆結果
        rt = null
        // vans[10] = 'Error: invalid data[0].id, autoGenPk is false'
        await woOff.insert({ name: 'no-id' })
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[10] = rt

        //save未帶id者亦須reject, autoInsert兩種取值皆同
        rt = null
        // vans[11] = 'Error: invalid data[0].id, autoGenPk is false'
        await woOff.save({ name: 'no-id' })
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[11] = rt

        rt = null
        // vans[12] = 'Error: invalid data[0].id, autoGenPk is false'
        await woOff.save({ name: 'no-id' }, { autoInsert: false })
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[12] = rt

        //整批reject時, 同批之有效筆數亦不得被寫入
        rt = null
        // vans[13] = 'Error: invalid data[1].id, autoGenPk is false'
        await woOff.insert([
            { id: 'p-ok1', name: 'ok1' },
            { name: 'no-id' },
            { id: 'p-ok2', name: 'ok2' },
        ])
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[13] = rt
        vget[14] = [
            await woOff.selectByPk('p-ok1'),
            await woOff.selectByPk('p-ok2'),
        ]

        //save之整批reject亦同
        await woOff.insert({ id: 'p-base', name: 'base' })
        await woOff.save([
            { id: 'p-base', name: 'should-not-write' },
            { name: 'no-id' },
        ]).catch(() => {})
        vget[15] = (await woOff.selectByPk('p-base')).name

        //del不受autoGenPk影響, 未帶有效id仍為該筆ok為0而非reject
        vget[16] = await woOff.del({ name: 'no-id' })

        //autoGenPk為建構層設定, 不得於option逐次覆寫
        rt = null
        // vans[17] = 'Error: invalid data[0].id, autoGenPk is false'
        await woOff.save({ name: 'no-id' }, { autoGenPk: true })
            .then(function(msg) {
                rt = `不應resolve: ${JSON.stringify(msg)}`
            })
            .catch(function(msg) {
                rt = msg.toString()
            })
        vget[17] = rt

        //輸入無效仍依T5回空結果, 不因autoGenPk為false而reject
        vget[18] = await woOff.insert(null)
        vget[19] = await woOff.save(null)

    })

    vans[1] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[1])} for insert without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })

    vans[2] = 1
    it(`should get ${JSON.stringify(vans[2])} for records after insert without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })

    vans[3] = true
    it(`should get ${JSON.stringify(vans[3])} for generated id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })

    vans[4] = [{ n: 1, nInserted: 1, nModified: 0, ok: 1 }]
    it(`should get ${JSON.stringify(vans[4])} for save without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })

    vans[5] = 2
    it(`should get ${JSON.stringify(vans[5])} for records after save without id by default autoGenPk`, async function() {
        assert.strict.deepStrictEqual(vget[5], vans[5])
    })

    vans[6] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[6])} for insert without id by autoGenPk=true`, async function() {
        assert.strict.deepStrictEqual(vget[6], vans[6])
    })

    vans[7] = 1
    it(`should get ${JSON.stringify(vans[7])} for records after insert without id by autoGenPk=true`, async function() {
        assert.strict.deepStrictEqual(vget[7], vans[7])
    })

    vans[8] = { n: 1, nInserted: 1, ok: 1 }
    it(`should get ${JSON.stringify(vans[8])} for insert with id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[8], vans[8])
    })

    vans[9] = { id: 'p1', name: 'given' }
    it(`should get ${JSON.stringify(vans[9])} for record after insert with id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[9], vans[9])
    })

    vans[10] = 'Error: invalid data[0].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[10])} for insert without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[10], vans[10])
    })

    vans[11] = 'Error: invalid data[0].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[11])} for save without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[11], vans[11])
    })

    vans[12] = 'Error: invalid data[0].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[12])} for save(autoInsert=false) without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[12], vans[12])
    })

    vans[13] = 'Error: invalid data[1].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[13])} for insert with 1 record without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[13], vans[13])
    })

    vans[14] = [null, null]
    it(`should get ${JSON.stringify(vans[14])} for not writing valid records in rejected batch`, async function() {
        assert.strict.deepStrictEqual(vget[14], vans[14])
    })

    vans[15] = 'base'
    it(`should get ${JSON.stringify(vans[15])} for not writing valid records in rejected save batch`, async function() {
        assert.strict.deepStrictEqual(vget[15], vans[15])
    })

    vans[16] = [{ n: 0, nDeleted: 0, ok: 0, err: 'invalid id[undefined]' }]
    it(`should get ${JSON.stringify(vans[16])} for del without id by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[16], vans[16])
    })

    vans[17] = 'Error: invalid data[0].id, autoGenPk is false'
    it(`should get ${JSON.stringify(vans[17])} for not overriding autoGenPk by option`, async function() {
        assert.strict.deepStrictEqual(vget[17], vans[17])
    })

    vans[18] = { n: 0, nInserted: 0, ok: 1 }
    it(`should get ${JSON.stringify(vans[18])} for insert with invalid data by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[18], vans[18])
    })

    vans[19] = []
    it(`should get ${JSON.stringify(vans[19])} for save with invalid data by autoGenPk=false`, async function() {
        assert.strict.deepStrictEqual(vget[19], vans[19])
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
        let vx1 = await woSav.selectByPk('x1')
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

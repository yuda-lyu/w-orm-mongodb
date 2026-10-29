import mongodb from 'mongodb'
import WOrm from '../../src/WOrmMongodb.mjs'


//假MongoClient(不連線、不需docker): 供「接線測試」(確認本套件之站點與宣告有接上wsemi之診斷遮罩)在驅動接縫注入外來值
//spec之各鍵為函數, 回傳之值即為該接縫reject或throw之值(外來值); 鍵不存在表示該接縫成功
//  ctor      new MongoClient(url)同步throw(驅動解析連線字串失敗之形態)
//  connect   client.connect() reject
//  db        client.db(name)同步throw
//  close     client.close() reject
//  col       物件, 鍵為資料表方法名(find、findOne、insertMany、createIndex、updateOne、deleteOne、deleteMany)或'*'(全部方法), 值為函數, 該方法reject其回傳值
//BSON與GridFS仍用真實之驅動類別(GridFSBucket以假資料庫建構), 故本檔不改動驅動之行為, 只代替網路往返


let COL_METHODS = ['find', 'findOne', 'insertMany', 'createIndex', 'updateOne', 'deleteOne', 'deleteMany']


//ok, 各方法於spec未指定失敗時之成功回傳
let OK = {
    findOne: () => null,
    insertMany: (a) => ({ insertedCount: Array.isArray(a) ? a.length : 0 }),
    createIndex: () => 'id_1',
    updateOne: () => ({ matchedCount: 0, modifiedCount: 0, upsertedCount: 1 }),
    deleteOne: () => ({ deletedCount: 0 }),
    deleteMany: () => ({ deletedCount: 0 }),
}


function genFakeCol(spec, rec, name) {
    let col = {}
    for (let m of COL_METHODS) {
        let fn = spec.col && typeof spec.col[m] === 'function' ? spec.col[m] : (spec.col && typeof spec.col['*'] === 'function' ? spec.col['*'] : null)
        if (m === 'find') {
            col[m] = (...a) => {
                rec.calls.push([name, m])
                return {
                    toArray: async () => {
                        if (fn !== null) {
                            throw fn()
                        }
                        return []
                    },
                }
            }
            continue
        }
        col[m] = async (...a) => {
            rec.calls.push([name, m])
            if (fn !== null) {
                throw fn()
            }
            return OK[m](...a)
        }
    }
    return col
}


function genFakeDb(spec, rec) {
    return {
        collection: (name) => genFakeCol(spec, rec, name),
        admin: () => ({
            command: async () => {
                throw new Error('fakeMongo: admin().command not supported')
            },
        }),
    }
}


function genFakeClient(spec, rec) {
    return class FakeClient {
        constructor(url) {
            if (typeof spec.ctor === 'function') {
                throw spec.ctor()
            }
            rec.urls.push(url)
        }
        async connect() {
            if (typeof spec.connect === 'function') {
                throw spec.connect()
            }
            return this
        }
        db() {
            if (typeof spec.db === 'function') {
                throw spec.db()
            }
            return genFakeDb(spec, rec)
        }
        async close() {
            rec.closed++
            if (typeof spec.close === 'function') {
                throw spec.close()
            }
        }
    }
}


//build, 以假MongoClient建構WOrmMongodb實例(建構時取得MongoClient, 取得後即還原驅動, 不影響他測試)
//回傳 { w, rec }: rec.urls為建立MongoClient所用之url、rec.closed為close次數、rec.calls為資料表方法呼叫
function build(spec = {}, opt = {}) {
    let rec = { urls: [], closed: 0, calls: [] }
    let Fake = genFakeClient(spec, rec)
    let desc = Object.getOwnPropertyDescriptor(mongodb, 'MongoClient')
    Object.defineProperty(mongodb, 'MongoClient', { configurable: true, enumerable: true, get: () => Fake })
    let w
    try {
        w = WOrm({ url: 'mongodb://127.0.0.1:1', db: 'worm', cl: 'fake', ...opt })
    }
    finally {
        Object.defineProperty(mongodb, 'MongoClient', desc)
    }
    return { w, rec }
}


//ops, 11個公開函數(皆帶合法引數, 使失敗只來自注入之接縫), 與主要失敗接縫(各函數必經之外來值接縫)
//select、delAll、selectByPk以資料表方法失敗(驅動於首次操作才連線), selectByPkGfs與delAllGfs以client.db失敗, 其餘以connect失敗
let ops = {
    select: { fn: (w) => w.select(), seam: 'col' },
    selectByPk: { fn: (w) => w.selectByPk('a1'), seam: 'col' },
    insert: { fn: (w) => w.insert({ id: 'a1', name: 'n' }), seam: 'connect' },
    insertBulk: { fn: (w) => w.insertBulk({ id: 'a1', name: 'n' }), seam: 'connect' },
    save: { fn: (w) => w.save({ id: 'a1', name: 'n' }), seam: 'connect' },
    del: { fn: (w) => w.del({ id: 'a1' }), seam: 'connect' },
    delAll: { fn: (w) => w.delAll(), seam: 'col' },
    selectByPkGfs: { fn: (w) => w.selectByPkGfs('a1'), seam: 'db' },
    insertGfs: { fn: (w) => w.insertGfs({ id: 'a1', u8a: new Uint8Array([1]) }), seam: 'connect' },
    delGfs: { fn: (w) => w.delGfs({ id: 'a1' }), seam: 'connect' },
    delAllGfs: { fn: (w) => w.delAllGfs(), seam: 'db' },
}


//specOf, 於指定接縫注入一個外來值之spec
function specOf(seam, get) {
    if (seam === 'col') {
        return { col: { '*': get } }
    }
    return { [seam]: get }
}


//run, 執行並收集reject值與error事件
async function run(w, fn) {
    let evs = []
    w.on('error', (m, d, e) => evs.push([m, e]))
    let rej = null
    let has = false
    let res
    try {
        res = await fn(w)
    }
    catch (err) {
        has = true
        rej = err
    }
    return { has, rej, res, evs }
}


export { build, ops, specOf, run }

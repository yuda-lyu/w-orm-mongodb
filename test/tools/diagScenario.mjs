//診斷輸出測試(R-DIAG-01)之共用情境: 對一個WOrmMongodb實例依序執行各操作(成功與失敗), 回傳各結果與事件payload, 供回傳契約之比對
//同一情境亦於修改前之程式(git HEAD)執行以產生固定預期值(golden, test/tools/diagGolden.json), 故此檔不得依賴R-DIAG-01之任何新功能


let ID = 'u-secret-001@example.com'
let PW = 'S3cretPw'
let NUL = String.fromCharCode(0)
let LONE = String.fromCharCode(0xD800)


//norm, 以JSON往返正規化(Uint8Array、undefined、Error等一律轉為可比對之純資料), 產生golden與比對時皆用它
//自動產生之主鍵(UUID)每次不同, 一律以GENID取代; 驅動寫入時於事件payload之數據上補的_id(ObjectId)亦每次不同, 以OID取代
let norm = (v) => {
    let s = JSON.stringify(v === undefined ? null : v)
    return JSON.parse(s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, 'GENID').replace(/"_id":"[0-9a-f]{24}"/g, '"_id":"OID"'))
}


let settle = async (pm) => {
    try {
        return { ok: await pm }
    }
    catch (err) {
        return { err: String(err && err.message ? err.message : err) }
    }
}


//hook, 掛上change與error事件蒐集器, withBadListener為true時訂閱函數皆拋錯(觸發診斷輸出之站點)
function hook(w, withBadListener) {
    let evs = []
    w.on('change', (m, d, r) => {
        evs.push(['change', m, norm(d), norm(r)])
        if (withBadListener) {
            throw new Error(`listener ${ID} ${PW}`)
        }
    })
    w.on('error', (m, d, e) => {
        evs.push(['error', m, norm(d), norm(e)])
        if (withBadListener) {
            throw new Error(`listener ${ID} ${PW}`)
        }
    })
    return evs
}


//scenario, 需連線至真實MongoDB: 11個公開函數之成功與失敗路徑
async function scenario(w, withBadListener) {
    let evs = hook(w, withBadListener)
    let out = []
    let step = async (pm) => {
        out.push(norm(await settle(pm)))
    }
    await step(w.delAll({}))
    await step(w.insert([{ id: 'a1', name: 'n1', value: 1 }, { id: 'a2', name: 'n2', value: 2 }]))
    await step(w.insert({ id: 'a1', name: 'dup' }))
    await step(w.insertBulk([{ id: 'a1', name: 'dup' }]))
    await step(w.insertBulk([{ id: 'b1', name: 'bk1' }, { id: 'b2', name: 'bk2' }]))
    await step(w.insert([{ id: 'c1', name: 'ok' }, { id: '', name: 'empty id' }]))
    await step(w.save([{ id: 'a1', name: 'n1x' }, { id: 'a3', name: 'n3' }, { id: `x${LONE}`, name: 'bad id' }]))
    await step(w.select({ id: 'a1' }))
    await step(w.select({}))
    await step(w.selectByPk('a2'))
    await step(w.selectByPk('zz'))
    await step(w.select({ $foo: 1 }))
    await step(w.del([{ id: 'a2' }, { id: `y${NUL}` }]))
    await step(w.del({ id: 'a3' }))
    await step(w.delAll({ id: 'b1' }))
    await step(w.delAll({ $foo: 1 }))
    await step(w.delAll({}))
    await step(w.insertGfs([{ id: 'f1', u8a: new Uint8Array([1, 2, 3]) }, { id: 'f2', u8a: new Uint8Array([4, 5]) }]))
    await step(w.insertGfs({ id: 'f1', u8a: new Uint8Array([9]) }))
    await step(w.insertGfs({ id: 'f3' }))
    await step(w.selectByPkGfs('f1'))
    await step(w.selectByPkGfs('nope'))
    await step(w.delGfs([{ id: 'f1' }, { id: 'nope' }, { id: `z${LONE}` }]))
    await step(w.delAllGfs({ filename: 'f2' }))
    await step(w.delAllGfs({ $foo: 1 }))
    await step(w.delAllGfs({}))
    return { out, evs }
}


//urls, 不合法之連線字串(不含帳密, 驅動訊息與修改前相同); 各函數皆於連線前reject
let urls = ['http://127.0.0.1:27017', 'not a url', 'mongodb://']


//calls, 11個公開函數(皆帶合法引數, 使失敗只來自url)
let calls = {
    select: (w) => w.select(),
    selectByPk: (w) => w.selectByPk('a1'),
    insert: (w) => w.insert({ id: 'a1', name: 'n' }),
    insertBulk: (w) => w.insertBulk({ id: 'a1', name: 'n' }),
    save: (w) => w.save({ id: 'a1', name: 'n' }),
    del: (w) => w.del({ id: 'a1' }),
    delAll: (w) => w.delAll(),
    selectByPkGfs: (w) => w.selectByPkGfs('a1'),
    insertGfs: (w) => w.insertGfs({ id: 'a1', u8a: new Uint8Array([1]) }),
    delGfs: (w) => w.delGfs({ id: 'a1' }),
    delAllGfs: (w) => w.delAllGfs(),
}


//scenarioOffline, 不連線: 不合法url × 11函數、批次內全為無效主鍵之save/del/delGfs(同批皆不合格不建立MongoClient, 仍發change)、建構函式throw之訊息
async function scenarioOffline(WOrm, withBadListener) {
    let out = []
    for (let url of urls) {
        for (let [name, fn] of Object.entries(calls)) {
            let w = WOrm({ url, db: 'worm', cl: 'diag' })
            let evs = hook(w, withBadListener)
            let r = norm(await settle(fn(w)))
            out.push({ url, name, r, evs })
        }
    }
    {
        let w = WOrm({ url: 'mongodb://127.0.0.1:1', db: 'worm', cl: 'diag' })
        let evs = hook(w, withBadListener)
        let r1 = norm(await settle(w.save([{ id: `w${NUL}` }, { id: `x${LONE}` }])))
        let r2 = norm(await settle(w.del([{ id: '' }, { id: `x${NUL}` }])))
        let r3 = norm(await settle(w.delGfs([{ id: '' }, { id: `x${LONE}` }])))
        out.push({ name: 'allBadIds', r: [r1, r2, r3], evs })
    }
    let ctors = []
    for (let opt of [{ url: `mongodb://a${LONE}` }, { db: `d${LONE}` }, { cl: `c${LONE}` }]) {
        try {
            WOrm(opt)
            ctors.push('no throw')
        }
        catch (err) {
            ctors.push(`${err.constructor.name}: ${err.message}`)
        }
    }
    out.push({ name: 'ctor', ctors })
    return out
}


export { ID, PW, NUL, LONE, norm, settle, hook, scenario, scenarioOffline, calls }

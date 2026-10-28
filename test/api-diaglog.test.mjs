import fs from 'fs'
import net from 'net'
import util from 'util'
import assert from 'assert'
import WOrm from '../src/WOrmMongodb.mjs'
import { genUrl, startContainer, stopContainer } from './lib/api-setup.mjs'
import { ID, PW, scenario, scenarioOffline, settle } from './tools/diagScenario.mjs'


//rulebook R-DIAG-01: 診斷輸出(console)之預設安全與可控, 對真實MongoDB(自建docker容器)驗證
//  R-DIAG-01-1 預設只輸出標籤與不含個資之摘要(不含資料值、id、訂閱函數所拋錯誤之原文、連線憑證)
//  R-DIAG-01-2 opt.logDetail為true還原舊版細節輸出(裸輸出訂閱函數所拋之錯誤), 連線字串與帳密一律以***遮罩
//  R-DIAG-01-3 opt.funLog(label, safe, detail)取代console收完整細節(憑證仍遮罩)
//  R-DIAG-01-4 診斷輸出不得影響各操作之resolve/reject內容與事件payload: 對照修改前(git HEAD)程式所產生之固定預期值test/tools/diagGolden.json
//  R-DIAG-01-5 驅動執行期之連線錯誤(認證失敗、連不上)不含帳密(觀察)


let ctName = 'worm-test-mongodb-diaglog'
let ctDb = 'worm'
let ctPort = null //容器對外埠, 由startContainer動態取得
let nCl = 0

let UNAME = 'username' //api-setup.mjs之容器帳號
let UPW = 'password' //api-setup.mjs之容器密碼


let getOpt = (ex = {}) => {
    return {
        url: genUrl(ctPort),
        db: ctDb,
        cl: `diag${nCl++}`,
        ...ex,
    }
}


//capture, 擷取console各方法之輸出(以util.format格式化, 與實際輸出一致)
async function capture(fn) {
    let lines = []
    let ks = ['log', 'info', 'warn', 'error', 'debug']
    let olds = ks.map((k) => console[k])
    ks.forEach((k) => {
        console[k] = (...a) => lines.push(util.format(...a))
    })
    let res
    try {
        res = await fn()
    }
    finally {
        ks.forEach((k, i) => {
            console[k] = olds[i]
        })
    }
    return { res, lines }
}


let noCred = (text, msg = '') => {
    for (let s of [UPW, UNAME, `${UNAME}:${UPW}`, `mongodb://${UNAME}`]) {
        assert.ok(text.indexOf(s) < 0, `${msg}輸出含連線憑證[${s}]: ${text.slice(0, 400)}`)
    }
}


let noData = (text, msg = '') => {
    noCred(text, msg)
    for (let s of [ID, 'u-secret', PW, 'listener', 'AliceSecret', process.cwd()]) {
        assert.ok(text.indexOf(s) < 0, `${msg}輸出含不該出現之內容[${s}]: ${text.slice(0, 400)}`)
    }
}


let getFreePort = () => {
    return new Promise((resolve, reject) => {
        let srv = net.createServer()
        srv.on('error', reject)
        srv.listen(0, () => {
            let port = srv.address().port
            srv.close(() => resolve(port))
        })
    })
}


//golden, 回傳契約之固定預期值: 以修改前之程式(git HEAD)執行tools/diagScenario.mjs之情境所得(不含R-DIAG-01新功能), 重現法見tools/diagGoldenGen.mjs
let golden = JSON.parse(fs.readFileSync('./test/tools/diagGolden.json', 'utf8'))


//throwing, 訂閱函數: 拋出內含資料值、id與連線字串之錯誤
let throwing = (url) => () => {
    throw new Error(`listener ${ID} ${PW} AliceSecret ${url}`)
}


describe('diaglog', function() {

    before(async function() {
        this.timeout(180000)
        ctPort = await startContainer(ctName)
    })

    after(async function() {
        this.timeout(60000)
        await stopContainer(ctName)
    })


    describe('預設(R-DIAG-01-1): change與error訂閱函數拋錯, 8個會發change之函數 + error', function() {

        let ops = {
            insert: (w) => w.insert({ id: ID, name: 'AliceSecret' }),
            insertBulk: (w) => w.insertBulk([{ id: ID, name: 'AliceSecret' }]),
            save: (w) => w.save({ id: ID, name: 'AliceSecret' }),
            del: (w) => w.del({ id: ID }),
            delAll: (w) => w.delAll({ id: ID }),
            insertGfs: (w) => w.insertGfs({ id: ID, u8a: new Uint8Array([1, 2, 3]) }),
            delGfs: (w) => w.delGfs({ id: ID }),
            delAllGfs: (w) => w.delAllGfs({ filename: ID }),
        }

        for (let [name, fn] of Object.entries(ops)) {
            it(`change訂閱函數拋錯: ${name}, 輸出僅標籤與摘要, 不含id、資料值、錯誤原文、憑證; 操作照常resolve`, async function() {
                let opt = getOpt()
                let w = WOrm(opt)
                w.on('change', throwing(opt.url))
                let { res, lines } = await capture(() => settle(fn(w)))
                assert.ok(res.ok !== undefined, JSON.stringify(res))
                //save對不存在之id內部先以insert寫入並發change(既有行為, 見golden), 故save有兩次訂閱函數拋錯
                let modes = name === 'save' ? ['insert', 'save'] : [name]
                assert.deepStrictEqual(lines, modes.map((m) => `change handler threw { mode: '${m}', errType: 'Error' }`))
                noData(lines.join('\n'))
                await WOrm(opt).delAll().catch(() => null)
                await WOrm(opt).delAllGfs().catch(() => null)
            })
        }

        it('error訂閱函數拋錯: select之reject照舊, 輸出不含訂閱函數之錯誤原文與find內容', async function() {
            let opt = getOpt()
            let w = WOrm(opt)
            w.on('error', throwing(opt.url))
            let { res, lines } = await capture(() => settle(w.select({ $foo: ID })))
            assert.strictEqual(res.err, 'invalid find: unsupported operator [$foo] at [find.$foo]')
            assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'])
            noData(lines.join('\n'))
        })

        it('未開啟任何訂閱函數拋錯: 成功與失敗之各操作皆無任何console輸出', async function() {
            let opt = getOpt()
            let w = WOrm(opt)
            let { lines } = await capture(async () => {
                await settle(w.insert({ id: ID, name: 'x' }))
                await settle(w.insert({ id: ID, name: 'x' }))
                await settle(w.select({ $foo: 1 }))
                await settle(w.selectByPk(ID))
                await settle(w.del({ id: ID }))
            })
            assert.deepStrictEqual(lines, [])
        })

    })


    describe('logDetail(R-DIAG-01-2)', function() {

        it('true: 裸輸出訂閱函數所拋之錯誤(與舊版console.log(err)同格式), 連線字串與帳密以***遮罩, 資料值照舊', async function() {
            let opt = getOpt({ logDetail: true })
            let w = WOrm(opt)
            w.on('change', throwing(opt.url))
            let { res, lines } = await capture(() => settle(w.insert({ id: ID, name: 'AliceSecret' })))
            assert.deepStrictEqual(res, { ok: { n: 1, nInserted: 1, ok: 1 } })
            assert.strictEqual(lines.length, 1)
            assert.ok(lines[0].startsWith(`Error: listener ${ID} ${PW} AliceSecret ***`), lines[0].slice(0, 160))
            noCred(lines[0])
            await WOrm(opt).delAll()
        })

        it('true: error訂閱函數拋錯亦裸輸出', async function() {
            let opt = getOpt({ logDetail: true })
            let w = WOrm(opt)
            w.on('error', throwing(opt.url))
            let { lines } = await capture(() => settle(w.select({ $foo: 1 })))
            assert.strictEqual(lines.length, 1)
            assert.ok(lines[0].startsWith('Error: listener'), lines[0].slice(0, 80))
            noCred(lines[0])
        })

        it('舊版輸出格式: 預設關閉時無細節, 開啟後與console.log(原錯誤)首行相同', async function() {
            let opt = getOpt({ logDetail: true })
            let w = WOrm(opt)
            let e0 = new Error('plain listener only')
            w.on('error', () => {
                throw e0
            })
            let { lines } = await capture(() => settle(w.select({ $foo: 1 })))
            let old = []
            let o = console.log
            console.log = (...a) => old.push(util.format(...a))
            try {
                console.log(e0)
            }
            finally {
                console.log = o
            }
            assert.strictEqual(lines[0].split('\n')[0], old[0].split('\n')[0])
        })

        it('非true之值(字串、數字、物件)忽略並用預設(安全輸出)', async function() {
            for (let v of ['true', 1, {}, null]) {
                let opt = getOpt({ logDetail: v })
                let w = WOrm(opt)
                w.on('error', throwing(opt.url))
                let { lines } = await capture(() => settle(w.select({ $foo: 1 })))
                assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'], String(v))
            }
        })

    })


    describe('funLog(R-DIAG-01-3)', function() {

        it('取代console: 收到(label, safe, detail), detail為遮罩拷貝(連線憑證以***取代, 資料值照舊), 原錯誤不被改動', async function() {
            let got = []
            let opt = getOpt({ funLog: (...a) => got.push(a) })
            let w = WOrm(opt)
            let e0 = new Error(`listener ${ID} ${PW} AliceSecret ${opt.url}`)
            w.on('change', () => {
                throw e0
            })
            w.on('error', () => {
                throw e0
            })
            let { res, lines } = await capture(async () => {
                let r1 = await settle(w.insert({ id: ID, name: 'AliceSecret' }))
                let r2 = await settle(w.select({ $foo: 1 }))
                return [r1, r2]
            })
            assert.deepStrictEqual(lines, [], 'funLog給予時不寫console')
            assert.deepStrictEqual(res[0], { ok: { n: 1, nInserted: 1, ok: 1 } })
            assert.strictEqual(res[1].err, 'invalid find: unsupported operator [$foo] at [find.$foo]')
            assert.strictEqual(got.length, 2)
            assert.deepStrictEqual([got[0][0], got[0][1]], ['change handler threw', { mode: 'insert', errType: 'Error' }])
            assert.deepStrictEqual([got[1][0], got[1][1]], ['error handler threw', { mode: 'select', errType: 'Error' }])
            for (let g of got) {
                assert.ok(g[2] instanceof Error && g[2] !== e0)
                assert.strictEqual(g[2].message, `listener ${ID} ${PW} AliceSecret ***`)
                noCred(util.inspect(g, { depth: 10 }))
            }
            assert.ok(e0.message.indexOf(opt.url) >= 0, '原錯誤不被改動')
            await WOrm(opt).delAll()
        })

        it('funLog拋錯、回傳reject之promise: 皆吞下, 操作照常, 無unhandledRejection', async function() {
            let unhandled = []
            let h = (e) => unhandled.push(e)
            process.on('unhandledRejection', h)
            try {
                for (let fn of [() => {
                    throw new Error('sync')
                }, () => Promise.reject(new Error('async')), async () => {
                    throw new Error('asyncfn')
                }]) {
                    let opt = getOpt({ funLog: fn })
                    let w = WOrm(opt)
                    w.on('change', throwing(opt.url))
                    let { res, lines } = await capture(() => settle(w.insert({ id: ID, name: 'x' })))
                    assert.deepStrictEqual(res, { ok: { n: 1, nInserted: 1, ok: 1 } })
                    assert.deepStrictEqual(lines, [])
                    await WOrm(opt).delAll()
                }
                await new Promise((resolve) => setTimeout(resolve, 50))
                assert.deepStrictEqual(unhandled.map((e) => e && e.message), [])
            }
            finally {
                process.off('unhandledRejection', h)
            }
        })

        it('非函數之值忽略(同logDetail之型別處理), 建構不拋錯', async function() {
            for (let v of ['x', 1, {}, null, true]) {
                let opt = getOpt({ funLog: v })
                let w = WOrm(opt)
                w.on('error', throwing(opt.url))
                let { lines } = await capture(() => settle(w.select({ $foo: 1 })))
                assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'], String(v))
            }
        })

        it('選項於建構時取值, 其後改動opt不影響本實例', async function() {
            let got = []
            let opt = getOpt()
            let w = WOrm(opt)
            opt.logDetail = true
            opt.funLog = (...a) => got.push(a)
            w.on('error', throwing(opt.url))
            let { lines } = await capture(() => settle(w.select({ $foo: 1 })))
            assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'])
            assert.deepStrictEqual(got, [])
        })

    })


    describe('回傳契約不變(R-DIAG-01-4): 對照修改前(git HEAD)程式所產生之固定預期值', function() {

        for (let bad of [false, true]) {
            it(`連線情境(11個函數之成功與失敗路徑 + 事件payload), 訂閱函數${bad ? '皆拋錯(觸發診斷輸出)' : '不拋錯'}`, async function() {
                this.timeout(120000)
                let w = WOrm({ url: genUrl(ctPort), db: ctDb, cl: 'diag' })
                let { res } = await capture(() => scenario(w, bad))
                assert.deepStrictEqual(res.out, golden[`online_${bad ? 'bad' : 'ok'}`].out)
                assert.deepStrictEqual(res.evs, golden[`online_${bad ? 'bad' : 'ok'}`].evs)
                assert.ok(res.out.length >= 26 && res.evs.length >= 20, '情境步驟數過少')
            })

            it(`不連線情境(不合法url × 11函數、全為無效主鍵之批次、建構函式throw), 訂閱函數${bad ? '皆拋錯' : '不拋錯'}`, async function() {
                let { res } = await capture(() => scenarioOffline(WOrm, bad))
                assert.deepStrictEqual(res, golden[`offline_${bad ? 'bad' : 'ok'}`])
            })
        }

        it('golden本身有效: 含成功與失敗兩類結果、change與error兩類事件(防止golden退化成空洞比對)', function() {
            let g = golden.online_ok
            assert.ok(g.out.some((v) => v.ok && v.ok.nInserted === 2))
            assert.ok(g.out.some((v) => v.err && v.err.indexOf('E11000') === 0))
            assert.ok(g.out.some((v) => v.err && v.err.indexOf('invalid find') === 0))
            assert.ok(g.evs.some((v) => v[0] === 'change') && g.evs.some((v) => v[0] === 'error'))
            assert.strictEqual(JSON.stringify(golden.online_ok.out), JSON.stringify(golden.online_bad.out), '訂閱函數拋錯與否不改變結果')
        })

    })


    describe('驅動執行期之連線錯誤不含帳密(R-DIAG-01-5, 觀察)', function() {

        let allText = (err) => {
            let t = [util.inspect(err, { depth: 20, showHidden: true }), String(err.stack), String(err.message)]
            for (let c = err.cause, i = 0; c && i < 10; c = c.cause, i++) {
                t.push(String(c.message), String(c.stack))
            }
            return t.join('\n')
        }

        it('密碼錯誤(認證失敗): reject與error事件不含密碼', async function() {
            let bad = 'Zwrong9Pw'
            let url = `mongodb://${UNAME}:${bad}@127.0.0.1:${ctPort}/?serverSelectionTimeoutMS=3000`
            let w = WOrm({ url, db: ctDb, cl: 'diag' })
            let evs = []
            w.on('error', (m, d, e) => evs.push(e))
            let r = await w.select().then(() => null, (e) => e)
            assert.ok(r instanceof Error, '密碼錯誤應reject')
            assert.strictEqual(r.message.indexOf(bad), -1)
            assert.strictEqual(allText(r).indexOf(bad), -1)
            assert.strictEqual(evs.length, 1)
            assert.strictEqual(evs[0].indexOf(bad), -1)
        })

        it('連不上: reject與error事件不含帳密', async function() {
            let port = await getFreePort()
            let url = `mongodb://Zuser9:Zpw7@127.0.0.1:${port}/?serverSelectionTimeoutMS=1500&connectTimeoutMS=1500`
            let w = WOrm({ url, db: ctDb, cl: 'diag' })
            let evs = []
            w.on('error', (m, d, e) => evs.push(e))
            let r = await w.select().then(() => null, (e) => e)
            assert.ok(r instanceof Error)
            for (let s of ['Zuser9', 'Zpw7']) {
                assert.strictEqual(allText(r).indexOf(s), -1, s)
                assert.strictEqual(evs.join('\n').indexOf(s), -1, s)
            }
        })

    })

})

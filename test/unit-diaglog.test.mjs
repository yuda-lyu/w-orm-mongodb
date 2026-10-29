import fs from 'fs'
import util from 'util'
import assert from 'assert'
import WOrm from '../src/WOrmMongodb.mjs'
import { ID, PW, NUL, LONE, calls } from './tools/diagScenario.mjs'


//rulebook R-DIAG-01(依dspec〈診斷輸出與遮罩〉與wsemi之R-DIAG-01): 診斷輸出由wsemi之getDiag單一擁有, 本檔為「接線測試」(確認本套件之站點與宣告有接上), 不重做形態測試
//  形態類案(字串、鍵、Symbol、包裝物件、Proxy、二進位、Error、循環、數字秘密、摘要代碼集合、秘密導出等)由wsemi共用語料驅動, 見unit-diagwire.test.mjs
//  本檔經本套件之真實呼叫點(11個公開函數 × change與error訂閱函數拋錯), 不連線(站點部分以不合法url觸發, 不需資料庫)
//  R-DIAG-01-1 預設只輸出標籤與不含個資之摘要(不含資料值、id、錯誤原文、連線憑證)
//  R-DIAG-01-2 opt.logDetail為true輸出標籤與遮罩後之細節(訂閱函數所拋之錯誤), 連線字串與帳密一律以***遮罩
//  R-DIAG-01-3 opt.funLog(label, safe, detail)取代console收完整細節(憑證仍遮罩); 型別錯誤之選項忽略並用預設(同本套件其他選項)
//  R-DIAG-01-4 診斷輸出不得影響各操作之resolve/reject內容與時機


let USER = 'Zuser9'
let PASS = 'Zpw7'


//capture, 擷取console各方法之輸出(以util.format格式化, 與實際輸出一致), 並記錄所用方法
async function capture(fn) {
    let lines = []
    let methods = []
    let ks = ['log', 'info', 'warn', 'error', 'debug']
    let olds = ks.map((k) => console[k])
    ks.forEach((k) => {
        console[k] = (...a) => {
            methods.push(k)
            lines.push(util.format(...a))
        }
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
    return { res, lines, methods }
}


let noMark = (text, msg = '') => {
    for (let s of [USER, PASS, `${USER}:${PASS}`, `mongodb://${USER}`]) {
        assert.ok(text.indexOf(s) < 0, `${msg}含連線憑證[${s}]: ${text.slice(0, 300)}`)
    }
}


describe('diaglog', function() {

    describe('單一出口', function() {

        it('R-DIAG-01 src內不得直接呼叫console、寫process.stdout/stderr或emitWarning(所有診斷輸出經wsemi之getDiag, 本套件無自有出口)', function() {
            let bads = []
            let n = 0
            for (let f of fs.readdirSync('./src')) {
                if (!/\.(mjs|js)$/.test(f)) {
                    continue
                }
                n++
                let s = fs.readFileSync(`./src/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
                s.split(/\r?\n/).forEach((line, k) => {
                    let code = line.replace(/\/\/.*$/, '')
                    if (/\bconsole\s*[.[]/.test(code) || /process\s*\.\s*(stdout|stderr)/.test(code) || /emitWarning/.test(code)) {
                        bads.push(`${f}:${k + 1} ${line.trim().slice(0, 80)}`)
                    }
                })
            }
            assert.ok(n >= 1, `掃描檔數過少: ${n}`)
            assert.deepStrictEqual(bads, [], `下列站點未經單一出口:\n${bads.join('\n')}`)
        })

        it('本套件無自有之診斷輸出模組(src/getDiag.mjs已刪, 改用wsemi之getDiag; 不使用Node內建模組)', function() {
            assert.ok(!fs.existsSync('./src/getDiag.mjs'))
            let s = fs.readFileSync('./src/WOrmMongodb.mjs', 'utf8')
            assert.ok(s.indexOf('wsemi/src/getDiag.mjs') >= 0)
            assert.ok(!/from 'util'|from 'fs'|from 'path'|require\s*\(/.test(s), 'WOrmMongodb.mjs不得使用util等內建模組(dist由rollup打包, external只列events、stream、mongodb)')
        })

    })


    describe('站點(離線): 11個公開函數 × change與error訂閱函數拋錯, 預設輸出僅標籤與摘要', function() {

        let url = 'http://127.0.0.1:27017' //不合法scheme: 11個函數皆於連線前reject, 驅動訊息不含憑證

        let getW = (ex = {}) => WOrm({ url, db: 'worm', cl: 'diag', ...ex })

        for (let [name, fn] of Object.entries(calls)) {
            it(`error事件訂閱函數拋錯: ${name}`, async function() {
                let w = getW()
                w.on('error', () => {
                    throw new Error(`listener ${ID} ${PW}`)
                })
                let { res, lines, methods } = await capture(() => fn(w).then(() => 'resolved', (e) => e.message))
                assert.strictEqual(res, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"', 'reject內容不變')
                assert.deepStrictEqual(lines, [`error handler threw { mode: '${name}', errType: 'Error' }`])
                //level: 舊版為console.log, 維持stdout(不用console.error)
                assert.deepStrictEqual(methods, ['log'])
            })
        }

        it('change事件訂閱函數拋錯(批次內皆為無效主鍵之save、del、delGfs: 不連線仍發change)', async function() {
            for (let [name, fn] of [
                ['save', (w) => w.save([{ id: `a${LONE}` }, { id: `b${NUL}` }])],
                ['del', (w) => w.del([{ id: '' }, { id: `b${NUL}` }])],
                ['delGfs', (w) => w.delGfs([{ id: '' }, { id: `b${LONE}` }])],
            ]) {
                let w = getW()
                w.on('change', () => {
                    throw new Error(`listener ${ID} ${PW}`)
                })
                let { res, lines, methods } = await capture(() => fn(w))
                assert.ok(Array.isArray(res) && res.length === 2 && res.every((v) => v.ok === 0), name)
                assert.deepStrictEqual(lines, [`change handler threw { mode: '${name}', errType: 'Error' }`], name)
                assert.deepStrictEqual(methods, ['log'], name)
            }
        })

        it('預設輸出不含資料值、id、訂閱函數之錯誤原文與路徑', async function() {
            let w = getW()
            w.on('error', () => {
                throw new Error(`listener ${ID} ${PW} ${process.cwd()}`)
            })
            let { lines } = await capture(() => w.select().catch(() => null))
            let text = lines.join('\n')
            for (let s of [ID, PW, 'listener', process.cwd(), 'at ']) {
                assert.ok(text.indexOf(s) < 0, `輸出含[${s}]: ${text}`)
            }
        })

        it('訂閱函數拋出非Error值(字串、物件、null、數字): 摘要只列型別, 不含值', async function() {
            let w = getW()
            let k = 0
            let throws = [`str ${ID}`, { id: ID }, null, 42]
            w.on('error', () => {
                throw throws[k++]
            })
            let { lines } = await capture(async () => {
                for (let i = 0; i < throws.length; i++) {
                    await w.select().catch(() => null)
                }
            })
            assert.deepStrictEqual(lines, [
                'error handler threw { mode: \'select\', errType: \'string\' }',
                'error handler threw { mode: \'select\', errType: \'object\' }',
                'error handler threw { mode: \'select\', errType: \'null\' }',
                'error handler threw { mode: \'select\', errType: \'number\' }',
            ])
        })

        it('logDetail為true: 輸出標籤與訂閱函數所拋之錯誤(含訊息), 連線字串與帳密以***遮罩; reject內容不變', async function() {
            let urlx = `http://${USER}:${PASS}@127.0.0.1:27017`
            let w = WOrm({ url: urlx, db: 'worm', cl: 'diag', logDetail: true })
            w.on('error', () => {
                throw new Error(`listener ${ID} ${urlx} ${USER}:${PASS}`)
            })
            let { res, lines, methods } = await capture(() => w.select().then(() => 'resolved', (e) => e.message))
            assert.strictEqual(res, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"')
            assert.strictEqual(lines.length, 1)
            //label與細節: 標籤不再省略(舊版為console.log(err)裸輸出; 見README之Breaking changes)
            assert.ok(lines[0].startsWith(`error handler threw Error: listener ${ID} *** ***`), lines[0].slice(0, 120))
            assert.deepStrictEqual(methods, ['log'])
            noMark(lines[0])
        })

        it('funLog為函數: 取代console, 收到(label, safe, detail)', async function() {
            let urlx = `http://${USER}:${PASS}@127.0.0.1:27017`
            let got = []
            let w = WOrm({ url: urlx, db: 'worm', cl: 'diag', funLog: (...a) => got.push(a) })
            let e0 = new Error(`listener ${ID} ${urlx}`)
            w.on('error', () => {
                throw e0
            })
            let { lines } = await capture(() => w.select().catch(() => null))
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, 1)
            assert.strictEqual(got[0][0], 'error handler threw')
            assert.deepStrictEqual(got[0][1], { mode: 'select', errType: 'Error' })
            assert.ok(got[0][2] instanceof Error && got[0][2] !== e0)
            assert.strictEqual(got[0][2].message, `listener ${ID} ***`)
            noMark(util.inspect(got, { depth: 10 }))
        })

        it('選項型別錯誤(logDetail為字串、funLog為字串)忽略並用預設(安全輸出), 建構不拋錯', async function() {
            let w = WOrm({ url, db: 'worm', cl: 'diag', logDetail: 'true', funLog: 'x' })
            w.on('error', () => {
                throw new Error(`listener ${ID}`)
            })
            let { lines } = await capture(() => w.select().catch(() => null))
            assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'])
        })

        it('logDetail僅true生效: 其餘值(字串、數字、物件、1、undefined、null)忽略', async function() {
            for (let v of ['true', 1, {}, null, undefined, 'yes']) {
                let w = WOrm({ url, db: 'worm', cl: 'diag', logDetail: v })
                w.on('error', () => {
                    throw new Error(`listener ${ID}`)
                })
                let { lines } = await capture(() => w.select().catch(() => null))
                assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'], String(v))
            }
        })

        it('讀取選項拋錯(getter)只丟該選項, 不連累另一個有效選項; 建構不拋錯', async function() {
            let got = []
            let opt = { url, db: 'worm', cl: 'diag', funLog: (...a) => got.push(a) }
            Object.defineProperty(opt, 'logDetail', {
                enumerable: true,
                get() {
                    throw new Error('getter boom')
                }
            })
            let w = WOrm(opt)
            w.on('error', () => {
                throw new Error(`listener ${ID}`)
            })
            let { lines } = await capture(() => w.select().catch(() => null))
            assert.deepStrictEqual(lines, [])
            assert.strictEqual(got.length, 1)
        })

        it('選項於建構時取值, 其後改動opt不影響本實例', async function() {
            let opt = { url, db: 'worm', cl: 'diag' }
            let w = WOrm(opt)
            let got = []
            opt.logDetail = true
            opt.funLog = (...a) => got.push(a)
            w.on('error', () => {
                throw new Error(`listener ${ID}`)
            })
            let { lines } = await capture(() => w.select().catch(() => null))
            assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'])
            assert.deepStrictEqual(got, [])
        })

        it('診斷輸出不得使操作之reject變成例外物件: funLog同步拋錯與console.log拋錯皆不影響', async function() {
            let w = WOrm({
                url,
                db: 'worm',
                cl: 'diag',
                funLog: () => {
                    throw new Error('funLog boom')
                }
            })
            w.on('error', () => {
                throw new Error('listener')
            })
            let r = await w.select().then(() => 'resolved', (e) => e.message)
            assert.strictEqual(r, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"')
            let w2 = getW()
            w2.on('error', () => {
                throw new Error('listener')
            })
            let old = console.log
            console.log = () => {
                throw new Error('console boom')
            }
            let r2
            try {
                r2 = await w2.select().then(() => 'resolved', (e) => e.message)
            }
            finally {
                console.log = old
            }
            assert.strictEqual(r2, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"')
        })

        it('funLog回傳reject之原生promise: 吞下, 無unhandledRejection', async function() {
            let unhandled = []
            let h = (e) => unhandled.push(e)
            process.on('unhandledRejection', h)
            try {
                let w = WOrm({ url, db: 'worm', cl: 'diag', funLog: () => Promise.reject(new Error('async boom')) })
                w.on('error', () => {
                    throw new Error('listener')
                })
                await w.select().catch(() => null)
                await new Promise((resolve) => setTimeout(resolve, 50))
                assert.deepStrictEqual(unhandled.map((e) => e && e.message), [])
            }
            finally {
                process.off('unhandledRejection', h)
            }
        })

    })

})

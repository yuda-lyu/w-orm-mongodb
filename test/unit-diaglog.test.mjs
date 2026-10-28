/* eslint-disable no-new-wrappers */ //本檔刻意以包裝物件(new String等)驗證遮罩與摘要對包裝型別之處理
import fs from 'fs'
import util from 'util'
import assert from 'assert'
import mongodb from 'mongodb'
import WOrm from '../src/WOrmMongodb.mjs'
import { getOptLog, getSecrets, maskText, cpMask, maskErr, getDiag, getBriefErr } from '../src/getDiag.mjs'
import { ID, PW, NUL, LONE, calls } from './tools/diagScenario.mjs'


//rulebook R-DIAG-01: 診斷輸出之單一出口(src/getDiag.mjs)與其遮罩函數之單元測試, 不連線(站點部分以不合法url觸發, 不需資料庫)
//  R-DIAG-01-1 預設只輸出標籤與不含個資之摘要(不含資料值、id、錯誤原文、連線憑證)
//  R-DIAG-01-2 opt.logDetail為true還原舊版細節輸出(裸輸出訂閱函數所拋之錯誤), 連線字串與帳密一律以***遮罩
//  R-DIAG-01-3 opt.funLog(label, safe, detail)取代console收完整細節(憑證仍遮罩); 型別錯誤之選項忽略並用預設(同本套件其他選項)
//  R-DIAG-01-4 診斷輸出不得影響各操作之resolve/reject內容與時機


let USER = 'Zuser9'
let PASS = 'Zpw7'
let URL = `mongodb://${USER}:${PASS}@db.local:27017`


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


//cap, 同步版
function cap(fn) {
    let lines = []
    let old = console.log
    console.log = (...a) => lines.push(util.format(...a))
    try {
        fn()
    }
    finally {
        console.log = old
    }
    return lines
}


let noMark = (text, msg = '') => {
    for (let s of [USER, PASS, `${USER}:${PASS}`, `mongodb://${USER}`]) {
        assert.ok(text.indexOf(s) < 0, `${msg}含連線憑證[${s}]: ${text.slice(0, 300)}`)
    }
}


let delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


describe('diaglog', function() {

    describe('單一出口', function() {

        it('R-DIAG-01 src內除getDiag.mjs外不得直接呼叫console、寫process.stdout/stderr或emitWarning(所有診斷輸出經單一出口)', function() {
            let bads = []
            let n = 0
            for (let f of fs.readdirSync('./src')) {
                if (!/\.(mjs|js)$/.test(f) || f === 'getDiag.mjs') {
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

        it('getDiag.mjs內console出口僅於getDiag內(其餘函數不輸出)', function() {
            let s = fs.readFileSync('./src/getDiag.mjs', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
            let i = s.indexOf('function getDiag(')
            let j = s.indexOf('function isErrCode(')
            assert.ok(i > 0 && j > i)
            let outside = s.slice(0, i) + s.slice(j)
            assert.ok(!/\bconsole\s*[.[]/.test(outside.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, '')).join('\n')), 'getDiag以外之函數出現console')
        })

        it('不使用Node內建模組(dist由rollup打包, external只列events、stream、mongodb)', function() {
            let s = fs.readFileSync('./src/getDiag.mjs', 'utf8')
            assert.ok(!/^\s*import\s/m.test(s), 'getDiag.mjs不得有import')
            assert.ok(!/\brequire\s*\(/.test(s))
        })

    })


    describe('getOptLog: 選項解析(型別錯誤忽略用預設, 同opt.autoGenPk)', function() {

        it('預設', function() {
            assert.deepStrictEqual(getOptLog({}), { logDetail: false, funLog: null })
        })

        it('logDetail僅true生效: 其餘值(字串、數字、物件、1、undefined、null)忽略', function() {
            assert.strictEqual(getOptLog({ logDetail: true }).logDetail, true)
            for (let v of [false, 'true', 1, 0, {}, [], null, undefined, () => true, Symbol('x')]) {
                assert.strictEqual(getOptLog({ logDetail: v }).logDetail, false, String(typeof v))
            }
        })

        it('funLog僅函數生效: 其餘值忽略', function() {
            let f = () => {}
            assert.strictEqual(getOptLog({ funLog: f }).funLog, f)
            for (let v of ['x', 1, true, {}, [], null, undefined, { call() {} }]) {
                assert.strictEqual(getOptLog({ funLog: v }).funLog, null, String(typeof v))
            }
        })

        it('讀取選項拋錯(getter)只丟該選項, 不連累另一個有效選項', function() {
            let f = () => {}
            let o1 = { funLog: f }
            Object.defineProperty(o1, 'logDetail', {
                get() {
                    throw new Error('boom')
                }
            })
            assert.deepStrictEqual(getOptLog(o1), { logDetail: false, funLog: f })
            let o2 = { logDetail: true }
            Object.defineProperty(o2, 'funLog', {
                get() {
                    throw new Error('boom')
                }
            })
            assert.deepStrictEqual(getOptLog(o2), { logDetail: true, funLog: null })
        })

    })


    describe('getSecrets: 連線憑證清單', function() {

        it('含連線字串、帳密段、密碼、帳號(各取原樣), 長者在前', function() {
            let ss = getSecrets(URL)
            for (let s of [URL, `${USER}:${PASS}`, PASS, USER]) {
                assert.ok(ss.indexOf(s) >= 0, `缺[${s}]`)
            }
            for (let k = 1; k < ss.length; k++) {
                assert.ok(ss[k - 1].length >= ss[k].length, '長者在前')
            }
            assert.strictEqual(ss.indexOf('db.local:27017'), -1, '合格主機位址可回顯, 不列入')
        })

        it('百分比編碼之密碼: 編碼形式與解碼形式皆列入(連線字串內為編碼, 使用端程式碼中通常為解碼後原字串)', function() {
            let ss = getSecrets('mongodb://usr:p%40ss%2Fw%3Ard@h:27017')
            assert.ok(ss.indexOf('p%40ss%2Fw%3Ard') >= 0)
            assert.ok(ss.indexOf('p@ss/w:rd') >= 0)
            assert.ok(ss.indexOf(encodeURIComponent('p@ss/w:rd')) >= 0)
        })

        it('密碼含未編碼之@: 帳密段取至最後一個@', function() {
            let ss = getSecrets('mongodb://Zuser9:Zp@ss7@h:27017')
            assert.ok(ss.indexOf('Zuser9:Zp@ss7') >= 0)
            assert.ok(ss.indexOf('Zp@ss7') >= 0)
            //連線字串內為未編碼, 輸出中若出現其URL編碼形式亦須遮罩
            assert.ok(ss.indexOf('Zp%40ss7') >= 0)
            assert.strictEqual(maskText('x Zp%40ss7 y', ss), 'x *** y')
        })

        it('帳號單獨列入須至少3字元(過短者會吞掉無關文字); 帳密段與其並列之形式不受此限', function() {
            let ss = getSecrets('mongodb://ab:Zpw7@h:27017')
            assert.strictEqual(ss.indexOf('ab'), -1)
            assert.ok(ss.indexOf('ab:Zpw7') >= 0)
            assert.ok(getSecrets('mongodb://abc:Zpw7@h:27017').indexOf('abc') >= 0)
        })

        it('無帳密之連線字串仍列入整串(R: 含主機之位址亦屬連線字串)', function() {
            let ss = getSecrets('mongodb://127.0.0.1:27017')
            assert.ok(ss.indexOf('mongodb://127.0.0.1:27017') >= 0)
        })

        it('無@: 主機位址項全部視為憑證(缺@主機之 帳號:密碼 會被驅動當成host:port)', function() {
            let ss = getSecrets('mongodb://Zuser9:Zpw7/db')
            assert.ok(ss.indexOf('Zuser9:Zpw7') >= 0)
            let ss2 = getSecrets('mongodb://h1:27017,Zuser9:Zpw7')
            assert.ok(ss2.indexOf('h1:27017') >= 0 && ss2.indexOf('Zuser9:Zpw7') >= 0)
        })

        it('有@: @之後不合主機樣式之項視為憑證(反向書寫 host:port@帳號:密碼; host:port筆誤)', function() {
            assert.ok(getSecrets('mongodb://h:27017@Zuser9:Zpw7').indexOf('Zuser9:Zpw7') >= 0)
            assert.ok(getSecrets('mongodb://u1:p1@db.local:abc').indexOf('db.local:abc') >= 0)
            assert.strictEqual(getSecrets('mongodb://u1:p1@db.local:27017,db2.local:27018').indexOf('db2.local:27018'), -1)
        })

        it('查詢參數: 名稱含pass/pwd/secret/token/credential/user者之值列入, 其他不列入(含checkKeys、appName); authMechanismProperties僅名稱含上列字樣之屬性值列入', function() {
            let ss = getSecrets('mongodb://u1:p1@h:27017/?tlsCertificateKeyFilePassword=Zkp123&proxyPassword=Zpp456&proxyUsername=ZproxyUser9&appName=myapp&checkKeys=true&authMechanismProperties=SERVICE_NAME:Zsvc789,AWS_SESSION_TOKEN:Ztok000')
            for (let s of ['Zkp123', 'Zpp456', 'ZproxyUser9', 'Ztok000']) {
                assert.ok(ss.indexOf(s) >= 0, `缺[${s}]`)
            }
            for (let s of ['myapp', 'true', 'Zsvc789', 'SERVICE_NAME:Zsvc789,AWS_SESSION_TOKEN:Ztok000']) {
                assert.strictEqual(ss.indexOf(s), -1, `不應列入[${s}]`)
            }
        })

        it('查詢參數的各種回顯形式: +視為空白、;分段、不完整之百分比編碼、無=之參數整段、大小寫十六進位', function() {
            let ss = getSecrets('mongodb://u1:p1@h:27017/?tlsCertificateKeyFilePassword=My+Secret+Pass&proxyPassword=Abc;SecretPart99&x=1&tlsCertificateKeyFilePassword2=a100%sure%21&tlsCertificateKeyFilePassword:MySecret123')
            for (let s of ['My+Secret+Pass', 'My Secret Pass', 'Abc;SecretPart99', 'SecretPart99', 'a100%sure%21', 'a100%sure!', 'tlsCertificateKeyFilePassword:MySecret123']) {
                assert.ok(ss.indexOf(s) >= 0, `缺[${s}]`)
            }
            let up = getSecrets('mongodb://u1:p1@h:27017/?proxyPassword=p%2fword')
            assert.ok(up.indexOf('p/word') >= 0 && up.indexOf('p%2Fword') >= 0, '小寫十六進位之解碼形式與其大寫編碼形式')
        })

        it('帳密段含百分比編碼與空白: 驅動回顯之正規化形式(空白換成%20、他字元解碼後重編碼)亦列入', function() {
            let ss = getSecrets('mongodb://Zuser9:my%40secret pw@db.local:27017/')
            for (let s of ['my%40secret pw', 'my@secret pw', 'my%40secret%20pw']) {
                assert.ok(ss.indexOf(s) >= 0, `缺[${s}]`)
            }
            assert.strictEqual(maskText('pw=my%40secret%20pw', ss), 'pw=***')
            assert.ok(getSecrets('mongodb://Zuser9:my secret pw').indexOf('Zuser9:my%20secret%20pw') >= 0)
        })

        it('@出現在路徑或查詢字串: 嚴格(第一個/?#之前)與寬鬆(整串最後一個@)兩種解析取聯集, 單獨密碼與帳號不漏', function() {
            let ss = getSecrets('mongodb://Zuser9:Zpw7@db.local:27017/mydb?appName=svc@prod')
            for (let s of ['Zuser9:Zpw7', 'Zpw7', 'Zuser9']) {
                assert.ok(ss.indexOf(s) >= 0, `缺[${s}]`)
            }
            assert.strictEqual(maskText('pw=Zpw7 pair=Zuser9:Zpw7', ss), 'pw=*** pair=***')
        })

        it('url為String包裝物件(驅動接受): 同字串處理', function() {
            let ss = getSecrets(new String('mongodb://Zuser9:Zpw7@db.local:27017'))
            assert.ok(ss.indexOf('Zpw7') >= 0 && ss.indexOf('Zuser9:Zpw7') >= 0)
            assert.deepStrictEqual(getSecrets({ toString: () => 'mongodb://Zuser9:Zpw7@h' }), [])
        })

        it('isConn: 單獨帳號含驅動拒收之未編碼字元(/ ? # [ ] @)時列入(驅動於Username contains unescaped characters回顯); 一般帳號不列入', function() {
            assert.ok(getSecrets('mongodb://CORP/Zuser9:Zpw7@db.local:27017', true).indexOf('CORP/Zuser9') >= 0)
            assert.ok(getSecrets('mongodb://Zuser9/SecretPw99:123@db.local:27017', true).indexOf('Zuser9/SecretPw99') >= 0)
            assert.strictEqual(getSecrets('mongodb://Zuser9:Zpw7@db.local:27017', true).indexOf('Zuser9'), -1)
        })

        it('isConn(連線設定錯誤之遮罩用): 不含單獨之帳號, 不含短於4字元之單獨密碼與查詢值; 連線字串、帳密段、主機位址項照列', function() {
            let ss = getSecrets('mongodb://Zuser9:Zp7@h:27017/?tlsCertificateKeyFilePassword=Zk1', true)
            assert.strictEqual(ss.indexOf('Zuser9'), -1)
            assert.strictEqual(ss.indexOf('Zp7'), -1)
            assert.ok(ss.indexOf('Zuser9:Zp7') >= 0)
            assert.strictEqual(ss.indexOf('Zk1'), -1)
            assert.ok(getSecrets('mongodb://Zuser9:Zpw7@h:27017', true).indexOf('Zpw7') >= 0, '4字元以上之單獨密碼列入')
            let ss2 = getSecrets('mongodb://Zuser9:Zpw7ab@h:27017', true)
            assert.ok(ss2.indexOf('Zpw7ab') >= 0)
            assert.ok(getSecrets('mongodb://u:pw@h:27017', true).indexOf('u:pw') >= 0)
            assert.ok(getSecrets('mongodb://Zuser9:Zpw7', true).indexOf('Zuser9:Zpw7') >= 0)
        })

        it('isConn: 短於3字元之項一律不列(單字元帳號段、兩字元密碼等, 遮罩會把訊息、堆疊與路徑中的同字元一併吞掉); 一般模式照列', function() {
            let ss = getSecrets('mongodb://x@h:27017', true)
            assert.strictEqual(ss.indexOf('x'), -1)
            assert.ok(ss.every((s) => s.length >= 3))
            assert.ok(ss.indexOf('mongodb://x@h:27017') >= 0, '整串連線字串照列')
            let ss2 = getSecrets('mongodb://ab:cd@h:27017', true)
            assert.ok(ss2.every((s) => s.length >= 3))
            assert.ok(ss2.indexOf('ab:cd') >= 0)
            //一般模式亦同: 短於3字元之單獨秘密不列入(列入會把摘要的操作別遮成 s***l***ct), 整串連線字串與帳密並列形式照列
            let ss3 = getSecrets('mongodb://e@db.local:27017/?tls=bad')
            assert.strictEqual(ss3.indexOf('e'), -1)
            assert.ok(ss3.every((s) => s.length >= 3))
            assert.ok(ss3.indexOf('mongodb://e@db.local:27017/?tls=bad') >= 0)
            assert.strictEqual(getSecrets('mongodb://ab:cd@h:27017').indexOf('ab'), -1)
            assert.ok(getSecrets('mongodb://ab:cde@h:27017').indexOf('ab:cde') >= 0)
        })

        it('解碼後短於3字元之形式不列入(密碼%41%42解碼為AB: 列入會把訊息中的AB一併遮罩)', function() {
            for (let isConn of [false, true]) {
                let ss = getSecrets('mongodb://Zuser9:%41%42%43%44@h:27017', isConn)
                assert.ok(ss.indexOf('%41%42%43%44') >= 0 && ss.indexOf('ABCD') >= 0)
                let ss2 = getSecrets('mongodb://Zuser9:%41%42@h:27017', isConn)
                assert.strictEqual(ss2.indexOf('AB'), -1)
                assert.ok(ss2.every((s) => s.length >= 3))
            }
        })

        it('空帳密段(mongodb://:@host)不把冒號或其編碼(%3A)列為秘密: 否則輸出中所有冒號都會變成***', function() {
            for (let isConn of [false, true]) {
                let ss = getSecrets('mongodb://:@localhost:27017', isConn)
                assert.strictEqual(ss.indexOf(':'), -1)
                assert.strictEqual(ss.indexOf('%3A'), -1)
                assert.ok(ss.every((s) => s.length >= 3))
                let e = new Error('at index.js:12:34')
                assert.strictEqual(maskErr(e, ss).message, 'at index.js:12:34')
                assert.strictEqual(maskText('file:///C:/x.js:1:1', ss), 'file:///C:/x.js:1:1')
            }
        })

        it('無密碼之單獨帳號(mongodb://帳號@host): 一般模式3字元以上才列入, isConn不列入(不吞掉堆疊中的同字元)', function() {
            assert.strictEqual(getSecrets('mongodb://u@localhost:27017', true).indexOf('u'), -1)
            assert.strictEqual(getSecrets('mongodb://u@localhost:27017').indexOf('u'), -1)
            assert.ok(getSecrets('mongodb://bob@localhost:27017').indexOf('bob') >= 0)
            assert.strictEqual(getSecrets('mongodb://bob@localhost:27017', true).indexOf('bob'), -1)
            let e = new Error('x')
            maskErr(e, getSecrets('mongodb://run@localhost:27017', true))
            assert.ok(String(e.stack).indexOf('processImmediate') >= 0 || String(e.stack).indexOf('run') >= 0, '堆疊內的同字樣不被遮罩')
            assert.strictEqual(String(e.stack).indexOf('***'), -1)
        })

        it('非字串、空字串、孤立代理碼元、極端形態皆不丟例外', function() {
            for (let v of [undefined, null, 1, {}, [], '', '@', '://', 'mongodb://@', 'mongodb://:@', `mongodb://a${LONE}:b@h`, '?a=%ZZ', 'mongodb://h/?=', 'mongodb://h/?k', 'x'.repeat(10000)]) {
                assert.ok(Array.isArray(getSecrets(v)), String(v))
                assert.ok(Array.isArray(getSecrets(v, true)), String(v))
            }
            assert.deepStrictEqual(getSecrets(undefined), [])
            assert.deepStrictEqual(getSecrets(''), [])
        })

    })


    describe('maskText', function() {

        it('已知秘密以***取代, 非字串原樣回傳', function() {
            let ss = getSecrets(URL)
            assert.strictEqual(maskText(`a ${URL} b ${PASS} c ${USER}:${PASS}`, ss), 'a *** b *** c ***')
            for (let v of [1, null, undefined, {}]) {
                assert.strictEqual(maskText(v, ss), v)
            }
        })

        it('未知之scheme://帳密@亦遮罩(不依賴已知秘密); 帳密含多個@時取至最後一個@', function() {
            assert.strictEqual(maskText('x mongodb://aa:bb@host:27017/db y'), 'x mongodb://***@host:27017/db y')
            assert.strictEqual(maskText('x mongodb+srv://aa:b@b@host y'), 'x mongodb+srv://***@host y')
        })

        it('帳密段不跨越?或#: 無帳密之連線字串其查詢字串中的@不使前面的主機被誤遮', function() {
            assert.strictEqual(maskText('connect mongodb://db.local:27017?appName=svc@prod', []), 'connect mongodb://db.local:27017?appName=svc@prod')
            assert.strictEqual(maskText('x mongodb://aa:bb@host?x=y z', []), 'x mongodb://***@host?x=y z')
        })

        it('一般路徑與檔案網址不被誤遮(file:///C:/x/node_modules/@scope/pkg)', function() {
            let s = 'at file:///C:/x/node_modules/@scope/pkg/index.js:1:1'
            assert.strictEqual(maskText(s, []), s)
        })

    })


    describe('cpMask: 完整細節的遮罩拷貝', function() {

        let ss = getSecrets(URL)

        it('字串值、巢狀、陣列、屬性鍵、Symbol描述皆遮罩; 原物件不被改動', function() {
            let sym = Symbol(`tok ${PASS}`)
            let o = { a: `x ${PASS} y`, [`k ${USER}`]: 1, n: { arr: [`${URL}`, { deep: `${USER}:${PASS}` }] }, [sym]: 2 }
            let before = JSON.stringify(o)
            let c = cpMask(o, ss)
            noMark(util.inspect(c, { depth: 10, showHidden: true }))
            assert.strictEqual(c.a, 'x *** y')
            assert.strictEqual(c['k ***'], 1)
            assert.strictEqual(c.n.arr[0], '***')
            assert.strictEqual(c.n.arr[1].deep, '***')
            assert.strictEqual(Object.getOwnPropertySymbols(c)[0].description, 'tok ***')
            assert.strictEqual(JSON.stringify(o), before, '原物件不變')
            assert.strictEqual(o[sym], 2)
            assert.notStrictEqual(c, o)
        })

        it('數值型別之密碼(至少4位數字)同值遮罩; 過短之數字不納入', function() {
            let ss2 = getSecrets('mongodb://Zuser9:123456@h:27017')
            let c = cpMask({ p: 123456, q: 12, r: [123456n] }, ss2)
            assert.strictEqual(c.p, '***')
            assert.strictEqual(c.q, 12)
            assert.strictEqual(c.r[0], '***')
            let ss3 = getSecrets('mongodb://Zuser9:12@h:27017')
            assert.strictEqual(cpMask({ p: 12 }, ss3).p, 12)
            //3位數字之密碼: 字串形式遮罩, 數值形式不遮(3位以下之數字太常見)
            let ss4 = getSecrets('mongodb://Zuser9:123@h:27017')
            let c4 = cpMask({ p: 123, q: '123' }, ss4)
            assert.strictEqual(c4.p, 123)
            assert.strictEqual(c4.q, '***')
        })

        it('副本原型一律為內建原型: 不沿用使用端之原型(其繼承屬性未遮罩、util.inspect.custom會在格式化時執行)', function() {
            let ran = 0
            class Evil {
                constructor() {
                    this.own = `own ${PASS}`
                }

                get g() {
                    ran++
                    return PASS
                }

                [util.inspect.custom]() {
                    ran++
                    return `custom ${PASS}`
                }
            }
            Evil.prototype.inh = `inherited ${PASS}`
            let c = cpMask(new Evil(), ss)
            assert.strictEqual(Object.getPrototypeOf(c), Object.prototype)
            assert.strictEqual(c.inh, undefined)
            noMark(util.inspect(c))
            noMark(JSON.stringify(c))
            assert.strictEqual(ran, 0, '不得執行使用端之getter或inspect.custom')
        })

        it('自有存取器不執行, 以標記字串代替', function() {
            let ran = 0
            let o = { v: 1 }
            Object.defineProperty(o, 'g', {
                enumerable: true,
                get() {
                    ran++
                    return PASS
                }
            })
            let c = cpMask(o, ss)
            assert.strictEqual(c.g, '[Getter/Setter]')
            assert.strictEqual(ran, 0)
        })

        it('Error: 保留message、stack、cause、類別名稱與自有欄位(皆遮罩); 副本以內建Error.prototype為根(不沿用使用端原型)', function() {
            class MyErr extends Error {
                get inherited() {
                    return PASS
                }
            }
            MyErr.prototype.name = 'MyErr'
            MyErr.prototype.leak = PASS
            let e = new MyErr(`bad ${URL}`, { cause: new Error(`inner ${PASS}`) })
            e.code = 'E_X'
            e.extra = { auth: `${USER}:${PASS}` }
            let c = cpMask(e, ss)
            assert.ok(c instanceof Error)
            //自訂類別: 副本原型為只帶同名建構子之空殼, 其上層即內建Error.prototype; 不含使用端原型上的屬性
            assert.strictEqual(Object.getPrototypeOf(Object.getPrototypeOf(c)), Error.prototype)
            assert.strictEqual(c.constructor.name, 'MyErr')
            assert.strictEqual(c.constructor === MyErr, false)
            assert.strictEqual(c.leak, undefined)
            assert.strictEqual(c.inherited, undefined)
            //一般Error: 直接為內建Error.prototype
            assert.strictEqual(Object.getPrototypeOf(cpMask(new Error('x'), ss)), Error.prototype)
            assert.strictEqual(c.message, 'bad ***')
            assert.strictEqual(c.cause.message, 'inner ***')
            assert.strictEqual(c.code, 'E_X')
            assert.strictEqual(c.extra.auth, '***')
            assert.strictEqual(c.name, 'MyErr', '類別名稱常在原型上')
            assert.ok(typeof c.stack === 'string' && c.stack.indexOf('bad ***') >= 0)
            noMark(util.inspect(c, { depth: 10 }))
            assert.ok(e.message.indexOf(PASS) >= 0, '原錯誤不變')
        })

        it('Error之自訂stack存取器不執行, 以標記字串代替(僅內建getter才讀取)', function() {
            let ran = 0
            let e = new Error('x')
            Object.defineProperty(e, 'stack', {
                configurable: true,
                enumerable: false,
                get() {
                    ran++
                    return PASS
                }
            })
            let c = cpMask(e, ss)
            assert.strictEqual(c.stack, '[Getter/Setter]')
            assert.strictEqual(ran, 0)
            let e2 = new Error(`y ${PASS}`)
            assert.ok(cpMask(e2, ss).stack.indexOf('y ***') >= 0, '內建stack讀取並遮罩')
        })

        it('Date複製; Map、Set以[Object]; 二進位以位元組數; 函數以[Function]', function() {
            let d = new Date(0)
            let c = cpMask({ d, m: new Map([[1, PASS]]), s: new Set([PASS]), b: Buffer.from('abc'), u: new Uint8Array(5), f: () => PASS }, ss)
            assert.ok(c.d instanceof Date && c.d !== d && c.d.getTime() === 0)
            assert.strictEqual(c.m, '[Object]')
            assert.strictEqual(c.s, '[Object]')
            assert.strictEqual(c.b, '[Binary 3 bytes]')
            assert.strictEqual(c.u, '[Binary 5 bytes]')
            assert.strictEqual(c.f, '[Function]')
        })

        it('循環參照不無限遞迴; 過深與過大以[Truncated]代替', function() {
            let a = { name: PASS }
            a.self = a
            let c = cpMask(a, ss)
            assert.strictEqual(c.name, '***')
            assert.strictEqual(c.self, c)
            let deep = {}
            let cur = deep
            for (let i = 0; i < 20; i++) {
                cur.n = {}
                cur = cur.n
            }
            assert.ok(util.inspect(cpMask(deep, ss), { depth: 50 }).indexOf('[Truncated]') >= 0)
            let big = {}
            for (let i = 0; i < 5000; i++) {
                big[`k${i}`] = { v: i }
            }
            let cb = cpMask(big, ss)
            assert.ok(Object.keys(cb).length < 5000, '節點數超過上限者不再複製')
            assert.ok(util.inspect(cb, { depth: 5, maxArrayLength: null }).indexOf('[Truncated]') >= 0)
        })

        it('陣列之非索引鍵與Symbol鍵亦遮罩(索引鍵不動)', function() {
            let arr = ['ok']
            arr[`k_${PASS}`] = 1
            arr[Symbol(`s_${USER}:${PASS}`)] = 2
            let c = cpMask(arr, ss)
            let ks = Reflect.ownKeys(c).map((k) => String(k))
            assert.deepStrictEqual(ks, ['0', 'length', 'k_***', 'Symbol(s_***)'])
            noMark(ks.join(' '))
        })

        it('包裝字串取其字串值遮罩(不逐字元展開); 其他包裝物件、SharedArrayBuffer以標記字串代替', function() {
            assert.strictEqual(cpMask(new String(`x ${PASS}`), ss), 'x ***')
            assert.strictEqual(cpMask({ v: new String(PASS) }, ss).v, '***')
            let ss2 = getSecrets('mongodb://Zuser9:123456@db.local:27017')
            assert.strictEqual(cpMask(new Number(123456), ss2), '[Object]')
            assert.strictEqual(cpMask(new Boolean(true), ss2), '[Object]')
            assert.strictEqual(cpMask(Object(1n), ss2), '[Object]')
            assert.strictEqual(cpMask(Object(Symbol('x')), ss2), '[Object]')
            assert.strictEqual(cpMask(new SharedArrayBuffer(8), ss), '[SharedArrayBuffer]')
        })

        it('二進位資料的位元組數取自內建getter: 自有byteLength存取器不執行, 輸出數字', function() {
            let ran = 0
            let u8 = new Uint8Array(4)
            Object.defineProperty(u8, 'byteLength', {
                get() {
                    ran++
                    return `${USER}:${PASS}`
                }
            })
            assert.strictEqual(cpMask(u8, ss), '[Binary 4 bytes]')
            let dv = new DataView(new ArrayBuffer(6))
            assert.strictEqual(cpMask(dv, ss), '[Binary 6 bytes]')
            assert.strictEqual(cpMask(new ArrayBuffer(7), ss), '[Binary 7 bytes]')
            assert.strictEqual(ran, 0)
        })

        it('節點預算用盡: 其餘鍵不複製且以[Truncated]標記鍵明示(物件、陣列)', function() {
            let big = {}
            let arr = []
            for (let i = 0; i < 2500; i++) {
                big[`k${i}`] = `v${i}`
                arr.push(`v${i}`)
            }
            let cb = cpMask(big, ss)
            assert.ok(Object.keys(cb).length < 2500)
            assert.strictEqual(cb['[Truncated]'], true)
            let ca = cpMask(arr, ss)
            assert.strictEqual(ca['[Truncated]'], true)
            assert.ok(!(2499 in ca))
            assert.strictEqual(cpMask({ a: 1 }, ss)['[Truncated]'], undefined, '未用盡者無標記')
        })

        it('logDetail輸出的首行與原錯誤一致(自訂類別以原型name宣告、以存取器宣告、驅動的MongoError): 類別名稱不降級為Error', function() {
            class ProtoNameErr extends Error {}
            ProtoNameErr.prototype.name = 'ProtoNameErr'
            class GetterNameErr extends Error {
                get name() {
                    return 'GetterNameErr'
                }
            }
            let errs = [new ProtoNameErr('boom a'), new GetterNameErr('boom b'), new mongodb.MongoParseError('boom c')]
            try {
                new mongodb.MongoClient('mongodb://')
            }
            catch (err) {
                errs.push(err)
            }
            for (let e of errs) {
                let orig = util.inspect(e).split('\n')[0]
                let copy = util.inspect(cpMask(e, [])).split('\n')[0]
                assert.strictEqual(copy, orig, `${e.constructor.name}: ${copy} vs ${orig}`)
            }
        })

        it('Error類別名稱以存取器宣告者(驅動的MongoError: get name())改取建構子名稱', function() {
            class MongoXError extends Error {
                get name() {
                    return 'MongoXError'
                }
            }
            let c = cpMask(new MongoXError(`bad ${PASS}`), ss)
            assert.strictEqual(c.name, 'MongoXError')
            //建構子名稱不合識別字樣式者不採用(副本不自帶name, 沿用內建Error之name)
            let f = function() {}
            Object.defineProperty(f, 'name', { value: `user ${PASS}` })
            f.prototype = Object.create(Error.prototype, {
                name: {
                    get() {
                        return 'x'
                    }
                },
                constructor: { value: f }
            })
            let c2 = cpMask(Object.create(f.prototype), ss)
            assert.strictEqual(Object.prototype.hasOwnProperty.call(c2, 'name'), false)
            noMark(util.inspect(c2, { showHidden: true }))
        })

        it('Proxy與拋錯之getter不使拷貝丟例外', function() {
            let p = new Proxy({}, {
                ownKeys() {
                    throw new Error('trap')
                },
            })
            assert.strictEqual(cpMask(p, ss), '[Uncopyable]')
        })

    })


    describe('getDiag: 輸出出口', function() {

        it('預設: console.log(label, safe), 不呼叫getDetail', function() {
            let n = 0
            let diag = getDiag(getOptLog({}), getSecrets(URL))
            let lines = cap(() => diag('lbl', { mode: 'insert', errType: 'Error' }, () => {
                n++
                return `detail ${PASS}`
            }, true))
            assert.deepStrictEqual(lines, ['lbl { mode: \'insert\', errType: \'Error\' }'])
            assert.strictEqual(n, 0, '無消費者時不取細節')
        })

        it('預設且無safe: 只輸出label', function() {
            let diag = getDiag(getOptLog({}), [])
            assert.deepStrictEqual(cap(() => diag('only label')), ['only label'])
        })

        it('logDetail: bare者只輸出細節(舊版為console.log(細節)); 非bare者加label; 細節之憑證遮罩', function() {
            let diag = getDiag(getOptLog({ logDetail: true }), getSecrets(URL))
            let err = new Error(`listener ${URL} ${USER}:${PASS} ${ID}`)
            let l1 = cap(() => diag('lbl', { mode: 'x' }, () => err, true))
            assert.strictEqual(l1.length, 1)
            assert.ok(l1[0].startsWith('Error: listener *** *** u-secret-001@example.com'), l1[0].slice(0, 120))
            noMark(l1[0])
            let l2 = cap(() => diag('lbl', { mode: 'x' }, () => err))
            assert.ok(l2[0].startsWith('lbl Error: listener ***'), l2[0].slice(0, 80))
            let l3 = cap(() => diag('lbl', undefined, () => 'plain string', true))
            assert.deepStrictEqual(l3, ['plain string'])
        })

        it('logDetail: 與舊版console.log(err)之輸出一致(首行與屬性), 差別僅憑證遮罩', function() {
            let diag = getDiag(getOptLog({ logDetail: true }), getSecrets(URL))
            let err = new Error('plain listener only')
            err.code = 'E_CUSTOM'
            let old = cap(() => console.log(err))
            let nw = cap(() => diag('lbl', undefined, () => err, true))
            assert.strictEqual(nw[0].split('\n')[0], old[0].split('\n')[0])
            assert.ok(nw[0].indexOf('code: \'E_CUSTOM\'') >= 0)
        })

        it('funLog: 取代console, 收到(label, safe, detail); detail為遮罩拷貝而非原參照', function() {
            let got = null
            let diag = getDiag(getOptLog({
                funLog: (...a) => {
                    got = a
                }
            }), getSecrets(URL))
            let err = new Error(`x ${PASS}`)
            let lines = cap(() => diag('lbl', { mode: 'save', errType: 'Error' }, () => err, true))
            assert.deepStrictEqual(lines, [], 'funLog給予時不寫console')
            assert.strictEqual(got.length, 3)
            assert.strictEqual(got[0], 'lbl')
            assert.deepStrictEqual(got[1], { mode: 'save', errType: 'Error' })
            assert.notStrictEqual(got[2], err)
            assert.strictEqual(got[2].message, 'x ***')
            assert.strictEqual(err.message, `x ${PASS}`, '原錯誤不被改動')
        })

        it('funLog: 無getDetail時只收(label, safe)兩個引數', function() {
            let got = null
            let diag = getDiag(getOptLog({
                funLog: (...a) => {
                    got = a
                }
            }), [])
            diag('lbl', { a: 1 })
            assert.deepStrictEqual(got, ['lbl', { a: 1 }])
        })

        it('funLog拋錯、回傳reject之promise或thenable: 皆吞下, 不拋出且無unhandledRejection', async function() {
            let unhandled = []
            let h = (e) => unhandled.push(e)
            process.on('unhandledRejection', h)
            try {
                let mk = (fn) => getDiag(getOptLog({ funLog: fn }), [])
                mk(() => {
                    throw new Error('sync')
                })('a', { x: 1 })
                mk(() => Promise.reject(new Error('async')))('b', { x: 1 })
                mk(() => ({
                    then(_ok, ng) {
                        return Promise.reject(new Error('thenable'))
                    }
                }))('c', { x: 1 })
                mk(async () => {
                    throw new Error('asyncfn')
                })('d', { x: 1 })
                await delay(50)
                assert.deepStrictEqual(unhandled.map((e) => e && e.message), [])
            }
            finally {
                process.off('unhandledRejection', h)
            }
        })

        it('funLog回傳thenable: 呼叫其then(undefined, 處理函數); 若回傳另一thenable亦對它呼叫then(undefined, 處理函數)', function() {
            let calls1 = []
            let calls2 = []
            let inner = {
                then(...a) {
                    calls2.push(a)
                }
            }
            let outer = {
                then(...a) {
                    calls1.push(a)
                    return inner
                }
            }
            getDiag(getOptLog({ funLog: () => outer }), [])('lbl', { a: 1 })
            assert.strictEqual(calls1.length, 1)
            assert.strictEqual(calls1[0][0], undefined)
            assert.strictEqual(typeof calls1[0][1], 'function')
            assert.strictEqual(calls2.length, 1)
            assert.strictEqual(calls2[0][0], undefined)
            assert.strictEqual(typeof calls2[0][1], 'function')
        })

        it('funLog回傳之原生promise被覆寫then(p.then = 空函數): 仍以內建then附上reject處理, 不成為unhandledRejection', async function() {
            let unhandled = []
            let h = (e) => unhandled.push(e)
            process.on('unhandledRejection', h)
            try {
                getDiag(getOptLog({
                    funLog: () => {
                        let p = Promise.reject(new Error('escaped_rejection'))
                        p.then = () => {}
                        return p
                    }
                }), [])('lbl', { a: 1 })
                await delay(50)
                assert.deepStrictEqual(unhandled.map((e) => e && e.message), [])
            }
            finally {
                process.off('unhandledRejection', h)
            }
        })

        it('getDetail拋錯: logDetail與funLog皆以(unprintable)代替, 不拋出', function() {
            let bad = () => {
                throw new Error('detail boom')
            }
            let l = cap(() => getDiag(getOptLog({ logDetail: true }), [])('lbl', undefined, bad, true))
            assert.deepStrictEqual(l, ['(unprintable)'])
            let got = null
            getDiag(getOptLog({
                funLog: (...a) => {
                    got = a
                }
            }), [])('lbl', { a: 1 }, bad)
            assert.deepStrictEqual(got, ['lbl', { a: 1 }, '(unprintable)'])
        })

        it('console.log拋錯: 改輸出(unprintable)之後仍拋錯則放棄, 不使呼叫端拋出', function() {
            let old = console.log
            let n = 0
            console.log = () => {
                n++
                throw new Error('console boom')
            }
            try {
                getDiag(getOptLog({}), [])('lbl', { a: 1 })
            }
            finally {
                console.log = old
            }
            assert.strictEqual(n, 2, '先試一次正式輸出, 再試一次(unprintable)')
        })

        it('safe摘要之防禦性遮罩: 值若恰等於已知憑證(如數字密碼同時為錯誤代碼)仍以***取代', function() {
            let got = null
            let diag = getDiag(getOptLog({
                funLog: (...a) => {
                    got = a
                }
            }), getSecrets('mongodb://Zuser9:123456@h:27017'))
            diag('lbl', { errCode: 123456, errType: PASS, mode: 'Zuser9:123456', other: 'Zuser9:123456', n: 3 })
            assert.deepStrictEqual(got[1], { errCode: '***', errType: PASS, mode: 'Zuser9:123456', other: '***', n: 3 })
        })

        it('safe摘要中固定詞彙之鍵(mode)不經遮罩: 短秘密不可把操作別遮成 s***l***ct', function() {
            let got = null
            let diag = getDiag(getOptLog({
                funLog: (...a) => {
                    got = a
                }
            }), ['sel', 'ect'])
            diag('lbl', { mode: 'select', errType: 'select' })
            assert.deepStrictEqual(got[1], { mode: 'select', errType: '******' }, 'mode不遮罩; 其他鍵之值照常遮罩(select中的sel與ect各換成***)')
        })

        it('url含單字元帳號(mongodb://e@host): 預設輸出之操作別不被遮罩', async function() {
            let w = WOrm({ url: 'mongodb://e@db.local:27017/?tls=bad', db: 'worm', cl: 'diag' })
            w.on('error', () => {
                throw new Error('listener')
            })
            let { lines } = await capture(() => w.select().catch(() => null))
            assert.deepStrictEqual(lines, ['error handler threw { mode: \'select\', errType: \'Error\' }'])
        })

    })


    describe('getBriefErr: 錯誤摘要(只列類別與機器代碼)', function() {

        it('字串、null、其他型別', function() {
            assert.deepStrictEqual(getBriefErr(`oops ${ID}`), { errType: 'string' })
            assert.deepStrictEqual(getBriefErr(null), { errType: 'null' })
            assert.deepStrictEqual(getBriefErr(undefined), { errType: 'undefined' })
            assert.deepStrictEqual(getBriefErr(12), { errType: 'number' })
            assert.deepStrictEqual(getBriefErr({ message: ID }), { errType: 'object' })
            assert.deepStrictEqual(getBriefErr(() => {}), { errType: 'function' })
        })

        it('Error取建構子名稱(程式識別字); 不合識別字樣式者列為Error; 訊息文字不進摘要', function() {
            class MongoServerError extends Error {}
            let e = new MongoServerError(`dup ${ID}`)
            e.code = 11000
            assert.deepStrictEqual(getBriefErr(e), { errType: 'MongoServerError', errCode: 11000 })
            let f = function() {}
            Object.defineProperty(f, 'name', { value: `user ${ID}` })
            let e2 = new Error('x')
            Object.defineProperty(e2, 'constructor', { value: f })
            assert.deepStrictEqual(getBriefErr(e2), { errType: 'Error' })
            assert.ok(JSON.stringify(getBriefErr(e)).indexOf(ID) < 0)
        })

        it('代碼限機器代碼: 絕對值至99999之整數, ENOENT類或ERR_開頭; 夾帶資料之字串與過大數字不放行', function() {
            let mk = (code) => {
                let e = new Error('x')
                e.code = code
                return e
            }
            assert.strictEqual(getBriefErr(mk('ECONNREFUSED')).errCode, 'ECONNREFUSED')
            assert.strictEqual(getBriefErr(mk('ERR_INVALID_URL')).errCode, 'ERR_INVALID_URL')
            assert.strictEqual(getBriefErr(mk('EAI_AGAIN')).errCode, 'EAI_AGAIN')
            assert.strictEqual(getBriefErr(mk(-5)).errCode, -5)
            //E開頭者僅放行大寫字母與底線: E加數字(如業務編號E123456789)不放行
            for (let v of [ID, 'user@example.com', 100000, 1.5, NaN, 'E', 'EX', 'Eabc', 'E123456789', 'EMP0042', {}, [11000], 11000n]) {
                assert.strictEqual(getBriefErr(mk(v)).errCode, undefined, String(typeof v))
            }
        })

        it('不執行getter或使用端程式: code存取器、Symbol.toStringTag存取器、constructor存取器', function() {
            let ran = 0
            let e = new Error('x')
            Object.defineProperty(e, 'code', {
                get() {
                    ran++
                    return 'ECONNREFUSED'
                }
            })
            Object.defineProperty(e, Symbol.toStringTag, {
                get() {
                    ran++
                    return 'X'
                }
            })
            Object.defineProperty(e, 'constructor', {
                get() {
                    ran++
                    return Error
                }
            })
            assert.deepStrictEqual(getBriefErr(e), { errType: 'Error' })
            assert.strictEqual(ran, 0)
        })

        it('拋錯之Proxy不使摘要丟例外', function() {
            let p = new Proxy({}, {
                get() {
                    throw new Error('trap')
                },
                getPrototypeOf() {
                    throw new Error('trap')
                },
                getOwnPropertyDescriptor() {
                    throw new Error('trap')
                },
            })
            assert.deepStrictEqual(getBriefErr(p), { errType: 'unknown' })
        })

    })


    describe('maskErr: 連線設定錯誤的原地遮罩', function() {

        let ss = getSecrets(URL, true)

        it('同一錯誤物件: message、stack、cause鏈(含自有字串欄位input)遮罩, 類別與原型不變', function() {
            class MongoRuntimeError extends Error {}
            let cause = new TypeError('Invalid URL')
            cause.input = `iLoveJS://${USER}:${PASS}`
            let e = new MongoRuntimeError(`Unable to parse ${USER}:${PASS} with URL`, { cause })
            let r = maskErr(e, ss)
            assert.strictEqual(r, e)
            assert.strictEqual(Object.getPrototypeOf(e), MongoRuntimeError.prototype)
            assert.strictEqual(e.message, 'Unable to parse *** with URL')
            assert.strictEqual(cause.input, 'iLoveJS://***')
            noMark(String(e.stack))
            noMark(util.inspect(e, { depth: 10 }))
            //改寫後屬性之形狀不變(message不可列舉但可寫可設定; input為一般可列舉屬性)
            assert.deepStrictEqual(Object.getOwnPropertyDescriptor(e, 'message'), { value: 'Unable to parse *** with URL', writable: true, enumerable: false, configurable: true })
            assert.deepStrictEqual(Object.getOwnPropertyDescriptor(cause, 'input'), { value: 'iLoveJS://***', writable: true, enumerable: true, configurable: true })
        })

        it('stack已被讀取過(字串已固定於內部)者亦改寫: 讀取後改為資料屬性, 內容遮罩; 無秘密之訊息不變', function() {
            let e = new Error(`x ${USER}:${PASS}`)
            assert.ok(String(e.stack).indexOf(PASS) >= 0, '前提: 讀取後stack含憑證')
            maskErr(e, ss)
            assert.ok(String(e.stack).startsWith('Error: x ***\n'), String(e.stack).slice(0, 60))
            let e2 = new Error('Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"')
            let s0 = e2.stack
            maskErr(e2, ss)
            assert.strictEqual(e2.message, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"')
            assert.strictEqual(e2.stack, s0)
        })

        it('自訂stack存取器不執行(僅內建getter才讀取)', function() {
            let ran = 0
            let e = new Error(`x ${PASS}`) //內建stack含憑證: 若誤把自訂存取器當內建而讀取改寫, 存取器會被資料屬性取代
            Object.defineProperty(e, 'stack', {
                configurable: true,
                get() {
                    ran++
                    return PASS
                }
            })
            maskErr(e, getSecrets(URL))
            assert.strictEqual(ran, 0)
            assert.strictEqual(typeof Object.getOwnPropertyDescriptor(e, 'stack').get, 'function', '自訂存取器保持原狀, 不被改寫為資料屬性')
        })

        it('cause循環與過深不無限遞迴; 凍結之錯誤不丟例外', function() {
            let a = new Error(`a ${USER}:${PASS}`)
            let b = new Error(`b ${USER}:${PASS}`, { cause: a })
            Object.defineProperty(a, 'cause', { value: b, configurable: true })
            maskErr(a, ss)
            assert.strictEqual(a.message, 'a ***')
            assert.strictEqual(b.message, 'b ***')
            let f = Object.freeze(new Error(`f ${USER}:${PASS}`))
            assert.doesNotThrow(() => maskErr(f, ss))
        })

        it('不可設定但可寫之自有字串屬性: 以賦值改寫(屬性形狀不變); 凍結之屬性無法改寫但不丟例外', function() {
            let e = new Error('ok')
            Object.defineProperty(e, 'input', { value: `iLoveJS://${USER}:${PASS}`, writable: true, enumerable: true, configurable: false })
            maskErr(e, ss)
            assert.strictEqual(e.input, 'iLoveJS://***')
            assert.deepStrictEqual(Object.getOwnPropertyDescriptor(e, 'input'), { value: 'iLoveJS://***', writable: true, enumerable: true, configurable: false })
            let e2 = new Error('ok')
            Object.defineProperty(e2, 'input', { value: `${USER}:${PASS}`, writable: false, enumerable: true, configurable: false })
            assert.doesNotThrow(() => maskErr(e2, ss))
        })

        it('驅動回顯之主機位址項不依賴已知秘密亦遮罩: 不合主機樣式者以***取代(含空白經正規化為%20、秘密清單為空、url為包裝物件等), 合格主機:port保留', function() {
            let mk = (host) => {
                let cause = new TypeError('Invalid URL')
                cause.input = `iLoveJS://${host}`
                return new Error(`Unable to parse ${host} with URL`, { cause })
            }
            for (let host of [`${USER}:my%20secret%20pw`, `${USER}:${PASS}`, 'h:abc', '[::1', 'a%20b']) {
                let e = mk(host)
                maskErr(e, [])
                assert.strictEqual(e.message, 'Unable to parse *** with URL', host)
                assert.strictEqual(e.cause.input, 'iLoveJS://***', host)
                assert.ok(String(e.stack).indexOf('Unable to parse ***') >= 0 || String(e.stack).indexOf(host) < 0, host)
            }
            for (let host of ['db.local:99999', '127.0.0.1:27017', '[::1]:27017', 'h1:1,h2:2']) {
                let e = mk(host)
                maskErr(e, [])
                assert.strictEqual(e.message, `Unable to parse ${host} with URL`, host)
                assert.strictEqual(e.cause.input, `iLoveJS://${host}`, host)
            }
        })

        it('字串輸入同樣套用主機位址項遮罩(不依賴已知秘密)', function() {
            assert.strictEqual(maskErr('Unable to parse Zuser9:my%20secret%20pw with URL', []), 'Unable to parse *** with URL')
            assert.strictEqual(maskErr('Unable to parse db.local:99999 with URL', []), 'Unable to parse db.local:99999 with URL')
        })

        it('字串回傳遮罩後字串; 其他型別與無秘密時原樣回傳', function() {
            assert.strictEqual(maskErr(`s ${USER}:${PASS}`, ss), 's ***')
            for (let v of [null, undefined, 1, true]) {
                assert.strictEqual(maskErr(v, ss), v)
            }
            let e = new Error(`x ${PASS}`)
            assert.strictEqual(maskErr(e, []), e)
            assert.ok(e.message.indexOf(PASS) >= 0)
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
                let { res, lines } = await capture(() => fn(w).then(() => 'resolved', (e) => e.message))
                assert.strictEqual(res, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"', 'reject內容不變')
                assert.deepStrictEqual(lines, [`error handler threw { mode: '${name}', errType: 'Error' }`])
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
                let { res, lines } = await capture(() => fn(w))
                assert.ok(Array.isArray(res) && res.length === 2 && res.every((v) => v.ok === 0), name)
                assert.deepStrictEqual(lines, [`change handler threw { mode: '${name}', errType: 'Error' }`], name)
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

        it('logDetail為true: 裸輸出訂閱函數所拋之錯誤(含訊息), 連線字串與帳密以***遮罩; reject內容不變', async function() {
            let urlx = `http://${USER}:${PASS}@127.0.0.1:27017`
            let w = WOrm({ url: urlx, db: 'worm', cl: 'diag', logDetail: true })
            w.on('error', () => {
                throw new Error(`listener ${ID} ${urlx} ${USER}:${PASS}`)
            })
            let { res, lines } = await capture(() => w.select().then(() => 'resolved', (e) => e.message))
            assert.strictEqual(res, 'Invalid scheme, expected connection string to start with "mongodb://" or "mongodb+srv://"')
            assert.strictEqual(lines.length, 1)
            assert.ok(lines[0].startsWith(`Error: listener ${ID} *** ***`), lines[0].slice(0, 100))
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

    })

})

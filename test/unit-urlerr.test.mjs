import util from 'util'
import assert from 'assert'
import mongodb from 'mongodb'
import { spawn } from 'child_process'
import WOrm from '../src/WOrmMongodb.mjs'
import { calls } from './tools/diagScenario.mjs'


//rulebook R-DIAG-01(依dspec〈診斷輸出與遮罩〉): 連線設定錯誤(new MongoClient(url)解析連線字串失敗)之訊息、stack與cause不回顯帳密
//驅動在連線字串無法解析時會回顯其中一段(如缺少@主機之 mongodb://帳號:密碼 被當成host:port, 訊息為 Unable to parse 帳號:密碼 with URL, cause.input亦含該字串);
//本套件於各函數之批次catch經wsemi之diag.err(秘密由getDiagSecrets自opt.url導出, 樣式宣告mongoHostEcho)遮除憑證: 含憑證者為同類別(原型相同、instanceof同類)之副本,
//訊息前綴不變, 11個公開函數之reject與error事件所收到者為遮罩後之錯誤; 不含憑證者為驅動原物件
//不連線(各函數皆於new MongoClient階段失敗), 不需資料庫; 本檔37種連線字串形態 × 11個公開函數為真驅動之接線測試(形態由真驅動產生, 非wsemi語料所能代替)


let U = 'Zuser9'
let P = 'Zpw7'
let K = 'Zkp123'
let S = 'Zsvc789' //authMechanismProperties之SERVICE_NAME值: 一般設定值而非憑證, 不得被遮罩
let T = 'Ztok000'
let Z2 = 'SecretPw99'
let W = 'Zmy secret pw8'
let WP = 'Zmy+Secret+Pw1'
let SC = 'ZsecretPart99'
let PC = 'Za100%sure%21'
let MN = 'ZMySecret123'
let PU = 'ZproxyUser9'
let MARKS = [U, P, K, T, Z2, W, 'Zmy%20secret%20pw8', WP, 'Zmy Secret Pw1', SC, 'Za100', MN, PU, `${U}:${P}`]


//baseline, 驅動對同一連線字串所拋之原始錯誤(未經本套件)
let baseline = (url) => {
    try {
        new mongodb.MongoClient(url)
    }
    catch (err) {
        return err
    }
    return null
}


//allText, 錯誤物件所有可見文字(message、stack、cause鏈、util.inspect全展開)
let allText = (err) => {
    let t = [util.inspect(err, { depth: 20, showHidden: true }), String(err.stack), String(err.message)]
    for (let c = err.cause, i = 0; c && i < 10; c = c.cause, i++) {
        t.push(String(c.message), String(c.stack), String(c.input))
    }
    return t.join('\n')
}


//noMarks, allow為該案刻意不遮之單獨帳號(依D3), marks為該案額外須遮之憑證
let noMarks = (text, msg = '', allow = [], marks = []) => {
    for (let s of [...MARKS.filter((v) => allow.indexOf(v) < 0), ...marks]) {
        assert.ok(text.indexOf(s) < 0, `${msg}含憑證[${s}]: ${text.slice(0, 300)}`)
    }
}


//cases, expect=遮罩後之訊息(null表示與驅動原訊息相同, 即本來就不回顯)、type=驅動之錯誤類別
let cases = [
    { label: '缺@主機: mongodb://帳號:密碼', url: `mongodb://${U}:${P}`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: '缺@主機且帶資料庫名', url: `mongodb://${U}:${P}/db`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: '反向書寫: host:port@帳號:密碼', url: `mongodb://h:27017@${U}:${P}`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: 'port筆誤(host:abc)', url: `mongodb://${U}:${P}@db.local:abc`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: '多主機中一項port筆誤', url: `mongodb://${U}:${P}@db.local:27017,db2.local:abc`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: 'IPv6括號不成對', url: `mongodb://${U}:${P}@[::1`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: 'port超出範圍(host:99999)', url: `mongodb://${U}:${P}@db.local:99999`, type: 'MongoRuntimeError', expect: 'Unable to parse db.local:99999 with URL' },
    { label: '查詢參數憑證值被驅動回顯(maxPoolSize=憑證)', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${K}&maxPoolSize=${K}`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '查詢參數憑證值為子字串', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${K}&maxPoolSize=x${K}y`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: x***y' },
    { label: '密碼含未編碼之@與/(驅動以固定訊息拒收)', url: `mongodb://${U}:${P}/x@db.local:27017`, type: 'MongoParseError', expect: null },
    { label: '百分比編碼不合法(固定訊息)', url: `mongodb://${U}:p%${P}@db.local:27017`, type: 'MongoParseError', expect: null },
    { label: 'srv帶port(固定訊息)', url: `mongodb+srv://${U}:${P}@db.local:27017`, type: 'MongoParseError', expect: null },
    { label: '未知scheme(固定訊息)', url: `http://${U}:${P}@db.local`, type: 'MongoParseError', expect: null },
    { label: '無scheme(固定訊息)', url: `${U}:${P}@db.local`, type: 'MongoParseError', expect: null },
    { label: '空主機(固定訊息)', url: `mongodb://${U}:${P}@/db`, type: 'MongoParseError', expect: null },
    { label: '單字元帳號段不得把訊息中的同字元一併遮罩(Expected含x)', url: 'mongodb://x@db.local:27017/?maxPoolSize=abc', type: 'MongoParseError', expect: null },
    { label: '帳號為3字元以上且恰為訊息中的字樣(Exp)不得被遮罩(連線設定錯誤之遮罩不含單獨帳號)', url: `mongodb://Exp:${P}@db.local:27017/?maxPoolSize=abc`, type: 'MongoParseError', expect: null },
    { label: '兩字元帳號:密碼不得把訊息中的同字元一併遮罩', url: 'mongodb://ex:pe@db.local:27017/?maxPoolSize=abc', type: 'MongoParseError', expect: null },
    { label: '不含任何憑證之解析失敗: 訊息與驅動原訊息完全相同', url: 'mongodb://', type: 'MongoParseError', expect: null },
    { label: '不含憑證之port筆誤(無@時整段主機位址項視為憑證)', url: 'mongodb://db.local:abc', type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    //以下為外審(Argon)探測所揭露之形態
    //帳號段含/者: wsemi之getDiagSecrets把「/」兩側之片段(畸形網址之權限段與帳號片段)各列為憑證, 故驅動回顯之 CORP/帳號 遮為 ***/***(修改前為整段單一***; 皆不含憑證)
    { label: '帳號段含驅動拒收之未編碼字元(/): 驅動回顯帳號', url: `mongodb://CORP/${U}:${P}@db.local:27017`, type: 'MongoParseError', expect: 'Username contains unescaped characters ***/***' },
    { label: '帳號段含/且「密碼」寫在帳號位置', url: `mongodb://${U}/${Z2}:123@db.local:27017`, type: 'MongoParseError', expect: 'Username contains unescaped characters ***/***' },
    { label: '@出現在查詢字串(appName=svc@prod): 單獨密碼被驅動回顯', url: `mongodb://${U}:${P}@db.local:27017/mydb?maxPoolSize=${P}&appName=svc@prod`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '@出現在查詢字串且缺@主機(反向書寫)', url: `mongodb://h:27017@${U}:${P}/mydb?appName=svc@prod`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: '缺@主機且密碼含空白: 驅動將空白正規化為%20後回顯', url: `mongodb://${U}:${W}`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: '反向書寫且密碼含空白', url: `mongodb://h:27017@${U}:${W}`, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: '查詢參數憑證值含+(驅動視為空白後回顯)', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword=${WP}&maxPoolSize=${WP}`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '查詢參數憑證值含;', url: `mongodb://u1:p1@db.local:27017/?proxyPassword=Abc;${SC}&maxPoolSize=Abc;${SC}`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '查詢參數憑證值含不完整之百分比編碼', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword=${PC}&maxPoolSize=${PC}`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: 'authMechanismProperties內名稱含TOKEN之屬性值', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=AWS_SESSION_TOKEN:${T}&maxPoolSize=${T}`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: 'authMechanismProperties內SERVICE_NAME為一般設定值: 不得遮罩', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=SERVICE_NAME:${S}&maxPoolSize=${S}`, type: 'MongoParseError', expect: null },
    { label: '無=之參數(名稱含Password)被驅動整段回顯', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword:${MN}`, type: 'MongoAPIError', expect: 'URI option "***" cannot be specified with no value' },
    //proxyUsername之值為單獨帳號(非憑證): 依dspec〈診斷輸出與遮罩〉D3對外錯誤值只遮憑證、不遮單獨帳號(修改前遮罩), 故驅動回顯之帳號值原樣; 其與proxyPassword之並列形式、proxyPassword之值仍遮罩(見下一案)
    { label: 'proxyUsername之值被驅動回顯(單獨帳號: 依D3不遮)', url: `mongodb://db.local:27017/?proxyHost=p.local&proxyUsername=${PU}&proxyPassword=Zpp456&maxPoolSize=${PU}`, type: 'MongoParseError', expect: null, allow: [PU] },
    { label: 'proxyPassword之值被驅動回顯: 遮罩', url: `mongodb://db.local:27017/?proxyHost=p.local&proxyUsername=${PU}&proxyPassword=Zpp456&maxPoolSize=Zpp456`, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***', marks: ['Zpp456'] },
    { label: 'checkKeys=true為布林選項, 不得因參數名含key而把訊息中的true遮罩', url: `mongodb://${U}:${P}@db.local:27017/?checkKeys=true&tls=bad`, type: 'MongoParseError', expect: null },
    { label: 'url為String包裝物件(驅動接受)', url: `mongodb://${U}:${P}`, box: true, type: 'MongoRuntimeError', expect: 'Unable to parse *** with URL' },
    { label: 'url為String包裝物件且@出現在查詢字串', url: `mongodb://${U}:${P}@db.local:27017/?maxPoolSize=${P}&appName=svc@prod`, box: true, type: 'MongoParseError', expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
]

//getUrl, box為true者以String包裝物件傳入
let getUrl = (c) => (c.box ? new String(c.url) : c.url) // eslint-disable-line no-new-wrappers


describe('urlerr', function() {

    describe('驅動回顯憑證之連線字串: 11個公開函數 × 形態', function() {

        it('前提: 修改前驅動確實回顯(基準測試的有效性)', function() {
            let e = baseline(`mongodb://${U}:${P}`)
            assert.ok(e instanceof Error)
            assert.ok(e.message.indexOf(`${U}:${P}`) >= 0, e.message)
            assert.ok(String(e.cause.input).indexOf(`${U}:${P}`) >= 0, 'cause.input回顯')
        })

        for (let c of cases) {
            describe(c.label, function() {

                it('驅動原錯誤之類別與前綴(基準)', function() {
                    let e = baseline(getUrl(c))
                    assert.ok(e instanceof Error, '驅動應拋錯')
                    assert.strictEqual(e.constructor.name, c.type)
                })

                for (let [name, fn] of Object.entries(calls)) {
                    it(name, async function() {
                        let base = baseline(getUrl(c))
                        let w = WOrm({ url: getUrl(c), db: 'worm', cl: 'urlerr' })
                        let evs = []
                        w.on('error', (m, d, e) => evs.push(['error', m, e]))
                        w.on('change', (m) => evs.push(['change', m]))
                        let rej
                        try {
                            await fn(w)
                        }
                        catch (err) {
                            rej = err
                        }
                        assert.ok(rej instanceof Error, 'reject應為Error')
                        //類別、原型與訊息前綴不變
                        assert.strictEqual(rej.constructor.name, c.type)
                        assert.strictEqual(Object.getPrototypeOf(rej), Object.getPrototypeOf(base))
                        assert.strictEqual(rej.message, c.expect === null ? base.message : c.expect)
                        //帳密不出現在訊息、stack、cause鏈與inspect全展開
                        noMarks(allText(rej), `${name} `, c.allow, c.marks)
                        //error事件: 於reject當下即已恰一次, payload為同一訊息, change不發
                        assert.deepStrictEqual(evs, [['error', name, rej.message]])
                    })
                }

            })
        }

    })


    describe('其他', function() {

        it('建構函式之錯誤訊息為固定詞彙、不回顯值(含連線字串與帳密)', function() {
            let lone = String.fromCharCode(0xD800)
            for (let opt of [{ url: `mongodb://${U}:${P}@h${lone}` }, { url: `mongodb://${U}:${P}@h`, db: `d${lone}` }, { url: `mongodb://${U}:${P}@h`, cl: `c${lone}` }]) {
                let msg = null
                try {
                    WOrm(opt)
                }
                catch (err) {
                    assert.strictEqual(Object.getPrototypeOf(err), Error.prototype)
                    msg = err.message
                }
                assert.ok(msg !== null && /^invalid opt\.(url|db|cl): string contains lone surrogate$/.test(msg), String(msg))
                noMarks(msg)
            }
        })

        it('url非字串(數字、物件)時建構不丟例外, 操作之reject內容與驅動原錯誤相同', async function() {
            for (let url of [123, { a: 1 }, ['x']]) {
                let base = baseline(url)
                let w = WOrm({ url, db: 'worm', cl: 'urlerr' })
                let r = await w.select().then(() => null, (e) => e)
                assert.ok(base === null ? r === null : r.message === base.message, String(url))
            }
        })

        it('不影響其他錯誤: 非連線字串解析之錯誤(find白名單外)原樣reject', async function() {
            let w = WOrm({ url: `mongodb://${U}:${P}@127.0.0.1:1`, db: 'worm', cl: 'urlerr' })
            let r = await w.select({ $foo: 1 }).then(() => null, (e) => e)
            assert.strictEqual(r.message, 'invalid find: unsupported operator [$foo] at [find.$foo]')
        })

        it('合格連線字串: genClient不改變驅動行為(MongoClient仍由驅動建立, 使用同一url)', async function() {
            let urls = []
            let Orig = mongodb.MongoClient
            let desc = Object.getOwnPropertyDescriptor(mongodb, 'MongoClient')
            class Spy extends Orig {
                constructor(url, ...a) {
                    super(url, ...a)
                    urls.push(url)
                }
            }
            let w
            Object.defineProperty(mongodb, 'MongoClient', { configurable: true, enumerable: true, get: () => Spy })
            try {
                w = WOrm({ url: `mongodb://${U}:${P}@127.0.0.1:1/?serverSelectionTimeoutMS=500&connectTimeoutMS=500`, db: 'worm', cl: 'urlerr' })
            }
            finally {
                Object.defineProperty(mongodb, 'MongoClient', desc)
            }
            await w.select().catch(() => null)
            assert.deepStrictEqual(urls, [`mongodb://${U}:${P}@127.0.0.1:1/?serverSelectionTimeoutMS=500&connectTimeoutMS=500`])
        })

    })


    describe('Node實際輸出(未捕獲之reject印到stderr)', function() {

        let run = (url) => {
            return new Promise((resolve) => {
                let out = ''
                let p = spawn(process.execPath, ['./test/tools/urlerrWorker.mjs'], { shell: false, windowsHide: true, env: { ...process.env, URLX: url } })
                p.stdout.on('data', (d) => {
                    out += d.toString()
                })
                p.stderr.on('data', (d) => {
                    out += d.toString()
                })
                p.on('close', (code) => resolve({ code, out }))
            })
        }

        //環境變數只能傳字串, 故略過String包裝物件之案例
        for (let c of cases.filter((v) => v.expect !== null && !v.box)) {
            it(c.label, async function() {
                let { code, out } = await run(c.url)
                assert.notStrictEqual(code, 0, '未捕獲之reject應使行程失敗')
                assert.ok(out.indexOf(c.expect) >= 0, `stderr應含遮罩後之訊息[${c.expect}]: ${out.slice(0, 300)}`)
                noMarks(out, 'stderr ', c.allow, c.marks)
            })
        }

    })

})

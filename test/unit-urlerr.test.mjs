import util from 'util'
import assert from 'assert'
import mongodb from 'mongodb'
import { spawn } from 'child_process'
import WOrm from '../src/WOrmMongodb.mjs'
import { calls } from './tools/diagScenario.mjs'
import { build } from './tools/fakeMongo.mjs'
import { genLegacyErr } from './tools/urlerrLegacy.mjs'


//rulebook R-DIAG-01(依dspec〈診斷輸出與遮罩〉): 連線設定錯誤(new MongoClient(url)解析連線字串失敗)之訊息、stack與cause不回顯帳密
//本套件於各函數之批次catch經wsemi之diag.err(秘密由getDiagSecrets自opt.url導出, 樣式宣告mongoHostEcho)遮除憑證: 含憑證者為同類別(原型相同、instanceof同類)之副本,
//訊息前綴不變, 11個公開函數之reject與error事件所收到者為遮罩後之錯誤; 不含憑證者為驅動原物件
//不連線(各函數皆於new MongoClient階段失敗), 不需資料庫
//
//驅動版本與回顯(驅動mongodb 7.9.0 → 7.9.1之變化, 見規則帳本R-DIAG-01〈驅動版本與回顯〉):
//  7.9.0: 連線字串無法解析時回顯其片段(缺@主機之 mongodb://帳號:密碼 被當成host:port, 訊息為 Unable to parse 帳號:密碼 with URL, cause.input亦含; 選項值以 got: 值 回顯; 帳號段含/者回顯帳號; 無值之參數名整段回顯)
//  7.9.1: 上列形態不再回顯(訊息固定為 Unable to parse host with URL 且cause.input已移除、Expected 選項 to be stringified int value 不帶值、Username contains unescaped characters 不帶帳號、參數名以驅動自有清單之名稱取代),
//         唯整數值仍回顯(maxPoolSize、heartbeatFrequencyMS等 can only be a positive int value, got: 整數; family之 must be 4 or 6 got 整數), 故憑證為整數(或負整數)而被置於該等選項時仍會被驅動回顯
//本套件之遮罩是防護層, 不因驅動不再回顯而拆除(其他形態或日後之驅動版本仍可能回顯), 測試分三組:
//  1. 真驅動7.9.1之不回顯形態(37種): 本套件之輸出與驅動原錯誤逐字相同, 且含憑證之任何可見文字皆不出現(含不得過度遮罩之案)
//  2. 真驅動7.9.1仍回顯之形態(整數值): 回顯之憑證須被遮除, 回顯之非憑證(一般設定值、單獨帳號、合法整數)須原樣
//  3. 替身驅動(test/tools/urlerrLegacy.mjs, 經fakeMongo之ctor接縫)重現7.9.0之回顯形態: 證明遮罩(含樣式mongoHostEcho)對回顯之錯誤確有作用; 形態與期望沿用7.9.1以前之真驅動測試


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
let NP = '4815162342' //整數值之憑證(驅動7.9.1仍回顯整數值)
let NS = '90210' //authMechanismProperties之SERVICE_NAME值為整數: 一般設定值而非憑證, 不得被遮罩
let NU = '7316504' //整數之單獨帳號(依D3不遮)
let MARKS = [U, P, K, T, Z2, W, 'Zmy%20secret%20pw8', WP, 'Zmy Secret Pw1', SC, 'Za100', MN, PU, `${U}:${P}`, NP]


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


//noLeaks, 該案(替身驅動原錯誤)確實含有之憑證片段, 遮罩後之任何可見文字皆不得出現
let noLeaks = (text, msg, leaks = []) => {
    for (let s of leaks) {
        assert.ok(text.indexOf(s) < 0, `${msg}含憑證[${s}]: ${text.slice(0, 300)}`)
    }
}


//casesNoEcho, 真驅動7.9.1: 連線字串解析失敗但不回顯其片段之形態, type=驅動之錯誤類別, expect=null(本套件輸出之訊息與驅動原訊息相同)
//7.9.0時此等形態多數回顯帳密, 其回顯形態改由第3組(替身驅動)覆蓋
let casesNoEcho = [
    { label: '缺@主機: mongodb://帳號:密碼', url: `mongodb://${U}:${P}`, type: 'MongoRuntimeError', expect: null },
    { label: '缺@主機且帶資料庫名', url: `mongodb://${U}:${P}/db`, type: 'MongoRuntimeError', expect: null },
    { label: '反向書寫: host:port@帳號:密碼', url: `mongodb://h:27017@${U}:${P}`, type: 'MongoRuntimeError', expect: null },
    { label: 'port筆誤(host:abc)', url: `mongodb://${U}:${P}@db.local:abc`, type: 'MongoRuntimeError', expect: null },
    { label: '多主機中一項port筆誤', url: `mongodb://${U}:${P}@db.local:27017,db2.local:abc`, type: 'MongoRuntimeError', expect: null },
    { label: 'IPv6括號不成對', url: `mongodb://${U}:${P}@[::1`, type: 'MongoRuntimeError', expect: null },
    { label: 'port超出範圍(host:99999)', url: `mongodb://${U}:${P}@db.local:99999`, type: 'MongoRuntimeError', expect: null },
    { label: '查詢參數憑證值置於maxPoolSize(非整數)', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${K}&maxPoolSize=${K}`, type: 'MongoParseError', expect: null },
    { label: '查詢參數憑證值為子字串', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${K}&maxPoolSize=x${K}y`, type: 'MongoParseError', expect: null },
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
    { label: '不含憑證之port筆誤', url: 'mongodb://db.local:abc', type: 'MongoRuntimeError', expect: null },
    //以下為外審(Argon)探測所揭露之形態
    { label: '帳號段含驅動拒收之未編碼字元(/)', url: `mongodb://CORP/${U}:${P}@db.local:27017`, type: 'MongoParseError', expect: null },
    { label: '帳號段含/且「密碼」寫在帳號位置', url: `mongodb://${U}/${Z2}:123@db.local:27017`, type: 'MongoParseError', expect: null },
    { label: '@出現在查詢字串(appName=svc@prod)', url: `mongodb://${U}:${P}@db.local:27017/mydb?maxPoolSize=${P}&appName=svc@prod`, type: 'MongoParseError', expect: null },
    { label: '@出現在查詢字串且缺@主機(反向書寫)', url: `mongodb://h:27017@${U}:${P}/mydb?appName=svc@prod`, type: 'MongoRuntimeError', expect: null },
    { label: '缺@主機且密碼含空白', url: `mongodb://${U}:${W}`, type: 'MongoRuntimeError', expect: null },
    { label: '反向書寫且密碼含空白', url: `mongodb://h:27017@${U}:${W}`, type: 'MongoRuntimeError', expect: null },
    { label: '查詢參數憑證值含+', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword=${WP}&maxPoolSize=${WP}`, type: 'MongoParseError', expect: null },
    { label: '查詢參數憑證值含;', url: `mongodb://u1:p1@db.local:27017/?proxyPassword=Abc;${SC}&maxPoolSize=Abc;${SC}`, type: 'MongoParseError', expect: null },
    { label: '查詢參數憑證值含不完整之百分比編碼', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword=${PC}&maxPoolSize=${PC}`, type: 'MongoParseError', expect: null },
    { label: 'authMechanismProperties內名稱含TOKEN之屬性值', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=AWS_SESSION_TOKEN:${T}&maxPoolSize=${T}`, type: 'MongoParseError', expect: null },
    { label: 'authMechanismProperties內SERVICE_NAME為一般設定值: 不得遮罩', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=SERVICE_NAME:${S}&maxPoolSize=${S}`, type: 'MongoParseError', expect: null },
    //7.9.0以 URI option "整段參數" cannot be specified with no value 回顯無=之參數(MongoAPIError); 7.9.1改於選項名稱檢核時只報其位置(MongoParseError)
    { label: '無=之參數(名稱含Password)', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword:${MN}`, type: 'MongoParseError', expect: null },
    //proxyUsername之值為單獨帳號(非憑證): 依dspec〈診斷輸出與遮罩〉D3對外錯誤值只遮憑證、不遮單獨帳號
    { label: 'proxyUsername之值置於maxPoolSize(單獨帳號: 依D3不遮)', url: `mongodb://db.local:27017/?proxyHost=p.local&proxyUsername=${PU}&proxyPassword=Zpp456&maxPoolSize=${PU}`, type: 'MongoParseError', expect: null, allow: [PU] },
    { label: 'proxyPassword之值置於maxPoolSize', url: `mongodb://db.local:27017/?proxyHost=p.local&proxyUsername=${PU}&proxyPassword=Zpp456&maxPoolSize=Zpp456`, type: 'MongoParseError', expect: null, marks: ['Zpp456'] },
    { label: 'checkKeys=true為布林選項, 不得因參數名含key而把訊息中的true遮罩', url: `mongodb://${U}:${P}@db.local:27017/?checkKeys=true&tls=bad`, type: 'MongoParseError', expect: null },
    { label: 'url為String包裝物件(驅動接受)', url: `mongodb://${U}:${P}`, box: true, type: 'MongoRuntimeError', expect: null },
    { label: 'url為String包裝物件且@出現在查詢字串', url: `mongodb://${U}:${P}@db.local:27017/?maxPoolSize=${P}&appName=svc@prod`, box: true, type: 'MongoParseError', expect: null },
]


//casesEcho, 真驅動7.9.1仍回顯之形態(整數值): echoes=驅動原錯誤確實含有之片段(基準測試的有效性之前提), expect=遮罩後之訊息(null表示回顯者非憑證, 須與驅動原訊息相同)
//整數(或負整數)之憑證置於以整數檢核之選項(maxPoolSize、heartbeatFrequencyMS、family)時, 驅動訊息帶出該整數
let casesEcho = [
    { label: '憑證為負整數(tlsCertificateKeyFilePassword)置於maxPoolSize', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=-${NP}&maxPoolSize=-${NP}`, type: 'MongoParseError', echoes: [NP], expect: 'maxPoolSize can only be a positive int value, got: ***' },
    { label: '憑證為整數(tlsCertificateKeyFilePassword)置於family', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${NP}&family=${NP}`, type: 'MongoParseError', echoes: [NP], expect: 'Option \'family\' must be 4 or 6 got ***.' },
    { label: '憑證為負整數(proxyPassword)置於heartbeatFrequencyMS', url: `mongodb://u1:p1@db.local:27017/?proxyPassword=-${NP}&heartbeatFrequencyMS=-${NP}`, type: 'MongoParseError', echoes: [NP], expect: 'heartbeatFrequencyMS can only be a positive int value, got: ***' },
    { label: '連線字串之密碼為整數, 同值置於family', url: `mongodb://u1:${NP}@db.local:27017/?family=${NP}`, type: 'MongoParseError', echoes: [NP], expect: 'Option \'family\' must be 4 or 6 got ***.' },
    { label: '連線字串之密碼為負整數, 同值置於maxPoolSize', url: `mongodb://u1:-${NP}@db.local:27017/?maxPoolSize=-${NP}`, type: 'MongoParseError', echoes: [NP], expect: 'maxPoolSize can only be a positive int value, got: ***' },
    { label: 'authMechanismProperties內SERVICE_NAME為整數之一般設定值被回顯: 不得遮罩', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=SERVICE_NAME:${NS}&family=${NS}`, type: 'MongoParseError', echoes: [NS], expect: null },
    { label: '整數之單獨帳號被回顯(依D3不遮)', url: `mongodb://${NU}:p1@db.local:27017/?family=${NU}`, type: 'MongoParseError', echoes: [NU], expect: null },
    { label: '合法之整數選項值(family=5)被回顯: 不得遮罩', url: 'mongodb://u1:p1@db.local:27017/?family=5', type: 'MongoParseError', echoes: ['5'], expect: null },
]


//legacyCases, 替身驅動重現驅動7.9.0之回顯形態: raw={ type, msg, input }見test/tools/urlerrLegacy.mjs, leaks=原錯誤確實含有、遮罩後不得出現之憑證片段, expect=遮罩後之訊息(null表示與原訊息相同)
//僅列7.9.0與7.9.1原訊息不同者(7.9.1不變之固定訊息形態於casesNoEcho已涵蓋); url、expect、allow、marks沿用7.9.1以前之真驅動案
let hostErr = (host) => ({ type: 'MongoRuntimeError', msg: `Unable to parse ${host} with URL`, input: `iLoveJS://${host}` })
let intErr = (v) => ({ type: 'MongoParseError', msg: `Expected maxPoolSize to be stringified int value, got: ${v}` })
let legacyCases = [
    { label: '缺@主機: mongodb://帳號:密碼', url: `mongodb://${U}:${P}`, raw: hostErr(`${U}:${P}`), leaks: [`${U}:${P}`, U, P], expect: 'Unable to parse *** with URL' },
    { label: '缺@主機且帶資料庫名', url: `mongodb://${U}:${P}/db`, raw: hostErr(`${U}:${P}`), leaks: [`${U}:${P}`, U, P], expect: 'Unable to parse *** with URL' },
    { label: '反向書寫: host:port@帳號:密碼', url: `mongodb://h:27017@${U}:${P}`, raw: hostErr(`${U}:${P}`), leaks: [`${U}:${P}`, U, P], expect: 'Unable to parse *** with URL' },
    { label: 'port筆誤(host:abc)', url: `mongodb://${U}:${P}@db.local:abc`, raw: hostErr('db.local:abc'), expect: 'Unable to parse *** with URL' },
    { label: '多主機中一項port筆誤', url: `mongodb://${U}:${P}@db.local:27017,db2.local:abc`, raw: hostErr('db2.local:abc'), expect: 'Unable to parse *** with URL' },
    { label: 'IPv6括號不成對', url: `mongodb://${U}:${P}@[::1`, raw: hostErr('[::1'), expect: 'Unable to parse *** with URL' },
    { label: 'port超出範圍(host:99999)', url: `mongodb://${U}:${P}@db.local:99999`, raw: hostErr('db.local:99999'), expect: 'Unable to parse db.local:99999 with URL' },
    { label: '查詢參數憑證值被驅動回顯(maxPoolSize=憑證)', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${K}&maxPoolSize=${K}`, raw: intErr(K), leaks: [K], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '查詢參數憑證值為子字串', url: `mongodb://${U}:${P}@db.local:27017/?tlsCertificateKeyFilePassword=${K}&maxPoolSize=x${K}y`, raw: intErr(`x${K}y`), leaks: [K], expect: 'Expected maxPoolSize to be stringified int value, got: x***y' },
    { label: '單字元帳號段不得把訊息中的同字元一併遮罩(Expected含x)', url: 'mongodb://x@db.local:27017/?maxPoolSize=abc', raw: intErr('abc'), expect: null },
    { label: '帳號為3字元以上且恰為訊息中的字樣(Exp)不得被遮罩(連線設定錯誤之遮罩不含單獨帳號)', url: `mongodb://Exp:${P}@db.local:27017/?maxPoolSize=abc`, raw: intErr('abc'), expect: null },
    { label: '兩字元帳號:密碼不得把訊息中的同字元一併遮罩', url: 'mongodb://ex:pe@db.local:27017/?maxPoolSize=abc', raw: intErr('abc'), expect: null },
    { label: '不含憑證之port筆誤(無@時整段主機位址項視為憑證)', url: 'mongodb://db.local:abc', raw: hostErr('db.local:abc'), expect: 'Unable to parse *** with URL' },
    //以下為外審(Argon)探測所揭露之形態
    //帳號段含/者: wsemi之getDiagSecrets把「/」兩側之片段(畸形網址之權限段與帳號片段)各列為憑證, 故驅動回顯之 CORP/帳號 遮為 ***/***(修改前為整段單一***; 皆不含憑證)
    { label: '帳號段含驅動拒收之未編碼字元(/): 驅動回顯帳號', url: `mongodb://CORP/${U}:${P}@db.local:27017`, raw: { type: 'MongoParseError', msg: `Username contains unescaped characters CORP/${U}` }, leaks: [U], expect: 'Username contains unescaped characters ***/***' },
    { label: '帳號段含/且「密碼」寫在帳號位置', url: `mongodb://${U}/${Z2}:123@db.local:27017`, raw: { type: 'MongoParseError', msg: `Username contains unescaped characters ${U}/${Z2}` }, leaks: [U, Z2], expect: 'Username contains unescaped characters ***/***' },
    { label: '@出現在查詢字串(appName=svc@prod): 單獨密碼被驅動回顯', url: `mongodb://${U}:${P}@db.local:27017/mydb?maxPoolSize=${P}&appName=svc@prod`, raw: intErr(P), leaks: [P], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '@出現在查詢字串且缺@主機(反向書寫)', url: `mongodb://h:27017@${U}:${P}/mydb?appName=svc@prod`, raw: hostErr(`${U}:${P}`), leaks: [`${U}:${P}`, U, P], expect: 'Unable to parse *** with URL' },
    { label: '缺@主機且密碼含空白: 驅動將空白正規化為%20後回顯', url: `mongodb://${U}:${W}`, raw: hostErr(`${U}:Zmy%20secret%20pw8`), leaks: [U, 'Zmy%20secret%20pw8'], expect: 'Unable to parse *** with URL' },
    { label: '反向書寫且密碼含空白', url: `mongodb://h:27017@${U}:${W}`, raw: hostErr(`${U}:Zmy%20secret%20pw8`), leaks: [U, 'Zmy%20secret%20pw8'], expect: 'Unable to parse *** with URL' },
    { label: '查詢參數憑證值含+(驅動視為空白後回顯)', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword=${WP}&maxPoolSize=${WP}`, raw: intErr('Zmy Secret Pw1'), leaks: ['Zmy Secret Pw1'], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '查詢參數憑證值含;', url: `mongodb://u1:p1@db.local:27017/?proxyPassword=Abc;${SC}&maxPoolSize=Abc;${SC}`, raw: intErr(`Abc;${SC}`), leaks: [SC], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: '查詢參數憑證值含不完整之百分比編碼', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword=${PC}&maxPoolSize=${PC}`, raw: intErr('Za100%sure!'), leaks: ['Za100'], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: 'authMechanismProperties內名稱含TOKEN之屬性值', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=AWS_SESSION_TOKEN:${T}&maxPoolSize=${T}`, raw: intErr(T), leaks: [T], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
    { label: 'authMechanismProperties內SERVICE_NAME為一般設定值: 不得遮罩', url: `mongodb://u1:p1@db.local:27017/?authMechanismProperties=SERVICE_NAME:${S}&maxPoolSize=${S}`, raw: intErr(S), expect: null },
    { label: '無=之參數(名稱含Password)被驅動整段回顯', url: `mongodb://u1:p1@db.local:27017/?tlsCertificateKeyFilePassword:${MN}`, raw: { type: 'MongoAPIError', msg: `URI option "tlsCertificateKeyFilePassword:${MN}" cannot be specified with no value` }, leaks: [MN], expect: 'URI option "***" cannot be specified with no value' },
    //proxyUsername之值為單獨帳號(非憑證): 依dspec〈診斷輸出與遮罩〉D3對外錯誤值只遮憑證、不遮單獨帳號(修改前遮罩), 故驅動回顯之帳號值原樣; 其與proxyPassword之並列形式、proxyPassword之值仍遮罩(見下一案)
    { label: 'proxyUsername之值被驅動回顯(單獨帳號: 依D3不遮)', url: `mongodb://db.local:27017/?proxyHost=p.local&proxyUsername=${PU}&proxyPassword=Zpp456&maxPoolSize=${PU}`, raw: intErr(PU), expect: null, allow: [PU] },
    { label: 'proxyPassword之值被驅動回顯: 遮罩', url: `mongodb://db.local:27017/?proxyHost=p.local&proxyUsername=${PU}&proxyPassword=Zpp456&maxPoolSize=Zpp456`, raw: intErr('Zpp456'), leaks: ['Zpp456'], expect: 'Expected maxPoolSize to be stringified int value, got: ***', marks: ['Zpp456'] },
    { label: 'url為String包裝物件(驅動接受)', url: `mongodb://${U}:${P}`, box: true, raw: hostErr(`${U}:${P}`), leaks: [`${U}:${P}`, U, P], expect: 'Unable to parse *** with URL' },
    { label: 'url為String包裝物件且@出現在查詢字串', url: `mongodb://${U}:${P}@db.local:27017/?maxPoolSize=${P}&appName=svc@prod`, box: true, raw: intErr(P), leaks: [P], expect: 'Expected maxPoolSize to be stringified int value, got: ***' },
]

//getUrl, box為true者以String包裝物件傳入
let getUrl = (c) => (c.box ? new String(c.url) : c.url) // eslint-disable-line no-new-wrappers

//collect, 呼叫一個公開函數並蒐集reject值與error、change事件
let collect = async (w, fn) => {
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
    return { rej, evs }
}


describe('urlerr', function() {

    describe('真驅動(7.9.1): 解析失敗之訊息不回顯連線字串之片段: 本套件之輸出與驅動原錯誤相同且不含憑證, 11個公開函數 × 形態', function() {

        it('前提: 驅動7.9.1不回顯連線字串之片段(7.9.0為 Unable to parse 帳號:密碼 with URL 且cause.input含之; 若驅動日後再度回顯, 本案轉紅, 須把該形態改列casesEcho)', function() {
            let e = baseline(`mongodb://${U}:${P}`)
            assert.ok(e instanceof Error)
            assert.strictEqual(e.constructor.name, 'MongoRuntimeError')
            assert.ok(e.message.indexOf('Unable to parse') === 0, e.message)
            noMarks(allText(e), '驅動原錯誤')
        })

        for (let c of casesNoEcho) {
            describe(c.label, function() {

                it('驅動原錯誤之類別(基準)與不回顯(若驅動日後回顯該形態, 本案轉紅, 須改列casesEcho並補expect)', function() {
                    let e = baseline(getUrl(c))
                    assert.ok(e instanceof Error, '驅動應拋錯')
                    assert.strictEqual(e.constructor.name, c.type)
                    noMarks(allText(e), '驅動原錯誤', c.allow, c.marks)
                })

                for (let [name, fn] of Object.entries(calls)) {
                    it(name, async function() {
                        let base = baseline(getUrl(c))
                        let w = WOrm({ url: getUrl(c), db: 'worm', cl: 'urlerr' })
                        let { rej, evs } = await collect(w, fn)
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


    describe('真驅動(7.9.1)仍回顯整數值: 回顯之憑證須遮除, 回顯之非憑證須原樣, 11個公開函數 × 形態', function() {

        it('前提: 驅動7.9.1對整數值仍回顯(基準測試的有效性): 憑證為整數之形態其原錯誤確實含該憑證', function() {
            let hit = 0
            for (let c of casesEcho.filter((v) => v.echoes.indexOf(NP) >= 0)) {
                let e = baseline(getUrl(c))
                assert.ok(e instanceof Error, c.label)
                assert.ok(e.message.indexOf(NP) >= 0, `${c.label}: ${e.message}`)
                hit++
            }
            assert.strictEqual(hit, 5)
        })

        for (let c of casesEcho) {
            describe(c.label, function() {

                it('驅動原錯誤之類別(基準)與回顯之片段', function() {
                    let e = baseline(getUrl(c))
                    assert.ok(e instanceof Error, '驅動應拋錯')
                    assert.strictEqual(e.constructor.name, c.type)
                    let text = allText(e)
                    for (let s of c.echoes) {
                        assert.ok(text.indexOf(s) >= 0, `驅動原錯誤應回顯[${s}]: ${text.slice(0, 300)}`)
                    }
                })

                for (let [name, fn] of Object.entries(calls)) {
                    it(name, async function() {
                        let base = baseline(getUrl(c))
                        let w = WOrm({ url: getUrl(c), db: 'worm', cl: 'urlerr' })
                        let { rej, evs } = await collect(w, fn)
                        assert.ok(rej instanceof Error, 'reject應為Error')
                        assert.strictEqual(rej.constructor.name, c.type)
                        assert.strictEqual(Object.getPrototypeOf(rej), Object.getPrototypeOf(base))
                        assert.strictEqual(rej.message, c.expect === null ? base.message : c.expect)
                        noMarks(allText(rej), `${name} `, c.allow, c.marks)
                        assert.deepStrictEqual(evs, [['error', name, rej.message]])
                    })
                }

            })
        }

    })


    describe('替身驅動重現7.9.0之回顯形態(經fakeMongo之ctor接縫): 遮罩(含樣式mongoHostEcho)須對回顯之錯誤有作用, 11個公開函數 × 形態', function() {

        it('前提: 替身確實回顯(基準測試的有效性): 訊息與cause.input皆含帳密(7.9.0之形態), 類別為驅動之類別', function() {
            let raw = hostErr(`${U}:${P}`)
            let e = genLegacyErr(raw)
            assert.ok(e instanceof mongodb.MongoRuntimeError)
            assert.strictEqual(e.message, `Unable to parse ${U}:${P} with URL`)
            assert.ok(e.cause instanceof TypeError)
            assert.strictEqual(e.cause.input, `iLoveJS://${U}:${P}`)
            let text = allText(e)
            for (let s of [U, P, `${U}:${P}`]) {
                assert.ok(text.indexOf(s) >= 0, s)
            }
            //每次呼叫為新物件(同genClient每次皆重新建立MongoClient而拋新錯誤)
            assert.notStrictEqual(genLegacyErr(raw), e)
        })

        for (let c of legacyCases) {
            describe(c.label, function() {

                it('替身原錯誤之類別(基準)與回顯之片段', function() {
                    let e = genLegacyErr(c.raw)
                    assert.ok(e instanceof Error)
                    assert.ok(e instanceof mongodb[c.raw.type], c.raw.type)
                    assert.strictEqual(e.constructor.name, c.raw.type)
                    let text = allText(e)
                    for (let s of c.leaks || []) {
                        assert.ok(text.indexOf(s) >= 0, `替身原錯誤應回顯[${s}]: ${text.slice(0, 300)}`)
                    }
                })

                for (let [name, fn] of Object.entries(calls)) {
                    it(name, async function() {
                        let base = genLegacyErr(c.raw)
                        let { w } = build({ ctor: () => genLegacyErr(c.raw) }, { url: getUrl(c), db: 'worm', cl: 'urlerr' })
                        let { rej, evs } = await collect(w, fn)
                        assert.ok(rej instanceof Error, 'reject應為Error')
                        //類別、原型與訊息前綴不變
                        assert.strictEqual(rej.constructor.name, c.raw.type)
                        assert.strictEqual(Object.getPrototypeOf(rej), Object.getPrototypeOf(base))
                        assert.strictEqual(rej.message, c.expect === null ? c.raw.msg : c.expect)
                        //帳密不出現在訊息、stack、cause鏈與inspect全展開
                        let text = allText(rej)
                        noMarks(text, `${name} `, c.allow, c.marks)
                        noLeaks(text, `${name} `, c.leaks)
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

        //legacy有給時以替身驅動(重現7.9.0之回顯形態), 無則真驅動
        let run = (url, legacy = null) => {
            return new Promise((resolve) => {
                let out = ''
                let env = { ...process.env, URLX: url }
                delete env.LEGACY
                if (legacy !== null) {
                    env.LEGACY = JSON.stringify(legacy)
                }
                let p = spawn(process.execPath, ['./test/tools/urlerrWorker.mjs'], { shell: false, windowsHide: true, env })
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
        for (let c of casesEcho.filter((v) => v.expect !== null && !v.box)) {
            it(`真驅動: ${c.label}`, async function() {
                let { code, out } = await run(c.url)
                assert.notStrictEqual(code, 0, '未捕獲之reject應使行程失敗')
                assert.ok(out.indexOf(c.expect) >= 0, `stderr應含遮罩後之訊息[${c.expect}]: ${out.slice(0, 300)}`)
                noMarks(out, 'stderr ', c.allow, c.marks)
            })
        }

        for (let c of legacyCases.filter((v) => v.expect !== null && !v.box)) {
            it(`替身驅動(7.9.0之回顯形態): ${c.label}`, async function() {
                let { code, out } = await run(c.url, c.raw)
                assert.notStrictEqual(code, 0, '未捕獲之reject應使行程失敗')
                assert.ok(out.indexOf(c.expect) >= 0, `stderr應含遮罩後之訊息[${c.expect}]: ${out.slice(0, 300)}`)
                noMarks(out, 'stderr ', c.allow, c.marks)
                noLeaks(out, 'stderr ', c.leaks)
            })
        }

    })

})

//診斷輸出之單一出口(R-DIAG-01): src內所有console輸出皆經getDiag回傳之diag, 除本檔外不得直接呼叫console
//預設只輸出固定標籤與不含個資之摘要(不含資料值、id、後端錯誤原文); 連線字串與帳密於任何輸出(含logDetail與funLog之細節)一律以***遮罩
//選項名稱與語意比照w-serv-orm: opt.logDetail(還原細節輸出)、opt.funLog(label, safe, detail)(取代console收完整細節)
//不使用Node內建模組(util等): dist由rollup打包, gDistRollup.mjs之external只列events、stream、mongodb, 內建模組未列者會被當成未解析之外部相依


//遮罩字串
const MASK = '***'

//cpMask之上限: 深度, 處理的節點與鍵合計數; 超過者以標記字串代替(不交出原參照)
const CP_DEPTH = 6
const CP_MAX = 2000

//maskErr追溯cause鏈之深度上限
const CAUSE_DEPTH = 5

//getSecrets之最短長度: 短於此者(如單字元帳號段、兩字元密碼)遮罩會把標籤、錯誤訊息、堆疊與路徑中的同字元一併吞掉, 不列入; 其本身亦無保密價值
const SECRET_MIN = 3

//錯誤類別名稱的白名單樣式: 只放行建構子名稱(程式識別字), 其餘(可能夾帶資料值之文字)不進預設輸出
const RE_ERR_TYPE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/

//錯誤代碼的白名單樣式: 系統慣用之機器代碼(ENOENT、ECONNREFUSED、EAI_AGAIN、ERR_xxx), E開頭者僅放行大寫字母與底線(不含數字, 避免放行E加數字之業務編號); 整數另行判斷
const RE_ERR_CODE = /^(E[A-Z_]{2,30}|ERR_[A-Z0-9_]{1,40})$/

//連線字串內嵌之帳密(scheme://帳密@主機), 不依賴已知秘密亦遮罩; 帳密部分含未編碼之@時取至最後一個@(至空白、/、?、#或引號為止)
const RE_URL_CRED = /([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^\s/?#'"]*@/g

//Error的stack於V8為自有存取器, 其getter為同一realm內共用的內建函數: 僅當描述子的getter與此相同才讀取(不執行使用端程式)
const STACK_GETTER = (() => {
    try {
        let d = Object.getOwnPropertyDescriptor(new Error(), 'stack')
        return d !== undefined && !Object.prototype.hasOwnProperty.call(d, 'value') && typeof d.get === 'function' ? d.get : null
    }
    catch (e) {
        return null
    }
})()

//二進位資料byteLength的內建getter(不讀使用端可覆寫之自有存取器)
const BL_AB = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get
const BL_TA = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get
const BL_DV = Object.getOwnPropertyDescriptor(DataView.prototype, 'byteLength').get

//主機位址(單一項)可回顯之樣式: [主機名稱或[IPv6]][:最多5位數字之port]; 其餘(如被當成主機之 帳號:密碼)視為憑證
const RE_HOSTPORT = /^(?:[A-Za-z0-9._-]+|\[[0-9A-Fa-f:.]+\])(?::[0-9]{1,5})?$/

//連線字串查詢參數中, 參數名稱含下列字樣者其值視為憑證(如tlsCertificateKeyFilePassword、proxyPassword、proxyUsername、AWS_SESSION_TOKEN); 不含單獨之key(如checkKeys為布林選項)
const RE_SECRET_KEY = /pass|pwd|secret|token|credential|user/i

//驅動(HostAddress)解析主機位址失敗時回顯之文字: 訊息 Unable to parse <主機位址> with URL, cause的input為 iLoveJS://<主機位址>
const RE_HOST_ECHO_MSG = /(Unable to parse )([^\r\n]*?)( with URL)/g
const RE_HOST_ECHO_INPUT = /(iLoveJS:\/\/)(\S*)/g

//摘要中不經遮罩之鍵: 由本套件以固定詞彙(函數名)填入, 不可能夾帶個資; 若讓短秘密把它遮成 s***l***ct 反而破壞輸出
const SAFE_FIXED_KEYS = ['mode']


function getOptLog(opt) {
    //診斷輸出的設定, 供WOrmMongodb建構時使用, 回傳固定快照{ logDetail, funLog }, 其後各路徑共用此快照, 不再讀取使用端的opt
    //型別錯誤者忽略並用預設(安全輸出), 讀取opt拋錯者亦同, 與本套件其他選項(autoGenPk型別錯誤即用預設)一致; 各選項分別讀取, 單一getter拋錯只丟該選項
    //logDetail: 須為true才生效, 預設false; true時console輸出還原為含錯誤原文的完整細節(連線憑證仍遮罩), 供除錯
    //funLog: 須為函數才生效, 預設無; 給予時診斷輸出只交給它(不寫console), detail為完整細節(連線憑證仍遮罩), 供使用端遮罩或轉送
    let logDetail = false
    try {
        logDetail = opt.logDetail === true
    }
    catch (e) {
        //忽略
    }
    let funLog = null
    try {
        let f = opt.funLog
        funLog = typeof f === 'function' ? f : null
    }
    catch (e) {
        //忽略
    }
    return { logDetail, funLog }
}


function lenientDecode(s) {
    //百分比解碼(寬鬆): 只解碼合法之%XX序列(連續者整段以decodeURIComponent解碼, 失敗則保留原樣), 其餘字元(含不合法之%)照留; 與驅動(WHATWG URL)的容錯行為一致, 使 a100%sure%21 這類不完整編碼亦能得到驅動回顯之形式
    return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (m) => {
        try {
            return decodeURIComponent(m)
        }
        catch (e) {
            return m
        }
    })
}


function addForms(set, s) {
    //把字串的各種可能回顯形式加入集合: 原樣、寬鬆解碼、各自之URL編碼(含大寫十六進位與空白編成%20之形式)、驅動將空白換成%20之形式
    if (typeof s !== 'string' || s.length < SECRET_MIN) {
        return //過短者不列(其編碼形式如 : 的 %3A 亦不列)
    }
    let d = lenientDecode(s)
    for (let x of [s, d]) {
        set.add(x)
        set.add(x.split(' ').join('%20'))
        try {
            set.add(encodeURIComponent(x))
        }
        catch (e) {
            //孤立代理碼元無法編碼, 略過
        }
    }
}


function addQueryForms(set, v) {
    //查詢參數值的回顯形式: 另含 + 視為空白之形式(URLSearchParams)與以;分段之各段
    addForms(set, v)
    addForms(set, v.replace(/\+/g, ' '))
    if (v.indexOf(';') >= 0) {
        for (let p of v.split(';')) {
            addForms(set, p)
        }
    }
}


function getSecrets(url, isConn = false) {
    //連線憑證清單(長者在前, 使長字串先被遮罩): 連線字串、帳密段(含未編碼之@)、密碼、帳號、各主機位址項、查詢參數中名稱含pass/pwd/secret/token/credential/user者之值,
    //各取原樣、寬鬆解碼、URL編碼等形式(連線字串內之帳密為百分比編碼, 使用端程式碼中通常是解碼後之原字串, 驅動回顯時則可能是另一種正規化形式)
    //帳密段以兩種方式解析並取聯集: 嚴格(只取到第一個/、?或#之前, 最後一個@為界)與寬鬆(整串取最後一個@, 密碼含未編碼之/或?時)——僅用其一, 查詢字串或路徑含@時會誤判
    //主機位址項: 有@時, @之後各項須合主機樣式(RE_HOSTPORT)才可回顯, 不合者(如反向書寫時落在@後的 帳號:密碼)視為憑證; 無@時全部視為憑證(host:port會被驅動當成帳號:密碼之筆誤形態)
    //isConn為true者供連線設定錯誤(maskErr)使用: 不含單獨之帳號(除非含驅動拒收的未編碼字元 / ? # [ ] @ , 驅動會把它回顯於 Username contains unescaped characters), 不含短於4字元之單獨密碼與查詢值, 避免把錯誤類別名稱、路徑等無關文字一併吞掉
    //短於SECRET_MIN者一律不列入; 單獨帳號出現時至少3字元才遮罩, 其與密碼並列之形式(帳號:密碼、連線字串、帳密段)不受單獨長度限制
    //url可為字串或String包裝物件(驅動接受); 不丟例外: 其他型別或解析失敗回傳空陣列
    try {
        let u = typeof url === 'string' ? url : (url instanceof String ? String.prototype.valueOf.call(url) : null)
        if (typeof u !== 'string' || u === '') {
            return []
        }
        let set = new Set()
        addForms(set, u)
        let i = u.indexOf('://')
        let rest = i >= 0 ? u.slice(i + 3) : u

        //帳密段與主機段: 嚴格與寬鬆兩種解析
        let parses = []
        let end = rest.search(/[/?#]/)
        let authority = end >= 0 ? rest.slice(0, end) : rest
        let at1 = authority.lastIndexOf('@')
        parses.push({ info: at1 >= 0 ? authority.slice(0, at1) : null, hostPart: at1 >= 0 ? authority.slice(at1 + 1) : authority })
        let at2 = rest.lastIndexOf('@')
        if (at2 >= 0 && at2 !== at1) {
            parses.push({ info: rest.slice(0, at2), hostPart: rest.slice(at2 + 1).split(/[/?#]/)[0] })
        }
        for (let { info, hostPart } of parses) {
            if (info !== null) {
                let ci = info.indexOf(':')
                if (ci >= 0) {
                    addForms(set, info) //帳號:密碼並列形式; 無冒號者為單獨帳號, 依下方帳號規則判斷
                }
                let user = ci >= 0 ? info.slice(0, ci) : info
                let pass = ci >= 0 ? info.slice(ci + 1) : null
                if (pass !== null && pass.length >= (isConn ? 4 : SECRET_MIN)) {
                    addForms(set, pass)
                }
                if (isConn ? /[/?#[\]@]/.test(user) : user.length >= SECRET_MIN) {
                    addForms(set, user)
                }
            }
            for (let h of hostPart.split(',')) {
                if (h !== '' && (info === null || !RE_HOSTPORT.test(h))) {
                    addForms(set, h)
                }
            }
        }

        //查詢參數
        let qi = u.indexOf('?')
        if (qi >= 0) {
            let q = u.slice(qi + 1).split('#')[0]
            for (let part of q.split('&')) {
                let ei = part.indexOf('=')
                let k = lenientDecode((ei >= 0 ? part.slice(0, ei) : part).replace(/\+/g, ' '))
                if (ei < 0) {
                    //無=之參數會被驅動整段回顯(URI option "<整段>" cannot be specified with no value)
                    if (RE_SECRET_KEY.test(k)) {
                        addForms(set, part)
                    }
                    continue
                }
                let v = part.slice(ei + 1)
                if (v.length < (isConn ? 4 : SECRET_MIN)) {
                    continue
                }
                if (RE_SECRET_KEY.test(k)) {
                    addQueryForms(set, v)
                }
                else if (k.toLowerCase() === 'authmechanismproperties') {
                    //SERVICE_NAME:x,AWS_SESSION_TOKEN:y 形式: 僅名稱含pass/pwd/secret/token/credential/user之屬性值視為憑證(SERVICE_NAME等為一般設定值)
                    for (let item of lenientDecode(v.replace(/\+/g, ' ')).split(',')) {
                        let ii = item.indexOf(':')
                        if (ii > 0 && RE_SECRET_KEY.test(item.slice(0, ii)) && item.length - ii - 1 >= (isConn ? 4 : SECRET_MIN)) {
                            addQueryForms(set, item.slice(ii + 1))
                        }
                    }
                }
            }
        }
        return [...set].filter((s) => s.length >= SECRET_MIN).sort((a, b) => b.length - a.length)
    }
    catch (e) {
        return []
    }
}


function getNums(secrets) {
    //秘密中純數字且至少4位者(如數字密碼): 數值型別之同值亦須遮罩; 過短者(如1)遮罩會吞掉大量無關數值, 不納入
    return new Set(secrets.filter((s) => /^[0-9]{4,}$/.test(s)))
}


function maskText(s, secrets = []) {
    //字串中之憑證以***取代: 已知秘密(getSecrets)、scheme://帳密@(帳密含@時取至最後一個@)
    if (typeof s !== 'string') {
        return s
    }
    let r = s
    for (let sec of secrets) {
        if (r.indexOf(sec) >= 0) {
            r = r.split(sec).join(MASK)
        }
    }
    return r.replace(RE_URL_CRED, `$1${MASK}@`)
}


function isSafeHosts(x) {
    //驅動回顯之主機位址項是否可保留: 空字串或各項(以,分隔)皆合主機樣式
    return x === '' || x.split(',').every((h) => RE_HOSTPORT.test(h))
}


function maskHostEcho(s) {
    //驅動解析主機位址失敗時回顯之文字(不依賴已知秘密): 不合主機樣式者以***取代; 驅動回顯前會把空白等字元正規化成%20,
    //與連線字串原文不同,僅靠已知秘密之字串比對遮罩不到
    if (typeof s !== 'string') {
        return s
    }
    return s
        .replace(RE_HOST_ECHO_MSG, (m, a, x, b) => (isSafeHosts(x) ? m : `${a}${MASK}${b}`))
        .replace(RE_HOST_ECHO_INPUT, (m, a, x) => (isSafeHosts(x) ? m : `${a}${MASK}`))
}


function maskKey(k, c) {
    //屬性鍵之遮罩: 字串鍵與Symbol之描述文字皆可能含憑證
    if (typeof k === 'string') {
        return maskText(k, c.secrets)
    }
    let d = k.description
    let m = typeof d === 'string' ? maskText(d, c.secrets) : d
    return m === d ? k : Symbol(m)
}


function maskSafe(safe, secrets, nums) {
    //safe摘要之防禦性遮罩: 摘要由src以固定欄位組成(操作別、類別名稱、機器代碼等), 其值若恰等於已知憑證(如數字密碼同時為錯誤代碼)仍以***取代; 固定詞彙之鍵(mode)除外
    if (safe === null || typeof safe !== 'object') {
        return safe
    }
    let r = {}
    for (let k of Object.keys(safe)) {
        let v = safe[k]
        if (SAFE_FIXED_KEYS.indexOf(k) >= 0) {
            r[k] = v
            continue
        }
        r[k] = typeof v === 'string' ? maskText(v, secrets) : ((typeof v === 'number' || typeof v === 'bigint') && nums.has(String(v)) ? MASK : v)
    }
    return r
}


function ownData(o, k) {
    //取o自有資料屬性k之值, 不執行getter; 非資料屬性或無則undefined
    try {
        if (o === null || (typeof o !== 'object' && typeof o !== 'function')) {
            return undefined
        }
        let d = Object.getOwnPropertyDescriptor(o, k)
        return d !== undefined && Object.prototype.hasOwnProperty.call(d, 'value') ? d.value : undefined
    }
    catch (e) {
        return undefined
    }
}


function getByteLength(v) {
    //二進位資料的位元組數: 一律用內建getter(自有的byteLength存取器是使用端程式, 不執行)
    for (let g of [BL_TA, BL_DV, BL_AB]) {
        try {
            return g.call(v)
        }
        catch (e) {
            //不是該型別, 試下一種
        }
    }
    return null
}


function getCtorName(v) {
    //建構子名稱(原型鏈上第一個為函數的自有資料屬性constructor之自有資料屬性name), 須為程式識別字, 否則undefined; 不執行getter
    for (let x = v; x !== null; x = Object.getPrototypeOf(x)) {
        let ctor = ownData(x, 'constructor')
        if (typeof ctor === 'function') {
            let n = ownData(ctor, 'name')
            return typeof n === 'string' && RE_ERR_TYPE.test(n) ? n : undefined
        }
    }
    return undefined
}


function getErrName(v) {
    //Error副本的類別名稱: 原型鏈上第一個name為資料屬性者取其值; 為存取器者(驅動的MongoError等以get name()宣告)改取建構子名稱(須為程式識別字)
    for (let x = Object.getPrototypeOf(v); x !== null; x = Object.getPrototypeOf(x)) {
        let d = Object.getOwnPropertyDescriptor(x, 'name')
        if (d !== undefined) {
            if (Object.prototype.hasOwnProperty.call(d, 'value') && typeof d.value === 'string') {
                return d.value
            }
            break
        }
    }
    return getCtorName(v)
}


function newErrCopy(cn) {
    //Error副本的空殼: 建構子名稱為Error(或不合識別字樣式)者用內建Error; 其餘(自訂類別、驅動的MongoParseError等)以內建Error.prototype為原型再疊一層只帶同名建構子之原型,
    //使util.inspect的首行與原錯誤一致(類別名稱與建構子名稱相同時不加 Error [名稱] 之標示); 該建構子為本檔建立之空函數, 非使用端程式, 不沿用使用端原型
    if (cn === undefined || cn === 'Error') {
        return new Error()
    }
    let f = Object.defineProperty(function() {}, 'name', { value: cn })
    let p = Object.create(Error.prototype, { constructor: { value: f, writable: true, configurable: true } })
    f.prototype = p //util.inspect取建構子名稱時要求 副本 instanceof 該建構子
    return Object.create(p)
}


function cp(v, c, depth) {
    //遞迴複製並遮罩, 不執行使用端程式(不呼叫getter、實例方法、建構子), 不交出原參照; 副本原型一律為內建原型(不沿用使用端的原型: 其繼承屬性未遮罩、util.inspect.custom會在格式化時執行)
    if (typeof v === 'string') {
        return maskText(v, c.secrets)
    }
    if (typeof v === 'number' || typeof v === 'bigint') {
        return c.nums.has(String(v)) ? MASK : v
    }
    if (v === null || (typeof v !== 'object' && typeof v !== 'function')) {
        return v
    }
    if (typeof v === 'function') {
        return '[Function]'
    }
    if (depth >= CP_DEPTH || c.n >= CP_MAX) {
        return '[Truncated]'
    }
    if (c.seen.has(v)) {
        return c.seen.get(v)
    }
    c.n++
    try {
        if (v instanceof String) {
            return maskText(String.prototype.valueOf.call(v), c.secrets) //包裝字串: 取其字串值遮罩(逐字元展開會使憑證被拆成單字元而遮罩不到)
        }
        if (v instanceof Number || v instanceof Boolean || v instanceof BigInt || v instanceof Symbol) {
            return '[Object]'
        }
        if (typeof SharedArrayBuffer !== 'undefined' && v instanceof SharedArrayBuffer) {
            return '[SharedArrayBuffer]'
        }
        if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) {
            let n = getByteLength(v)
            return n === null ? '[Binary]' : `[Binary ${n} bytes]`
        }
        if (v instanceof Date) {
            return new Date(Date.prototype.getTime.call(v))
        }
        if (v instanceof Map || v instanceof Set || v instanceof WeakMap || v instanceof WeakSet || v instanceof RegExp || v instanceof Promise) {
            return '[Object]' //無法複製的內建物件
        }
        let isArr = Array.isArray(v)
        let isErr = v instanceof Error //不用Object.prototype.toString(會執行Symbol.toStringTag之getter)
        let r = isArr ? new Array(v.length) : (isErr ? newErrCopy(getCtorName(v)) : {})
        c.seen.set(v, r)
        let isTrunc = false
        for (let k of Reflect.ownKeys(v)) {
            if (c.n >= CP_MAX) {
                isTrunc = true
                break
            }
            if (k === 'length' && isArr) {
                continue
            }
            let d = Object.getOwnPropertyDescriptor(v, k)
            if (d === undefined) {
                continue
            }
            c.n++
            let val = '[Getter/Setter]'
            if (Object.prototype.hasOwnProperty.call(d, 'value')) {
                val = cp(d.value, c, depth + 1)
            }
            else if (isErr && k === 'stack' && STACK_GETTER !== null && d.get === STACK_GETTER) {
                //stack於V8為內建存取器: 僅當其getter嚴格等於同realm共用之內建getter才讀取(不執行使用端程式)
                let s = STACK_GETTER.call(v)
                val = typeof s === 'string' ? maskText(s, c.secrets) : val
            }
            let isIdx = isArr && typeof k === 'string' && /^(0|[1-9][0-9]*)$/.test(k)
            Object.defineProperty(r, isIdx ? k : maskKey(k, c), { value: val, writable: true, enumerable: d.enumerable, configurable: true })
        }
        if (isTrunc) {
            //預算用盡, 其餘鍵不複製: 以標記鍵明示(不交出原參照)
            Object.defineProperty(r, '[Truncated]', { value: true, writable: true, enumerable: true, configurable: true })
        }
        if (isErr && !Object.prototype.hasOwnProperty.call(r, 'name')) {
            //類別名稱常在原型上(class MyError extends Error的name屬性)或以存取器宣告(驅動的MongoError): 副本才保有類別名稱
            let nm = getErrName(v)
            if (typeof nm === 'string') {
                Object.defineProperty(r, 'name', { value: maskText(nm, c.secrets), writable: true, enumerable: false, configurable: true })
            }
        }
        return r
    }
    catch (e) {
        return '[Uncopyable]'
    }
}


function cpMask(v, secrets = []) {
    //交給console或funLog之完整細節的遮罩拷貝: 憑證以***取代(值、屬性鍵、Symbol描述、同值數字), 不改動呼叫端的原物件(細節若與其後仍要使用的物件共用, 使用端原地遮罩會改變結果)
    //複製: 純物件與類別實例(複製自有屬性成普通物件, 不保留原型)、陣列(含非索引鍵)、原生Error(含message、stack、cause、類別名稱name)、Date、包裝字串(取其字串值); 標記字串代替: 函數、二進位資料、Map與Set等內建物件、存取器、過深或過大者(過大者另有'[Truncated]'標記鍵)
    return cp(v, { secrets, nums: getNums(secrets), n: 0, seen: new WeakMap() }, 0)
}


function maskErr(err, secrets, depth = 0, seen = new WeakSet()) {
    //連線設定錯誤(驅動解析連線字串失敗所拋之錯誤)的原地遮罩: 回顯之憑證以***取代, 錯誤物件本身(原型、類別、訊息前綴、其他欄位)不變
    //作用於自有字串資料屬性(message、input等)與stack(僅內建getter時讀取並改為資料屬性), 並沿cause鏈(驅動將Node之Invalid URL錯誤作為cause, 其input為連線字串片段)
    //除已知秘密外另遮罩驅動回顯之主機位址項(maskHostEcho), 不依賴已知秘密(url非字串、空白等經驅動正規化後與原文不同者)
    //改寫資料屬性只變更value(沿用原屬性之writable、enumerable、configurable); 不執行使用端程式; 遮罩失敗時不改變錯誤
    if (typeof err === 'string') {
        return maskHostEcho(maskText(err, secrets))
    }
    if (err === null || typeof err !== 'object' || depth > CAUSE_DEPTH || seen.has(err)) {
        return err
    }
    seen.add(err)
    let cause
    for (let k of Reflect.ownKeys(err)) {
        try {
            let d = Object.getOwnPropertyDescriptor(err, k)
            if (d === undefined) {
                continue
            }
            let isData = Object.prototype.hasOwnProperty.call(d, 'value')
            let v = isData ? d.value : undefined
            if (!isData && k === 'stack' && STACK_GETTER !== null && d.get === STACK_GETTER) {
                v = STACK_GETTER.call(err)
            }
            else if (!isData) {
                continue
            }
            if (k === 'cause') {
                cause = v
            }
            if (typeof v !== 'string') {
                continue
            }
            let m = maskHostEcho(maskText(v, secrets))
            if (m === v) {
                continue
            }
            //資料屬性只變更value: 沿用原屬性之writable、enumerable、configurable(不可設定但可寫者亦可改; 不可寫者無法改, 由外層略過); stack存取器改為資料屬性
            Object.defineProperty(err, k, isData ? { value: m } : { value: m, writable: true, enumerable: d.enumerable, configurable: true })
        }
        catch (e) {
            //該屬性無法改寫則略過
        }
    }
    if (cause !== undefined) {
        maskErr(cause, secrets, depth + 1, seen)
    }
    return err
}


function noop() {
    //吞下funLog回傳之promise的reject
}


function swallow(r) {
    //funLog的回傳若為promise或thenable, 附上reject處理, 使其reject不成為unhandledRejection; 全程不使診斷輸出拋錯
    //原生promise用內建then(不讀其可被覆寫的then屬性: 使用端可把p.then換成空函數而使reject漏網); 其他thenable只讀一次then並以其為this呼叫, 回傳之原生promise亦附處理
    try {
        if (r instanceof Promise) {
            Promise.prototype.then.call(r, undefined, noop)
            return
        }
        if (r !== null && (typeof r === 'object' || typeof r === 'function')) {
            let t = r.then
            if (typeof t === 'function') {
                let x = t.call(r, undefined, noop)
                if (x instanceof Promise) {
                    Promise.prototype.then.call(x, undefined, noop)
                }
                else if (x !== null && (typeof x === 'object' || typeof x === 'function') && typeof x.then === 'function') {
                    x.then(undefined, noop)
                }
            }
        }
    }
    catch (e) {
        //放棄
    }
}


function getDiag(optLog, secrets = []) {
    //回傳診斷輸出函數diag(label, safe, getDetail, bare), 所有診斷輸出皆經此(R-DIAG-01)
    //label: 固定標籤; safe: 不含資料值、id與錯誤原文的摘要(預設輸出), 無則undefined; getDetail: 回傳完整細節的函數(只在有消費者時才呼叫), 無細節則undefined
    //bare: 為true者, logDetail還原時只輸出細節而不加label(舊版該站即為console.log(細節))
    //輸出不得使呼叫端的流程拋錯: 細節的取得、console與funLog的拋錯一律吞下; funLog回傳的promise之reject亦吞下
    let { logDetail, funLog } = optLog === undefined ? getOptLog(undefined) : optLog
    let nums = getNums(secrets)
    return (label, safeRaw, getDetail, bare = false) => {

        //safe, 摘要(防禦性遮罩後)
        let safe = maskSafe(safeRaw, secrets, nums)

        //getArgs, 完整細節(憑證遮罩後); 僅在需要時取得
        let getArgs = () => {
            if (getDetail === undefined) {
                return []
            }
            try {
                return [cpMask(getDetail(), secrets)]
            }
            catch (e) {
                return ['(unprintable)']
            }
        }

        //funLog, 取代console輸出
        if (funLog !== null) {
            try {
                swallow(funLog(label, safe, ...getArgs()))
            }
            catch (e) {
                //放棄輸出
            }
            return
        }

        //console, 預設為安全摘要; logDetail為true時還原完整細節
        try {
            if (logDetail) {
                console.log(...(bare ? [] : [label]), ...getArgs())
            }
            else if (safe === undefined) {
                console.log(label)
            }
            else {
                console.log(label, safe)
            }
        }
        catch (e) {
            try {
                console.log(label, '(unprintable)')
            }
            catch (e2) {
                //放棄輸出
            }
        }
    }
}


function isErrCode(c) {
    //錯誤代碼是否為機器代碼: 絕對值至99999之整數(如MongoDB錯誤編號), 或ENOENT類(E開頭大寫字母與底線)、ERR_開頭之字串
    if (typeof c === 'number') {
        return Number.isInteger(c) && Math.abs(c) <= 99999
    }
    return typeof c === 'string' && RE_ERR_CODE.test(c)
}


function getBriefErr(e) {
    //錯誤(後端或訂閱函數拋出的值)的摘要: 只列類別與代碼, 不含訊息文字; 全程不執行getter與使用端程式
    //字串列為string; Error取其建構子名稱(程式識別字, 非資料), 不合識別字樣式者列為Error; 代碼取自有資料屬性code, 限機器代碼樣式
    //註: 識別字與代碼樣式只能擋掉明顯的資料, 不能證明無個資; 無法偵測Proxy(不使用util.types), 使用端拋出Proxy時其trap可能被觸發, 拋錯一律被吞下
    try {
        if (typeof e === 'string') {
            return { errType: 'string' }
        }
        if (e === null || (typeof e !== 'object' && typeof e !== 'function')) {
            return { errType: e === null ? 'null' : typeof e }
        }
        let r = { errType: typeof e === 'function' ? 'function' : 'object' }
        if (e instanceof Error) { //不用Object.prototype.toString(會執行Symbol.toStringTag之getter)
            let cname
            for (let x = e; x !== null && cname === undefined; x = Object.getPrototypeOf(x)) {
                let ctor = ownData(x, 'constructor')
                if (typeof ctor === 'function') {
                    cname = ownData(ctor, 'name')
                    break
                }
            }
            r.errType = typeof cname === 'string' && RE_ERR_TYPE.test(cname) ? cname : 'Error'
        }
        let code = ownData(e, 'code')
        if (isErrCode(code)) {
            r.errCode = code
        }
        return r
    }
    catch (e2) {
        return { errType: 'unknown' }
    }
}


export { getOptLog, getSecrets, maskText, cpMask, maskErr, getDiag, getBriefErr }

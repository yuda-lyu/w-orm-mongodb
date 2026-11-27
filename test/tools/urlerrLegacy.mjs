import mongodb from 'mongodb'


//替身驅動之錯誤產生器(rulebook R-DIAG-01): 重現驅動mongodb 7.9.0於連線字串解析失敗時所拋之「回顯」形態
//背景: 驅動7.9.1起連線字串解析失敗之訊息、cause.input皆不再回顯連線字串之片段(如缺少@主機之 mongodb://帳號:密碼 由 Unable to parse 帳號:密碼 with URL 改為固定之 Unable to parse host with URL),
//但本套件之遮罩是防護層, 其他形態或日後之驅動版本仍可能回顯, 故以此產生器注入7.9.0之回顯形態(經test/tools/fakeMongo.mjs之ctor接縫), 證明遮罩對回顯之錯誤確有作用
//raw = { type, msg, input }: type為驅動之錯誤類別名(MongoRuntimeError、MongoParseError、MongoAPIError等, 取自驅動之匯出, 故類別與原型皆為驅動本身之物),
//msg為驅動7.9.0之原訊息(含回顯之片段), input有給時另附cause(TypeError Invalid URL, 其input為回顯之字串, 如驅動以 iLoveJS://主機 解析所留者)
//各形態之原訊息取自對 npm pack mongodb@7.9.0 解包之驅動實跑之輸出, 見規則帳本R-DIAG-01〈驅動版本與回顯〉


//genLegacyErr, 每次呼叫回傳新的錯誤物件(同genClient每次呼叫皆重新建立MongoClient而拋出新錯誤)
function genLegacyErr(raw) {
    let Cls = mongodb[raw.type]
    if (typeof Cls !== 'function') {
        throw new Error(`mongodb.${raw.type} is not a function`)
    }
    let err = new Cls(raw.msg)
    if (typeof raw.input === 'string') {
        let cause = new TypeError('Invalid URL')
        cause.code = 'ERR_INVALID_URL'
        cause.input = raw.input
        err.cause = cause
    }
    return err
}


export { genLegacyErr }

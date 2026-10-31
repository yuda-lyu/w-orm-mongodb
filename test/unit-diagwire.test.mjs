import fs from 'fs'
import util from 'util'
import assert from 'assert'
import dc from 'wsemi/src/_diagCases.mjs'
import { LONE, NUL } from './tools/diagScenario.mjs'
import { build, ops, specOf, run } from './tools/fakeMongo.mjs'


//rulebook R-DIAG-01(依dspec〈診斷輸出與遮罩〉與wsemi之R-DIAG-01): 診斷輸出與對外錯誤值之遮罩由wsemi之getDiag單一擁有, 本檔為「接線測試」(確認本套件之站點與宣告有接上), 不重做形態測試
//  形態類案(字串、鍵、Symbol、包裝物件、Proxy、二進位、Error、循環、數字秘密、摘要代碼集合、秘密導出等)由wsemi共用語料(wsemi/src/_diagCases.mjs)驅動, 於wsemi內測一次;
//  本檔以同一語料之wire子集, 經本套件之真實呼叫點(change與error事件之訂閱函數拋錯 -> diag)與真實對外站點(11個函數之reject、error事件、逐筆err)執行
//  驅動接縫以假MongoClient注入外來值(test/tools/fakeMongo.mjs), 不連線、不需docker
//站點全集(src/WOrmMongodb.mjs, 對應rulebook R-DIAG-01之站點表):
//  S1 批次catch(11函數) outErr: 外來值經diag.err、本套件自身之固定詞彙錯誤(ownErr、cvFind)原樣
//  S2 逐筆err(save、del、delGfs) outMsg: 外來值之訊息經diag.mask
//  S3 closeClient(finally內關閉連線) diag.err
//  S4 cloneData(insert、insertBulk、save、del於try之外複製使用端輸入) diag.err
//  S5 genClient(new MongoClient)之同步拋錯: 於各函數之try內, 由S1遮罩
//  S6 emitChange、emitError之訂閱函數拋錯 -> diag(level為log)


let ctxOf = () => dc.mkCtx({ util: true })
let byId = (id) => dc.cases.find((c) => c.id === id)


//cap, 擷取console各方法之輸出(以util.format格式化, 與實際輸出一致), 並記錄所用方法(驗證stdout與stderr之串流)
async function cap(fn) {
    let lines = []
    let calls = []
    let ks = ['log', 'info', 'warn', 'error', 'debug']
    let olds = ks.map((k) => console[k])
    ks.forEach((k) => {
        console[k] = (...a) => {
            calls.push({ m: k, args: a })
            lines.push(util.format(...a))
        }
    })
    try {
        await fn()
    }
    finally {
        ks.forEach((k, i) => {
            console[k] = olds[i]
        })
    }
    return { lines, calls }
}


//fire, 於實例掛上拋錯之error訂閱函數並以不合白名單之select觸發(本套件自身之整批性錯誤: 不連線, 發error事件, 訂閱函數拋出value)
let fire = async (w, value) => {
    w.on('error', () => {
        throw value
    })
    await w.select({ $foo: 1 }).catch(() => {})
}

//fireChange, 於實例掛上拋錯之change訂閱函數並以批次內皆為無效主鍵之save觸發(不連線仍發change)
let fireChange = async (w, value) => {
    w.on('change', () => {
        throw value
    })
    await w.save([{ id: `a${LONE}` }, { id: `b${NUL}` }])
}


describe('wsemi共用語料之接線(D5): wire子集 x 本套件之真實呼叫點', function() {

    //處置表: wsemi語料中wire為true之每一案在本套件之處置(無空白格; wsemi新增wire案時本表須補, 否則「分類完整」案轉紅)
    //  detail+reject: 訂閱函數拋出make()之值, 經'error handler threw'與'change handler threw'兩站, funLog所收detail須符合語料之期望(noSecret: 'detail');
    //                 同一值作為驅動接縫之外來值, 11個函數之reject須符合reject清單之期望(noSecret: 'reject')
    //  adapt:         語料之期望為其call()回傳之形狀, 本套件之呼叫點形狀不同, 以接線版斷言(下方各adapt案)
    //  n/a:           本套件未宣告該來源(儲存路徑、權杖)或未使用該函數
    let DISPOSITION = {
        T01: 'detail+reject', T07: 'detail+reject', K01: 'detail+reject', K09: 'detail+reject', V02: 'detail+reject', E01: 'detail+reject', E07: 'detail+reject', P01: 'detail+reject', S07: 'detail+reject',
        C01: 'adapt(safe)', O01: 'adapt(logDetail console)', O15: 'adapt(safeKeys宣告)',
        R01: 'adapt(reject身分)', R02: 'adapt(等價案: 畸形網址片段, opt.url為單一來源)', R04: 'adapt(reject字串)', R07: 'adapt(固定詞彙reject原樣, 見下方「固定詞彙」)', R12: 'adapt(reject不遮帳號、detail遮帳號)',
        R11: 'adapt(reject不遮儲存路徑: 本套件未宣告paths, 錯誤自帶path原樣)', A01: 'n/a(本套件不用genDiagFunLog)', A07: 'n/a(本套件不用genDiagFunLog)',
        //wsemi 1.9.33新增之wire案(第209項升版時補): 皆為共用函數層之行為, 本套件之呼叫點不使用其所測之選項
        A11: 'n/a(本套件不直接用genDiagFunLog; getDiag之safeKeys宣告見O15)',
        C14: 'n/a(pg之DatabaseError形態; 本套件未宣告types, 驅動錯誤之errType恆為Error, 見state已知缺口1)',
        U22: 'n/a(本套件以urls宣告連線來源, 不用conns)',
    }

    it('分類完整: 語料wire案(含wsemi日後新增者)皆已於DISPOSITION表處置', function() {
        let wires = dc.cases.filter((c) => c.wire).map((c) => c.id).sort()
        assert.deepStrictEqual(Object.keys(DISPOSITION).sort(), wires)
        assert.ok(wires.length >= 20, `wire案數 ${wires.length}`)
    })

    let detailIds = Object.keys(DISPOSITION).filter((id) => DISPOSITION[id] === 'detail+reject')

    for (let id of detailIds) {
        let c = byId(id)

        for (let site of ['error', 'change']) {
            it(`${id} ${c.label} -> ${site}事件站之funLog detail符合語料期望(接線)`, async function() {
                let ctx = ctxOf()
                let value = c.make(ctx)
                let got = []
                let { w } = build({}, { url: ctx.sec.url, funLog: (...a) => got.push(a) })
                if (site === 'error') {
                    await fire(w, value)
                }
                else {
                    await fireChange(w, value)
                }
                assert.strictEqual(got.length, 1, 'funLog應恰收1次')
                assert.strictEqual(got[0][0], `${site} handler threw`)
                //spec(dspec §1 D2/D3、wsemi R-DIAG-01): detail為遮罩拷貝, 憑證不外露
                assert.strictEqual(dc.verify(c, got[0][2], ctx), null, `${id} ${site}`)
            })
        }
    }

    for (let [name, o] of Object.entries(ops)) {
        it(`${name}: 外來值(語料detail+reject各案)作為驅動接縫(${o.seam})之reject, 對外值不含憑證(reject清單; 存取器不執行)`, async function() {
            for (let id of detailIds) {
                let c = byId(id)
                let ctx = ctxOf()
                let value = c.make(ctx)
                let { w } = build(specOf(o.seam, () => value), { url: ctx.sec.url })
                let r = await run(w, o.fn)
                assert.ok(r.has, `${id} 應reject`)
                //spec(dspec §1 D3): reject含外來值者經maskDiagErr, 只遮憑證
                assert.strictEqual(dc.verify({ expect: { noSecret: 'reject', userCode: c.expect.userCode } }, r.rej, ctx), null, `${name} ${id}`)
            }
        })
    }

    it('C01(adapt) 摘要代碼: ECONNREFUSED、EAI_AGAIN、E2BIG收; 本套件宣告mongoServer(整數11000收、12345不收、codeName字串收)', async function() {
        let c = byId('C01')
        let ctx = ctxOf()
        let errs = c.make(ctx)
        let got = []
        let { w } = build({}, { funLog: (...a) => got.push(a) })
        let i = 0
        w.on('error', () => {
            throw errs[i++]
        })
        for (let k = 0; k < errs.length; k++) {
            await w.select({ $foo: 1 }).catch(() => {})
        }
        let out = got.map(([, safe]) => {
            let { mode, ...rest } = safe
            return rest
        })
        assert.strictEqual(c.expect.check(out, ctx), true)
        assert.ok(got.every(([, safe]) => safe.mode === 'select'))

        //本套件宣告: mongoServer(MongoDB伺服端錯誤碼與codeName)
        let got2 = []
        let { w: w2 } = build({}, { funLog: (...a) => got2.push(a) })
        let specs = [
            Object.assign(new Error('x'), { code: 11000, codeName: 'DuplicateKey' }),
            Object.assign(new Error('x'), { code: 13 }),
            Object.assign(new Error('x'), { code: 12345 }),
            Object.assign(new Error('x'), { code: 'DuplicateKey' }),
            Object.assign(new Error('x'), { code: 'E123456789' }),
            Object.assign(new (class UserAlice01 extends Error {})('x'), { code: 'EAI_AGAIN' }),
        ]
        let j = 0
        w2.on('error', () => {
            throw specs[j++]
        })
        for (let k = 0; k < specs.length; k++) {
            await w2.select({ $foo: 1 }).catch(() => {})
        }
        assert.deepStrictEqual(got2.map(([, s]) => s), [
            { mode: 'select', errType: 'Error', errCode: 11000 },
            { mode: 'select', errType: 'Error', errCode: 13 },
            { mode: 'select', errType: 'Error' },
            { mode: 'select', errType: 'Error', errCode: 'DuplicateKey' },
            { mode: 'select', errType: 'Error' },
            { mode: 'select', errType: 'Error', errCode: 'EAI_AGAIN' },
        ])
    })

    it('O01(adapt) logDetail為true: console.log(label, 遮罩後細節)一行(stdout), 細節為Error副本、憑證為***; error與change兩站皆為log(不用console.error)', async function() {
        let c = byId('O01')
        for (let site of ['error', 'change']) {
            let ctx = ctxOf()
            let { detail } = c.make(ctx)
            let { w } = build({}, { url: ctx.sec.url, logDetail: true })
            let { calls } = await cap(() => (site === 'error' ? fire(w, detail) : fireChange(w, detail)))
            assert.strictEqual(calls.length, 1, site)
            //level: 兩站之舊輸出為console.log, 維持stdout
            assert.strictEqual(calls[0].m, 'log', site)
            assert.strictEqual(calls[0].args[0], `${site} handler threw`)
            assert.ok(calls[0].args[1] instanceof Error && calls[0].args[1] !== detail)
            assert.strictEqual(dc.verify({ expect: { noSecret: 'detail' } }, calls, ctx), null, site)
        }
    })

    it('O15(adapt) safe只含mode、errType、errCode: 套件宣告safeKeys為[mode], 白名單外之鍵(如password)不出現', async function() {
        let got = []
        let { w } = build({}, { funLog: (...a) => got.push(a) })
        await fire(w, Object.assign(new Error('x'), { password: 'Pw9xQ!z7', mode: 'POLLUTED', code: 'ECONNREFUSED' }))
        assert.deepStrictEqual(Object.keys(got[0][1]).sort(), ['errCode', 'errType', 'mode'])
        assert.strictEqual(got[0][1].mode, 'select')
        let src = fs.readFileSync('./src/WOrmMongodb.mjs', 'utf8')
        assert.ok(src.indexOf('safeKeys: [\'mode\']') >= 0, 'cfg須宣告safeKeys: [mode]')
        assert.ok(src.indexOf('codes: [\'mongoServer\']') >= 0, 'cfg須宣告codes: [mongoServer]')
        assert.ok(src.indexOf('patterns: [\'mongoHostEcho\']') >= 0, 'cfg須宣告patterns: [mongoHostEcho]')
    })

    it('R01(adapt) 不含憑證之外來錯誤: 11個函數之reject皆為同一原物件(身分不變), error事件為其訊息', async function() {
        let c = byId('R01')
        for (let [name, o] of Object.entries(ops)) {
            let value = c.make(ctxOf())
            let { w } = build(specOf(o.seam, () => value))
            let r = await run(w, o.fn)
            assert.strictEqual(r.rej, value, name)
            assert.deepStrictEqual(r.evs, [[name, 'timeout']], name)
        }
    })

    it('R02(adapt) 畸形網址之片段(密碼含未編碼之/與@): 外來錯誤訊息含該片段者遮罩, 為副本且instanceof同類、code保留、單獨帳號不遮', async function() {
        let c = byId('R02')
        let { e, DbErr, src } = c.make(ctxOf())
        let url = src.urls[0] //postgres://u1:p@ss/w0rdQ9@db.example.com/app, 密碼p@ss含/
        let msg0 = e.message
        let { w } = build({ connect: () => e }, { url })
        let r = await run(w, ops.insert.fn)
        assert.ok(r.rej !== e && r.rej instanceof DbErr && r.rej.code === '3D000')
        assert.ok(r.rej.message.indexOf('w0rdQ9') < 0, r.rej.message)
        assert.ok(r.rej.message.indexOf('p@ss') < 0, r.rej.message)
        assert.ok(r.rej.message.indexOf('dbuser') >= 0, '單獨帳號不遮(Q3之reject清單只含憑證)')
        assert.strictEqual(e.message, msg0, '原錯誤不被改動')
    })

    it('R04(adapt) 字串reject含密碼: reject為遮罩後字串, 期望同語料; error事件為同一字串', async function() {
        let c = byId('R04')
        for (let [name, o] of Object.entries(ops)) {
            let ctx = ctxOf()
            let value = c.make(ctx)
            let { w } = build(specOf(o.seam, () => value), { url: ctx.sec.url })
            let r = await run(w, o.fn)
            assert.strictEqual(dc.verify(c, r.rej, ctx), null, name)
            assert.strictEqual(r.rej, 'failed ***', name)
            assert.deepStrictEqual(r.evs, [[name, 'failed ***']], name)
        }
    })

    it('R11(adapt) 錯誤自帶path為儲存路徑(Q3): reject不遮(身分不變); 診斷輸出之細節遮罩該路徑(本套件未宣告paths故僅依錯誤自帶之path不遮之規則)', async function() {
        let c = byId('R11')
        let value = c.make(ctxOf())
        let { w } = build({ connect: () => value })
        let r = await run(w, ops.insert.fn)
        assert.strictEqual(r.rej, value)
        assert.strictEqual(r.rej.path, 'D:\\other\\store\\db02')
    })

    it('R12(adapt) 單獨帳號出現於後端訊息: reject不遮(身分不變)、診斷輸出之detail遮', async function() {
        let c = byId('R12')
        let ctx = ctxOf()
        let value = c.make(ctx)
        let { w } = build({ connect: () => value }, { url: ctx.sec.url })
        let r = await run(w, ops.insert.fn)
        let got = []
        let { w: w2 } = build({}, { url: ctx.sec.url, funLog: (...a) => got.push(a) })
        await fire(w2, value)
        assert.strictEqual(c.expect.check({ e: value, r: r.rej, c: got[0][2] }, ctx), true)
    })

})


describe('固定詞彙之錯誤原樣(D3: 套件自身之固定詞彙不經遮罩, 否則固定字串被挖空即反推短密碼)', function() {

    //密碼為固定詞彙之子字串(reject清單長度須>=4); 若固定詞彙之錯誤誤經遮罩, 訊息會被切碎
    let PWS = ['invalid', 'string', 'data', 'find', 'unsupported', 'surrogate', 'autoGenPk', 'u8a_', 'empty']

    //cases, 本套件自身之固定詞彙錯誤全集(整批reject與逐筆err); 期望值以「密碼不為固定詞彙子字串」之對照組為準
    let cases = [
        ['select不合白名單', (w) => w.select({ $foo: 1 })],
        ['delAll不合白名單', (w) => w.delAll({ $foo: 1 })],
        ['delAllGfs不合白名單', (w) => w.delAllGfs({ $foo: 1 })],
        ['insert含NUL之id', (w) => w.insert({ id: `a${NUL}`, name: 'n' })],
        ['insert孤立代理之id', (w) => w.insert({ id: `a${LONE}`, name: 'n' })],
        ['insert孤立代理之資料值', (w) => w.insert({ id: 'a', name: `n${LONE}` })],
        ['insertBulk孤立代理之資料鍵名', (w) => w.insertBulk({ id: 'a', [`k${LONE}`]: 1 })],
        ['insertGfs無u8a', (w) => w.insertGfs({ id: 'a' })],
        ['insertGfs含NUL之id', (w) => w.insertGfs({ id: `a${NUL}`, u8a: new Uint8Array([1]) })],
        ['save單筆無效id(逐筆err)', (w) => w.save([{ id: `a${LONE}` }, { id: `b${NUL}` }])],
        ['del單筆無效id(逐筆err)', (w) => w.del([{ id: '' }, { id: `b${NUL}` }])],
        ['delGfs單筆無效id(逐筆err)', (w) => w.delGfs([{ id: '' }, { id: `b${LONE}` }])],
    ]
    let optOf = (pw) => ({ url: `mongodb://dbuser:${pw}@db.example.com:27017/app` })
    let CTRL = 'Zq9xYw7k' //不為任何固定詞彙之子字串

    //observe, 回傳 { rej, res, evs }(皆為對外可見之值)
    let observe = async (fn, pw, ex = {}) => {
        let { w, rec } = build({}, { ...optOf(pw), ...ex })
        let r = await run(w, fn)
        return { rej: r.has ? r.rej.message : null, res: r.res, evs: r.evs, nClients: rec.urls.length }
    }

    for (let [label, fn] of cases) {
        it(`${label}: 固定詞彙原樣(reject、逐筆err、error事件之訊息皆與對照組相同), 且確含被當成密碼之詞彙`, async function() {
            let ctrl = await observe(fn, CTRL)
            let text = JSON.stringify([ctrl.rej, ctrl.res, ctrl.evs])
            assert.ok(ctrl.rej !== null || (Array.isArray(ctrl.res) && ctrl.res.every((v) => v.ok === 0)), '對照組應為固定詞彙之失敗')
            let nHit = 0
            for (let pw of PWS) {
                let r = await observe(fn, pw)
                assert.deepStrictEqual(r, ctrl, `密碼=${pw}: 固定詞彙錯誤不得被遮罩`)
                if (text.indexOf(pw) >= 0) {
                    nHit++
                }
            }
            assert.ok(nHit >= 1, `${label}: 密碼集合須至少有一個為其固定詞彙之子字串(否則測不到誤遮罩): ${text}`)
        })
    }

    it('autoGenPk為false且無id: 固定詞彙之reject原樣(密碼為其子字串)', async function() {
        let fn = (w) => w.insert({ name: 'n' })
        let ctrl = await observe(fn, CTRL, { autoGenPk: false })
        assert.strictEqual(ctrl.rej, 'invalid data[0].id, autoGenPk is false')
        for (let pw of ['invalid', 'autoGenPk', 'false', 'data']) {
            assert.deepStrictEqual(await observe(fn, pw, { autoGenPk: false }), ctrl, pw)
        }
    })

    it('外來值(驅動之錯誤)含同一密碼詞彙者仍遮罩(對照: 區分外來值與固定詞彙)', async function() {
        let { w } = build({ connect: () => new Error('connect failed invalid credential') }, optOf('invalid'))
        let r = await run(w, ops.insert.fn)
        assert.strictEqual(r.rej.message, 'connect failed *** credential')
    })

})


describe('逐筆err與其他站點之遮罩(S2、S3、S4)', function() {

    let URLX = 'mongodb://dbuser:Pw9xQz7k@db.example.com:27017/app'
    let foreign = () => new Error(`auth failed Pw9xQz7k ${URLX}`)

    it('S2 save: 驅動拋出之外來錯誤(非重複鍵)使該筆ok為0, err與error事件之訊息遮罩', async function() {
        let { w } = build({ col: { updateOne: foreign } }, { url: URLX })
        let r = await run(w, (w) => w.save([{ id: 'a1', name: 'n' }]))
        assert.strictEqual(r.has, false)
        assert.strictEqual(r.res.length, 1)
        assert.strictEqual(r.res[0].ok, 0)
        assert.strictEqual(r.res[0].err, 'auth failed *** ***')
        assert.deepStrictEqual(r.evs, [['save', 'auth failed *** ***']])
    })

    it('S2 del: 逐筆err與error事件之訊息遮罩', async function() {
        let { w } = build({ col: { deleteOne: foreign } }, { url: URLX })
        let r = await run(w, (w) => w.del([{ id: 'a1' }]))
        assert.strictEqual(r.res[0].ok, 0)
        assert.strictEqual(r.res[0].err, 'auth failed *** ***')
        assert.deepStrictEqual(r.evs, [['del', 'auth failed *** ***']])
    })

    it('S2 delGfs: 查找途中之外來錯誤使該筆ok為0, err與error事件之訊息遮罩', async function() {
        let { w } = build({ col: { find: foreign } }, { url: URLX })
        let r = await run(w, (w) => w.delGfs([{ id: 'a1' }]))
        assert.strictEqual(r.res[0].ok, 0)
        assert.strictEqual(r.res[0].err, 'auth failed *** ***')
        assert.deepStrictEqual(r.evs, [['delGfs', 'auth failed *** ***']])
    })

    it('S2 逐筆err之外來值若為字串、非Error物件: 以其字串遮罩', async function() {
        let { w } = build({ col: { deleteOne: () => 'raw Pw9xQz7k failure' } }, { url: URLX })
        let r = await run(w, (w) => w.del([{ id: 'a1' }]))
        assert.strictEqual(r.res[0].err, 'raw *** failure')
    })

    it('S2 逐筆err不含憑證之外來錯誤: 訊息原樣', async function() {
        let { w } = build({ col: { deleteOne: () => new Error('socket hang up') } }, { url: URLX })
        let r = await run(w, (w) => w.del([{ id: 'a1' }]))
        assert.strictEqual(r.res[0].err, 'socket hang up')
    })

    for (let [name, o] of Object.entries(ops)) {
        it(`S3 ${name}: 關閉連線(client.close)reject之外來值於finally內經遮罩(原操作之失敗被其取代, 同修改前之finally語意)`, async function() {
            let { w, rec } = build({ ...specOf(o.seam, () => new Error('benign')), close: foreign }, { url: URLX })
            let r = await run(w, o.fn)
            assert.ok(r.has)
            assert.strictEqual(r.rej.message, 'auth failed *** ***', name)
            assert.strictEqual(rec.closed, 1, name)
        })

        it(`S5 ${name}: new MongoClient同步拋出之外來值(驅動解析連線字串失敗)於try內經批次catch遮罩, reject與error事件一致`, async function() {
            let { w } = build({ ctor: foreign }, { url: URLX })
            let r = await run(w, o.fn)
            assert.ok(r.has)
            assert.strictEqual(r.rej.message, 'auth failed *** ***', name)
            assert.deepStrictEqual(r.evs, [[name, 'auth failed *** ***']], name)
        })
    }

    for (let name of ['insert', 'insertBulk', 'save', 'del']) {
        it(`S4 ${name}: 使用端輸入之存取器於cloneDeep時拋出之外來值經遮罩`, async function() {
            let { w } = build({}, { url: URLX })
            let data = { id: 'a1' }
            Object.defineProperty(data, 'x', {
                enumerable: true,
                get() {
                    throw foreign()
                }
            })
            let r = await run(w, (w) => w[name](data))
            assert.ok(r.has, name)
            assert.strictEqual(r.rej.message, 'auth failed *** ***', name)
        })
    }

    it('回傳契約: 不含憑證之成功與失敗路徑之resolve內容不受遮罩影響', async function() {
        let { w } = build({}, { url: URLX })
        let r = await run(w, (w) => w.insert([{ id: 'a1', name: 'n' }, { id: 'a2', name: 'n2' }], { returnList: true }))
        assert.deepStrictEqual(r.res, [{ n: 1, nInserted: 1, ok: 1 }, { n: 1, nInserted: 1, ok: 1 }])
    })

})


describe('站點盤點(原始碼掃描; 與rulebook R-DIAG-01之站點表一致)', function() {

    let src = fs.readFileSync('./src/WOrmMongodb.mjs', 'utf8').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ''))
    let code = src.join('\n')

    it('不得自寫遮罩: 無本套件自有之getDiag.mjs與遮罩函數(只經wsemi), src只有WOrmMongodb.mjs', function() {
        assert.ok(!fs.existsSync('./src/getDiag.mjs'))
        assert.deepStrictEqual(fs.readdirSync('./src').filter((f) => /\.(mjs|js)$/.test(f)), ['WOrmMongodb.mjs'])
        assert.ok(/import getDiag from 'wsemi\/src\/getDiag\.mjs'/.test(code))
        assert.ok(/import getDiagSecrets from 'wsemi\/src\/getDiagSecrets\.mjs'/.test(code))
        assert.ok(!/maskErr|maskText|cpMask|getBriefErr|getOptLog|getSecrets/.test(code), '殘留自寫之遮罩識別字')
    })

    it('批次catch: 11個函數之catch皆以outErr(err)取得對外之值(不得res = err原值)', function() {
        let n = (code.match(/res = outErr\(err\)/g) || []).length
        assert.strictEqual(n, 11, `res = outErr(err)應為11處(11個公開函數), 實為${n}`)
        //res = err僅允許於_findGfs(內部查找, 由接住處之catch遮罩)
        let m = [...code.matchAll(/res = err\b/g)].length
        assert.strictEqual(m, 1, `res = err原值只允許_findGfs內1處, 實為${m}`)
        let i = code.indexOf('async function _findGfs(')
        let j = code.indexOf('async function delGfs(')
        let k = code.search(/res = err\b/)
        assert.ok(i > 0 && j > i && k > i && k < j, 'res = err原值不在_findGfs內')
    })

    it('逐筆err: 3處(save、del、delGfs)之外來值經outMsg, 本套件自身之err: msgBad類為固定詞彙', function() {
        assert.strictEqual((code.match(/err: outMsg\(err\)/g) || []).length, 3)
        assert.strictEqual((code.match(/err: getErrMsg\(/g) || []).length, 0)
    })

    it('finally內關閉連線一律closeClient(11處), 無裸client.close()(僅closeClient內1處)', function() {
        assert.strictEqual((code.match(/await closeClient\(client\)/g) || []).length, 11)
        assert.strictEqual((code.match(/client\.close\(\)/g) || []).length, 1)
    })

    it('複製使用端輸入一律cloneData(4處: insert、insertBulk、save、del), 無裸cloneDeep(data)(僅cloneData內1處)', function() {
        assert.strictEqual((code.match(/data = cloneData\(data\)/g) || []).length, 4)
        assert.strictEqual((code.match(/cloneDeep\(/g) || []).length, 1)
    })

    it('cvOrmFind僅cvFind內1處呼叫(其拋出之固定詞彙錯誤登記為本套件自身之錯誤), 4處站點經cvFind', function() {
        assert.strictEqual((code.match(/cvOrmFind\(/g) || []).length, 1)
        assert.strictEqual((code.match(/find = cvFind\(find\)/g) || []).length, 4)
    })

    it('本套件自身之固定詞彙錯誤以ownErr建立(procPk、procDocs、insertGfs兩處共4處), 除建構期檢核外無裸new Error', function() {
        assert.strictEqual((code.match(/throw ownErr\(/g) || []).length, 4)
        let raws = [...code.matchAll(/new Error\(/g)].length
        assert.strictEqual(raws, 2, `new Error僅允許建構期檢核之throw與ownErr內, 實為${raws}`)
    })

    it('new MongoClient僅genClient內1處; client = genClient()為11處', function() {
        assert.strictEqual((code.match(/new MongoClient\(/g) || []).length, 1)
        assert.strictEqual((code.match(/client = genClient\(\)/g) || []).length, 11)
    })

    it('diag輸出站點: 只有emitChange、emitError各1處, level皆為\'log\'(舊版為console.log, 維持stdout)', function() {
        let ms = [...code.matchAll(/\bdiag\(([^\n]*)\)/g)].map((m) => m[0])
        assert.strictEqual(ms.length, 2, ms.join('\n'))
        for (let m of ms) {
            assert.ok(/, 'log'\)$/.test(m), m)
        }
    })

})

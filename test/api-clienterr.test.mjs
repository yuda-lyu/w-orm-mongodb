import assert from 'assert'
import fs from 'fs'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import mongodb from 'mongodb'
import { startContainer, startContainerRs, stopContainer } from './lib/api-setup.mjs'


//rulebook R-CLIENTERR-01(sgud/rule/rulebook.md): 驅動連線物件於「操作之空檔」被中斷時, 本行程不得因未被監聽之error事件(或未處理之reject)而終止,
//  真MongoDB(自建docker容器, standalone與replica set各一), 每個情境於獨立子行程執行(行程終止才觀察得到), 經TCP代理於連線池取用連線之前切斷全部連線(含監控連線)
//  R-CLIENTERR-01-1 11個公開函數(select、selectByPk、insert、insertBulk、save、del、delAll、selectByPkGfs、insertGfs、delGfs、delAllGfs)於每個連線池取用之前被RST切斷, 行程離開碼0且無未處理之error
//  R-CLIENTERR-01-2 同上, 以FIN(正常關閉)切斷
//  R-CLIENTERR-01-3 對照組(語句進行中): 指令送出後、回應被扣住時被RST切斷(inflight; 驅動對可重試之讀寫會重試故多半被掩蓋), 以及自該指令起連同重試皆被切斷令網路錯誤確實上浮(inflightx),
//    行程亦不終止, 操作以resolve或reject回報(既有失敗通道, 不新增通道)
//  R-CLIENTERR-01-4 insertBulk之交易路徑(replica set)同上
//  R-CLIENTERR-01-5 GridFS之上傳與下載串流為Node串流(驅動不預掛error監聽), 其error事件由本套件自掛; 變異(拿掉監聽)時同情境(重複鍵、查無檔案、連同重試之中斷)行程終止, 證明本測試抓得到
//  R-CLIENTERR-01-6 驅動契約: 本套件所建之MongoClient、GridFSBucket、cursor、session皆由驅動預掛error監聽(listenerCount>=1), 串流類則為0; 注入點(連線池與連線之內部檔)存在
//  接縫與限制: 注入點為驅動lib/cmap/connection_pool.js之checkOut與lib/cmap/connection.js之command(僅於子行程內修補, 不改node_modules); 驅動升版致其移位時
//  子行程以離開碼4回報而使本檔失敗, 須改接縫而非放寬斷言


let ctName = 'worm-test-mongodb-clienterr'
let ctNameRs = 'worm-test-mongodb-clienterr-rs'
let ports = { standalone: null, rs: null }

let pathScenario = fileURLToPath(new URL('./tools/clientErrScenario.mjs', import.meta.url))
let pathSrc = fileURLToPath(new URL('../src/WOrmMongodb.mjs', import.meta.url))
let dirTmp = fileURLToPath(new URL('./_tmp/clienterr/', import.meta.url))

//src內GridFS上傳與下載串流掛error監聽之原文(靜態檢核與變異共用; 變異為改事件名而使監聽失效)
let SRC_UP = 'sm.pipe(ws) //pipe是接bucket的Writable, 所以會監聽finish\n            .on(\'error\', function(err) {'
let SRC_DOWN = 'sm.on(\'error\', function (err) {\n\n                //reject\n                pm.reject(err)'

let OPS = ['select', 'selectByPk', 'insert', 'insertBulk', 'save', 'del', 'delAll', 'selectByPkGfs', 'insertGfs', 'delGfs', 'delAllGfs']


//runScenario, 以獨立子行程執行情境, 回傳離開碼、stderr與RESULT
let runScenario = (spec, srcPath = pathSrc) => {
    return new Promise((resolve) => {
        let child = spawn(process.execPath, [pathScenario, JSON.stringify({ srcPath, ...spec })], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
        let so = ''
        let se = ''
        child.stdout.on('data', (d) => {
            so += d
        })
        child.stderr.on('data', (d) => {
            se += d
        })
        let timer = setTimeout(() => {
            child.kill('SIGKILL')
        }, 120000)
        child.on('close', (code) => {
            clearTimeout(timer)
            let m = so.split('\n').find((l) => l.startsWith('RESULT '))
            resolve({ spec, exit: code, stdout: so, stderr: se, res: m ? JSON.parse(m.slice(7)) : null })
        })
    })
}

//runMany, 限制並行度
let runMany = async (specs, n = 3, srcPath = pathSrc) => {
    let outs = new Array(specs.length)
    let i = 0
    let worker = async () => {
        while (i < specs.length) {
            let k = i++
            outs[k] = await runScenario(specs[k], srcPath)
        }
    }
    await Promise.all(Array.from({ length: n }, worker))
    return outs
}

//isCrash, 行程因未處理之error事件或未處理之reject而終止
let isCrash = (r) => {
    return r.exit !== 0 || /Unhandled 'error' event|triggerUncaughtException|UnhandledPromiseRejection/.test(r.stderr)
}

//brief, 失敗訊息用
let brief = (r) => {
    return `${JSON.stringify(r.spec)} exit=${r.exit} stderr=${r.stderr.slice(0, 300)} stdout=${r.stdout.slice(0, 200)}`
}

//chkAlive, 每個情境之行程皆未終止、有RESULT、操作以resolve或reject回報; 注入須發生(cuts>=1), 唯當次操作實際之連線池取用次數或指令數少於指定位置時(如關閉連線之
//endSessions不一定發生)該位置未到達, 視為不適用, 但每個操作至少須有一個位置確實注入(避免整個情境空轉)
let chkAlive = (outs) => {
    let fired = 0
    for (let r of outs) {
        assert.ok(!isCrash(r), `行程終止: ${brief(r)}`)
        assert.ok(r.res !== null, `無RESULT: ${brief(r)}`)
        assert.ok(['resolve', 'reject'].includes(r.res.outcome), `操作結果不是resolve或reject: ${brief(r)}`)
        if (r.res.cuts >= 1) {
            fired++
            continue
        }
        let reached = r.spec.kind.startsWith('inflight') ? r.res.nOpCmd : r.res.nCheckOut
        assert.ok(reached < r.spec.at, `注入未發生(測試空轉): ${brief(r)}`)
    }
    assert.ok(fired >= 1, '沒有任何位置確實注入中斷')
    return fired
}

//dims, 乾跑取得各操作之連線池取用次數(K)與操作指令數(M)
let dims = {}
let getDim = (mode, op) => {
    return dims[`${mode}/${op}`]
}

//mkMutant, 以字串置換產生拿掉GridFS串流error監聽之src副本(取代點須恰1次, 否則本測試之變異不成立)
let mkMutant = (name, from, to) => {
    let src = fs.readFileSync(pathSrc, 'utf8')
    let n = src.split(from).length - 1
    assert.strictEqual(n, 1, `${name}: 取代點出現${n}次, 須恰1次(src改動後須同步更新本測試之取代字串)`)
    fs.mkdirSync(dirTmp, { recursive: true })
    let f = `${dirTmp}${name}.mjs`
    fs.writeFileSync(f, src.replace(from, to))
    return f
}


describe('api-clienterr', function() {

    before(async function() {
        this.timeout(300000)

        //容器, standalone(帶認證)與replica set(交易路徑)並行啟動
        let [p1, p2] = await Promise.all([startContainer(ctName), startContainerRs(ctNameRs)])
        ports.standalone = p1
        ports.rs = p2

        //乾跑
        let specs = []
        for (let op of OPS) {
            specs.push({ mode: 'standalone', port: ports.standalone, op, at: 0, kind: 'none', tag: 'dry' })
        }
        specs.push({ mode: 'rs', port: ports.rs, op: 'insertBulk', at: 0, kind: 'none', tag: 'dry' })
        let outs = await runMany(specs, 4)
        for (let r of outs) {
            assert.ok(r.exit === 0 && r.res !== null, `乾跑失敗: ${brief(r)}`)
            dims[`${r.spec.mode}/${r.spec.op}`] = { K: r.res.nCheckOut, M: r.res.nOpCmd, outcome: r.res.outcome }
        }
    })

    after(async function() {
        this.timeout(120000)
        await stopContainer(ctName)
        await stopContainer(ctNameRs)
        fs.rmSync(dirTmp, { recursive: true, force: true })
    })


    //R-CLIENTERR-01-6 驅動契約
    describe('driver contract', function() {

        it('driver emitters used by src have error listeners (client, bucket, cursor, session); GridFS streams do not', async function() {
            let client = new mongodb.MongoClient('mongodb://127.0.0.1:1')
            try {
                let database = client.db('x')
                let bucket = new mongodb.GridFSBucket(database, { bucketName: 'c' })
                let session = client.startSession()
                let cursor = database.collection('c').find({})
                let ws = bucket.openUploadStream('f')
                let rs = bucket.openDownloadStreamByName('f')
                try {
                    assert.ok(client.listenerCount('error') >= 1, 'MongoClient')
                    assert.ok(bucket.listenerCount('error') >= 1, 'GridFSBucket')
                    assert.ok(session.listenerCount('error') >= 1, 'ClientSession')
                    assert.ok(cursor.listenerCount('error') >= 1, 'FindCursor')
                    //串流類: 驅動不預掛, 故本套件須自掛(R-CLIENTERR-01-5)
                    assert.strictEqual(ws.listenerCount('error'), 0, 'GridFSBucketWriteStream')
                    assert.strictEqual(rs.listenerCount('error'), 0, 'GridFSBucketReadStream')
                    //預掛者為空操作監聽: 對其發error事件不拋出
                    assert.doesNotThrow(() => client.emit('error', new Error('x')), 'MongoClient emit')
                    assert.doesNotThrow(() => bucket.emit('error', new Error('x')), 'GridFSBucket emit')
                    assert.doesNotThrow(() => cursor.emit('error', new Error('x')), 'FindCursor emit')
                    assert.doesNotThrow(() => session.emit('error', new Error('x')), 'ClientSession emit')
                }
                finally {
                    ws.on('error', () => {})
                    rs.on('error', () => {})
                    ws.destroy()
                    rs.destroy()
                    await cursor.close().catch(() => {})
                    await session.endSession().catch(() => {})
                }
            }
            finally {
                await client.close().catch(() => {})
            }
        })

        it('src attaches an error listener on every GridFS stream and creates MongoClient at one seam', function() {
            let src = fs.readFileSync(pathSrc, 'utf8')
            let count = (s) => src.split(s).length - 1
            assert.strictEqual(count('openUploadStream('), 1)
            assert.strictEqual(count('openDownloadStream'), 1)
            assert.strictEqual(count('.openDownloadStreamByName('), 1)
            //上傳: pipe回傳之串流掛error; 下載: 回傳之串流掛error
            assert.strictEqual(count(SRC_UP), 1)
            assert.strictEqual(count(SRC_DOWN), 1)
            assert.strictEqual(count('new MongoClient('), 1)
        })

    })


    //R-CLIENTERR-01-1, -2, -3, -4
    describe('connection interrupted between operations', function() {

        for (let op of OPS) {

            it(`${op}: RST at every pool checkout, FIN at the first, and in-flight control keep the process alive (standalone)`, async function() {
                let d = getDim('standalone', op)
                let specs = []
                for (let at = 1; at <= d.K; at++) {
                    specs.push({ mode: 'standalone', port: ports.standalone, op, at, kind: 'rst', tag: `rst${at}` })
                }
                specs.push({ mode: 'standalone', port: ports.standalone, op, at: 1, kind: 'fin', tag: 'fin1' })
                for (let at = 1; at <= d.M; at++) {
                    specs.push({ mode: 'standalone', port: ports.standalone, op, at, kind: 'inflight', tag: `inflight${at}` })
                    specs.push({ mode: 'standalone', port: ports.standalone, op, at, kind: 'inflightx', tag: `inflightx${at}` })
                }
                chkAlive(await runMany(specs, 3))
            })

        }

        it('insertBulk: RST at every pool checkout, FIN at the first, and in-flight control keep the process alive (replica set, transaction path)', async function() {
            let d = getDim('rs', 'insertBulk')
            assert.ok(d.M >= 3, `交易路徑應含commitTransaction(指令數${d.M})`)
            let specs = []
            for (let at = 1; at <= d.K; at++) {
                specs.push({ mode: 'rs', port: ports.rs, op: 'insertBulk', at, kind: 'rst', tag: `rst${at}` })
            }
            specs.push({ mode: 'rs', port: ports.rs, op: 'insertBulk', at: 1, kind: 'fin', tag: 'fin1' })
            for (let at = 1; at <= d.M; at++) {
                specs.push({ mode: 'rs', port: ports.rs, op: 'insertBulk', at, kind: 'inflight', tag: `inflight${at}` })
                specs.push({ mode: 'rs', port: ports.rs, op: 'insertBulk', at, kind: 'inflightx', tag: `inflightx${at}` })
            }
            chkAlive(await runMany(specs, 3))
        })

    })


    //R-CLIENTERR-01-5 變異: 拿掉GridFS串流之error監聽, 同情境行程須終止(證明上列情境抓得到)
    describe('mutation: GridFS stream error listeners removed', function() {

        it('upload stream: without the listener, an upload error event terminates the process; with it, it does not', async function() {
            let mut = mkMutant('mutUp', SRC_UP, SRC_UP.replace('\'error\'', '\'errorX\''))

            //重複鍵: 上傳串流以error事件回報
            let spec = { mode: 'standalone', port: ports.standalone, op: 'insertGfs', at: 0, kind: 'none', dup: true, tag: 'dup' }
            let rMut = await runScenario(spec, mut)
            assert.ok(isCrash(rMut), `變異版應終止: ${brief(rMut)}`)
            assert.ok(/Unhandled 'error' event/.test(rMut.stderr), `應為未處理之error事件: ${brief(rMut)}`)
            let rOk = await runScenario({ ...spec, tag: 'dupOk' })
            assert.ok(!isCrash(rOk) && rOk.res.outcome === 'resolve', `本套件版不應終止: ${brief(rOk)}`)

            //空檔與語句進行中之中斷: 變異版於至少一個位置終止, 本套件版皆不終止
            let d = getDim('standalone', 'insertGfs')
            let specs = []
            for (let at = 1; at <= d.M; at++) {
                specs.push({ mode: 'standalone', port: ports.standalone, op: 'insertGfs', at, kind: 'inflightx', tag: `mutInflightx${at}` })
            }
            let outsMut = await runMany(specs, 3, mut)
            let outsOk = await runMany(specs.map((s) => ({ ...s, tag: `${s.tag}ok` })), 3)
            assert.ok(outsMut.some(isCrash), `變異版於語句進行中之中斷應至少一處終止: ${outsMut.map((r) => `${r.spec.at}:${r.exit}`).join(',')}`)
            assert.ok(outsOk.every((r) => !isCrash(r)), `本套件版不應終止: ${outsOk.filter(isCrash).map(brief).join('; ')}`)
        })

        it('download stream: without the listener, a download error event terminates the process; with it, it does not', async function() {
            let mut = mkMutant('mutDown', SRC_DOWN, SRC_DOWN.replace('\'error\'', '\'errorX\''))

            //查無檔案: 下載串流以ENOENT之error事件回報
            let spec = { mode: 'standalone', port: ports.standalone, op: 'selectByPkGfs', at: 0, kind: 'none', missing: true, tag: 'missing' }
            let rMut = await runScenario(spec, mut)
            assert.ok(isCrash(rMut), `變異版應終止: ${brief(rMut)}`)
            assert.ok(/Unhandled 'error' event/.test(rMut.stderr), `應為未處理之error事件: ${brief(rMut)}`)
            let rOk = await runScenario({ ...spec, tag: 'missingOk' })
            assert.ok(!isCrash(rOk) && rOk.res.outcome === 'resolve', `本套件版不應終止: ${brief(rOk)}`)

            //語句進行中之中斷
            let d = getDim('standalone', 'selectByPkGfs')
            let specs = []
            for (let at = 1; at <= d.M; at++) {
                specs.push({ mode: 'standalone', port: ports.standalone, op: 'selectByPkGfs', at, kind: 'inflightx', tag: `mutInflightx${at}` })
            }
            let outsMut = await runMany(specs, 3, mut)
            let outsOk = await runMany(specs.map((s) => ({ ...s, tag: `${s.tag}ok` })), 3)
            assert.ok(outsMut.some(isCrash), `變異版於語句進行中之中斷應至少一處終止: ${outsMut.map((r) => `${r.spec.at}:${r.exit}`).join(',')}`)
            assert.ok(outsOk.every((r) => !isCrash(r)), `本套件版不應終止: ${outsOk.filter(isCrash).map(brief).join('; ')}`)
        })

    })

})

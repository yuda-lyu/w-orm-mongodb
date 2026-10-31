import net from 'net'
import { createRequire } from 'module'
import { pathToFileURL } from 'url'


//子行程情境(供api-clienterr.test.mjs以獨立行程執行): 令MongoDB連線於「操作之空檔」被中斷, 觀察本行程是否因未被監聽之error事件而終止
//  用法: node clientErrScenario.mjs '<json>'
//  spec: { srcPath, port, mode:'standalone'|'rs', op, at, kind, tag }
//    kind none      乾跑, 只計數(每個操作之連線池取用次數nCheckOut與操作指令數nOpCmd)
//    kind rst       空檔: 於第at次連線池取用之前, 以RST切斷經代理之全部連線(含監控連線)並等到驅動察覺
//    kind fin       空檔: 同上, 以正常關閉(FIN)切斷
//    kind inflight  對照組(語句進行中): 第at個操作指令送出後、回應被代理扣住時以RST切斷(驅動對可重試之讀寫會重試一次, 故多數情況錯誤被重試掩蓋)
//    kind inflightx 同inflight, 但自第at個操作指令起連續cutN個(預設2: 該指令與驅動對它所作之一次重試)指令送出後皆被切斷, 令網路錯誤確實上浮而不被重試掩蓋;
//                   不可無限切斷: replica set之withTransaction對暫時性錯誤會重試至多120秒, 使交易路徑之操作遲遲不結束(驅動行為, 非崩潰)
//  輸出: 以RESULT開頭之一行JSON; 行程因未處理之error事件(或未處理之reject)而終止時離開碼非0且stderr有原文, 由父行程判讀
//  接縫: 以驅動內部lib/cmap/connection_pool.js之checkOut、lib/cmap/connection.js之command為注入點(僅限本子行程內, 不改node_modules);
//  驅動升版致該接縫移位時以離開碼4與DRIVER_INTERNALS_MOVED明示, 不使測試空轉


let spec = JSON.parse(process.argv[2])
let require = createRequire(import.meta.url)
let { ConnectionPool } = require('mongodb/lib/cmap/connection_pool.js')
let { Connection } = require('mongodb/lib/cmap/connection.js')

if (typeof (ConnectionPool && ConnectionPool.prototype && ConnectionPool.prototype.checkOut) !== 'function' || typeof (Connection && Connection.prototype && Connection.prototype.command) !== 'function') {
    console.log('DRIVER_INTERNALS_MOVED')
    process.exit(4)
}

let delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

//代理, 轉送至容器對外埠, 可整批切斷, 亦可扣住伺服端回應
let pairs = new Set()
let hold = false
let proxy = net.createServer((c) => {
    let s = net.connect(spec.port, '127.0.0.1')
    let pair = { c, s }
    pairs.add(pair)
    let done = () => {
        pairs.delete(pair)
        c.destroy()
        s.destroy()
    }
    c.on('close', done)
    s.on('close', done)
    c.on('error', () => {})
    s.on('error', () => {})
    c.on('data', (d) => {
        s.write(d)
    })
    s.on('data', (d) => {
        if (!hold) {
            c.write(d)
        }
    })
})
await new Promise((resolve) => {
    proxy.listen(0, '127.0.0.1', resolve)
})
let pport = proxy.address().port

let urlOf = (port) => {
    return spec.mode === 'rs' ? `mongodb://127.0.0.1:${port}/?directConnection=true` : `mongodb://username:password@127.0.0.1:${port}`
}

async function cutProxy(how) {
    hold = false
    for (let p of [...pairs]) {
        if (how === 'rst') {
            p.c.resetAndDestroy()
            p.s.resetAndDestroy()
        }
        else {
            p.c.destroy()
            p.s.destroy()
        }
    }
    for (let i = 0; i < 100 && pairs.size > 0; i++) {
        await delay(10)
    }
}

let armed = false
let nCheckOut = 0
let nOpCmd = 0
let cuts = 0
let log = []

let origCheckOut = ConnectionPool.prototype.checkOut
ConnectionPool.prototype.checkOut = async function(...a) {
    if (armed) {
        nCheckOut++
        if ((spec.kind === 'rst' || spec.kind === 'fin') && spec.at === nCheckOut) {
            await cutProxy(spec.kind)
            cuts++
            await delay(300) //令驅動對已關閉之連線與監控連線完成善後
        }
    }
    return origCheckOut.apply(this, a)
}

let OPCMDS = new Set(['find', 'insert', 'update', 'delete', 'createIndexes', 'listIndexes', 'aggregate', 'count', 'getMore', 'commitTransaction', 'abortTransaction', 'create', 'drop', 'distinct', 'findAndModify'])
let origCommand = Connection.prototype.command
Connection.prototype.command = function(ns, cmd, ...rest) {
    let name = cmd && typeof cmd === 'object' ? Object.keys(cmd)[0] : ''
    if (armed && OPCMDS.has(name)) {
        nOpCmd++
        log.push(name)
        if ((spec.kind === 'inflight' && spec.at === nOpCmd) || (spec.kind === 'inflightx' && nOpCmd >= spec.at && nOpCmd < spec.at + (spec.cutN ?? 2))) {
            hold = true
            let p = origCommand.call(this, ns, cmd, ...rest)
            setTimeout(() => {
                cutProxy('rst').then(() => {
                    cuts++
                })
            }, 60)
            return p
        }
    }
    return origCommand.call(this, ns, cmd, ...rest)
}

//src
let { default: WOrm } = await import(pathToFileURL(spec.srcPath).href)
let cl = `c_${spec.op}_${spec.tag ?? 'x'}`
let u8a = new Uint8Array(600 * 1024)
for (let i = 0; i < u8a.length; i++) {
    u8a[i] = i % 251
}
let optOf = (port) => {
    return { url: urlOf(port), db: 'wclienterr', cl }
}

//種子資料(直連, 不經代理, 不計數): 令讀取與刪除類操作有實際數據可處理; 失敗屬準備階段而非受測之操作, 以離開碼3標示
try {
    let seed = new WOrm(optOf(spec.port))
    if (['select', 'selectByPk', 'del', 'delAll', 'save'].includes(spec.op)) {
        await seed.insert({ id: 'a1', name: 'n1' })
        await seed.insert({ id: 'a2', name: 'n2' })
    }
    if (['selectByPkGfs', 'delGfs', 'delAllGfs'].includes(spec.op)) {
        await seed.insertGfs({ id: 'a1', u8a })
    }
    if (spec.op === 'insertGfs' && spec.dup) {
        await seed.insertGfs({ id: 'b1', u8a }) //令受測之insertGfs遇重複鍵(上傳串流以error事件回報)
    }
}
catch (err) {
    console.log('SEEDFAIL ' + String(err && err.message).slice(0, 200))
    process.exit(3)
}

let w = new WOrm(optOf(pport))
let events = []
w.on('error', (m) => {
    events.push(m)
})

let opFns = {
    select: () => w.select(),
    selectByPk: () => w.selectByPk('a1'),
    insert: () => w.insert({ id: 'b1', name: 'nn' }),
    insertBulk: () => w.insertBulk([{ id: 'b1', name: 'nn' }, { id: 'b2', name: 'nn' }]),
    save: () => w.save({ id: 'a1', name: 'changed' }),
    del: () => w.del({ id: 'a1' }),
    delAll: () => w.delAll(),
    selectByPkGfs: () => w.selectByPkGfs(spec.missing ? 'nofile' : 'a1'),
    insertGfs: () => w.insertGfs({ id: 'b1', u8a }),
    delGfs: () => w.delGfs({ id: 'a1' }),
    delAllGfs: () => w.delAllGfs(),
}

armed = true
let outcome = null
let brief = null
try {
    await opFns[spec.op]()
    outcome = 'resolve'
}
catch (err) {
    outcome = 'reject'
    brief = String(err && err.message).slice(0, 140)
}
armed = false

//留一段時間, 令操作結束後才到達之事件(如關閉連線後之遲到錯誤)亦有機會使行程終止
await delay(800)
console.log('RESULT ' + JSON.stringify({ op: spec.op, kind: spec.kind, at: spec.at, outcome, brief, nCheckOut, nOpCmd, cuts, events, log }))
proxy.close()
process.exit(0)

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

//診斷輸出遮罩接線之變異執行器(rulebook R-DIAG-01; 只改複本, 不動src/): 以repo根為cwd, 需用quiet-run --lock包(執行測試)
//  node test/tools/diagMutRun.mjs [名稱子字串...]
//於 tmp/diagmut/work/<名>/ 建 src/WOrmMongodb.mjs(施加變異)與 test/(複製三個單元檔與tools), 以 mocha --bail 執行(cwd為該夾; node往上層找到repo之node_modules, 不需連接點)
//變異須被至少一個測試殺死(mocha離開碼非0); 回報存活者與未套用者(needle找不到/次數不符), 結果寫 tmp/diagmut/results.json; 離開碼0表示全數殺死
//新增站點或接縫時於下方muts補對應變異(漏包、誤包固定詞彙、旁路)


let ROOT = path.resolve('.')
let SRC = fs.readFileSync(path.join(ROOT, 'src/WOrmMongodb.mjs'), 'utf8')
let TESTS = ['unit-diagwire.test.mjs', 'unit-diaglog.test.mjs', 'unit-urlerr.test.mjs']
let TOOLS = ['fakeMongo.mjs', 'diagScenario.mjs', 'urlerrWorker.mjs']
let MOCHA = path.join(ROOT, 'node_modules/mocha/bin/mocha.js')
let BASE = path.join(ROOT, 'tmp/diagmut')
let WORK = path.join(BASE, 'work')


//nth, 取代第n個(1起算)出現之needle; needle不存在該次數即拋錯(確保變異有套用)
let nth = (s, needle, rep, n = 1) => {
    let i = -1
    for (let k = 0; k < n; k++) {
        i = s.indexOf(needle, i + 1)
        if (i < 0) {
            throw new Error(`needle not found (${n}th): ${needle}`)
        }
    }
    return s.slice(0, i) + rep + s.slice(i + needle.length)
}

//once, needle須恰出現一次
let once = (s, needle, rep) => {
    let c = s.split(needle).length - 1
    if (c !== 1) {
        throw new Error(`needle count ${c} !== 1: ${needle}`)
    }
    return s.replace(needle, () => rep)
}


let FNS = ['select', 'selectByPk', 'insert', 'insertBulk', 'save', 'del', 'delAll', 'insertGfs', 'selectByPkGfs', 'delGfs', 'delAllGfs']
let muts = []
let add = (name, fn) => muts.push({ name, fn })

//A. 漏包一個批次catch站點(11個函數各一, 依檔內出現順序)
FNS.forEach((f, k) => add(`catch-miss-${f}`, (s) => nth(s, 'res = outErr(err)', 'res = err', k + 1)))

//B. 誤包固定詞彙之reject(把本套件自身之固定詞彙錯誤也經diag.err)
add('outErr-wraps-own', (s) => once(s, 'return ours.has(err) ? err : diag.err(err)', 'return diag.err(err)'))
add('ownErr-not-registered', (s) => once(s, 'ours.add(e)\n        return e', 'return e'))
add('cvFind-not-registered', (s) => once(s, 'ours.add(err)', 'void err'))
add('procPk-raw-error', (s) => once(s, 'throw ownErr(`invalid data[${k}].id, autoGenPk is false`)', 'throw new Error(`invalid data[${k}].id, autoGenPk is false`)'))
add('procDocs-raw-error', (s) => nth(s, 'throw ownErr(msg)', 'throw new Error(msg)', 1))
add('insertGfs-msg-raw-error', (s) => nth(s, 'throw ownErr(msg)', 'throw new Error(msg)', 2))
add('insertGfs-u8a-raw-error', (s) => once(s, 'throw ownErr(`invalid data[${k}].u8a`)', 'throw new Error(`invalid data[${k}].u8a`)'))
;['select', 'delAll', '_findGfs', 'delAllGfs'].forEach((f, k) => add(`cvFind-raw-${f}`, (s) => nth(s, 'find = cvFind(find)', 'find = cvOrmFind(find)', k + 1)))

//C. 逐筆err未遮
add('outMsg-never-mask', (s) => once(s, 'return diag.mask(getErrMsg(err))', 'return getErrMsg(err)'))
;['save', 'del', 'delGfs'].forEach((f, k) => add(`item-err-raw-${f}`, (s) => nth(s, 'err: outMsg(err)', 'err: getErrMsg(err)', k + 1)))

//D. 關閉連線與複製輸入之站點
add('closeClient-no-mask', (s) => nth(s, 'throw diag.err(err)', 'throw err', 1))
add('cloneData-no-mask', (s) => nth(s, 'throw diag.err(err)', 'throw err', 2))
FNS.forEach((f, k) => add(`close-bypass-${f}`, (s) => nth(s, 'await closeClient(client)', 'await client.close()', k + 1)))
;['insert', 'insertBulk', 'save', 'del'].forEach((f, k) => add(`clone-bypass-${f}`, (s) => nth(s, 'data = cloneData(data)', 'data = cloneDeep(data)', k + 1)))

//E. 宣告
add('secrets-empty', (s) => once(s, 'secrets: getDiagSecrets({ urls: [url] }),', 'secrets: getDiagSecrets({}),'))
add('no-patterns', (s) => once(s, 'patterns: [\'mongoHostEcho\'],\n', ''))
add('no-codes', (s) => once(s, 'codes: [\'mongoServer\'],\n', ''))
add('no-safeKeys', (s) => once(s, 'safeKeys: [\'mode\'],\n', ''))
add('opt-not-passed', (s) => once(s, 'getDiag(opt, {', 'getDiag({}, {'))

//F. level與摘要
add('level-change-error', (s) => once(s, '() => err, \'log\')', '() => err, \'error\')'))
add('level-error-error', (s) => once(s, '() => errEmit, \'log\')', '() => errEmit, \'error\')'))
add('brief-removed-change', (s) => once(s, '{ mode, ...diag.brief(err) }', '{ mode }'))
add('brief-removed-error', (s) => once(s, '{ mode, ...diag.brief(errEmit) }', '{ mode }'))

//G. 自寫遮罩(不得重寫, 一律經wsemi)
add('own-mask-in-outErr', (s) => once(s, 'return ours.has(err) ? err : diag.err(err)', 'return ours.has(err) ? err : (err instanceof Error ? Object.assign(err, { message: String(err.message).split(\'Pw9xQz7k\').join(\'***\') }) : err)'))


let args = process.argv.slice(2)
let sel = muts.filter((m) => args.length === 0 || args.some((a) => m.name.indexOf(a) >= 0))
let N = 4


let runOne = (m) => new Promise((resolve) => {
    let dir = path.join(WORK, m.name)
    fs.rmSync(dir, { recursive: true, force: true })
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.mkdirSync(path.join(dir, 'test/tools'), { recursive: true })
    let out
    try {
        out = m.fn(SRC)
    }
    catch (err) {
        resolve({ name: m.name, status: 'NOT-APPLIED', info: err.message })
        return
    }
    if (out === SRC) {
        resolve({ name: m.name, status: 'NOT-APPLIED', info: 'no change' })
        return
    }
    fs.writeFileSync(path.join(dir, 'src/WOrmMongodb.mjs'), out)
    for (let f of TESTS) {
        fs.copyFileSync(path.join(ROOT, 'test', f), path.join(dir, 'test', f))
    }
    for (let f of TOOLS) {
        fs.copyFileSync(path.join(ROOT, 'test/tools', f), path.join(dir, 'test/tools', f))
    }
    let jf = path.join(dir, 'result.json')
    let p = spawn(process.execPath, [MOCHA, ...TESTS.map((f) => `test/${f}`), '--bail', '--timeout', '60000', '--reporter', 'json', '--reporter-option', `output=${jf}`], { cwd: dir, windowsHide: true, stdio: 'ignore' })
    p.on('close', (code) => {
        let first = ''
        try {
            let j = JSON.parse(fs.readFileSync(jf, 'utf8'))
            first = j.failures && j.failures[0] ? j.failures[0].fullTitle.slice(0, 110) : ''
        }
        catch (err) {
            first = '(no json)'
        }
        resolve({ name: m.name, status: code === 0 ? 'SURVIVED' : 'killed', info: first })
    })
})


let results = []
let idx = 0
let worker = async () => {
    while (idx < sel.length) {
        let m = sel[idx++]
        let r = await runOne(m)
        results.push(r)
        console.log(`${r.status.padEnd(11)} ${r.name.padEnd(30)} ${r.info}`)
    }
}
await Promise.all(Array.from({ length: N }, worker))
let nk = results.filter((r) => r.status === 'killed').length
let ns = results.filter((r) => r.status === 'SURVIVED')
let nn = results.filter((r) => r.status === 'NOT-APPLIED')
console.log(`\n變異 ${results.length} 個: 殺死 ${nk}、存活 ${ns.length}、未套用 ${nn.length}`)
for (let r of ns) {
    console.log('存活:', r.name)
}
for (let r of nn) {
    console.log('未套用:', r.name, r.info)
}
fs.mkdirSync(BASE, { recursive: true })
fs.writeFileSync(path.join(BASE, 'results.json'), JSON.stringify(results, null, 1))
process.exit(ns.length + nn.length === 0 ? 0 : 1)

//產生test/tools/diagGolden.json: 以指定之src(預設為本套件目前之src)執行diagScenario.mjs之情境, 結果即固定預期值
//重現golden: 以修改前之git HEAD之src為準, 先 git archive HEAD src 解到一個資料夾(如 ./tmp/mongo-run01/head), 再
//  DIAG_SRC=<該資料夾>/src/WOrmMongodb.mjs DIAG_OUT=<輸出json路徑> node test/tools/diagGoldenGen.mjs
//需 docker(自建自刪容器worm-test-mongodb-diaggold); 診斷輸出(console)於產生期間靜音


import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { genUrl, startContainer, stopContainer } from '../lib/api-setup.mjs'
import { scenario, scenarioOffline } from './diagScenario.mjs'


let src = path.resolve(process.env.DIAG_SRC || './src/WOrmMongodb.mjs')
let out = path.resolve(process.env.DIAG_OUT || './test/tools/diagGolden.json')
console.log('src', src)
console.log('out', out)

let { default: WOrm } = await import(pathToFileURL(src).href)

let ctName = 'worm-test-mongodb-diaggold'
let ctPort = await startContainer(ctName)
let golden = {}
try {
    let log = console.log
    console.log = () => {}
    try {
        for (let bad of [false, true]) {
            let w = WOrm({ url: genUrl(ctPort), db: 'worm', cl: 'diag' })
            golden[`online_${bad ? 'bad' : 'ok'}`] = await scenario(w, bad)
            golden[`offline_${bad ? 'bad' : 'ok'}`] = await scenarioOffline(WOrm, bad)
        }
    }
    finally {
        console.log = log
    }
}
finally {
    await stopContainer(ctName)
}
fs.writeFileSync(out, JSON.stringify(golden, null, 2), 'utf8')
console.log('written', out)

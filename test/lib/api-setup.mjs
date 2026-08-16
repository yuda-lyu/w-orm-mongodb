import net from 'net'
import mongodb from 'mongodb'
import { execFile } from 'child_process'
import { promisify } from 'util'


//測試自行創建docker容器供MongoDB服務, 測試結束即銷毀, 故僅需環境已安裝docker


let execFileAsync = promisify(execFile)


let ctImage = 'mongo:8'
let ctUser = 'username'
let ctPassword = 'password'


let delay = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

//getFreePort, 由系統配發空閒埠
let getFreePort = () => {
    return new Promise((resolve, reject) => {
        let srv = net.createServer()
        srv.on('error', reject)
        srv.listen(0, () => {
            let port = srv.address().port
            srv.close(() => {
                resolve(port)
            })
        })
    })
}

//docker, 以陣列傳參不經shell, 避免路徑與引號轉譯問題
let docker = (args) => {
    return execFileAsync('docker', args)
}

//genUrl
let genUrl = (port) => {
    return `mongodb://${ctUser}:${ctPassword}@127.0.0.1:${port}`
}

//probeReady, 以mongodb驅動直連容器對外埠試跑ping
//不使用容器內mongosh, 因mongo映像初始化期間會先啟動僅監聽unix socket之臨時服務,
//容器內探測會提早回報就緒, 直連TCP方為測試實際所走路徑
let probeReady = async (port) => {
    let client = new mongodb.MongoClient(genUrl(port), { serverSelectionTimeoutMS: 2000 })
    let ok = false
    try {
        await client.db('admin').command({ ping: 1 })
        ok = true
    }
    catch (err) {
        ok = false
    }
    finally {
        await client.close().catch(() => {})
    }
    return ok
}

//startContainer, 創建容器並等待服務就緒, 回傳容器對外埠
//對外埠由getFreePort動態取得, 避免與既有MongoDB服務搶27017, 亦避免多測試檔並行時互搶同一埠
//mongo映像以MONGO_INITDB_ROOT_USERNAME、MONGO_INITDB_ROOT_PASSWORD即建妥帳號, 無須另跑建置語句
let startContainer = async (ctName) => {

    //check docker
    await docker(['version', '--format', '{{.Server.Version}}'])
        .catch(() => {
            throw new Error('需先安裝並啟動docker才能執行mongodb測試')
        })

    //清除前次殘留容器
    await docker(['rm', '-f', ctName]).catch(() => {})

    //run, getFreePort取得之埠於關閉監聽至docker實際綁定之間可能已被他者佔用,
    //多測試檔並行時尤其容易發生, 故綁定失敗即改取新埠重試
    let ctPort = null
    let nTry = 10
    for (let i = 0; i < nTry; i++) {

        //ctPort
        ctPort = await getFreePort()

        //run
        let err = null
        await docker(['run', '-d', '--rm', '--name', ctName, '-e', `MONGO_INITDB_ROOT_USERNAME=${ctUser}`, '-e', `MONGO_INITDB_ROOT_PASSWORD=${ctPassword}`, '-p', `${ctPort}:27017`, ctImage])
            .catch((e) => {
                err = e
            })

        //check
        if (err === null) {
            break
        }

        //僅埠被佔用方可重試, 其餘錯誤須往外拋
        let msg = `${err.stderr || ''}${err.message || ''}`
        let isPortBusy = msg.indexOf('address already in use') >= 0 || msg.indexOf('port is already allocated') >= 0
        if (!isPortBusy || i === nTry - 1) {
            throw err
        }

        //清除綁定失敗所遺留之容器
        await docker(['rm', '-f', ctName]).catch(() => {})

    }

    //等待服務就緒, 首次需拉取映像故給予較長時間
    let ready = false
    for (let i = 0; i < 90; i++) {
        let ok = await probeReady(ctPort)
        if (ok) {
            ready = true
            break
        }
        await delay(2000)
    }
    if (!ready) {
        throw new Error('mongodb容器啟動逾時')
    }

    return ctPort
}

//stopContainer, 銷毀容器
let stopContainer = async (ctName) => {
    await docker(['rm', '-f', ctName]).catch(() => {})
}


export {
    delay,
    genUrl,
    startContainer,
    stopContainer
}

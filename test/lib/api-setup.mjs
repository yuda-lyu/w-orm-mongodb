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

//genUrlRs, replica set容器之連線字串
//directConnection=true係因容器內之replica set成員位址為127.0.0.1:27017, 由宿主機依該位址連不到,
//故不可令驅動走成員探索, 須直連本次映射之對外埠
let genUrlRs = (port) => {
    return `mongodb://127.0.0.1:${port}/?directConnection=true`
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

//probeReadyRs, replica set容器須等到本節點成為PRIMARY方可寫入
let probeReadyRs = async (port) => {
    let client = new mongodb.MongoClient(genUrlRs(port), { serverSelectionTimeoutMS: 2000 })
    let ok = false
    try {
        let hello = await client.db('admin').command({ hello: 1 })
        ok = hello.isWritablePrimary === true
    }
    catch (err) {
        ok = false
    }
    finally {
        await client.close().catch(() => {})
    }
    return ok
}

//runContainer, 創建容器並回傳對外埠
//對外埠由getFreePort動態取得, 避免與既有MongoDB服務搶27017, 亦避免多測試檔並行時互搶同一埠
//getFreePort取得之埠於關閉監聽至docker實際綁定之間可能已被他者佔用, 多測試檔並行時尤其容易發生,
//故綁定失敗即改取新埠重試
let runContainer = async (ctName, genArgs) => {

    //check docker
    await docker(['version', '--format', '{{.Server.Version}}'])
        .catch(() => {
            throw new Error('需先安裝並啟動docker才能執行mongodb測試')
        })

    //清除前次殘留容器
    await docker(['rm', '-f', ctName]).catch(() => {})

    //run
    let ctPort = null
    let nTry = 10
    for (let i = 0; i < nTry; i++) {

        //ctPort
        ctPort = await getFreePort()

        //run
        let err = null
        await docker(genArgs(ctPort))
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

    return ctPort
}

//waitReady, 輪詢至就緒, 首次需拉取映像故給予較長時間
let waitReady = async (fnProbe, port, msgErr) => {
    for (let i = 0; i < 90; i++) {
        let ok = await fnProbe(port)
        if (ok) {
            return
        }
        await delay(2000)
    }
    throw new Error(msgErr)
}

//startContainer, 創建standalone容器並等待服務就緒, 回傳容器對外埠
//mongo映像以MONGO_INITDB_ROOT_USERNAME、MONGO_INITDB_ROOT_PASSWORD即建妥帳號, 無須另跑建置語句
let startContainer = async (ctName) => {

    //run
    let ctPort = await runContainer(ctName, (port) => {
        return ['run', '-d', '--rm', '--name', ctName, '-e', `MONGO_INITDB_ROOT_USERNAME=${ctUser}`, '-e', `MONGO_INITDB_ROOT_PASSWORD=${ctPassword}`, '-p', `${port}:27017`, ctImage]
    })

    //waitReady
    await waitReady(probeReady, ctPort, 'mongodb容器啟動逾時')

    return ctPort
}

//startContainerRs, 創建replica set容器並等待PRIMARY就緒, 回傳容器對外埠
//交易須replica set或分片叢集方可用, standalone不支援, 故驗證交易路徑須另起本容器
//本容器不開啟認證: --replSet配合MONGO_INITDB_ROOT_*須另備keyFile以供成員間內部認證, 於測試無必要
let startContainerRs = async (ctName) => {

    //run
    let ctPort = await runContainer(ctName, (port) => {
        return ['run', '-d', '--rm', '--name', ctName, '-p', `${port}:27017`, ctImage, '--replSet', 'rs0', '--bind_ip_all']
    })

    //等待服務可回應, 此時尚未initiate故非PRIMARY
    let up = false
    for (let i = 0; i < 90; i++) {
        let ok = await docker(['exec', ctName, 'mongosh', '--quiet', '--eval', 'db.adminCommand({ping:1}).ok'])
            .then(() => true)
            .catch(() => false)
        if (ok) {
            up = true
            break
        }
        await delay(2000)
    }
    if (!up) {
        throw new Error('mongodb replica set容器啟動逾時')
    }

    //initiate, 單成員之replica set即足以啟用交易
    await docker(['exec', ctName, 'mongosh', '--quiet', '--eval', 'rs.initiate({_id:"rs0",members:[{_id:0,host:"127.0.0.1:27017"}]})'])
        .catch((err) => {
            //已initiate者再次呼叫會報AlreadyInitialized, 屬正常
            let msg = `${err.stderr || ''}${err.message || ''}`
            if (msg.indexOf('AlreadyInitialized') < 0) {
                throw err
            }
        })

    //waitReady, 等待本節點成為PRIMARY
    await waitReady(probeReadyRs, ctPort, 'mongodb replica set選舉逾時')

    return ctPort
}

//stopContainer, 銷毀容器
let stopContainer = async (ctName) => {
    await docker(['rm', '-f', ctName]).catch(() => {})
}


export {
    delay,
    genUrl,
    genUrlRs,
    startContainer,
    startContainerRs,
    stopContainer
}

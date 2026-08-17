import mongodb from 'mongodb'
import stream from 'stream'
import cloneDeep from 'lodash-es/cloneDeep.js'
import every from 'lodash-es/every.js'
import get from 'lodash-es/get.js'
import map from 'lodash-es/map.js'
import omit from 'lodash-es/omit.js'
import size from 'lodash-es/size.js'
import evem from 'wsemi/src/evem.mjs'
import genPm from 'wsemi/src/genPm.mjs'
import genIDSeq from 'wsemi/src/genIDSeq.mjs'
import isbol from 'wsemi/src/isbol.mjs'
import isestr from 'wsemi/src/isestr.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import isearr from 'wsemi/src/isearr.mjs'
import iseobj from 'wsemi/src/iseobj.mjs'
import isu8arr from 'wsemi/src/isu8arr.mjs'
import pmSeries from 'wsemi/src/pmSeries.mjs'


/**
 * 操作資料庫(MongoDB)
 *
 * 本套件之主鍵欄位固定為id，尚未支援由呼叫端指定。id為無業務語義之識別碼。
 * opt.autoGenPk預設為true，insert、save與insertGfs於輸入未帶有效id時自動產生；del於任一設定下皆不補值。
 * opt.autoGenPk為false時套件一律不產生id，未帶有效id者以reject拋出，且id之唯一性與格式皆由呼叫端自負。
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.url='mongodb://127.0.0.1:27017'] 輸入連接資料庫字串，預設'mongodb://127.0.0.1:27017'
 * @param {String} [opt.db='worm'] 輸入使用資料庫名稱字串，預設'worm'
 * @param {String} [opt.cl='test'] 輸入使用資料表名稱字串，預設'test'
 * @param {Boolean} [opt.autoGenPk=true] 輸入是否於輸入未帶有效主鍵時自動產生主鍵值，預設true。為false時主鍵須由呼叫端自備，屬依賴注入之定位，主鍵之唯一性、格式與是否與既有資料衝突皆由呼叫端自負。本設定為建構層設定，不得於insert與save之option逐次覆寫
 * @returns {Object} 回傳操作資料庫物件，各事件功能詳見說明
 */
function WOrmMongodb(opt = {}) {


    //default
    if (!opt.url) {
        opt.url = 'mongodb://127.0.0.1:27017'
    }
    if (!opt.db) {
        opt.db = 'worm'
    }
    if (!opt.cl) {
        opt.cl = 'test'
    }


    //autoGenPk, 預設開啟, 為false時主鍵一律由呼叫端自備, 套件不產生亦不補救
    let autoGenPk = get(opt, 'autoGenPk')
    if (!isbol(autoGenPk)) {
        autoGenPk = true
    }


    //_indexReady, 唯一索引只須建立一次, 以旗標記錄避免每次操作皆多一次round-trip
    let _indexReady = false


    //_indexGfsReady, GridFS之唯一索引亦只須建立一次
    let _indexGfsReady = false


    //ee, 採wsemi之evem(即eventemitter3), 其於'error'無監聽者時僅回傳false而不拋出,
    //故本套件之操作行為不因呼叫端有無註冊監聽而改變; Node內建之EventEmitter具該拋出語義, 不可用
    let ee = evem()


    //MongoClient
    let MongoClient = mongodb.MongoClient


    /**
     * 取錯誤訊息字串，供逐筆結果之err欄位使用
     *
     * @ignore
     * @param {Error|String} err 輸入錯誤物件或字串
     * @returns {String} 回傳錯誤訊息字串
     */
    function getErrMsg(err) {

        //message
        let message = get(err, 'message')
        if (isestr(message)) {
            return message
        }

        return String(err)
    }


    /**
     * 發出change事件，訂閱函數拋錯不得影響本次操作之結果，故另包try並自行吞掉
     *
     * @ignore
     * @param {String} mode 輸入操作模式字串
     * @param {Array|null} data 輸入本次操作之數據
     * @param {Object|Array} res 輸入本次操作之結果
     * @returns {undefined} 無回傳值
     */
    function emitChange(mode, data, res) {
        try {
            ee.emit('change', mode, data, res)
        }
        catch (err) {
            console.log(err)
        }
    }


    /**
     * 發出error事件，操作發生錯誤時發出，錯誤訊息一律轉為字串
     * 註: 事件僅為附加通知，所送出之資訊必另有正規管道——整批性錯誤經Promise.reject，逐筆失敗經該筆之err欄位
     * 註: 訂閱函數拋錯不得影響本次操作之結果，故另包try並自行吞掉
     * 註: 正常結果不得發出本事件，如insert全數已存在、save合併後內容相同、del主鍵未命中、selectByPk查無數據
     *
     * @ignore
     * @param {String} mode 輸入操作別字串
     * @param {Array|null} data 輸入本次操作之數據
     * @param {Error|String} err 輸入錯誤物件或字串
     * @returns {undefined} 無回傳值
     */
    function emitError(mode, data, err) {
        try {
            ee.emit('error', mode, data, getErrMsg(err))
        }
        catch (errEmit) {
            console.log(errEmit)
        }
    }


    /**
     * 檢查並補齊單筆數據之主鍵
     * autoGenPk為true時未帶有效id者自動產生，為false時往外拋
     * 註: 未帶有效id屬呼叫端未履行契約而非某一筆資料本身之問題，故為整批性錯誤而不降級為該筆ok為0，
     * 若降級為逐筆結果，呼叫端易於整批resolve之下漏看，使[忘了給id]靜默變成[少寫了幾筆]
     * 註: 本函數須於任何寫入之前一次對全部數據完成，令拋錯時同批之有效筆數亦不會被寫入
     *
     * @ignore
     * @param {Object} v 輸入數據物件
     * @param {Number} k 輸入數據於陣列內之索引
     * @returns {Object} 回傳補齊主鍵之數據物件
     */
    function procPk(v, k) {

        //check
        if (!isestr(v.id)) {

            //check, autoGenPk為false時主鍵須由呼叫端自備
            if (!autoGenPk) {
                throw new Error(`invalid data[${k}].id, autoGenPk is false`)
            }

            //genIDSeq
            v.id = genIDSeq()

        }

        return v
    }


    /**
     * 判定是否為唯一索引重複鍵錯誤(11000)，批次插入時須全部寫入錯誤皆為重複鍵才算
     *
     * @ignore
     * @param {Error} err 輸入錯誤物件
     * @returns {Boolean} 回傳是否為重複鍵錯誤布林值
     */
    function isDupKeyError(err) {

        //writeErrors, 批次寫入時各筆錯誤置於writeErrors內
        let writeErrors = get(err, 'writeErrors')
        if (isearr(writeErrors)) {
            return every(writeErrors, function(v) {
                return get(v, 'code') === 11000 || get(v, 'err.code') === 11000
            })
        }

        return get(err, 'code') === 11000
    }


    /**
     * 於id欄位建立唯一索引，令[檢查id是否存在]與[寫入]得由MongoDB於單一文件操作內原子完成
     * 註: 若既有資料表內已存在重複id，建立索引會失敗並將錯誤往外拋，須先自行清除重複數據，
     * 此錯誤影響本次操作之全部數據，屬整批性錯誤，故不轉為逐筆之ok為0
     *
     * @ignore
     * @param {Object} collection 輸入資料表物件
     * @returns {Promise} 回傳Promise，resolve回傳undefined，reject回傳錯誤訊息
     */
    async function ensureIndex(collection) {

        //check
        if (_indexReady) {
            return
        }

        //createIndex, 已存在同樣索引時MongoDB不會重建亦不報錯
        await collection.createIndex({ id: 1 }, { unique: true })

        //_indexReady
        _indexReady = true

    }


    /**
     * 使用GridFS，於filename欄位建立唯一索引，令[檢查id是否存在]與[寫入]由MongoDB判定而非由本套件先讀後寫
     * 註: GridFS以files資料表之filename存放id，其本身不具唯一性，須另建唯一索引方能達成[已存在則跳過]；
     * 若既有資料表內已存在重複id，建立索引會失敗並將錯誤往外拋，須先自行清除重複數據
     *
     * @ignore
     * @param {Object} database 輸入資料庫物件
     * @returns {Promise} 回傳Promise，resolve回傳undefined，reject回傳錯誤訊息
     */
    async function ensureIndexGfs(database) {

        //check
        if (_indexGfsReady) {
            return
        }

        //createIndex, 已存在同樣索引時MongoDB不會重建亦不報錯
        await database.collection(`${opt.cl}.files`).createIndex({ filename: 1 }, { unique: true })

        //_indexGfsReady
        _indexGfsReady = true

    }


    /**
     * 使用GridFS，上傳單筆數據
     * 註: 已存在同一id時MongoDB以重複鍵錯誤拒絕，惟chunks於files文件之前即已寫入，
     * 故須以files_id清除該次所遺留之chunks，避免累積孤兒數據
     *
     * @ignore
     * @param {Object} bucket 輸入GridFSBucket物件
     * @param {Object} clChunks 輸入GridFS之chunks資料表物件
     * @param {String} id 輸入id字串
     * @param {Uint8Array} u8a 輸入數據Uint8Array
     * @returns {Promise} 回傳Promise，resolve回傳本次是否已插入布林值，reject回傳錯誤訊息
     */
    function _uploadGfs(bucket, clChunks, id, u8a) {

        //pm
        let pm = genPm()

        //ws, files_id於finish前即可取得, 供清除孤兒chunks用
        let ws = bucket.openUploadStream(id)
        let fid = ws.id

        //stream
        let sm = new stream.Readable()
        sm._read = () => {}
        sm.push(Buffer.from(u8a))
        sm.push(null)
        sm.pipe(ws) //pipe是接bucket的Writable, 所以會監聽finish
            .on('error', function(err) {

                //check, 重複鍵錯誤表示已存在同一id而跳過, 屬正常結果而非錯誤
                if (!isDupKeyError(err)) {
                    pm.reject(err)
                    return
                }

                //清除本次所遺留之孤兒chunks
                clChunks.deleteMany({ files_id: fid })
                    .then(function() {
                        pm.resolve(false)
                    })
                    .catch(function(err) {
                        pm.reject(err)
                    })

            })
            .on('finish', function() {

                //resolve
                pm.resolve(true)

            })

        return pm
    }


    /**
     * 查詢數據
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入查詢條件物件
     * @returns {Promise} 回傳Promise，resolve回傳數據陣列，無符合數據回傳空陣列，reject回傳錯誤訊息
     */
    async function select(find = {}) {
        let isErr = false

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //find
            let cursor = collection.find(find)

            //toArray
            res = await cursor.toArray()

            //omit, 去除資料庫內部欄位_id, 令回傳欄位與寫入時所給者一致
            res = map(res, function(v) {
                v = omit(v, '_id')
                return v
            })

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('select', null, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 由主鍵查詢單筆數據，因由MongoDB查找且僅回傳單筆，不需如select提取全部符合數據再處理，故數據量大時效能較佳
     * 註: 本套件之主鍵欄位固定為id，尚未支援由呼叫端指定
     * 註: 本函數不得有副作用，故不建立唯一索引
     *
     * @memberOf WOrmMongodb
     * @param {String} pk 輸入主鍵值字串，即數據之id
     * @returns {Promise} 回傳Promise，resolve回傳數據物件，若無此主鍵或主鍵值無效則回傳null，reject回傳錯誤訊息
     */
    async function selectByPk(pk) {
        let isErr = false

        //check
        if (!isestr(pk)) {
            //未給有效主鍵值視為查無數據, 判定基準與insert、save、del內對id之認定一致
            return null
        }

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //findOne, 以投影去除_id, 令回傳形狀與select一致
            let v = await collection.findOne({ id: pk }, { projection: { _id: 0 } })

            //check, 判定基準與insert、save、del內對既有數據之認定一致
            if (iseobj(v)) {
                res = v
            }
            else {
                //不存在id, 回傳null
                res = null
            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('selectByPk', null, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 插入數據，僅於id不存在時寫入，已存在者跳過且不覆寫
     * 由MongoDB於唯一索引上原子完成[檢查id未存在]與[寫入]，併發時同一id僅有一次成功
     * 註: n為輸入筆數，nInserted為實際插入筆數，全數已存在而nInserted為0屬正常結果
     * 註: opt.autoGenPk為true(預設)時未帶有效id者自動產生，為false時未帶有效id即reject且同批皆不寫入
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @returns {Promise} 回傳Promise，resolve回傳插入結果，reject回傳錯誤訊息
     */
    async function insert(data) {
        let isErr = false

        //check
        if (!iseobj(data) && !isearr(data)) {
            return {
                n: 0,
                nInserted: 0,
                ok: 1,
            }
        }

        //cloneDeep
        data = cloneDeep(data)

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //connect, 令連線失敗於寫入前即拋出, 屬影響全部數據之整批性錯誤
            await client.connect()

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //check id, 須於任何寫入之前一次完成, 令autoGenPk為false而拋錯時同批之有效筆數亦不會被寫入
            data = map(data, procPk)

            //ensureIndex
            await ensureIndex(collection)

            //nAll, n之基準為輸入筆數
            let nAll = size(data)

            //insertMany, ordered:false令已存在id者跳過而不中斷整批插入,
            //同批含重複id時亦僅首筆成功, 故不須逐筆插入即可取得實際插入筆數
            let nInserted = 0
            try {
                let r = await collection.insertMany(data, { ordered: false })
                nInserted = r.insertedCount
            }
            catch (err) {

                //僅重複鍵錯誤可視為[已存在id而跳過], 其餘錯誤影響全部數據, 須往外拋
                if (!isDupKeyError(err)) {
                    throw err
                }

                //重複鍵錯誤時仍可由result取得實際插入筆數
                nInserted = get(err, 'result.insertedCount', 0)

            }

            //res, 全數已存在而nInserted為0屬正常結果, 不視為錯誤
            res = {
                n: nAll,
                nInserted,
                ok: 1,
            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('insert', data, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('insert', data, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 儲存單筆數據，由MongoDB於單一updateOne內原子完成[查找id]與[更新或插入]
     * 註: MongoDB單一文件操作本即為原子，故不須開啟transaction(transaction另須replica set，standalone不支援)
     *
     * @ignore
     * @param {Object} collection 輸入資料表物件
     * @param {Object} v 輸入數據物件
     * @param {Boolean} autoInsert 輸入是否於查無數據時自動改以插入處理布林值
     * @returns {Promise} 回傳Promise，resolve回傳本筆儲存結果，本筆失敗時亦resolve並以ok為0回報
     */
    async function saveOne(collection, v, autoInsert) {

        //nTry, 併發upsert可能因他方同時插入同一id而拋重複鍵錯誤,
        //此時該id已存在, 重試即會走更新路徑, 故給予有限次數重試令其收斂
        let nTry = 3

        //rest
        let rest = null

        //inserted, 供結果定案後發出insert事件用
        let inserted = false

        for (let i = 0; i < nTry; i++) {

            try {

                //updateOne, upsert僅於autoInsert時開啟, 未開啟時查無數據即不寫入以免無中生有,
                //由MongoDB於單一操作內原子完成[查找id]與[更新或插入],
                //併發時不會有兩方各自讀到查無數據再各自插入而產生重複id, 亦不會有讀改寫之遺失更新
                let r = await collection.updateOne({ id: v.id }, { $set: v }, {
                    upsert: autoInsert,
                })

                //matchedCount, modifiedCount, upsertedCount
                let matchedCount = get(r, 'matchedCount', 0)
                let modifiedCount = get(r, 'modifiedCount', 0)
                let upsertedCount = get(r, 'upsertedCount', 0)

                if (upsertedCount > 0) {
                    //原不存在而插入

                    //rest
                    rest = {
                        n: 1,
                        nInserted: 1,
                        nModified: 0,
                        ok: 1,
                    }

                    //inserted
                    inserted = true

                }
                else if (matchedCount > 0) {
                    //原已存在, 合併後內容有變更方為更新
                    //由MongoDB於伺服器端將待寫入物件合併進現值後與現值比對, 結果相同者不寫入而回modifiedCount為0,
                    //故僅給部份欄位且該些欄位值皆與現值相同時, 合併結果等於現值, nModified亦為0,
                    //係於同一原子操作內完成比對與寫入, 故不須另行預讀, 亦無預讀值過期之疑慮

                    //rest
                    rest = {
                        n: 1,
                        nInserted: 0,
                        nModified: modifiedCount > 0 ? 1 : 0,
                        ok: 1,
                    }

                }
                else {
                    //查無數據且未開啟autoInsert

                    //rest
                    rest = {
                        n: 0,
                        nInserted: 0,
                        nModified: 0,
                        ok: 1,
                    }

                }

                break
            }
            catch (err) {

                //重複鍵錯誤且未達重試上限則重試
                if (isDupKeyError(err) && i < nTry - 1) {
                    continue
                }

                //其餘視為本筆失敗, 不中斷整批, 由呼叫端以ok與err判讀

                //rest
                rest = {
                    n: 1,
                    nInserted: 0,
                    nModified: 0,
                    ok: 0,
                    err: getErrMsg(err),
                }

                break
            }

        }

        //emit, 須於結果定案後發出, 避免訂閱函數拋錯影響本筆結果
        if (inserted) {
            emitChange('insert', [v], rest)
        }

        //emit, 逐筆失敗須於該筆結果定案後發出, 每筆一次
        if (rest.ok === 0) {
            emitError('save', [v], rest.err)
        }

        return rest
    }


    /**
     * 儲存數據，以id為準更新既有數據，未給之欄位會保留；id不存在且option.autoInsert為true時改為插入
     * 註: n為id命中筆數，命中或經插入而產生皆為1；[內容相同]之判定基準為將待儲存物件合併進現值後結果與現值相同，
     * 相同者不寫入而nModified為0；本筆失敗不中斷整批，該筆以ok為0並附err回報
     * 註: opt.autoGenPk為true(預設)時未帶有效id者自動產生，為false時未帶有效id即reject且同批皆不寫入
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @param {Object} [option={}] 輸入設定物件，預設為{}
     * @param {boolean} [option.autoInsert=true] 輸入是否於儲存時發現原本無數據，則自動改以插入處理，預設為true
     * @returns {Promise} 回傳Promise，resolve回傳與輸入等長之儲存結果陣列，reject回傳錯誤訊息
     */
    async function save(data, option = {}) {
        let isErr = false

        //check
        if (!iseobj(data) && !isearr(data)) {
            return []
        }

        //cloneDeep
        data = cloneDeep(data)

        //autoInsert
        let autoInsert = get(option, 'autoInsert', true)

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //connect, 令連線失敗於寫入前即拋出, 屬影響全部數據之整批性錯誤
            await client.connect()

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //check id, 須於任何寫入之前一次完成, 令autoGenPk為false而拋錯時同批之有效筆數亦不會被寫入
            data = map(data, procPk)

            //ensureIndex
            await ensureIndex(collection)

            //pmSeries
            res = await pmSeries(data, async(v) => {
                return saveOne(collection, v, autoInsert)
            })

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('save', data, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('save', data, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 刪除數據
     * 註: n為id命中筆數；未帶有效id者視為本筆無法處理，不送查詢條件且以ok為0並附err回報；
     * 判斷本筆是否真的被刪除一律以nDeleted為準
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @returns {Promise} 回傳Promise，resolve回傳與輸入等長之刪除結果陣列，reject回傳錯誤訊息
     */
    async function del(data) {
        let isErr = false

        //check
        if (!iseobj(data) && !isearr(data)) {
            return []
        }

        //cloneDeep
        data = cloneDeep(data)

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //connect, 令連線失敗於刪除前即拋出, 屬影響全部數據之整批性錯誤
            await client.connect()

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //pmSeries
            res = await pmSeries(data, async(v) => {

                //id, del不補值, 未帶有效id者視為本筆無法處理
                let id = get(v, 'id')

                //rest
                let rest = null

                //check, 不得將無效id送進查詢條件, 因undefined經序列化為null會誤中id為null之數據
                if (!isestr(id)) {

                    //rest
                    rest = {
                        n: 0,
                        nDeleted: 0,
                        ok: 0,
                        err: `invalid id[${id}]`,
                    }

                }
                else {

                    try {

                        //deleteOne
                        let r = await collection.deleteOne({ id })

                        //nDeleted
                        let nDeleted = get(r, 'deletedCount', 0)

                        //rest, 未命中時nDeleted為0, 屬正常結果
                        rest = {
                            n: nDeleted,
                            nDeleted,
                            ok: 1,
                        }

                    }
                    catch (err) {

                        //本筆失敗不中斷整批

                        //rest
                        rest = {
                            n: 1,
                            nDeleted: 0,
                            ok: 0,
                            err: getErrMsg(err),
                        }

                    }

                }

                //emit, 逐筆失敗須於該筆結果定案後發出, 每筆一次
                if (rest.ok === 0) {
                    emitError('del', [v], rest.err)
                }

                return rest
            })

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('del', data, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('del', data, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 刪除全部數據，需與del分開，避免未傳數據導致直接刪除全表
     * 註: n為實際刪除筆數，恆等於nDeleted；條件無命中時回傳0亦屬正常結果
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入刪除條件物件
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delAll(find = {}) {
        let isErr = false

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //deleteMany
            let r = await collection.deleteMany(find)

            //nDeleted
            let nDeleted = get(r, 'deletedCount', 0)

            //res
            res = {
                n: nDeleted,
                nDeleted,
                ok: 1,
            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('delAll', null, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('delAll', null, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，插入數據，僅於id不存在時寫入，已存在者跳過且不覆寫
     * 數據物件形狀為{ id, u8a }，u8a須為Uint8Array
     * 註: n為輸入筆數，nInserted為實際插入筆數，全數已存在而nInserted為0屬正常結果
     * 註: opt.autoGenPk為true(預設)時未帶有效id者自動產生，為false時未帶有效id即reject且同批皆不寫入
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列，各數據物件形狀為{ id, u8a }
     * @returns {Promise} 回傳Promise，resolve回傳插入結果，reject回傳錯誤訊息
     */
    async function insertGfs(data) {
        let isErr = false

        //check
        if (!iseobj(data) && !isearr(data)) {
            return {
                n: 0,
                nInserted: 0,
                ok: 1,
            }
        }

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //connect, 令連線失敗於寫入前即拋出, 屬影響全部數據之整批性錯誤
            await client.connect()

            //database
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //clChunks
            let clChunks = database.collection(`${opt.cl}.chunks`)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //check id與u8a, 僅淺拷貝數據物件而不深拷貝u8a,
            //因u8a僅供讀取, 深拷貝大量二進位數據成本過高;
            //u8a無效屬呼叫端給值錯誤且整批函數無從逐筆回報, 故往外拋
            data = map(data, function(v, k) {
                v = { ...v }
                v = procPk(v, k)
                if (!isu8arr(v.u8a)) {
                    throw new Error(`invalid data[${k}].u8a`)
                }
                return v
            })

            //ensureIndexGfs
            await ensureIndexGfs(database)

            //nAll, n之基準為輸入筆數
            let nAll = size(data)

            //上傳, 逐筆序列處理以免大量二進位數據同時佔用記憶體
            let nInserted = 0
            await pmSeries(data, async(v) => {
                let inserted = await _uploadGfs(bucket, clChunks, v.id, v.u8a)
                if (inserted) {
                    nInserted++
                }
            })

            //res, 全數已存在而nInserted為0屬正常結果, 不視為錯誤
            res = {
                n: nAll,
                nInserted,
                ok: 1,
            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('insertGfs', data, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('insertGfs', data, res)

            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，由主鍵查詢單筆數據
     * 註: 查無數據或主鍵值無效時回傳null，判定基準與selectByPk一致
     * 註: 本套件之主鍵欄位固定為id，尚未支援由呼叫端指定
     * 本函數不得有副作用，故不建立唯一索引
     *
     * @memberOf WOrmMongodb
     * @param {String} pk 輸入主鍵值字串，即數據之id
     * @returns {Promise} 回傳Promise，resolve回傳數據物件{ id, u8a }，若無此主鍵或主鍵值無效則回傳null，reject回傳錯誤訊息
     */
    async function selectByPkGfs(pk) {
        let isErr = false

        //check
        if (!isestr(pk)) {
            //未給有效主鍵值視為查無數據, 判定基準與selectByPk一致
            return null
        }

        //client
        let client = new MongoClient(opt.url)

        //core
        let core = async (id) => {

            //pm
            let pm = genPm()

            //database
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //buf
            let buf = Buffer.from('')

            //stream
            let sm = bucket.openDownloadStreamByName(id)
            sm.on('data', function (chunk) {
                buf = Buffer.concat([buf, chunk])
            })
            sm.on('error', function (err) {

                //reject
                pm.reject(err)

            })
            sm.on('end', function () {

                //u8a
                let u8a = new Uint8Array(buf)

                //clean memory
                buf = null

                //resolve
                pm.resolve(u8a)

            })

            return pm
        }

        //res
        let res = null
        try {

            //core
            let u8a = await core(pk)

            //res, 形狀與insertGfs所收之數據物件一致
            res = {
                id: pk,
                u8a,
            }

        }
        catch (err) {

            //check, GridFS查無檔案時驅動以code為ENOENT之錯誤回報, 屬正常結果故回傳null
            if (get(err, 'code') === 'ENOENT') {
                res = null
            }
            else {
                isErr = true
                res = err
            }

        }
        finally {
            await client.close()
            client = null
        }

        //check, 查無檔案已於catch內判定為正常結果而未設isErr, 故不會誤發error事件
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('selectByPkGfs', null, res)

            return Promise.reject(res)
        }
        return res
    }


    //_findGfs, 內部查找函數, 其reject由delGfs與delAllGfs之catch接住並於該處發出error事件, 故本函數不自行發出
    async function _findGfs(find = {}, bucket) {
        let isErr = false

        //res
        let res = null
        try {

            //find
            let cursor = bucket.find(find)

            //toArray
            res = await cursor.toArray()

        }
        catch (err) {
            isErr = true
            res = err
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，刪除數據
     * 註: n為id命中筆數；未帶有效id者視為本筆無法處理，以ok為0並附err回報；
     * 判斷本筆是否真的被刪除一律以nDeleted為準
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列，各數據物件須帶id
     * @returns {Promise} 回傳Promise，resolve回傳與輸入等長之刪除結果陣列，reject回傳錯誤訊息
     */
    async function delGfs(data) {
        let isErr = false

        //check
        if (!iseobj(data) && !isearr(data)) {
            return []
        }

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //connect, 令連線失敗於刪除前即拋出, 屬影響全部數據之整批性錯誤
            await client.connect()

            //database
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //pmSeries
            res = await pmSeries(data, async(v) => {

                //id, delGfs不補值, 未帶有效id者視為本筆無法處理
                let id = get(v, 'id')

                //rest
                let rest = null

                //check, 判定基準與del一致
                if (!isestr(id)) {

                    //rest
                    rest = {
                        n: 0,
                        nDeleted: 0,
                        ok: 0,
                        err: `invalid id[${id}]`,
                    }

                }
                else {

                    try {

                        //_findGfs
                        let ltdt = await _findGfs({ filename: id }, bucket)

                        //delete, 建立唯一索引後同一id至多一筆,
                        //既有數據若尚存重複id則一併刪除並如實回報nDeleted
                        let nDeleted = 0
                        for (let vv of ltdt) {
                            await bucket.delete(vv._id)
                            nDeleted++
                        }

                        //rest, n為命中與否, 未命中時兩者皆為0且屬正常結果
                        rest = {
                            n: nDeleted > 0 ? 1 : 0,
                            nDeleted,
                            ok: 1,
                        }

                    }
                    catch (err) {

                        //本筆失敗不中斷整批

                        //rest
                        rest = {
                            n: 1,
                            nDeleted: 0,
                            ok: 0,
                            err: getErrMsg(err),
                        }

                    }

                }

                //emit, 逐筆失敗須於該筆結果定案後發出, 每筆一次
                if (rest.ok === 0) {
                    emitError('delGfs', [v], rest.err)
                }

                return rest
            })

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('delGfs', data, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('delGfs', data, res)

            return Promise.reject(res)
        }
        return res
    }


    async function _delGfs(bid, bucket) {

        //delete, 連同chunks一併刪除
        await bucket.delete(bid)

    }


    /**
     * 使用GridFS，刪除全部數據，需與delGfs分開，避免未傳數據導致直接刪除全部
     * 註: n為實際刪除筆數，恆等於nDeleted；條件無命中時回傳0亦屬正常結果
     * 本函數不建立唯一索引，以免既有數據尚存重複id時無法清除
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入刪除條件物件
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delAllGfs(find = {}) {
        let isErr = false

        //client
        let client = new MongoClient(opt.url)

        //res
        let res = null
        try {

            //database
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //_findGfs
            let ltdt = await _findGfs(find, bucket)

            //ps
            let ps = map(ltdt, function(v) {
                let bid = v._id
                return _delGfs(bid, bucket)
            })

            //all, 任一刪除失敗即往外拋, 屬整批性錯誤
            await Promise.all(ps)

            //nDeleted, 全數刪除成功方會執行至此, 故實際刪除筆數即為符合條件筆數
            let nDeleted = size(ltdt)

            //res
            res = {
                n: nDeleted,
                nDeleted,
                ok: 1,
            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
            client = null
        }

        //emit
        if (!isErr) {
            emitChange('delAllGfs', null, res)
        }

        //check
        if (isErr) {

            //emit, 整批性錯誤須於reject之前發出
            emitError('delAllGfs', null, res)

            return Promise.reject(res)
        }
        return res
    }


    //bind
    ee.select = select
    ee.selectByPk = selectByPk
    ee.insert = insert
    ee.save = save
    ee.del = del
    ee.delAll = delAll
    ee.selectByPkGfs = selectByPkGfs
    ee.insertGfs = insertGfs
    ee.delGfs = delGfs
    ee.delAllGfs = delAllGfs


    return ee
}


export default WOrmMongodb

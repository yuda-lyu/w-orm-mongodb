import events from 'events'
import mongodb from 'mongodb'
import stream from 'stream'
import cloneDeep from 'lodash/cloneDeep'
import get from 'lodash/get'
import map from 'lodash/map'
import omit from 'lodash/omit'
import size from 'lodash/size'
import genPm from 'wsemi/src/genPm.mjs'
import genID from 'wsemi/src/genID.mjs'
import isarr from 'wsemi/src/isarr.mjs'
import pmSeries from 'wsemi/src/pmSeries.mjs'


//optMGConn
let optMGConn = {
    useNewUrlParser: true,
    useUnifiedTopology: true
}


/**
 * 操作資料庫(MongoDB)
 *
 * @class
 * @param {Object} [opt={}] 輸入設定物件，預設{}
 * @param {String} [opt.url='mongodb://127.0.0.1:27017'] 輸入連接資料庫字串，預設'mongodb://127.0.0.1:27017'
 * @param {String} [opt.db='worm'] 輸入使用資料庫名稱字串，預設'worm'
 * @param {String} [opt.cl='test'] 輸入使用資料表名稱字串，預設'test'
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


    //ee
    let ee = new events.EventEmitter()


    //MongoClient
    let MongoClient = mongodb.MongoClient


    /**
     * 查詢數據
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入查詢條件物件
     * @returns {Promise} 回傳Promise，resolve回傳數據，reject回傳錯誤訊息
     */
    async function select(find = {}) {
        let isErr = false

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //find
            let cursor = collection.find(find)
            //.sort({ $natural: -1 })
            //.limit(N)

            //toArray
            res = await cursor.toArray()

            //omit
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
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 插入數據，插入同樣數據會自動產生不同_id，故insert前需自行判斷有無重複
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @returns {Promise} 回傳Promise，resolve回傳插入結果，reject回傳錯誤訊息
     */
    async function insert(data) {
        let isErr = false

        //cloneDeep
        data = cloneDeep(data)

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //check id
            data = map(data, function(v) {
                if (!v.id) {
                    v.id = genID()
                }
                return v
            })

            //insertMany
            res = await collection.insertMany(data)

            //check
            if (res.insertedCount > 0) {

                //res
                res = {
                    n: size(data),
                    nInserted: res.insertedCount,
                    ok: res.acknowledged ? 1 : 0,
                }

                //emit
                ee.emit('change', 'insert', data, res)

            }
            else {
                isErr = true

                //res
                res = `no insert data`

            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 儲存數據
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @param {Object} [option={}] 輸入設定物件，預設為{}
     * @param {boolean} [option.autoInsert=true] 輸入是否於儲存時發現原本無數據，則自動改以插入處理，預設為true
     * @param {boolean} [option.atomic=false] 輸入是否於儲存時採用上鎖，避免同時操作互改問題，預設為false
     * @returns {Promise} 回傳Promise，resolve回傳儲存結果，reject回傳錯誤訊息
     */
    async function save(data, option = {}) {
        let isErr = false

        //cloneDeep
        data = cloneDeep(data)

        //autoInsert, atomic
        let autoInsert = get(option, 'autoInsert', true)
        let atomic = get(option, 'atomic', false)

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //oper
            let oper = null
            if (atomic) {
                oper = 'findOneAndUpdate'
            }
            else {
                oper = 'updateOne'
            }

            //pmSeries
            res = await pmSeries(data, async(v) => {
                console.log('pmSeries v', v)

                //rest
                let rest = null

                //oper
                rest = await collection[oper]({ id: v.id }, { $set: v })

                //lastErrorObject for findOneAndUpdate
                if (rest.lastErrorObject) {
                    // console.log('rest.lastErrorObject', rest.lastErrorObject)
                    rest = {
                        // lastErrorObject: { n: 1, updatedExisting: true },
                        // value: {
                        //   _id: new ObjectId("615c18bb6e5db9935b10d88e"),
                        //   id: 'id-rosemary',
                        //   name: 'rosemary',
                        //   value: 123.456
                        // },
                        // ok: 1
                        n: rest.lastErrorObject.n,
                        nModified: rest.lastErrorObject.updatedExisting ? 1 : 0,
                        ok: 1,
                    }
                }
                else {
                    rest = {
                        // acknowledged: true,
                        // modifiedCount: 1,
                        // upsertedId: null,
                        // upsertedCount: 0,
                        // matchedCount: 1
                        n: rest.matchedCount,
                        nModified: rest.modifiedCount,
                        ok: rest.acknowledged ? 1 : 0,
                    }
                }
                // console.log('rest', rest)

                //autoInsert
                if (autoInsert && rest.n === 0) {
                    rest = await insert(v)
                }

                return rest
            })

            //emit
            ee.emit('change', 'save', data, res)

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 刪除數據
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function del(data) {
        let isErr = false

        //cloneDeep
        data = cloneDeep(data)

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //check
            if (!isarr(data)) {
                data = [data]
            }

            //pmSeries
            res = await pmSeries(data, async(v) => {

                //rest
                let rest = null

                //deleteOne
                rest = await collection.deleteOne({ id: v.id })

                //rest
                rest = {
                    n: rest.deletedCount,
                    nDeleted: rest.deletedCount,
                    ok: rest.acknowledged ? 1 : 0,
                }

                return rest
            })

            //emit
            ee.emit('change', 'del', data, res)

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 刪除全部數據，需與del分開，避免未傳數據導致直接刪除全表
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入刪除條件物件
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delAll(find = {}) {
        let isErr = false

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)
            let collection = database.collection(opt.cl)

            //deleteMany
            res = await collection.deleteMany(find)

            //res
            res = {
                n: res.deletedCount,
                nDeleted: res.deletedCount,
                ok: res.acknowledged ? 1 : 0,
            }

            //emit
            ee.emit('change', 'delAll', null, res)

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，插入數據，需為Uint8Array格式
     *
     * @memberOf WOrmMongodb
     * @param {Uint8Array} u8a
     * @returns {Promise} 回傳Promise，resolve回傳插入結果，reject回傳錯誤訊息
     */
    async function insertGfs(u8a) {
        let isErr = false

        //id
        let id = genID()

        //buf
        let buf = Buffer.from(u8a)

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //core
        let core = async (id, buf) => {

            //pm
            let pm = genPm()

            //database
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //stream
            let sm = new stream.Readable()
            sm._read = () => {}
            sm.push(buf)
            sm.push(null)
            sm.pipe(bucket.openUploadStream(id)) //pipe是接bucket的Writable, 所以會監聽finish
                .on('error', function(err) {

                    //reject
                    pm.reject(err)

                })
                .on('finish', function() {

                    //res
                    let res = { n: 1, ok: 1, id }

                    //resolve
                    pm.resolve(res)

                })

            return pm
        }

        //res
        let res = null
        try {

            //core
            res = await core(id, buf)

            //emit
            ee.emit('change', 'insertGfs', null, res)

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，查詢數據
     *
     * @memberOf WOrmMongodb
     * @param {String} id 輸入查詢id字串
     * @returns {Promise} 回傳Promise，resolve回傳數據，reject回傳錯誤訊息
     */
    async function selectGfs(id) {
        let isErr = false

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

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
            res = await core(id)

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


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
        finally {
            // await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，刪除數據
     *
     * @memberOf WOrmMongodb
     * @param {String} id 輸入刪除id字串
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delGfs(id) {
        let isErr = false

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //_findGfs
            res = await _findGfs({ filename: id }, bucket)

            //check
            if (res.length === 0) {
                res = `can not find id[${id}]`
            }
            else if (res.length > 1) {
                res = `duplicate id[${id}]`
            }
            else {

                //bid, get _id from res[0]
                let bid = res[0]._id

                //delete
                res = await bucket.delete(bid)

                //res
                res = {
                    n: 1,
                    nDeleted: 1,
                    ok: 1,
                }

                //emit
                ee.emit('change', 'delGfs', null, res)

            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    async function _delGfs(bid, bucket) {
        let isErr = false

        //res
        let res = null
        try {

            //delete
            res = await bucket.delete(bid)

            //res
            res = {
                n: 1,
                nDeleted: 1,
                ok: 1,
            }

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            // await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    /**
     * 使用GridFS，刪除全部數據，需與del分開，避免未傳數據導致直接刪除全表
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入刪除條件物件
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delAllGfs(find = {}) {
        let isErr = false

        //client
        // let client = await MongoClient.connect(opt.url, optMGConn)
        let client = new MongoClient(opt.url, optMGConn)

        //res
        let res = null
        try {

            //database, collection
            let database = client.db(opt.db)

            //bucket
            let bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

            //_findGfs
            res = await _findGfs(find, bucket)

            //n
            let n = size(res)

            //ps
            let ps = map(res, function(v) {
                let bid = v._id
                return _delGfs(bid, bucket)
            })

            //all
            res = await Promise.all(ps)

            //res
            res = {
                n,
                ok: 1
            }

            //emit
            ee.emit('change', 'delAllGfs', null, res)

        }
        catch (err) {
            isErr = true
            res = err
        }
        finally {
            await client.close()
        }

        if (isErr) {
            return Promise.reject(res)
        }
        return res
    }


    //bind
    ee.select = select
    ee.insert = insert
    ee.save = save
    ee.del = del
    ee.delAll = delAll
    ee.selectGfs = selectGfs
    ee.insertGfs = insertGfs
    ee.delGfs = delGfs
    ee.delAllGfs = delAllGfs


    return ee
}


export default WOrmMongodb

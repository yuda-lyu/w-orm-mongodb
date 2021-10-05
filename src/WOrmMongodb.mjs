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

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
        let database = client.db(opt.db)
        let collection = database.collection(opt.cl)

        //find
        collection
            .find(find) //find第二參數為option, 可放sort或limit等
            //.sort({ $natural: -1 })
            //.limit(N)
            .toArray(function(err, res) {
                if (err) {
                    pm.reject(err)
                }
                else {
                    res = map(res, function(v) {
                        v = omit(v, '_id')
                        return v
                    })
                    pm.resolve(res)
                }
                client.close()
            })

        return pm
    }


    /**
     * 插入數據，插入同樣數據會自動產生不同_id，故insert前需自行判斷有無重複
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @returns {Promise} 回傳Promise，resolve回傳插入結果，reject回傳錯誤訊息
     */
    async function insert(data) {

        //cloneDeep
        data = cloneDeep(data)

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
        let database = client.db(opt.db)
        let collection = database.collection(opt.cl)

        //check
        if (!isarr(data)) {
            data = [data]
        }

        //check
        data = map(data, function(v) {
            if (!v.id) {
                v.id = genID()
            }
            return v
        })

        //insertMany
        collection
            .insertMany(data, function(err, res) {
                if (err) {
                    pm.reject(err)
                }
                else {

                    //check
                    if (res.insertedCount > 0) {
                        res = {
                            n: size(data),
                            nInserted: res.insertedCount,
                            ok: res.acknowledged ? 1 : 0,
                        }
                        pm.resolve(res)
                        ee.emit('change', 'insert', data, res)
                    }
                    else {
                        pm.reject(err)
                    }

                }
                client.close()
            })

        return pm
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

        //cloneDeep
        data = cloneDeep(data)

        //autoInsert, atomic
        let autoInsert = get(option, 'autoInsert', true)
        let atomic = get(option, 'atomic', false)

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

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
        pmSeries(data, async(v) => {
            let pmm = genPm()

            //oper
            collection[oper]({ id: v.id }, { $set: v }, function(err, res) {
                // console.log(oper, 'res', res)
                if (err) {
                    pmm.reject(err)
                }
                else {

                    //lastErrorObject for findOneAndUpdate
                    if (res.lastErrorObject) {
                        // console.log('res.lastErrorObject', res.lastErrorObject)
                        res = {
                            // lastErrorObject: { n: 1, updatedExisting: true },
                            // value: {
                            //   _id: new ObjectId("615c18bb6e5db9935b10d88e"),
                            //   id: 'id-rosemary',
                            //   name: 'rosemary',
                            //   value: 123.456
                            // },
                            // ok: 1
                            n: res.lastErrorObject.n,
                            nModified: res.lastErrorObject.updatedExisting ? 1 : 0,
                            ok: 1,
                        }
                    }
                    else {
                        res = {
                            // acknowledged: true,
                            // modifiedCount: 1,
                            // upsertedId: null,
                            // upsertedCount: 0,
                            // matchedCount: 1
                            n: res.matchedCount,
                            nModified: res.modifiedCount,
                            ok: res.acknowledged ? 1 : 0,
                        }
                    }
                    // console.log('res', res)

                    //autoInsert
                    if (autoInsert && res.n === 0) {
                        insert(v)
                            .then(function(res) {
                                pmm.resolve(res)
                            })
                            .catch(function(err) {
                                pmm.reject(err)
                            })
                    }
                    else {
                        pmm.resolve(res)
                    }

                }
            })

            return pmm
        })
            .then(function(msg) {
                pm.resolve(msg)
                ee.emit('change', 'save', data, msg)
            })
            .catch(function(msg) {
                pm.reject(msg)
            })
            .finally(function() {
                client.close()
            })

        return pm
    }


    /**
     * 刪除數據
     *
     * @memberOf WOrmMongodb
     * @param {Object|Array} data 輸入數據物件或陣列
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function del(data) {

        //cloneDeep
        data = cloneDeep(data)

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
        let database = client.db(opt.db)
        let collection = database.collection(opt.cl)

        //check
        if (!isarr(data)) {
            data = [data]
        }

        //pmSeries
        pmSeries(data, function(v) {
            let pmm = genPm()

            //deleteOne
            collection
                .deleteOne({ id: v.id }, function(err, res) {
                    if (err) {
                        pmm.resolve(err) //找不到數據刪除採resovle回傳
                    }
                    else {
                        res = {
                            n: res.deletedCount,
                            nDeleted: res.deletedCount,
                            ok: res.acknowledged ? 1 : 0,
                        }
                        pmm.resolve(res)
                    }
                })

            return pmm
        })
            .then(function(msg) {
                pm.resolve(msg)
                ee.emit('change', 'del', data, msg)
            })
            .catch(function(msg) {
                pm.reject(msg)
            })
            .finally(function() {
                client.close()
            })

        return pm
    }


    /**
     * 刪除全部數據，需與del分開，避免未傳數據導致直接刪除全表
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入刪除條件物件
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delAll(find = {}) {

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
        let database = client.db(opt.db)
        let collection = database.collection(opt.cl)

        //deleteMany
        collection
            .deleteMany(find, function(err, res) {
                if (err) {
                    pm.resolve(err) //找不到數據刪除採resovle回傳
                }
                else {
                    res = {
                        n: res.deletedCount,
                        nDeleted: res.deletedCount,
                        ok: res.acknowledged ? 1 : 0,
                    }
                    pm.resolve(res)
                    ee.emit('change', 'delAll', null, res)
                }
                client.close()
            })

        return pm
    }


    /**
     * 使用GridFS，插入數據，需為Uint8Array格式
     *
     * @memberOf WOrmMongodb
     * @param {Uint8Array} u8a
     * @returns {Promise} 回傳Promise，resolve回傳插入結果，reject回傳錯誤訊息
     */
    async function insertGfs(u8a) {

        //pm
        let pm = genPm()

        //id
        let id = genID()

        //buf
        let buf = Buffer.from(u8a)

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
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

                //close
                client.close()

            })
            .on('finish', function() {
                let res = { n: 1, ok: 1, id: id }

                //resolve
                pm.resolve(res)

                //emit
                ee.emit('change', 'insertGfs', null, res)

                //close
                client.close()

            })

        return pm
    }


    /**
     * 使用GridFS，查詢數據
     *
     * @memberOf WOrmMongodb
     * @param {String} id 輸入查詢id字串
     * @returns {Promise} 回傳Promise，resolve回傳數據，reject回傳錯誤訊息
     */
    async function selectGfs(id) {

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
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

            //close
            client.close()

        })
        sm.on('end', function () {

            //u8a
            let u8a = new Uint8Array(buf)

            //clean memory
            buf = null

            //resolve
            pm.resolve(u8a)

            //close
            client.close()

        })

        return pm
    }


    async function _findGfs(find = {}, bucket = null) {

        //pm
        let pm = genPm()

        //bucket
        if (bucket === null) {

            //client
            let client = await MongoClient.connect(opt.url, optMGConn)

            //database, collection
            let database = client.db(opt.db)

            //bucket
            bucket = new mongodb.GridFSBucket(database, {
                chunkSizeBytes: 10 * 1024 * 1024, //10mb
                bucketName: opt.cl
            })

        }

        //find
        bucket.find(find)
            .toArray(function(err, res) {
                if (err) {
                    pm.reject(err)
                }
                else {
                    pm.resolve(res)
                }
            })

        return pm
    }


    /**
     * 使用GridFS，刪除數據
     *
     * @memberOf WOrmMongodb
     * @param {String} id 輸入刪除id字串
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delGfs(id) {

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
        let database = client.db(opt.db)

        //bucket
        let bucket = new mongodb.GridFSBucket(database, {
            chunkSizeBytes: 10 * 1024 * 1024, //10mb
            bucketName: opt.cl
        })

        //_findGfs
        let res = await _findGfs({ filename: id }, bucket)

        //check
        if (res.length === 0) {
            pm.reject('can not find id')
            client.close()
        }
        else if (res.length > 1) {
            pm.reject('duplicate id')
            client.close()
        }
        else {

            //bid, get _id from res[0]
            let bid = res[0]._id

            //delete
            bucket.delete(bid, function(err) {
                if (err) {
                    pm.reject(err)
                }
                else {
                    let res = {
                        n: 1,
                        nDeleted: 1,
                        ok: 1,
                    }

                    //resolve
                    pm.resolve(res)

                    //emit
                    ee.emit('change', 'delGfs', null, res)

                }
                client.close()
            })

        }

        return pm
    }


    async function _delGfs(bid, bucket) {

        //pm
        let pm = genPm()

        //delete
        bucket.delete(bid, function(err) {
            if (err) {
                pm.reject(err)
            }
            else {
                pm.resolve({
                    n: 1,
                    nDeleted: 1,
                    ok: 1,
                })
            }
        })

        return pm
    }


    /**
     * 使用GridFS，刪除全部數據，需與del分開，避免未傳數據導致直接刪除全表
     *
     * @memberOf WOrmMongodb
     * @param {Object} [find={}] 輸入刪除條件物件
     * @returns {Promise} 回傳Promise，resolve回傳刪除結果，reject回傳錯誤訊息
     */
    async function delAllGfs(find = {}) {

        //pm
        let pm = genPm()

        //client
        let client = await MongoClient.connect(opt.url, optMGConn)

        //database, collection
        let database = client.db(opt.db)

        //bucket
        let bucket = new mongodb.GridFSBucket(database, {
            chunkSizeBytes: 10 * 1024 * 1024, //10mb
            bucketName: opt.cl
        })

        //_findGfs
        let res = await _findGfs(find, bucket)

        //n
        let n = size(res)

        //ps
        let ps = map(res, function(v) {
            let bid = v._id
            return _delGfs(bid, bucket)
        })

        //all
        Promise.all(ps)
            .then(function(msg) {
                let res = { n, ok: 1 }

                //resolve
                pm.resolve(res)

                //emit
                ee.emit('change', 'delAllGfs', null, res)

            })
            .catch(function(msg) {
                pm.reject(msg)
            })
            .finally(function() {
                client.close()
            })

        return pm
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

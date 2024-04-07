import assert from 'assert'
import wo from '../src/WOrmMongodb.mjs'


function isWindows() {
    return process.platform === 'win32'
}


if (isWindows()) {
    describe('basic', function() {
        let rt = null
        let vans = {}
        let vget = {}


        before(async function () {


            let opt = {
                url: 'mongodb://username:password@127.0.0.1:27017',
                db: 'worm',
                cl: 'users',
            }


            let rs = [
                {
                    id: 'id-peter',
                    name: 'peter',
                    value: 123,
                },
                {
                    id: 'id-rosemary',
                    name: 'rosemary',
                    value: 123.456,
                },
                {
                    id: '',
                    name: 'kettle',
                    value: 456,
                },
            ]


            let rsm = [
                {
                    id: 'id-peter',
                    name: 'peter(modify)'
                },
                {
                    id: 'id-rosemary',
                    name: 'rosemary(modify)'
                },
                {
                    id: '',
                    name: 'kettle(modify)'
                },
            ]


            //w
            let w = wo(opt)


            //on
            w.on('change', function(mode, data, res) {
                // console.log('change', mode)
            })


            //delAll
            rt = null
            vans[1] = {
                nDeleted: 2,
                ok: 1,
            }
            await w.delAll()
                .then(function(msg) {
                    // console.log('delAll then', msg)
                    //考慮可能有不同初始測試數據
                    // delAll then { n: 2, nDeleted: 2, ok: 1 }
                    // delAll then { n: 3, nDeleted: 2, ok: 1 }
                    //僅針對nDeleted與ok欄位比對
                    rt = {
                        nDeleted: msg.nDeleted,
                        ok: msg.ok,
                    }
                })
                .catch(function(msg) {
                    // console.log('delAll catch', msg)
                    rt = msg.toString()
                })
            vget[1] = rt


            //insert
            rt = null
            vans[2] = { n: 3, nInserted: 3, ok: 1 }
            await w.insert(rs)
                .then(function(msg) {
                    // console.log('insert then', msg)
                    // insert then { n: 3, nInserted: 3, ok: 1 }
                    rt = msg
                })
                .catch(function(msg) {
                    // console.log('insert catch', msg)
                    rt = msg.toString()
                })
            vget[2] = rt


            //save
            rt = null
            vans[3] = [
                { n: 1, nModified: 1, ok: 1 },
                { n: 1, nModified: 1, ok: 1 },
                { n: 0, nModified: 0, ok: 1 }
            ]
            await w.save(rsm, { autoInsert: false })
                .then(function(msg) {
                    // console.log('save then', msg)
                    // save then [
                    //   { n: 1, nModified: 1, ok: 1 },
                    //   { n: 1, nModified: 1, ok: 1 },
                    //   { n: 0, nModified: 0, ok: 1 }
                    // ]
                    rt = msg
                })
                .catch(function(msg) {
                    // console.log('save catch', msg)
                    rt = msg.toString()
                })
            vget[3] = rt


            //select all
            rt = null
            vans[4] = [
                { id: 'id-peter', name: 'peter(modify)', value: 123 },
                { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
                {
                    // id: {random id},
                    name: 'kettle',
                    value: 456
                }
            ]
            await w.select()
                .then(function(msg) {
                    // console.log('select all then', msg)
                    // select all [
                    //   { id: 'id-peter', name: 'peter(modify)', value: 123 },
                    //   { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
                    //   {
                    //     id: {random id},
                    //     name: 'kettle',
                    //     value: 456
                    //   }
                    // ]
                    rt = [
                        msg[0],
                        msg[1],
                        {
                            name: msg[2].name,
                            value: msg[2].value,
                        },
                    ]
                })
                .catch(function(msg) {
                    // console.log('select all catch', msg)
                    rt = msg.toString()
                })
            vget[4] = rt


            //select
            rt = null
            vans[5] = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]
            await w.select({ id: 'id-rosemary' })
                .then(function(msg) {
                    // console.log('select then', msg)
                    // select [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]
                    rt = msg
                })
                .catch(function(msg) {
                    // console.log('select catch', msg)
                    rt = msg.toString()
                })
            vget[5] = rt


            //select by $and, $gt, $lt
            rt = null
            vans[6] = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]
            await w.select({ '$and': [{ value: { '$gt': 123 } }, { value: { '$lt': 200 } }] })
                .then(function(msg) {
                    // console.log('select by $and, $gt, $lt then', msg)
                    // select by $and, $gt, $lt [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]
                    rt = msg
                })
                .catch(function(msg) {
                    // console.log('select by $and, $gt, $lt catch', msg)
                    rt = msg.toString()
                })
            vget[6] = rt


            //select by $or, $gte, $lte
            rt = null
            vans[7] = [
                {
                    // id: {random id},
                    name: 'kettle',
                    value: 456
                }
            ]
            await w.select({ '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 200 } }] })
                .then(function(msg) {
                    // console.log('select by $or, $gte, $lte then', msg)
                    // select by $or, $gte, $lte [
                    //   {
                    //     id: {random id},
                    //     name: 'kettle',
                    //     value: 456
                    //   }
                    // ]
                    rt = [
                        {
                            name: msg[0].name,
                            value: msg[0].value,
                        },
                    ]
                })
                .catch(function(msg) {
                    // console.log('select by $or, $gte, $lte catch', msg)
                    rt = msg.toString()
                })
            vget[7] = rt


            //select by $or, $and, $ne, $in, $nin
            rt = null
            vans[8] = [
                {
                    id: 'id-rosemary',
                    name: 'rosemary(modify)',
                    value: 123.456
                },
                {
                    // id: {random id},
                    name: 'kettle',
                    value: 456
                }
            ]
            await w.select({ '$or': [{ '$and': [{ value: { '$ne': 123 } }, { value: { '$in': [123, 321, 123.456, 456] } }, { value: { '$nin': [456, 654] } }] }, { '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 400 } }] }] })
                .then(function(msg) {
                    // console.log('select by $or, $and, $ne, $in, $nin then', msg)
                    // select by $or, $and, $ne, $in, $nin [
                    //   {
                    //     id: 'id-rosemary',
                    //     name: 'rosemary(modify)',
                    //     value: 123.456
                    //   },
                    //   {
                    //     id: {random id},
                    //     name: 'kettle',
                    //     value: 456
                    //   }
                    // ]
                    rt = [
                        msg[0],
                        {
                            name: msg[1].name,
                            value: msg[1].value,
                        },
                    ]
                })
                .catch(function(msg) {
                    // console.log('select by $or, $and, $ne, $in, $nin catch', msg)
                    rt = msg.toString()
                })
            vget[8] = rt


            //select by regex
            rt = null
            vans[9] = [{ id: 'id-peter', name: 'peter(modify)', value: 123 }]
            await w.select({ name: { $regex: 'PeT', $options: '$i' } })
                .then(function(msg) {
                    // console.log('select by regex then', msg)
                    // selectReg [ { id: 'id-peter', name: 'peter(modify)', value: 123 } ]
                    rt = msg
                })
                .catch(function(msg) {
                    // console.log('select by regex catch', msg)
                    rt = msg.toString()
                })
            vget[9] = rt


            //del
            rt = null
            vans[10] = [{ n: 1, nDeleted: 1, ok: 1 }]
            let ss = await w.select()
            let d = ss.filter(function(v) {
                return v.name === 'kettle'
            })
            await w.del(d)
                .then(function(msg) {
                    // console.log('del then', msg)
                    // del then [ { n: 1, nDeleted: 1, ok: 1 } ]
                    rt = msg
                })
                .catch(function(msg) {
                    // console.log('del catch', msg)
                    rt = msg.toString()
                })
            vget[10] = rt


        })


        it(`should get ${JSON.stringify(vans[1])} for delAll`, async function() {
            assert.strict.deepStrictEqual(vget[1], vans[1])
        })


        it(`should get ${JSON.stringify(vans[2])} for insert`, async function() {
            assert.strict.deepStrictEqual(vget[2], vans[2])
        })


        it(`should get ${JSON.stringify(vans[3])} for save`, async function() {
            assert.strict.deepStrictEqual(vget[3], vans[3])
        })


        it(`should get ${JSON.stringify(vans[4])} for select all`, async function() {
            assert.strict.deepStrictEqual(vget[4], vans[4])
        })


        it(`should get ${JSON.stringify(vans[5])} for select`, async function() {
            assert.strict.deepStrictEqual(vget[5], vans[5])
        })


        it(`should get ${JSON.stringify(vans[6])} for select by $and, $gt, $lt`, async function() {
            assert.strict.deepStrictEqual(vget[6], vans[6])
        })


        it(`should get ${JSON.stringify(vans[7])} for select by $or, $gte, $lte`, async function() {
            assert.strict.deepStrictEqual(vget[7], vans[7])
        })


        it(`should get ${JSON.stringify(vans[8])} for select by $or, $and, $ne, $in, $nin`, async function() {
            assert.strict.deepStrictEqual(vget[8], vans[8])
        })


        it(`should get ${JSON.stringify(vans[9])} for select by regex`, async function() {
            assert.strict.deepStrictEqual(vget[9], vans[9])
        })


        it(`should get ${JSON.stringify(vans[10])} for del`, async function() {
            assert.strict.deepStrictEqual(vget[10], vans[10])
        })


    })
}


import assert from 'assert'
import wo from '../src/WOrmMongodb.mjs'


describe('basic', async function() {


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
    if (true) {

        let rr = {
            nDeleted: 2,
            ok: 1,
        }

        it(`should get ${JSON.stringify(rr)} for delAll`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //insert
    if (true) {

        let rr = { n: 3, nInserted: 3, ok: 1 }

        it(`should get ${JSON.stringify(rr)} for insert`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //save
    if (true) {

        let rr = [
            { n: 1, nModified: 1, ok: 1 },
            { n: 1, nModified: 1, ok: 1 },
            { n: 0, nModified: 0, ok: 1 }
        ]

        it(`should get ${JSON.stringify(rr)} for save`, async function() {

            let rt = null
            await w.save(rsm, { autoInsert: false, atomic: true })
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //select all
    if (true) {

        let rr = [
            { id: 'id-peter', name: 'peter(modify)', value: 123 },
            { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
            {
                // id: {random id},
                name: 'kettle',
                value: 456
            }
        ]

        it(`should get ${JSON.stringify(rr)} for select all`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //select
    if (true) {

        let rr = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]

        it(`should get ${JSON.stringify(rr)} for select`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //select by $and, $gt, $lt
    if (true) {

        let rr = [{ id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 }]

        it(`should get ${JSON.stringify(rr)} for select by $and, $gt, $lt`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //select by $or, $gte, $lte
    if (true) {

        let rr = [
            {
                // id: {random id},
                name: 'kettle',
                value: 456
            }
        ]

        it(`should get ${JSON.stringify(rr)} for select by $or, $gte, $lte`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //select by $or, $and, $ne, $in, $nin
    if (true) {

        let rr = [
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

        it(`should get ${JSON.stringify(rr)} for select by $or, $and, $ne, $in, $nin`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //select by regex
    if (true) {

        let rr = [{ id: 'id-peter', name: 'peter(modify)', value: 123 }]

        it(`should get ${JSON.stringify(rr)} for select by regex`, async function() {

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


    //del
    if (true) {

        let rr = [{ n: 1, nDeleted: 1, ok: 1 }]

        it(`should get ${JSON.stringify(rr)} for del`, async function() {

            let ss = await w.select()
            let d = ss.filter(function(v) {
                return v.name === 'kettle'
            })

            let rt = null
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

            assert.strict.deepStrictEqual(rt, rr)
        })

    }


})

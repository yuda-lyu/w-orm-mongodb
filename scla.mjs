import wo from './src/WOrmMongodb.mjs'
//import wo from './dist/w-orm-mongodb.umd.js'


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

async function test() {


    //w
    let w = wo(opt)


    //on
    w.on('change', function(mode, data, res) {
        console.log('change', mode)
    })


    //delAll
    await w.delAll()
        .then(function(msg) {
            console.log('delAll then', msg)
        })
        .catch(function(msg) {
            console.log('delAll catch', msg)
        })


    //insert
    await w.insert(rs)
        .then(function(msg) {
            console.log('insert then', msg)
        })
        .catch(function(msg) {
            console.log('insert catch', msg)
        })


    //save
    await w.save(rsm, { autoInsert: false, atomic: true })
        .then(function(msg) {
            console.log('save then', msg)
        })
        .catch(function(msg) {
            console.log('save catch', msg)
        })


    //select all
    let ss = await w.select()
    console.log('select all', ss)


    //select
    let so = await w.select({ id: 'id-rosemary' })
    console.log('select', so)


    //select by $and, $gt, $lt
    let spa = await w.select({ '$and': [{ value: { '$gt': 123 } }, { value: { '$lt': 200 } }] })
    console.log('select by $and, $gt, $lt', spa)


    //select by $or, $gte, $lte
    let spb = await w.select({ '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 200 } }] })
    console.log('select by $or, $gte, $lte', spb)


    //select by $and, $ne, $in, $nin
    let spc = await w.select({ '$and': [{ value: { '$ne': 123 } }, { value: { '$in': [123, 321, 123.456, 456] } }, { value: { '$nin': [456, 654] } }] })
    console.log('select by $and, $ne, $in, $nin', spc)


    //select by regex
    let sr = await w.select({ name: { $regex: 'PeT', $options: '$i' } })
    console.log('selectReg', sr)


    //del
    let d = ss.filter(function(v) {
        return v.name === 'kettle'
    })
    await w.del(d)
        .then(function(msg) {
            console.log('del then', msg)
        })
        .catch(function(msg) {
            console.log('del catch', msg)
        })


}
test()
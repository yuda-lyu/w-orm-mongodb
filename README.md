# w-orm-mongodb
An operator for mongodb in nodejs.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![license](https://img.shields.io/npm/l/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![npm download](https://img.shields.io/npm/dt/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![npm download](https://img.shields.io/npm/dm/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-orm-mongodb.svg)](https://www.jsdelivr.com/package/npm/w-orm-mongodb)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-orm-mongodb/WOrm.html).

## Installation
### Using npm(ES6 module):
```alias
npm i w-orm-mongodb
```
#### Example for collection
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-basic.mjs)]
```alias
import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'

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

    //wo
    let wo = WOrm(opt)

    //on
    wo.on('change', function(mode, data, res) {
        console.log('change', mode)
    })

    //delAll
    await wo.delAll()
        .then(function(msg) {
            console.log('delAll then', msg)
        })
        .catch(function(msg) {
            console.log('delAll catch', msg)
        })

    //insert
    await wo.insert(rs)
        .then(function(msg) {
            console.log('insert then', msg)
        })
        .catch(function(msg) {
            console.log('insert catch', msg)
        })

    //save
    await wo.save(rsm, { autoInsert: false })
        .then(function(msg) {
            console.log('save then', msg)
        })
        .catch(function(msg) {
            console.log('save catch', msg)
        })

    //select all
    let ss = await wo.select()
    console.log('select all', ss)

    //select
    let so = await wo.select({ id: 'id-rosemary' })
    console.log('select', so)

    //select by $and, $gt, $lt
    let spa = await wo.select({ '$and': [{ value: { '$gt': 123 } }, { value: { '$lt': 200 } }] })
    console.log('select by $and, $gt, $lt', spa)

    //select by $or, $gte, $lte
    let spb = await wo.select({ '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 200 } }] })
    console.log('select by $or, $gte, $lte', spb)

    //select by $or, $and, $ne, $in, $nin
    let spc = await wo.select({ '$or': [{ '$and': [{ value: { '$ne': 123 } }, { value: { '$in': [123, 321, 123.456, 456] } }, { value: { '$nin': [456, 654] } }] }, { '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 400 } }] }] })
    console.log('select by $or, $and, $ne, $in, $nin', spc)

    //select by regex
    let sr = await wo.select({ name: { $regex: 'PeT', $options: '$i' } })
    console.log('selectReg', sr)

    //del
    let d = ss.filter(function(v) {
        return v.name === 'kettle'
    })
    await wo.del(d)
        .then(function(msg) {
            console.log('del then', msg)
        })
        .catch(function(msg) {
            console.log('del catch', msg)
        })

}
test()
// change delAll
// delAll then { n: 2, nDeleted: 2, ok: 1 }
// change insert
// insert then { n: 3, nInserted: 3, ok: 1 }
// change save
// save then [
//   { n: 1, nModified: 1, ok: 1 },
//   { n: 1, nModified: 1, ok: 1 },
//   { n: 0, nModified: 0, ok: 1 }
// ]
// select all [
//   { id: 'id-peter', name: 'peter(modify)', value: 123 },
//   { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
//   {
//     id: {random id},
//     name: 'kettle',
//     value: 456
//   }
// ]
// select [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]
// select by $and, $gt, $lt [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]
// select by $or, $gte, $lte [
//   {
//     id: {random id},
//     name: 'kettle',
//     value: 456
//   }
// ]
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
// selectReg [ { id: 'id-peter', name: 'peter(modify)', value: 123 } ]
// change del
// del then [ { n: 1, nDeleted: 1, ok: 1 } ]
```
#### Example for GridFS
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-gfs.mjs)]
```alias
import path from 'path'
import fs from 'fs'
import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'

let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersGfs',
}

async function test() {

    //wo
    let wo = WOrm(opt)

    //on
    wo.on('change', function(mode, data, res) {
        console.log('change', mode)
    })

    //fn_in, fn_out
    let fn_in = path.resolve('../', './_data', 'data(in).dat')
    let fn_out = path.resolve('../', './_data', 'data(out).dat')
    // console.log('fn_in', fn_in)
    // console.log('fn_out', fn_out)

    //unlinkSync
    try {
        fs.unlinkSync(fn_out)
    }
    catch (err) {}

    //u8a
    let b = await fs.readFileSync(fn_in)
    let u8a = new Uint8Array(b)
    // let u8a = new Uint8Array([66, 97, 115]) //Uint8Array data from nodejs or browser
    console.log('u8a', u8a)

    //delAllGfs
    await wo.delAllGfs()
        .then(function(msg) {
            console.log('delAllGfs then', msg)
        })
        .catch(function(msg) {
            console.log('delAllGfs catch', msg)
        })

    //insertGfs
    let gi = await wo.insertGfs(u8a)
    console.log('insertGfs', gi)

    //selectGfs
    let gs = await wo.selectGfs(gi.id)
    console.log('selectGfs', gs)
    console.log('gs[0]', gs[0], gs[0] === 0)
    console.log('gs[1]', gs[1], gs[1] === 0)
    console.log('gs[2]', gs[2], gs[2] === 0)
    console.log('gs[3]', gs[3], gs[3] === 24)
    console.log('gs[4]', gs[4], gs[4] === 102)
    console.log('gs.length', gs.length, gs.length === 47381362)
    fs.writeFileSync(fn_out, gs)

    //delGfs
    let gd = await wo.delGfs(gi.id)
    console.log('delGfs', gd)

}
test()
// u8a Uint8Array(47381362) [
//     0,   0,   0,  24, 102, 116, 121, 112, 109, 112, 52,  50,
//     0,   0,   0,   0, 105, 115, 111, 109, 109, 112, 52,  50,
//     0,   2,  14,  73, 109, 111, 111, 118,   0,   0,  0, 108,
//   109, 118, 104, 100,   0,   0,   0,   0, 214,  15, 24, 167,
//   214,  15,  24, 167,   0,   1,  95, 144,   1, 106, 95,  88,
//     0,   1,   0,   0,   1,   0,   0,   0,   0,   0,  0,   0,
//     0,   0,   0,   0,   0,   1,   0,   0,   0,   0,  0,   0,
//     0,   0,   0,   0,   0,   0,   0,   0,   0,   1,  0,   0,
//     0,   0,   0,   0,
//   ... 47381262 more items
// ]
// change delAllGfs
// delAllGfs then { n: 0, ok: 1 }
// change insertGfs
// insertGfs { n: 1, ok: 1, id: {random id} }
// selectGfs Uint8Array(47381362) [
//     0,   0,   0,  24, 102, 116, 121, 112, 109, 112, 52,  50,
//     0,   0,   0,   0, 105, 115, 111, 109, 109, 112, 52,  50,
//     0,   2,  14,  73, 109, 111, 111, 118,   0,   0,  0, 108,
//   109, 118, 104, 100,   0,   0,   0,   0, 214,  15, 24, 167,
//   214,  15,  24, 167,   0,   1,  95, 144,   1, 106, 95,  88,
//     0,   1,   0,   0,   1,   0,   0,   0,   0,   0,  0,   0,
//     0,   0,   0,   0,   0,   1,   0,   0,   0,   0,  0,   0,
//     0,   0,   0,   0,   0,   0,   0,   0,   0,   1,  0,   0,
//     0,   0,   0,   0,
//   ... 47381262 more items
// ]
// change delGfs
// delGfs { n: 1, nDeleted: 1, ok: 1 }
```

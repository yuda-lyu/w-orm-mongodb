# w-orm-mongodb
An object of operator for mongodb in nodejs, like a simple ORM.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![license](https://img.shields.io/npm/l/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-orm-mongodb/master/dist/w-orm-mongodb.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-orm-mongodb)
[![npm download](https://img.shields.io/npm/dt/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-orm-mongodb.svg)](https://www.jsdelivr.com/package/npm/w-orm-mongodb)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-orm-mongodb/WOrm.html).

## Installation
### Using npm(ES6 module):
> **Note:** `w-orm-mongodb` is mainly dependent on `mongodb`, `saslprep`, `events` and `stream`.

> **Note:** `saslprep` is used by `mongodb` for checking user's password.

```alias
npm i w-orm-mongodb
```
#### Example for collection
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-basic.mjs)]
```alias
import wo from 'w-orm-mongodb'

let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'users',
}

let rs = [
    {
        id: 'id-peter',
        name: 'peter'
    },
    {
        id: 'id-rosemary',
        name: 'rosemary'
    },
    {
        id: '',
        name: 'kettle'
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
    // => delAll then { n: 2, nDeleted: 2, ok: 1 }


    //insert
    await w.insert(rs)
        .then(function(msg) {
            console.log('insert then', msg)
        })
        .catch(function(msg) {
            console.log('insert catch', msg)
        })
    // => insert then { n: 3, nInserted: 3, ok: 1 }


    //save
    await w.save(rsm, { autoInsert: false, atomic: true })
        .then(function(msg) {
            console.log('save then', msg)
        })
        .catch(function(msg) {
            console.log('save catch', msg)
        })
    // => save then [ 
    //                { n: 1, nModified: 1, ok: 1 },
    //                { n: 1, nModified: 1, ok: 1 }, 
    //                { n: 0, nModified: 0, ok: 1 }, //autoInsert=false
    //                { n: 1, nInserted: 1, ok: 1 }  //autoInsert=true
    //              ]


    //select all
    let ss = await w.select()
    console.log('select all', ss)
    // => select all [ 
    //                 { id: 'id-peter', name: 'peter(modify)', value: 123 },
    //                 { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
    //                 { id: '{random id}', name: 'kettle', value: 456 },
    //                 { id: '{random id}', name: 'kettle(modify)' } //autoInsert=true
    //               ]


    //select
    let so = await w.select({ id: 'id-rosemary' })
    // => select [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]


    //select by $and, $gt, $lt
    let spa = await w.select({ '$and': [{ value: { '$gt': 123 } }, { value: { '$lt': 200 } }] })
    // => select [ { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 } ]


    //select by $or, $gte, $lte
    let spb = await w.select({ '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 200 } }] })
    // => select [ { id: '{random id}', name: 'kettle', value: 456 } ]


    //select by $or, $and, $ne, $in, $nin
    let spc = await w.select({ '$or': [{ '$and': [{ value: { '$ne': 123 } }, { value: { '$in': [123, 321, 123.456, 456] } }, { value: { '$nin': [456, 654] } }] }, { '$or': [{ value: { '$lte': -1 } }, { value: { '$gte': 400 } }] }] })
    console.log('select by $or, $and, $ne, $in, $nin', spc)
    // => select [
    //             { id: 'id-rosemary', name: 'rosemary(modify)', value: 123.456 },
    //             { id: '{random id}', name: 'kettle', value: 456 }
    //           ]


    //select by regex
    let sr = await w.select({ name: { $regex: 'PeT', $options: '$i' } })
    // => select [ { id: 'id-peter', name: 'peter(modify)', value: 123 } ]


    //del
    let d = ss.filter(function(v) {
        return v.name === 'kettle'
    })
    w.del(d)
        .then(function(msg) {
            console.log('del then', msg)
        })
        .catch(function(msg) {
            console.log('del catch', msg)
        })
    // => del then [ { n: 1, nDeleted: 1, ok: 1 } ]
    

}
test()
```
#### Example for GridFS
> **Link:** [[dev source code](https://github.com/yuda-lyu/w-orm-mongodb/blob/master/g-gfs.mjs)]
```alias
import wo from 'w-orm-mongodb'

let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersGfs',
}

async function test() {


    //w
    let w = wo(opt)


    //fn_in, fn_out
    let fn_in = 'data(in).dat'
    let fn_out = 'data(out).dat'


    //u8a, input from file
    let b = await fs.readFileSync(fn_in)
    let u8a = new Uint8Array(b)
    //let u8a = new Uint8Array([66, 97, 115])
    console.log('u8a', u8a)
    // => u8a Uint8Array [...]


    //delAllGfs
    await w.delAllGfs()
        .then(function(msg) {
            console.log('delAllGfs then', msg)
        })
        .catch(function(msg) {
            console.log('delAllGfs catch', msg)
        })
    // => delAllGfs then { n: 0, ok: 1 }


    //insertGfs
    let gi = await w.insertGfs(u8a)
    console.log('insertGfs', gi)
    // => insertGfs { n: 1, ok: 1, id: '{random id}' }


    //selectGfs
    let gs = await w.selectGfs(gi.id)
    console.log('selectGfs', gs)
    // => selectGfs Uint8Array [...]


    //output
    fs.writeFileSync(fn_out, gs)


    //delGfs
    let gd = await w.delGfs(gi.id)
    console.log('delGfs', gd)
    // => delGfs { n: 1, nDeleted: 1, ok: 1 }


}
test()
```

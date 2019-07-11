# w-orm-mongodb
An object of operator for mongodb in nodejs, like a simple ORM.

![language](https://img.shields.io/badge/language-JavaScript-orange.svg) 
[![npm version](http://img.shields.io/npm/v/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![Build Status](https://travis-ci.org/yuda-lyu/w-orm-mongodb.svg?branch=master)](https://travis-ci.org/yuda-lyu/w-orm-mongodb) 
[![license](https://img.shields.io/npm/l/w-orm-mongodb.svg?style=flat)](https://npmjs.org/package/w-orm-mongodb) 
[![gzip file size](http://img.badgesize.io/yuda-lyu/w-orm-mongodb/master/dist/w-orm-mongodb.umd.js.svg?compression=gzip)](https://github.com/yuda-lyu/w-orm-mongodb)
[![npm download](https://img.shields.io/npm/dt/w-orm-mongodb.svg)](https://npmjs.org/package/w-orm-mongodb) 
[![jsdelivr download](https://img.shields.io/jsdelivr/npm/hm/w-orm-mongodb.svg)](https://www.jsdelivr.com/package/npm/w-orm-mongodb)

## Documentation
To view documentation or get support, visit [docs](https://yuda-lyu.github.io/w-orm-mongodb/WOrm.html).

## Installation
### Using npm(ES6 module):
> **Note:** `w-orm-mongodb` depends on `mongodb`.
```alias
npm i w-orm-mongodb
```
## Example
```alias
import WOrm from 'w-orm-mongodb'

let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'dbname',
    cl: 'collname',
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

async function main() {


    //w
    let w = wo(opt)


    //delAll
    await w.delAll()
        .then(function(msg) {
            console.log('delAll then', msg)
        })
        .catch(function(msg) {
            console.log('delAll catch', msg)
        })
    // => delAll then { n: 3, ok: 1 }


    //insert
    await w.insert(rs)
        .then(function(msg) {
            console.log('insert then', msg)
        })
        .catch(function(msg) {
            console.log('insert catch', msg)
        })
    // => insert then { ok: 1, n: 3 }


    //save
    await w.save(rsm, { autoInsert: false, atomic: true })
        .then(function(msg) {
            console.log('save then', msg)
        })
        .catch(function(msg) {
            console.log('save catch', msg)
        })
    // => save then [ { n: 1, nModified: 1, ok: 1 }, 
                      { n: 1, nModified: 1, ok: 1 }, 
                      { n: 1, nInserted: 1, ok: 1 } ]


    //select all
    let ss = await w.select({})
    console.log('select all', ss)
    // => select all [ { id: 'id-peter', name: 'peter(modify)' },
                       { id: 'id-rosemary', name: 'rosemary(modify)' },
                       { id: 'PrChECGlTjen1iJKS7Q689RFVLv2k6Tr', name: 'kettle' },
                       { id: 'kuU13QsWz00DeUksKMYVd9erkLPCrDXM', name: 'kettle(modify)' } ]


    //select
    w.select({ id: 'id-rosemary' })
        .then(function(msg) {
            console.log('select then', msg)
        })
        .catch(function(msg) {
            console.log('select catch', msg)
        })
    // => select then [ { id: 'id-rosemary', name: 'rosemary(modify)' } ]


    //del
    let d = ss.filter(function(v) {
        return v.name === 'kettle(modify)'
    })
    w.del(d)
        .then(function(msg) {
            console.log('del then', msg)
        })
        .catch(function(msg) {
            console.log('del catch', msg)
        })
    // => del then [ { n: 1, ok: 1, nDeleted: 1 } ]
    

}
main()
```

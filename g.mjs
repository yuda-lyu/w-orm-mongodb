//import w from './src/WOrm.mjs'
import wo from './dist/w-orm-mongodb.umd.js'


let opt = {
    url: 'mongodb://semisphere:q1w2e3r4t5y6@127.0.0.1:27017',
    db: 'refs',
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


    //insert
    await w.insert(rs)
        .then(function(msg) {
            console.log('insert then', msg)
        })
        .catch(function(msg) {
            console.log('insert catch', msg)
        })


    //save
    await w.save(rsm)
        .then(function(msg) {
            console.log('save then', msg)
        })
        .catch(function(msg) {
            console.log('save catch', msg)
        })


    //select all
    let ss = await w.select({})
    console.log('select all', ss)


    //select
    w.select({ id: 'id-rosemary' })
        .then(function(msg) {
            console.log('select then', msg)
        })
        .catch(function(msg) {
            console.log('select catch', msg)
        })


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


}
main()

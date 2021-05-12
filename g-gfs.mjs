import path from 'path'
import fs from 'fs'
import wo from './src/WOrmMongodb.mjs'
//import wo from './dist/w-orm-mongodb.umd.js'


let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersGfs',
}

async function test() {


    //w
    let w = wo(opt)


    //on
    w.on('change', function(mode, data, res) {
        console.log('change', mode)
    })


    //fn_in, fn_out
    let fn_in = path.resolve('../', './_data', 'data(in).dat')
    let fn_out = path.resolve('../', './_data', 'data(out).dat')


    //unlinkSync
    fs.unlinkSync(fn_out)


    //u8a
    let b = await fs.readFileSync(fn_in)
    let u8a = new Uint8Array(b)
    // let u8a = new Uint8Array([66, 97, 115]) //Uint8Array data from nodejs or browser
    console.log('u8a', u8a)


    //delAllGfs
    await w.delAllGfs()
        .then(function(msg) {
            console.log('delAllGfs then', msg)
        })
        .catch(function(msg) {
            console.log('delAllGfs catch', msg)
        })


    //insertGfs
    let gi = await w.insertGfs(u8a)
    console.log('insertGfs', gi)


    //selectGfs
    let gs = await w.selectGfs(gi.id)
    console.log('selectGfs', gs)
    fs.writeFileSync(fn_out, gs)


    //delGfs
    let gd = await w.delGfs(gi.id)
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

//node --experimental-modules --es-module-specifier-resolution=node g-gfs.mjs

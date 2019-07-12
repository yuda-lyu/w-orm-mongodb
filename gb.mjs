import wo from './src/WOrmMongodb.mjs'
//import wo from './dist/w-orm-mongodb.umd.js'
import fs from 'fs'


let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'refs',
    cl: 'usersg',
}

async function test() {


    //w
    let w = wo(opt)


    //fn_in, fn_out
    let fn_in = 'data(in).dat'
    let fn_out = 'data(out).dat'


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

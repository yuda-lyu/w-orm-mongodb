import assert from 'assert'
import path from 'path'
import fs from 'fs'
import wo from '../src/WOrmMongodb.mjs'


describe('gfs', function() {
    let rt = null
    let vans = {}
    let vget = {}


    before(async function () {


        let opt = {
            url: 'mongodb://username:password@127.0.0.1:27017',
            db: 'worm',
            cl: 'usersGfs',
        }


        //w
        let w = wo(opt)


        //on
        w.on('change', function(mode, data, res) {
            // console.log('change', mode)
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
        // console.log('u8a', u8a)


        //delAllGfs
        rt = null
        vans[1] = { n: 0, ok: 1 }
        await w.delAllGfs()
            .then(function(msg) {
                // console.log('delAllGfs then', msg)
                // delAllGfs then { n: 0, ok: 1 }
                rt = msg
            })
            .catch(function(msg) {
                // console.log('delAllGfs catch', msg)
                rt = msg.toString()
            })
        vget[1] = rt


        //insertGfs
        let gi = null
        rt = null
        vans[2] = {
            n: 1,
            ok: 1,
            // id: {random id},
        }
        await w.insertGfs(u8a)
            .then(function(msg) {
                // console.log('insertGfs then', msg)
                // insertGfs { n: 1, ok: 1, id: {random id} }
                gi = msg
                rt = {
                    n: msg.n,
                    ok: msg.ok,
                }
            })
            .catch(function(msg) {
                // console.log('insertGfs catch', msg)
                rt = msg.toString()
            })
        vget[2] = rt


        //selectGfs
        rt = null
        vans[3] = [
            0,
            0,
            0,
            24,
            102,
            47381362,
        ]
        await w.selectGfs(gi.id)
            .then(function(msg) {
                // console.log('selectGfs then', msg)
                // console.log('msg[0]', msg[0], msg[0] === 0)
                // console.log('msg[1]', msg[1], msg[1] === 0)
                // console.log('msg[2]', msg[2], msg[2] === 0)
                // console.log('msg[3]', msg[3], msg[3] === 24)
                // console.log('msg[4]', msg[4], msg[4] === 102)
                // console.log('msg.length', msg.length, msg.length === 47381362)
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
                // fs.writeFileSync(fn_out, msg)
                rt = [
                    msg[0],
                    msg[1],
                    msg[2],
                    msg[3],
                    msg[4],
                    msg.length,
                ]
            })
            .catch(function(msg) {
                // console.log('selectGfs catch', msg)
                rt = msg.toString()
            })
        vget[3] = rt


        //delGfs
        rt = null
        vans[4] = { n: 1, nDeleted: 1, ok: 1 }
        await w.delGfs(gi.id)
            .then(function(msg) {
                // console.log('delGfs then', msg)
                // delGfs { n: 1, nDeleted: 1, ok: 1 }
                rt = msg
            })
            .catch(function(msg) {
                // console.log('delGfs catch', msg)
                rt = msg.toString()
            })
        vget[4] = rt


    })


    it(`should get ${JSON.stringify(vans[1])} for delAllGfs`, function() {
        assert.strict.deepStrictEqual(vget[1], vans[1])
    })


    it(`should get ${JSON.stringify(vans[2])} for insertGfs`, async function() {
        assert.strict.deepStrictEqual(vget[2], vans[2])
    })


    it(`should get ${JSON.stringify(vans[3])} for selectGfs`, async function() {
        assert.strict.deepStrictEqual(vget[3], vans[3])
    })


    it(`should get ${JSON.stringify(vans[4])} for delGfs`, async function() {
        assert.strict.deepStrictEqual(vget[4], vans[4])
    })


})

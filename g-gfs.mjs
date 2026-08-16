import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'


//GridFS函數之參數與回傳形狀比照一般操作:
//數據物件為{ id, u8a }, insertGfs收物件或陣列, delGfs收物件或陣列並回傳等長陣列
let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersGfs',
}

//genU8a, 產生內容可複現之測試數據
function genU8a(n) {
    let u8a = new Uint8Array(n)
    for (let i = 0; i < n; i++) {
        u8a[i] = i % 256
    }
    return u8a
}

async function test() {

    //wo
    let wo = WOrm(opt)

    //on
    wo.on('change', function(mode, data, res) {
        console.log('change', mode)
    })

    //u8a, 亦可為瀏覽器或nodejs取得之任何Uint8Array
    let u8a = genU8a(1000)

    //delAllGfs
    await wo.delAllGfs()
        .then(function(msg) {
            console.log('delAllGfs then', msg)
        })
        .catch(function(msg) {
            console.log('delAllGfs catch', msg)
        })

    //insertGfs
    let gi = await wo.insertGfs({ id: 'id-file', u8a })
    console.log('insertGfs', gi)

    //insertGfs, 已存在id者跳過且不覆寫
    let gr = await wo.insertGfs({ id: 'id-file', u8a: genU8a(50) })
    console.log('insertGfs existed id', gr)

    //selectByIdGfs
    let gs = await wo.selectByIdGfs('id-file')
    console.log('selectByIdGfs id', gs.id)
    console.log('selectByIdGfs u8a.length', gs.u8a.length)
    console.log('selectByIdGfs u8a[0..3]', gs.u8a[0], gs.u8a[1], gs.u8a[2], gs.u8a[3])

    //selectByIdGfs by id not existed
    let gn = await wo.selectByIdGfs('id-not-existed')
    console.log('selectByIdGfs by id not existed', gn)

    //insertGfs, 一次插入多筆
    let gm = await wo.insertGfs([
        { id: 'id-a', u8a: genU8a(10) },
        { id: 'id-b', u8a: genU8a(20) },
    ])
    console.log('insertGfs multi', gm)

    //delGfs
    let gd = await wo.delGfs({ id: 'id-file' })
    console.log('delGfs', gd)

    //delGfs by id not existed
    let gdn = await wo.delGfs({ id: 'id-not-existed' })
    console.log('delGfs by id not existed', gdn)

    //delAllGfs
    let gda = await wo.delAllGfs()
    console.log('delAllGfs', gda)

}
test()
// change delAllGfs
// delAllGfs then { n: 0, nDeleted: 0, ok: 1 }
// change insertGfs
// insertGfs { n: 1, nInserted: 1, ok: 1 }
// change insertGfs
// insertGfs existed id { n: 1, nInserted: 0, ok: 1 }
// selectByIdGfs id id-file
// selectByIdGfs u8a.length 1000
// selectByIdGfs u8a[0..3] 0 1 2 3
// selectByIdGfs by id not existed null
// change insertGfs
// insertGfs multi { n: 2, nInserted: 2, ok: 1 }
// change delGfs
// delGfs [ { n: 1, nDeleted: 1, ok: 1 } ]
// change delGfs
// delGfs by id not existed [ { n: 0, nDeleted: 0, ok: 1 } ]
// change delAllGfs
// delAllGfs { n: 2, nDeleted: 2, ok: 1 }

//node g-gfs.mjs

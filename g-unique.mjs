import WOrm from './src/WOrmMongodb.mjs'
//import WOrm from './dist/w-orm-mongodb.umd.js'


//本套件會於id欄位建立唯一索引,
//令insert與save之[檢查id]與[寫入]由MongoDB於單一操作內原子完成,
//故併發時同一id僅會有一筆數據, 且不須開啟transaction
//註: 若既有資料表內已存在重複id, 建立索引會失敗, 須先自行清除重複數據
let opt = {
    url: 'mongodb://username:password@127.0.0.1:27017',
    db: 'worm',
    cl: 'usersUnique',
}


async function test() {

    //wo
    let wo = WOrm(opt)

    //delAll
    await wo.delAll()

    //insert, 同批含重複id時僅首筆成功
    let ri = await wo.insert([
        { id: 'id-dup', name: 'dup-1' },
        { id: 'id-dup', name: 'dup-2' },
        { id: 'id-uniq', name: 'uniq' },
    ])
    console.log('insert with duplicated id', ri)
    console.log('selectByPk(id-dup)', await wo.selectByPk('id-dup'))

    //insert, 對已存在id再插入則跳過而不覆寫
    let re = await wo.insert({ id: 'id-dup', name: 'dup-3' })
    console.log('insert existed id', re)
    console.log('selectByPk(id-dup)', await wo.selectByPk('id-dup'))

    //insert, 併發對同一id插入10次, nInserted總和為1
    let rc = await Promise.all(Array.from({ length: 10 }, (v, k) => {
        return wo.insert({ id: 'id-race', k })
    }))
    console.log('sum of nInserted by 10 concurrent insert', rc.reduce((sum, v) => sum + v.nInserted, 0))
    console.log('records of id-race', (await wo.select({ id: 'id-race' })).length)

    //save, 併發對同一全新id儲存不同欄位, 僅一次為插入, 各欄位皆保留
    let rs = await Promise.all(Array.from({ length: 5 }, (v, k) => {
        return wo.save({ id: 'id-new', [`f${k}`]: k })
    }))
    console.log('count of nInserted===1 by 5 concurrent save', rs.filter((v) => v[0].nInserted === 1).length)
    console.log('records of id-new', (await wo.select({ id: 'id-new' })).length)
    console.log('selectByPk(id-new)', await wo.selectByPk('id-new'))

}
test()
// insert with duplicated id { n: 3, nInserted: 2, ok: 1 }
// selectByPk(id-dup) { id: 'id-dup', name: 'dup-1' }
// insert existed id { n: 1, nInserted: 0, ok: 1 }
// selectByPk(id-dup) { id: 'id-dup', name: 'dup-1' }
// sum of nInserted by 10 concurrent insert 1
// records of id-race 1
// count of nInserted===1 by 5 concurrent save 1
// records of id-new 1
// selectByPk(id-new) { id: 'id-new', f0: 0, f1: 1, f2: 2, f4: 4, f3: 3 }
// 註: 併發儲存之各欄位皆會保留, 惟欄位順序取決於各次儲存之完成順序, 故每次執行不盡相同

//node g-unique.mjs

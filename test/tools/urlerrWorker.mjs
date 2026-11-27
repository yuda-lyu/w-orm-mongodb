//以不合格之連線字串(環境變數URLX)執行select且不捕獲reject, 供unit-urlerr.test.mjs驗證Node實際輸出到stderr之內容不含帳密
//(未捕獲之reject由Node以util.inspect印出錯誤物件, 含message、stack與cause)
//環境變數LEGACY(JSON, 同test/tools/urlerrLegacy.mjs之raw)有給時, 改以替身驅動(重現驅動7.9.0之回顯形態)於new MongoClient拋錯, 無則用真驅動


import WOrm from '../../src/WOrmMongodb.mjs'
import { build } from './fakeMongo.mjs'
import { genLegacyErr } from './urlerrLegacy.mjs'


let w
if (typeof process.env.LEGACY === 'string' && process.env.LEGACY !== '') {
    let raw = JSON.parse(process.env.LEGACY)
    w = build({ ctor: () => genLegacyErr(raw) }, { url: process.env.URLX, db: 'worm', cl: 'urlerr' }).w
}
else {
    w = WOrm({ url: process.env.URLX, db: 'worm', cl: 'urlerr' })
}
w.select()

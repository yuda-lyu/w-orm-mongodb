//以不合格之連線字串(環境變數URLX)執行select且不捕獲reject, 供unit-urlerr.test.mjs驗證Node實際輸出到stderr之內容不含帳密
//(未捕獲之reject由Node以util.inspect印出錯誤物件, 含message、stack與cause)


import WOrm from '../../src/WOrmMongodb.mjs'


let w = WOrm({ url: process.env.URLX, db: 'worm', cl: 'urlerr' })
w.select()

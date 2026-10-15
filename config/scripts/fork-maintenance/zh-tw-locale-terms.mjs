// Taiwan UI wording applied after OpenCC cn→twp, which converts script and common IT phrases
// but keeps mainland UI vocabulary and cannot tell 项目 "item" from 项目 "project".

// Why: one place to switch the term used for "agent" (智能体), the app's most frequent noun.
export const AGENT_TERM = '代理'

const HAN = /\p{Script=Han}/u

/** Replacement that pads Latin text with spaces where it lands next to Han characters. */
function latin(text) {
  return (match, ...rest) => {
    const source = rest.at(-1)
    const offset = rest.at(-2)
    const before = HAN.test(source[offset - 1] ?? '') ? ' ' : ''
    const after = HAN.test(source[offset + match.length] ?? '') ? ' ' : ''
    return `${before}${text}${after}`
  }
}

// A rule applies only when the English source matches `en` (if set) and not `unless`; the
// English-gated rules run first so they still see OpenCC's wording.
const RULES = [
  { from: /退出(登入|登錄)/g, to: '登出' },
  { en: /\b(sign(ed|s|ing)?|log(ged|s|ging)?) out\b/i, from: /退出/g, to: '登出' },
  { en: /\b(quit(s|ting)?|exit(s|ed|ing)?)\b/i, from: /退出/g, to: '結束' },
  { en: /\bvisit/i, from: /訪問/g, to: '造訪' },
  // OpenCC turns 文件 into 檔案 (file); a written document such as a monday doc stays 文件.
  { en: /\bdocs?\b/i, from: /檔案/g, to: '文件' },
  { en: /\bund(o|one)\b/i, from: /撤銷/g, to: '復原' },
  // OpenCC keeps a standalone 周; Taiwan writes week as 週.
  { en: /\bweeks?\b/i, from: /周/g, to: '週' },
  { en: /\bitems?\b/i, unless: /\bprojects?\b/i, from: /專案/g, to: '項目' },
  {
    en: /\bmessages?\b/i,
    unless: /\b(info|information|details?)\b/i,
    from: /資訊/g,
    to: '訊息'
  },
  {
    en: /\bappl(y|ies|ied|ying)\b/i,
    unless: /\b(apps?|applications?)\b/i,
    from: /應用/g,
    to: '套用'
  },
  {
    en: /\b(apps?|applications?)\b/i,
    unless: /\bappl(y|ies|ied|ying)\b/i,
    from: /應用(?!程式)/g,
    to: '應用程式'
  },
  { en: /^help$|\bhelp menu\b/i, from: /幫助/g, to: '說明' },
  { en: /checkout/i, from: /結[帳賬]/g, to: '檢出' },
  // 通过 is both "via" (透過) and "passed" (通過).
  { unless: /\b(pass(es|ed|ing)?|approv\w*)\b/i, from: /通過/g, to: '透過' },
  // Mainland 行/列 = row/column; Taiwan 列/欄. Columns first so new 列 from rows stays put.
  { en: /\bcolumns?\b/i, from: /(?<![排系序佇陣令並行下])列(?![表出舉印])/g, to: '欄' },
  {
    en: /\brows?\b/i,
    from: /(?<![執進運發並換流銀平])行(?![為動內程駛政業])/g,
    to: '列'
  },

  { from: /智慧體/g, to: AGENT_TERM },
  { from: /會話/g, to: '工作階段' },
  { from: /令牌/g, to: '權杖' },
  { from: /許可權/g, to: '權限' },
  { from: /配置檔案/g, to: '設定檔' },
  { from: /預配置/g, to: '預先設定' },
  { from: /配置/g, to: '設定' },
  { from: /賬戶|帳戶|賬號/g, to: '帳號' },
  { from: /賬/g, to: '帳' },
  { from: /倉庫/g, to: '儲存庫' },
  { from: /選項卡|標籤頁/g, to: '分頁' },
  { from: /自定義/g, to: '自訂' },
  { from: /客戶端/g, to: '用戶端' },
  { from: /模板/g, to: '範本' },
  { from: /重啟/g, to: '重新啟動' },
  { from: /快捷鍵/g, to: '快速鍵' },
  { from: /快捷方式/g, to: '捷徑' },
  { from: /移動端/g, to: '行動裝置' },
  { from: /桌面端/g, to: '桌面版' },
  { from: /掃碼/g, to: latin('掃描 QR Code') },
  { from: /二維碼/g, to: latin('QR Code') },
  { from: /拉取請求/g, to: latin('Pull Request') },
  { from: /合併請求/g, to: latin('Merge Request') },
  { from: /回車/g, to: latin('Enter') },
  { from: /套餐/g, to: '方案' },
  { from: /反饋/g, to: '意見回饋' },
  { from: /滾動/g, to: '捲動' },
  { from: /選中/g, to: '選取' },
  { from: /搜索/g, to: '搜尋' },
  { from: /變基/g, to: '重定基底' },
  { from: /拖動|拖拽/g, to: '拖曳' },
  { from: /存儲/g, to: '儲存' },
  { from: /運行/g, to: '執行' },
  { from: /打開/g, to: '開啟' },
  { from: /字體/g, to: '字型' },
  { from: /保存/g, to: '儲存' },
  { from: /視圖/g, to: '檢視' },
  { from: /禁用/g, to: '停用' },
  { from: /圖標/g, to: '圖示' },
  { from: /點擊/g, to: '點選' },
  { from: /單擊/g, to: '按一下' },
  { from: /雙擊/g, to: '按兩下' },
  { from: /後臺/g, to: '背景' },
  { from: /斷開/g, to: '中斷' },
  { from: /拆分/g, to: '分割' },
  { from: /重置/g, to: '重設' },
  { from: /導航/g, to: '導覽' },
  { from: /地址欄/g, to: '網址列' },
  { from: /(標題|工具|狀態|選單)欄/g, to: '$1列' },
  { from: /全屏/g, to: '全螢幕' },
  { from: /首選項/g, to: '偏好設定' },
  { from: /郵箱/g, to: '電子郵件' },
  { from: /另存為/g, to: '另存新檔' },
  { from: /打印/g, to: '列印' },
  { from: /設備/g, to: '裝置' },
  { from: /頂部/g, to: '頂端' },
  { from: /示例/g, to: '範例' },
  { from: /歸檔/g, to: '封存' },
  { from: /鍵入/g, to: '輸入' },
  { from: /識別符/g, to: '識別碼' },
  { from: /收起/g, to: '收合' },
  { from: /工作流(?!程)/g, to: '工作流程' },
  { from: /虛擬機(?!器)/g, to: '虛擬機器' },
  { from: /工作項(?!目)/g, to: '工作項目' },
  { from: /克隆/g, to: '複製' },
  { from: /懸停/g, to: '停留' },
  { from: /當前/g, to: '目前' },
  { from: /計算機/g, to: '電腦' },
  { from: /丟失/g, to: '遺失' },
  { from: /空閒/g, to: '閒置' },
  { from: /系統托盤|托盤/g, to: '系統匣' },
  { from: /守護程序/g, to: '守護程式' },
  { from: /更改/g, to: '變更' },
  { from: /生成/g, to: '產生' },
  { from: /匹配/g, to: '符合' },
  { from: /構建/g, to: '建置' },
  { from: /獲取/g, to: '取得' },
  { from: /發送/g, to: '傳送' },
  { from: /添加|新建/g, to: '新增' },
  { from: /本地/g, to: '本機' },
  { from: /文本/g, to: '文字' },
  { from: /命令(?!列)/g, to: '指令' },
  { from: /終端(?!機)/g, to: '終端機' },
  { from: /評審/g, to: '審查' },
  { from: /訪問/g, to: '存取' },
  { from: /提交資訊/g, to: '提交訊息' },
  { from: /內聯/g, to: '內嵌' },
  { from: /主頁/g, to: '首頁' },
  { from: /未找到/g, to: '找不到' },
  { from: /首選/g, to: '偏好' },
  { from: /跟蹤/g, to: '追蹤' },
  { from: /單元格/g, to: '儲存格' },
  { from: /日程/g, to: '排程' },
  { from: /專案組/g, to: '專案群組' },
  // OpenCC turns every 代码 into 程式碼, including pairing/exit/status codes.
  { from: /(配對|驗證|邀請|授權|狀態)程式碼/g, to: '$1碼' },
  {
    from: /(退出|結束|錯誤|裝置)程式碼/g,
    to: (_m, kind) => `${kind === '退出' ? '結束' : kind}代碼`
  },
  { from: /程式碼塊/g, to: '程式碼區塊' },
  { from: /“/g, to: '「' },
  { from: /”/g, to: '」' },
  // 设置配置 / 重新刷新 collapse into doubled words once both halves are converted.
  { from: /(設定|重新)\1/g, to: '$1' }
]

/** Rewrites one OpenCC-converted catalog value into Taiwan UI wording. */
export function applyZhTwTerms(value, enValue = '') {
  let result = value
  for (const rule of RULES) {
    if ((rule.en && !rule.en.test(enValue)) || rule.unless?.test(enValue)) {
      continue
    }
    result = result.replace(rule.from, rule.to)
  }
  return result
}

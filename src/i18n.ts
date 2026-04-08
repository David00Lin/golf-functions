export type Lang = "ja" | "zh";

export function getLangFromPath(): Lang {
  return window.location.pathname.startsWith("/zh") ? "zh" : "ja";
}

const ja = {
  // Header / Navigation
  newGame: "新ゲーム",
  history: "履歴",
  nPlayers: "人",

  // Status banners
  sharedView: "共有された記録を閲覧中（編集不可）",
  participantView: "参加中 — スコア入力のみ可（ゴルフ場・プレイヤー名・設定はオーナーが管理）",
  viewingPast: "過去の記録を閲覧中",
  issueViewCodeViewing: "閲覧コードを発行",
  viewCodeBtn: "閲覧コード: ",
  continueGame: "このゲームを続ける",

  // Access stats
  accessStats: "アクセス状況（オーナーのみ表示）",
  totalAccess: "総アクセス: ",
  uniqueUsers: "ユニーク: ",
  lastAccess: "最終アクセス: ",
  times: " 回",
  people: " 人",

  // Share code input
  shareCode: "共有コード（6桁）",
  join: "参加",

  // History
  open: "開く",
  noRecords: "記録なし",
  noCourse: "（コース名なし）",
  devMode: "DEV MODE — 全ユーザー全履歴",

  // Course settings
  searchCourse: "ゴルフ場名を検索",
  courseNotFound: "登録されていないゴルフ場です",
  frontHalf: "前半",
  backHalf: "後半",
  freeLabel: "自由記載",

  // Players
  players: "PLAYERS",
  orderDesc: "1H の打順に入力してください",

  // Groups
  group: "グループ",
  ranking: "順位",
  release: "解除",
  saveGroupBtn: "このメンバーをグループとして保存",
  groupName: "グループ名（例：毎週水曜組）",
  save: "保存",

  // Player codes
  expiresAt: "まで",
  copy: "コピー",
  reissue: "再発行",
  delete: "削除",
  editCode: "編集コード発行",
  saveThenIssue: "保存してから発行できます",
  enterNamesFirst: "コース名・プレイヤー名を入力",

  // Team division
  teamDiv: "チーム分け",
  localOnlyNote: "※ この端末のみの表示設定（保存されません）",

  // Team mode labels (3p)
  tm_order_1_23: "打順\n1位 vs 2&3位",
  tm_fixed_1_23: "固定\n1 vs 2&3",
  tm_fixed_2_13: "固定\n2 vs 1&3",
  tm_fixed_3_12: "固定\n3 vs 1&2",
  // Team mode labels (4p)
  tm_order_14_23: "打順\n1&4 vs 2&3",
  tm_order_rotate: "打順\nローテ",
  tm_bag_rotate: "バッグ順\nローテ",
  tm_fixed_12_34: "固定\n1&2 vs 3&4",
  tm_fixed_13_24: "固定\n1&3 vs 2&4",
  tm_fixed_14_23: "固定\n1&4 vs 2&3",
  tmFixed: "固定",

  // Options
  options: "OPTIONS",
  birdieReverse: "バーディー逆転",
  truncate: "1の位切捨て",
  carry: "キャリー",
  push: "プッシュ",
  olympic: "オリンピック",
  handicap: "ハンディキャップ",
  ptsSetting: "点数設定",
  localOnly: "（この端末のみ）",
  gold: "金",
  silver: "銀",
  bronze: "銅",
  iron: "鉄",

  // Score table
  solo: "単独",
  tieNext: "引分→次×",
  subtotal: "計",
  olTotal: "OL計",

  // Settlement
  settlement: "精 算",
  rule3p: "3人版：単独はペア各人と個別決済（方法A）• ",
  rule4p: "4人版：",

  // Save section
  saving: "保存中...",
  saved: "保存済み",
  saveGame: "ゲームの保存",
  enterAllNames: "コース名・プレイヤー名をすべて入力してください",
  viewCode: "閲覧コードを発行",
  viewCodeLabel: "閲覧コード（読み取り専用）",
  reissueNote: "再発行すると旧コードは無効になります",

  // Name registration modal
  welcome: "あなたの名前を教えてください",
  welcomeSub: "リーダーボードで使用されます",
  namePlaceholder: "例: 山田、タロウ",
  confirm: "決定",

  // Leaderboard
  noData: "まだデータがありません",
  rounds: "ラウンド",

  // Alerts & confirms
  expiredCode: "このコードは有効期限が切れています。再発行してもらってください。",
  maxGroups: "グループは最大5つまで作成できます。不要なグループを削除してください。",
  groupSaveFailed: "グループ保存に失敗しました: ",
  deleteFailed: "削除に失敗しました: ",
  nameTaken: "はすでに他の端末で使用されています。別の名前を入力してください。",
  nameRegFailed: "名前の登録に失敗しました: ",
  codeIssueFailed: "コード発行に失敗しました: ",
  codeNotFound: "コードが見つかりません",
  confirmDelete: "このグループを削除しますか？",
  confirmDeleteRecord: "この記録を削除しますか？",
  confirmNew: "新しいゲームを開始しますか？\n現在の入力内容は保存されません。",
  confirmModeChange: "人数を変えるとオリンピックのメダル入力がリセットされます。よろしいですか？",
  confirmGroupApply: "グループを適用すると人数が変わり、オリンピックのメダル入力がリセットされます。よろしいですか？",
  confirmReissue: "前回のコードは使用不可になります。再発行しますか？",
  confirmLoadHistory: "現在の入力内容は保存されません。過去の記録を表示しますか？",
  error: "エラー: ",
};

const zh: typeof ja = {
  // Header / Navigation
  newGame: "新遊戲",
  history: "歷史紀錄",
  nPlayers: "人",

  // Status banners
  sharedView: "正在瀏覽共享紀錄（無法編輯）",
  participantView: "參加中 — 僅可輸入分數（球場、球員名稱、設定由擁有者管理）",
  viewingPast: "正在瀏覽過去紀錄",
  issueViewCodeViewing: "發行瀏覽代碼",
  viewCodeBtn: "瀏覽代碼: ",
  continueGame: "繼續此遊戲",

  // Access stats
  accessStats: "訪問統計（僅擁有者可見）",
  totalAccess: "總訪問: ",
  uniqueUsers: "不重複: ",
  lastAccess: "最後訪問: ",
  times: " 次",
  people: " 人",

  // Share code input
  shareCode: "共享代碼（6碼）",
  join: "加入",

  // History
  open: "開啟",
  noRecords: "無紀錄",
  noCourse: "（未設定球場）",
  devMode: "DEV MODE — 所有使用者歷史紀錄",

  // Course settings
  searchCourse: "搜尋球場名稱",
  courseNotFound: "未登錄的球場",
  frontHalf: "前半",
  backHalf: "後半",
  freeLabel: "自訂名稱",

  // Players
  players: "PLAYERS",
  orderDesc: "請依第1洞開球順序輸入",

  // Groups
  group: "群組",
  ranking: "排名",
  release: "取消",
  saveGroupBtn: "將此成員儲存為群組",
  groupName: "群組名稱（例：每週三組）",
  save: "儲存",

  // Player codes
  expiresAt: "為止",
  copy: "複製",
  reissue: "重新發行",
  delete: "刪除",
  editCode: "發行編輯代碼",
  saveThenIssue: "儲存後才能發行",
  enterNamesFirst: "請先輸入球場及球員名稱",

  // Team division
  teamDiv: "分組",
  localOnlyNote: "※ 僅此裝置顯示設定（不會儲存）",

  // Team mode labels (3p)
  tm_order_1_23: "開球順\n第1 vs 2&3",
  tm_fixed_1_23: "固定\n1 vs 2&3",
  tm_fixed_2_13: "固定\n2 vs 1&3",
  tm_fixed_3_12: "固定\n3 vs 1&2",
  // Team mode labels (4p)
  tm_order_14_23: "開球順\n1&4 vs 2&3",
  tm_order_rotate: "開球順\n輪替",
  tm_bag_rotate: "球袋順\n輪替",
  tm_fixed_12_34: "固定\n1&2 vs 3&4",
  tm_fixed_13_24: "固定\n1&3 vs 2&4",
  tm_fixed_14_23: "固定\n1&4 vs 2&3",
  tmFixed: "固定",

  // Options
  options: "OPTIONS",
  birdieReverse: "Birdie 反轉",
  truncate: "捨去個位數",
  carry: "Carry",
  push: "Push",
  olympic: "Olympic",
  handicap: "Handicap",
  ptsSetting: "配分設定",
  localOnly: "（僅此裝置）",
  gold: "金",
  silver: "銀",
  bronze: "銅",
  iron: "鐵",

  // Score table
  solo: "單打",
  tieNext: "平手→下×",
  subtotal: "小計",
  olTotal: "OL計",

  // Settlement
  settlement: "結 算",
  rule3p: "3人制：單打與配對各別結算 • ",
  rule4p: "4人制：",

  // Save section
  saving: "儲存中...",
  saved: "已儲存",
  saveGame: "儲存遊戲",
  enterAllNames: "請輸入球場名稱及所有球員姓名",
  viewCode: "發行瀏覽代碼",
  viewCodeLabel: "瀏覽代碼（唯讀）",
  reissueNote: "重新發行後舊代碼將失效",

  // Name registration modal
  welcome: "請輸入您的名稱",
  welcomeSub: "將用於排行榜",
  namePlaceholder: "例: 王大明",
  confirm: "確定",

  // Leaderboard
  noData: "尚無資料",
  rounds: "場",

  // Alerts & confirms
  expiredCode: "此代碼已過期，請要求重新發行。",
  maxGroups: "最多只能建立5個群組，請刪除不需要的群組。",
  groupSaveFailed: "群組儲存失敗: ",
  deleteFailed: "刪除失敗: ",
  nameTaken: "此名稱已被其他裝置使用，請輸入其他名稱。",
  nameRegFailed: "名稱登錄失敗: ",
  codeIssueFailed: "代碼發行失敗: ",
  codeNotFound: "找不到代碼",
  confirmDelete: "確定要刪除此群組嗎？",
  confirmDeleteRecord: "確定要刪除此紀錄嗎？",
  confirmNew: "確定要開始新遊戲嗎？\n目前的輸入內容將不會儲存。",
  confirmModeChange: "變更人數將重置Olympic獎牌輸入，確定嗎？",
  confirmGroupApply: "套用群組將變更人數並重置Olympic獎牌輸入，確定嗎？",
  confirmReissue: "舊代碼將失效。確定要重新發行嗎？",
  confirmLoadHistory: "目前的輸入內容將不會儲存。要顯示過去的紀錄嗎？",
  error: "錯誤: ",
};

export const i18n = { ja, zh } as const;
export type I18nKey = keyof typeof ja;

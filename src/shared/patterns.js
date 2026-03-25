// 统一关键词模式库，合并自 normalizeComments.js 与 labelSlices.js
// normalizeComments 侧重通用词，labelSlices 侧重场景专用词，两者取并集

export const DOXXING_PATTERNS = [
  /身份证/,
  /住址/,
  /手机号/,
  /开盒/,
  /学校/,
  /照片/,
  /身份证.{0,12}(私我|发你|发给|给你)/u,
  /(私我|发你|发给|给你).{0,12}身份证/u
];

export const ABUSE_PATTERNS = [
  /傻[逼比币]/,
  /脑残/,
  /去死/,
  /畜生/,
  /垃圾/,
  /懒狗/u,
  /傻卵/u,
  /擦pg/u,
  /龟男/u,
  /铁母鸡/u,
  /奶比/u,
  /绿茶/u,
  /滚出来/u,
  /低贱/u,
  /卑劣/u,
  /逼良为娼/u,
  /淫荡/u,
  /奴隶/u
];

export const FLAMEBAIT_PATTERNS = [
  /孝子/,
  /xxn/,
  /引战/,
  /独轮车/,
  /滚出/,
  /打奶龟/u,
  /评论区引战/u,
  /花店一体化/u,
  /必须打败这群孝子/u,
  /总督内战/u,
  /拉黑奶绿/u
];

export const SHOCK_PATTERNS = [/鬼图/, /猎奇/, /血腥/, /恶心图/];

export const UNRELATED_PATTERNS = [
  /开发笔记/u,
  /Hemlok/u,
  /RE-45/u,
  /P2020/u,
  /EVA-8/u,
  /Hardlight/u,
  /元素爆发/u,
  /元素战技/u,
  /传送门/u
];

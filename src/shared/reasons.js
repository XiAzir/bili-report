export const REVIEW_HEADERS = [
  "comment_id",
  "root_comment_id",
  "reply_comment_id",
  "uid",
  "uname",
  "ctime",
  "content_raw",
  "content_normalized",
  "picture_urls",
  "like_count",
  "evidence_type",
  "reason",
  "reason_confidence",
  "manual_review",
  "status",
  "dedupe_key",
  "source_url"
];

export const DEFAULT_REASONS = [
  "doxxing",
  "abuse",
  "spam",
  "hate_flamebait",
  "shock_image",
  "other"
];

// B 站举报原因 ID 映射（来自 /x/v2/reply/report/metadata 接口）
export const BILI_REASON_MAP = {
  doxxing:         { id: 15, label: "传播他人隐私信息" },
  abuse:           { id: 7,  label: "人身攻击" },
  spam:            { id: 3,  label: "刷屏" },
  hate_flamebait:  { id: 4,  label: "引战、不友善言论" },
  shock_image:     { id: 10, label: "低俗" },
  porn:            { id: 2,  label: "色情" },
  illegal:         { id: 9,  label: "违法违规" },
  gambling:        { id: 12, label: "赌博诈骗" },
  external_link:   { id: 23, label: "违法信息外链" },
  political_rumor: { id: 19, label: "涉政谣言" },
  fake_info:       { id: 22, label: "虚假不实信息" },
  social_rumor:    { id: 20, label: "涉社会事件谣言" },
  minor:           { id: 17, label: "青少年不良信息" },
  ad:              { id: 1,  label: "垃圾广告" },
  spoiler:         { id: 5,  label: "剧透" },
  unrelated:       { id: 8,  label: "视频不相关" },
  illegal_lottery: { id: 18, label: "违规抽奖" },
  other:           { id: 0,  label: "其他" }
};

export const ALLOWED_REASONS = Object.keys(BILI_REASON_MAP);

export function ensureAllowedReason(reason, allowedReasons) {
  if (!reason) {
    return;
  }
  if (!allowedReasons.includes(reason)) {
    throw new Error(`Invalid reason "${reason}". Allowed: ${allowedReasons.join(", ")}`);
  }
}

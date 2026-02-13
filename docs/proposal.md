# 改善提案

## 現状 (2026/02/04 時点)

### 実装済み機能
- ✅ Gemini Nano (Chrome Prompt API) による人物分析
- ✅ MediaPipe によるリアルタイム人物追跡
- ✅ JSON Schema (`responseConstraint`) による構造化出力
- ✅ 画像リサイズ (512px max, アスペクト比維持)
- ✅ セッション管理 (人物ごと、最小1秒)
- ✅ IndexedDB へのログ保存
- ✅ 構造化データ表示 (age/sex/fashion)

### 現在のプロンプト構成
```typescript
// System Prompt
const SYSTEM_PROMPT = `Analyze each person. Use the exact UID provided.
age: child/teen/20s/30s/40s/50s/60s+
sex: male/female
fashion: brief clothing description (3 words max)`;

// JSON Schema
const RESPONSE_SCHEMA = {
    type: "array",
    items: {
        type: "object",
        properties: {
            uid: { type: "string" },
            age: { enum: ["child", "teen", "20s", "30s", "40s", "50s", "60s+"] },
            sex: { enum: ["male", "female"] },
            fashion: { type: "string" }
        },
        required: ["uid", "age", "sex", "fashion"]
    }
};

// User Prompt
`Describe persons: ${idsStr}`
```

---

## 改善提案

### 1. UI上でのプロンプトカスタマイズ

#### 概要
ユーザーがプロンプトや出力フィールドをUI上で変更できる設定パネル

#### UIイメージ
```
┌─────────────────────────────────────┐
│ ⚙️ Analysis Settings                │
├─────────────────────────────────────┤
│ System Prompt:                      │
│ ┌─────────────────────────────────┐ │
│ │ Analyze each person...          │ │
│ │ age: child/teen/20s/30s/...     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ Output Fields:                      │
│ ☑ age    ☑ sex    ☑ fashion       │
│ ☐ emotion  ☐ action  ☐ direction  │
│                                     │
│ [Reset to Default] [Apply]          │
└─────────────────────────────────────┘
```

#### 追加可能なフィールド候補

| フィールド | 説明 | 値の例 | ユースケース |
|-----------|------|--------|-------------|
| `emotion` | 表情・感情 | happy, neutral, focused, angry | 顧客満足度分析 |
| `action` | 現在の行動 | standing, walking, sitting, running | 行動パターン分析 |
| `direction` | 体の向き | front, left, right, back | 動線分析 |
| `accessories` | アクセサリー | glasses, hat, bag, mask | 属性詳細化 |
| `posture` | 姿勢 | upright, slouched, leaning | 疲労度分析 |

#### 実装ポイント
- プロンプト設定は `localStorage` または IndexedDB に保存
- `RESPONSE_SCHEMA` を動的に生成
- フィールドのon/offでUIの表示も連動

---

### 2. プリセット機能

#### 概要
ユースケース別のプロンプトプリセットを用意

#### プリセット案

| プリセット名 | フィールド | 用途 |
|-------------|-----------|------|
| **Basic** | age, sex, fashion | デフォルト |
| **Retail** | age, sex, fashion, emotion, action | 小売店舗向け |
| **Security** | age, sex, fashion, direction, accessories | セキュリティ向け |
| **Custom** | ユーザー定義 | カスタム |

---

### 3. 分析精度向上

#### 画像品質
- [ ] 画像サイズを可変に（256/384/512/768）
- [ ] 明るさ・コントラスト自動調整

#### プロンプト最適化
- [ ] Few-shot examples の追加オプション
- [ ] 日本語出力オプション

---

### 4. パフォーマンス表示の拡充

#### 追加メトリクス候補
- 平均分析時間の推移グラフ
- セッション作成/破棄回数
- JSONパース成功率

---

## 優先度

| 提案 | 優先度 | 工数 | 状態 |
|------|--------|------|------|
| プロンプトカスタマイズUI | 中 | 中 | ✅ 実装済 |
| プリセット機能 | 低 | 小 | ✅ 実装済 |
| 画像サイズ可変 | 低 | 小 | - |
| パフォーマンスグラフ | 低 | 中 | - |

---

## 実装済み機能 (2026/02/04 追加)

### AnalysisSettings コンポーネント
- `src/lib/components/AnalysisSettings.svelte` - 設定モーダルUI
- `src/lib/promptSettings.ts` - 設定ストア（localStorage永続化）

### 機能
- **プリセット**: Basic / Retail / Security / Custom
- **出力フィールド選択**: age, sex, fashion, emotion, action, direction, accessories, posture
- **システムプロンプト編集**: Advanced セクションで直接編集可能
- **動的スキーマ生成**: 選択したフィールドに基づいてJSON Schemaを自動生成
- **localStorage永続化**: 設定はブラウザを閉じても保持

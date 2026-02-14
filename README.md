# 🦜 Nano Parrot

**ブラウザ完結型 AI カメラ — リアルタイム複数人物トラッキング＆属性分析システム**

Chrome に内蔵された **Gemini Nano (Prompt API)** と **MediaPipe** を組み合わせ、カメラ映像内の複数人物を同時検出・個別識別（UID 管理）して属性を分析します。すべての処理がクライアントサイドで完結するため、**サーバーへの送信は一切行わず、高度なプライバシー保護** を実現します。

---

## ✨ 主な機能

| 機能 | 説明 |
|------|------|
| **リアルタイム人物追跡** | MediaPipe EfficientDet による人物検出と IoU ベースのカスタムトラッカーで複数人を同時にUID管理 |
| **AI 属性分析** | Gemini Nano のマルチモーダル推論で年齢層・性別・ファッションなどを構造化 JSON で出力 |
| **アノテーション付き画像入力** | バウンディングボックスとUIDを映像にオーバーレイした画像をAIに送信し、視覚的な人物識別を強化 |
| **ストリーミング推論** | 生成テキストをリアルタイムに表示し、推論進捗を可視化 |
| **カスタマイズ可能な分析** | プリセット (Basic / Retail / Security / Custom) やフィールド単位での出力設定 |
| **セッション管理** | IndexedDB (Dexie.js) に推論ログを永続化し、時間帯別に自動集約 |
| **Parrot's Insight** | 集約データを基に Gemini Nano が店舗分析コメントを日本語で生成 |
| **ログビューア** | セッション検索・ソート・詳細展開・JSON エクスポート機能 |
| **パフォーマンスモニター** | FPS・トラッキング時間・推論時間・メモリ使用量をリアルタイム表示 |
| **Wake Lock** | Screen Wake Lock API でデバイスのスリープを防止 |

---

## 🏗️ アーキテクチャ

```
カメラ映像
  │
  ▼
MediaPipe EfficientDet ── 人物検出 + BBox 座標
  │
  ▼
カスタム IoU トラッカー ── UID 付与 & フレーム間追跡
  │
  ▼
BBox + UID オーバーレイ描画 ── アノテーション付き画像を生成
  │
  ▼
Gemini Nano (Prompt API) ── アノテーション画像 + テキスト座標で一括推論
  │
  ▼
構造化 JSON 出力 ── IndexedDB (Dexie.js) へ永続化
  │
  ▼
時間帯別集約 ── Parrot's Insight (AI 総括コメント)
```

---

## 🛠️ 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フレームワーク | [SvelteKit](https://kit.svelte.dev/) (Static Adapter / SPA) |
| スタイリング | [Tailwind CSS](https://tailwindcss.com/) + カスタム CSS |
| AI 推論 | Chrome Built-in AI — Gemini Nano Prompt API |
| 人物検出 | [MediaPipe Tasks Vision](https://developers.google.com/mediapipe) (EfficientDet Lite0) |
| データベース | [Dexie.js](https://dexie.org/) (IndexedDB ラッパー) |
| ビルドツール | [Vite](https://vite.dev/) |
| ランタイム | [Bun](https://bun.sh/) / Node.js |
| テスト | [Vitest](https://vitest.dev/) |
| 言語 | TypeScript / Svelte |

---

## 📋 動作要件

- **Google Chrome 138+**（Canary / Dev チャンネル推奨）
- **Prompt API フラグ有効化**
  - `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**
  - `chrome://flags/#optimization-guide-on-device-model` → **Enabled BypassPerfRequirement**
- Web カメラ（USB / 内蔵）
- **デスクトップ推奨**（モバイルは制限あり）

---

## 🚀 セットアップ

### 前提条件

- [Bun](https://bun.sh/) または [Node.js](https://nodejs.org/) (v18+)

### インストール & 起動

```bash
# リポジトリをクローン
git clone https://github.com/1850dev/Nano-Parrot.git
cd Nano-Parrot

# 依存関係をインストール
bun install
# または
npm install

# 開発サーバーを起動
bun run dev
# または
npm run dev
```

ブラウザで `http://localhost:5173` を開きます。

### ビルド

```bash
bun run build
# または
npm run build
```

`build/` ディレクトリに静的ファイルが出力されます。任意の静的ホスティングサービスにデプロイ可能です。

---

## 📁 プロジェクト構成

```
Nano-Parrot/
├── src/
│   ├── routes/
│   │   ├── +page.svelte          # メインページ（カメラ + 分析ループ）
│   │   └── logs/+page.svelte     # ログビューア
│   ├── lib/
│   │   ├── main.ts               # Gemini Nano セッション管理 & 推論
│   │   ├── tracker.ts            # MediaPipe 人物検出 & IoU トラッカー
│   │   ├── dexieDb.ts            # Dexie.js データベース層
│   │   ├── sessionAggregator.ts  # 時間帯別セッション集約
│   │   ├── promptSettings.ts     # プロンプト / プリセット設定ストア
│   │   ├── config.ts             # アプリケーション設定
│   │   ├── stores.ts             # Svelte ストア（トラッキング / 推論状態）
│   │   └── components/
│   │       ├── ViewFinder.svelte         # カメラビューファインダー
│   │       ├── ResultsDisplay.svelte     # 分析結果表示
│   │       ├── AnalysisSettings.svelte   # プロンプト設定モーダル
│   │       ├── PerformanceMonitor.svelte # パフォーマンスメトリクス
│   │       ├── ParrotInsight.svelte      # AI 総括コメント
│   │       └── SplashScreen.svelte       # スプラッシュスクリーン
│   ├── app.html                  # HTML テンプレート
│   └── app.css                   # グローバル CSS / デザインシステム
├── static/
│   ├── models/                   # MediaPipe モデルファイル（ローカル）
│   └── wasm/                     # MediaPipe WASM ファイル（ローカル）
├── docs/
│   ├── Requirements-Definition.md
│   └── proposal.md
├── package.json
├── svelte.config.js
├── vite.config.ts
└── tsconfig.json
```

---

## 🔧 カスタマイズ

### 分析プリセット

UI 上の **⚙️ Analysis Settings** から切り替え可能:

| プリセット | 出力フィールド | ユースケース |
|-----------|---------------|-------------|
| **Basic** | age, sex, fashion | 基本的な属性分析 |
| **Retail** | age, sex, fashion, emotion, action | 小売店舗向け |
| **Security** | age, sex, fashion, direction, accessories | セキュリティ向け |
| **Custom** | ユーザー定義 | カスタム構成 |

### 設定パラメータ

`src/lib/config.ts` で主要パラメータを調整可能:

| パラメータ | デフォルト値 | 説明 |
|-----------|------------|------|
| `analysisIntervalMs` | 3000 | VLM 分析の実行間隔 (ms) |
| `maxTrackedUsers` | 10 | 同時トラッキングの最大人数 |
| `iouThreshold` | 0.3 | オブジェクト間マッチングの IoU 閾値 |
| `gracePeriodMs` | 2000 | ロスト ID の保持期間 (ms) |
| `maxImageSize` | 728 | 推論用画像の最大サイズ (px) |

---

## 📜 ライセンス

Private

---

## 🔗 関連リンク

- [Chrome Built-in AI — Prompt API](https://developer.chrome.com/docs/ai/built-in)
- [MediaPipe Object Detection](https://developers.google.com/mediapipe/solutions/vision/object_detector)
- [SvelteKit](https://kit.svelte.dev/)
- [Dexie.js](https://dexie.org/)

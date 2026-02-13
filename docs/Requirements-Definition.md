# 開発提案書：ブラウザ完結型・複数人同時トラッキング＆属性分析システム

## 1. プロジェクト概要

本システムは、Chromeブラウザに内蔵された**Prompt API (Gemini Nano)** と **MediaPipe** を組み合わせ、カメラ映像内の**複数の人物を同時に、かつ個別に識別（UID管理）して分析**するAIカメラソリューションです。
サーバーへのデータ送信を行わず、全ての処理をクライアントサイド（ブラウザ）で完結させることで、高度なプライバシー保護とリアルタイム性を両立します。

## 2. システム構成図

### フローチャート

1. **映像取得**: Webカメラからのストリーム入力。
2. **検知 & ID付与 (MediaPipe)**: 人物を検知し、UIDとバウンディングボックス（BB）座標を取得。
3. **データ整形**: 検知された全員分のUIDと座標をテキスト化し、プロンプトに埋め込む。
4. **一括推論 (Gemini Nano)**: 画像全体と整形済みテキストをPrompt APIに渡し、一括分析を指示。
5. **構造化出力**: JSON配列形式で結果を受け取り、アプリケーション（DB等）で利用。

## 3. 技術実装詳細

### 3.1. 入力データの構成（コンテキスト注入）

Gemini Nanoが「どのUIDが画像のどこにいるか」を正確に認識するため、MediaPipeからの出力を以下の形式の文字列リスト（`${idsStr}`）に変換します。

**${idsStr} の生成ロジック:**

```javascript
// MediaPipeの検知結果(detections)をGemini用のテキスト形式に変換
const idsStr = detections.map(d => {
  // 座標は0.0〜1.0の正規化座標、またはピクセル値を使用
  // Geminiが理解しやすいよう、明確なラベルを付けます
  return `[UID: ${d.trackingId}, Box: {ymin: ${d.boundingBox.originY}, xmin: ${d.boundingBox.originX}, width: ${d.boundingBox.width}, height: ${d.boundingBox.height}}]`;
}).join('\n');

```

### 3.2. プロンプト設計

ご指定のプロンプトを採用し、Gemini Nanoに対して**StrictなJSON出力**を強制します。

**使用プロンプト:**

```markdown
Find the persons in the image corresponding strictly to the following IDs:
${idsStr}

For each of these specified IDs, provide a visual description of the person inside the bounding box.
Focus on details such as clothing, estimated age group, and current action.

Return the result strictly as a valid JSON array without any markdown formatting or extra text:
[{"uid": "ID", "description": "text"}]

```

### 3.3. 実行コード例（JavaScript）

```javascript
async function analyzeMultiplePersons(imageBlob, detections) {
  // 1. 座標リスト文字列の作成
  const idsStr = detections.map(d =>
    `UID: ${d.trackingId} located at Box: [x:${d.box.x}, y:${d.box.y}, w:${d.box.w}, h:${d.box.h}]`
  ).join(", ");

  // 2. セッションの作成（必要に応じて再利用）
  const session = await ai.languageModel.create({
    systemPrompt: "You are a surveillance AI. Output strictly in JSON."
  });

  // 3. プロンプトの構築
  const promptText = `
    Find the persons in the image corresponding strictly to the following IDs: ${idsStr}.
    For each of these specified IDs, provide a visual description of the person inside the bounding box.
    Return the result strictly as a JSON array: [{"uid": "ID", "description": "text"}]
  `;

  // 4. 推論実行
  const result = await session.prompt([
    promptText,
    imageBlob // フルフレーム画像
  ]);

  // 5. JSONパースとエラーハンドリング
  try {
    const jsonResult = JSON.parse(result);
    return jsonResult;
  } catch (e) {
    console.error("JSON Parse Error:", result);
    return [];
  }
}

```

## 4. 出力データ仕様

システムは以下のJSONフォーマットを出力し、indexedDBへ格納します。

```json
[
  {
    "uid": "UW5E3A5D",
    "description": "A young adult male wearing a red hoodie and holding a smartphone, looking at the shelf."
  },
  {
    "uid": "FR5H3KID",
    "description": "An elderly woman in a beige coat, pushing a shopping cart."
  }
]

```

## 5. 開発上の考慮事項と対策

| 課題 | 対策 |
| --- | --- |
| **人物の取り違え** | プロンプト内で座標（Bounding Box）を渡す際、画像の解像度と座標系（正規化座標 vs ピクセル座標）がGeminiの認識と一致しているか検証が必要です。正規化座標（0.0-1.0）の使用を推奨します。 |
| **推論レイテンシ** | 複数人を同時に分析するため、出力トークン数が増加し生成時間が伸びる可能性があります。検知人数が多い場合（例: 5人以上）、リストを分割してバッチ処理を行うロジックを追加します。 |
| **JSON形式の崩れ** | LLMは稀にJSON形式を誤ることがあります。`JSON.parse` 失敗時に、簡易的な修正ロジックを通すか、再生成を行うリトライ処理を実装します。 |


---


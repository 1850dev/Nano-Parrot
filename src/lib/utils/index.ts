export function generateID(type: 'short' | 'long' = 'short'): string {
    if (type === 'long') {
        // セッションID用: 絶対に衝突しない完全なUUID
        return crypto.randomUUID();
    }
    // 人物UID用: 視認性重視の8文字ID
    return crypto.randomUUID().slice(0, 8).toUpperCase();
}


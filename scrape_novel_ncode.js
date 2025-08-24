#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const OUTPUT_DIR = path.join('novel_output', 'ncode');
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
const ALLOWED_DOMAIN = 'ncode.syosetu.com';

// コマンドライン引数を解析
function parseArguments() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('使用方法: node scrape_novel_ncode.js <URL>');
        console.error('例: node scrape_novel_ncode.js https://ncode.syosetu.com/n9734kw/');
        process.exit(1);
    }
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('小説家になろうスクレイピングツール');
        console.log('');
        console.log('使用方法:');
        console.log('  node scrape_novel_ncode.js <URL>');
        console.log('');
        console.log('引数:');
        console.log('  URL    スクレイピング対象の小説URL (https://ncode.syosetu.com/ のみ対応)');
        console.log('');
        console.log('例:');
        console.log('  node scrape_novel_ncode.js https://ncode.syosetu.com/n9734kw/');
        process.exit(0);
    }
    
    return args[0];
}

// URLの妥当性を検証
function validateUrl(urlString) {
    try {
        const url = new URL(urlString);
        
        // HTTPSプロトコルのチェック
        if (url.protocol !== 'https:') {
            console.error(`エラー: HTTPSプロトコルのURLを指定してください: ${urlString}`);
            process.exit(1);
        }
        
        // 許可されたドメインのチェック
        if (url.hostname !== ALLOWED_DOMAIN) {
            console.error(`エラー: 許可されていないドメインです: ${url.hostname}`);
            console.error(`許可されているドメイン: ${ALLOWED_DOMAIN}`);
            process.exit(1);
        }
        
        return url;
        
    } catch (error) {
        console.error(`エラー: 無効なURLです: ${urlString}`);
        console.error(`詳細: ${error.message}`);
        process.exit(1);
    }
}

// 出力ディレクトリを作成
function ensureOutputDir() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

// HTTPSリクエストを行う関数
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': USER_AGENT
            }
        };

        https.get(url, options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (err) => {
            reject(err);
        });
    });
}

// HTMLエンティティをデコードする関数
function decodeHtmlEntities(text) {
    return text
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
}

// HTMLタグを除去する関数
function stripHtmlTags(text) {
    return text.replace(/<[^>]*>/g, '');
}

// 小説の内容を抽出する関数
function extractNovelContent(html) {
    // 小説本文を抽出（p-novel__textクラス内）
    const startPattern = /<div class="js-novel-text p-novel__text">/;
    const endPattern = /<\/div>/;
    
    const startMatch = html.search(startPattern);
    if (startMatch === -1) {
        console.error('小説本文の開始タグが見つかりません');
        return '';
    }
    
    let content = html.substring(startMatch);
    
    // 最初の</div>までを抽出
    let divCount = 1;
    let endIndex = -1;
    let currentIndex = content.indexOf('<div', 1); // 最初のdivをスキップ
    
    while (divCount > 0 && currentIndex !== -1) {
        const nextDiv = content.indexOf('<div', currentIndex + 1);
        const nextEndDiv = content.indexOf('</div>', currentIndex);
        
        if (nextEndDiv === -1) break;
        
        if (nextDiv !== -1 && nextDiv < nextEndDiv) {
            divCount++;
            currentIndex = nextDiv;
        } else {
            divCount--;
            currentIndex = nextEndDiv;
            if (divCount === 0) {
                endIndex = nextEndDiv;
            }
        }
    }
    
    if (endIndex !== -1) {
        content = content.substring(0, endIndex);
    }
    
    // <br>タグを改行に変換
    content = content.replace(/<br[^>]*>/g, '\n');
    
    // HTMLタグを除去
    content = stripHtmlTags(content);
    
    // HTMLエンティティをデコード
    content = decodeHtmlEntities(content);
    
    // 空行を除去し、行をクリーンアップ
    const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    
    return lines.join('\n');
}

// タイトルを抽出する関数
function extractTitle(html) {
    const titleMatch = html.match(/<title>([^<]*)<\/title>/);
    if (titleMatch) {
        return titleMatch[1].replace(' - 小説家になろう', '');
    }
    return '不明なタイトル';
}

// 章リンクを抽出する関数
function extractChapterLinks(html) {
    const linkPattern = /href="([^"]*n9734kw\/\d+[^"]*)"/g;
    const links = [];
    let match;
    
    while ((match = linkPattern.exec(html)) !== null) {
        const link = match[1].startsWith('http') ? match[1] : `https://ncode.syosetu.com${match[1]}`;
        if (!links.includes(link)) {
            links.push(link);
        }
    }
    
    return links.sort();
}

// 遅延処理（レート制限対応）
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// メイン処理
async function main() {
    try {
        // コマンドライン引数を解析
        const urlString = parseArguments();
        
        // URLの妥当性を検証
        const novelUrl = validateUrl(urlString);
        
        // 出力ディレクトリを作成
        ensureOutputDir();
        
        console.log(`小説をスクレイピング中: ${novelUrl.href}`);
        console.log('章一覧を取得中...');
        const html = await fetchUrl(novelUrl.href);
        
        // HTMLファイルを保存
        fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);
        
        // タイトルを抽出
        const title = extractTitle(html);
        console.log(`小説タイトル: ${title}`);
        
        // メインページの内容を抽出
        console.log('メインページの内容を取得中...');
        const content = extractNovelContent(html);
        
        if (content) {
            fs.writeFileSync(path.join(OUTPUT_DIR, 'content.txt'), content);
            console.log('メインコンテンツを保存しました');
        } else {
            console.error('コンテンツの抽出に失敗しました');
        }
        
        // 章リンクを検索
        console.log('章リンクを検索中...');
        const chapterLinks = extractChapterLinks(html);
        
        if (chapterLinks.length > 0) {
            console.log('章別ダウンロードを開始...');
            
            for (let i = 0; i < chapterLinks.length; i++) {
                const chapterUrl = chapterLinks[i];
                const chapterNum = i + 1;
                
                console.log(`第${chapterNum}章をダウンロード中: ${chapterUrl}`);
                
                try {
                    // 章のHTMLを取得
                    const chapterHtml = await fetchUrl(chapterUrl);
                    
                    // 章のタイトルを抽出
                    const chapterTitle = extractTitle(chapterHtml);
                    
                    // 章の内容を抽出
                    const chapterContent = extractNovelContent(chapterHtml);
                    
                    if (chapterContent) {
                        const filename = `chapter_${chapterNum.toString().padStart(3, '0')}.txt`;
                        fs.writeFileSync(path.join(OUTPUT_DIR, filename), chapterContent);
                        console.log(`第${chapterNum}章「${chapterTitle}」保存完了`);
                    } else {
                        console.error(`第${chapterNum}章のコンテンツ抽出に失敗しました`);
                    }
                    
                    // レート制限のため1秒待機
                    await sleep(1000);
                    
                } catch (error) {
                    console.error(`第${chapterNum}章の取得でエラーが発生しました:`, error.message);
                }
            }
        } else {
            console.log('章リンクが見つかりません。単一ページとして処理しました。');
        }
        
        console.log('スクレイピング完了！');
        console.log(`出力ディレクトリ: ${OUTPUT_DIR}`);
        console.log('取得したファイル:');
        
        // ファイル一覧を表示
        const files = fs.readdirSync(OUTPUT_DIR);
        files.forEach(file => {
            const filePath = path.join(OUTPUT_DIR, file);
            const stats = fs.statSync(filePath);
            console.log(`  ${file} (${stats.size} bytes)`);
        });
        
    } catch (error) {
        console.error('エラーが発生しました:', error);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみメイン処理を実行
if (require.main === module) {
    main();
}

module.exports = {
    fetchUrl,
    extractNovelContent,
    extractTitle,
    extractChapterLinks,
    decodeHtmlEntities,
    stripHtmlTags
};
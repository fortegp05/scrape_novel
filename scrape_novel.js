#!/usr/bin/env node

const { spawn } = require('child_process');
const { URL } = require('url');
const path = require('path');

// 対応しているドメインとスクリプトのマッピング
const SUPPORTED_SCRAPERS = {
    'ncode.syosetu.com': 'scrape_novel_ncode.js',
    'kakuyomu.jp': 'scrape_novel_kakuyomu.js'
};

// コマンドライン引数を解析
function parseArguments() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.error('使用方法: node scrape_novel.js <URL>');
        console.error('');
        console.error('対応サイト:');
        console.error('  - 小説家になろう: https://ncode.syosetu.com/');
        console.error('  - カクヨム: https://kakuyomu.jp/');
        console.error('');
        console.error('例:');
        console.error('  node scrape_novel.js https://ncode.syosetu.com/n9734kw/');
        console.error('  node scrape_novel.js https://kakuyomu.jp/works/16818792437247508583');
        process.exit(1);
    }
    
    if (args.includes('--help') || args.includes('-h')) {
        console.log('統合小説スクレイピングツール');
        console.log('');
        console.log('使用方法:');
        console.log('  node scrape_novel.js <URL>');
        console.log('');
        console.log('対応サイト:');
        console.log('  - 小説家になろう (https://ncode.syosetu.com/)');
        console.log('  - カクヨム (https://kakuyomu.jp/)');
        console.log('');
        console.log('引数:');
        console.log('  URL    スクレイピング対象の小説URL');
        console.log('');
        console.log('例:');
        console.log('  node scrape_novel.js https://ncode.syosetu.com/n9734kw/');
        console.log('  node scrape_novel.js https://kakuyomu.jp/works/16818792437247508583');
        console.log('');
        console.log('出力:');
        console.log('  novel_output/ncode/    - なろう作品');
        console.log('  novel_output/kakuyomu/ - カクヨム作品');
        process.exit(0);
    }
    
    return args[0];
}

// URLの妥当性を検証し、対応するスクリプトを特定
function validateUrlAndGetScraper(urlString) {
    try {
        const url = new URL(urlString);
        
        // HTTPSプロトコルのチェック
        if (url.protocol !== 'https:') {
            console.error(`エラー: HTTPSプロトコルのURLを指定してください: ${urlString}`);
            process.exit(1);
        }
        
        // 対応ドメインのチェック
        const scraper = SUPPORTED_SCRAPERS[url.hostname];
        if (!scraper) {
            console.error(`エラー: 対応していないドメインです: ${url.hostname}`);
            console.error('');
            console.error('対応しているドメイン:');
            Object.keys(SUPPORTED_SCRAPERS).forEach(domain => {
                console.error(`  - ${domain}`);
            });
            process.exit(1);
        }
        
        return scraper;
        
    } catch (error) {
        console.error(`エラー: 無効なURLです: ${urlString}`);
        console.error(`詳細: ${error.message}`);
        process.exit(1);
    }
}

// 子プロセスでスクリプトを実行
function runScraper(scraperScript, url) {
    return new Promise((resolve, reject) => {
        console.log(`${scraperScript} を実行中...`);
        console.log('');
        
        const child = spawn('node', [scraperScript, url], {
            stdio: 'inherit',
            cwd: __dirname
        });
        
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`スクリプトが異常終了しました (終了コード: ${code})`));
            }
        });
        
        child.on('error', (error) => {
            reject(new Error(`スクリプトの実行でエラーが発生しました: ${error.message}`));
        });
    });
}

// メイン処理
async function main() {
    try {
        // コマンドライン引数を解析
        const urlString = parseArguments();
        
        // URLの妥当性を検証し、対応するスクリプトを特定
        const scraperScript = validateUrlAndGetScraper(urlString);
        
        // 対応するスクリプトを実行
        await runScraper(scraperScript, urlString);
        
        console.log('');
        console.log('=== スクレイピング完了 ===');
        
    } catch (error) {
        console.error('エラーが発生しました:', error.message);
        process.exit(1);
    }
}

// スクリプトが直接実行された場合のみメイン処理を実行
if (require.main === module) {
    main();
}

module.exports = {
    parseArguments,
    validateUrlAndGetScraper,
    runScraper
};
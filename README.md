# Neon Rhythm Arcade

短時間で遊べる、4レーンのPCブラウザ向けリズムゲームです。

## ゲーム概要
ネオン輝くサイバー空間を舞台に、音楽に合わせて降ってくるノーツをタイミング良く叩くリズムゲームです。
スコアを稼ぎ、OVERDRIVEを発動させて高ランクを目指してください。

## 操作方法
- **D** / **F** / **J** / **K** キーで操作します。（左から順に対応）
- メニュー等のUIはマウスでクリックして操作します。

## 判定システムとOVERDRIVE
- 判定ラインに重なった瞬間に対応するキーを押してください。
- 判定は PERFECT / GOOD / MISS の3段階です。
- 連続して成功するとOVERDRIVEゲージが溜まり、最大になると自動発動します。
- OVERDRIVE中は獲得スコアが2倍になり、画面演出が強化されます。

## ローカル実行方法・起動方法
ブラウザのセキュリティ制限を回避するため、ローカルサーバー経由で起動してください。
- **Windows**: 同梱の `run-local.bat` をダブルクリックして起動します。
- **その他**: VS Codeの「Live Server」拡張機能などを使用し、`index.html` を開いてください。


## 同梱楽曲
この版には以下の5曲を登録済みです。

- Street Life
- Short 17 (Speed + Reverb)
- Binary Battle
- BEAT - Its a Rush
- HyperPOP Anime style music - no copyright

各曲に EASY / NORMAL / HARD の譜面を用意しています。
現在の譜面はテンポ解析をもとに自動生成した初期版で、1プレイは約45秒です。
本格公開前に実際に遊び、ズレる曲は `charts/` 内の `time` を微調整してください。

## 楽曲・譜面の追加方法
1. `music` フォルダに新しい音源ファイル（.mp3等）を配置します。
2. `charts` フォルダに新しい譜面ファイル（.json）を配置します。
3. ルートにある `songs.json` に楽曲情報を追記します。
   （※既存の書式を参考に、`audio` や `difficulties` のパスを指定してください）

## GitHubへのアップロード・公開方法
1. GitHubで新規Repositoryを作成します。
2. このフォルダの中身を全てアップロード（Commit & Push）します。（GitHub Desktop等の使用推奨）
3. Repositoryの「Settings」を開きます。
4. 左側メニューの「Pages」を開きます。
5. `Source` を `Deploy from a branch` に設定し、ブランチを `main`（または `master`）にして「Save」します。
6. 数分後、画面上部に表示されるURLでゲームが公開されます。

## フォルダ構成
- `index.html` : メイン画面
- `style.css` : デザイン定義
- `script.js` : ゲームシステム本体
- `songs.json` : 楽曲リスト
- `music/` : 楽曲ファイル(.mp3等)の配置場所
- `charts/` : 譜面データ(.json)の配置場所
- `assets/` : 画像等の追加素材用
- `run-local.bat` : Windows向け簡単起動スクリプト
- `.gitignore` : Git用の不要ファイル除外設定

## トラブルシューティング
- **音が出ない**: `music` フォルダに楽曲が存在するか確認してください。
- **譜面が読み込めない**: `run-local.bat` 等を使い、ローカルサーバー経由で開いているか確認してください。（ファイルを直接ブラウザにドロップするとエラーになります）


## 追加更新（紫UIアセット版）
- key / lane / judgment / OVERDRIVE / RESULTボタンの画像アセットを `assets/ui/` に追加
- 通常プレイは紫主体、OVERDRIVE中はゴールド系レーン演出へ切り替え
- 難易度別スコア倍率を追加
  - EASY x1.00
  - NORMAL x1.25
  - HARD x1.55

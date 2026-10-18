# 貓咪占卜師（Catcana）原型

Roguelike 三消的網頁原型。設計見〈貓咪占卜師：Roguelike 三消設計初稿.md〉，開發進度見 [PLAN.md](PLAN.md)。

## 本機執行

ES modules 不能用 `file://` 直接開，需要一個本機伺服器：

```bash
node dev-server.mjs
```

然後打開 http://localhost:8080 。也可以用 XAMPP 的 Apache 開 http://localhost/Catcana/ 。

網址參數：

- `?seed=123`：指定盤面種子，重現同一盤
- `?cards=magician,wheel-r`：測試用，直接指定開局手牌（`-r` 代表逆位）。可用的 id：`ace-wands`、`three-cups`、`knight-swords`、`ten-pentacles`、`lovers`、`star`、`magician`、`wheel`、`sun`

## 發佈到 GitHub Pages

1. 在 GitHub 建立 repo，把這個資料夾 push 到 `main`
2. repo 的 Settings → Pages → Source 選「Deploy from a branch」，Branch 選 `main`、資料夾 `/ (root)`
3. 約一分鐘後會出現在 `https://<帳號>.github.io/<repo>/`

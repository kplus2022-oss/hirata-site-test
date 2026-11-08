# Animation libraries

既存サイトで使用するバージョンを変更せず、外部CDNへの依存を減らすために同梱しています。各min.jsのライセンス表記はそのまま保持しています。

| File | Version | Original source |
|---|---|---|
| three-0.149.0.min.js | 0.149.0 | https://cdnjs.cloudflare.com/ajax/libs/three.js/0.149.0/three.min.js |
| gsap-3.12.5.min.js | 3.12.5 | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js |
| ScrollTrigger-3.12.5.min.js | 3.12.5 | https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js |
| lenis-1.1.14.min.js | 1.1.14 | https://cdn.jsdelivr.net/npm/lenis@1.1.14/dist/lenis.min.js |

2026-11-08に各ファイルのSHA-384がindex.htmlの既存SRI値と一致することを確認しました。バージョンを更新する場合は、ライブラリとSRIを同時に更新して、スクロール・停止／再開・幅変更・フォームを確認してください。

2026-11-08（Claude Code）：滑らかなスクロール用に Lenis 1.1.14 を追加。SHA-384 は旧版サイト（2026-10-04版）で使っていたSRI値 `sha384-O55L/6rhHr9CFvrxqv5luxOCcmVaBmETbZbJDP+Do8T0pztTACsFBD/IXCNkj7DV` と一致。three-0.149.0.min.js は現行ページでは読み込んでいません（粒子は retreat-particles.js の素のWebGLで描画）。

# 工作版專案管理工具：供後續討論

## 構想

以網頁呈現專案目標、待辦、里程碑與時間軸，並視需要讓客戶、供應商與同事查看或協作。工作版可參考私人版的專案、任務、日期、進度與週回顧概念，另行設計協作對象、交付、權限與對外視圖。

私人與工作資料維持分離。此文件是需求草案，不代表已決定部署方式、共享資料或實作。

## 三種可行方向

1. **GitHub Pages 展示原型**：程式碼放 GitHub，頁面顯示虛構資料，用於討論資訊架構與外觀。一般 Pages 內容可公開存取，不能因儲存庫設為私人就假定網站私人。
2. **GitHub Projects 作為協作工具**：使用 GitHub 的專案與協作者權限，適合願意使用 GitHub 帳號的團隊；外部人員的加入方式及可看到的底層資料仍須評估。
3. **自建工作版應用**：GitHub 管理程式碼，另用提供登入、後端與資料庫的服務；才能實作每個專案、角色及操作的授權與共享資料。依實際需求評估架構與費用。

GitHub Enterprise Cloud 的 Pages 有特定企業網站存取控制條件，應依帳戶與企業設定確認；不假設對所有客戶或供應商適用。

## 初步角色與視圖（待確認）

- 專案負責人：規劃里程碑、任務、時程及協作者。
- 內部同事：依授權更新負責任務及進度。
- 客戶：查看約定的交付成果、重要進度與時間軸；是否允許回覆或更新由專案決定。
- 供應商：查看及更新與自身有關的任務；是否可看到其他供應商資料需明確定義。

這些只是設計假設，不是已完成的權限功能。權限需在服務端執行，前端隱藏內容不等於資料受到保護。

## 待討論

1. 誰登入？是否接受 GitHub 帳號，或需要使用電子郵件等其他方式？
2. 哪些欄位可由客戶、供應商與同事分別查看或修改？不同客戶的資料如何隔離？
3. 工作資料的儲存位置、組織政策、費用預算、備份與刪除方式為何？
4. 需要即時多人協作、留言、通知和附件嗎？哪些是首版必要？
5. 是用單一真實專案進行需求訪談，還是先以虛構專案驗證？
6. 未來是否需要與 Notion 或既有工作系統交換資料？誰是每類資料的主要來源？

## 建議順序

先用虛構資料建立可點擊的工作版頁面，確認待辦與時間軸如何供不同角色閱讀；接著整理真實使用流程與權限矩陣，再比較 GitHub Projects 和具登入的自建應用。完成權限與分享設計後，才選擇正式承載方式及真實資料。

## 官方參考

- [GitHub Pages 網站建立與公開性](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
- [GitHub Projects 存取權限](https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-your-project/managing-access-to-your-projects)
- [GitHub Enterprise Cloud Pages 存取控制](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)

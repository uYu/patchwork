# 拼布艺术 · Patchwork Atelier

中文拼布艺术桌游。规则与界面分离，C++ 位棋盘和搜索通过 WebAssembly 在 Worker 中执行，不需要服务器或模型 API。

## 开始

需要 Node.js 22.13+：

```sh
npm ci
npm run dev
```

打开终端输出的本地地址（默认 `http://127.0.0.1:5173`）。

```sh
npm test                         # 规则、存档、完整对局、Wasm/TS 一致性
npm run test:native              # C++ AddressSanitizer + UndefinedBehaviorSanitizer
npm run build                    # TypeScript 检查和静态构建
npm run preview                  # 预览生产版本
npm run simulate -- 10 normal    # 与入门策略进行完整对局，轮换策略席位
npm run build:wasm               # 修改 C++ 或拼块数据后重建；需要 Emscripten
```

已生成的单文件 Wasm 模块纳入源码。普通开发、构建、部署不需要安装 Emscripten。其缓存目录不可写时，可设置 `EM_CACHE=/tmp/patchwork-em-cache`。

## 功能

- 中文菜单、规则、暂停、结果结算；单人对 AI 或双人同屏。
- 9 × 9 棋盘，33 块拼布，完整环形市场；前方三块可选。
- 旋转、翻转、悬停预览、点击定位和确认缝制。键盘可聚焦格子，以方向键移动、回车定位。
- 纽扣余额、收入、时间轨道、皮革领取、唯一 7 × 7 奖励和终局计分。
- 固定显示当前行动方；前进、购买拼布和领取 1 × 1 小补丁都有对应操作提示与确认按钮。
- 时间落后者行动，同格时刚移动者继续；一次越过多个皮革时逐块放置。
- 自动存档，JSON 导入/导出，通过种子及行动重放验证导入内容。损坏存档不覆盖当前进度。
- 回放支持播放、暂停、拖动进度；不调用 AI、不改写行动历史。打开规则或暂停时停止回放计时与 AI Worker。
- 响应式桌面/手机布局、原生模态框焦点约束；所有美术由本地 CSS/SVG 绘制，无外部资源请求。

新作品会覆盖浏览器的当前存档，菜单提供导出备份。自动保存失败时会显示提示。双人模式为同屏轮流操作，不提供在线联机。

## 规则与数据版本

`src/game/patches.json` 从原目录 `encode.py` 的 33 个 `encoder.add(...)` 调用提取，保留价格、时间、收入与形状，不混入新版重新平衡的拼块。形状生成时去除外围空白，修复旧版漏掉部分合法边缘落点的问题。

皮革轨道保留原实现使用的初版位置 `20, 26, 32, 44, 50`。收入点为 `5, 11, 17, 23, 29, 35, 41, 47, 53`，补齐原实现缺失的终点收入。新版轨道调整不属于本次迁移，出版社对此有[版本说明](https://www.lookout-spiele.de/en/games/patchwork.html)。完整流程见[官方规则](https://www.lookout-spiele.de/upload/en_patchwork.html_Rules_Patchwork_EN.pdf)。

双方均到达终点且待放皮革已处理后结算：纽扣余额减去空格数的两倍，加上 7 × 7 奖励。同分按先到终点者获胜。被子已满时，多余皮革丢弃，这是对规则书未明示极端状态的实现约定。

数据继承自原项目，未以实体拼块图片逐块重新校勘；本次测试保证迁移和规则计算一致，不表示对原始录入值完成了独立认证。

## AI

- **入门**：TypeScript 启发式，加入探索随机性。
- **熟练**：C++ 枚举完整合法落点，按面积、成本、剩余收入次数、时间、贴边贴块、孤立空格评分。
- **高级**：26,537 参数的连通落子排序模型（由原 47,117 参数模型裁去无效隐藏单元）为所有合法落点打分，每块拼布先选最多 12 个高分且不同的摆法，再做二至三步全局前瞻；每块最多保留 9 个落点进入 MCTS。模拟阶段考虑布局可填性和 7 × 7 目标，每步总预算约 5 秒。AI 的拼布落点必须与已有拼布边相接；玩家不受此限制。

高级档权重来自原项目 `learning/contact16k/models/16000` 的连通规则重训结果，来源及校验和见 `cpp/model/README.md`。浏览器使用单个 Wasm Worker。旧“研究版”存档导入或从本地恢复时会映射到“高级”，已记录的历史行动和分析保留。

C++ 使用 `unsigned __int128` 容纳 81 格，预生成全部旋转/翻转落点，以按位与判断冲突。位棋盘和紧凑状态用于搜索，TypeScript 保存彩色格子以供显示。两侧通过完整行动集及逐步状态差分测试核对，数据源只有一份。

## 结构

```text
src/game/patches.json      单一拼块数据源
src/game/data.ts           形状、变换、随机数、轨道
src/game/engine.ts         不可变规则引擎和合法行动验证
src/game/storage.ts        版本化存档、重放验证
src/game/ai.ts             入门策略
src/game/ai-wasm.ts        TS/C++ 状态编解码
src/game/ai.worker.ts      后台 AI 生命周期入口
src/game/wasm/             已生成 Wasm 和类型声明
src/components/           棋盘、拼布、规则、对话框
src/App.tsx               菜单、对局交互、回放和 Worker 取消
cpp/engine.hpp            C++ 位棋盘规则
cpp/search.hpp            估值与 MCTS
cpp/bridge.cpp            Wasm ABI
cpp/data.hpp              自动生成，请勿手改
scripts/generate-data.ts  从共享数据生成 C++ 表
```

修改数据后运行 `npm run build:wasm`，再运行测试和构建。旧存档依赖数据与规则；后续改变这些内容时需升级存档版本，避免静默重放成另一局。

## 部署

```sh
docker compose up --build
# http://localhost:8205
```

后台启动可加 `-d`；需要换端口时使用 `PATCHWORK_PORT=8300 docker compose up --build`。容器在构建时执行 `npm ci` 和前端构建，镜像用 Nginx 托管静态资源；仓库已包含生成好的 Wasm 模块，因此运行 Docker Compose 不需要 Emscripten。也可将 `dist/` 交给静态服务器。构建使用相对路径，支持子目录部署。没有 Service Worker，需要通过 HTTP 服务首次加载，不能双击 HTML 运行。

## 验证记录

见 [重构与验证记录](docs/REFACTOR.md)。

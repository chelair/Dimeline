# Dimeline · 时间线工作室

## 1.1：产品任务线与个人秘书

点击顶部「任务线与秘书」进入新工作区；「时间线」保留原有日期编辑和导出。两种视图使用同一批事件、同一份项目文件。产品项目名称仍在顶部项目设置中修改。

- **自由建线**：空白、测试报告、打样、资料评审归档四种起点。阶段可选TR3～TR6；支持主支线、展示挂接、最终节点。模板可改，不强制标准流程。原有时间线事件可在任务区接入。
- **任务条件**：强/弱依赖、评审通过、预约确认、物料齐套；业务依赖不自动移动日期。节点详情填写进度、剩余工作、卡点、截止、工时、组织、单次窗口、每周会议、数量和材料版本。
- **测试NG**：创建定位→整改→回归→报告更新，支持同一测试多个独立问题及失败后新轮次。明确受影响节点；未关闭异常阻塞这些节点。关闭前要求末轮回归通过、本轮任务完成。
- **口述整理**：先选节点再说「写了一大半，还剩结论，卡在评审」，可记录粗估进度与剩余工作；不推断评审通过或改变截止。复杂三段报告支持工艺规程汇报/纪要、振动NG回归后检查、打样物料协调的有限规则提取，未知项保留。其他表达不保证识别，可记备注或待解决事项。
- **写操作**：明确进展可自动记录（可关闭）；状态、新任务和单点日期先预览；依赖、通过/归档结果及NG关闭二次确认。草案和原话随项目保存；计划变化后旧草案拒绝执行。
- **今日安排**：根据人工优先级、截止、窗口、下游影响和已填工时反向倒排。未知后继工时不承诺可延期；这是按每日容量的自然日粗排，未接入节假日、外部实时资源和全局日历优化。
- **经验与审计**：延期生成待验证经验；确认后按关键词检索用于口述提示。审计只保存有变化对象的前后值，最近无冲突操作可在重开后撤销；不覆盖后续修改，不撤销现实中的外部提交。
- **待解决事项**：记录不能解析、接口不支持或需要改进的需求，可查看并导出文字说明。导出包含用户原话和项目/节点名称，分享前自行脱敏，不自动附带项目文件或密钥。

日常用法：建立产品项目→自由建线/接入原事件→打开今日安排→下班口述进展→预览确认→保存。口述草稿也随项目保存；尚未确认的节点表单需先点「预览节点变更」。

### 内部API

「秘书→设置」填写完整请求URL、内部模型标识、可选密钥。仅支持请求体为`model/messages/stream`、响应为`choices[0].message.content`的聊天接口；不根据“DeepSeek V4”名称猜测地址或认证。不支持的接口可导出需求后再适配。

只有点击「内部API整理」才发送当前输入、节点上下文和少量已确认经验。密钥在Electron主进程用系统凭据加密，仅本机保存，不进入项目文件或前端。模型只允许提出已有节点的进度、剩余工作、卡点、执行状态和截止更新，全部需预览；不直接修改依赖、评审结论或归档。没有API时本地规则可正常使用。

本阶段没有向量检索、自动训练、任意自然语言全图编辑或外部系统代提交；不宣称已验证公司内部API。新增文件格式为schemaVersion 2，仍可读取旧文件；新文件请用新版打开。

面向 Windows 的本地桌面时间线排期工具。Electron + React 18 + TypeScript + Vite + Zustand，SVG 编辑画布，项目以 JSON 文件保存，不需要账号或服务器。

## 直接使用

构建好的安装包位于 `release/Dimeline-1.1.0-Setup.exe`；免安装运行目录位于 `release/win-unpacked/`，启动其中的 `Dimeline.exe`。整个免安装目录必须保持完整，不能只复制一个 exe。

1. 通过顶部项目名称或「项目设置」填写名称和起止日期。
2. 点击「新建事件」，在右侧填写标题、日期和样式。属性字段在失焦或 Enter 时提交；未提交的文字也受到关闭保护。
3. 左键拖动主线上的日期锚点调整日期；Alt + 左键或右键拖动文本框只改变位置。双击文本框可以直接编辑标题。
4. 选中后继事件，在「依赖关系」选择前置事件与最小间隔。需要调整现有日期时，先审阅预览并点击「应用调整」。
5. 自动整理可重新排列未锁定的框体；布局锁定会捕获当前实际位置。编辑锁定同时阻止日期变化。
6. 使用「文件 → 保存/另存为」保存项目。「导出 → 完整时间线」生成默认 2 倍分辨率 PNG；也可以导出当前视口。

新项目为空，日期范围从本机当前日期开始，默认覆盖 180 天。正式应用不预置测试项目。

## 开发与构建

推荐 Node.js 24 LTS、npm 11，Windows 10/11 x64。依赖使用确切版本与 `package-lock.json`。

```powershell
npm ci
npm run dev
```

`npm ci` 后会检查 Electron 运行时。若官方运行时下载不可用，会尝试 npmmirror，并继续使用 Electron 包自带的 SHA256 校验。如果本机阻止了安装脚本，执行 `npm run setup:desktop`。可通过 `ELECTRON_MIRROR` 明确指定其他可信镜像。

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm start
npm run test:e2e
npm run package:win
```

- `dev`：构建主进程并启动 Vite 和 Electron；主进程/preload 修改后需重启，React 支持热更新。
- `dev:web`：仅前端调试预览；本地文件能力需要 Electron 窗口。
- `test`：Vitest 核心和 React Testing Library 组件测试。
- `test:e2e`：生产构建后执行真实 Electron 流程；如果打包目录存在，还会验证实际打包程序。
- 端到端测试还会启动 Vite 开发窗口，需要本机 5173 端口空闲；文件对话框由测试提供路径，文件读写与窗口关闭逻辑均真实执行。
- `build`：类型检查、前端生产构建、隔离主进程/preload 构建。
- `package:win`：生成 Windows x64 NSIS 安装包。
- `package:dir`：仅生成 Windows x64 免安装目录。

打包缓存默认位于项目 `.cache/electron-builder`，避免用户目录重定向导致跨盘重命名失败。打包复用已安装的 Electron 二进制。如果 GitHub 的打包工具下载受阻：

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
npm run package:win
```

应用和安装包未配置商业代码签名证书。发布时可按 electron-builder 的签名配置接入证书；本工程不包含证书或私钥。

## 核心结构

```text
electron/
  main.ts                      安全窗口、业务 IPC、原生文件对话框、关闭保护
  preload.ts                   明确、有限的 contextBridge 接口
  services/fileService.ts      校验、大小限制、临时文件 + fsync + 原子替换
  services/recentFilesService.ts 最近文件设置服务
src/
  domain/                      统一类型、四级预设、默认项目
  engine/dateEngine.ts         严格 date-only 校验、UTC 日历日、刻度
  engine/coordinateEngine.ts   日期 ↔ 世界 ↔ 视口、锚点缩放
  engine/constraintEngine.ts   DAG、拓扑排序、前后向传播、锁定冲突回滚
  engine/textEngine.ts         中文换行、实际字体测量、自动/手动尺寸
  engine/layoutEngine.ts       确定性有限布局、锁定优先、碰撞诊断
  engine/routingEngine.ts      正交路径候选、障碍评分、端点定位
  store/editorStore.ts         项目、界面、事务历史、保存基线、表单草稿保护
  services/serialization.ts    JSON 验证、版本、旧字段迁移和诊断
  services/desktopService.ts   文件操作编排、保存串行化、替换项目保护
  services/exportService.ts    独立纯 SVG 导出场景与 PNG 编码
  components/timeline/        画布、节点、刻度、依赖线、拖拽计算
  components/panels/          事件/项目属性、依赖预览、最近文件
  hooks/                      输入焦点快捷键保护、草稿保护
tests/                        核心、组件、文件失败测试
tests/e2e/                    真实桌面工作流、打包程序验证
artifacts/                    验证截图、导出 PNG、性能记录
```

持久化项目和界面状态分开；选择、缩放、滚动、面板与主题不改变保存基线。历史上限 100 步。拖拽预览不写历史，释放时作为一个事务提交，Escape 整次回滚，日期关联传播与原事件一次撤销。

布局和正交路由是派生结果；自动布局不会在渲染过程中回写项目。手动偏移持久保存。所有日期锚点只使用同一套世界坐标；滚动只在视口层出现，缩放会考虑边距和手动位置产生的左侧留白。

约束默认单向传播：向未来移动仅推动必要后继，向过去移动仅推动必要前驱。锁定冲突或超出项目日期范围会拒绝整次操作。先扩展项目范围后可重新执行。布局锁定不会锁定日期。

## 文件格式与迁移

`.json` 与 `.dimeline` 均使用以下 JSON 结构：

```json
{
  "schemaVersion": 1,
  "project": {
    "id": "项目唯一标识",
    "title": "项目名称",
    "startDate": "2026-01-01",
    "endDate": "2026-12-31",
    "mainLine": { "color": "#C7000B", "width": 3 },
    "milestones": [],
    "links": []
  },
  "metadata": { "application": "Dimeline", "appVersion": "1.0.0" }
}
```

日期严格使用 `YYYY-MM-DD`。文档版本与软件版本独立。文件不包含撤销历史、选择状态、临时路径或主题。

支持无版本的直接 Project 对象、`project`/`Project` 包装、旧 `predecessors`、`manualOffsetX/Y`、`boxFillEnabled` 等字段。显式 Link 间隔优先，重复关系去重。旧 `bendPoint` 不再作为渲染输入，迁移为确定性正交路由并显示诊断；人工框体偏移保留。可修复问题会提供诊断，非法日期、重复事件标识、无法解析或未来版本文件会拒绝加载并保留当前项目。

保存路径只能来源于原生对话框或最近文件授权路径。渲染进程无 Node 文件访问能力。窗口启用 sandbox、contextIsolation、禁用 nodeIntegration、限制导航和权限；IPC 验证发送者与主 frame。主进程写入前再次验证项目。

## 快捷键

| 操作                   | 快捷键                         |
| ---------------------- | ------------------------------ |
| 保存 / 另存为          | Ctrl+S / Ctrl+Shift+S          |
| 新建 / 打开项目        | Ctrl+N / Ctrl+O                |
| 撤销 / 重做            | Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z |
| 复制事件               | Ctrl+D                         |
| 删除选中事件           | Delete / Backspace             |
| 取消拖拽或选中         | Escape                         |
| 平移                   | 空格 + 左键拖动；或中键拖动    |
| 缩放 / 水平滚动        | Ctrl+滚轮 / Shift+滚轮         |
| 文本框移动             | Alt+左键拖动 / 右键拖动        |
| 直接编辑标题           | 双击文本框                     |
| 编辑提交 / 换行 / 取消 | Enter / Shift+Enter / Escape   |

输入框、日期控件、下拉框、文本编辑器和输入法组合输入时不触发画布快捷键。输入过程中可以点击工具栏保存。

## 验证与边界

详见 `artifacts/VERIFICATION.md`，其中只记录实际执行过的检查。

- 极端密集图中的正交线交叉不能保证完全消除；手动/锁定的重叠位置会保留并提示。可以自动整理或手动调整。
- 锁定位置相对日期锚点和主线保存，因此改变日期、缩放或画布尺寸后，屏幕像素位置会随时间轴坐标变换。
- 手动尺寸会严格遵守设置，过小框体可能裁剪文字；开启「自动尺寸」可避免正文溢出。
- PNG 使用系统安装字体；不同机器的字体回退可能不同。导出有最大 1 亿像素、单边 32767 像素的保护，超大图可使用较低倍率或当前视口导出。
- 文件最大 10 MB，最多 5000 事件 / 20000 关联属于输入保护；已测试交互规模为 100 和 200 事件，不承诺 5000 节点的实时性能。
- 已执行输入法 composition 事件测试，未逐一人工验证所有第三方输入法。
- 当前验证平台为 Windows x64；尚未验证 macOS/Linux 安装包。无云同步、自动恢复和多人协作。
- JSON 项目通过应用内「打开」加载；当前不注册系统文件关联。
- 未提供原软件的真实项目文件；迁移已按规格字段与测试样例验证，其他旧格式可能需要补充映射。

实现遵循 [Electron 安全建议](https://www.electronjs.org/docs/latest/tutorial/security/) 与 [上下文隔离说明](https://www.electronjs.org/docs/latest/tutorial/context-isolation)，构建配置参照 [electron-builder Windows 文档](https://www.electron.build/v26/docs/win/)。

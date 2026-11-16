# dsh-subagent-route-args

[English](README.md) | 中文

[![CI](https://github.com/GV-megumi/dsh-subagent-route-args/actions/workflows/ci.yml/badge.svg)](https://github.com/GV-megumi/dsh-subagent-route-args/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> 修复模型把可选的路由参数填成 `""` 时触发的 `Error: child LLM \`provider\` must be non-empty`。

DeepSeek Harness 的 `subagent` 与 `list_subagent_models` 工具里，`provider`、`model`、
`reasoning_effort` 都是**可选**参数——不传就表示"沿用默认路由"。但不少模型会回
`"provider": ""`（或纯空白）来表达"这里没有值"，0.2.2 的严格校验直接判它非法。

## 问题现象

`list_subagent_models(provider: "")` 不返回模型列表，而是报错：

```
Error: child LLM `provider` must be non-empty
Error: `provider` must be non-empty
Error: `model` must be non-empty
```

创建子智能体也是一样：模型只要顺手补了空串，整个工具调用就失败，还白白浪费一轮。

## 这个插件做什么

它挂在 Cordis 的 `tools/execute` 流水线上，只对上面两个工具、只对三个路由字段，
把空字符串或纯空白视为"未提供"删除掉。真实值以及所有严格校验保持原样：

| 模型传入 | 插件处理后 | 结果 |
| --- | --- | --- |
| `provider:"" model:"" reasoning_effort:""` | 三个字段都被删除 | 走默认路由，不再报错 |
| `provider:"" model:"gpt-6-astra"` | 保留 `model:"gpt-6-astra"` | 上游照常报“只给 model 缺 provider” |
| `provider:"codex" model:"gpt-6-astra" effort:""` | 删除空 effort | 真实路由仍要过白名单校验 |
| 其他工具、或参数不是对象 | 完全不动 | 不变 |

它**不放松校验**：未知路由、选择被禁用、provider/model 只给一半，依旧按原逻辑报错。
也**不会**顺手剥掉其他字段的空串——比如 `write` 的 `content: ""` 仍然是"清空文件"的语义。

## 安装

### 前置条件

- DeepSeek Harness 0.2.2+（支持 Cordis bundle 的 desktop 或 web profile）
- Node.js 20+ 仅用于跑测试；DSH 自带运行时

### 1) 放到 profile 能解析的位置

Windows（PowerShell）：

```powershell
$Target = Join-Path $env:USERPROFILE '.dsh\custom-bundles\dsh-subagent-route-args'
git clone https://github.com/GV-megumi/dsh-subagent-route-args.git $Target
```

macOS / Linux：

```bash
git clone https://github.com/GV-megumi/dsh-subagent-route-args.git ~/.dsh/custom-bundles/dsh-subagent-route-args
```

### 2) 链接进活动 profile

profile 会从 `<profile>/node_modules` 解析 bundle 包。

Windows（Junction，不需要管理员权限）：

```powershell
$ProfileDir = Join-Path $env:USERPROFILE '.dsh\profiles\desktop'
New-Item -ItemType Junction `
  -Path (Join-Path $ProfileDir 'node_modules\dsh-subagent-route-args') `
  -Target $Target
```

macOS / Linux：

```bash
ln -s ~/.dsh/custom-bundles/dsh-subagent-route-args \
      ~/.dsh/profiles/desktop/node_modules/dsh-subagent-route-args
```

### 3) 在 profile 清单里登记

编辑 `<profile>/package.json`，同时写依赖和 bundle：

```json
{
  "dependencies": {
    "dsh-subagent-route-args": "link:/absolute/path/to/dsh-subagent-route-args"
  },
  "dsh": {
    "profile": {
      "bundles": ["dsh-subagent-route-args"]
    }
  }
}
```

bundles 里放在已有条目旁边即可，顺序无所谓。**不要**把 `cordis.patch.yml` 里的
`insert:` 块复制进 profile 自己的 `cordis.patch.yml`：bundle patch 会自动应用，
重复的行 id 会让设置页无法保存。

### 4) 完全重启 DSH

退出桌面端进程（不是只关窗口）再启动——bundle 在启动时加载。

### 验证

让智能体调用 `list_subagent_models`，三个字段都传空串：
`provider: "", model: "", reasoning_effort: ""`。

装之前会显示红色的 `must be non-empty`，装之后正常返回路由列表。

### 卸载

从 `dsh.profile.bundles` 删掉条目、从 `dependencies` 删掉依赖、删除 junction/符号链接，
然后重启。

## 工作原理

- `tools/execute` 是包在工具执行体外层的 Cordis 瀑布；监听者拿到 `(exec, next)`，
  在真正派发前可以改执行记录。
- DSH 会把参数快照深冻结，但执行记录本身是普通对象，所以插件用一份冻结的归一化副本
  替换 `exec.arguments`，再调用 `next()`。
- 没有变化时完全不改，因此真实参数保持对象身份。
- 只影响两个工具、三个字段；没有配置项、没有依赖、不改运行时文件。

## 兼容性

- 已在 DSH 0.2.2-rc.2 / 0.2.2-rc.3（desktop，Windows）实测。凡是发出
  `tools/execute` 的 0.2.x 版本都应适用。
- 清单里**故意不写** `engines.dsh`，也不写 `peerDependencies`：DSH 的兼容性预检只会在
  声明了却满足不了时禁用插件，省略就能跨 0.2.x 加载。若写死版本范围，一旦范围不匹配
  插件会被直接禁用。
- 桌面版现在打成单个 `app.asar`，改安装目录里的文件既脆弱又会被每次升级覆盖；本插件
  留在 profile 里，升级不受影响。

## 排错

| 现象 | 检查 |
| --- | --- |
| 重启后还是报错 | bundle 名是否在 `dsh.profile.bundles` 里？`<profile>/node_modules/dsh-subagent-route-args` 是否存在且可解析？ |
| 装完 DSH 起不来 | 删掉 bundles 条目与依赖再重启，然后把启动报错贴到 issue |
| 设置页保存不了 | 是不是把 `insert:` 块误抄进了 profile 的 `cordis.patch.yml`？删掉它 |

## 开发

```bash
npm test        # node --test，零依赖
npm run lint    # node --check lib/index.js
```

目录结构：

| 路径 | 作用 |
| --- | --- |
| `lib/index.js` | 插件入口（`name` + `apply`） |
| `cordis.patch.yml` | 把插件行插入 profile 的 bundle patch |
| `test/index.test.js` | `node:test` 用例，含迷你 `tools/execute` 瀑布 |

欢迎贡献，见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可

[MIT](LICENSE)

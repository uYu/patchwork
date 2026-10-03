# 拼布策略价值网络与自我对弈实验

这是独立研究入口，未替换高级难度、7×7 实验难度或正式权重。采用策略/价值网络、PUCT、完整对局自我对弈、访问分布策略训练和候选模型换边评估。它不是 DeepMind 权重移植，也还没有证明棋力提升。

## 实现

- `cpp/alphazero-engine.cpp`：直接复用现有 C++ 规则的 ctypes ABI；另提供原高级搜索供评估。跨语言结构大小、完整合法行动、非法行动拒绝均有检查。
- `scripts/alphazero/network.py`：默认 32 通道、3 个残差块，GroupNorm；市场用共享真实形状/属性编码与小型 Transformer；策略/价值共享 128 维局面表示。
- 局面输入：双方 9×9 棋盘、19 个经济/轨道/奖励标量、全部剩余拼布的规范形状与真实成本/时间/收入/面积，以及相对当前市场指针的位置。ID 只查找游戏数据，没有 ID 学习通道。
- 策略输出：一次局面编码后，共享行动头对全部合法行动打分。行动特征包含实际方向的形状、覆盖区域与邻域棋盘特征、实际属性和位置；前进、皮革也是独立行动。非法行动没有输出槽，softmax 仅在当前合法集合上进行。
- 价值输出：当前行动玩家最终胜负的 `[-1,1]` 估计。终局按真实同分规则确定赢家；连续行动回传按玩家身份转换符号，不按树深度交替取反。
- 搜索：PUCT，所有合法行动保留；叶节点由网络价值评价，不调用旧启发式模拟。采集加根节点 Dirichlet 噪声、前 12 手温度 1；评估关闭噪声并选访问最多的行动。
- 训练：访问次数归一化为策略标签，最终胜负为价值标签，损失为策略交叉熵＋价值 MSE；AdamW、D4 增广、梯度裁剪。

默认遵循全部游戏合法行动，不使用旧 AI 的拼布相接限制。`--contact-rule` 可在独立实验中启用该旧限制。原高级搜索自身仍采用相接规则，评估文件明确记录这一差别。

## 数据与选模

只提交完整终局对局，逐步重放核验状态、行动顺序哈希、访问次数和最终胜负。每批采集时每五局中的第一局固定为验证，其余为训练；两局烟雾测试是一局训练、一局验证。划分随完整开局保留，在后续回放轮次中不会重新分配。默认保留最近 3 轮回放。

每轮按验证联合损失选 checkpoint，再与本轮开始时的模型做配对换边评估，默认 10 个开局、20 局、固定模拟次数。达到内部门槛才成为下一轮采集模型。这个门槛只控制研究闭环；正式替换仍需对高级做独立的 5 秒换边对战。

旧 48,000 组排序数据未混入，因为没有完整搜索访问分布。当前从随机初始化出发。后续可另做旧数据预热实验。

## 环境与测试

```sh
python3 -m venv --system-site-packages .build/alphazero-venv
.build/alphazero-venv/bin/python -m pip install -r scripts/alphazero/requirements.txt
PYTHONDONTWRITEBYTECODE=1 .build/alphazero-venv/bin/python tests/alphazero.py
```

测试覆盖所有合法行动进入 PUCT、连续行动回传、终局同分、非法行动拒绝、D4 合法落点映射、空市场屏蔽、批量推理一致性、梯度与学习、checkpoint 一致性、完整对局重放和跨轮稳定划分。

## 小规模闭环与 SwanLab

```sh
caffeinate -i .build/alphazero-venv/bin/python scripts/run-alphazero.py \
  --output .build/alphazero-small \
  --rounds 2 --games 2 --simulations 4 --epochs 1 --batch-size 4 \
  --arena-pairs 1 --arena-simulations 4 \
  --swanlab online --project patchwork-alphazero --key-prompt
```

`caffeinate -i` 只在该进程存活时防止空闲休眠，Linux 可去掉。API Key 通过无回显提示或外部 `SWANLAB_API_KEY` 提供，不保存、不加入 config、代码快照或命令行参数。默认创建私有项目；已有项目沿用服务端可见性设置。

SwanLab 记录超参数、架构/引擎版本、采集进度、对局分数、训练/验证损失、策略熵、前 4 行动覆盖的搜索访问概率、内部评估胜负与门槛结果。这里的前 4 访问质量指标不是旧排序实验的“保住真实强着”指标。还上传明确列出的研究代码文本快照，本地保存同一快照 ZIP 与 SHA256 清单。在线认证或同步失败会显式失败，不静默改成离线成功。

- `status.json`：当前阶段、采集进度、训练验证指标、实时内部胜负。
- `metrics.jsonl`：本地指标备份。
- `swanlab.json`：云端实验链接。
- `round-*/games/*.json`：完整对局回放。
- `round-*/training.json`、`arena-games.json`、`report.json`：每轮训练和内部评估。
- `round-*/candidate.pt`：验证选出的候选。
- `latest.pt`：通过内部门槛后的研究模型；未通过时仍为上一模型。
- `source.zip`、`source-manifest.json`：明确代码快照，不含凭证。

正式采集时可增大 games/simulations。默认配置是 3 轮、每轮 32 局、每步 64 次模拟；这些是起步参数，未做预算或棋力优化。使用新的 output 目录，已有目录拒绝覆盖。`--checkpoint` 可在新实验中从模型权重热启动；它不会恢复 Adam 状态或旧回放，因此不是精确中断续训。

## 与高级对战

```sh
caffeinate -i .build/alphazero-venv/bin/python scripts/arena-alphazero.py \
  .build/alphazero-small/latest.pt \
  --baseline advanced --pairs 10 --budget-ms 1000 \
  --output .build/alphazero-vs-advanced-1s20
```

`--baseline checkpoint --baseline-model PATH` 可比较两个新模型。噪声关闭，配对开局换边，实时胜负写入 arena 的 `status.json`。时间预算包括完整根节点推理；单次网络评价不能中途打断，因此必须实测超时和推理开销。当前自我对弈搜索逐叶评价，尚未实现多个采集进程间的共享批量推理；训练已支持批量局面和可变长度行动集合。

小规模闭环和极短预算的高级 ABI 测试仅验证工程正确性，不能作为棋力结论，也未启动大规模训练。

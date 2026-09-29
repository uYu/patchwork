export function Rules() {
  return (
    <div className="rules">
      <p>
        用纽扣购买拼布，把它们缝进自己的 9 × 9
        被子。时间先走完不一定赢，留下更少空格才是关键。
      </p>
      <ol>
        <li>
          <strong>谁行动？</strong>
          时间落后的一方行动；重叠时，刚走到该格的一方在上方，继续行动。
        </li>
        <li>
          <strong>购买拼布：</strong>
          从标记前方三块中选一块，支付纽扣，旋转或翻转后放进被子，再前进对应时间。拼布不得重叠或越界。
        </li>
        <li>
          <strong>前进赚纽扣：</strong>
          走到对手前一格，每实际走一格获得一枚纽扣。终点为 53。
        </li>
        <li>
          <strong>收入：</strong>到达或跨过 5、11、17、23、29、35、41、47、53
          时，按被子上的总收入领取纽扣，刚买的拼布也计算。
        </li>
        <li>
          <strong>皮革：</strong>最先到达或跨过 20、26、32、44、50 的玩家领取 1
          × 1 皮革。一次跨过多块时逐块放置；被子满时丢弃余下皮革。
        </li>
        <li>
          <strong>7 × 7 奖励：</strong>首个填满任意 7 × 7 正方形的人获得唯一的 7
          分奖励。
        </li>
        <li>
          <strong>结算：</strong>双方都到达终点后，得分 = 纽扣余额 − 空格数 × 2
          + 奖励。同分时，先到终点者获胜。
        </li>
      </ol>
      <p className="muted">
        本项目沿用原目录的初版拼布数据及皮革轨道（2017
        年调整前）。不包含新版重新平衡的拼块。
      </p>
      <a
        href="https://www.lookout-spiele.de/upload/en_patchwork.html_Rules_Patchwork_EN.pdf"
        target="_blank"
        rel="noreferrer"
      >
        查看出版社规则 ↗
      </a>
    </div>
  );
}

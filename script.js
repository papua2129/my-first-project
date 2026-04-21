const phases = [
  {
    key: "default",
    from: null,
    to: "12:24",
    label: "通常モード",
    message: "今日の給食も、感謝しておいしくいただこう！",
    theme: "theme-default",
  },
  {
    key: "prep",
    from: "12:25",
    to: "12:44",
    label: "声かけタイム",
    message: "そろそろ『いただきました』の時間だよ。あと少し、いいペースでいこう！",
    theme: "theme-prep",
  },
  {
    key: "hurry",
    from: "12:45",
    to: "12:45",
    label: "あと5分",
    message: "あと5分です。食べ終わってない人は急ぎましょう。がんばれ、きっと間に合う！",
    theme: "theme-hurry",
  },
  {
    key: "final",
    from: "12:46",
    to: "12:46",
    label: "ラスト1分",
    message: "そろそろ食べ終わったかな？最後までしっかり、かっこよくしめよう！",
    theme: "theme-final",
  },
  {
    key: "mmt",
    from: "12:47",
    to: null,
    label: "【MMT】",
    message: "【MMT】もぐもぐミッションタイム！先生も応援中、みんなで達成しよう！",
    theme: "theme-mmt",
  },
];

const body = document.body;
const timeElement = document.getElementById("current-time");
const phaseElement = document.getElementById("phase-label");
const messageElement = document.getElementById("message");

function toMinutes(time) {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function getCurrentPhase(now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return (
    phases.find((phase) => {
      const from = toMinutes(phase.from);
      const to = toMinutes(phase.to);
      const afterStart = from === null || currentMinutes >= from;
      const beforeEnd = to === null || currentMinutes <= to;
      return afterStart && beforeEnd;
    }) || phases[0]
  );
}

function render() {
  const now = new Date();
  const currentPhase = getCurrentPhase(now);

  timeElement.textContent = now.toLocaleTimeString("ja-JP", {
    hour12: false,
  });
  phaseElement.textContent = currentPhase.label;
  messageElement.textContent = currentPhase.message;

  body.className = currentPhase.theme;
}

render();
setInterval(render, 1000);

// 客人：全部用 Canvas 即時繪製，跟盤面水晶同一種風格（粗輪廓、大眼睛）
// 遊戲 HUD 的頭像與 demo/customers.html 試作頁共用這份
// 單位座標：角色大約落在 x -1.1～1.1、y -1.2～1.1 之間，畫的時候再依畫布大小縮放
const TAU = Math.PI * 2;
const INK = '#2b1b2e';

// ---------- 共用小工具 ----------

function ell(g, x, y, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(x, y, rx, ry, rot, 0, TAU);
}

// 填色再描粗輪廓
function blob(g, fill, lw = 0.045, stroke = INK) {
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = lw;
  g.strokeStyle = stroke;
  g.lineJoin = 'round';
  g.stroke();
}

function line(g, pts, lw = 0.04, color = INK) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.lineWidth = lw;
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.stroke();
}

// 大眼睛：眼白 + 會看的瞳孔 + 反光；lid 是上眼皮蓋住的比例
function eye(g, x, y, r, { lid = 0, wide = 1, look = [0, 0], lidColor = '#fff', pupil = INK } = {}) {
  const ry = r * 1.12 * wide;
  ell(g, x, y, r, ry);
  g.fillStyle = '#fff';
  g.fill();
  g.save();
  g.clip();
  const px = x + look[0] * r * 0.35;
  const py = y + look[1] * r * 0.3;
  ell(g, px, py + r * 0.08, r * 0.64, r * 0.76);
  g.fillStyle = pupil;
  g.fill();
  g.fillStyle = '#fff';
  ell(g, px - r * 0.24, py - r * 0.26, r * 0.26, r * 0.26);
  g.fill();
  ell(g, px + r * 0.22, py + r * 0.3, r * 0.11, r * 0.11);
  g.fill();
  if (lid > 0) {
    g.fillStyle = lidColor;
    g.fillRect(x - r * 1.2, y - ry * 1.1, r * 2.4, ry * 2 * lid + ry * 0.1);
    line(g, [
      [x - r * 1.1, y - ry + ry * 2 * lid],
      [x + r * 1.1, y - ry + ry * 2 * lid],
    ], 0.03);
  }
  g.restore();
  ell(g, x, y, r, ry);
  g.lineWidth = 0.03;
  g.strokeStyle = INK;
  g.stroke();
}

// 閉眼：down = 睡著的弧線（∪），up = 笑瞇瞇（∩）
function closedEye(g, x, y, r, up = false) {
  g.beginPath();
  g.moveTo(x - r, y);
  g.quadraticCurveTo(x, y + (up ? -r : r) * 0.9, x + r, y);
  g.lineWidth = 0.045;
  g.strokeStyle = INK;
  g.lineCap = 'round';
  g.stroke();
}

function blush(g, x, y, w) {
  ell(g, x, y, w, w * 0.55);
  g.fillStyle = 'rgba(255,120,170,0.45)';
  g.fill();
}

// ---------- 氣氛特效 ----------

function sweat(g, x, y, t) {
  const k = (t * 0.8) % 1;
  g.save();
  g.translate(x, y + k * 0.15);
  g.globalAlpha = 1 - k * 0.6;
  g.beginPath();
  g.moveTo(0, -0.1);
  g.quadraticCurveTo(0.07, 0.02, 0, 0.06);
  g.quadraticCurveTo(-0.07, 0.02, 0, -0.1);
  blob(g, '#9fd8ff', 0.025);
  g.restore();
}

function exclaim(g, x, y, t) {
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 12) * 0.12);
  g.fillStyle = '#ffd36e';
  g.strokeStyle = INK;
  g.lineWidth = 0.035;
  g.beginPath();
  g.moveTo(-0.05, -0.22);
  g.lineTo(0.05, -0.22);
  g.lineTo(0.025, 0.04);
  g.lineTo(-0.025, 0.04);
  g.closePath();
  g.fill();
  g.stroke();
  ell(g, 0, 0.12, 0.045, 0.045);
  g.fill();
  g.stroke();
  g.restore();
}

function sparkles(g, t, color = '#fff6c8', spots = [[-0.8, -0.6], [0.85, -0.4], [-0.7, 0.3], [0.75, 0.45]]) {
  spots.forEach(([x, y], i) => {
    const k = Math.max(0, Math.sin(t * 3 + i * 1.7));
    const r = 0.09 * k;
    g.save();
    g.translate(x, y);
    g.rotate(t + i);
    g.fillStyle = color;
    g.beginPath();
    for (let j = 0; j < 8; j++) {
      const rr = j % 2 ? r * 0.25 : r;
      const a = (j / 8) * TAU;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath();
    g.fill();
    g.restore();
  });
}

function hearts(g, t) {
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.5 + i / 3) % 1;
    const x = -0.6 + i * 0.6 + Math.sin(t * 2 + i) * 0.08;
    const y = -0.5 - k * 0.6;
    g.save();
    g.translate(x, y);
    g.scale(0.9 + k * 0.3, 0.9 + k * 0.3);
    g.globalAlpha = Math.sin(k * Math.PI);
    g.beginPath();
    g.moveTo(0, 0.06);
    g.bezierCurveTo(-0.14, -0.04, -0.07, -0.15, 0, -0.07);
    g.bezierCurveTo(0.07, -0.15, 0.14, -0.04, 0, 0.06);
    blob(g, '#ff7fa8', 0.02);
    g.restore();
  }
}

function zzz(g, x, y, t, color = '#d9e4ff') {
  for (let i = 0; i < 3; i++) {
    const k = (t * 0.45 + i / 3) % 1;
    g.save();
    g.globalAlpha = Math.sin(k * Math.PI);
    g.fillStyle = color;
    g.strokeStyle = INK;
    g.lineWidth = 0.02;
    g.font = `700 ${0.14 + k * 0.14}px Fredoka, system-ui, sans-serif`;
    g.fillText('z', x + k * 0.35, y - k * 0.5);
    g.strokeText('z', x + k * 0.35, y - k * 0.5);
    g.restore();
  }
}

// 生氣的十字青筋
function angerMark(g, x, y, t) {
  const s = 1 + Math.sin(t * 8) * 0.1;
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  for (let i = 0; i < 4; i++) {
    g.rotate(TAU / 4);
    line(g, [
      [0.03, 0.03],
      [0.09, 0.03],
      [0.03, 0.09],
    ], 0.035, '#ff4d6d');
  }
  g.restore();
}

// ---------- Boss：失眠的貓頭鷹 ----------

function drawOwl(g, t, mood) {
  const cured = mood === 'satisfied';
  const skill = mood === 'skill';
  const surprised = mood === 'surprised';
  const annoyed = mood === 'annoyed';
  // 平常會不定時打哈欠
  const yawnPhase = (t % 7) / 7;
  const yawn = mood === 'idle' && yawnPhase > 0.8 ? Math.sin(((yawnPhase - 0.8) / 0.2) * Math.PI) : 0;

  if (skill) {
    const r = 1.15 + Math.sin(t * 4) * 0.06;
    const aura = g.createRadialGradient(0, 0.05, 0.2, 0, 0.05, r);
    aura.addColorStop(0, 'rgba(192,139,255,0.55)');
    aura.addColorStop(1, 'rgba(192,139,255,0)');
    g.fillStyle = aura;
    g.fillRect(-1.3, -1.3, 2.6, 2.6);
  }

  g.save();
  g.translate(0, Math.sin(t * 1.6) * 0.025 + (cured ? 0.04 : 0));
  g.rotate(cured ? Math.sin(t * 0.9) * 0.07 : Math.sin(t * 0.8) * 0.03);
  const puff = surprised ? 1.07 : 1;
  g.scale(puff, puff);

  // 翅膀
  const flap = skill ? 0.6 + Math.sin(t * 9) * 0.25 : surprised ? 0.5 : 0.06 + Math.sin(t * 1.6) * 0.04;
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 0.46, 0.1);
    g.rotate(s * flap);
    ell(g, s * 0.1, 0.3, 0.2, 0.42, s * 0.15);
    blob(g, '#5b3f86');
    for (const k of [0.2, 0.36, 0.52]) {
      line(g, [
        [s * 0.0, k],
        [s * 0.12, k + 0.06],
        [s * 0.22, k - 0.02],
      ], 0.022, 'rgba(43,27,46,0.55)');
    }
    g.restore();
  }

  // 身體
  ell(g, 0, 0.18, 0.62, 0.74);
  const bodyFill = g.createLinearGradient(0, -0.6, 0, 0.9);
  bodyFill.addColorStop(0, '#9a7ac2');
  bodyFill.addColorStop(1, '#55397a');
  blob(g, bodyFill);
  // 肚子與羽毛紋
  ell(g, 0, 0.44, 0.36, 0.37);
  blob(g, '#f1e3cc', 0.035);
  for (const [x, y] of [[-0.14, 0.3], [0.04, 0.32], [0.2, 0.3], [-0.06, 0.46], [0.13, 0.48], [-0.18, 0.56], [0.02, 0.6], [0.2, 0.6]]) {
    line(g, [
      [x - 0.04, y],
      [x, y + 0.035],
      [x + 0.04, y],
    ], 0.022, '#c39d6c');
  }
  // 腳
  for (const s of [-1, 1]) {
    for (const d of [-0.05, 0, 0.05]) {
      line(g, [
        [s * 0.2, 0.86],
        [s * 0.2 + d, 0.95],
      ], 0.04, '#e69a3a');
    }
  }

  // 耳羽：沒睡飽亂翹，睡著時垂下來
  for (const s of [-1, 1]) {
    const droop = cured ? 0.25 : 0;
    const wob = Math.sin(t * 3 + s) * 0.03;
    g.beginPath();
    g.moveTo(s * 0.22, -0.48);
    g.lineTo(s * (0.5 + droop), -0.92 + wob + droop * 1.2);
    g.lineTo(s * 0.4, -0.62 + droop * 0.4);
    g.lineTo(s * (0.64 + droop), -0.8 + wob + droop);
    g.lineTo(s * 0.5, -0.42);
    g.closePath();
    blob(g, '#7a5aa6');
  }
  // 頭頂翹起的一撮毛
  if (!cured) {
    g.beginPath();
    g.moveTo(-0.06, -0.54);
    g.quadraticCurveTo(0.0, -0.84 + Math.sin(t * 4) * 0.02, 0.14, -0.72);
    g.quadraticCurveTo(0.06, -0.66, 0.07, -0.54);
    g.closePath();
    blob(g, '#7a5aa6', 0.03);
  }

  // 臉盤
  for (const s of [-1, 1]) {
    ell(g, s * 0.21, -0.14, 0.27, 0.26);
    blob(g, '#f6ead6', 0.035);
  }
  // 黑眼圈（失眠的證據）
  if (!cured) {
    for (const s of [-1, 1]) {
      ell(g, s * 0.21, -0.02, 0.17, 0.075);
      g.fillStyle = 'rgba(110,70,150,0.45)';
      g.fill();
    }
  }

  // 眼睛
  const blink = (t % 4.3) < 0.13;
  if (cured) {
    closedEye(g, -0.21, -0.13, 0.11);
    closedEye(g, 0.21, -0.13, 0.11);
  } else if (skill) {
    for (const s of [-1, 1]) {
      const glow = g.createRadialGradient(s * 0.21, -0.14, 0, s * 0.21, -0.14, 0.22);
      glow.addColorStop(0, '#ffffff');
      glow.addColorStop(0.45, '#e2c6ff');
      glow.addColorStop(1, 'rgba(192,139,255,0)');
      g.fillStyle = glow;
      g.fillRect(s * 0.21 - 0.25, -0.4, 0.5, 0.5);
      ell(g, s * 0.21, -0.14, 0.03, 0.1);
      g.fillStyle = '#5a2fa0';
      g.fill();
    }
  } else if (blink && !surprised) {
    closedEye(g, -0.21, -0.13, 0.12);
    closedEye(g, 0.21, -0.13, 0.12);
  } else {
    const lid = surprised ? 0 : annoyed ? 0.55 : 0.4 + yawn * 0.4;
    // 平常時一隻眼睛的眼皮會不自覺抽動
    const twitch = mood === 'idle' && Math.sin(t * 23) > 0.85 ? 0.12 : 0;
    eye(g, -0.21, -0.13, 0.15, { lid, wide: surprised ? 1.25 : 1, lidColor: '#f6ead6', look: [0, 0.2] });
    eye(g, 0.21, -0.13, 0.15, { lid: lid + twitch, wide: surprised ? 1.25 : 1, lidColor: '#f6ead6', look: [0, 0.2] });
  }
  // 眉毛
  if (annoyed || skill) {
    for (const s of [-1, 1]) {
      line(g, [
        [s * 0.4, -0.38],
        [s * 0.1, -0.28],
      ], 0.05);
    }
  }

  // 喙：打哈欠或驚訝時張開
  const open = Math.max(yawn, surprised ? 0.7 : 0, skill ? 0.5 : 0);
  g.beginPath();
  g.moveTo(-0.08, 0.02);
  g.lineTo(0.08, 0.02);
  g.lineTo(0, 0.14 - open * 0.04);
  g.closePath();
  blob(g, '#ffb347', 0.03);
  if (open > 0.05) {
    g.beginPath();
    g.moveTo(-0.06, 0.06 + open * 0.06);
    g.lineTo(0.06, 0.06 + open * 0.06);
    g.lineTo(0, 0.13 + open * 0.1);
    g.closePath();
    blob(g, '#e8892a', 0.03);
  }

  // 咖啡杯：撐著不睡的必需品（睡著時就不拿了）
  if (!cured) {
    g.save();
    g.translate(0.5, 0.42 + (skill ? -0.1 : 0));
    g.rotate(-0.1);
    g.beginPath();
    g.roundRect(-0.12, -0.12, 0.22, 0.24, 0.04);
    blob(g, '#fff8ec', 0.035);
    g.fillStyle = '#c43a5e';
    g.fillRect(-0.1, -0.02, 0.18, 0.05);
    g.beginPath();
    g.arc(0.12, 0, 0.06, -1.3, 1.3);
    g.lineWidth = 0.035;
    g.strokeStyle = INK;
    g.stroke();
    // 熱氣
    for (const dx of [-0.05, 0.03]) {
      const k = (t * 0.7 + dx * 5) % 1;
      g.save();
      g.globalAlpha = Math.sin(k * Math.PI) * 0.7;
      line(g, [
        [dx, -0.16 - k * 0.1],
        [dx + 0.03, -0.22 - k * 0.12],
        [dx, -0.28 - k * 0.14],
      ], 0.025, '#ffffff');
      g.restore();
    }
    g.restore();
  }

  // 治好失眠：戴上睡帽
  if (cured) {
    g.save();
    g.translate(0.08, -0.56);
    g.rotate(0.35);
    g.beginPath();
    g.moveTo(-0.32, 0.08);
    g.quadraticCurveTo(0.02, -0.42, 0.38, -0.26);
    g.lineTo(0.28, 0.1);
    g.closePath();
    blob(g, '#4a63c9', 0.035);
    g.beginPath();
    g.roundRect(-0.34, 0.03, 0.66, 0.11, 0.05);
    blob(g, '#e8eeff', 0.03);
    ell(g, 0.4, -0.27, 0.08, 0.08);
    blob(g, '#e8eeff', 0.03);
    g.restore();
  }
  g.restore();

  // 氣氛
  if (cured) zzz(g, 0.45, -0.55, t);
  if (skill) {
    // 往外飄的催眠光球
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.6 + i / 6) % 1;
      const a = (i / 6) * TAU + t * 0.5;
      const r = 0.5 + k * 0.6;
      g.save();
      g.globalAlpha = Math.sin(k * Math.PI);
      ell(g, Math.cos(a) * r, Math.sin(a) * r * 0.8, 0.07, 0.07);
      g.fillStyle = '#d9b8ff';
      g.fill();
      g.restore();
    }
    zzz(g, -0.85, -0.5, t, '#e2c6ff');
  }
  if (surprised) exclaim(g, 0.72, -0.8, t);
  if (annoyed) angerMark(g, 0.55, -0.62, t);
}

// ---------- 第一位客人：害羞的兔子小姐（來問戀愛運） ----------

function drawRabbit(g, t, mood) {
  const happy = mood === 'happy' || mood === 'satisfied';
  const worried = mood === 'worried';
  const surprised = mood === 'surprised';
  const fur = '#fff6fa';

  g.save();
  g.translate(0, Math.sin(t * (happy ? 4 : 1.8)) * (happy ? 0.04 : 0.02));

  // 耳朵：開心時豎起來晃、著急時垂下去、驚訝時直挺挺
  const base = worried ? 1.05 : surprised ? 0.04 : happy ? 0.18 : 0.28;
  for (const s of [-1, 1]) {
    const twitch = mood === 'idle' && Math.sin(t * 2.3 + s) > 0.95 ? 0.15 : 0;
    const wag = happy ? Math.sin(t * 6 + s) * 0.1 : 0;
    g.save();
    g.translate(s * 0.2, -0.42);
    g.rotate(s * (base + twitch + wag));
    ell(g, 0, -0.42, 0.14, 0.44);
    blob(g, fur);
    ell(g, 0, -0.4, 0.075, 0.33);
    g.fillStyle = '#ffb3c8';
    g.fill();
    g.restore();
  }

  // 身體與圍巾
  ell(g, 0, 0.72, 0.46, 0.36);
  blob(g, fur);
  g.beginPath();
  g.roundRect(-0.36, 0.36, 0.72, 0.14, 0.07);
  blob(g, '#ff8fb3', 0.035);
  g.beginPath();
  g.moveTo(0.18, 0.46);
  g.lineTo(0.3, 0.72 + Math.sin(t * 2) * 0.02);
  g.lineTo(0.16, 0.7);
  g.closePath();
  blob(g, '#ff8fb3', 0.03);

  // 頭
  ell(g, 0, -0.04, 0.52, 0.47);
  blob(g, fur);
  blush(g, -0.3, 0.1, worried ? 0.06 : 0.09);
  blush(g, 0.3, 0.1, worried ? 0.06 : 0.09);

  // 眼睛
  const blink = (t % 3.9) < 0.12;
  if (mood === 'satisfied') {
    closedEye(g, -0.19, -0.04, 0.1, true);
    closedEye(g, 0.19, -0.04, 0.1, true);
  } else if (blink && !surprised) {
    closedEye(g, -0.19, -0.04, 0.1);
    closedEye(g, 0.19, -0.04, 0.1);
  } else {
    const look = worried ? [0, 0.4] : happy ? [0, -0.2] : [Math.sin(t * 0.7) * 0.5, 0.1];
    eye(g, -0.19, -0.04, 0.13, { wide: surprised ? 1.2 : 1, look, pupil: '#6b2a4a' });
    eye(g, 0.19, -0.04, 0.13, { wide: surprised ? 1.2 : 1, look, pupil: '#6b2a4a' });
    if (worried) {
      // 淚光
      ell(g, -0.2, 0.1, 0.05, 0.02);
      g.fillStyle = 'rgba(159,216,255,0.9)';
      g.fill();
    }
  }
  // 眉毛：著急時八字眉
  if (worried) {
    line(g, [
      [-0.3, -0.24],
      [-0.1, -0.3],
    ], 0.035);
    line(g, [
      [0.3, -0.24],
      [0.1, -0.3],
    ], 0.035);
  }

  // 鼻子與嘴
  g.beginPath();
  g.moveTo(-0.04, 0.12);
  g.lineTo(0.04, 0.12);
  g.lineTo(0, 0.16);
  g.closePath();
  blob(g, '#ff8fb3', 0.02);
  if (surprised) {
    ell(g, 0, 0.25, 0.05, 0.06);
    blob(g, '#6b1f3a', 0.025);
  } else if (worried) {
    line(g, [
      [-0.06, 0.25],
      [0, 0.22],
      [0.06, 0.25],
    ], 0.03);
  } else {
    line(g, [
      [-0.08, 0.2],
      [-0.04, 0.23],
      [0, 0.19],
      [0.04, 0.23],
      [0.08, 0.2],
    ], 0.03);
  }

  // 雙手捧著的情書
  g.save();
  g.translate(0, 0.66);
  g.rotate(Math.sin(t * 1.5) * 0.04 + (happy ? 0.08 : 0));
  g.beginPath();
  g.roundRect(-0.2, -0.13, 0.4, 0.26, 0.03);
  blob(g, '#fff8ec', 0.035);
  line(g, [
    [-0.2, -0.13],
    [0, 0.02],
    [0.2, -0.13],
  ], 0.025);
  g.beginPath();
  g.moveTo(0, 0.07);
  g.bezierCurveTo(-0.08, 0.0, -0.04, -0.06, 0, -0.02);
  g.bezierCurveTo(0.04, -0.06, 0.08, 0.0, 0, 0.07);
  blob(g, '#ff5d8f', 0.018);
  for (const s of [-1, 1]) {
    ell(g, s * 0.2, 0.04, 0.07, 0.06);
    blob(g, fur, 0.03);
  }
  g.restore();
  g.restore();

  if (happy) hearts(g, t);
  if (mood === 'satisfied') sparkles(g, t);
  if (worried) sweat(g, 0.48, -0.3, t);
  if (surprised) exclaim(g, 0.68, -0.85, t);
}

// ---------- 第二位客人：緊張的刺蝟先生（明天要面試） ----------

function drawHedgehog(g, t, mood) {
  const happy = mood === 'happy' || mood === 'satisfied';
  const worried = mood === 'worried';
  const surprised = mood === 'surprised';

  g.save();
  const shake = worried ? Math.sin(t * 40) * 0.008 : 0;
  g.translate(shake, Math.sin(t * 1.7) * 0.02);

  // 刺：緊張或驚訝時豎得更長、還會抖
  const len = surprised ? 0.36 : worried ? 0.3 : happy ? 0.2 : 0.23;
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (1.08 + (i / (n - 1)) * 0.84);
    const jitter = worried ? Math.sin(t * 30 + i) * 0.02 : 0;
    const r0 = 0.44;
    const r1 = r0 + len + (i % 2 ? 0.05 : 0) + jitter;
    const w = 0.13;
    g.beginPath();
    g.moveTo(Math.cos(a - w) * r0, Math.sin(a - w) * r0 + 0.02);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 + 0.02);
    g.lineTo(Math.cos(a + w) * r0, Math.sin(a + w) * r0 + 0.02);
    g.closePath();
    blob(g, i % 2 ? '#7a5236' : '#94663f', 0.03);
  }
  // 身體與領帶
  ell(g, 0, 0.72, 0.44, 0.34);
  blob(g, '#a87e57');
  g.beginPath();
  g.roundRect(-0.24, 0.42, 0.48, 0.12, 0.05);
  blob(g, '#fff8ec', 0.03);
  g.beginPath();
  g.moveTo(-0.05, 0.47);
  g.lineTo(0.05, 0.47);
  g.lineTo(0.08, 0.8);
  g.lineTo(0, 0.88);
  g.lineTo(-0.08, 0.8);
  g.closePath();
  blob(g, '#c43a5e', 0.03);

  // 臉
  ell(g, 0, 0.04, 0.46, 0.42);
  blob(g, '#f2d4a8');
  // 小耳朵
  for (const s of [-1, 1]) {
    ell(g, s * 0.38, -0.28, 0.08, 0.07);
    blob(g, '#f2d4a8', 0.03);
  }
  blush(g, -0.28, 0.16, 0.06);
  blush(g, 0.28, 0.16, 0.06);

  // 眼睛
  const blink = (t % 3.3) < 0.12;
  if (mood === 'satisfied') {
    closedEye(g, -0.17, 0.0, 0.08, true);
    closedEye(g, 0.17, 0.0, 0.08, true);
  } else if (blink && !surprised) {
    closedEye(g, -0.17, 0.0, 0.08);
    closedEye(g, 0.17, 0.0, 0.08);
  } else {
    const look = worried ? [Math.sin(t * 5) * 0.7, 0] : [0, 0.1];
    eye(g, -0.17, 0.0, 0.09, { wide: surprised ? 1.35 : 1, look });
    eye(g, 0.17, 0.0, 0.09, { wide: surprised ? 1.35 : 1, look });
  }
  // 圓眼鏡
  for (const s of [-1, 1]) {
    ell(g, s * 0.17, 0.0, 0.15, 0.15);
    g.fillStyle = 'rgba(200,230,255,0.15)';
    g.fill();
    g.lineWidth = 0.035;
    g.strokeStyle = INK;
    g.stroke();
    line(g, [
      [s * 0.08, -0.08],
      [s * 0.13, -0.11],
    ], 0.02, 'rgba(255,255,255,0.8)');
  }
  line(g, [
    [-0.03, -0.01],
    [0.03, -0.01],
  ], 0.035);
  // 眉毛
  if (worried) {
    line(g, [
      [-0.28, -0.2],
      [-0.08, -0.25],
    ], 0.035);
    line(g, [
      [0.28, -0.2],
      [0.08, -0.25],
    ], 0.035);
  } else if (happy) {
    line(g, [
      [-0.26, -0.22],
      [-0.09, -0.24],
    ], 0.03);
    line(g, [
      [0.26, -0.22],
      [0.09, -0.24],
    ], 0.03);
  }

  // 鼻子與嘴
  ell(g, 0, 0.18, 0.06, 0.05);
  blob(g, '#2b1b2e', 0.02);
  ell(g, -0.015, 0.165, 0.018, 0.012);
  g.fillStyle = '#fff';
  g.fill();
  if (surprised) {
    ell(g, 0, 0.3, 0.05, 0.06);
    blob(g, '#6b1f3a', 0.025);
  } else if (worried) {
    line(g, [
      [-0.08, 0.31],
      [-0.04, 0.28],
      [0, 0.31],
      [0.04, 0.28],
      [0.08, 0.31],
    ], 0.03);
  } else {
    g.beginPath();
    g.moveTo(-0.09, 0.27);
    g.quadraticCurveTo(0, happy ? 0.37 : 0.33, 0.09, 0.27);
    g.lineWidth = 0.03;
    g.strokeStyle = INK;
    g.stroke();
  }
  g.restore();

  if (happy) sparkles(g, t);
  if (worried) {
    sweat(g, 0.5, -0.15, t);
    sweat(g, -0.52, -0.05, t + 0.4);
  }
  if (surprised) exclaim(g, 0.7, -0.8, t);
}

// ---------- 松鼠奶奶（忘了過冬的橡果埋在哪） ----------

function drawSquirrel(g, t, mood) {
  const happy = mood === 'happy' || mood === 'satisfied';
  const worried = mood === 'worried';
  const surprised = mood === 'surprised';
  const fur = '#d98b4f';
  const cream = '#fbe6c8';
  const dark = '#8a4f28';

  g.save();
  g.translate(0, Math.sin(t * (happy ? 4 : 1.6)) * (happy ? 0.035 : 0.02));

  // 大尾巴在身後：開心時搖、著急時垂下、驚訝時炸毛
  g.save();
  g.translate(0.38, 0.6);
  g.rotate((worried ? 0.4 : 0) + Math.sin(t * (happy ? 5 : 1.8)) * (happy ? 0.12 : 0.05));
  const puff = surprised ? 1.15 : 1;
  g.scale(puff, puff);
  g.beginPath();
  g.moveTo(-0.05, 0.12);
  g.bezierCurveTo(0.6, 0.12, 0.78, -0.5, 0.45, -0.98);
  g.bezierCurveTo(0.28, -1.18, -0.08, -1.02, 0.04, -0.8);
  g.bezierCurveTo(0.34, -0.55, 0.2, -0.2, -0.15, -0.08);
  g.closePath();
  blob(g, fur);
  g.beginPath();
  g.moveTo(0.02, 0.02);
  g.bezierCurveTo(0.45, -0.05, 0.52, -0.5, 0.36, -0.82);
  g.lineWidth = 0.07;
  g.strokeStyle = '#f2b27a';
  g.lineCap = 'round';
  g.stroke();
  g.restore();

  // 耳朵與耳尖的毛
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 0.3, -0.36);
    g.rotate(s * (worried ? 0.55 : 0.2));
    ell(g, 0, -0.12, 0.11, 0.17);
    blob(g, fur);
    ell(g, 0, -0.1, 0.055, 0.1);
    g.fillStyle = '#f3b38a';
    g.fill();
    line(g, [
      [0, -0.28],
      [s * 0.04, -0.4],
    ], 0.05, dark);
    g.restore();
  }

  // 身體、肚子、針織披肩
  ell(g, 0, 0.72, 0.42, 0.34);
  blob(g, fur);
  ell(g, 0, 0.78, 0.26, 0.24);
  blob(g, cream, 0.03);
  g.beginPath();
  g.moveTo(-0.38, 0.4);
  g.lineTo(0.38, 0.4);
  g.lineTo(0, 0.66);
  g.closePath();
  blob(g, '#8a6bc9', 0.035);
  for (let i = -2; i <= 2; i++) {
    ell(g, i * 0.12, 0.45, 0.025, 0.025);
    g.fillStyle = '#b9a2ee';
    g.fill();
  }

  // 頭與口鼻
  ell(g, 0, -0.02, 0.5, 0.45);
  blob(g, fur);
  ell(g, 0, 0.16, 0.25, 0.17);
  blob(g, cream, 0.03);
  blush(g, -0.33, 0.1, 0.08);
  blush(g, 0.33, 0.1, 0.08);

  // 眼睛 + 圓眼鏡
  const blink = (t % 4.3) < 0.12;
  if (mood === 'satisfied') {
    closedEye(g, -0.19, -0.06, 0.09, true);
    closedEye(g, 0.19, -0.06, 0.09, true);
  } else if (blink && !surprised) {
    closedEye(g, -0.19, -0.06, 0.09);
    closedEye(g, 0.19, -0.06, 0.09);
  } else {
    const look = worried ? [Math.sin(t * 2.5), 0.2] : happy ? [0, -0.2] : [Math.sin(t * 0.6) * 0.5, 0.1];
    eye(g, -0.19, -0.06, 0.11, { wide: surprised ? 1.2 : 1, look, pupil: '#3a2212' });
    eye(g, 0.19, -0.06, 0.11, { wide: surprised ? 1.2 : 1, look, pupil: '#3a2212' });
  }
  const slip = surprised ? 0.06 : 0; // 驚訝時眼鏡滑下來
  for (const s of [-1, 1]) {
    ell(g, s * 0.19, -0.06 + slip, 0.16, 0.16);
    g.lineWidth = 0.03;
    g.strokeStyle = '#c9a24a';
    g.stroke();
  }
  line(g, [
    [-0.04, -0.08 + slip],
    [0.04, -0.08 + slip],
  ], 0.03, '#c9a24a');
  if (worried) {
    line(g, [
      [-0.3, -0.27],
      [-0.1, -0.31],
    ], 0.035);
    line(g, [
      [0.3, -0.27],
      [0.1, -0.31],
    ], 0.035);
  }

  // 鼻子、嘴、門牙
  ell(g, 0, 0.09, 0.05, 0.035);
  blob(g, dark, 0.02);
  if (surprised) {
    ell(g, 0, 0.24, 0.05, 0.06);
    blob(g, '#6b1f3a', 0.025);
  } else if (worried) {
    line(g, [
      [-0.07, 0.24],
      [0, 0.2],
      [0.07, 0.24],
    ], 0.03);
  } else {
    line(g, [
      [-0.08, 0.17],
      [-0.04, 0.2],
      [0, 0.16],
      [0.04, 0.2],
      [0.08, 0.17],
    ], 0.03);
    g.beginPath();
    g.rect(-0.035, 0.18, 0.07, 0.06);
    blob(g, '#fff', 0.02);
    line(g, [
      [0, 0.18],
      [0, 0.24],
    ], 0.015);
  }

  // 抱著的橡果
  g.save();
  g.translate(0, 0.64);
  g.rotate(Math.sin(t * 1.4) * 0.05 + (happy ? 0.1 : 0));
  ell(g, 0, 0.04, 0.11, 0.12);
  blob(g, '#c07a3c', 0.03);
  g.beginPath();
  g.ellipse(0, -0.04, 0.13, 0.07, 0, Math.PI, TAU);
  g.closePath();
  blob(g, '#6e4320', 0.03);
  line(g, [
    [0, -0.11],
    [0.03, -0.17],
  ], 0.03);
  for (const s of [-1, 1]) {
    ell(g, s * 0.13, 0.05, 0.065, 0.055);
    blob(g, fur, 0.03);
  }
  g.restore();
  g.restore();

  if (happy) sparkles(g, t, '#ffe6a6');
  if (worried) sweat(g, 0.48, -0.3, t);
  if (surprised) exclaim(g, -0.7, -0.8, t);
}

// ---------- 小狐狸（魔術師學徒，明天第一次登台） ----------

function star5(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function drawFox(g, t, mood) {
  const happy = mood === 'happy' || mood === 'satisfied';
  const worried = mood === 'worried';
  const surprised = mood === 'surprised';
  const fur = '#f08a3c';
  const white = '#fff3e6';
  const dark = '#4a2a1a';

  g.save();
  g.translate(0, Math.sin(t * (happy ? 4.5 : 1.8)) * (happy ? 0.04 : 0.02));

  // 尾巴在左後方，白色尾尖
  g.save();
  g.translate(-0.42, 0.66);
  g.rotate(-0.75 + Math.sin(t * (happy ? 5 : 1.6)) * (happy ? 0.18 : 0.06) + (worried ? 0.5 : 0));
  ell(g, 0, -0.32, 0.17, 0.4);
  blob(g, fur);
  g.save();
  ell(g, 0, -0.32, 0.17, 0.4);
  g.clip();
  ell(g, 0, -0.7, 0.2, 0.17);
  g.fillStyle = white;
  g.fill();
  g.restore();
  ell(g, 0, -0.32, 0.17, 0.4);
  g.lineWidth = 0.045;
  g.strokeStyle = INK;
  g.stroke();
  g.restore();

  // 尖耳朵：著急時往兩邊垂
  for (const s of [-1, 1]) {
    g.save();
    g.translate(s * 0.27, -0.34);
    g.rotate(s * (worried ? 0.75 : surprised ? 0.05 : 0.2));
    g.beginPath();
    g.moveTo(-0.14, 0.06);
    g.lineTo(0, -0.36);
    g.lineTo(0.14, 0.06);
    g.closePath();
    blob(g, fur);
    g.beginPath();
    g.moveTo(-0.07, 0.02);
    g.lineTo(0, -0.24);
    g.lineTo(0.07, 0.02);
    g.closePath();
    g.fillStyle = '#5a2e1e';
    g.fill();
    g.restore();
  }

  // 身體、胸前白毛、紅色小斗篷領
  ell(g, 0, 0.72, 0.42, 0.34);
  blob(g, fur);
  ell(g, 0, 0.68, 0.19, 0.18);
  g.fillStyle = white;
  g.fill();
  g.beginPath();
  g.moveTo(-0.3, 0.4);
  g.lineTo(0.3, 0.4);
  g.lineTo(0.18, 0.54);
  g.lineTo(0, 0.48);
  g.lineTo(-0.18, 0.54);
  g.closePath();
  blob(g, '#c43a5e', 0.035);

  // 頭、白色臉頰
  ell(g, 0, -0.02, 0.5, 0.43);
  blob(g, fur);
  g.save();
  ell(g, 0, -0.02, 0.5, 0.43);
  g.clip();
  for (const s of [-1, 1]) {
    ell(g, s * 0.24, 0.2, 0.25, 0.18);
    g.fillStyle = white;
    g.fill();
  }
  g.restore();
  ell(g, 0, -0.02, 0.5, 0.43);
  g.lineWidth = 0.045;
  g.strokeStyle = INK;
  g.stroke();

  // 眼睛
  const blink = (t % 3.6) < 0.12;
  if (happy) {
    closedEye(g, -0.19, -0.04, 0.1, true);
    closedEye(g, 0.19, -0.04, 0.1, true);
  } else if (blink && !surprised) {
    closedEye(g, -0.19, -0.04, 0.1);
    closedEye(g, 0.19, -0.04, 0.1);
  } else {
    const look = worried ? [0, 0.5] : [Math.sin(t * 0.8) * 0.5, 0];
    eye(g, -0.19, -0.04, 0.12, { wide: surprised ? 1.25 : 0.95, look, pupil: '#5a2e1e' });
    eye(g, 0.19, -0.04, 0.12, { wide: surprised ? 1.25 : 0.95, look, pupil: '#5a2e1e' });
  }
  if (worried) {
    line(g, [
      [-0.3, -0.22],
      [-0.1, -0.28],
    ], 0.035);
    line(g, [
      [0.3, -0.22],
      [0.1, -0.28],
    ], 0.035);
  }
  blush(g, -0.32, 0.1, 0.07);
  blush(g, 0.32, 0.1, 0.07);

  // 鼻子與嘴
  ell(g, 0, 0.1, 0.055, 0.04);
  blob(g, dark, 0.02);
  if (surprised) {
    ell(g, 0, 0.24, 0.05, 0.06);
    blob(g, '#6b1f3a', 0.025);
  } else if (worried) {
    line(g, [
      [-0.07, 0.24],
      [0, 0.21],
      [0.07, 0.24],
    ], 0.03);
  } else {
    g.beginPath();
    g.moveTo(-0.1, 0.18);
    g.quadraticCurveTo(0, happy ? 0.3 : 0.25, 0.1, 0.18);
    g.lineWidth = 0.03;
    g.strokeStyle = INK;
    g.stroke();
  }

  // 小禮帽：驚訝時跳起來
  g.save();
  const hop = surprised ? 0.12 + Math.abs(Math.sin(t * 8)) * 0.06 : 0;
  g.translate(0.1, -0.4 - hop);
  g.rotate(0.2);
  ell(g, 0, 0, 0.21, 0.05);
  blob(g, '#2b2240', 0.035);
  g.beginPath();
  g.roundRect(-0.12, -0.27, 0.24, 0.27, 0.03);
  blob(g, '#2b2240', 0.035);
  g.fillStyle = '#c43a5e';
  g.fillRect(-0.12, -0.09, 0.24, 0.06);
  g.restore();

  // 魔杖：開心時揮舞，杖尖冒星星
  g.save();
  g.translate(0.36, 0.62);
  g.rotate(-0.45 + (happy ? Math.sin(t * 7) * 0.35 : Math.sin(t * 1.5) * 0.05));
  line(g, [
    [0, 0],
    [0, -0.44],
  ], 0.06, INK);
  line(g, [
    [0, -0.36],
    [0, -0.44],
  ], 0.04, '#fff');
  if (happy || surprised) {
    star5(g, 0, -0.54, 0.09 + Math.sin(t * 9) * 0.02);
    blob(g, '#ffd36e', 0.02);
  }
  ell(g, 0, 0, 0.07, 0.06);
  blob(g, fur, 0.03);
  g.restore();
  ell(g, -0.2, 0.66, 0.07, 0.06);
  blob(g, fur, 0.03);
  g.restore();

  if (mood === 'satisfied') sparkles(g, t, '#ffd36e');
  if (worried) sweat(g, -0.5, -0.25, t);
  if (surprised) exclaim(g, -0.68, -0.8, t);
}

// ---------- 青蛙先生（下週辦婚禮，怕下雨） ----------

function drawFrog(g, t, mood) {
  const happy = mood === 'happy' || mood === 'satisfied';
  const worried = mood === 'worried';
  const surprised = mood === 'surprised';
  const skin = '#7cc46a';
  const belly = '#e2f3c0';

  // 著急時下雨（畫在最後面）
  if (worried) {
    for (let i = 0; i < 7; i++) {
      const k = (t * 1.3 + i * 0.37) % 1;
      const x = -1 + i * 0.33;
      const y = -1.1 + k * 2.1;
      g.save();
      g.globalAlpha = Math.sin(k * Math.PI) * 0.9;
      line(g, [
        [x, y],
        [x - 0.03, y + 0.12],
      ], 0.03, '#9fd8ff');
      g.restore();
    }
  }

  g.save();
  g.translate(0, Math.abs(Math.sin(t * (happy ? 4 : 1.5))) * -(happy ? 0.06 : 0.015));

  // 雨傘：平常撐著，滿意時收起來放到旁邊
  g.save();
  const closed = mood === 'satisfied';
  g.translate(-0.36, closed ? 0.3 : -0.15);
  g.rotate(closed ? -0.5 : -0.22 + Math.sin(t * 1.4) * 0.05);
  line(g, [
    [0, 0.8],
    [0, -0.72],
  ], 0.04);
  if (closed) {
    g.beginPath();
    g.moveTo(0, -0.72);
    g.quadraticCurveTo(0.12, -0.3, 0.05, 0.25);
    g.lineTo(-0.05, 0.25);
    g.quadraticCurveTo(-0.12, -0.3, 0, -0.72);
    blob(g, '#7fb6ff', 0.035);
  } else {
    g.beginPath();
    g.moveTo(-0.6, -0.6);
    g.quadraticCurveTo(0, -1.25, 0.6, -0.6);
    for (let i = 0; i < 4; i++) {
      const x0 = 0.6 - i * 0.3;
      g.quadraticCurveTo(x0 - 0.15, -0.5, x0 - 0.3, -0.6);
    }
    g.closePath();
    blob(g, '#7fb6ff', 0.04);
    for (const x of [-0.3, 0, 0.3]) {
      line(g, [
        [0, -0.92],
        [x, -0.6],
      ], 0.02, '#4a7fc0');
    }
  }
  g.beginPath();
  g.arc(0.08, 0.8, 0.08, 0, Math.PI);
  g.lineWidth = 0.04;
  g.strokeStyle = INK;
  g.stroke();
  g.restore();

  // 身體、肚子、領結
  ell(g, 0, 0.74, 0.46, 0.32);
  blob(g, skin);
  ell(g, 0, 0.8, 0.3, 0.22);
  blob(g, belly, 0.03);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(0, 0.46);
    g.lineTo(s * 0.16, 0.38);
    g.lineTo(s * 0.16, 0.54);
    g.closePath();
    blob(g, '#c43a5e', 0.03);
  }
  ell(g, 0, 0.46, 0.045, 0.045);
  blob(g, '#e85a7e', 0.025);

  // 頭頂的兩個眼睛凸起
  for (const s of [-1, 1]) {
    ell(g, s * 0.26, -0.28, 0.2, 0.19);
    blob(g, skin);
  }
  ell(g, 0, 0.06, 0.56, 0.38);
  blob(g, skin);
  // 補掉凸起和臉之間的線
  for (const s of [-1, 1]) {
    ell(g, s * 0.26, -0.18, 0.16, 0.08);
    g.fillStyle = skin;
    g.fill();
  }

  const blink = (t % 4.1) < 0.14;
  if (mood === 'satisfied') {
    closedEye(g, -0.26, -0.3, 0.1, true);
    closedEye(g, 0.26, -0.3, 0.1, true);
  } else if (blink && !surprised) {
    closedEye(g, -0.26, -0.3, 0.1);
    closedEye(g, 0.26, -0.3, 0.1);
  } else {
    const look = worried ? [0, -0.6] : [Math.sin(t * 0.7) * 0.6, 0];
    eye(g, -0.26, -0.3, 0.13, { wide: surprised ? 1.2 : 1, look, lid: worried ? 0.25 : 0, lidColor: skin });
    eye(g, 0.26, -0.3, 0.13, { wide: surprised ? 1.2 : 1, look, lid: worried ? 0.25 : 0, lidColor: skin });
  }
  blush(g, -0.38, 0.14, 0.08);
  blush(g, 0.38, 0.14, 0.08);
  ell(g, -0.06, 0.0, 0.018, 0.012);
  ell(g, 0.06, 0.0, 0.018, 0.012);
  g.fillStyle = INK;
  ell(g, -0.06, 0.0, 0.018, 0.012);
  g.fill();
  ell(g, 0.06, 0.0, 0.018, 0.012);
  g.fill();

  // 大嘴巴
  if (surprised) {
    ell(g, 0, 0.2, 0.09, 0.09);
    blob(g, '#a8324e', 0.03);
  } else if (worried) {
    line(g, [
      [-0.28, 0.2],
      [-0.14, 0.15],
      [0, 0.2],
      [0.14, 0.15],
      [0.28, 0.2],
    ], 0.035);
  } else if (happy) {
    g.beginPath();
    g.moveTo(-0.3, 0.12);
    g.quadraticCurveTo(0, 0.42, 0.3, 0.12);
    g.closePath();
    blob(g, '#a8324e', 0.035);
    ell(g, 0, 0.24, 0.1, 0.04);
    g.fillStyle = '#ff8fa8';
    g.fill();
  } else {
    g.beginPath();
    g.moveTo(-0.3, 0.13);
    g.quadraticCurveTo(0, 0.28, 0.3, 0.13);
    g.lineWidth = 0.035;
    g.strokeStyle = INK;
    g.stroke();
  }

  // 握傘的手與另一隻手
  ell(g, -0.34, 0.58, 0.08, 0.07);
  blob(g, skin, 0.03);
  ell(g, 0.36, 0.64, 0.08, 0.07);
  blob(g, skin, 0.03);
  g.restore();

  if (mood === 'satisfied') sparkles(g, t);
  if (happy && mood !== 'satisfied') hearts(g, t);
  if (surprised) exclaim(g, 0.7, -0.75, t);
}

// ---------- 角色資料 ----------
// moods：每種心情的按鈕名稱與台詞（遊戲裡隨機挑一句）；lose：玩家沒過關時的台詞

export const CUSTOMERS = {
  rabbit: {
    id: 'rabbit',
    name: '兔子小姐・小桃',
    tag: '第一位客人',
    desc: '害羞的白兔，捧著寫好的情書，想知道該不該告白。',
    draw: drawRabbit,
    moods: [
      { key: 'idle', label: '平常', lines: ['那個……可以幫我看看戀愛運嗎？', '他會喜歡我嗎……', '我、我準備好了！'] },
      { key: 'happy', label: '開心', lines: ['哇！好像有希望耶！', '牌面越來越漂亮了！', '心跳得好快……'] },
      { key: 'worried', label: '著急', lines: ['步數快不夠了……是不是沒緣分……', '嗚……拜託再努力一下！', '怎麼辦，好緊張……'] },
      { key: 'surprised', label: '驚訝', lines: ['這、這麼大的連鎖！？', '哇啊！好厲害！', '剛剛那是什麼！？'] },
      { key: 'satisfied', label: '過關', lines: ['謝謝占卜師！我要去告白了！'] },
    ],
    lose: ['嗚……我還是再等等好了……'],
  },
  hedgehog: {
    id: 'hedgehog',
    name: '刺蝟先生・阿刺',
    tag: '第二位客人',
    desc: '明天要面試的上班族，一緊張全身的刺就豎起來。',
    draw: drawHedgehog,
    moods: [
      { key: 'idle', label: '平常', lines: ['明天面試……我會不會搞砸啊？', '請、請多指教。', '領帶有沒有歪……'] },
      { key: 'happy', label: '開心', lines: ['嗯嗯，聽起來還不錯！', '這樣應該沒問題吧？', '感覺有自信多了！'] },
      { key: 'worried', label: '著急', lines: ['怎、怎麼辦，刺都豎起來了……', '時間不夠了啦！', '我、我好像又緊張了……'] },
      { key: 'surprised', label: '驚訝', lines: ['連鎖這麼多！？我的運勢這麼好？', '眼鏡都歪了！', '這是好兆頭吧！？'] },
      { key: 'satisfied', label: '過關', lines: ['好！我有信心了，謝謝！'] },
    ],
    lose: ['唉……還是先回家練習自我介紹吧……'],
  },
  squirrel: {
    id: 'squirrel',
    name: '松鼠奶奶・栗子',
    tag: '新客人',
    desc: '戴著圓眼鏡的老奶奶，忘了過冬的橡果埋在哪棵樹下。',
    draw: drawSquirrel,
    moods: [
      { key: 'idle', label: '平常', lines: ['年紀大了，記性不好囉……幫奶奶找找橡果吧。', '好像是在一棵大樹下面……', '慢慢來，奶奶不急。'] },
      { key: 'happy', label: '開心', lines: ['哎呀，好像想起來了！', '乖孩子，做得真好。', '這牌面，奶奶喜歡。'] },
      { key: 'worried', label: '著急', lines: ['冬天快到了，這可怎麼辦……', '哎呀呀，尾巴都垂下來了……', '是不是被誰挖走了……'] },
      { key: 'surprised', label: '驚訝', lines: ['哎唷！眼鏡都滑下來了！', '這麼厲害，奶奶年輕時都沒見過！', '嚇奶奶一跳！'] },
      { key: 'satisfied', label: '過關', lines: ['找到了找到了！分你一顆橡果吧！'] },
    ],
    lose: ['唉，今年冬天只好省著點吃了……'],
  },
  fox: {
    id: 'fox',
    name: '小狐狸・阿焰',
    tag: '新客人',
    desc: '魔術師學徒，明天第一次登台表演，想知道會不會出包。',
    draw: drawFox,
    moods: [
      { key: 'idle', label: '平常', lines: ['明天第一次上台……會不會把鴿子變不見啊？', '占卜也算一種魔術吧？', '我、我才沒有緊張！'] },
      { key: 'happy', label: '開心', lines: ['看！跟我的魔術一樣閃亮！', '嘿嘿，這招我學起來了！', '觀眾一定會拍手！'] },
      { key: 'worried', label: '著急', lines: ['不行不行，耳朵都垂下來了……', '萬一帽子裡什麼都沒有怎麼辦！', '師父說不能慌……可是……'] },
      { key: 'surprised', label: '驚訝', lines: ['哇！帽子都飛起來了！', '這比我的魔術還厲害！', '你是怎麼變出來的！？'] },
      { key: 'satisfied', label: '過關', lines: ['明天的表演，一定會成功的！'] },
    ],
    lose: ['嗚……今晚再練習一百次好了……'],
  },
  frog: {
    id: 'frog',
    name: '青蛙先生・呱太',
    tag: '新客人',
    desc: '下週要辦婚禮，一直撐著傘，擔心那天會下雨。',
    draw: drawFrog,
    moods: [
      { key: 'idle', label: '平常', lines: ['下週的婚禮……會下雨嗎？', '雖然青蛙喜歡下雨，但新娘不喜歡呱。', '傘我隨時都帶著。'] },
      { key: 'happy', label: '開心', lines: ['呱！好像會是晴天！', '她一定會很開心的呱！', '心情跟放晴一樣！'] },
      { key: 'worried', label: '著急', lines: ['呱……開始下雨了……', '不、不會吧，烏雲來了……', '傘、傘要撐好……'] },
      { key: 'surprised', label: '驚訝', lines: ['呱！？嚇得我跳起來！', '這麼大的連鎖，是彩虹嗎！？', '眼睛都要掉出來了呱！'] },
      { key: 'satisfied', label: '過關', lines: ['可以收傘了！婚禮見呱！'] },
    ],
    lose: ['呱……還是先把室內場地訂好吧……'],
  },
  owl: {
    id: 'owl',
    name: '失眠的貓頭鷹',
    tag: 'BOSS',
    boss: true,
    desc: '三天沒睡、靠咖啡撐著。每 3 步就施法，讓盤面上的水晶跟著睡著。',
    draw: drawOwl,
    moods: [
      { key: 'idle', label: '平常', lines: ['已經三天沒睡了……給我占一個能睡著的未來。', '哈啊——……你繼續。', '咖啡……再一杯……'] },
      { key: 'annoyed', label: '不耐煩', lines: ['吵死了……這種程度的占卜我不信。', '哼，還差得遠呢。', '別以為這樣我就會睡著。'] },
      { key: 'surprised', label: '驚訝', lines: ['什、什麼！？這牌面……', '眼睛……突然好痠……', '這麼亮的光是怎樣！'] },
      { key: 'skill', label: '施法', lines: ['大家……都陪我一起睏吧……', '睡吧……睡吧……', '我睡不著，你們也別想醒著。'] },
      { key: 'satisfied', label: '被打敗', lines: ['呼……終於……想睡了……'] },
    ],
    lose: ['哼……果然還是睡不著。'],
  },
};

export function lineFor(id, mood) {
  const cu = CUSTOMERS[id];
  const lines = mood === 'lose' ? cu.lose : cu.moods.find((m) => m.key === mood)?.lines ?? cu.moods[0].lines;
  return lines[Math.floor(Math.random() * lines.length)];
}

// 畫一位客人：zoom = 大頭特寫（小頭像用），否則是全身
export function paintCustomer(canvas, id, mood, t, zoom = false) {
  const g = canvas.getContext('2d');
  const n = canvas.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, n, n);
  g.translate(n / 2, n * (zoom ? 0.56 : 0.54));
  const s = n / (zoom ? 1.75 : 2.6);
  g.scale(s, s);
  CUSTOMERS[id].draw(g, t, mood);
}

// 遊戲裡的頭像：自己跑動畫，畫面看不到時就不畫
export class Portrait {
  constructor(canvas, cssSize, { zoom = true } = {}) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = canvas.height = Math.round(cssSize * dpr);
    this.canvas = canvas;
    this.zoom = zoom;
    this.id = null;
    this.mood = 'idle';
    const loop = (ms) => {
      if (this.id && canvas.offsetParent !== null) paintCustomer(canvas, this.id, this.mood, ms / 1000, this.zoom);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  set(id, mood = 'idle') {
    this.id = id;
    this.mood = mood;
  }
}

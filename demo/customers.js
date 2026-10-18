// 客人試作：三位客人全部用 Canvas 即時繪製，跟盤面水晶同一種風格（粗輪廓、大眼睛）
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

// ---------- 角色資料 ----------

const CUSTOMERS = [
  {
    id: 'rabbit',
    name: '兔子小姐・小桃',
    tag: '第一位客人',
    desc: '害羞的白兔，捧著寫好的情書，想知道該不該告白。',
    draw: drawRabbit,
    moods: [
      ['idle', '平常', '那個……可以幫我看看戀愛運嗎？'],
      ['happy', '開心', '哇！好像有希望耶！'],
      ['worried', '著急', '步數快不夠了……是不是沒緣分……'],
      ['surprised', '驚訝', '這、這麼大的連鎖！？'],
      ['satisfied', '過關', '謝謝占卜師！我要去告白了！'],
    ],
  },
  {
    id: 'hedgehog',
    name: '刺蝟先生・阿刺',
    tag: '第二位客人',
    desc: '明天要面試的上班族，一緊張全身的刺就豎起來。',
    draw: drawHedgehog,
    moods: [
      ['idle', '平常', '明天面試……我會不會搞砸啊？'],
      ['happy', '開心', '嗯嗯，聽起來還不錯！'],
      ['worried', '著急', '怎、怎麼辦，刺都豎起來了……'],
      ['surprised', '驚訝', '連鎖這麼多！？我的運勢這麼好？'],
      ['satisfied', '過關', '好！我有信心了，謝謝！'],
    ],
  },
  {
    id: 'owl',
    name: '失眠的貓頭鷹',
    tag: 'BOSS',
    boss: true,
    desc: '三天沒睡、靠咖啡撐著。每 3 步就施法，讓盤面上的水晶跟著睡著。',
    draw: drawOwl,
    moods: [
      ['idle', '平常', '已經三天沒睡了……給我占一個能睡著的未來。'],
      ['annoyed', '不耐煩', '吵死了……這種程度的占卜我不信。'],
      ['surprised', '驚訝', '什、什麼！？這牌面……'],
      ['skill', '施法', '大家……都陪我一起睏吧……'],
      ['satisfied', '被打敗', '呼……終於……想睡了……'],
    ],
  },
];

// ---------- 畫面 ----------

const grid = document.getElementById('grid');
const cards = [];

function makeCanvas(cssSize) {
  const c = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  c.width = c.height = Math.round(cssSize * dpr);
  return c;
}

for (const cu of CUSTOMERS) {
  const el = document.createElement('section');
  el.className = `card${cu.boss ? ' boss' : ''}`;
  el.innerHTML = `
    <span class="tag">${cu.tag}</span>
    <div class="stage"></div>
    <div class="name">${cu.name}</div>
    <p class="desc">${cu.desc}</p>
    <div class="bubble"></div>
    <div class="moods"></div>
    <div class="mini"><span>遊戲中的小頭像</span></div>`;
  const big = makeCanvas(280);
  el.querySelector('.stage').appendChild(big);
  const mini = makeCanvas(60);
  el.querySelector('.mini').prepend(mini);
  const card = { cu, el, big, mini, mood: 0, bubble: el.querySelector('.bubble'), buttons: [] };
  cu.moods.forEach(([, label], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.onclick = () => {
      setAuto(false);
      setMood(card, i);
    };
    el.querySelector('.moods').appendChild(b);
    card.buttons.push(b);
  });
  grid.appendChild(el);
  cards.push(card);
  setMood(card, 0);
}

function setMood(card, i) {
  card.mood = i;
  card.buttons.forEach((b, j) => b.classList.toggle('on', j === i));
  card.bubble.textContent = card.cu.moods[i][2];
  card.bubble.classList.remove('pop');
  void card.bubble.offsetWidth;
  card.bubble.classList.add('pop');
}

// 自動輪播：每張卡錯開時間換心情
let auto = true;
let autoTimer = 0;
function setAuto(on) {
  auto = on;
  document.getElementById('btn-auto').textContent = `自動輪播：${on ? '開' : '關'}`;
  clearInterval(autoTimer);
  if (on) {
    let tick = 0;
    autoTimer = setInterval(() => {
      const card = cards[tick % cards.length];
      setMood(card, (card.mood + 1) % card.cu.moods.length);
      tick++;
    }, 1300);
  }
}
document.getElementById('btn-auto').onclick = () => setAuto(!auto);
setAuto(true);

function paint(canvas, card, t, zoom) {
  const g = canvas.getContext('2d');
  const n = canvas.width;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, n, n);
  g.translate(n / 2, n * (zoom ? 0.56 : 0.54));
  const s = n / (zoom ? 1.75 : 2.6);
  g.scale(s, s);
  card.cu.draw(g, t, card.cu.moods[card.mood][0]);
}

function frame(ms) {
  const t = ms / 1000;
  for (const card of cards) {
    paint(card.big, card, t, false);
    paint(card.mini, card, t, true);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

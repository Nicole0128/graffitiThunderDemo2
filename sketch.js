let currentBrush = 'neon';
let currentBackground = 'ash';
let strokes = [];
let smokeParticles = [];
let brushSize = 1.0;
let bgImages = {};
let drawingEnabled = false;
let canvas; 
let isDrawing = false;
let lastX, lastY;
// 紀錄目前正在畫的指標型別：'pen' / 'touch' / 'mouse' / null
let pointerActiveType = null;
let bgImg;
let bgMusic = {};        // 用來存放各背景的 p5.SoundFile
let currentMusic = null; // 正在播放的音樂
let inactivityTimeout;   // 計時器 id
const INACTIVITY_DELAY = 30 * 1000; // 30秒

function preload() {
  bgImages.brick   = loadImage('bg_brick.png');
  bgImages.shutter = loadImage('bg_shutter.png');
  bgImages.ash   = loadImage('bg_ash.png');
  bgImages.alley   = loadImage('bg_alley.png');
  bgMusic.brick   = loadSound('bgm_brick.mp3');
  bgMusic.shutter = loadSound('bgm_shutter.mp3');
  bgMusic.ash   = loadSound('bgm_ash.mp3');
  bgMusic.alley   = loadSound('bgm_alley.mp3');
}

function setup() { 
  canvas = createCanvas(windowWidth, windowHeight);
  canvas.position(0, 0);
  canvas.style('z-index', '-1');
  canvas.style('position', 'fixed');
  imageMode(CORNER);
  noFill();
 
  // 取得滑桿 DOM 元素，更新 brushSize
  const slider = document.getElementById('brush-slider');
  slider.addEventListener('input', () => {
    brushSize = parseFloat(slider.value);
  });
 
  canvas.elt.style.touchAction = 'none'; // 關閉預設手勢
  //綁定point Events
  canvas.elt.addEventListener('pointerdown', onPointerDown);
  canvas.elt.addEventListener('pointermove',  onPointerMove);
  canvas.elt.addEventListener('pointerup',    onPointerUp);
  canvas.elt.addEventListener('pointerleave', onPointerUp);

  canvas.hide(); // 等 enableDrawing() 再顯示

   // 全域繪圖互動都重置計時
  ['mousedown','mousemove','mouseup','touchstart','touchmove','touchend']
    .forEach(evt =>
      canvas.elt.addEventListener(evt, resetInactivityTimer)
    );
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw() {
  if (!drawingEnabled) {
    // 如果尚未啟用繪圖，就不做任何事
    return;
  }
  
  background(0);

  // 畫背景圖
  if (bgImages[currentBackground]) {
    push();
    tint(255, 200);
    image(bgImages[currentBackground], 0, 0, width, height);
    pop();
  }

  // 畫所有筆畫
  for (let s of strokes) drawStroke(s);

  // 畫煙霧粒子
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    let p = smokeParticles[i];
    fill(255, 255, 255, p.alpha);
    noStroke();
    ellipse(p.x, p.y, p.size);
    p.x += random(-0.5, 0.5);
    p.y += random(-0.5, 0.5);
    p.alpha -= 0.8;
    p.size += 0.1;
    if (p.alpha <= 0) smokeParticles.splice(i, 1);
  }
}

function mouseDragged(event) {
  resetInactivityTimer();
  // 壓力感應，支援 Apple Pencil（0~1，預設0.5）
  if (!drawingEnabled) return;  // ← 在展覽模式時一律不處理
  let pressure = 0.5;
  if (event && event.pressure !== undefined) {
    pressure = event.pressure;
  } else if (window.event && window.event.pressure !== undefined) {
    pressure = window.event.pressure;
  }

  let newStroke = {
    x1: pmouseX, y1: pmouseY,
    x2: mouseX, y2: mouseY,
    speed: dist(mouseX, mouseY, pmouseX, pmouseY),
    type: currentBrush,
    time: frameCount,
    size: brushSize,
    pressure: pressure
  };

  // 如果是 liquid，事先決定粒子的 offset
  if (currentBrush === 'liquid') {
    newStroke.particles = [];
    for (let i = 0; i < 30; i++) {
      newStroke.particles.push({
        offsetX: random(-18, 18),
        offsetY: random(-18, 18),
        r: random(2, 10),
        blue: 220 + random(-15, 15),
        alpha: random(60, 120),
        ratioX: random(0.7, 1.2),
        ratioY: random(0.6, 1.4)
      });
    }
  }


  strokes.push(newStroke);
}

function drawStroke(s) {
  push();
  strokeCap(ROUND);

  // 速度越快 factor 越小
  let speedFactor = map(s.speed, 0, 40, 1, 0.2, true);
  // 壓力越大 factor 越大
  let pressureFactor = map(s.pressure || 0.5, 0, 1, 0.5, 1.5, true);

  // 綜合最終粗細（最大粗細*速度*壓力）
  let finalWeight = s.size * 12 * speedFactor * pressureFactor;

  switch (s.type) {
    case 'neon':
      for (let i = 0; i < 3; i++) {
        stroke(lerpColor(color('cyan'), color('magenta'),
          sin((s.time + i) * 0.1) * 0.5 + 0.5), 100 - i * 30);
        strokeWeight(finalWeight - i * 3);
        line(s.x1, s.y1, s.x2, s.y2);
      }
      break;
    case 'industrial':
    // 走直線，等距均勻方塊，不加亂數
      let numPoints = int(dist(s.x1, s.y1, s.x2, s.y2) / (6 * s.size * pressureFactor));
         for (let i = 0; i <= numPoints; i++) {
         let t = i / numPoints;
         let x = lerp(s.x1, s.x2, t);
         let y = lerp(s.y1, s.y2, t);
           fill(190, 190, 200, 180);    // 灰色可再調深淺
           noStroke();
           let r = 4 * s.size * pressureFactor; // 方塊邊長
           rectMode(CENTER);
          rect(x, y, r, r);
         }
        break;

    case 'flame':
  // 中心紅橘，外圈黃，結構跟neon一樣，只是顏色反過來
  // 最裡面橘紅→中間橙→外圈黃
     let flameColors = [
    color(255, 220, 40, 90),     // 黃（外圈）
    color(255, 140, 0, 80),      // 橙（中圈）
    color(255, 40, 0, 130)       // 紅橘（中心）
      ];
      for (let i = 0; i < 3; i++) {
      stroke(flameColors[i]);
      strokeWeight((14 - i * 5) * s.size * speedFactor * pressureFactor);
      line(s.x1, s.y1, s.x2, s.y2);
      }
       break;

    case 'smoke':
      // 只產生煙霧粒子（會自動飄散）
      for (let i = 0; i < 3; i++) {
        smokeParticles.push({
          x: s.x2 + random(-5, 5),
          y: s.y2 + random(-5, 5),
          size: random(10, 20) * s.size * pressureFactor,
          alpha: 50
        });
      }
      break;

    case 'liquid':
      if (s.particles) {
        for (let p of s.particles) {
          let r = p.r * s.size * pressureFactor;
          fill(0, 180, p.blue, p.alpha); // 調整顏色細節可再自訂
          noStroke();
          ellipse(s.x2 + p.offsetX, s.y2 + p.offsetY, r * p.ratioX, r * p.ratioY);
        }
      }
      break;
  }
  pop();
}

// 按鈕與 UI 維持 HTML/CSS 原樣
function clearCanvas() {
  strokes = [];
  smokeParticles = [];
}

function setBrush(name) {
  currentBrush = name;
}

function setBackground(name) {
  currentBackground = name;
   // 停掉上一首
  if (currentMusic && currentMusic.isPlaying()) {
    currentMusic.stop();
  }

  // 播放新背景音樂
  let next = bgMusic[name];
  if (next) {
    currentMusic = next;
    currentMusic.loop();
    currentMusic.setVolume(0.5);
  }
  
  resetInactivityTimer();
}

function showQRCodeForCanvas() {
  // 顯示 loading
  document.getElementById('loading-area').style.display = 'block';
  // 彈跳通知
  const toast = document.getElementById('qrcode-toast');
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 2000);

  // canvas 轉 blob
  canvas.elt.toBlob(function(blob) {
    let formData = new FormData();
    formData.append('file', blob);
    formData.append('upload_preset', 'graffiti'); // 這裡換你設定的 preset

    fetch('https://api.cloudinary.com/v1_1/dtypimfht/image/upload', {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
      document.getElementById('loading-area').style.display = 'none';
      
      if (data.secure_url) {
        document.getElementById('qrcode-area').style.display = 'block';
        let qr = new QRious({
          element: document.getElementById('qrcode'),
          value: data.secure_url,
          size: 230,
          level: 'H'
        });
      } else {
        alert('圖片上傳失敗，請稍後再試！');
      }
    })
    .catch(err => alert('圖片上傳失敗，請稍後再試！'));
  }, 'image/png');
}

function hideQRCode() {
  document.getElementById('qrcode-area').style.display = 'none';
}

// 這段函式會被 index.html 在使用者點完「✕」後呼叫
window.enableDrawing = function () {
  if (canvas) {
    // 1) 顯示 canvas
    canvas.show();
    // 2) 讓 draw() 可以開始執行
    drawingEnabled = true;
    // 3) 如有需要，先呼叫一次 background() 清除畫布
    background(0);
  // 預設一開啟畫面就播放當前背景的音樂
    if (bgMusic[currentBackground]) {
      currentMusic = bgMusic[currentBackground];
      currentMusic.loop();      // 迴圈播放
      currentMusic.setVolume(0.5); // （可調整音量）
    }
    
    // 一開始就啟動計時器
    resetInactivityTimer();
  }
};

// 當下筆時，選定啟用繪圖的 pointer type
function onPointerDown(e) {
  if (!drawingEnabled) return;
  const type = e.pointerType;  // 'pen' / 'touch' / 'mouse'
  if (type === 'pen') {
    pointerActiveType = 'pen';
  } else if ((type === 'touch' || type === 'mouse') && pointerActiveType !== 'pen') {
    pointerActiveType = type;
  } else {
    return;  // pen active 時忽略其他
  }

  isDrawing = true;
  lastX = e.offsetX;
  lastY = e.offsetY;
  resetInactivityTimer();
}

// 畫線（move 時）
function onPointerMove(e) {
  if (!drawingEnabled) return;
  if (!isDrawing || e.pointerType !== pointerActiveType) return;

  // 範例：根據 currentBrush, brushSize, pressure 繪製線條
  let pressure = e.pressure || 0.5;
  let speed = dist(lastX, lastY, e.offsetX, e.offsetY);
  let weight = brushSize * 12 * map(speed, 0, 40, 1, 0.2, true) * map(pressure, 0, 1, 0.5, 1.5, true);
  // 2) 建立新的 stroke 物件
  let s = {
    x1: lastX, y1: lastY,
    x2: e.offsetX, y2: e.offsetY,
    speed: speed,
    type: currentBrush,
    time: frameCount,
    size: brushSize,
    pressure: pressure
  
  };
  
  // 如果是 liquid 筆刷，複製原本的粒子邏輯
  if (currentBrush === 'liquid') {
    s.particles = [];
    for (let i = 0; i < 30; i++) {
      s.particles.push({
        offsetX: random(-18, 18),
        offsetY: random(-18, 18),
        r:       random(2, 10),
        blue:    220 + random(-15, 15),
        alpha:   random(60, 120),
        ratioX:  random(0.7, 1.2),
        ratioY:  random(0.6, 1.4)
      });
    }
  }

  // 3) 推進陣列，讓 draw() 後續重繪
  strokes.push(s);
  // 4) 更新上一次座標
  lastX = e.offsetX;
  lastY = e.offsetY;

}

// 收筆
function onPointerUp(e) {
  if (!drawingEnabled) return;
  if (e.pointerType !== pointerActiveType) return;
  isDrawing = false;
  pointerActiveType = null;
  resetInactivityTimer();
}

function touchStarted() {
  getAudioContext().resume();
}

function resetInactivityTimer() {
  if (inactivityTimeout) clearTimeout(inactivityTimeout);
  inactivityTimeout = setTimeout(() => {
    // 1) 停掉目前的背景音樂
    if (currentMusic && currentMusic.isPlaying()) {
      currentMusic.stop();
    }

    // 2) 關閉繪圖功能、隱藏畫布與 UI
    drawingEnabled = false;
    if (canvas) canvas.hide();
    document.getElementById('canvas-wrapper').classList.add('hidden');
    document.getElementById('ui-container').classList.add('hidden');

    // 3) 顯示展覽首頁、重啟輪播
    document.getElementById('exhibition-screen').classList.remove('hidden');
    startExhibitionSlideshow();
  }, INACTIVITY_DELAY);
}


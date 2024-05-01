document.addEventListener('DOMContentLoaded', () => {
  const grid = document.querySelector(".grid");
  const doodler = document.createElement("div");
  let platforms = [];
  let upTimeId
  let downTimeId
  let score = 0

  const platformCount = 5;

  let doodlerPos = { // stores the position the the doodler
    x : 50,
    y : 600,
    ySpeed : 30,
    yAcc : -1,
    xSpeed : 0,
    xAcc : 0,
    drag : 0.95,
    jumpForce : 30
  }

  function sigmoid(x) {
    return 2 / (1 + Math.exp(-0.002 * x)) - 1;
  }

  function Platform(platformTop) {
    this.y = platformTop;
    this.x = Math.random() * 315;
    this.visual = document.createElement("div");

    const visual = this.visual;
    visual.classList.add("platform");
    visual.classList.add("")

    this.updatePosition = function() {
      visual.style.left = `${this.x}px`;
      visual.style.top = `${this.y}px`;
    };

    this.updatePosition();
    grid.appendChild(visual);
  }

  function updateDoodlerPos() { // updates the screen based on the position of the doodler
    doodler.style.left = `${doodlerPos.x}px`;
    doodler.style.top = `${doodlerPos.y}px`;
  }

  function createDoodler() {
    grid.appendChild(doodler);
    doodler.classList.add("doodler");
    updateDoodlerPos();
  }

  function createPlatforms() {
    for (let i = 0; i < platformCount; i++) {
      let platformGap = 630 / platformCount;
      let platformTop = 100 + i * platformGap;
      platforms.push(new Platform(platformTop));
    }
  }

  function move() {
    doodlerPos.xSpeed += doodlerPos.xAcc;
    doodlerPos.xSpeed *= doodlerPos.drag;
    doodlerPos.x += doodlerPos.xSpeed;
    if (doodlerPos.x < -5) {
      doodlerPos.x = 395;
    }else if (doodlerPos.x > 405) {
      doodlerPos.x = 5;
    }
    if (doodlerPos.y > 700) location.reload();
    if (doodlerPos.y < 100 && doodlerPos.ySpeed > 0) {
      doodlerPos.ySpeed += doodlerPos.yAcc;
      doodlerPos.ySpeed *= doodlerPos.drag;
      platforms.forEach(platform => {
        platform.y += doodlerPos.ySpeed;
        if (platform.y > 615) {
          platform.y = -15;
          platform.x = Math.random() * 315;
          score += 10;
          document.querySelector(".score").textContent = score
        }
        platform.updatePosition();
      })
    } 
    else {
      doodlerPos.ySpeed += doodlerPos.yAcc;
      doodlerPos.ySpeed *= doodlerPos.drag;
      doodlerPos.y -= doodlerPos.ySpeed;
    }
    updateDoodlerPos();
    jump();
  }

  keys = {'A': false, 'D' : false}

  function keydownHandler(event) {
    keys[event.key] = true;
  
    if (keys['a'] && keys['d']) {
      doodlerPos.xAcc = 0;
    } else if (keys['a']) {
      doodlerPos.xAcc = -1.5;
    } else if (keys['d']) {
      doodlerPos.xAcc = 1.5;
    } else {
      doodlerPos.xAcc = 0;
    }
  
    // You can add additional logic here based on the key pressed
  }
  
  // Function to handle keyup event
  function keyupHandler(event) {
    keys[event.key] = false;
  
    if (keys['a'] && keys['d']) {
      doodlerPos.xAcc = 0;
    } else if (keys['a']) {
      doodlerPos.xAcc = -1.5;
    } else if (keys['d']) {
      doodlerPos.xAcc = 1.5;
    } else {
      doodlerPos.xAcc = 0;
    }
  }
  
  // Attach event listeners to the document
  document.addEventListener('keydown', keydownHandler);
  document.addEventListener('keyup', keyupHandler);

  function jump() {
    platforms.forEach(platform => {
      if (doodlerPos.ySpeed < 0 && (doodlerPos.y + 85) < (platform.y + 25) && (doodlerPos.y + 85) > (platform.y - 5) && platform.x-40 < (doodlerPos.x) && (doodlerPos.x) < platform.x+85) {
        doodlerPos.ySpeed = doodlerPos.jumpForce;
      }
    })
  }

  let gameOver = false;
  function start() {
    // start the game
    if (!gameOver) {
      createDoodler();
      createPlatforms();
      setInterval(move, 30);
      jump();
    }
  }
  // make button later!!!
  start();
})
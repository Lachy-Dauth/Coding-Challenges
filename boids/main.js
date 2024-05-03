let size = 750;
let scale = 80;
function setup() {
  createCanvas(size, size);
}

document.addEventListener('contextmenu', function(event) {
    event.preventDefault();
});

class Boid {
  constructor(x, y, angle, orgSpeed) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.orgSpeed = orgSpeed;
    this.speed = orgSpeed;
    this.xspeed = Math.sin(this.angle) * this.speed;
    this.yspeed = -Math.cos(this.angle) * this.speed;
    this.buffer = 50
  }

  dist2boid(boid) {
    return ((boid.x - this.x) ** 2 + (boid.y - this.y) ** 2) ** 0.5;
  }

  draw2boid(boid) {
    line(boid.x, boid.y, this.x, this.y);
  }

  draw2vec(vec) {
    line(this.x + vec[0], this.y + vec[1], this.x, this.y);
  }

  vec2boid(boid) {
    return [boid.x - this.x, boid.y - this.y];
  }

  move() {
    this.xspeed = Math.sin(this.angle) * this.speed;
    this.yspeed = -Math.cos(this.angle) * this.speed;
    this.x += Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
    // this.x = (this.x+size)%size
    // this.y = (this.y+size)%size
  }

  update(boids, separation, alignment, cohesion, mouse, range, sepRange, randomness) {
    let others = boids.filter(boid => boid !== this && this.dist2boid(boid) < range);
    let close = others.filter(boid => this.dist2boid(boid) < sepRange)
    // others.forEach(boid => this.draw2boid(boid));

    let sepVector = vecSum(close.map(boid => powVec(this.vec2boid(boid), -1)));
    if (!isNaN(sepVector[0]) && !isNaN(sepVector[1])) {
      // this.draw2vec(multVec(sepVector,50));
      this.angle += (sepVector[0] * this.yspeed - sepVector[1] * this.xspeed) * 0.01 * separation;
      this.speed -= (sepVector[0] * this.xspeed + sepVector[1] * this.yspeed) * 0.005 * separation;
    }

    let alignVector = vecAvg(others.map(boid => [boid.xspeed, boid.yspeed]));
    if (!isNaN(alignVector[0]) && !isNaN(alignVector[1])) {
      // this.draw2vec(multVec(sepVector,50));
      this.angle -= (alignVector[0] * this.yspeed - alignVector[1] * this.xspeed) * 0.002 * alignment;
    }

    let coVector = vecAvg(others.map(boid => [boid.x - this.x, boid.y - this.y]));
    if (!isNaN(coVector[0]) && !isNaN(coVector[1])) {
      // this.draw2vec(multVec(sepVector,50));
      this.angle -= (coVector[0] * this.yspeed - coVector[1] * this.xspeed) * 0.0001 * cohesion;
    }

    let mouseVec = powVec([mouseX - this.x, mouseY - this.y], -0.9);
    if (mouseIsPressed === true) {
      if (mouseButton === LEFT) {
        this.angle -= (mouseVec[0] * this.yspeed - mouseVec[1] * this.xspeed) * mouse / 10;
        this.speed += (mouseVec[0] * this.xspeed + mouseVec[1] * this.yspeed) * 0.0001 * mouse;
      }
      if (mouseButton === RIGHT) {
        this.angle += (mouseVec[0] * this.yspeed - mouseVec[1] * this.xspeed) * mouse / 10;
        this.speed -= (mouseVec[0] * this.xspeed + mouseVec[1] * this.yspeed) * 0.0001 * mouse;
      }
    }

    if (this.x < this.buffer) {
      this.angle -= this.yspeed * 0.2 * (1 - this.x/this.buffer)**2
    } else if (this.x > size - this.buffer) {
      this.angle += this.yspeed * 0.2 * (this.x/this.buffer - size/this.buffer + 1)**2
    }
    if (this.y < this.buffer) {
      this.angle += this.xspeed * 0.2 * (1 - this.y/this.buffer)**2
    } else if (this.y > size - this.buffer) {
      this.angle -= this.xspeed * 0.2 * (this.y/this.buffer - size/this.buffer + 1)**2
    }

    this.angle += (Math.random() - 0.5) * randomness
    this.speed = 0.97 * this.speed + (0.03 * this.orgSpeed)
  }

  draw() {
    drawIsoscelesTriangle(this.x, this.y, scale, this.angle);
  }
}

function vecAvg(arrays) {
  let sum1 = 0;
  let sum2 = 0;
  arrays.forEach(array => {
      if (array.length === 2) {
          sum1 += array[0];
          sum2 += array[1];
      }
  });
  const avg1 = sum1 / arrays.length;
  const avg2 = sum2 / arrays.length;
  return [avg1, avg2];
}

function vecSum(arrays) {
  let sum1 = 0;
  let sum2 = 0;
  arrays.forEach(array => {
      if (array.length === 2) {
          sum1 += array[0];
          sum2 += array[1];
      }
  });
  return [sum1, sum2];
}

function multVec(arr, factor) {
  return arr.map(element => element * factor);
}

function powVec(arr, power) {
  let scaleFac = ((arr[0]**2+arr[1]**2) ** 0.5) ** (-1 + power);
  return arr.map(element => element * scaleFac);
}

function drawIsoscelesTriangle(xpos, ypos, scaleFactor, angle) {
  // Define the base and height of the triangle before scaling
  let baseLength = 0.1; // Base length of the triangle
  let height = 0.2; // Height from base to apex

  // Apply the scale factor
  baseLength *= scaleFactor;
  height *= scaleFactor;

  // Calculate half of the base
  let halfBase = baseLength / 2;

  // Calculate the coordinates of the vertices
  let apexX = xpos;
  let apexY = ypos - height/2;

  let leftBaseX = xpos - halfBase;
  let leftBaseY = ypos + height/2;

  let rightBaseX = xpos + halfBase;
  let rightBaseY = ypos + height/2;

  // Rotation adjustment
  let sinTheta = Math.sin(angle);
  let cosTheta = Math.cos(angle);

  // Adjust coordinates based on rotation about the origin (xpos, ypos)
  let rotatedApexX = xpos + (apexX - xpos) * cosTheta - (apexY - ypos) * sinTheta;
  let rotatedApexY = ypos + (apexX - xpos) * sinTheta + (apexY - ypos) * cosTheta;

  let rotatedLeftBaseX = xpos + (leftBaseX - xpos) * cosTheta - (leftBaseY - ypos) * sinTheta;
  let rotatedLeftBaseY = ypos + (leftBaseX - xpos) * sinTheta + (leftBaseY - ypos) * cosTheta;

  let rotatedRightBaseX = xpos + (rightBaseX - xpos) * cosTheta - (rightBaseY - ypos) * sinTheta;
  let rotatedRightBaseY = ypos + (rightBaseX - xpos) * sinTheta + (rightBaseY - ypos) * cosTheta;

  // Draw the triangle with rotated coordinates
  triangle(rotatedLeftBaseX, rotatedLeftBaseY, rotatedApexX, rotatedApexY, rotatedRightBaseX, rotatedRightBaseY);
}

let boids = [];
for (let i = 1; i < 700; i++){
  boids.push(new Boid(Math.random()*size, Math.random()*size, Math.random()*2*6.28, 0.60))
}

function draw(){
  let separation = parseFloat(document.getElementById('separationSlider').value);
  let alignment = parseFloat(document.getElementById('alignmentSlider').value);
  let cohesion = parseFloat(document.getElementById('cohesionSlider').value);
  let randomness = parseFloat(document.getElementById('randomSlider').value);
  let range = parseFloat(document.getElementById('rangeSlider').value);
  let sepRange = parseFloat(document.getElementById('sepRangeSlider').value);
  let mouse = parseFloat(document.getElementById('mouseSlider').value);
  scale = parseFloat(document.getElementById('scaleSlider').value);

  clear();
  for (let i = 1; i < 4; i++){
    boids.forEach(boid => {
      boid.update(boids, separation, alignment, cohesion, mouse, range, sepRange, randomness);
      boid.move();
    })
  }
  boids.forEach(boid => {
    boid.draw();
  })
}

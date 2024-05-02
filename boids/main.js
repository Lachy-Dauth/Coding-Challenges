let size = 600;
function setup() {
  createCanvas(size, size);
}

class Boid {
  constructor(x, y , angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 2;
    this.xspeed = Math.sin(this.angle) * this.speed;
    this.yspeed = -Math.cos(this.angle) * this.speed;
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
    this.x = (this.x+size)%size
    this.y = (this.y+size)%size
  }

  update(boids, separation, alignment, cohesion, range) {
    let others = boids.filter(boid => boid !== this && this.dist2boid(boid) < range);
    let close = others.filter(boid => this.dist2boid(boid) < range/2)
    // others.forEach(boid => this.draw2boid(boid));

    let sepVector = vecSum(close.map(boid => powVec(this.vec2boid(boid), -0.1)));
    if (!isNaN(sepVector[0]) && !isNaN(sepVector[1])) {
      // this.draw2vec(multVec(sepVector,50));
      this.angle += (sepVector[0] * this.yspeed - sepVector[1] * this.xspeed) * separation;
      this.speed += (sepVector[0] * this.xspeed + sepVector[1] * this.yspeed) * 0.01;
    }

    let alignVector = vecAvg(others.map(boid => [boid.xspeed, boid.yspeed]));
    if (!isNaN(alignVector[0]) && !isNaN(alignVector[1])) {
      // this.draw2vec(multVec(sepVector,50));
      this.angle -= (alignVector[0] * this.yspeed - alignVector[1] * this.xspeed) * alignment;
    }

    let coVector = vecAvg(others.map(boid => [boid.x - this.x, boid.y - this.y]));
    if (!isNaN(coVector[0]) && !isNaN(coVector[1])) {
      // this.draw2vec(multVec(sepVector,50));
      this.angle -= (coVector[0] * this.yspeed - coVector[1] * this.xspeed) / range * cohesion;
    }

    this.speed = 0.99 * this.speed + 0.02
  }

  draw() {
    drawIsoscelesTriangle(this.x, this.y, 1, this.angle);
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
  let baseLength = 10; // Base length of the triangle
  let height = 20; // Height from base to apex

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
for (let i = 1; i < 50; i++){
  boids.push(new Boid(Math.random()*size, Math.random()*size, Math.random()*2*6.28))
}

function draw(){
  clear();
  boids.forEach(boid => {
    boid.update(boids, 0.1, 0.1, 0.1, 100);
    boid.draw();
    boid.move();
  })
}
function setup() {
  createCanvas(400, 400);
}

class Boid {
  constructor(x, y , angle) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = 1;
  }

  move() {
    this.x += Math.sin(this.angle) * this.speed;
    this.y -= Math.cos(this.angle) * this.speed;
    this.x = this.x%400
    this.y = this.y%400
  }

  draw() {
    drawIsoscelesTriangle(this.x, this.y, 1, this.angle);
  }
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
for (let i = 1; i < 100; i++){
  boids.push(new Boid(Math.random()*400, Math.random()*400, Math.random()*2*6.28))
}

function draw(){
  clear();
  boids.forEach(boid => {
    boid.draw();
    boid.move();
  })
}
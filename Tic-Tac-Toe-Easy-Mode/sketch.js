let board = [
  ["", "", ""],
  ["", "", ""],
  ["", "", ""]
];

let players = ["X", "O"];
let human = "X";

let rem = 9;

let currentPlayer;
let available = [];

function setup() {
  createCanvas(400, 400);
  currentPlayer = floor(random(players.length));
  for (let j = 0; j < board.length; j++) {
    for (let i = 0; i < board[j].length; i++) {
      available.push([j, i]);
    }
  }
}

function arrEqual(a, b) {
  if (a.length != b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

function findInList(item, arr) {
  for (let i = 0; i < arr.length; i++) {
    if (arrEqual(arr[i], item)) {
      return i;
    }
  }
}

function equals3(a, b, c) {
  return (a == b && b == c && a != '');
}

function checkWinner() {
  let winner = null;


  for (let i = 0; i < 3; i++) {
    if (equals3(board[i][0], board[i][1], board[i][2])) {
      winner = [board[i][0], [0,i], [2,i]];
    }
    if (equals3(board[0][i], board[1][i], board[2][i])) {
      winner = [board[0][i], [i,0], [i,2]];
    }
    if (equals3(board[0][0], board[1][1], board[2][2])) {
      winner = [board[0][0], [0,0], [2,2]];
    }
    if (equals3(board[0][2], board[1][1], board[2][0])) {
      winner = [board[1][1], [0,2], [2,0]];
    }
  }

  if (winner != null) {
    return winner;
  } 
  if (rem == 0) {
    return ["tie"];
  }
}

function nextTurn(i, j) {
  board[i][j] = players[currentPlayer];
  currentPlayer = (currentPlayer + 1) % players.length;
  rem -=1;
  available.splice(findInList([i,j], available), 1);
}

function mousePressed() {
  if (players[currentPlayer] == human) {
    console.log(available);
    let i = null;
    let j = null;
    if (mouseX > 0 && mouseX < (width/3)) {
      j = 0;
    } else if (mouseX > 0 && mouseX < (2*width/3)){
      j = 1;
    } else if (mouseX > 0 && mouseX < (width)){
      j = 2;
    }

    if (mouseY > 0 && mouseY < (height/3)) {
      i = 0;
    } else if (mouseY > 0 && mouseY < (2*height/3)){
      i = 1;
    } else if (mouseY > 0 && mouseY < (height)){
      i = 2;
    }
    if (i != null && j != null) {
      if ((players.includes(board[i][j]))== false) {
        nextTurn(i,j);
      }
    }
  }
}

function draw() {
  background(255);

  if (players[currentPlayer] != human && rem != 0) {
    let randomElement = available[Math.floor(Math.random() * available.length)];
    nextTurn(...randomElement);
  }

  let edge = 30;
  let stamp = 10;
  let nw = width - edge;
  let nh = height - edge;

  let w = (nw + edge) / 3;
  let h = (nh + edge) / 3;

  strokeWeight(10);
  noCursor();

  line(w,edge,w,nh);
  line(w*2,edge,w*2,nh);
  line(edge,h,nw,h);
  line(edge,h*2,nw,h*2);

  for (let j = 0; j < board.length; j++) {
    for (let i = 0; i < board[j].length; i++) {
      let x = w * (i + 0.5);
      let y = h * (j + 0.5);
      let xr = w / 4;

      let spot = board[j][i];
      textSize = 32;
      
      if (spot == players[0]) {
        line(x - xr, y - xr, x + xr, y + xr);
        line(x - xr, y + xr, x + xr, y - xr);
      }else if (spot == players[1]){
        ellipse(x,y,w/2);
      }
    }
  }


  if(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)){
    if (currentPlayer == 0) {
      line(20+stamp, 20+stamp, 20-stamp, 20-stamp);
      line(20+stamp, 20-stamp, 20-stamp, 20+stamp);
    } else {
      ellipse(20, 20, stamp*2);
    }
  }else{
    if (currentPlayer == 0) {
      line(mouseX+stamp, mouseY+stamp, mouseX-stamp, mouseY-stamp);
      line(mouseX+stamp, mouseY-stamp, mouseX-stamp, mouseY+stamp);
    } else {
      ellipse(mouseX, mouseY, stamp*2);
    }
  }

  let result = checkWinner();

  if (result != null) {
    if (result[0] != "tie") {
      line((result[1][0]+0.5)*w,(result[1][1]+0.5)*h,(result[2][0]+0.5)*w,(result[2][1]+0.5)*h);
    }
    cursor();
    console.log(result[0]);
    createP(result[0]);
    noLoop();
  }
}